import { syncInstagram } from './instagram.js';
import { mergeSettings } from './defaults.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });
const parse = (s, f) => { try { return JSON.parse(s); } catch { return f; } };

const toVideo = (r, origin = '') => {
  const products = parse(r.products, []);
  return {
    id: r.id, title: r.title, url: r.url.startsWith('/') ? origin + r.url : r.url, poster: r.poster, audience: r.audience, status: r.status,
    placements: parse(r.placements, []), products, product: products[0] || { title: '', handle: '', price: '' },
    archived: !!r.archived, source: r.source, sort: r.sort, createdAt: r.created_at, views: r.views || 0,
  };
};
const toWidget = (r) => ({ id: r.id, name: r.name, type: r.type, page: r.page, scope: r.scope, videoIds: parse(r.video_ids, []), productHandles: parse(r.product_handles, []), heading: r.heading, enabled: !!r.enabled });

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

const getSettings = async (env) => mergeSettings(parse((await env.DB.prepare("SELECT v FROM kv WHERE k='settings'").first())?.v, {}));
const VIDEO_SQL = "SELECT v.*, (SELECT COUNT(*) FROM events e WHERE e.video_id=v.id AND e.type='play') AS views FROM videos v";

// Picks and orders the videos a widget shows, using its scope, the page product and saved arrange-media order.
async function videosForWidget(env, origin, widget, settings, product, placement = '') {
  const { results } = await env.DB.prepare(`${VIDEO_SQL} WHERE v.status='live' AND v.archived=0 ORDER BY v.sort ASC, v.created_at DESC`).all();
  let list = results.map((r) => toVideo(r, origin));
  if (widget && widget.scope === 'custom' && widget.videoIds.length) {
    list = widget.videoIds.map((id) => list.find((v) => v.id === id)).filter(Boolean);
  } else if (product) {
    let own = list.filter((v) => v.products.some((p) => p.handle === product));
    const order = parse((await env.DB.prepare('SELECT v FROM kv WHERE k=?').bind('order:' + product).first())?.v, []);
    own.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
    if (!own.length && settings.product.showHomepageVideos) own = list.filter((v) => v.placements.includes('home'));
    list = own;
  } else {
    const pg = widget ? (widget.page === 'product' ? 'home' : widget.page) : placement;
    if (pg) list = list.filter((v) => v.placements.includes(pg) || !v.placements.length);
    if (settings.carousel.onlyTagged) list = list.filter((v) => v.products.length);
  }
  const o = settings.carousel.ordering;
  if (o === 'newest') list.sort((a, b) => b.createdAt - a.createdAt);
  if (o === 'shuffle') list = shuffleBatches(list, settings.carousel.shuffleBatch || list.length);
  return list;
}
function shuffleBatches(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(...list.slice(i, i + n).sort(() => Math.random() - 0.5));
  return out;
}

async function storeProducts(env, q) {
  const headers = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36', accept: 'application/json' };
  let r;
  // Try the store domain first, then the myshopify address if the first is blocked.
  for (const base of [env.STORE_URL, env.STORE_FALLBACK_URL].filter(Boolean)) {
    r = await fetch(`${base}/products.json?limit=250`, { headers, cf: { cacheTtl: 300 } });
    if (r.ok) break;
  }
  if (!r || !r.ok) throw new Error(`Store products unavailable (${r ? r.status : 'no url'})`);
  const { products = [] } = await r.json();
  const list = products.map((p) => ({ handle: p.handle, title: p.title, price: p.variants?.[0] ? `₹${Math.round(Number(p.variants[0].price))}` : '', image: p.images?.[0]?.src || '', available: p.variants?.some((v) => v.available) }));
  const s = (q || '').toLowerCase();
  return s ? list.filter((p) => p.title.toLowerCase().includes(s) || p.handle.includes(s)) : list;
}

