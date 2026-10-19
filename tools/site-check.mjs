#!/usr/bin/env node
// Checks the live website's Loopy widgets: do they appear, do banners play, and do they have the right size.
// It never changes anything on the site: it only reads pages, like a visitor. Results are saved as a report file
// (~/Downloads/loopy-site-checks/) and, unless --dry, in Loopy's database so they show on the "Site checks" page.
//
//   node tools/site-check.mjs [--site https://tucokids.com] [--dry] [--max-pages 24] [--only /pages/some-page]
//
// Steps: 1) read the sitemap, 2) fetch every page's HTML (no browser, light) to find the pages that contain Loopy widgets,
// 3) open one or two pages per distinct set of widgets in a real browser, on a phone and on a computer, 4) judge and report.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const SITE = arg('--site', 'https://tucokids.com').replace(/\/$/, '');
const API = 'https://tuco-video-api.tucokids.workers.dev';
const DRY = process.argv.includes('--dry');
const MAX_PAGES = Number(arg('--max-pages', 24));
const ONLY = arg('--only', '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (compatible; LoopySiteCheck/1.0)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const started = Date.now();
const notes = [];

// ---------- 1. the sitemap ----------
async function get(url, tries = 3) {
  for (let a = 0; a < tries; a++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ctl.signal }); clearTimeout(t);
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (a + 1)); continue; }
      return { status: r.status, text: await r.text() };
    } catch { await sleep(800 * (a + 1)); }
  }
  return { status: 0, text: '' };
}
async function sitemapUrls() {
  const out = new Set(); const seen = new Set();
  const walk = async (u, depth) => {
    if (seen.has(u) || depth > 3) return; seen.add(u);
    const { status, text } = await get(u);
    if (status !== 200) { notes.push(`Could not read ${u} (status ${status}).`); return; }
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&').trim());
    for (const l of locs) { if (/\.xml(\?|$)/.test(l)) await walk(l, depth + 1); else if (l.startsWith(SITE)) out.add(l); }
  };
  await walk(SITE + '/sitemap.xml', 0);
  return [...out];
}

// ---------- 2. which pages have Loopy widgets (plain HTML, no browser) ----------
async function scan(all) {
  // product pages share a few widget sets, so a sample of them is enough; every other page is read
  const prod = all.filter((u) => /\/products\//.test(u)); const step = Math.max(1, Math.ceil(prod.length / 40));
  const urls = [...all.filter((u) => !/\/products\//.test(u)), ...prod.filter((_, k) => k % step === 0)];
  const found = []; let i = 0, bad = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (i < urls.length) {
      const url = urls[i++]; const { status, text } = await get(url, 2);
      if (status !== 200) { bad++; if (bad <= 5) notes.push(`${url.replace(SITE, '') || '/'} answered ${status || 'no reply'} when read.`); continue; }
      const widgets = [...new Set([...text.matchAll(/data-widget="(wgt_[a-z0-9]+)"/g)].map((m) => m[1]))];
      if (widgets.length) found.push({ url, widgets });
      await sleep(150);
    }
  }));
  if (bad > 5) notes.push(`${bad} pages in total could not be read.`);
  return found;
}

// ---------- 3. choose a few representative pages ----------
function choose(found) {
  if (!process.argv.includes('--discover') && !ONLY) return { picks: found.map((f) => ({ ...f, path: f.url.replace(SITE, '') || '/' })), groups: found.length };
  const groups = new Map();
  for (const f of found) {
    const path = f.url.replace(SITE, '') || '/'; const kind = path === '/' ? 'home' : path.split('/')[1];
    const key = kind + '|' + [...f.widgets].sort().join(',');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ ...f, path });
  }
  const picks = [];
  for (const list of groups.values()) { picks.push(list[0]); if (list.length > 1) picks.push(list[Math.floor(list.length / 2)]); }
  const home = found.find((f) => f.url === SITE + '/' || f.url === SITE);
  const ordered = [...(home ? [{ ...home, path: '/' }] : []), ...picks.filter((p) => p.path !== '/')];
  const uniq = [...new Map(ordered.map((p) => [p.url, p])).values()];
  if (uniq.length > MAX_PAGES) notes.push(`Only ${MAX_PAGES} of ${uniq.length} distinct page layouts were opened in a browser this time.`);
  return { picks: uniq.slice(0, MAX_PAGES), groups: groups.size };
}

