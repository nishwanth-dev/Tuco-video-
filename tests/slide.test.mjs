// Slide video: one video that fills a slot in the theme exactly (the first slide of a product slider). Needs Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME, haveChrome, startPageServer, seedVideos, api, B, PORT } from './lib-browser.mjs';

let browser, srv, vids;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test.before(async () => {
  if (!haveChrome) return;
  srv = await startPageServer(); vids = await seedVideos(2);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });
const skip = { skip: !haveChrome && 'Chrome is not installed' };

// The same box the theme gives the slide (tall 9:16, clipped), with the widget placed inside it
async function open({ overrides = {}, videoIds = null, width = 190, viewport = { width: 412, height: 823 }, mobile = true } = {}) {
  const w = await api('POST', '/api/widgets', { name: 'QA slide ' + Math.random().toString(36).slice(2, 7), type: 'slide', page: 'home', scope: 'custom', enabled: true, videoIds: videoIds || [vids[0]], overrides });
  assert.ok(w.status < 300, JSON.stringify(w.json));
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160))); page.on('console', (m) => { if (/Loopy|error|warn/i.test(m.type() + m.text())) errs.push(m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${PORT}/slide?w=${w.json.id}&width=${width}`, { waitUntil: 'load' });
  await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); return h && h.shadowRoot && h.shadowRoot.querySelector('.tile video'); }, { timeout: 10000 }).catch(async (e) => { const st = await page.evaluate(() => { const h = document.querySelector('[data-tuco-video]'); return h ? { sr: !!h.shadowRoot, html: h.shadowRoot ? h.shadowRoot.innerHTML.slice(0, 200) : '', style: h.getAttribute('style') } : 'no host'; }); throw new Error('widget did not draw: ' + JSON.stringify(st) + ' errors: ' + errs.join(' | ')); });
  await sleep(1800);
  return { page, id: w.json.id };
}
const read = (page) => page.evaluate(() => { const box = document.querySelector('.box').getBoundingClientRect(); const sr = document.querySelector('[data-tuco-video]').shadowRoot; const t = sr.querySelector('.tile'); const v = t.querySelector('video'); const tb = t.getBoundingClientRect(); const cs = getComputedStyle(v); return { box: [Math.round(box.width), Math.round(box.height)], tile: [Math.round(tb.width), Math.round(tb.height)], playing: !v.paused && v.readyState >= 2, fit: cs.objectFit, pos: cs.objectPosition, radius: getComputedStyle(t).borderTopLeftRadius, cta: !!sr.querySelector('.cta'), dots: !!sr.querySelector('.dots'), vid: v.getAttribute('data-id') }; });

test('slide video: fills the slot exactly on a phone-size slide and on a computer-size slide, and plays', skip, async () => {
  for (const [width, vp, mobile] of [[190, { width: 412, height: 823 }, true], [325, { width: 1440, height: 900 }, false]]) {
    const { page } = await open({ width, viewport: vp, mobile });
    try { const r = await read(page); assert.deepEqual(r.tile, r.box, `the video fills the ${width}px slide: ${JSON.stringify(r)}`); assert.ok(r.playing); assert.equal(r.fit, 'cover'); assert.equal(r.radius, '0px'); assert.ok(!r.cta && !r.dots, 'no banner button or dots'); } finally { await page.close(); }
  }
});

test('slide video: the shape is always the tall slide, whatever banner shape was saved, and fit, crop and corners follow the widget settings', skip, async () => {
  const wild = await open({ overrides: { banner: { aspectLandscape: '2/1', aspectPortrait: '16/9', heightModeDesktop: 'fixed', heightModeMobile: 'fixed', desktopHeight: 300, showCta: true, showDots: true } } });
  try { const r = await read(wild.page); assert.deepEqual(r.tile, r.box, 'a saved wide shape or fixed height cannot change the slide: ' + JSON.stringify(r)); assert.ok(!r.cta && !r.dots); } finally { await wild.page.close(); }
  const adj = await open({ overrides: { banner: { fitMobile: 'contain', fitDesktop: 'contain', focusMobile: 'top', focusDesktop: 'top', radiusMobile: 16, radiusDesktop: 16 } } });
  try { const r = await read(adj.page); assert.equal(r.fit, 'contain', 'show the whole video'); assert.match(r.pos, /50% 0%|center top/, 'keeps the top'); assert.equal(r.radius, '16px', 'rounded corners'); assert.deepEqual(r.tile, r.box); } finally { await adj.page.close(); }
});

test('slide video: a different video on phones and on computers works the same way as for banners', skip, async () => {
  const ov = { deviceOnly: { [vids[0]]: 'desktop', [vids[1]]: 'mobile' } };
  const phone = await open({ overrides: ov, videoIds: [vids[0], vids[1]] });
  try { const rp = await read(phone.page); assert.equal(rp.vid, vids[1], 'the phone video on a phone (videos: ' + vids.join(',') + ' shown: ' + rp.vid + ')'); } finally { await phone.page.close(); }
  const desk = await open({ overrides: ov, videoIds: [vids[0], vids[1]], width: 325, viewport: { width: 1440, height: 900 }, mobile: false });
  try { assert.equal((await read(desk.page)).vid, vids[0], 'the desktop video on a computer'); } finally { await desk.page.close(); }
});

test('slide video: the API accepts it and keeps it separate from the other widget types', async () => {
  const w = await api('POST', '/api/widgets', { name: 'QA slide api', type: 'slide', page: 'collection', scope: 'custom', videoIds: [vids ? vids[0] : 'x'], overrides: { banner: { fitMobile: 'cover', radiusDesktop: 12 } } });
  assert.ok(w.status < 300, JSON.stringify(w.json));
  assert.equal((await api('POST', '/api/widgets', { name: 'bad', type: 'slide', page: 'home', scope: 'custom', videoIds: [], overrides: { banner: { fitMobile: 'stretch' } } })).status, 400, 'bad settings are still refused');
  assert.equal((await api('POST', '/api/widgets', { name: 'bad', type: 'slidee', page: 'home' })).status, 400);
  await api('DELETE', '/api/widgets/' + w.json.id);
});