async function handle(req, env) {
  const url = new URL(req.url);
  const p = url.pathname;
  const cors = corsFor(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (p.startsWith('/media/')) return serveMedia(req, env, decodeURIComponent(p.slice(7)));

  // ---- public (store) ----
  if (p === '/api/public/config' && req.method === 'GET') {
    const settings = await getSettings(env);
    const wid = url.searchParams.get('widget');
    let widget = null;
    if (wid) {
      const row = await env.DB.prepare('SELECT * FROM widgets WHERE id=?').bind(wid).first();
      if (!row || !row.enabled) return json({ settings, widget: null, videos: [] }, 200, { ...cors, 'cache-control': 'public, max-age=60' });
      widget = toWidget(row);
    }
    const product = url.searchParams.get('product') || (widget?.productHandles.length === 1 ? widget.productHandles[0] : '');
    if (widget && widget.productHandles.length && url.searchParams.get('product') && !widget.productHandles.includes(url.searchParams.get('product'))) return json({ settings, widget, videos: [] }, 200, cors);
    const videos = await videosForWidget(env, url.origin, widget, settings, widget?.page === 'product' || url.searchParams.get('product') ? product : '', url.searchParams.get('placement') || '');
    return json({ settings, widget, videos }, 200, { ...cors, 'cache-control': 'public, max-age=60' });
  }
  if (p === '/api/public/events' && req.method === 'POST') {
    const e = await req.json().catch(() => null);
    if (!e || !['impression', 'play', 'watch', 'atc', 'like', 'share'].includes(e.type) || !e.videoId) return json({ error: 'bad event' }, 400, cors);
    const secs = Math.min(Math.max(Number(e.secs) || 0, 0), 3600);
    await env.DB.prepare('INSERT INTO events (video_id,type,secs,widget,product,at) VALUES (?,?,?,?,?,?)').bind(String(e.videoId).slice(0, 64), e.type, secs, String(e.widget || '').slice(0, 64), String(e.product || '').slice(0, 120), Date.now()).run();
    return json({ ok: true }, 200, cors);
  }

  if (!p.startsWith('/api/')) return json({ error: 'not found' }, 404, cors);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);

  // ---- admin ----
  if (p === '/api/videos' && req.method === 'GET') {
    const { results } = await env.DB.prepare(`${VIDEO_SQL} ORDER BY v.sort ASC, v.created_at DESC`).all();
    return json({ videos: results.map((r) => toVideo(r, url.origin)) }, 200, cors);
  }
  if (p === '/api/videos' && req.method === 'POST') { const id = crypto.randomUUID(); await upsertVideo(env, { ...(await req.json()), id }, true); return json({ id }, 201, cors); }
  const vm = p.match(/^\/api\/videos\/([\w-]+)$/);
  if (vm && req.method === 'PUT') { await upsertVideo(env, { ...(await req.json()), id: vm[1] }, false); return json({ ok: true }, 200, cors); }
  if (vm && req.method === 'DELETE') { await env.DB.prepare('DELETE FROM videos WHERE id=?').bind(vm[1]).run(); return json({ ok: true }, 200, cors); }

  if (p === '/api/widgets' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM widgets ORDER BY created_at ASC').all();
    return json({ widgets: results.map(toWidget) }, 200, cors);
  }
  if (p === '/api/widgets' && req.method === 'POST') { const id = 'wgt_' + crypto.randomUUID().slice(0, 8); await upsertWidget(env, { ...(await req.json()), id }, true); return json({ id }, 201, cors); }
  const wm = p.match(/^\/api\/widgets\/([\w-]+)$/);
  if (wm && req.method === 'PUT') { await upsertWidget(env, { ...(await req.json()), id: wm[1] }, false); return json({ ok: true }, 200, cors); }
  if (wm && req.method === 'DELETE') { await env.DB.prepare('DELETE FROM widgets WHERE id=?').bind(wm[1]).run(); return json({ ok: true }, 200, cors); }

  if (p === '/api/settings' && req.method === 'GET') return json({ settings: await getSettings(env) }, 200, cors);
  if (p === '/api/settings' && req.method === 'PUT') {
    await env.DB.prepare("INSERT INTO kv (k,v) VALUES ('settings',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(await req.json())).run();
    return json({ ok: true }, 200, cors);
  }
  const om = p.match(/^\/api\/order\/([\w-]+)$/);
  if (om && req.method === 'GET') return json({ order: parse((await env.DB.prepare('SELECT v FROM kv WHERE k=?').bind('order:' + om[1]).first())?.v, []) }, 200, cors);
  if (om && req.method === 'PUT') {
    await env.DB.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind('order:' + om[1], JSON.stringify((await req.json()).order || [])).run();
    return json({ ok: true }, 200, cors);
  }

  if (p === '/api/store/products' && req.method === 'GET') return json({ products: await storeProducts(env, url.searchParams.get('q')) }, 200, cors);

  // Raw file body, stored in R2 and served back through /media. Free plan caps request bodies at 100 MB.
  if (p === '/api/upload' && req.method === 'PUT') {
    const name = (url.searchParams.get('name') || 'video.mp4').replace(/[^\w.-]/g, '_').slice(-80);
    const key = `videos/${crypto.randomUUID()}-${name}`;
    await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: req.headers.get('content-type') || 'video/mp4' } });
    return json({ url: `${url.origin}/media/${key}` }, 201, cors);
  }

  if (p === '/api/analytics' && req.method === 'GET') {
    const days = Math.min(Number(url.searchParams.get('days')) || 30, 365);
    const since = Date.now() - days * 86400000;
    const q = (sql) => env.DB.prepare(sql).bind(since).all().then((r) => r.results);
    const [perVideo, perWidget, daily] = await Promise.all([
      q("SELECT video_id, SUM(type='impression') AS impressions, SUM(type='play') AS plays, SUM(CASE WHEN type='watch' THEN secs ELSE 0 END) AS secs, SUM(type='atc') AS atc, SUM(type='like') AS likes, SUM(type='share') AS shares FROM events WHERE at>=? GROUP BY video_id"),
      q("SELECT widget, SUM(type='impression') AS impressions, SUM(type='play') AS plays, SUM(type='atc') AS atc FROM events WHERE at>=? AND widget!='' GROUP BY widget"),
      q("SELECT strftime('%Y-%m-%d', at/1000, 'unixepoch') AS day, SUM(type='play') AS plays, SUM(type='atc') AS atc FROM events WHERE at>=? GROUP BY day ORDER BY day"),
    ]);
    return json({ perVideo, perWidget, daily }, 200, cors);
  }
  if (p === '/api/sync/instagram' && req.method === 'POST') return json(await syncInstagram(env), 200, cors);

  return json({ error: 'not found' }, 404, cors);
}

