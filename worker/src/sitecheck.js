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

// Looks at the first bytes of an mp4 file: is it laid out for fast start (the "moov" index before the "mdat" picture data), and which codecs does it use?
export function inspectMp4(u8) {
  const out = { isMp4: false, fastStart: null, codecs: [] };
  try {
    if (!u8 || u8.length < 12) return out;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const ascii = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
    let pos = 0; let first = true; let moov = null;
    for (let n = 0; n < 24 && pos + 8 <= u8.length; n++) {
      let size = dv.getUint32(pos); const type = ascii(pos + 4, 4);
      if (first) { if (!/^(ftyp|styp|moov|free|skip|wide)$/.test(type)) return out; out.isMp4 = true; first = false; }
      if (size === 1) { if (pos + 16 > u8.length) break; size = Number(dv.getBigUint64(pos + 8)); } else if (size === 0) size = Infinity;
      if (size < 8) break;
      if (type === 'moov') { out.fastStart = true; moov = u8.subarray(pos, Math.min(u8.length, pos + (Number.isFinite(size) ? size : u8.length))); break; }
      if (type === 'mdat') { out.fastStart = false; break; }
      if (!Number.isFinite(size)) break;
      pos += size;
    }
    if (moov) {
      const txt = Array.from(moov, (b) => String.fromCharCode(b)).join('');
      if (/avc[13]/.test(txt)) out.codecs.push('avc');
      if (/hvc1|hev1/.test(txt)) out.codecs.push('hevc');
      if (/av01/.test(txt)) out.codecs.push('av1');
      if (/vp09/.test(txt)) out.codecs.push('vp9');
    }
  } catch { /* an odd file: report what is known */ }
  return out;
}

