import { syncInstagram } from './instagram.js';
import { mergeSettings } from './defaults.js';

class Bad extends Error {}
const okUrl = (u) => typeof u === 'string' && u.length <= 2000 && (/^https?:\/\//i.test(u) || u.startsWith('/media/'));
const okLink = (u) => !u || (typeof u === 'string' && u.length <= 2000 && (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u)));
const HANDLE = /^[\w.-]{1,255}$/;
const PLACEMENTS = ['home', 'product', 'collection', 'pages'];
const WTYPES = ['carousel', 'stories', 'banner', 'spotlight', 'floating', 'gallery'];
const WPAGES = ['home', 'product', 'collection', 'pages'];

// Rejects bad input with a clear message instead of storing it.
function cleanVideo(v) {
  if (!v || typeof v !== 'object') throw new Bad('invalid video');
  const title = String(v.title || '').trim();
  if (!title || title.length > 300) throw new Bad('title is required (max 300 characters)');
  if (!okUrl(v.url)) throw new Bad('video link must start with https://');
  if (v.poster && !okUrl(v.poster)) throw new Bad('poster link must start with https://');
  if (!okLink(v.ctaUrl)) throw new Bad('button link must be a web address or a path starting with /');
  const products = (Array.isArray(v.products) ? v.products : []).slice(0, 20).map((p) => ({ handle: String(p.handle || ''), title: String(p.title || '').slice(0, 300), price: String(p.price || '').slice(0, 40), image: okUrl(p.image) ? p.image : '' }));
  if (products.some((p) => !HANDLE.test(p.handle))) throw new Bad('product handle is invalid');
  return { ...v, title, products, ctaText: String(v.ctaText || '').slice(0, 60), placements: (Array.isArray(v.placements) ? v.placements : []).filter((x) => PLACEMENTS.includes(x)), audience: v.audience === 'teens' ? 'teens' : 'kids', status: v.status === 'live' ? 'live' : 'draft' };
}
function cleanWidget(w) {
  if (!w || typeof w !== 'object') throw new Bad('invalid widget');
  if (!String(w.name || '').trim() || String(w.name).length > 120) throw new Bad('widget name is required (max 120 characters)');
  if (!WTYPES.includes(w.type) || !WPAGES.includes(w.page)) throw new Bad('invalid widget type or page');
  const list = (a, max) => (Array.isArray(a) ? a : []).map(String).filter((x) => HANDLE.test(x)).slice(0, max);
  return { ...w, name: String(w.name).trim(), heading: String(w.heading || '').slice(0, 120), scope: w.scope === 'custom' ? 'custom' : 'tagged', videoIds: list(w.videoIds, 200), productHandles: list(w.productHandles, 200), collectionHandles: list(w.collectionHandles, 200), pageHandles: list(w.pageHandles, 200) };
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });
const parse = (s, f) => { try { return JSON.parse(s); } catch { return f; } };

const toVideo = (r, origin = '') => {
  const products = parse(r.products, []);
  return {
    id: r.id, title: r.title, url: r.url.startsWith('/') ? origin + r.url : r.url, poster: r.poster, audience: r.audience, status: r.status,
    placements: parse(r.placements, []), products, product: products[0] || { title: '', handle: '', price: '' },
    archived: !!r.archived, source: r.source, sort: r.sort, createdAt: r.created_at, views: r.views || 0,
    ctaText: r.cta_text || '', ctaUrl: r.cta_url || '', startsAt: r.starts_at || 0, endsAt: r.ends_at || 0,
  };
};
const toWidget = (r) => ({
  id: r.id, name: r.name, type: r.type, page: r.page, scope: r.scope, videoIds: parse(r.video_ids, []), productHandles: parse(r.product_handles, []),
  collectionHandles: parse(r.collection_handles, []), pageHandles: parse(r.page_handles, []), heading: r.heading, enabled: !!r.enabled,
});

// Public endpoints only answer to the store origins; admin endpoints need the bearer token.
const storeOrigin = (origin, env) => (env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).includes(origin) || origin.startsWith('http://localhost');
const corsFor = (req, env) => {
  const origin = req.headers.get('origin') || '';
  const ok = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).includes(origin) || origin.startsWith('http://localhost') || (!!origin && !!req.headers.get('authorization')) || (req.method === 'OPTIONS' && !!origin);
  return { 'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', vary: 'origin' };
};
const isAdmin = (req, env) => !!env.ADMIN_TOKEN && req.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;

