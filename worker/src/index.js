import { runInstagramSync } from './instagram.js';
import { igStatus, setAuto, isAutoOn, reviewItems, approve } from './igreview.js';
import { runSiteCheck, startCheck, expireStale, getPages, savePages } from './sitecheck.js';
import { mergeSettings } from './defaults.js';
import { cleanContent, resolveTabs, ContentError } from './tabs.js';

class Bad extends Error {}
// https only: an http:// video on the https store would be blocked by the browser. localhost is allowed for local testing.
const okUrl = (u) => typeof u === 'string' && u.length <= 2000 && (/^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u) || u.startsWith('/media/'));
const okLink = (u) => !u || (typeof u === 'string' && u.length <= 2000 && (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u)));
// Product, collection and page names from the store (Shopify allows letters of any language and emoji in them; no spaces, slashes or markup characters).
const HANDLE = /^[^\s/\\?#&%"'<>]{1,255}$/u;
const PLACEMENTS = ['home', 'product', 'collection', 'pages'];
const WTYPES = ['carousel', 'stories', 'banner', 'spotlight', 'floating', 'gallery', 'feature', 'tabs', 'slide'];
const WPAGES = ['home', 'product', 'collection', 'pages'];

// Per-widget appearance overrides: only these settings, with these limits, may be overridden.
const RATIO = /^[1-9]\d?\/[1-9]\d?$/;
const ev = (...v) => (x) => v.includes(x);
const nm = (lo, hi) => (x) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
// Colours, fonts and text are checked strictly: a #rrggbb colour, a plain font name, and short text without markup characters.
const hex = (x) => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x);
const font = (x) => typeof x === 'string' && /^[\w .,'-]{1,60}$/.test(x.trim());
const txt = (max) => (x) => typeof x === 'string' && x.trim().length > 0 && x.length <= max && !/[<>{};\\]/.test(x);
const OVERRIDABLE = {
  brandColor: hex, brandFont: font, shopNowText: txt(40), showViews: (x) => typeof x === 'boolean',
  deviceOnly: (x) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length <= 60 && Object.entries(x).every(([k, v]) => /^[\w-]{1,64}$/.test(k) && (v === 'mobile' || v === 'desktop')),
  clickLink: (x) => typeof x === 'string' && x.trim().length > 0 && okLink(x.trim()), clickTarget: ev('same', 'new'), clickAction: ev('player', 'none'),
  tileType: ev('overlay', 'below', 'feed', 'minimal'), showPrice: (x) => typeof x === 'boolean', showAtc: (x) => typeof x === 'boolean',
  carousel: {
    headingColor: hex, headingFont: font, headingWeight: ev('400', '500', '600', '700', '800'), detailsColor: hex, feedAtcColor: hex, feedAtcTextColor: hex,
    tileAspect: (x) => RATIO.test(x), tileAspectDesktop: (x) => RATIO.test(x), tileAspectMobile: (x) => RATIO.test(x), tileWidthDesktop: nm(60, 700), tileWidthMobile: nm(60, 500),
    tileFit: ev('cover', 'contain'), tileFitDesktop: ev('cover', 'contain'), tileFitMobile: ev('cover', 'contain'), ordering: ev('none', 'newest', 'shuffle'), tileRadiusDesktop: nm(0, 999), tileRadiusMobile: nm(0, 999),
    tileGapDesktop: nm(0, 80), tileGapMobile: nm(0, 80), sidePaddingDesktop: nm(0, 120), sidePaddingMobile: nm(0, 120),
  },
  stories: { borderColor: hex, titleColor: hex, sizeFactor: nm(0.4, 3), spacing: nm(0.2, 4), sizeDesktop: nm(30, 300), sizeMobile: nm(30, 300), shape: ev('circle', 'rounded', 'square'), gapDesktop: nm(0, 80), gapMobile: nm(0, 80) },
  banner: { heightModeDesktop: ev('ratio', 'fixed'), heightModeMobile: ev('ratio', 'fixed'), fitDesktop: ev('cover', 'contain'), fitMobile: ev('cover', 'contain'), focusDesktop: ev('center', 'top', 'bottom'), focusMobile: ev('center', 'top', 'bottom'), background: hex, heightMode: ev('ratio', 'fixed'), desktopHeight: nm(100, 1400), mobileHeight: nm(100, 1200), aspectLandscape: (x) => x === 'auto' || RATIO.test(x), aspectPortrait: (x) => x === 'auto' || RATIO.test(x), fit: ev('cover', 'contain'), focus: ev('center', 'top', 'bottom'), radiusDesktop: nm(0, 999), radiusMobile: nm(0, 999), marginDesktop: nm(0, 200), marginMobile: nm(0, 200), maxWidthDesktop: nm(100, 2400), showDots: (x) => typeof x === 'boolean', showCta: (x) => typeof x === 'boolean', fullScreen: (x) => typeof x === 'boolean' },
  feature: { videoSide: ev('left', 'right'), videoWidthDesktop: nm(25, 75), headingSizeDesktop: nm(16, 120), headingSizeMobile: nm(14, 80), headingColor: hex, headingFont: font, background: hex, gapDesktop: nm(0, 120), paddingDesktop: nm(0, 200), paddingMobile: nm(0, 120), shapeDesktop: (x) => x === 'auto' || RATIO.test(x), shapeMobile: (x) => x === 'auto' || RATIO.test(x), cornersDesktop: nm(0, 999), cornersMobile: nm(0, 999) },
  tabs: { background: hex, headingColor: hex, textColor: hex, accentColor: hex, badgeBg: hex, badgeColor: hex, font, cardsPerRow: nm(3, 6), paddingTop: nm(0, 120), paddingBottom: nm(0, 120) },
  // The tabs and their content (checked in detail by cleanContent in tabs.js)
  content: () => true,
  spotlight: { position: ev('left', 'right'), sizeFactor: nm(0.4, 3), bottomOffsetMobile: nm(0, 400), bottomOffsetDesktop: nm(0, 400), widthDesktop: nm(40, 500), widthMobile: nm(40, 500), radiusDesktop: nm(0, 999), radiusMobile: nm(0, 999) },
};
function cleanOverrides(o) {
  if (o == null) return {};
  if (typeof o !== 'object' || Array.isArray(o)) throw new Bad('appearance overrides are invalid');
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const rule = OVERRIDABLE[k];
    if (!rule) throw new Bad(`"${k}" cannot be overridden per widget`);
    if (k === 'content') { try { out.content = cleanContent(v, { okLink, HANDLE }); } catch (e) { if (e instanceof ContentError) throw new Bad(e.message); throw e; } continue; }
    if (typeof rule === 'function') {
      if (!rule(v)) throw new Bad(`invalid value for ${k}`);
      out[k] = v;
      continue;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Bad(`invalid value for ${k}`);
    out[k] = {};
    for (const [kk, vv] of Object.entries(v)) {
      if (typeof rule[kk] !== 'function') throw new Bad(`"${k}.${kk}" cannot be overridden per widget`);
      if (!rule[kk](vv)) throw new Bad(`invalid value for ${k}.${kk}`);
      out[k][kk] = vv;
    }
  }
  // A fixed height only takes effect in fixed-height mode, so setting one switches this widget to that mode.
  if (out.banner && (out.banner.desktopHeight || out.banner.mobileHeight) && !out.banner.heightMode) out.banner.heightMode = 'fixed';
  return out;
}
const mergeOverrides = (settings, ov) => {
  const out = JSON.parse(JSON.stringify(settings));
  for (const [k, v] of Object.entries(ov || {})) {
    if (v && typeof v === 'object' && out[k] && typeof out[k] === 'object') Object.assign(out[k], v); else out[k] = v;
  }
  return out;
};

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
  const size = Number(v.size);
  return { ...v, size: Number.isFinite(size) && size >= 0 && size <= 5e9 ? Math.round(size) : 0, title, products, ctaText: String(v.ctaText || '').slice(0, 60), placements: (Array.isArray(v.placements) ? v.placements : []).filter((x) => PLACEMENTS.includes(x)), audience: v.audience === 'teens' ? 'teens' : 'kids', status: v.status === 'live' ? 'live' : 'draft' };
}
function cleanWidget(w) {
  if (!w || typeof w !== 'object') throw new Bad('invalid widget');
  if (!String(w.name || '').trim() || String(w.name).length > 120) throw new Bad('widget name is required (max 120 characters)');
  if (!WTYPES.includes(w.type) || !WPAGES.includes(w.page)) throw new Bad('invalid widget type or page');
  const list = (a, max) => (Array.isArray(a) ? a : []).map(String).filter((x) => HANDLE.test(x)).slice(0, max);
  return { ...w, name: String(w.name).trim(), heading: String(w.heading || '').slice(0, 120), scope: w.scope === 'custom' ? 'custom' : 'tagged', videoIds: list(w.videoIds, 200), productHandles: list(w.productHandles, 200), collectionHandles: list(w.collectionHandles, 200), pageHandles: list(w.pageHandles, 200), overrides: cleanOverrides(w.overrides) };
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });
const parse = (s, f) => { try { return JSON.parse(s); } catch { return f; } };