async function upsertVideo(env, v, isNew) {
  const args = [v.title, v.url, v.poster || '', v.audience || 'kids', v.status || 'draft', JSON.stringify(v.placements || []), JSON.stringify(v.products || []), v.archived ? 1 : 0, Number(v.sort) || 0];
  if (isNew) await env.DB.prepare('INSERT INTO videos (title,url,poster,audience,status,placements,products,archived,sort,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(...args, v.id, Date.now()).run();
  else await env.DB.prepare('UPDATE videos SET title=?,url=?,poster=?,audience=?,status=?,placements=?,products=?,archived=?,sort=? WHERE id=?').bind(...args, v.id).run();
}
async function upsertWidget(env, w, isNew) {
  const args = [w.name, w.type, w.page, w.scope || 'tagged', JSON.stringify(w.videoIds || []), JSON.stringify(w.productHandles || []), w.heading || '', w.enabled === false ? 0 : 1];
  if (isNew) await env.DB.prepare('INSERT INTO widgets (name,type,page,scope,video_ids,product_handles,heading,enabled,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(...args, w.id, Date.now()).run();
  else await env.DB.prepare('UPDATE widgets SET name=?,type=?,page=?,scope=?,video_ids=?,product_handles=?,heading=?,enabled=? WHERE id=?').bind(...args, w.id).run();
}

export default {
  fetch: (req, env) => handle(req, env).catch((e) => json({ error: String(e.message || e) }, 500)),
  scheduled: (_e, env, ctx) => ctx.waitUntil(syncInstagram(env)),
};
