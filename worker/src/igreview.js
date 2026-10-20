// Instagram sync helpers: product suggestions for new reels, the on/off switch, and the "ready to approve" list.
const STOP = new Set(['for', 'kids', 'kid', 'tuco', 'with', 'the', 'and', 'pack', 'set', 'natural', 'new', 'best', 'ml', 'gm', 'of', 'in', 'to', 'your', 'from', 'that', 'this']);
const stem = (w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);

// Matches a reel's caption against product names. Returns up to 3 products, best first, each with a score out of 100.
export function suggestProducts(caption, list) {
  const cap = new Set(words(caption));
  if (!cap.size) return [];
  const out = [];
  for (const p of list || []) {
    const pw = [...new Set(words(p.title))];
    if (!pw.length) continue;
    const hits = pw.filter((w) => cap.has(w)).length;
    if (!hits) continue;
    const score = hits / pw.length;
    const strong = score >= 0.67 && (hits >= 2 || pw.length === 1);
    if (score >= 0.5 || strong) out.push({ handle: p.handle, title: p.title, price: p.price || '', score: Math.round(score * 100), hits });
  }
  return out.sort((a, b) => b.score - a.score || b.hits - a.hits).slice(0, 3).map(({ hits, ...r }) => r);
}

const kvGet = async (env, k) => (await env.DB.prepare('SELECT v FROM kv WHERE k=?').bind(k).first())?.v ?? null;
const kvSet = (env, k, v) => env.DB.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v)).run();
const parse = (s, f) => { try { return JSON.parse(s); } catch { return f; } };

export const isAutoOn = async (env) => (await kvGet(env, 'ig_auto')) !== '0';
export const setAuto = (env, on) => kvSet(env, 'ig_auto', on ? '1' : '0');
export const saveLast = (env, r) => kvSet(env, 'ig_last', JSON.stringify(r));
export const saveCaption = (env, id, caption) => (caption ? kvSet(env, 'igcap:' + id, String(caption).slice(0, 2000)) : Promise.resolve());

export async function reviewItems(env, catalogFn) {
  const { results } = await env.DB.prepare("SELECT id,title,url,poster,source_id,created_at FROM videos WHERE source='instagram' AND archived=0 AND products='[]' ORDER BY created_at DESC LIMIT 60").all();
  let list = [];
  try { list = (await catalogFn(env)).list || []; } catch { list = []; }
  const items = [];
  for (const r of results) {
    const caption = (await kvGet(env, 'igcap:' + r.source_id)) || r.title;
    items.push({ id: r.id, title: r.title, url: r.url, poster: r.poster, createdAt: r.created_at, suggestions: suggestProducts(caption + ' ' + r.title, list) });
  }
  return { items, catalogOk: list.length > 0 };
}

export async function igStatus(env, catalogFn) {
  const token = (await kvGet(env, 'ig_token')) || env.IG_TOKEN || '';
  const review = await reviewItems(env, catalogFn);
  return { configured: !!token, auto: await isAutoOn(env), last: parse(await kvGet(env, 'ig_last'), null), ready: review.items.filter((i) => i.suggestions.length).length, waiting: review.items.length };
}

// Tags the chosen products on videos. Does not change live/draft: tagging and going live stay two separate steps.
export async function approve(env, approvals, catalogFn) {
  const cat = await catalogFn(env);
  let done = 0;
  for (const a of (Array.isArray(approvals) ? approvals : []).slice(0, 100)) {
    const row = await env.DB.prepare('SELECT products FROM videos WHERE id=?').bind(String(a.id || '')).first();
    if (!row) continue;
    const have = parse(row.products, []);
    const add = (Array.isArray(a.handles) ? a.handles : []).slice(0, 10).map((h) => cat.map[String(h)]).filter(Boolean)
      .filter((p) => !have.some((x) => x.handle === p.handle)).map((p) => ({ handle: p.handle, title: p.title.slice(0, 300), price: p.price || '', image: '' }));
    if (!add.length) continue;
    await env.DB.prepare('UPDATE videos SET products=? WHERE id=?').bind(JSON.stringify([...have, ...add].slice(0, 20)), String(a.id)).run();
    done++;
  }
  return { approved: done };
}