// ---------- 4. the browser checks ----------
const cfgCache = new Map();
async function widgetConfig(id) {
  if (cfgCache.has(id)) return cfgCache.get(id);
  const { text } = await get(`${API}/api/public/config?widget=${id}&sc=${Date.now()}`, 2);
  let j = null; try { j = JSON.parse(text); } catch { /* not found */ }
  cfgCache.set(id, j); return j;
}
const ratioOf = (v) => { const m = String(v || '').match(/^(\d+(?:\.\d+)?)\s*[\/:]\s*(\d+(?:\.\d+)?)$/); return m ? Number(m[1]) / Number(m[2]) : 0; };
const BLOCK = /googletagmanager|google-analytics|googleadservices|doubleclick|clarity\.ms|contentsquare|facebook\.net|facebook\.com\/tr|wingify|intelligems|judge\.me|shoplift|customfit|zigpoll|nitro|hotjar|gokwik|shopflo|sagepilot/i;

async function checkPage(browser, pick, device) {
  const mobile = device === 'phone';
  const page = await browser.newPage(); await page.bringToFront().catch(() => {});
  const loopyFails = []; const consoleErrs = [];
  try {
    await page.setViewport(mobile ? { width: 412, height: 823, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.setUserAgent(mobile ? 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 LoopySiteCheck' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 LoopySiteCheck');
    await page.setRequestInterception(true);
    page.on('request', (r) => { if (BLOCK.test(r.url())) r.abort(); else r.continue(); });
    page.on('response', (r) => { const u = r.url(); if (/loopy\.tucokids|tuco-video-api/.test(u) && r.status() >= 400) loopyFails.push(`${r.status()} ${u.replace(/https?:\/\//, '').replace(/\?.*/, '').slice(-60)}`); });
    page.on('requestfailed', (r) => { const u = r.url(); if (/loopy\.tucokids|tuco-video-api/.test(u) && !/ERR_ABORTED/.test(r.failure() && r.failure().errorText || '')) loopyFails.push(`failed ${u.replace(/https?:\/\//, '').replace(/\?.*/, '').slice(-60)}`); });
    page.on('console', (m) => { if (m.type() === 'error' && /tuco|loopy/i.test(m.text())) consoleErrs.push(m.text().slice(0, 120)); });
    await page.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // scroll down in steps so widgets that wait until they are near the screen start
    for (let y = 0; y < 14000; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(250); const end = await page.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 5); if (end) break; }
    await sleep(2500);
    const hosts = await page.evaluate(() => [...document.querySelectorAll('[data-tuco-video]')].map((h, i) => { h.setAttribute('data-chk', String(i)); return { i, widget: h.getAttribute('data-widget') || '' }; }));
    const rows = [];
    for (const h of hosts) {
      const row = { url: pick.url, path: pick.path, device, widget: h.widget, type: '', drawn: false, playing: null, shapeOk: null, expected: '', actual: '', problems: [], warnings: [] };
      const t0 = Date.now(); let info = null;
      for (let a = 0; a < 20; a++) {
        await page.evaluate((i) => { const el = document.querySelector(`[data-chk="${i}"]`); if (el) el.scrollIntoView({ block: 'center' }); }, h.i);
        await sleep(500);
        info = await page.evaluate((i) => {
          const host = document.querySelector(`[data-chk="${i}"]`); const sr = host && host.shadowRoot;
          if (!host) return null;
          const find = (root) => { const out = []; root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) out.push(...find(e.shadowRoot)); }); return [root, ...out]; };
          const roots = sr ? find(sr) : []; const q = (sel) => roots.flatMap((r) => [...r.querySelectorAll(sel)]);
          const tiles = q('.tile'); const vids = q('video'); const note = sr ? (sr.querySelector('.note') || {}).textContent : '';
          const hb = host.getBoundingClientRect(); const t = tiles[0] ? tiles[0].getBoundingClientRect() : null;
          const cls = sr ? (sr.querySelector('.ft') ? 'section' : sr.querySelector('.banner') ? 'banner' : sr.querySelector('.stories') ? 'stories' : sr.querySelector('.fl') ? 'spotlight' : sr.querySelector('.carousel, .rail') ? 'carousel' : '') : '';
          const vis = vids.find((v) => { const b = v.getBoundingClientRect(); return b.width > 20 && b.bottom > 0 && b.top < innerHeight; }) || vids[0];
          const imgs = q('img.th'); const broken = imgs.filter((im) => im.complete && im.naturalWidth === 0 && im.getAttribute('src')).length;
          return { drawn: tiles.length > 0, type: cls, tileW: t ? Math.round(t.width) : 0, tileH: t ? Math.round(t.height) : 0, hostH: Math.round(hb.height), playing: !!(vis && !vis.paused && vis.currentTime > 0.05 && vis.readyState >= 2), vw: vis ? vis.videoWidth : 0, vh: vis ? vis.videoHeight : 0, hasVideo: !!vis, broken, note: (sr && sr.textContent.match(/(was not found|could not load|no live videos)[^.]*\./) || [''])[0] };
        }, h.i);
        if (info && info.drawn && (info.playing || !info.hasVideo || a >= 10)) break;
        if (info && info.note && a >= 4) break;
      }
      row.drawnInMs = Date.now() - t0;
      if (!info) { row.problems.push('the widget box disappeared from the page'); rows.push(row); continue; }
      row.type = info.type || ''; row.drawn = info.drawn;
      if (info.note) row.problems.push(info.note.trim());
      if (!info.drawn) {
        const cfg0 = await widgetConfig(h.widget); const dev = (cfg0 && cfg0.widget && cfg0.widget.overrides && cfg0.widget.overrides.deviceOnly) || {}; const vids0 = (cfg0 && cfg0.videos) || [];
        const here = mobile ? 'mobile' : 'desktop';
        const hiddenHere = vids0.length && vids0.every((v) => dev[v.id] && dev[v.id] !== here);
        if (hiddenHere) row.warnings.push('this widget is set to show on the other device only, so nothing is expected here');
        else if (!info.note) row.problems.push('nothing appeared (no video tile was drawn)');
        rows.push(row); continue;
      }
      const banner = row.type === 'banner' || row.type === 'section';
      if (banner) {
        row.playing = info.playing;
        if (!info.playing) (row.type === 'section' ? row.warnings : row.problems).push('the video is not playing' + (info.hasVideo ? '' : ' (no video found)'));
        // expected shape: from the widget's own settings; "auto" follows the video itself
        const cfg = await widgetConfig(h.widget); const b = cfg && cfg.settings && cfg.settings.banner || {};
        const f = cfg && cfg.settings && cfg.settings.feature || {};
        const raw = row.type === 'section' ? (mobile ? f.shapeMobile : f.shapeDesktop) : (mobile ? b.aspectPortrait : b.aspectLandscape);
        const mode = mobile ? (b.heightModeMobile || b.heightMode) : (b.heightModeDesktop || b.heightMode);
        const actual = info.tileH ? info.tileW / info.tileH : 0; row.actual = actual ? actual.toFixed(2) + ':1' : '';
        if (mode === 'fixed' && row.type === 'banner') { row.expected = 'fixed height'; row.shapeOk = info.tileH > 40; }
        else {
          let want = ratioOf(raw); if (raw === 'auto' || !want) want = info.vh ? Math.min(2.4, Math.max(0.5, info.vw / info.vh)) : 0;
          row.expected = want ? want.toFixed(2) + ':1' : '';
          row.shapeOk = want ? Math.abs(actual - want) / want <= 0.06 : info.tileH > 40;
          if (want && !row.shapeOk) row.problems.push(`the banner is ${row.actual} but should be ${row.expected}`);
        }
      } else { row.shapeOk = info.tileW > 20 && info.tileH > 20; if (!row.shapeOk) row.problems.push('the video tiles have no size'); }
      if (info.broken) row.problems.push(`${info.broken} thumbnail image(s) failed to load`);
      if (row.drawnInMs > 9000) row.warnings.push(`slow to appear (${Math.round(row.drawnInMs / 1000)} s)`);
      rows.push(row);
    }
    if (!hosts.length) rows.push({ url: pick.url, path: pick.path, device, widget: '(none)', type: '', drawn: false, playing: null, shapeOk: null, expected: '', actual: '', problems: ['the Loopy widget was in the page source but is missing after the page loaded'], warnings: [] });
    for (const r of rows) { if (loopyFails.length) r.warnings.push('failed Loopy requests: ' + [...new Set(loopyFails)].slice(0, 2).join(', ')); if (consoleErrs.length) r.warnings.push('browser error: ' + consoleErrs[0]); }
    return rows;
  } catch (e) {
    return [{ url: pick.url, path: pick.path, device, widget: '(page)', type: '', drawn: false, playing: null, shapeOk: null, expected: '', actual: '', problems: ['the page did not load: ' + (e.message || e).toString().slice(0, 100)], warnings: [] }];
  } finally { await page.close().catch(() => {}); }
}