async function serveMedia(req, env, key) {
  if (!env.MEDIA) return new Response('Video storage (R2) is not enabled yet', { status: 503 });
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

/* ---------- store catalogue (one cached request instead of one per product) ---------- */
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36', accept: 'application/json' };
async function storeFetch(env, path) {
  let r;
  // Try the store domain first, then the myshopify address if the first is blocked.
  for (const base of [env.STORE_URL, env.STORE_FALLBACK_URL].filter(Boolean)) {
    r = await fetch(`${base}${path}`, { headers: UA, cf: { cacheTtl: 300 } });
    if (r.ok) return r.json();
  }
  throw new Error(`Store unavailable (${r ? r.status : 'no url'})`);
}
// Shopify lists 250 products per page; read up to 8 pages (2,000 products).
async function allProducts(env, path) {
  const out = [];
  for (let page = 1; page <= 8; page++) {
    const { products = [] } = await storeFetch(env, `${path}?limit=250&page=${page}`);
    out.push(...products);
    if (products.length < 250) break;
  }
  return out;
}
let CATALOG = { t: 0, map: null, list: [] };
async function catalog(env) {
  if (CATALOG.map && Date.now() - CATALOG.t < 300000) return CATALOG;
  const products = await allProducts(env, '/products.json');
  const list = products.map((p) => {
    const av = (p.variants || []).find((v) => v.available);
    const v = av || (p.variants || [])[0];
    return { handle: p.handle, title: p.title, price: v ? `₹${Math.round(Number(v.price))}` : '', image: p.images?.[0]?.src || '', available: !!av, variantId: av ? av.id : null };
  });
  CATALOG = { t: Date.now(), map: Object.fromEntries(list.map((p) => [p.handle, p])), list };
  return CATALOG;
}
const COLL = new Map();
async function collectionHandles(env, handle) {
  const hit = COLL.get(handle);
  if (hit && Date.now() - hit.t < 300000) return hit.set;
  const products = await allProducts(env, `/collections/${encodeURIComponent(handle)}/products.json`);
  const set = new Set(products.map((p) => p.handle));
  COLL.set(handle, { t: Date.now(), set });
  return set;
}
// Fills live price, image, stock and variant from the cached catalogue; keeps saved values if the store is unreachable.
async function enrich(env, videos) {
  let cat;
  try { cat = await catalog(env); } catch { return videos; }
  videos.forEach((v) => v.products.forEach((p) => {
    const c = cat.map[p.handle];
    if (!c) return;
    p.title = c.title; p.price = c.price; p.image = c.image || p.image; p.soldOut = !c.available; p.variantId = c.variantId; p.live = true;
  }));
  return videos;
}

// Picks and orders the videos a widget shows, using its scope, targeting, schedule and the saved arrange-media order.
async function videosForWidget(env, origin, widget, settings, ctx) {
  const now = Date.now();
  const { results } = await env.DB.prepare(`${VIDEO_SQL} WHERE v.status='live' AND v.archived=0 ORDER BY v.sort ASC, v.created_at DESC`).all();
  let list = results.map((r) => toVideo(r, origin)).filter((v) => (!v.startsAt || v.startsAt <= now) && (!v.endsAt || v.endsAt > now));
  const { product, collection, placement } = ctx;
  if (widget && widget.scope === 'custom' && widget.videoIds.length) {
    list = widget.videoIds.map((id) => list.find((v) => v.id === id)).filter(Boolean);
  } else if (product) {
    let own = list.filter((v) => v.products.some((p) => p.handle === product));
    const order = parse((await env.DB.prepare('SELECT v FROM kv WHERE k=?').bind('order:' + product).first())?.v, []);
    own.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
    if (!own.length && settings.product.showHomepageVideos) own = list.filter((v) => v.placements.includes('home'));
    list = own;
  } else if (widget && widget.page === 'collection' && collection) {
    // Collection widgets show videos whose products belong to that collection.
    const handles = await collectionHandles(env, collection).catch(() => null);
    list = handles ? list.filter((v) => v.products.some((p) => handles.has(p.handle))) : list.filter((v) => v.placements.includes('collection'));
  } else {
    const pg = widget ? (widget.page === 'product' ? 'home' : widget.page) : placement;
    if (pg) list = list.filter((v) => v.placements.includes(pg) || !v.placements.length);
    if (settings.carousel.onlyTagged) list = list.filter((v) => v.products.length);
  }
  const o = settings.carousel.ordering;
  if (o === 'newest') list.sort((a, b) => b.createdAt - a.createdAt);
  if (o === 'shuffle') list = shuffleBatches(list, settings.carousel.shuffleBatch || list.length);
  return enrich(env, list);
}
function shuffleBatches(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(...list.slice(i, i + n).sort(() => Math.random() - 0.5));
  return out;
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function validShopifyHmac(env, raw, header) {
  if (!env.SHOPIFY_WEBHOOK_SECRET || !header) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SHOPIFY_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))) === header;
}