// Stored addresses like /media/videos/x.mp4 become full addresses. If a public R2 address is configured (R2_PUBLIC_URL),
// they point straight at R2 (fast, cached, no Worker request); otherwise at this API. Changing R2_PUBLIC_URL later moves every video at once.
const toVideo = (r, origin = '', pub = '') => {
  const abs = (u) => (!u ? u : u.startsWith('/media/') && pub ? `${pub.replace(/\/$/, '')}${u.slice(6)}` : u.startsWith('/') ? origin + u : u);
  const products = parse(r.products, []);
  return {
    id: r.id, title: r.title, url: abs(r.url), poster: abs(r.poster), audience: r.audience, status: r.status,
    placements: parse(r.placements, []), products, product: products[0] || { title: '', handle: '', price: '' },
    archived: !!r.archived, source: r.source, sort: r.sort, createdAt: r.created_at, views: r.views || 0,
    sourceId: r.source_id || '', ctaText: r.cta_text || '', ctaUrl: r.cta_url || '', startsAt: r.starts_at || 0, endsAt: r.ends_at || 0, size: r.size || 0,
  };
};
const toWidget = (r) => ({
  id: r.id, name: r.name, type: r.type, page: r.page, scope: r.scope, videoIds: parse(r.video_ids, []), productHandles: parse(r.product_handles, []),
  collectionHandles: parse(r.collection_handles, []), pageHandles: parse(r.page_handles, []), heading: r.heading, enabled: !!r.enabled, overrides: parse(r.overrides, {}), createdAt: r.created_at || 0,
});

