// Copies new Instagram reels into R2 as draft videos. Needs the IG_TOKEN secret.
import { saveLast, saveCaption } from './igreview.js';
const MAX_PER_RUN = 15;

const graph = (env) => env.IG_GRAPH_URL || 'https://graph.instagram.com';

async function getToken(env) {
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k='ig_token'").first();
  return row?.v || env.IG_TOKEN;
}

// Long-lived tokens last 60 days; refresh each run so it never expires.
async function refreshToken(env, token) {
  const r = await fetch(`${graph(env)}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  if (!r.ok) return token;
  const { access_token } = await r.json();
  if (access_token) await env.DB.prepare("INSERT INTO kv (k,v) VALUES ('ig_token',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(access_token).run();
  return access_token || token;
}

export async function syncInstagram(env) {
  if (!env.IG_TOKEN) return { skipped: 'IG_TOKEN not set' };
  if (!env.MEDIA) return { skipped: 'R2 is not enabled yet' };
  const token = await refreshToken(env, await getToken(env));
  const added = [];
  let waiting = 0, failed = 0, pages = 0;
  let next = `${graph(env)}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp&limit=50&access_token=${token}`;
  // Walk every page of reels; copy up to MAX_PER_RUN new ones per run and report how many are still waiting.
  while (next && pages < 20) {
    pages++;
    const res = await fetch(next);
    if (!res.ok) return added.length ? { added: added.length, waiting, failed, error: `Instagram API ${res.status} after ${added.length} copied` } : { error: `Instagram API ${res.status}` };
    const body = await res.json();
    for (const m of (body.data || []).filter((x) => x.media_type === 'VIDEO' && x.media_url)) {
      const seen = await env.DB.prepare('SELECT 1 FROM videos WHERE source_id=?').bind(m.id).first();
      if (seen) continue;
      if (added.length >= MAX_PER_RUN) { waiting++; continue; }
      try {
        const file = await fetch(m.media_url);
        if (!file.ok) { failed++; continue; }
        const key = `videos/ig-${m.id}.mp4`;
        const put = await env.MEDIA.put(key, file.body, { httpMetadata: { contentType: 'video/mp4' } });
        const title = (m.caption || 'Instagram reel').split('\n')[0].slice(0, 80);
        const pub = (k) => (env.R2_PUBLIC_URL ? `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${k}` : `/media/${k}`);
        const url = pub(key);
        // Instagram thumbnail links expire, so the poster image is copied into our own storage as well.
        let poster = '';
        if (m.thumbnail_url && (/^https:/.test(m.thumbnail_url) || (env.IG_GRAPH_URL && /^http:/.test(m.thumbnail_url)))) {
          try {
            const img = await fetch(m.thumbnail_url);
            if (img.ok) { await env.MEDIA.put(`videos/ig-${m.id}.jpg`, img.body, { httpMetadata: { contentType: 'image/jpeg' } }); poster = pub(`videos/ig-${m.id}.jpg`); }
          } catch { /* the video is still added without a poster */ }
        }
        await env.DB.prepare("INSERT INTO videos (id,title,url,poster,status,placements,products,source,source_id,size,created_at) VALUES (?,?,?,?, 'draft','[]','[]','instagram',?,?,?)")
          .bind(crypto.randomUUID(), title, url, poster, m.id, put?.size || 0, Date.now()).run();
        await saveCaption(env, m.id, m.caption);
        added.push(m.id);
      } catch { failed++; }
    }
    next = body.paging && body.paging.next ? body.paging.next : '';
  }
  return { added: added.length, waiting, failed };
}

// Runs a sync and remembers how it went, so the Integrations page can show the last run.
export async function runInstagramSync(env, by = 'auto') {
  let r;
  try { r = await syncInstagram(env); } catch (e) { r = { error: String((e && e.message) || e).slice(0, 200) }; }
  try { await saveLast(env, { at: Date.now(), by, added: r.added || 0, waiting: r.waiting || 0, failed: r.failed || 0, error: r.error || '', skipped: r.skipped || '' }); } catch { /* the sync itself already happened */ }
  return r;
}
