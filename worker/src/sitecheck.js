// Automatic check of the live website's Loopy banners. Runs on Cloudflare's schedule, so it works with every laptop off.
// It only READS: it opens the important pages like a visitor, and looks at each widget's videos in storage. It never edits anything.
// (It cannot play a video in a real browser; that deeper check runs from the Mac. This one proves the page has the widget,
// the widget is on, and every video and poster file it needs exists and is not empty.)
export const CHECK_PAGES = [
  '/', '/collections/turmeric-saffron-dull-skin', '/collections/reetha-hibiscus', '/collections/beetroot-glycerin-makeup-range',
  '/collections/new-arrivals', '/collections/birthday-gifting', '/collections/999-new', '/pages/buy-at-99', '/collections/699-latest',
  '/collections/buy-1-get-1-lise', '/pages/5-249-each', '/pages/4-999', '/pages/3-999', '/pages/5-199', '/pages/b2g2-dsk',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (s, f) => { try { return JSON.parse(s); } catch { return f; } };
const keyOf = (u) => { const m = String(u || '').match(/\/media\/(videos\/[^?#]+)$/); return m ? decodeURIComponent(m[1]) : ''; };

async function timed(url, init = {}, ms = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

// Does this file exist and have content?
async function fileOk(env, url) {
  if (!url) return 'no address saved';
  const key = keyOf(url);
  try {
    if (key && env.MEDIA) { const o = await env.MEDIA.head(key); return !o ? 'file is missing from storage' : !o.size ? 'file is empty' : ''; }
    const r = await timed(url, { method: 'HEAD', redirect: 'follow' }, 10000);
    return r.status >= 400 ? `file answered ${r.status}` : '';
  } catch { return 'file could not be reached'; }
}

export async function runSiteCheck(env, { site = env.STORE_URL || 'https://tucokids.com', catalogFn } = {}) {
  const started = Date.now();
  // The store's product list, to confirm tagged products still exist and still have a price.
  let cat = null; let catErr = false;
  if (catalogFn) { try { cat = await catalogFn(env); } catch { catErr = true; } } const origin = String(site).replace(/\/$/, '');
  const details = []; const seen = new Map();
  // Open every page. Shopify sometimes answers 429 ("too many requests") to a server like ours for a short while. That says nothing about the
  // page itself, so a 429 (or a brief 5xx or no answer) is retried a few times with a growing pause before anything is reported.
  const gap = Number(env.CHECK_RETRY_MS) || 20000;
  const got = new Map(); let retryAfter = 0;
  const open = async (path) => {
    try {
      const r = await timed(origin + path, { headers: { 'user-agent': 'LoopyServerCheck/1.0' }, redirect: 'follow' });
      const ra = Number(r.headers.get('retry-after')); if (ra > 0) retryAfter = Math.max(retryAfter, Math.min(ra * 1000, 60000));
      got.set(path, { status: r.status, html: r.status === 200 ? await r.text() : '' });
    } catch { got.set(path, { status: 0, html: '' }); }
  };
  const queue = [...CHECK_PAGES];
  await Promise.all(Array.from({ length: 2 }, async () => { while (queue.length) { await open(queue.shift()); await sleep(150); } }));
  const transient = (g) => g.status === 429 || g.status === 0 || g.status >= 500;
  for (let round = 1; round <= 3; round++) {
    const pending = CHECK_PAGES.filter((pg) => transient(got.get(pg)));
    if (!pending.length) break;
    await sleep(Math.max(gap * round, env.CHECK_RETRY_MS ? 0 : retryAfter));
    for (const pg of pending) { await open(pg); await sleep(400); }
  }
  let limited = 0;
  for (const path of CHECK_PAGES) {
    const { status, html } = got.get(path);
    const ids = [...new Set([...html.matchAll(/data-widget="(wgt_[a-z0-9]+)"/g)].map((m) => m[1]))];
    if (status === 429) { limited++; details.push(row(path, '(page)', '', [], ['the store asked us to slow down (429), so this page could not be checked this time. This is not a problem on your site.'])); }
    else if (status !== 200) details.push(row(path, '(page)', '', ['the page answered ' + (status || 'nothing') + ' when opened'], []));
    else if (!ids.length) details.push(row(path, '(none)', '', ['this page has no Loopy banner or video on it'], []));
    for (const id of ids) { if (!seen.has(id)) seen.set(id, null); details.push({ path, id }); }
  }
  // judge each widget once, then attach the result to every page that holds it
  const verdict = new Map();
  for (const id of seen.keys()) verdict.set(id, await judge(env, id, cat));
  const rows = [];
  for (const d of details) {
    if (!d.id) { rows.push(d); continue; }
    const v = verdict.get(d.id); rows.push(row(d.path, d.id, v.type, v.problems, v.warnings, v.actual));
  }
  rows.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)));
  const problems = rows.reduce((n, r) => n + r.problems.length, 0); const warns = rows.reduce((n, r) => n + r.warnings.length, 0);
  const status = problems ? 'fail' : warns ? 'warn' : 'ok';
  const rec = {
    at: Date.now(), status, pages: CHECK_PAGES.length, failures: problems, durationS: Math.round((Date.now() - started) / 1000),
    summary: { kind: 'server-check', widgets: seen.size, warnings: warns, notes: ['Automatic check run by Loopy itself. It confirms each page has its widget, that every video and poster file exists, and that tagged products still exist in the store with a price. It does not play the video in a browser.'].concat(catErr ? ['The store product list could not be read just now, so prices and products were not checked.'] : [], limited ? [`The store asked this check to slow down (429) on ${limited} of ${CHECK_PAGES.length} pages, so those were not checked this time. Your videos and pages were not affected. The next run will check them.`] : []) },
    details: rows,
  };
  const ins = await env.DB.prepare('INSERT INTO site_checks (at,status,pages,failures,duration_s,summary,details) VALUES (?,?,?,?,?,?,?)')
    .bind(rec.at, rec.status, rec.pages, rec.failures, rec.durationS, JSON.stringify(rec.summary), JSON.stringify(rows)).run();
  rec.id = ins.meta.last_row_id;
  await env.DB.prepare('DELETE FROM site_checks WHERE id NOT IN (SELECT id FROM site_checks ORDER BY at DESC LIMIT 200)').run();
  return rec;
}

function row(path, widget, type, problems, warnings, actual = '') {
  return { url: path, path, device: 'server', widget, type, drawn: !problems.length, playing: null, shapeOk: null, expected: 'working', actual, problems, warnings };
}

async function judge(env, id, cat) {
  const problems = []; const warnings = [];
  const w = await env.DB.prepare('SELECT * FROM widgets WHERE id=?').bind(id).first();
  if (!w) return { type: '', problems: ['this widget no longer exists in Loopy'], warnings, actual: '' };
  if (!w.enabled) problems.push('this widget is switched off in Loopy');
  const ids = parse(w.video_ids, []); const ov = parse(w.overrides, {}); const only = ov.deviceOnly || {};
  let vids = [];
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT * FROM videos WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    vids = ids.map((i) => results.find((v) => v.id === i)).filter(Boolean);
  } else if (w.scope !== 'custom') { return { type: w.type, problems, warnings: ['videos for this widget are picked automatically, so their files were not checked'], actual: '' }; }
  const now = Date.now();
  const live = vids.filter((v) => v.status === 'live' && !v.archived && (!v.starts_at || v.starts_at <= now) && (!v.ends_at || v.ends_at > now));
  if (!vids.length) problems.push('the widget has no videos');
  else if (!live.length) problems.push('none of its videos are live (draft, archived or outside their dates)');
  for (const v of live) {
    const bad = await fileOk(env, v.url); if (bad) problems.push(`video "${v.title.slice(0, 40)}": ${bad}`);
    if (v.poster) { const pb = await fileOk(env, v.poster); if (pb) warnings.push(`picture for "${v.title.slice(0, 40)}": ${pb}`); }
    // Products tagged on the video: still in the store, with a price, and not all sold out
    const tags = parse(v.products, []);
    if (cat && cat.list && cat.list.length && tags.length) {
      let sold = 0;
      for (const t of tags) {
        const c = cat.map[t.handle];
        if (!c) warnings.push(`video "${v.title.slice(0, 40)}": product "${t.handle}" is no longer in the store, so it is hidden from the video`);
        else { if (!c.price || /^₹0(\.0+)?$/.test(c.price)) warnings.push(`product "${t.handle}" has no price in the store`); if (!c.available) sold++; }
      }
      if (sold && sold === tags.filter((t) => cat.map[t.handle]).length) warnings.push(`video "${v.title.slice(0, 40)}": every tagged product is sold out`);
    }
  }
  // a banner with phone-only/computer-only videos needs one for each device
  if (live.length && Object.keys(only).length) {
    const has = (dev) => live.some((v) => !only[v.id] || only[v.id] === dev);
    if (!has('desktop')) problems.push('no live video for computers'); if (!has('mobile')) problems.push('no live video for phones');
  }
  return { type: w.type, problems, warnings, actual: `${live.length} live video${live.length === 1 ? '' : 's'}` };
}