// Public endpoints only answer to the store origins; admin endpoints need the bearer token.
// Only the listed store origins (exact match). For local testing, add http://localhost:PORT to ALLOWED_ORIGINS.
const storeOrigin = (origin, env) => (env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).includes(origin);
const corsFor = (req, env) => {
  const origin = req.headers.get('origin') || '';
  const ok = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).includes(origin) || (!!origin && !!req.headers.get('authorization')) || (req.method === 'OPTIONS' && !!origin);
  return { 'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', vary: 'origin' };
};
// Constant-time comparison of the bearer token (hashes first so lengths always match).
async function isAdmin(req, env) {
  const got = req.headers.get('authorization') || '';
  if (!env.ADMIN_TOKEN || !got) return false;
  const h = async (t) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const [a, b] = [await h(got), await h(`Bearer ${env.ADMIN_TOKEN}`)];
  return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(a, b) : a.every((x, i) => x === b[i]);
}

// Serves a stored video. Phones ask for pieces of a file ("Range"), so every kind of request must be answered correctly and never with an error:
// a piece that runs past the end is cut to the end, a piece that is nowhere in the file gets 416, anything unclear gets the whole file.
async function serveMedia(req, env, key) {
  const cors = { 'access-control-allow-origin': '*' };
  if (!env.MEDIA) return new Response('Video storage (R2) is not enabled yet', { status: 503, headers: cors });
  // A passing hiccup in storage is retried once, so a shopper never gets an error for a moment of trouble.
  const r2 = async (fn) => { try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 150)); return fn(); } };
  let head;
  try { head = await r2(() => env.MEDIA.head(key)); } catch { return new Response('Video storage is busy, please try again', { status: 503, headers: { ...cors, 'retry-after': '2' } }); }
  if (!head) return new Response('Not found', { status: 404, headers: cors });
  const size = head.size;
  const headers = { 'content-type': head.httpMetadata?.contentType || 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable', etag: head.httpEtag, ...cors };
  // Only a single "bytes=" range is understood. If the file changed since the shopper's earlier request (If-Range), the whole file is sent.
  const range = req.headers.get('range');
  const m = range && /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*(?:,|$)/i.exec(range);
  const ifRange = req.headers.get('if-range');
  let start = 0; let end = size - 1; let partial = false;
  if (m && (m[1] !== '' || m[2] !== '') && size > 0 && !(ifRange && ifRange !== head.httpEtag)) {
    if (m[1] === '') { const n = Number(m[2]); start = Math.max(0, size - n); if (!n) start = size; } // "the last n bytes"
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (start >= size || end < start) { const { 'cache-control': _cc, ...plain } = headers; return new Response(null, { status: 416, headers: { ...plain, 'content-range': `bytes */${size}` } }); }
    partial = true;
  }
  headers['content-length'] = String(partial ? end - start + 1 : size);
  if (partial) headers['content-range'] = `bytes ${start}-${end}/${size}`;
  if (req.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers });
  let obj;
  try { obj = await r2(() => env.MEDIA.get(key, partial ? { range: { offset: start, length: end - start + 1 } } : undefined)); } catch { return new Response('Video storage is busy, please try again', { status: 503, headers: { ...cors, 'retry-after': '2' } }); }
  if (!obj) return new Response('Not found', { status: 404, headers: cors });
  return new Response(obj.body, { status: partial ? 206 : 200, headers });
}

