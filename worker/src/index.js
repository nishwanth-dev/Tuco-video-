import { syncInstagram } from './instagram.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });

const toVideo = (r, origin = "") => ({
  id: r.id, title: r.title, url: r.url.startsWith("/") ? origin + r.url : r.url, poster: r.poster, audience: r.audience, status: r.status,
  placements: JSON.parse(r.placements || '[]'), source: r.source, sort: r.sort,
  product: { title: r.product_title, handle: r.product_handle, price: r.product_price },
});

// Public endpoints only answer to the store origins; admin endpoints need the bearer token.
const corsFor = (req, env) => {
  const origin = req.headers.get('origin') || '';
  const ok = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).includes(origin) || origin.startsWith('http://localhost');
  return { 'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', vary: 'origin' };
};
const isAdmin = (req, env) => !!env.ADMIN_TOKEN && req.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;

async function serveMedia(req, env, key) {
  const range = req.headers.get('range');
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  const head = await env.MEDIA.head(key);
  if (!head) return new Response('Not found', { status: 404 });
  let opts, status = 200;
  const headers = { 'content-type': head.httpMetadata?.contentType || 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable', etag: head.httpEtag, 'access-control-allow-origin': '*' };
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, head.size - Number(m[2]));
    const end = m[1] && m[2] ? Number(m[2]) : head.size - 1;
    opts = { range: { offset: start, length: end - start + 1 } };
    status = 206;
    headers['content-range'] = `bytes ${start}-${end}/${head.size}`;
    headers['content-length'] = String(end - start + 1);
  } else headers['content-length'] = String(head.size);
  const obj = await env.MEDIA.get(key, opts);
  return new Response(req.method === 'HEAD' ? null : obj.body, { status, headers });
}

async function handle(req, env) {
  const url = new URL(req.url);
  const p = url.pathname;
  const cors = corsFor(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (p.startsWith('/media/')) return serveMedia(req, env, decodeURIComponent(p.slice(7)));

  if (p === '/api/public/videos' && req.method === 'GET') {
    const placement = url.searchParams.get('placement');
    const audience = url.searchParams.get('audience');
    const product = url.searchParams.get('product');
    const { results } = await env.DB.prepare("SELECT * FROM videos WHERE status='live' ORDER BY sort ASC, created_at DESC").all();
    let list = results.map((r) => toVideo(r, url.origin));
    if (audience) list = list.filter((v) => v.audience === audience);
    if (product) list = list.filter((v) => v.product.handle === product);
    else if (placement) list = list.filter((v) => v.placements.includes(placement));
    return json({ videos: list }, 200, { ...cors, 'cache-control': 'public, max-age=60' });
  }

  if (p === '/api/public/events' && req.method === 'POST') {
    const e = await req.json().catch(() => null);
    if (!e || !['play', 'watch', 'atc'].includes(e.type) || !e.videoId) return json({ error: 'bad event' }, 400, cors);
    const secs = Math.min(Math.max(Number(e.secs) || 0, 0), 3600);
    await env.DB.prepare('INSERT INTO events (video_id, type, secs, at) VALUES (?, ?, ?, ?)').bind(String(e.videoId).slice(0, 64), e.type, secs, Date.now()).run();
    return json({ ok: true }, 200, cors);
  }

  if (!p.startsWith('/api/')) return json({ error: 'not found' }, 404, cors);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);

  if (p === '/api/videos' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM videos ORDER BY sort ASC, created_at DESC').all();
    return json({ videos: results.map((r) => toVideo(r, url.origin)) }, 200, cors);
  }
  if (p === '/api/videos' && req.method === 'POST') {
    const v = await req.json();
    const id = crypto.randomUUID();
    await upsert(env, { ...v, id }, true);
    return json({ id }, 201, cors);
  }
  const m = p.match(/^\/api\/videos\/([\w-]+)$/);
  if (m && req.method === 'PUT') { await upsert(env, { ...(await req.json()), id: m[1] }, false); return json({ ok: true }, 200, cors); }
  if (m && req.method === 'DELETE') { await env.DB.prepare('DELETE FROM videos WHERE id=?').bind(m[1]).run(); return json({ ok: true }, 200, cors); }

  // Raw file body, stored in R2 and served back through /media. Free plan caps request bodies at 100 MB.
  if (p === '/api/upload' && req.method === 'PUT') {
    const name = (url.searchParams.get('name') || 'video.mp4').replace(/[^\w.-]/g, '_').slice(-80);
    const key = `videos/${crypto.randomUUID()}-${name}`;
    await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: req.headers.get('content-type') || 'video/mp4' } });
    return json({ url: `${url.origin}/media/${key}` }, 201, cors);
  }

  if (p === '/api/analytics' && req.method === 'GET') {
    const { results } = await env.DB.prepare("SELECT video_id, SUM(type='play') AS plays, SUM(CASE WHEN type='watch' THEN secs ELSE 0 END) AS secs, SUM(type='atc') AS atc FROM events GROUP BY video_id").all();
    return json({ rows: results }, 200, cors);
  }
  if (p === '/api/sync/instagram' && req.method === 'POST') return json(await syncInstagram(env), 200, cors);

  return json({ error: 'not found' }, 404, cors);
}

async function upsert(env, v, isNew) {
  const pr = v.product || {};
  const args = [v.title, v.url, v.poster || '', v.audience || 'kids', v.status || 'draft', JSON.stringify(v.placements || []), pr.title || '', pr.handle || '', pr.price || '', Number(v.sort) || 0];
  if (isNew) {
    await env.DB.prepare('INSERT INTO videos (title,url,poster,audience,status,placements,product_title,product_handle,product_price,sort,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(...args, v.id, Date.now()).run();
  } else {
    await env.DB.prepare('UPDATE videos SET title=?,url=?,poster=?,audience=?,status=?,placements=?,product_title=?,product_handle=?,product_price=?,sort=? WHERE id=?').bind(...args, v.id).run();
  }
}

export default {
  fetch: (req, env) => handle(req, env).catch((e) => json({ error: String(e.message || e) }, 500)),
  scheduled: (_e, env, ctx) => ctx.waitUntil(syncInstagram(env)),
};
