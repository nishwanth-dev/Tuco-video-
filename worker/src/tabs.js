// "Product tabs" widget: category tabs, each with a video as the first slide followed by product cards.
// This file checks what the admin saves, and builds what the store widget shows (products, prices, ratings, the video).

const BAD = /[<>{};\\]/;
export class ContentError extends Error {}

// Text fields: plain text only (no markup characters), limited length.
const str = (x, max, what) => {
  const s = String(x == null ? '' : x).trim();
  if (s.length > max) throw new ContentError(`${what} is too long (max ${max} characters)`);
  if (BAD.test(s)) throw new ContentError(`${what} cannot contain < > { } ; or \\`);
  return s;
};

// Checks and tidies the saved content of a Product tabs widget. Throws ContentError with a plain message.
// deps: { okLink(x) -> bool, HANDLE: RegExp }
export function cleanContent(c, deps) {
  if (c == null) c = {};
  if (typeof c !== 'object' || Array.isArray(c)) throw new ContentError('the tabs content is invalid');
  const link = (x, what) => { const s = String(x == null ? '' : x).trim(); if (!s) return ''; if (s.length > 500 || !deps.okLink(s)) throw new ContentError(`${what} is not a valid link`); return s; };
  const out = {
    heading: str(c.heading, 120, 'the heading'),
    subheading: str(c.subheading, 300, 'the subheading'),
    atcText: str(c.atcText == null || c.atcText === '' ? 'add to cart' : c.atcText, 30, 'the add to cart text'),
    soldOutText: str(c.soldOutText == null || c.soldOutText === '' ? 'sold out' : c.soldOutText, 30, 'the sold out text'),
    offersHeading: str(c.offersHeading, 40, 'the offers badge'),
    tabs: [],
  };
  if (c.tabs == null) return out;
  if (!Array.isArray(c.tabs)) throw new ContentError('the tabs are invalid');
  if (c.tabs.length > 12) throw new ContentError('a widget can have at most 12 tabs');
  c.tabs.forEach((t, i) => {
    const n = `Tab ${i + 1}`;
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new ContentError(`${n} is invalid`);
    const title = str(t.title, 40, `${n} title`);
    if (!title) throw new ContentError(`${n} needs a title`);
    const collection = String(t.collection == null ? '' : t.collection).trim();
    if (collection && !deps.HANDLE.test(collection)) throw new ContentError(`${n} has an invalid collection`);
    let limit = t.limit == null || t.limit === '' ? 10 : Number(t.limit);
    if (!Number.isFinite(limit)) throw new ContentError(`${n}: the product limit must be a number`);
    limit = Math.min(25, Math.max(1, Math.round(limit)));
    if (t.products != null && !Array.isArray(t.products)) throw new ContentError(`${n}: the product list is invalid`);
    const products = [...new Set((t.products || []).map((h) => String(h).trim()).filter(Boolean))];
    if (products.length > 30) throw new ContentError(`${n} can have at most 30 hand-picked products`);
    if (products.some((h) => !deps.HANDLE.test(h))) throw new ContentError(`${n} has an invalid product`);
    const videoId = String(t.videoId == null ? '' : t.videoId).trim();
    if (videoId && !/^[\w-]{1,64}$/.test(videoId)) throw new ContentError(`${n} has an invalid video`);
    out.tabs.push({
      title, icon: link(t.icon, `${n} icon`), collection, limit, showRating: t.showRating !== false, products, videoId,
      overlayHeading: str(t.overlayHeading, 80, `${n} overlay heading`), overlaySub: str(t.overlaySub, 160, `${n} overlay text`), link: link(t.link, `${n} slide link`),
      viewAllText: str(t.viewAllText, 80, `${n} "View all" text`), viewAllUrl: link(t.viewAllUrl, `${n} "View all" link`),
    });
  });
  return out;
}

// ---------- ratings (read from each product page's public review data, kept for a day) ----------
const FRESH = 24 * 3600 * 1000;
const parseJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

// Finds the average rating and the number of reviews in a product page (schema.org data that the review app adds).
export function parseRating(html) {
  const text = String(html || '');
  const at = text.indexOf('aggregateRating');
  const part = at >= 0 ? text.slice(at, at + 1500) : text;
  const v = /"ratingValue"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/.exec(part);
  const n = /"(?:reviewCount|ratingCount)"\s*:\s*"?([0-9]+)"?/.exec(part);
  if (!v) return null;
  const value = Math.round(Number(v[1]) * 100) / 100;
  const count = n ? Number(n[1]) : 0;
  return value > 0 && value <= 5 && count > 0 ? { v: value, n: count } : null;
}