async function handle(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname;
  const cors = corsFor(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (p.startsWith('/media/')) return serveMedia(req, env, decodeURIComponent(p.slice(7)));

  // ---- public (store) ----
  if (p === '/api/public/config' && req.method === 'GET') {
    const q = (k) => url.searchParams.get(k) || '';
    // Edge cache (60s) keeps traffic spikes from hammering the database; only the body is cached, CORS is added per request.
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const ckey = new Request(url.origin + '/__cfg' + url.search);
    if (cache) {
      const hit = await cache.match(ckey).catch(() => null);
      if (hit) return json(await hit.json(), 200, { ...cors, 'cache-control': 'public, max-age=60', 'x-cache': 'hit' });
    }
    const respond = (payload) => {
      if (cache) ctx.waitUntil(cache.put(ckey, new Response(JSON.stringify(payload), { headers: { 'cache-control': 'public, max-age=60' } })).catch(() => {}));
      return json(payload, 200, { ...cors, 'cache-control': 'public, max-age=60' });
    };
    const settings = await getSettings(env);
    const wid = q('widget');
    let widget = null;
    if (wid) {
      const row = await env.DB.prepare('SELECT * FROM widgets WHERE id=?').bind(wid).first();
      if (!row || !row.enabled) return respond({ settings, widget: null, videos: [] });
      widget = toWidget(row);
      // A widget limited to certain collections or pages stays empty elsewhere.
      if (widget.collectionHandles.length && !widget.collectionHandles.includes(q('collection'))) return respond({ settings, widget, videos: [] });
      if (widget.pageHandles.length && !widget.pageHandles.includes(q('page'))) return respond({ settings, widget, videos: [] });
      if (widget.productHandles.length && q('product') && !widget.productHandles.includes(q('product'))) return respond({ settings, widget, videos: [] });
    }
    const product = q('product') || (widget?.productHandles.length === 1 ? widget.productHandles[0] : '');
    const useProduct = widget?.page === 'product' || q('product') ? product : '';
    const videos = await videosForWidget(env, url.origin, widget, settings, { product: useProduct, collection: q('collection'), placement: q('placement') });
    return respond({ settings, widget, videos });
  }
  if (p === '/api/public/events' && req.method === 'POST') {
    const raw = await req.text().catch(() => '');
    if (raw.length > 30000) return json({ error: 'too large' }, 413, cors);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad event' }, 400, cors); }
    const TYPES = ['impression', 'play', 'watch', 'atc', 'like', 'share'];
    // Only the store itself may report events, and only for videos that exist.
    const origin = req.headers.get('origin') || '';
    if (origin && !storeOrigin(origin, env)) return json({ error: 'origin not allowed' }, 403, cors);
    let events = (Array.isArray(body) ? body : [body]).slice(0, 50).filter((e) => e && TYPES.includes(e.type) && e.videoId && String(e.videoId).length <= 64);
    if (!events.length) return json({ error: 'bad event' }, 400, cors);
    const ids = [...new Set(events.map((e) => String(e.videoId)))];
    const known = new Set((await env.DB.prepare(`SELECT id FROM videos WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results.map((r) => r.id));
    events = events.filter((e) => known.has(String(e.videoId)));
    if (!events.length) return json({ error: 'unknown video' }, 400, cors);
    const now = Date.now();
    await env.DB.batch(events.map((e) => env.DB.prepare('INSERT INTO events (video_id,type,secs,widget,product,device,src,at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(String(e.videoId), e.type, Math.min(Math.max(Number(e.secs) || 0, 0), 3600), String(e.widget || '').slice(0, 64), String(e.product || '').slice(0, 120), e.device === 'mobile' ? 'mobile' : 'desktop', String(e.src || '').slice(0, 60), now)));
    return json({ ok: true, stored: events.length }, 200, cors);
  }

  // Shopify order webhook: credits sales to the video whose cart line carries the _tuco_video property.
  if (p === '/api/webhooks/shopify/orders' && req.method === 'POST') {
    const raw = await req.text();
    if (!(await validShopifyHmac(env, raw, req.headers.get('x-shopify-hmac-sha256')))) return json({ error: 'bad signature' }, 401);
    const o = JSON.parse(raw);
    let n = 0;
    for (const li of o.line_items || []) {
      const vid = (li.properties || []).find((x) => x.name === '_tuco_video')?.value;
      if (!vid) continue;
      const amount = Number(li.price) * Number(li.quantity || 1) - Number(li.total_discount || 0);
      await env.DB.prepare('INSERT OR REPLACE INTO order_attrib (order_id,line_id,video_id,amount,currency,at) VALUES (?,?,?,?,?,?)').bind(String(o.id), String(li.id), String(vid), amount, o.currency || '', Date.parse(o.created_at) || Date.now()).run();
      n++;
    }
    return json({ ok: true, credited: n });
  }

  if (!p.startsWith('/api/')) return json({ error: 'not found' }, 404, cors);
  if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);

  // ---- admin ----
  if (p === '/api/videos' && req.method === 'GET') {
    const { results } = await env.DB.prepare(`${VIDEO_SQL} ORDER BY v.sort ASC, v.created_at DESC`).all();
    return json({ videos: results.map((r) => toVideo(r, url.origin)) }, 200, cors);
  }
  if (p === '/api/videos' && req.method === 'POST') { const id = crypto.randomUUID(); await upsertVideo(env, { ...cleanVideo(await req.json()), id }, true); return json({ id }, 201, cors); }
  if (p === '/api/videos/order' && req.method === 'PUT') {
    const { ids = [] } = await req.json();
    await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE videos SET sort=? WHERE id=?').bind(i, id)));
    return json({ ok: true }, 200, cors);
  }
  const vm = p.match(/^\/api\/videos\/([\w-]+)$/);
  if (vm && req.method === 'PUT') { await upsertVideo(env, { ...cleanVideo(await req.json()), id: vm[1] }, false); return json({ ok: true }, 200, cors); }
  if (vm && req.method === 'DELETE') { await env.DB.prepare('DELETE FROM videos WHERE id=?').bind(vm[1]).run(); return json({ ok: true }, 200, cors); }

  // Copies a video from a public link into R2 (server to server) and adds it as a video. Used by the Whatmore importer.
  if (p === '/api/import' && req.method === 'POST') {
    const v = await req.json();
    if (v.sourceId) {
      const dup = await env.DB.prepare('SELECT id FROM videos WHERE source_id=?').bind(String(v.sourceId)).first();
      if (dup) return json({ id: dup.id, skipped: 'already imported' }, 200, cors);
    }
    let finalUrl = v.url;
    if (v.copy !== false) {
      if (!env.MEDIA) return json({ error: 'Video storage (R2) is not enabled yet. Import with copy:false to link instead.' }, 503, cors);
      const src = await fetch(v.url);
      if (!src.ok) return json({ error: `could not fetch the video (${src.status})` }, 502, cors);
      const key = `videos/imp-${crypto.randomUUID()}.mp4`;
      await env.MEDIA.put(key, src.body, { httpMetadata: { contentType: 'video/mp4' } });
      finalUrl = `/media/${key}`;
    }
    const id = crypto.randomUUID();
    await upsertVideo(env, { ...cleanVideo({ ...v, url: finalUrl.startsWith('/') ? finalUrl : v.url }), url: finalUrl, id, source: v.source || 'import' }, true);
    return json({ id, url: finalUrl }, 201, cors);
  }

  if (p === '/api/widgets' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM widgets ORDER BY created_at ASC').all();
    return json({ widgets: results.map(toWidget) }, 200, cors);
  }
  if (p === '/api/widgets' && req.method === 'POST') { const id = 'wgt_' + crypto.randomUUID().slice(0, 8); await upsertWidget(env, { ...cleanWidget(await req.json()), id }, true); return json({ id }, 201, cors); }
  const wm = p.match(/^\/api\/widgets\/([\w-]+)$/);
  if (wm && req.method === 'PUT') { await upsertWidget(env, { ...cleanWidget(await req.json()), id: wm[1] }, false); return json({ ok: true }, 200, cors); }
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

  if (p === '/api/store/products' && req.method === 'GET') {
    const s = (url.searchParams.get('q') || '').toLowerCase();
    const { list } = await catalog(env);
    return json({ products: s ? list.filter((x) => x.title.toLowerCase().includes(s) || x.handle.includes(s)) : list }, 200, cors);
  }
  if (p === '/api/store/collections' && req.method === 'GET') {
    const { collections = [] } = await storeFetch(env, '/collections.json?limit=250');
    return json({ collections: collections.map((c) => ({ handle: c.handle, title: c.title })) }, 200, cors);
  }

  // Raw file body, stored in R2 and served back through /media. Free plan caps request bodies at 100 MB.
  if (p === '/api/upload' && req.method === 'PUT') {
    if (!env.MEDIA) return json({ error: 'Video storage (R2) is not enabled yet. Paste a video URL instead.' }, 503, cors);
    const name = (url.searchParams.get('name') || 'video.mp4').replace(/[^\w.-]/g, '_').slice(-80);
    const key = `videos/${crypto.randomUUID()}-${name}`;
    await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: req.headers.get('content-type') || 'video/mp4' } });
    return json({ url: `${url.origin}/media/${key}` }, 201, cors);
  }

  if (p === '/api/analytics' && req.method === 'GET') {
    const days = Math.min(Number(url.searchParams.get('days')) || 30, 365);
    const since = Date.now() - days * 86400000;
    const q = (sql) => env.DB.prepare(sql).bind(since).all().then((r) => r.results);
    const T = "SUM(type='impression') AS impressions, SUM(type='play') AS plays, SUM(CASE WHEN type='watch' THEN secs ELSE 0 END) AS secs, SUM(type='atc') AS atc, SUM(type='like') AS likes, SUM(type='share') AS shares";
    const [perVideo, perWidget, daily, byDevice, bySource, sales, salesByVideo] = await Promise.all([
      q(`SELECT video_id, ${T} FROM events WHERE at>=? GROUP BY video_id`),
      q(`SELECT widget, ${T} FROM events WHERE at>=? AND widget!='' GROUP BY widget`),
      q("SELECT strftime('%Y-%m-%d', at/1000, 'unixepoch') AS day, SUM(type='play') AS plays, SUM(type='atc') AS atc FROM events WHERE at>=? GROUP BY day ORDER BY day"),
      q(`SELECT device, ${T} FROM events WHERE at>=? AND device!='' GROUP BY device`),
      q(`SELECT src, ${T} FROM events WHERE at>=? AND src!='' GROUP BY src ORDER BY plays DESC LIMIT 12`),
      q('SELECT COUNT(DISTINCT order_id) AS orders, COALESCE(SUM(amount),0) AS revenue FROM order_attrib WHERE at>=?'),
      q('SELECT video_id, COUNT(DISTINCT order_id) AS orders, SUM(amount) AS revenue FROM order_attrib WHERE at>=? GROUP BY video_id'),
    ]);
    return json({ perVideo, perWidget, daily, byDevice, bySource, sales: sales[0] || { orders: 0, revenue: 0 }, salesByVideo }, 200, cors);
  }
  if (p === '/api/sync/instagram' && req.method === 'POST') return json(await syncInstagram(env), 200, cors);

  return json({ error: 'not found' }, 404, cors);
}

async function upsertVideo(env, v, isNew) {
  const args = [v.title, v.url, v.poster || '', v.audience || 'kids', v.status || 'draft', JSON.stringify(v.placements || []), JSON.stringify(v.products || []), v.archived ? 1 : 0, Number(v.sort) || 0, v.ctaText || '', v.ctaUrl || '', Number(v.startsAt) || 0, Number(v.endsAt) || 0];
  if (isNew) await env.DB.prepare('INSERT INTO videos (title,url,poster,audience,status,placements,products,archived,sort,cta_text,cta_url,starts_at,ends_at,id,source,source_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...args, v.id, v.source || 'upload', v.sourceId ? String(v.sourceId) : null, Date.now()).run();
  else await env.DB.prepare('UPDATE videos SET title=?,url=?,poster=?,audience=?,status=?,placements=?,products=?,archived=?,sort=?,cta_text=?,cta_url=?,starts_at=?,ends_at=? WHERE id=?').bind(...args, v.id).run();
}
async function upsertWidget(env, w, isNew) {
  const args = [w.name, w.type, w.page, w.scope || 'tagged', JSON.stringify(w.videoIds || []), JSON.stringify(w.productHandles || []), JSON.stringify(w.collectionHandles || []), JSON.stringify(w.pageHandles || []), w.heading || '', w.enabled === false ? 0 : 1];
  if (isNew) await env.DB.prepare('INSERT INTO widgets (name,type,page,scope,video_ids,product_handles,collection_handles,page_handles,heading,enabled,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(...args, w.id, Date.now()).run();
  else await env.DB.prepare('UPDATE widgets SET name=?,type=?,page=?,scope=?,video_ids=?,product_handles=?,collection_handles=?,page_handles=?,heading=?,enabled=? WHERE id=?').bind(...args, w.id).run();
}

export default {
  fetch: (req, env, ctx) => handle(req, env, ctx).catch((e) => json({ error: String(e.message || e) }, e instanceof Bad ? 400 : 500, corsFor(req, env))),
  scheduled: (_e, env, ctx) => ctx.waitUntil(syncInstagram(env)),
};