async function main() {
  // default: the fixed list of important pages (tools/site-pages.json). --discover also reads the whole sitemap.
  let fixed = []; try { fixed = JSON.parse(readFileSync(join(ROOT, 'tools', 'site-pages.json'), 'utf8')).pages || []; } catch { /* no list */ }
  const urls = ONLY ? [SITE + ONLY] : (fixed.length && !process.argv.includes('--discover')) ? fixed.map((u) => u.replace(/^http:/, 'https:')) : await sitemapUrls();
  if (!urls.length) { notes.push('The sitemap could not be read, so no pages were found.'); }
  const found = await scan(urls);
  const { picks, groups } = choose(found);
  const missing = (ONLY || process.argv.includes('--discover')) ? [] : urls.filter((u) => !found.some((f) => f.url === u));
  const widgetsSeen = [...new Set(found.flatMap((f) => f.widgets))];
  const details = [];
  if (picks.length) {
    const puppeteer = (await import('puppeteer-core')).default || (await import('puppeteer-core'));
    const browser = await puppeteer.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const jobs = picks.flatMap((p) => [[p, 'phone'], [p, 'computer']]);
    let k = 0;
    await Promise.all(Array.from({ length: 1 }, async () => { while (k < jobs.length) { const [p, d] = jobs[k++]; details.push(...(await checkPage(browser, p, d))); } }));
    await browser.close();
  }
  for (const u of missing) details.push({ url: u, path: u.replace(SITE, '') || '/', device: 'server', widget: '(none)', type: '', drawn: false, playing: null, shapeOk: null, expected: 'a Loopy banner', actual: 'none found', problems: ['this page has no Loopy banner, or could not be opened'], warnings: [] });
  details.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)) || a.device.localeCompare(b.device));
  const problems = details.reduce((n, r) => n + r.problems.length, 0);
  const warns = details.reduce((n, r) => n + r.warnings.length, 0);
  const status = problems ? 'fail' : (warns || notes.length) ? 'warn' : 'ok';
  const summary = { sitemapPages: urls.length, pagesWithLoopy: found.length, layouts: groups, pagesOpened: picks.length, widgets: widgetsSeen.length, widgetIds: widgetsSeen, warnings: warns, notes };
  const report = { at: Date.now(), status, pages: picks.length, failures: problems, durationS: Math.round((Date.now() - started) / 1000), summary, details };

  // keep it small enough to store: problem rows first, then the rest
  const slim = [...details.filter((r) => r.problems.length), ...details.filter((r) => !r.problems.length)];
  while (JSON.stringify(slim).length > 85000) slim.pop();
  const stored = { ...report, details: slim };

  const dir = join(homedir(), 'Downloads', 'loopy-site-checks'); mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const md = [`# Site check ${new Date().toLocaleString()}`, '', `Result: **${status.toUpperCase()}**. ${picks.length} page layouts opened (of ${found.length} pages that have Loopy, out of ${urls.length} in the sitemap). ${problems} problem(s), ${warns} warning(s). Took ${report.durationS} s.`, '',
    ...(notes.length ? ['## Notes', ...notes.map((n) => '- ' + n), ''] : []),
    '## Problems', ...(problems ? details.filter((r) => r.problems.length).map((r) => `- [${r.device}] ${r.path} (${r.widget}): ${r.problems.join('; ')}`) : ['None.']), '',
    '## Every check', '| Page | Device | Widget | Type | Shown | Plays | Shape |', '|---|---|---|---|---|---|---|',
    ...details.map((r) => `| ${r.path} | ${r.device} | ${r.widget} | ${r.type} | ${r.drawn ? 'yes' : 'NO'} | ${r.playing === null ? '-' : r.playing ? 'yes' : 'NO'} | ${r.shapeOk === null ? '-' : r.shapeOk ? 'ok ' + r.actual : 'BAD ' + r.actual + ' want ' + r.expected} |`)].join('\n');
  writeFileSync(join(dir, `${stamp}.md`), md);

  if (!DRY) {
    const q = (s) => "'" + s.replace(/'/g, "''") + "'";
    const sql = `INSERT INTO site_checks (at,status,pages,failures,duration_s,summary,details) VALUES (${stored.at},${q(stored.status)},${stored.pages},${stored.failures},${stored.durationS},${q(JSON.stringify(stored.summary))},${q(JSON.stringify(stored.details))});`;
    const f = join(dir, '.last.sql'); writeFileSync(f, sql);
    try { execFileSync('npx', ['wrangler', 'd1', 'execute', 'tuco-video', '--remote', '--file', f], { cwd: join(ROOT, 'worker'), stdio: 'pipe' }); console.log('Saved to Loopy (Site checks page).'); }
    catch (e) { console.log('Could not save to Loopy: ' + String(e.stderr || e.message).slice(0, 200)); }
  }
  console.log(`RESULT ${status.toUpperCase()} | ${picks.length} layouts opened, ${found.length} pages with Loopy of ${urls.length} | ${problems} problem(s), ${warns} warning(s) | ${report.durationS}s`);
  details.filter((r) => r.problems.length).slice(0, 12).forEach((r) => console.log(` - [${r.device}] ${r.path} ${r.widget}: ${r.problems.join('; ')}`));
  console.log('Report file: ' + join(dir, `${stamp}.md`));
}
main().catch((e) => { console.error('Check failed to run:', e); process.exit(1); });