async function fetchRating(env, handle) {
  const base = String(env.STORE_URL || '').replace(/\/$/, '');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`${base}/products/${encodeURIComponent(handle)}`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; LoopyRatings/1.0)' }, signal: ctl.signal });
    if (r.status === 429 || r.status >= 500) return { retry: true };
    if (!r.ok) return { none: true };
    return parseRating(await r.text()) || { none: true };
  } catch { return { retry: true }; } finally { clearTimeout(t); }
}

// Refreshes ratings for some products, a few at a time and gently, so the store is never hammered.
async function refresh(env, handles, concurrency) {
  const found = {};
  const queue = [...handles];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const h = queue.shift();
      const r = await fetchRating(env, h);
      const now = Date.now();
      // A product with no rating is remembered for a day; a failed try is retried in about 4 hours.
      const rec = r.retry ? { v: 0, n: 0, t: now - FRESH + 4 * 3600 * 1000 } : r.none ? { v: 0, n: 0, t: now } : { v: r.v, n: r.n, t: now };
      try { await env.DB.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind('rating:' + h, JSON.stringify(rec)).run(); } catch { /* the next visit tries again */ }
      if (rec.n > 0) found[h] = rec;
      await new Promise((x) => setTimeout(x, 250));
    }
  }));
  return found;
}

// Returns { handle: {v, n} } for the products that have a rating. Missing or day-old ratings are refreshed in the background
// (or, for the admin preview, straight away so the preview is right the first time).
export async function getRatings(env, ctx, handles, { sync = false } = {}) {
  const hs = [...new Set(handles)].slice(0, 100);
  const out = {};
  if (!hs.length) return out;
  let rows = [];
  try { rows = (await env.DB.prepare(`SELECT k, v FROM kv WHERE k IN (${hs.map(() => '?').join(',')})`).bind(...hs.map((h) => 'rating:' + h)).all()).results; } catch { return out; }
  const have = new Map(rows.map((r) => [r.k.slice(7), parseJSON(r.v)]));
  const now = Date.now(); const stale = [];
  for (const h of hs) {
    const r = have.get(h);
    if (r && r.n > 0) out[h] = r;
    if (!r || now - (r.t || 0) > FRESH) stale.push(h);
  }
  if (stale.length) {
    const job = refresh(env, stale.slice(0, sync ? 12 : 6), sync ? 3 : 1);
    if (sync) Object.assign(out, await Promise.race([job, new Promise((x) => setTimeout(() => x({}), 9000))]));
    else if (ctx && ctx.waitUntil) ctx.waitUntil(job.catch(() => {}));
  }
  return out;
}

// ---------- what the store widget shows ----------
// deps: { catalog(env), collectionOrder(env, handle), video(id) -> video | null }
export async function resolveTabs(env, ctx, content, deps, opts = {}) {
  const tabsIn = Array.isArray(content && content.tabs) ? content.tabs : [];
  let cat = null;
  try { cat = await deps.catalog(env); } catch { cat = null; }
  const plans = [];
  for (const t of tabsIn) {
    let fromCollection = [];
    if (t.collection) { try { fromCollection = await deps.collectionOrder(env, t.collection); } catch { fromCollection = []; } }
    const known = (h) => !cat || cat.map[h];
    const handles = [...new Set([...fromCollection.filter(known).slice(0, t.limit || 10), ...(t.products || [])])];
    plans.push({ t, handles });
  }
  const rated = plans.filter((p) => p.t.showRating !== false).flatMap((p) => p.handles);
  const ratings = cat ? await getRatings(env, ctx, rated, { sync: !!opts.sync }) : {};
  const tabs = [];
  for (const { t, handles } of plans) {
    const products = [];
    for (const h of handles) {
      const p = cat && cat.map[h];
      if (!p) continue; // a product that is no longer in the store is left out
      const r = t.showRating !== false ? ratings[h] : null;
      products.push({ handle: h, title: p.title, price: p.price, from: !!p.from, compare: p.compare || '', off: p.off || 0, image: p.image || '', soldOut: !p.available, variantId: p.variantId || null, variants: p.variants || [], rating: r && r.n > 0 ? { value: r.v, count: r.n } : null });
    }
    let slide = null;
    if (t.videoId) { const v = await deps.video(t.videoId); if (v) slide = { id: v.id, title: v.title, url: v.url, poster: v.poster || '' }; }
    const url = t.viewAllUrl || (t.collection ? `/collections/${t.collection}` : '');
    tabs.push({
      title: t.title, icon: t.icon || '', slide, overlayHeading: t.overlayHeading || '', overlaySub: t.overlaySub || '', link: t.link || '', products,
      viewAll: url ? { text: t.viewAllText || `View all ${t.title} products`, url } : null,
    });
  }
  return { tabs, catalogOk: !!cat };
}
