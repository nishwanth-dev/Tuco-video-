// Copies new Instagram reels into R2 as draft videos. Needs IG_TOKEN and IG_USER_ID secrets.
const GRAPH = 'https://graph.instagram.com';
const MAX_PER_RUN = 8;

async function getToken(env) {
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k='ig_token'").first();
  return row?.v || env.IG_TOKEN;
}

// Long-lived tokens last 60 days; refresh each run so it never expires.
async function refreshToken(env, token) {
  const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  if (!r.ok) return token;
  const { access_token } = await r.json();
  if (access_token) await env.DB.prepare("INSERT INTO kv (k,v) VALUES ('ig_token',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(access_token).run();
  return access_token || token;
}

export async function syncInstagram(env) {
  if (!env.IG_TOKEN) return { skipped: 'IG_TOKEN not set' };
  const token = await refreshToken(env, await getToken(env));
  const res = await fetch(`${GRAPH}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp&limit=50&access_token=${token}`);
  if (!res.ok) return { error: `Instagram API ${res.status}` };
  const { data = [] } = await res.json();
  const added = [];
  for (const m of data.filter((x) => x.media_type === 'VIDEO' && x.media_url)) {
    if (added.length >= MAX_PER_RUN) break;
    const seen = await env.DB.prepare('SELECT 1 FROM videos WHERE source_id=?').bind(m.id).first();
    if (seen) continue;
    const file = await fetch(m.media_url);
    if (!file.ok) continue;
    const key = `videos/ig-${m.id}.mp4`;
    await env.MEDIA.put(key, file.body, { httpMetadata: { contentType: 'video/mp4' } });
    const title = (m.caption || 'Instagram reel').split('\n')[0].slice(0, 80);
    await env.DB.prepare("INSERT INTO videos (id,title,url,poster,status,placements,products,source,source_id,created_at) VALUES (?,?,?,?, 'draft','[]','[]','instagram',?,?)")
      .bind(crypto.randomUUID(), title, `/media/${key}`, '', m.id, Date.now()).run();
    added.push(m.id);
  }
  return { added: added.length };
}