// Everything that can stop a stored video from playing on a phone, checked for one video (once per run, whichever widgets use it).
async function videoCheck(ctx, env, v) {
  if (ctx.memo.has(v.id)) return ctx.memo.get(v.id);
  const work = (async () => {
    const problems = []; const warnings = [];
    const bad = await fileOk(env, v.url);
    if (bad) { problems.push(bad); return { problems, warnings }; }
    const key = keyOf(v.url);
    if (!key) {
      let host = ''; try { host = new URL(v.url).host; } catch { /* keep empty */ }
      warnings.push(/whatmore|cloudfront/i.test(host) ? `still served by Whatmore (${host}); it will stop working when the Whatmore plan ends` : `hosted outside Loopy (${host || 'unknown host'}), so Loopy cannot guarantee it keeps working`);
      return { problems, warnings };
    }
    try {
      const head = await env.MEDIA.head(key);
      const saved = Number(v.size) || 0;
      if (head && saved > 0 && head.size && Math.abs(head.size - saved) / saved > 0.02) problems.push(`the stored file is ${(head.size / 1048576).toFixed(1)} MB but ${(saved / 1048576).toFixed(1)} MB was saved, so it may be incomplete`);
      const ct = (head && head.httpMetadata && head.httpMetadata.contentType) || '';
      if (!/^video\//i.test(ct)) warnings.push(`the file type is "${ct || 'unknown'}", not video/mp4, so some phones may refuse to play it`);
      if (ctx.mediaFn) { // ask for the first bytes exactly the way a phone does, through the real serving code
        const r = await ctx.mediaFn(key, { range: 'bytes=0-1023' });
        const okRange = r.status === 200 || (r.status === 206 && /^bytes 0-\d+\/\d+$/.test(r.headers.get('content-range') || ''));
        if (!okRange || !/^video\//i.test(r.headers.get('content-type') || '')) problems.push(`the video is not served correctly (status ${r.status})`);
        await r.arrayBuffer().catch(() => {});
      }
      const o = await env.MEDIA.get(key, { range: { offset: 0, length: Math.max(1, Math.min(262144, (head && head.size) || 262144)) } });
      if (o) {
        const info = inspectMp4(new Uint8Array(await o.arrayBuffer()));
        if (!info.isMp4) warnings.push('the file does not look like an mp4 video');
        else {
          if (info.fastStart === false) warnings.push('not set up for fast start, so phones must download much of the video before it starts. Use "Make smaller" in Loopy, or re-save it with fast start');
          const odd = info.codecs.filter((c) => c !== 'avc');
          if (odd.length && !info.codecs.includes('avc')) warnings.push(`the video uses ${odd.join('/').toUpperCase()}, which some phones cannot play. H.264 plays everywhere`);
        }
      }
    } catch { warnings.push('the deeper video checks could not be completed this time'); }
    return { problems, warnings };
  })();
  const guarded = Promise.race([work, new Promise((r) => setTimeout(() => r({ problems: [], warnings: ['the deeper video checks timed out this time'] }), 9000))]);
  ctx.memo.set(v.id, guarded);
  return guarded;
}

// ---- the list of pages to check: the saved list if there is one, otherwise the built-in list ----
const MAX_PAGES = 40;
export async function getPages(env) {
  let saved = null;
  try { const r = await env.DB.prepare("SELECT v FROM kv WHERE k='check_pages'").first(); saved = r && JSON.parse(r.v); } catch { /* use the built-in list */ }
  const ok = Array.isArray(saved) && saved.length && saved.every((x) => typeof x === 'string' && x.startsWith('/'));
  return { pages: ok ? saved : CHECK_PAGES, isDefault: !ok };
}
// Accepts links or paths, one per line or as a list. Returns { pages } or { error }.
export function cleanPages(input, host = 'tucokids.com') {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[\n,]+/);
  const out = [];
  for (let x of raw.map((v) => String(v).trim()).filter(Boolean)) {
    if (/^https?:\/\//i.test(x)) {
      let u; try { u = new URL(x); } catch { return { error: `"${x.slice(0, 60)}" is not a valid link.` }; }
      if (u.host.replace(/^www\./, '') !== host) return { error: `"${x.slice(0, 60)}" is not on ${host}. Only pages of your own store can be checked.` };
      x = u.pathname + (u.search || '');
    }
    if (!x.startsWith('/')) x = '/' + x;
    if (x.startsWith('//')) return { error: `"${x.slice(0, 60)}" is not a valid page address.` };
    if (x.length > 200 || /\s/.test(x)) return { error: `"${x.slice(0, 60)}" is not a valid page address.` };
    const qi = x.indexOf('?'); const pathPart = qi < 0 ? x : x.slice(0, qi); const queryPart = qi < 0 ? '' : x.slice(qi);
    x = (pathPart.length > 1 ? pathPart.replace(/\/+$/, '') : pathPart) + queryPart;
    if (!out.includes(x)) out.push(x);
  }
  if (out.length > MAX_PAGES) return { error: `Too many pages: the most is ${MAX_PAGES}.` };
  return { pages: out };
}
export async function savePages(env, input) {
  const c = cleanPages(input, (env.STORE_URL || 'https://tucokids.com').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''));
  if (c.error) return c;
  if (!c.pages.length) { await env.DB.prepare("DELETE FROM kv WHERE k='check_pages'").run(); return { pages: CHECK_PAGES, isDefault: true }; }
  await env.DB.prepare("INSERT INTO kv (k,v) VALUES ('check_pages',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(c.pages)).run();
  return { pages: c.pages, isDefault: false };
}

// ---- one run at a time, visible while it works (a "running" row) so any device can follow it ----
const STALE_MS = 8 * 60 * 1000; // a patient automatic run can take several minutes
export async function expireStale(env) {
  await env.DB.prepare("UPDATE site_checks SET status='fail', failures=1, summary=? WHERE status='running' AND at < ?")
    .bind(JSON.stringify({ kind: 'server-check', notes: ['This check did not finish (it was interrupted). Press Check now to run it again.'] }), Date.now() - STALE_MS).run();
}
export async function startCheck(env) {
  await expireStale(env);
  const live = await env.DB.prepare("SELECT id FROM site_checks WHERE status='running' ORDER BY at DESC LIMIT 1").first();
  if (live) return { id: live.id, already: true };
  const { pages } = await getPages(env);
  const r = await env.DB.prepare("INSERT INTO site_checks (at,status,pages,failures,duration_s,summary,details) VALUES (?,?,?,?,?,?,?)")
    .bind(Date.now(), 'running', pages.length, 0, 0, JSON.stringify({ kind: 'server-check' }), '[]').run();
  const mine = r.meta.last_row_id;
  // If another device inserted at the same instant, the oldest "running" row wins and the other one steps aside.
  const first = await env.DB.prepare("SELECT id FROM site_checks WHERE status='running' ORDER BY id ASC LIMIT 1").first();
  if (first && first.id !== mine) { await env.DB.prepare('DELETE FROM site_checks WHERE id=?').bind(mine).run(); return { id: first.id, already: true }; }
  return { id: mine, already: false };
}

export async function runSiteCheck(env, { site = env.STORE_URL || 'https://tucokids.com', catalogFn, mediaFn, rowId = 0, patient = true } = {}) {
  const started = Date.now();
  const vctx = { memo: new Map(), mediaFn };
  const { pages: PAGES } = await getPages(env);
  // The store's product list, to confirm tagged products still exist and still have a price.
  let cat = null; let catErr = false;
  if (catalogFn) { try { cat = await catalogFn(env); } catch { catErr = true; } } const origin = String(site).replace(/\/$/, '');
  const details = []; const seen = new Map();
  // Open every page. Shopify sometimes answers 429 ("too many requests") to a server like ours for a short while. That says nothing about the
  // page itself, so a 429 (or a brief 5xx or no answer) is retried a few times with a growing pause before anything is reported.
  // A check started by pressing the button must finish quickly; the three automatic runs can wait longer.
  const gap = Number(env.CHECK_RETRY_MS) || (patient ? 20000 : 3000);
  const ROUNDS = patient ? 3 : 2;
  const got = new Map(); let retryAfter = 0;
  const open = async (path) => {
    try {
      const r = await timed(origin + path, { headers: { 'user-agent': 'LoopyServerCheck/1.0' }, redirect: 'follow' }, patient ? 15000 : 8000);
      const ra = Number(r.headers.get('retry-after')); if (ra > 0) retryAfter = Math.max(retryAfter, Math.min(ra * 1000, 60000));
      let to = ''; try { const f = new URL(r.url).pathname.replace(/\/+$/, '') || '/'; if (f.toLowerCase() !== (path.split('?')[0].replace(/\/+$/, '') || '/').toLowerCase()) to = f; } catch { /* keep empty */ }
      got.set(path, { status: r.status, html: r.status === 200 ? await r.text() : '', to });
    } catch { got.set(path, { status: 0, html: '' }); }
  };
  const queue = [...PAGES];
  await Promise.all(Array.from({ length: patient ? 2 : 3 }, async () => { while (queue.length) { await open(queue.shift()); await sleep(150); } }));
  const transient = (g) => g.status === 429 || g.status === 0 || g.status >= 500 || (g.status === 200 && g.html.length < 3000);
  for (let round = 1; round <= ROUNDS; round++) {
    const pending = PAGES.filter((pg) => transient(got.get(pg)));
    if (!pending.length || (!patient && Date.now() - started > 20000)) break;
    await sleep(Math.max(gap * round, env.CHECK_RETRY_MS ? 0 : retryAfter));
    for (const pg of pending) { await open(pg); await sleep(400); }
  }
  let limited = 0;
  for (const path of PAGES) {
    const { status, html, to } = got.get(path);
    const ids = [...new Set([...html.matchAll(/data-widget="(wgt_[a-z0-9]+)"/g)].map((m) => m[1]))];
    if (status === 429) { limited++; details.push(row(path, '(page)', '', [], ['the store asked us to slow down (429), so this page could not be checked this time. This is not a problem on your site.'])); }
    else if (status !== 200) details.push(row(path, '(page)', '', ['the page answered ' + (status || 'nothing') + ' when opened'], []));
    else if (html.length < 3000) details.push(row(path, '(page)', '', ['the page came back almost empty (it may be showing a security check), so it could not be checked'], []));
    else if (!ids.length) details.push(row(path, '(none)', '', ['this page has no Loopy banner or video on it'], []));
    if (to && status === 200 && html.length >= 3000) details.push(row(path, '(page)', '', [], [`this address now redirects to ${to}, so the banners shown are those of that page. Update the link if the page moved.`]));
    if (html.length >= 3000) for (const id of ids) { if (!seen.has(id)) seen.set(id, null); details.push({ path, id }); }
  }
  // judge each widget once, then attach the result to every page that holds it
  const verdict = new Map();
  for (const id of seen.keys()) verdict.set(id, await judge(env, id, cat, vctx));
  const rows = [];
  for (const d of details) {
    if (!d.id) { rows.push(d); continue; }
    const v = verdict.get(d.id); rows.push(row(d.path, d.id, v.type, v.problems, v.warnings, v.actual));
  }
  rows.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)));
  const problems = rows.reduce((n, r) => n + r.problems.length, 0); const warns = rows.reduce((n, r) => n + r.warnings.length, 0);
  const status = problems ? 'fail' : warns ? 'warn' : 'ok';
  const rec = {
    at: Date.now(), status, pages: PAGES.length, failures: problems, durationS: Math.round((Date.now() - started) / 1000),
    summary: { kind: 'server-check', widgets: seen.size, videosChecked: vctx.memo.size, warnings: warns, notes: ['Automatic check run by Loopy itself. It confirms each page has its widget, that every video and poster file exists, and that tagged products still exist in the store with a price. It does not play the video in a browser.'].concat(catErr ? ['The store product list could not be read just now, so prices and products were not checked.'] : [], limited ? [`The store asked this check to slow down (429) on ${limited} of ${PAGES.length} pages, so those were not checked this time. Your videos and pages were not affected. The next run will check them.`] : []) },
    details: rows,
  };
  if (rowId) {
    await env.DB.prepare('UPDATE site_checks SET at=?,status=?,pages=?,failures=?,duration_s=?,summary=?,details=? WHERE id=?')
      .bind(rec.at, rec.status, rec.pages, rec.failures, rec.durationS, JSON.stringify(rec.summary), JSON.stringify(rows), rowId).run();
    rec.id = rowId;
  } else {
    const ins = await env.DB.prepare('INSERT INTO site_checks (at,status,pages,failures,duration_s,summary,details) VALUES (?,?,?,?,?,?,?)')
      .bind(rec.at, rec.status, rec.pages, rec.failures, rec.durationS, JSON.stringify(rec.summary), JSON.stringify(rows)).run();
    rec.id = ins.meta.last_row_id;
  }
  await env.DB.prepare('DELETE FROM site_checks WHERE id NOT IN (SELECT id FROM site_checks ORDER BY at DESC LIMIT 200)').run();
  return rec;
}

function row(path, widget, type, problems, warnings, actual = '') {
  return { url: path, path, device: 'server', widget, type, drawn: !problems.length, playing: null, shapeOk: null, expected: 'working', actual, problems, warnings };
}

async function judge(env, id, cat, ctx) {
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
  const checks = await Promise.all(live.map((v) => videoCheck(ctx, env, v)));
  for (const [vi, v] of live.entries()) {
    for (const x of checks[vi].problems) problems.push(`video "${v.title.slice(0, 40)}": ${x}`);
    for (const x of checks[vi].warnings) warnings.push(`video "${v.title.slice(0, 40)}": ${x}`);
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