// If R2_PUBLIC_URL is set (an R2 custom domain or public bucket address), files are served straight from R2, which is faster and
// does not use Worker requests. Without it, files are served by this Worker at /media.
const fileUrl = (env, origin, key) => (env.R2_PUBLIC_URL ? `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}` : `${origin}/media/${key}`);
// The R2 key behind a stored video address (empty when the video is hosted elsewhere).
const keyOf = (env, url) => {
  const m = String(url || '').match(/\/media\/(videos\/[^?#]+)$/);
  if (m) return decodeURIComponent(m[1]);
  if (env.R2_PUBLIC_URL && String(url).startsWith(env.R2_PUBLIC_URL.replace(/\/$/, '') + '/')) return decodeURIComponent(String(url).slice(env.R2_PUBLIC_URL.replace(/\/$/, '').length + 1).split(/[?#]/)[0]);
  return '';
};
// Our own storage addresses are always saved in the short form /media/videos/..., whatever form the admin sends back,
// so that moving to a custom domain later (R2_PUBLIC_URL) changes every video at once.
const shortMedia = (env, u) => { const k = typeof u === 'string' && /^(https?:\/\/|\/media\/)/.test(u) ? keyOf(env, u) : ''; return k ? `/media/${k}` : u; };
const withShortMedia = (env, v) => ({ ...v, url: shortMedia(env, v.url), poster: shortMedia(env, v.poster) });
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
let CATALOG_BUSY = null;
async function catalog(env) {
  const age = CATALOG.map ? Date.now() - CATALOG.t : Infinity;
  if (age < 300000) return CATALOG;
  // A list that is a little old is used straight away while a fresh one is fetched in the background, so a shopper never waits for the store.
  if (CATALOG.map && age < 3600000) {
    if (!CATALOG_BUSY) CATALOG_BUSY = loadCatalog(env).catch(() => {}).finally(() => { CATALOG_BUSY = null; });
    return CATALOG;
  }
  return loadCatalog(env);
}
// Rupee text: whole rupees without decimals, paise kept when a price has them, Indian digit grouping (₹1,299).
const rupee = (n) => { const x = Number(n); if (!Number.isFinite(x)) return ''; return '₹' + (Number.isInteger(x) ? x.toLocaleString('en-IN') : x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); };
const dealOf = (price, compare) => (Number(compare) > Number(price) ? { was: Number(compare), off: Math.round((1 - Number(price) / Number(compare)) * 100) } : { was: 0, off: 0 });
async function loadCatalog(env) {
  const products = await allProducts(env, '/products.json');
  const list = products.map((p) => {
    const vs = p.variants || [];
    const av = vs.filter((v) => v.available);
    const v = av[0] || vs[0];
    // Show the lowest price among the choices a shopper can actually buy ("From ₹x" when they differ).
    const pool = av.length ? av : vs;
    const low = pool.reduce((m, x) => (m === null || Number(x.price) < Number(m.price) ? x : m), null) || v;
    const from = pool.length > 1 && pool.some((x) => Number(x.price) !== Number(low.price));
    const d = low ? dealOf(low.price, low.compare_at_price) : { was: 0, off: 0 };
    const multi = vs.length > 1 && !(vs.length === 1 && /default title/i.test(vs[0].title || ''));
    const variants = multi ? vs.slice(0, 40).map((x) => { const dd = dealOf(x.price, x.compare_at_price); return { id: x.id, title: String(x.title || '').slice(0, 80), price: rupee(x.price), compare: dd.was ? rupee(dd.was) : '', off: dd.off, available: !!x.available }; }) : [];
    return { handle: p.handle, title: p.title, price: low ? rupee(low.price) : '', from, compare: d.was ? rupee(d.was) : '', off: d.off, image: p.images?.[0]?.src || '', available: av.length > 0, variantId: av[0] ? av[0].id : null, variants };
  });
  CATALOG = { t: Date.now(), map: Object.fromEntries(list.map((p) => [p.handle, p])), list };
  return CATALOG;
}
const COLLORD = new Map();
// The products of a collection in the order the store shows them (first 250), kept for 5 minutes.
async function collectionOrder(env, handle) {
  const hit = COLLORD.get(handle);
  if (hit && Date.now() - hit.t < 300000) return hit.list;
  const { products = [] } = await storeFetch(env, `/collections/${encodeURIComponent(handle)}/products.json?limit=250`);
  const list = products.map((x) => x.handle);
  COLLORD.set(handle, { t: Date.now(), list });
  if (COLLORD.size > 200) COLLORD.delete(COLLORD.keys().next().value);
  return list;
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
  // Banners and other videos with no product tagged need nothing from the store, so they never wait for the product list.
  if (!videos.some((v) => v.products && v.products.length)) return videos;
  let cat;
  try { cat = await catalog(env); } catch { return videos; }
  videos.forEach((v) => v.products.forEach((p) => {
    const c = cat.map[p.handle];
    // A tagged product that is no longer in the store (deleted, hidden or renamed) is marked, so the widget does not show an old price or a dead link.
    if (!c) { if (cat.list.length) p.gone = true; return; }
    p.title = c.title; p.price = c.price; p.from = !!c.from; p.compare = c.compare || ''; p.off = c.off || 0; p.image = c.image || p.image; p.soldOut = !c.available; p.variantId = c.variantId; p.variants = c.variants || []; p.live = true;
  }));
  return videos;
}

// The live video chosen for a tab's first slide (nothing if it is not live, archived, or outside its dates).
async function tabVideo(env, origin, id) {
  const r = await env.DB.prepare(`${VIDEO_SQL} WHERE v.id=? AND v.status='live' AND v.archived=0`).bind(id).first();
  if (!r) return null;
  const v = toVideo(r, origin, env.R2_PUBLIC_URL); const now = Date.now();
  return (!v.startsAt || v.startsAt <= now) && (!v.endsAt || v.endsAt > now) ? v : null;
}
const tabDeps = (env, origin) => ({ catalog, collectionOrder, video: (id) => tabVideo(env, origin, id) });

// Picks and orders the videos a widget shows, using its scope, targeting, schedule and the saved arrange-media order.
async function videosForWidget(env, origin, widget, settings, ctx) {
  const now = Date.now();
  const { results } = await env.DB.prepare(`${VIDEO_SQL} WHERE v.status='live' AND v.archived=0 ORDER BY v.sort ASC, v.created_at DESC`).all();
  let list = results.map((r) => toVideo(r, origin, env.R2_PUBLIC_URL)).filter((v) => (!v.startsAt || v.startsAt <= now) && (!v.endsAt || v.endsAt > now));
  const { product, collection, placement } = ctx;
  if (widget && widget.scope === 'custom') { // hand-picked: only those videos, and nothing at all if none are picked
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-private-network': 'true' } });
  if (p.startsWith('/media/')) {
    let mkey; try { mkey = decodeURIComponent(p.slice(7)); } catch { return new Response('Not found', { status: 404, headers: { 'access-control-allow-origin': '*' } }); }
    return serveMedia(req, env, mkey);
  }

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
    const baseSettings = await getSettings(env);
    let settings = baseSettings;
    const wid = q('widget');
    let widget = null;
    if (wid) {
      const row = await env.DB.prepare('SELECT * FROM widgets WHERE id=?').bind(wid).first();
      if (!row || !row.enabled) return respond({ settings, widget: null, videos: [] });
      widget = toWidget(row);
      settings = mergeOverrides(baseSettings, widget.overrides);
      // A widget limited to certain collections or pages stays empty elsewhere.
      if (widget.collectionHandles.length && !widget.collectionHandles.includes(q('collection'))) return respond({ settings, widget, videos: [] });
      if (widget.pageHandles.length && !widget.pageHandles.includes(q('page'))) return respond({ settings, widget, videos: [] });
      if (widget.productHandles.length && q('product') && !widget.productHandles.includes(q('product'))) return respond({ settings, widget, videos: [] });
    }
    if (widget && widget.type === 'tabs') {
      const { tabs, catalogOk } = await resolveTabs(env, ctx, (widget.overrides || {}).content || {}, tabDeps(env, url.origin));
      return respond({ settings, widget, videos: [], tabs, catalogOk });
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
    // Every order total is kept (so Home can show video sales as a share of the whole store). Never blocks attribution.
    try { await env.DB.prepare('INSERT OR REPLACE INTO store_orders (order_id,amount,currency,at) VALUES (?,?,?,?)').bind(String(o.id), Number(o.total_price) || 0, o.currency || '', Date.parse(o.created_at) || Date.now()).run(); } catch {}
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
  if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401, cors);

  // ---- admin ----
  if (p === '/api/videos' && req.method === 'GET') {
    const { results } = await env.DB.prepare(`${VIDEO_SQL} ORDER BY v.sort ASC, v.created_at DESC`).all();
    return json({ videos: results.map((r) => toVideo(r, url.origin, env.R2_PUBLIC_URL)) }, 200, cors);
  }
  if (p === '/api/videos' && req.method === 'POST') { const id = crypto.randomUUID(); await upsertVideo(env, { ...withShortMedia(env, cleanVideo(await req.json())), id }, true); return json({ id }, 201, cors); }
  if (p === '/api/videos/order' && req.method === 'PUT') {
    const body = await req.json().catch(() => null);
    const ids = body && body.ids;
    if (!Array.isArray(ids) || ids.length > 2000 || ids.some((x) => typeof x !== 'string' || !/^[\w-]{1,64}$/.test(x))) return json({ error: 'ids must be a list of video ids' }, 400, cors);
    await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE videos SET sort=? WHERE id=?').bind(i, id)));
    return json({ ok: true }, 200, cors);
  }
  const vm = p.match(/^\/api\/videos\/([\w-]+)$/);
  if (vm && req.method === 'PUT') { await upsertVideo(env, { ...withShortMedia(env, cleanVideo(await req.json())), id: vm[1] }, false); return json({ ok: true }, 200, cors); }
  if (vm && req.method === 'DELETE') {
    const row = await env.DB.prepare('SELECT url, poster FROM videos WHERE id=?').bind(vm[1]).first();
    await env.DB.prepare('DELETE FROM videos WHERE id=?').bind(vm[1]).run();
    if (row && env.MEDIA) {
      for (const u of [row.url, row.poster]) {
        const key = keyOf(env, u);
        if (!key) continue;
        const stillUsed = await env.DB.prepare('SELECT 1 FROM videos WHERE instr(url, ?) > 0 OR instr(poster, ?) > 0 LIMIT 1').bind(key, key).first();
        if (!stillUsed) await env.MEDIA.delete(key).catch(() => {});
      }
    }
    return json({ ok: true }, 200, cors);
  }

  // Copies a video from a public link into R2 (server to server) and adds it as a video. Used by the Whatmore importer.
  if (p === '/api/import' && req.method === 'POST') {
    const v = await req.json();
    if (v.sourceId) {
      const dup = await env.DB.prepare('SELECT id FROM videos WHERE source_id=?').bind(String(v.sourceId)).first();
      if (dup) return json({ id: dup.id, skipped: 'already imported' }, 200, cors);
    }
    const clean = cleanVideo({ ...v, url: v.url }); // check everything first, so a bad entry never leaves a stray file in storage
    let finalUrl = v.url;
    if (v.copy !== false) {
      if (!env.MEDIA) return json({ error: 'Video storage (R2) is not enabled yet. Import with copy:false to link instead.' }, 503, cors);
      const src = await fetch(v.url);
      if (!src.ok) return json({ error: `could not fetch the video (${src.status})` }, 502, cors);
      const key = `videos/imp-${crypto.randomUUID()}.mp4`;
      const put = await env.MEDIA.put(key, src.body, { httpMetadata: { contentType: 'video/mp4' } });
      finalUrl = fileUrl(env, url.origin, key);
      v.size = put?.size || 0;
    }
    const id = crypto.randomUUID();
    await upsertVideo(env, { ...withShortMedia(env, { ...clean, url: finalUrl }), size: v.size || 0, id, source: v.source || 'import' }, true);
    return json({ id, url: finalUrl }, 201, cors);
  }

  // Preview of a Product tabs widget that is still being edited: the same answer the store would get, without saving anything.
  if (p === '/api/widgets/preview' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const overrides = cleanOverrides((b && b.overrides) || {});
    const settings = mergeOverrides(await getSettings(env), overrides);
    const { tabs, catalogOk } = await resolveTabs(env, ctx, overrides.content || {}, tabDeps(env, url.origin), { sync: true });
    return json({ settings, widget: { id: 'preview', type: 'tabs', overrides }, tabs, catalogOk }, 200, cors);
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
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 20000) throw new Bad('settings are invalid or too large');
    await env.DB.prepare("INSERT INTO kv (k,v) VALUES ('settings',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(body)).run();
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
    let list;
    try { ({ list } = await catalog(env)); } catch { return json({ error: 'Could not read the product list from your store right now. You can still paste product links, or try again in a minute.' }, 502, cors); }
    return json({ products: (s ? list.filter((x) => x.title.toLowerCase().includes(s) || x.handle.includes(s)) : list).map(({ variants, ...r }) => r) }, 200, cors);
  }
  if (p === '/api/store/collections' && req.method === 'GET') {
    let collections = [];
    try { ({ collections = [] } = await storeFetch(env, '/collections.json?limit=250')); } catch { return json({ error: 'Could not read your store collections right now. Try again in a minute.' }, 502, cors); }
    return json({ collections: collections.map((c) => ({ handle: c.handle, title: c.title })) }, 200, cors);
  }

  // Raw file body, stored in R2 and served back through /media. Free plan caps request bodies at 100 MB.
  if (p === '/api/upload' && req.method === 'PUT') {
    if (!env.MEDIA) return json({ error: 'Video storage (R2) is not enabled yet. Paste a video URL instead.' }, 503, cors);
    const name = (url.searchParams.get('name') || 'video.mp4').replace(/[^\w.-]/g, '_').slice(-80);
    const key = `videos/${crypto.randomUUID()}-${name}`;
    const obj = await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: req.headers.get('content-type') || 'video/mp4' } });
    return json({ url: fileUrl(env, url.origin, key), size: obj?.size || 0 }, 201, cors);
  }

  // Website check results (written by the scheduled checker, shown on the Site checks page).
  if (p === '/api/checks' && req.method === 'GET') {
    try {
      await expireStale(env);
      const { results } = await env.DB.prepare('SELECT id,at,status,pages,failures,duration_s,summary FROM site_checks ORDER BY at DESC LIMIT 90').all();
      return json({ checks: results.map((r) => ({ id: r.id, at: r.at, status: r.status, pages: r.pages, failures: r.failures, durationS: r.duration_s, summary: parse(r.summary, {}) })) }, 200, cors);
    } catch { return json({ checks: [], setup: true }, 200, cors); }
  }
  const ck = p.match(/^\/api\/checks\/(\d+)$/);
  if (ck && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM site_checks WHERE id=?').bind(Number(ck[1])).first();
    if (!r) return json({ error: 'not found' }, 404, cors);
    return json({ check: { id: r.id, at: r.at, status: r.status, pages: r.pages, failures: r.failures, durationS: r.duration_s, summary: parse(r.summary, {}), details: parse(r.details, []) } }, 200, cors);
  }
  // "Check now": starts the run on Cloudflare and answers at once, so a phone that locks or switches app does not interrupt it. Any device can follow the "running" row.
  if (p === '/api/checks/run' && req.method === 'POST') {
    const st = await startCheck(env);
    if (!st.already) ctx.waitUntil(runSiteCheck(env, { catalogFn: catalog, mediaFn: mediaProbe(env), rowId: st.id, patient: false }).catch(async (err) => {
      console.error('Loopy site check failed', err && err.stack || err);
      await env.DB.prepare("UPDATE site_checks SET status='fail', failures=1, summary=? WHERE id=? AND status='running'").bind(JSON.stringify({ kind: 'server-check', notes: ['The check stopped because of an error. Press Check now to try again.'] }), st.id).run().catch(() => {});
    }));
    return json({ ok: true, id: st.id, running: true, already: !!st.already }, 200, cors);
  }
  if (p === '/api/checks/pages' && req.method === 'GET') return json({ ...(await getPages(env)), max: 40 }, 200, cors);
  if (p === '/api/checks/pages' && req.method === 'PUT') {
    const b = await req.json().catch(() => ({}));
    const r = await savePages(env, b.pages);
    return r.error ? json({ error: r.error }, 400, cors) : json({ ok: true, ...r, max: 40 }, 200, cors);
  }
  if (p === '/api/checks' && req.method === 'POST') {
    const raw = await req.text();
    if (raw.length > 900000) throw new Bad('report is too large');
    let b; try { b = JSON.parse(raw); } catch { throw new Bad('invalid JSON'); }
    const status = ['ok', 'warn', 'fail', 'running'].includes(b.status) ? b.status : 'fail';
    const num = (x, max = 1e9) => Math.max(0, Math.min(max, Math.round(Number(x) || 0)));
    const r = await env.DB.prepare('INSERT INTO site_checks (at,status,pages,failures,duration_s,summary,details) VALUES (?,?,?,?,?,?,?)')
      .bind(num(b.at, 4e12) || Date.now(), status, num(b.pages), num(b.failures), num(b.durationS), JSON.stringify(b.summary || {}), JSON.stringify(Array.isArray(b.details) ? b.details : [])).run();
    await env.DB.prepare('DELETE FROM site_checks WHERE id NOT IN (SELECT id FROM site_checks ORDER BY at DESC LIMIT 200)').run();
    return json({ ok: true, id: r.meta.last_row_id }, 200, cors);
  }

  if (p === '/api/analytics' && req.method === 'GET') {
    const days = Math.min(Number(url.searchParams.get('days')) || 30, 365);
    const since = Date.now() - days * 86400000;
    const q = (sql) => env.DB.prepare(sql).bind(since).all().then((r) => r.results);
    // live=1: only widgets that are switched on and showed on the site in the last 3 days (leaves out old, replaced and test widgets)
    let wf = ''; let liveWidgets = null;
    if (url.searchParams.get('live') === '1') {
      const lr = await env.DB.prepare("SELECT id FROM widgets WHERE enabled=1 AND id IN (SELECT widget FROM events WHERE type='impression' AND at>=?)").bind(Date.now() - 3 * 86400000).all();
      const lids = lr.results.map((x) => x.id).filter((i) => /^[\w-]+$/.test(i));
      liveWidgets = lids.length; wf = lids.length ? ` AND widget IN (${lids.map((i) => `'${i}'`).join(',')})` : ' AND 0';
    }
    const T = "SUM(type='impression') AS impressions, SUM(type='play') AS plays, SUM(CASE WHEN type='watch' THEN secs ELSE 0 END) AS secs, SUM(type='atc') AS atc, SUM(type='like') AS likes, SUM(type='share') AS shares";
    const [perVideo, perWidget, daily, byDevice, bySource, sales, salesByVideo] = await Promise.all([
      q(`SELECT video_id, ${T} FROM events WHERE at>=?${wf} GROUP BY video_id`),
      q(`SELECT widget, ${T} FROM events WHERE at>=? AND widget!=''${wf} GROUP BY widget`),
      q(`SELECT strftime('%Y-%m-%d', at/1000, 'unixepoch') AS day, SUM(type='play') AS plays, SUM(type='atc') AS atc FROM events WHERE at>=?${wf} GROUP BY day ORDER BY day`),
      q(`SELECT device, ${T} FROM events WHERE at>=? AND device!=''${wf} GROUP BY device`),
      q(`SELECT src, ${T} FROM events WHERE at>=? AND src!=''${wf} GROUP BY src ORDER BY plays DESC LIMIT 12`),
      q('SELECT COUNT(DISTINCT order_id) AS orders, COALESCE(SUM(amount),0) AS revenue FROM order_attrib WHERE at>=?'),
      q('SELECT video_id, COUNT(DISTINCT order_id) AS orders, SUM(amount) AS revenue FROM order_attrib WHERE at>=? GROUP BY video_id'),
    ]);
    // null means the order webhook has not reported anything yet (or migration 005 has not been run).
    let storeSales = null;
    try { const r = await env.DB.prepare('SELECT COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue FROM store_orders WHERE at>=?').bind(since).first(); if (r && r.orders) storeSales = r; } catch {}
    return json({ perVideo, perWidget, daily, byDevice, bySource, sales: sales[0] || { orders: 0, revenue: 0 }, storeSales, salesByVideo, liveWidgets }, 200, cors);
  }
  if (p === '/api/health' && req.method === 'GET') {
    const checks = {};
    const run = async (name, fn) => { try { checks[name] = await fn(); } catch (e) { checks[name] = { ok: false, note: String(e.message || e) }; } };
    await run('database', async () => { await env.DB.prepare('SELECT 1').first(); return { ok: true, note: 'Connected' }; });
    await run('tables', async () => {
      const cols = (await env.DB.prepare("SELECT name FROM pragma_table_info('widgets')").all()).results.map((r) => r.name);
      const need = ['overrides', 'collection_handles', 'page_handles'];
      const missing = need.filter((c) => !cols.includes(c));
      return missing.length ? { ok: false, note: `Database is missing: ${missing.join(', ')}. Run the migrations in worker/migrations.` } : { ok: true, note: 'Up to date' };
    });
    checks.storage = env.MEDIA ? { ok: true, note: env.R2_PUBLIC_URL ? 'R2 connected, served from the R2 address' : 'R2 connected, served through the Worker (set R2_PUBLIC_URL for faster, direct serving)' } : { ok: false, note: 'R2 is not enabled yet. Videos cannot be uploaded until it is.' };
    await run('store', async () => { const c = await catalog(env); return { ok: true, note: `${c.list.length} store products readable` }; });
    checks.orders = env.SHOPIFY_WEBHOOK_SECRET ? { ok: true, note: 'Order webhook secret is set' } : { ok: false, note: 'Optional: add the order webhook to see sales from videos' };
    checks.instagram = env.IG_TOKEN ? { ok: true, note: 'Instagram token is set' } : { ok: false, note: 'Optional: add an Instagram token to copy reels automatically' };
    checks.origins = { ok: !!env.ALLOWED_ORIGINS, note: (env.ALLOWED_ORIGINS || 'none').split(',').join(', ') };
    const count = async (sql) => (await env.DB.prepare(sql).first()).n;
    const totals = { videos: await count('SELECT COUNT(*) AS n FROM videos'), live: await count("SELECT COUNT(*) AS n FROM videos WHERE status='live' AND archived=0"), widgets: await count('SELECT COUNT(*) AS n FROM widgets'), events30d: await count(`SELECT COUNT(*) AS n FROM events WHERE at>${Date.now() - 30 * 86400000}`) };
    return json({ checks, totals }, 200, cors);
  }
  if (p === '/api/export' && req.method === 'GET') {
    // A full copy of your data as one file, for backups.
    const all = async (t) => (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
    return json({ exportedAt: new Date().toISOString(), videos: await all('videos'), widgets: await all('widgets'), settings: await all('kv') }, 200, { ...cors, 'content-disposition': 'attachment; filename="loopy-backup.json"' });
  }
  if (p === '/api/sync/instagram' && req.method === 'POST') return json(await runInstagramSync(env, 'manual'), 200, cors);
  if (p === '/api/instagram' && req.method === 'GET') return json(await igStatus(env, catalog), 200, cors);
  if (p === '/api/instagram' && req.method === 'PUT') { const b = await req.json().catch(() => ({})); await setAuto(env, b.auto !== false && b.auto !== 0 && b.auto !== 'false'); return json({ ok: true, auto: await isAutoOn(env) }, 200, cors); }
  if (p === '/api/instagram/review' && req.method === 'GET') return json(await reviewItems(env, catalog), 200, cors);
  if (p === '/api/instagram/approve' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    try { return json(await approve(env, b.approvals, catalog), 200, cors); } catch { return json({ error: 'Could not read the product list from your store right now. Try again in a minute.' }, 502, cors); }
  }

  return json({ error: 'not found' }, 404, cors);
}

async function upsertVideo(env, v, isNew) {
  const args = [v.title, v.url, v.poster || '', v.audience || 'kids', v.status || 'draft', JSON.stringify(v.placements || []), JSON.stringify(v.products || []), v.archived ? 1 : 0, Number(v.sort) || 0, v.ctaText || '', v.ctaUrl || '', Number(v.startsAt) || 0, Number(v.endsAt) || 0, Number(v.size) || 0];
  if (isNew) await env.DB.prepare('INSERT INTO videos (title,url,poster,audience,status,placements,products,archived,sort,cta_text,cta_url,starts_at,ends_at,size,id,source,source_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...args, v.id, v.source || 'upload', v.sourceId ? String(v.sourceId) : null, Date.now()).run();
  else await env.DB.prepare('UPDATE videos SET title=?,url=?,poster=?,audience=?,status=?,placements=?,products=?,archived=?,sort=?,cta_text=?,cta_url=?,starts_at=?,ends_at=?,size=? WHERE id=?').bind(...args, v.id).run();
}
async function upsertWidget(env, w, isNew) {
  const args = [w.name, w.type, w.page, w.scope || 'tagged', JSON.stringify(w.videoIds || []), JSON.stringify(w.productHandles || []), JSON.stringify(w.collectionHandles || []), JSON.stringify(w.pageHandles || []), w.heading || '', w.enabled === false ? 0 : 1, JSON.stringify(w.overrides || {})];
  if (isNew) await env.DB.prepare('INSERT INTO widgets (name,type,page,scope,video_ids,product_handles,collection_handles,page_handles,heading,enabled,overrides,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...args, w.id, Date.now()).run();
  else await env.DB.prepare('UPDATE widgets SET name=?,type=?,page=?,scope=?,video_ids=?,product_handles=?,collection_handles=?,page_handles=?,heading=?,enabled=?,overrides=? WHERE id=?').bind(...args, w.id).run();
}

// Lets the site check ask for a video exactly the way a phone does, through the real serving code.
const mediaProbe = (env) => (key, headers) => serveMedia(new Request('https://loopy.invalid/media/' + key, { headers }), env, key);
// The three automatic checks: they wait longer for a store that is busy, and skip if a check is already running.
async function scheduledCheck(env) {
  const st = await startCheck(env);
  if (st.already) return;
  try { await runSiteCheck(env, { catalogFn: catalog, mediaFn: mediaProbe(env), rowId: st.id, patient: true }); }
  catch (err) { await env.DB.prepare("UPDATE site_checks SET status='fail', failures=1, summary=? WHERE id=? AND status='running'").bind(JSON.stringify({ kind: 'server-check', notes: ['The check stopped because of an error.'] }), st.id).run().catch(() => {}); throw err; }
}
const IG_CRON = '0 22 * * *'; // Instagram copy, every day at 3:30 am India time
export default {
  fetch: (req, env, ctx) => handle(req, env, ctx).catch((e) => {
    const cors = corsFor(req, env);
    if (e instanceof Bad) return json({ error: e.message }, 400, cors);
    if (e instanceof SyntaxError) return json({ error: 'The request was not valid JSON.' }, 400, cors);
    console.error('Loopy error', req.method, new URL(req.url).pathname, e && e.stack || e); // details stay in the log, not in the response
    return json({ error: 'Something went wrong on the server. Please try again, and check the System check on the Integrations page.' }, 500, cors);
  }),
  scheduled: (e, env, ctx) => ctx.waitUntil(e.cron === IG_CRON ? isAutoOn(env).then((on) => (on ? runInstagramSync(env, 'auto') : null)) : scheduledCheck(env).catch((err) => console.error('Loopy site check failed', err && err.stack || err))),
};
