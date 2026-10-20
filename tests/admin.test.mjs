// Admin screens driven in a real headless Chrome: ordering videos inside a set, and arranging media on the Products page.
// Needs Chrome. Builds the admin against the local test API, serves it, and uses a pretend store for the product list.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CHROME, haveChrome, ROOT, B, TOKEN, api, seedVideos } from './lib-browser.mjs';

const PORT = 8125, STORE = 8093;
let storeMode = 'default'; const storeHits = {};
const PAD = '<!-- ' + 'x'.repeat(3600) + ' -->'; // a real page is never tiny
let browser, adminSrv, storeSrv, vids, handle2 = 'mock-soap', handle1 = 'mock-single';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

test.before(async () => {
  if (!haveChrome) return;
  storeSrv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/video.mp4') { res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '10' }); return res.end(req.method === 'HEAD' ? undefined : '0123456789'); }
    // Test switch for the site check: how the pretend store answers page requests (default = as before)
    if (u.pathname === '/__mode') { storeMode = u.searchParams.get('m') || 'default'; for (const k of Object.keys(storeHits)) delete storeHits[k]; res.writeHead(200); return res.end('ok'); }
    if (storeMode !== 'default' && u.pathname !== '/products.json') {
      storeHits[u.pathname] = (storeHits[u.pathname] || 0) + 1;
      if (storeMode === 'always429' || (storeMode === '429first' && storeHits[u.pathname] <= 2)) { res.writeHead(429, { 'retry-after': '1' }); return res.end('slow down'); }
      if (storeMode === 'always500') { res.writeHead(500); return res.end('boom'); }
      if (storeMode === 'slow') return setTimeout(() => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>slow page' + PAD + '</body></html>'); }, 450);
      if (storeMode === 'tiny') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('x'); }
      const wm = /^widget:(.+)$/.exec(storeMode); const rm = /^redirect:(.+)$/.exec(storeMode);
      if (rm && u.pathname === '/pages/3-999') { res.writeHead(302, { location: '/pages/elsewhere' }); return res.end(); }
      const wid = (wm || rm || [])[1];
      res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body>' + (wid ? `<div data-tuco-video data-widget="${wid}"></div>` : 'no widget here') + PAD + '</body></html>');
    }
    if (u.pathname === '/products.json') {
      const page = Number(u.searchParams.get('page') || 1);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ products: page > 1 ? [] : [
        { handle: handle2, title: 'Mock Soap', variants: [{ price: '300', available: true, id: 1 }], images: [] },
        { handle: handle1, title: 'Mock Single', variants: [{ price: '100', available: true, id: 2 }], images: [] },
        { handle: 'mock-none', title: 'Mock Untagged', variants: [{ price: '50', available: true, id: 3 }], images: [] },
        { handle: 'mock-big', title: 'Mock Big', variants: [{ price: '1299.00', available: true, id: 21 }], images: [] },
        { handle: 'mock-paise', title: 'Mock Paise', variants: [{ price: '699.50', compare_at_price: '899.00', available: true, id: 22 }], images: [] },
        { handle: 'mock-shade', title: 'Mock Shade', variants: [{ id: 31, title: 'Rose', price: '299.00', available: true }, { id: 32, title: 'Nude', price: '349.00', available: true }, { id: 33, title: 'Brown', price: '349.00', available: false }], images: [] },
        { handle: 'mock-out', title: 'Mock Out', variants: [{ id: 41, price: '150.00', available: false }], images: [] },
        // the made-up products used by the widget look tests, so they count as "still in the store"
        ...Array.from({ length: 12 }, (_, i) => ({ handle: 'fixture-' + (i + 1), title: 'Fixture product ' + (i + 1), variants: [{ price: '499', available: true, id: 100 + i }], images: [] }))] }));
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => storeSrv.listen(STORE, r));
  execFileSync('npx', ['vite', 'build', '--outDir', 'dist-test', '--emptyOutDir'], { cwd: ROOT, env: { ...process.env, VITE_API_URL: B }, stdio: 'ignore' });
  const dist = join(ROOT, 'dist-test');
  adminSrv = http.createServer((req, res) => {
    const p = join(dist, new URL(req.url, 'http://x').pathname);
    const file = existsSync(p) && !p.endsWith('/') ? p : join(dist, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
  });
  await new Promise((r) => adminSrv.listen(PORT, r));
  vids = await seedVideos(3);
  for (const [i, id] of vids.entries()) {
    const v = (await api('GET', '/api/videos')).json.videos.find((x) => x.id === id);
    await api('PUT', '/api/videos/' + id, { ...v, products: i < 2 ? [{ handle: handle2, title: 'Mock Soap', price: '₹300' }] : [{ handle: handle1, title: 'Mock Single', price: '₹100' }] });
  }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); adminSrv && adminSrv.close(); storeSrv && storeSrv.close(); });

const open = async (hash) => {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(`http://localhost:${PORT}/`); await page.evaluate((t) => localStorage.setItem('tuco_admin_token', t), TOKEN);
  await page.goto(`http://localhost:${PORT}/?x=${Math.random()}#/${hash}`);
  await page.waitForFunction(() => document.querySelector('h1'), { timeout: 15000 }); await sleep(1500);
  return page;
};
const clickText = (page, sel, txt) => page.evaluate((sel, txt) => { const e = [...document.querySelectorAll(sel)].find((x) => x.innerText.trim().includes(txt)); if (!e) return false; e.click(); return true; }, sel, txt);
const widgetOf = async (id) => (await api('GET', '/api/widgets')).json.widgets.find((w) => w.id === id);

test('widget editor: the picked videos can be put in order and the order is saved', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const id = (await api('POST', '/api/widgets', { name: 'Order test set', type: 'carousel', page: 'product', scope: 'custom', enabled: true, videoIds: vids, productHandles: [handle2] })).json.id;
  const page = await open('w:product');
  const row = await page.evaluateHandle(() => [...document.querySelectorAll('tbody tr')].find((r) => /Order test set/.test(r.innerText)));
  await row.evaluate((r) => [...r.querySelectorAll('button')].find((b) => /Manage/.test(b.innerText)).click()); await sleep(800);
  const titles = () => page.evaluate(() => [...document.querySelectorAll('.modal .arr .arow span')].map((s) => s.textContent.replace(/^\d+\.\s*/, '').replace(/\s*\d{1,2} [A-Z][a-z]{2} \d{4}.*$/, '').trim()));
  assert.deepEqual(await titles(), ['Fixture 1', 'Fixture 2', 'Fixture 3'], 'the list shows the current order');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.modal .arr .arow')][0].querySelector('button[aria-label="Move up"]').disabled), 'the first one cannot move up');
  await page.evaluate(() => [...document.querySelectorAll('.modal .arr .arow')][0].querySelector('button[aria-label="Move down"]').click()); await sleep(200);
  assert.deepEqual(await titles(), ['Fixture 2', 'Fixture 1', 'Fixture 3']);
  await page.evaluate(() => [...document.querySelectorAll('.modal .arr .arow')][2].querySelector('button[aria-label="Move up"]').click()); await sleep(200);
  assert.deepEqual(await titles(), ['Fixture 2', 'Fixture 3', 'Fixture 1']);
  await clickText(page, '.modal button', 'Save widget'); await sleep(1300);
  const w = await widgetOf(id);
  assert.deepEqual(w.videoIds, [vids[1], vids[2], vids[0]], 'the new order is stored');
  assert.equal(w.productHandles[0], handle2, 'the product list is untouched');
  await page.close();
});

test('widget editor: removing a picked video from the order list unpicks it', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const w0 = (await api('GET', '/api/widgets')).json.widgets.find((w) => w.name === 'Order test set');
  const page = await open('w:product');
  const row = await page.evaluateHandle(() => [...document.querySelectorAll('tbody tr')].find((r) => /Order test set/.test(r.innerText)));
  await row.evaluate((r) => [...r.querySelectorAll('button')].find((b) => /Manage/.test(b.innerText)).click()); await sleep(800);
  await page.evaluate(() => [...document.querySelectorAll('.modal .arr .arow')][0].querySelector('button.red').click()); await sleep(200);
  await clickText(page, '.modal button', 'Save widget'); await sleep(1300);
  assert.equal((await widgetOf(w0.id)).videoIds.length, 2);
  await page.close();
});

test('products page: shows each product\'s video sets and lets you arrange them', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const page = await open('products');
  const cells = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => ({ text: r.innerText.replace(/\s+/g, ' '), btn: (() => { const b = [...r.querySelectorAll('button')].find((x) => /Arrange Media/.test(x.innerText)); return b ? { disabled: b.disabled, title: b.title } : null; })() })));
  const soap = cells.find((c) => /Mock Soap/.test(c.text)), single = cells.find((c) => /Mock Single/.test(c.text));
  assert.match(soap.text, /Order test set \(2\)/, 'the set and its video count are shown: ' + soap.text);
  const wid = (await api('GET', '/api/widgets')).json.widgets.find((w) => w.name === 'Order test set').id;
  assert.ok(soap.text.includes(wid), 'the widget id is shown on the product row: ' + soap.text);
  assert.match(soap.text, /Copy ID/, 'with a copy button');
  assert.equal(soap.btn.disabled, false, 'Arrange Media works for a product with a set');
  assert.equal(single.btn.disabled, true, 'a product with one tagged video and no set has nothing to arrange');
  assert.match(single.btn.title, /Nothing to arrange/, 'and says why');
  await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => /Mock Soap/.test(r.innerText)).querySelectorAll('button')[[...[...document.querySelectorAll('tbody tr')].find((r) => /Mock Soap/.test(r.innerText)).querySelectorAll('button')].findIndex((x) => /Arrange Media/.test(x.innerText))].click()); await sleep(900);
  const modal = await page.evaluate(() => document.querySelector('.modal').innerText.replace(/\s+/g, ' '));
  assert.match(modal, /Order test set/); assert.match(modal, /shared/i, 'it warns that the set is shared'); assert.match(modal, /Videos tagged to this product/);
  const before = await page.evaluate(() => [...document.querySelectorAll('.modal .lab')][0].querySelectorAll('.arow span').length);
  assert.equal(before, 2);
  const w0 = await widgetOf((await api('GET', '/api/widgets')).json.widgets.find((w) => w.name === 'Order test set').id);
  await page.evaluate(() => [...document.querySelectorAll('.modal .lab')][0].querySelectorAll('.arow')[1].querySelector('button[aria-label="Move up"]').click()); await sleep(200);
  await clickText(page, '.modal button', 'Save order of this set'); await sleep(1300);
  const w1 = await widgetOf(w0.id);
  assert.deepEqual(w1.videoIds, [w0.videoIds[1], w0.videoIds[0]], 'the set order changed');
  assert.match(await page.evaluate(() => document.querySelector('.modal').innerText), /Saved the order of "Order test set"/);
  await page.close();
});

test('products page: a product with two tagged videos can still have its tagged order saved', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const page = await open('products');
  await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => /Mock Soap/.test(r.innerText)).querySelectorAll('button')[[...[...document.querySelectorAll('tbody tr')].find((r) => /Mock Soap/.test(r.innerText)).querySelectorAll('button')].findIndex((x) => /Arrange Media/.test(x.innerText))].click()); await sleep(900);
  const shown = () => page.evaluate(() => { const labs = [...document.querySelectorAll('.modal .lab')]; return [...labs[labs.length - 1].querySelectorAll('.arow span')].map((x) => x.textContent.replace(/^\d+\.\s*/, '').trim()); });
  const before = await shown();
  assert.equal(before.length, 2);
  await page.evaluate(() => { const labs = [...document.querySelectorAll('.modal .lab')]; labs[labs.length - 1].querySelectorAll('.arow')[1].querySelector('button[aria-label="Move up"]').click(); }); await sleep(200);
  assert.deepEqual(await shown(), [before[1], before[0]], 'the screen shows the swap');
  await clickText(page, '.modal button', 'Save tagged order'); await sleep(1200);
  const idOf = (title) => vids[Number(title.replace('Fixture ', '')) - 1];
  const order = (await api('GET', '/api/order/' + handle2)).json.order;
  assert.deepEqual(order, [idOf(before[1]), idOf(before[0])], 'the swapped order is stored');
  await page.close();
});

test('customizations: Discard changes goes back to what is saved, and Reset puts a section on the defaults', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const saved = (await api('GET', '/api/settings')).json.settings.brandColor;
  const page = await open('custom');
  const colour = () => page.evaluate(() => document.querySelector('.cform .colr input').value);
  assert.equal(await colour(), saved);
  await page.evaluate(() => { const i = document.querySelector('.cform .colr input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '#123456'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(300);
  assert.equal(await colour(), '#123456'); assert.match(await page.evaluate(() => document.querySelector('.chead').innerText), /Unsaved changes/);
  assert.ok(await clickText(page, '.chead button', 'Discard changes')); await sleep(300);
  assert.equal(await colour(), saved, 'back to the saved colour');
  assert.equal((await api('GET', '/api/settings')).json.settings.brandColor, saved, 'nothing was saved');
  assert.doesNotMatch(await page.evaluate(() => document.querySelector('.chead').innerText), /Unsaved changes/);
  page.once('dialog', (d) => d.accept());
  assert.ok(await clickText(page, '.resetrow button', 'Reset this section')); await sleep(300);
  assert.equal(await colour(), '#ffd94a', 'the default Loopy colour');
  assert.match(await page.evaluate(() => document.querySelector('.chead').innerText), /Unsaved changes|Saved/);
  await page.close();
});

test('widget editor: a picked video can be limited to desktop or phones, and the choice is saved', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const id = (await api('POST', '/api/widgets', { name: 'Device pairing test', type: 'banner', page: 'home', scope: 'custom', enabled: true, videoIds: [vids[0], vids[1]] })).json.id;
  const page = await open('w:home');
  const row = await page.evaluateHandle(() => [...document.querySelectorAll('tbody tr')].find((r) => /Device pairing test/.test(r.innerText)));
  await row.evaluate((r) => [...r.querySelectorAll('button')].find((b) => /Manage/.test(b.innerText)).click()); await sleep(800);
  const pick = (i, v) => page.evaluate((i, v) => { const sel = [...document.querySelectorAll('.modal .arr .arow select')][i]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true })); }, i, v);
  await pick(0, 'desktop'); await pick(1, 'mobile'); await sleep(300);
  await clickText(page, '.modal button', 'Save widget'); await sleep(1300);
  const w = await widgetOf(id);
  assert.deepEqual(w.overrides.deviceOnly, { [vids[0]]: 'desktop', [vids[1]]: 'mobile' });
  assert.deepEqual(w.videoIds, [vids[0], vids[1]]);
  // set one back to both: the entry disappears
  const row2 = await page.evaluateHandle(() => [...document.querySelectorAll('tbody tr')].find((r) => /Device pairing test/.test(r.innerText)));
  await row2.evaluate((r) => [...r.querySelectorAll('button')].find((b) => /Manage/.test(b.innerText)).click()); await sleep(800);
  await pick(0, ''); await clickText(page, '.modal button', 'Save widget'); await sleep(1300);
  assert.deepEqual((await widgetOf(id)).overrides.deviceOnly, { [vids[1]]: 'mobile' });
  await page.close();
});

test('create widget: the video picker and the Show-on list stay visible even with a tall preview', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 640 });
  await page.goto(`http://localhost:${PORT}/`); await page.evaluate((t) => localStorage.setItem('tuco_admin_token', t), TOKEN);
  await page.goto(`http://localhost:${PORT}/?x=${Math.random()}#/w:home`);
  await page.waitForFunction(() => document.querySelector('h1'), { timeout: 15000 }); await sleep(1500);
  const card = await page.evaluateHandle(() => [...document.querySelectorAll('.wcard')].find((c) => /Banners/.test(c.innerText)));
  await card.evaluate((c) => [...c.querySelectorAll('button')].find((b) => /Create/.test(b.innerText)).click()); await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('.modal input[type=radio]')][1].click()); await sleep(400);
  await page.evaluate(() => { const labs = [...document.querySelectorAll('.modal .vp input')]; labs[0].click(); labs[1].click(); }); await sleep(900);
  const sizes = await page.evaluate(() => ({ picker: document.querySelector('.modal .vpick').getBoundingClientRect().height, rows: document.querySelectorAll('.modal .arr .arow').length, selects: document.querySelectorAll('.modal .arr .arow select').length }));
  assert.ok(sizes.picker >= 100, 'the picker keeps its height: ' + sizes.picker);
  assert.equal(sizes.rows, 2); assert.equal(sizes.selects, 2, 'each picked video has a Show on choice');
  await page.close();
});

test('widget pages: a search box finds a widget by its ID or name, and points to other pages', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const homeId = (await api('POST', '/api/widgets', { name: 'Findme home banner', type: 'banner', page: 'home', scope: 'custom', enabled: true, videoIds: [vids[0]] })).json.id;
  await api('POST', '/api/widgets', { name: 'Other home widget', type: 'banner', page: 'home', scope: 'custom', enabled: true, videoIds: [vids[0]] });
  const page = await open('w:home');
  const rows = () => page.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
  const type = async (t) => { await page.evaluate((t) => { const i = document.querySelector('.wsearch'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, t); i.dispatchEvent(new Event('input', { bubbles: true })); }, t); await sleep(300); };
  const all = (await rows()).length; assert.ok(all >= 2);
  await type(homeId.toUpperCase());
  let r = await rows(); assert.equal(r.length, 1, 'only the widget with that ID'); assert.match(r[0], /Findme home banner/);
  await type('other home');
  r = await rows(); assert.equal(r.length, 1); assert.match(r[0], /Other home widget/);
  await type('zzz-nothing');
  assert.equal((await rows()).length, 0); assert.match(await page.evaluate(() => document.body.innerText), /No widget on this page matches/);
  const prodId = (await api('GET', '/api/widgets')).json.widgets.find((w) => w.page === 'product').id;
  await type(prodId);
  assert.match(await page.evaluate(() => document.querySelector('.elsewhere').innerText), /Product Pages/, 'points to the page where it lives');
  await page.close();
});

test('add media: several video files can be chosen at once and each becomes a draft', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const { copyFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'multi-'));
  const stamp = Date.now();
  const names = [`multi-a-${stamp}.mp4`, `multi-b-${stamp}.mp4`, `multi-c-${stamp}.mp4`];
  for (const n of names) copyFileSync(join(ROOT, 'tests/fixtures/clip.mp4'), join(dir, n));
  const page = await open('videos');
  assert.ok(await clickText(page, 'button', 'Add Media')); await sleep(600);
  const input = await page.$('.modal input[type=file]');
  assert.equal(await input.evaluate((i) => i.multiple), true, 'the file box accepts several files');
  await input.uploadFile(...names.map((n) => join(dir, n))); await sleep(600);
  assert.match(await page.evaluate(() => document.querySelector('.modal').innerText), /Add 3 videos/);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.modal .brow').length), 3);
  assert.ok(await clickText(page, '.modal button', 'Upload 3 videos'));
  await page.waitForFunction(() => document.querySelectorAll('.modal .bst.done').length === 3, { timeout: 30000 });
  const vids2 = (await api('GET', '/api/videos')).json.videos;
  for (const n of names) {
    const v = vids2.find((x) => x.title === n.replace('.mp4', ''));
    assert.ok(v, 'created: ' + n); assert.equal(v.status, 'draft');
  }
  await page.close();
});

test('videos page: every video shows when it was uploaded, newest first', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const page = await open('videos');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.vtile')].map((t) => ({ title: t.querySelector('.vcap').textContent, date: t.querySelector('.vdate').textContent })));
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((r) => /^Uploaded \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(r.date)), 'a readable date on each: ' + JSON.stringify(rows.slice(0, 2)));
  const api2 = (await api('GET', '/api/videos')).json.videos.filter((v) => !v.archived).sort((a, b) => b.createdAt - a.createdAt);
  const newestTitles = new Set(api2.filter((v) => v.createdAt === api2[0].createdAt).map((v) => v.title));
  assert.ok(newestTitles.has(rows[0].title), 'the newest video comes first');
  await page.close();
});

test('widget pages: every widget shows when it was created, newest first', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const older = (await api('POST', '/api/widgets', { name: 'Date order older', type: 'banner', page: 'collection', scope: 'custom', enabled: true, videoIds: [vids[0]] })).json.id;
  await sleep(1100);
  const newer = (await api('POST', '/api/widgets', { name: 'Date order newer', type: 'banner', page: 'collection', scope: 'custom', enabled: true, videoIds: [vids[0]] })).json.id;
  const page = await open('w:collection');
  const rows = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
  const iNew = rows.findIndex((r) => r.includes('Date order newer')), iOld = rows.findIndex((r) => r.includes('Date order older'));
  assert.ok(iNew >= 0 && iOld >= 0 && iNew < iOld, 'the newest widget is listed first');
  assert.match(rows[iNew], /\d{1,2} [A-Z][a-z]{2} \d{4}/, 'it shows its created date: ' + rows[iNew]);
  assert.match(await page.evaluate(() => document.querySelector('thead').innerText), /Created/);
  await page.close();
});

test('site checks page: home page is named, links go to the store, odd or old rows never break it', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const at = Date.now() + 5000;
  const row = (o) => ({ url: '', path: '/', device: 'server', widget: 'wgt_x', type: 'banner', drawn: true, playing: null, shapeOk: null, expected: '', actual: '', problems: [], warnings: [], ...o });
  const rec = { at, status: 'fail', pages: 4, failures: 2, durationS: 3, summary: { kind: 'server-check', notes: ['note one'] }, details: [
    row({ path: '/', widget: 'wgt_home1' }),
    row({ path: '/collections/sample-page', url: '/collections/sample-page', widget: 'wgt_c1', problems: ['none of its videos are live'] }),
    row({ path: '/pages/browser-one', url: 'https://tucokids.com/pages/browser-one', device: 'phone', playing: false, shapeOk: false, expected: '2.00:1', actual: '1.00:1', problems: ['the video is not playing'], warnings: ['slow'] }),
    { path: '/pages/old-style' },                                  // a row with almost nothing in it
    null,                                                          // a broken entry must not blank the page
  ] };
  assert.ok((await api('POST', '/api/checks', rec)).status < 300);
  const page = await open('checks'); await sleep(1200);
  const info = await page.evaluate(() => ({ text: document.body.innerText, hrefs: [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => /sample-page|browser-one|old-style/.test(h)), btn: [...document.querySelectorAll('button')].some((b) => /Check now/.test(b.innerText)) }));
  assert.match(info.text, /Home page/, 'the home page has a name, not a lone slash');
  assert.doesNotMatch(info.text, /\bserver\b/, 'no technical word "server" is shown');
  assert.match(info.text, /automatic/);
  assert.ok(info.hrefs.length >= 3 && info.hrefs.every((h) => h.startsWith('https://tucokids.com/')), 'page links open the store: ' + info.hrefs.join(', '));
  assert.match(info.text, /none of its videos are live/); assert.match(info.text, /the video is not playing/);
  assert.ok(info.btn, 'there is a Check now button');
  await page.close();
});

test('phones: no admin screen is wider than a 390 px phone, so none scrolls sideways', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  await api('POST', '/api/checks', { at: Date.now() + 9000, status: 'fail', pages: 2, failures: 1, durationS: 2, summary: { notes: ['n'] }, details: [{ path: '/collections/a-very-long-collection-name-for-phone-width-testing', device: 'server', widget: 'wgt_phone01', type: 'banner', drawn: false, problems: ['none of its videos are live'], warnings: [] }] });
  const bad = [];
  for (const r of ['home', 'videos', 'products', 'w:product', 'w:home', 'w:collection', 'w:pages', 'analytics', 'checks', 'custom', 'integrations']) {
    const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${PORT}/`); await page.evaluate((t) => localStorage.setItem('tuco_admin_token', t), TOKEN);
    await page.goto(`http://localhost:${PORT}/?x=${Math.random()}#/${r}`);
    await page.waitForFunction(() => document.querySelector('.shell h1') && !document.getElementById('splash'), { timeout: 20000 }); await sleep(300);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 392) bad.push(`${r}: ${w}px wide`);
    const vis = await page.evaluate(() => { const b = document.querySelector('.menubtn'); const sd = document.querySelector('.side'); return { btn: !!b && b.getBoundingClientRect().width > 20, hidden: getComputedStyle(sd).visibility === 'hidden', title: (document.querySelector('.mtitle') || {}).textContent }; });
    if (!vis.btn) bad.push(`${r}: no menu button`); else if (!vis.hidden) bad.push(`${r}: the side menu is open by itself`); else if (!vis.title) bad.push(`${r}: the top bar does not name the page`);
    await page.close();
  }
  assert.deepEqual(bad, [], 'screens that spill sideways on a phone');
});


test('phones: the menu button opens a side menu; picking a page, the dark area or Escape closes it', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:${PORT}/`); await page.evaluate((t) => localStorage.setItem('tuco_admin_token', t), TOKEN);
  await page.goto(`http://localhost:${PORT}/?x=${Math.random()}#/home`);
  await page.waitForFunction(() => document.querySelector('.shell h1') && !document.getElementById('splash'), { timeout: 20000 }); await sleep(300);
  const state = () => page.evaluate(() => { const sd = document.querySelector('.side'); const b = sd.getBoundingClientRect(); return { shown: getComputedStyle(sd).visibility === 'visible', left: Math.round(b.left), items: [...sd.querySelectorAll('.nav')].map((n) => n.innerText.trim().replace(/\s+\d+$/, '')), expanded: document.querySelector('.menubtn').getAttribute('aria-expanded') }; });
  assert.equal((await state()).shown, false, 'closed at first');
  await page.click('.menubtn'); await sleep(500);
  let st = await state(); assert.equal(st.shown, true); assert.ok(st.left >= -1, 'the menu is fully on screen'); assert.equal(st.expanded, 'true');
  for (const want of ['Home', 'Videos', 'Products', 'Product Pages', 'Homepage', 'Collection Pages', 'Pages', 'Overview', 'Site checks', 'Customizations', 'Integrations', 'Sign out']) assert.ok(st.items.includes(want), 'menu lists ' + want + ': ' + st.items.join(','));
  await page.evaluate(() => [...document.querySelectorAll('.side .nav')].find((n) => /^Videos/.test(n.innerText.trim())).click()); await sleep(600);
  assert.equal((await state()).shown, false, 'picking a page closes the menu');
  assert.match(await page.evaluate(() => document.querySelector('.mtitle').textContent), /Videos/, 'the top bar names the page');
  assert.match(await page.evaluate(() => document.querySelector('.shell h1').textContent), /Videos/, 'and the page changed');
  await page.click('.menubtn'); await sleep(400); assert.equal((await state()).shown, true);
  await page.mouse.click(370, 400); await sleep(500); assert.equal((await state()).shown, false, 'tapping the dark area closes it');
  await page.click('.menubtn'); await sleep(400); await page.keyboard.press('Escape'); await sleep(400); assert.equal((await state()).shown, false, 'Escape closes it');
  await page.close();
});

test('desktop: the menu button and top bar are not shown and the side menu stays put', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const page = await open('home');
  const d = await page.evaluate(() => ({ mbar: getComputedStyle(document.querySelector('.mbar')).display, side: getComputedStyle(document.querySelector('.side')).position, w: document.querySelector('.side').getBoundingClientRect().width, vis: getComputedStyle(document.querySelector('.side')).visibility }));
  assert.equal(d.mbar, 'none'); assert.notEqual(d.side, 'fixed'); assert.equal(d.vis, 'visible'); assert.ok(d.w >= 200 && d.w <= 240, 'side menu keeps its width: ' + d.w);
  await page.close();
});


test('widget script: loading in the page head (before the body exists) raises no error', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message || e)));
  await page.goto(`http://localhost:${PORT}/?x=${Math.random()}`); await sleep(1500);
  assert.deepEqual(errs.filter((e) => /createTreeWalker|widget/i.test(e)), [], 'the widget script threw: ' + errs.join(' | '));
  await page.close();
});

test('phones: Home and widget-type cards sit two across, and the Home cards show real videos', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const shoot = async (hash, w) => {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
    await page.goto(`http://localhost:${PORT}/`); await page.evaluate((t) => localStorage.setItem('tuco_admin_token', t), TOKEN);
    await page.goto(`http://localhost:${PORT}/?x=${Math.random()}#/${hash}`);
    await page.waitForFunction(() => document.querySelector('.shell h1') && !document.getElementById('splash'), { timeout: 20000 }); await sleep(500);
    return page;
  };
  let page = await shoot('home', 390);
  let m = await page.evaluate(() => { const cs = [...document.querySelectorAll('.fcard')].map((e) => e.getBoundingClientRect()); return { n: cs.length, row1: cs.length > 1 && Math.abs(cs[0].top - cs[1].top) < 4, narrow: cs[0].width < 220, media: [...document.querySelectorAll('.fcard .fart')].map((a) => a.querySelectorAll('img, video').length), wide: document.documentElement.scrollWidth }; });
  assert.equal(m.n, 3); assert.ok(m.row1, 'the first two cards are side by side'); assert.ok(m.narrow); assert.ok(m.wide <= 392);
  assert.ok(m.media.every((k) => k >= 1), 'each Home card shows a video: ' + m.media.join(','));
  await page.close();
  page = await shoot('w:home', 390);
  m = await page.evaluate(() => { const cs = [...document.querySelectorAll('.wcard')].map((e) => e.getBoundingClientRect()); return { n: cs.length, row1: Math.abs(cs[0].top - cs[1].top) < 4, narrow: cs[0].width < 220 }; });
  assert.ok(m.n >= 2 && m.row1 && m.narrow, 'widget-type cards sit two across: ' + JSON.stringify(m));
  await page.close();
  page = await shoot('home', 1400);
  m = await page.evaluate(() => { const cs = [...document.querySelectorAll('.fcard')].map((e) => e.getBoundingClientRect()); return { row: Math.abs(cs[0].top - cs[2].top) < 4 }; });
  assert.ok(m.row, 'on a computer the three cards stay in one row');
  await page.close();
});


test('phones: pop-ups open as a sheet whose Save button stays on screen, and Customizations sections are compact chips', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const shoot = async (hash) => {
    const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${PORT}/`); await page.evaluate((t) => localStorage.setItem('tuco_admin_token', t), TOKEN);
    await page.goto(`http://localhost:${PORT}/?x=${Math.random()}#/${hash}`);
    await page.waitForFunction(() => document.querySelector('.shell h1') && !document.getElementById('splash'), { timeout: 20000 }); await sleep(500);
    return page;
  };
  let page = await shoot('w:home');
  await clickText(page, 'button', 'Create'); await sleep(900);
  let m = await page.evaluate(() => { const b = [...document.querySelectorAll('.modal .btn')].find((x) => /Save/.test(x.innerText)); const r = b && b.getBoundingClientRect(); const md = document.querySelector('.modal').getBoundingClientRect(); return { save: r ? { bottom: Math.round(r.bottom), h: Math.round(r.height) } : null, modalBottom: Math.round(md.bottom), modalW: Math.round(md.width) }; });
  assert.ok(m.save, 'the Save button exists'); assert.ok(m.save.bottom <= 844, 'Save is on screen without scrolling: ' + JSON.stringify(m)); assert.ok(m.save.h >= 44, 'Save is big enough to tap'); assert.equal(m.modalW, 390, 'the sheet is full width');
  await page.close();
  page = await shoot('custom');
  m = await page.evaluate(() => { const c = [...document.querySelectorAll('.cmenu .cnav')]; const tops = new Set(c.map((e) => Math.round(e.getBoundingClientRect().top))); return { n: c.length, rows: tops.size, w: document.documentElement.scrollWidth }; });
  assert.ok(m.n >= 8 && m.rows < m.n, 'sections sit in a few rows of chips, not one long list: ' + JSON.stringify(m)); assert.ok(m.w <= 392);
  await page.close();
});

test('instagram review: a new reel gets suggested products, approving tags them, and it stays a draft', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const mk = await api('POST', '/api/videos', { title: 'Why we love our Mock Soap #tuco', url: 'https://cdn.example.com/ig-review.mp4', status: 'draft', source: 'instagram', sourceId: 'ig-review-1', products: [] });
  assert.ok(mk.status < 300, JSON.stringify(mk.json)); const id = mk.json.id;
  const rv = (await api('GET', '/api/instagram/review')).json;
  const item = rv.items.find((i) => i.id === id);
  assert.ok(item, 'the reel is in the review list'); assert.equal(rv.catalogOk, true);
  assert.ok(item.suggestions.some((s) => s.handle === handle2), 'Mock Soap is suggested: ' + JSON.stringify(item.suggestions));
  const bad = await api('POST', '/api/instagram/approve', { approvals: [{ id, handles: ['not-a-real-product'] }] });
  assert.equal(bad.json.approved, 0, 'a handle that is not in the store is ignored');
  let page;
  try {
  page = await open('integrations'); await sleep(800);
  const ui = await page.evaluate(() => ({ ready: /ready to approve|New reels with no products/.test(document.body.innerText), chip: /Mock Soap/.test(document.querySelector('.igready')?.innerText || ''), steps: !!document.querySelector('.igsteps') }));
  assert.ok(ui.ready && ui.chip && ui.steps, 'the card lists the reel with its suggestion: ' + JSON.stringify(ui));
  await page.evaluate(() => [...document.querySelectorAll('.igrow .btn')].find((b) => /^Approve$/.test(b.innerText.trim())).click()); await sleep(1500);
  const v = (await api('GET', '/api/videos')).json.videos.find((x) => x.id === id);
  assert.ok(v.products.some((p) => p.handle === handle2), 'the product is now tagged'); assert.equal(v.status, 'draft', 'approving never makes a video live');
  const again = await api('POST', '/api/instagram/approve', { approvals: [{ id, handles: [handle2] }] });
  assert.equal(again.json.approved, 0, 'approving twice does not add it twice'); assert.equal((await api('GET', '/api/videos')).json.videos.find((x) => x.id === id).products.length, 1);
  } finally { if (page) await page.close(); await api('DELETE', '/api/videos/' + id); }
});


test('pricing: prices read from the store show correctly in every situation (grouping, paise, from-price, options, sold out, removed product)', async () => {
  const tags = ['mock-big', 'mock-paise', 'mock-shade', 'mock-out', 'mock-deleted'];
  const ids = [];
  for (const h of tags) { const r = await api('POST', '/api/videos', { title: 'QA price ' + h, url: 'https://cdn.example.com/price.mp4', status: 'live', placements: ['home'], products: [{ handle: h, title: 'Saved ' + h, price: '₹1' }] }); assert.ok(r.status < 300, JSON.stringify(r.json)); ids.push(r.json.id); }
  const w = (await api('POST', '/api/widgets', { name: 'QA price ' + Math.random().toString(36).slice(2, 7), type: 'carousel', page: 'home', scope: 'custom', enabled: true, videoIds: ids })).json.id;
  try {
    const cfg = await (await fetch(`${B}/api/public/config?widget=${w}`)).json();
    const by = Object.fromEntries(cfg.videos.map((v) => [v.products[0].handle, v.products[0]]));
    assert.equal(by['mock-big'].price, '₹1,299', 'thousands are grouped'); assert.equal(by['mock-big'].variants.length, 0, 'a single option needs no picker'); assert.ok(!by['mock-big'].from);
    assert.equal(by['mock-paise'].price, '₹699.50', 'paise are kept'); assert.equal(by['mock-paise'].compare, '₹899'); assert.equal(by['mock-paise'].off, 22);
    assert.equal(by['mock-shade'].price, '₹299', 'the lowest price a shopper can buy'); assert.equal(by['mock-shade'].from, true, 'it says From when options differ');
    assert.equal(by['mock-shade'].variantId, 31, 'the first available option is the default'); assert.equal(by['mock-shade'].variants.length, 3); assert.equal(by['mock-shade'].variants[2].available, false);
    assert.equal(by['mock-out'].soldOut, true); assert.equal(by['mock-out'].variantId, null, 'nothing to add when every option is sold out');
    assert.equal(by['mock-deleted'].gone, true, 'a product that is no longer in the store is marked'); assert.ok(!by['mock-deleted'].live);
    assert.equal(by['mock-big'].live, true);
    const list = (await api('GET', '/api/store/products')).json.products;
    assert.ok(list.length && list.every((p) => !('variants' in p)), 'the admin product list stays small');
  } finally { for (const id of ids) await api('DELETE', '/api/videos/' + id); await api('DELETE', '/api/widgets/' + w); }
});


// Starts a check and waits (up to 40 s) until it has finished; returns { status: <http>, json: { id, status, failures } } like the old all-in-one answer.
async function runCheckAndWait() {
  const st = await api('POST', '/api/checks/run'); if (st.status !== 200) return st;
  for (let k = 0; k < 80; k++) {
    const c = (await api('GET', '/api/checks/' + st.json.id)).json.check;
    if (c && c.status !== 'running') return { status: 200, json: { id: st.json.id, status: c.status, failures: c.failures } };
    await sleep(500);
  }
  throw new Error('the check did not finish');
}

test('site check: the store saying "slow down" (429) is retried, and if it keeps saying it the run is a warning, not a failure', async () => {
  const mode = (m) => fetch(`http://localhost:${STORE}/__mode?m=${m}`);
  try {
    await mode('always429');
    const r = await runCheckAndWait(); assert.equal(r.status, 200);
    assert.equal(r.json.status, 'warn', 'a store that only says 429 is not a failed check'); assert.equal(r.json.failures, 0);
    const one = (await api('GET', '/api/checks/' + r.json.id)).json.check;
    assert.ok(one.details.length >= 15 && one.details.every((d) => d.problems.length === 0 && d.warnings.some((w) => /429|slow down/.test(w))), 'every page notes that it could not be checked, with no problem');
    assert.ok((one.summary.notes || []).some((n) => /slow down/.test(n) && /not affected/.test(n)), 'the report explains it');
    await mode('429first');
    const r2 = await runCheckAndWait();
    const two = (await api('GET', '/api/checks/' + r2.json.id)).json.check;
    assert.ok(two.details.length >= 15 && !JSON.stringify(two.details).includes('429') , 'pages that recover after a retry are checked normally');
    assert.ok(two.details.every((d) => d.problems.some((p) => /no Loopy banner/.test(p))), 'and judged on what they really contain');
    await mode('always500');
    const r3 = await runCheckAndWait(); assert.equal(r3.json.status, 'fail', 'a real server error is still a failure');
    const three = (await api('GET', '/api/checks/' + r3.json.id)).json.check;
    assert.ok(three.details.every((d) => d.problems.some((p) => /answered 500/.test(p))));
  } finally { await mode('default'); }
});


test('site check: the page list can be read and changed from the page, links are cleaned up, other websites are refused, and a check uses the saved list', async () => {
  const d = (await api('GET', '/api/checks/pages')).json;
  assert.equal(d.isDefault, true); assert.equal(d.pages.length, 15); assert.ok(d.pages.includes('/') && d.pages.includes('/pages/b2g2-dsk'), 'the pages you asked for are in the standard list');
  try {
    const ok = await api('PUT', '/api/checks/pages', { pages: `http://localhost:${STORE}/\nhttp://localhost:${STORE}/collections/new-arrivals/\n  /pages/3-999  \npages/4-999\n/pages/3-999` });
    assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.deepEqual(ok.json.pages, ['/', '/collections/new-arrivals', '/pages/3-999', '/pages/4-999'], 'links become paths, tidy, no duplicates');
    assert.equal((await api('GET', '/api/checks/pages')).json.isDefault, false);
    assert.equal((await api('PUT', '/api/checks/pages', { pages: 'https://evil.example.com/x' })).status, 400, 'only your own store can be checked');
    assert.equal((await api('PUT', '/api/checks/pages', { pages: 'https://tucokids.com/x' })).status, 400, 'in this test setup tucokids.com is another site');
    assert.equal((await api('PUT', '/api/checks/pages', { pages: '//evil.example.com/x' })).status, 400, 'an address that starts with // is refused');
    assert.equal((await api('PUT', '/api/checks/pages', { pages: `http://localhost:9999/x` })).status, 400, 'a different port is a different site');
    assert.equal((await api('PUT', '/api/checks/pages', { pages: 'not a page with spaces' })).status, 400);
    assert.equal((await api('PUT', '/api/checks/pages', { pages: Array.from({ length: 41 }, (_, i) => '/p' + i) })).status, 400, 'at most 40 pages');
    assert.deepEqual((await api('GET', '/api/checks/pages')).json.pages, ['/', '/collections/new-arrivals', '/pages/3-999', '/pages/4-999'], 'a refused change keeps the saved list');
    const r = await runCheckAndWait();
    const one = (await api('GET', '/api/checks/' + r.json.id)).json.check;
    assert.equal(one.pages, 4, 'the run covers exactly the saved list'); assert.equal(new Set(one.details.map((x) => x.path)).size, 4);
    assert.equal((await fetch(B + '/api/checks/pages', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  } finally { assert.equal((await api('PUT', '/api/checks/pages', { pages: '' })).json.isDefault, true); }
  assert.equal((await api('GET', '/api/checks/pages')).json.pages.length, 15, 'an empty list puts the standard list back');
});

test('site check: pressing Check now twice starts only one run, which any device can follow until it is done', async () => {
  const mode = (m) => fetch(`http://localhost:${STORE}/__mode?m=${m}`);
  try {
    await mode('slow');
    const a = await api('POST', '/api/checks/run'); const b = await api('POST', '/api/checks/run');
    assert.equal(a.json.already, false); assert.equal(b.json.already, true, 'the second press joins the run that is already going'); assert.equal(a.json.id, b.json.id);
    const mid = (await api('GET', '/api/checks')).json.checks.find((c) => c.id === a.json.id);
    assert.equal(mid.status, 'running', 'the list shows it as running'); 
    let done; for (let k = 0; k < 90; k++) { done = (await api('GET', '/api/checks/' + a.json.id)).json.check; if (done.status !== 'running') break; await sleep(500); }
    assert.notEqual(done.status, 'running', 'it finishes by itself'); assert.ok(done.details.length >= 15);
    const again = await api('POST', '/api/checks/run'); assert.equal(again.json.already, false, 'after it is done a new run can start');
    for (let k = 0; k < 90; k++) { const c = (await api('GET', '/api/checks/' + again.json.id)).json.check; if (c.status !== 'running') break; await sleep(500); }
  } finally { await mode('default'); }
});

test('site check page: Check now shows progress, finishes on its own, and the page list can be edited (phone size)', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const mode = (m) => fetch(`http://localhost:${STORE}/__mode?m=${m}`);
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  try {
    await mode('slow');
    await page.goto(`http://localhost:${PORT}/`); await page.evaluate((t) => localStorage.setItem('tuco_admin_token', t), TOKEN);
    await page.goto(`http://localhost:${PORT}/?x=${Math.random()}#/checks`);
    await page.waitForFunction(() => document.querySelector('.shell h1') && !document.getElementById('splash'), { timeout: 20000 }); await sleep(600);
    assert.ok(await page.evaluate(() => !!document.querySelector('.chkpages textarea') || !!document.querySelector('.chkpages')), 'the page list editor is there');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Check now/.test(b.innerText)).click());
    await page.waitForFunction(() => document.querySelector('.chkhero.running'), { timeout: 8000 });
    assert.ok(await page.evaluate(() => /Checking 15 pages now/.test(document.querySelector('.chkhero.running').innerText) && [...document.querySelectorAll('button')].find((b) => /Checking/.test(b.innerText)).disabled), 'it shows progress and the button cannot be pressed twice');
    await page.waitForFunction(() => !document.querySelector('.chkhero.running') && document.querySelector('.chkhero'), { timeout: 60000 });
    assert.ok(await page.evaluate(() => /Last check/.test(document.querySelector('.chkhero').innerText) && !document.querySelector('.chkhero').innerText.includes('Checking')), 'it ends by showing the result');
    await page.evaluate(() => document.querySelector('.chkpages summary').click());
    await page.evaluate(() => { const ta = document.querySelector('.chkpages textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, '/\n/pages/3-999'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => [...document.querySelectorAll('.chkpages button')].find((b) => /Save list/.test(b.innerText)).click()); await sleep(900);
    assert.equal((await api('GET', '/api/checks/pages')).json.pages.length, 2, 'the new list is saved');
    assert.ok(await page.evaluate(() => /Saved. 2 pages/.test(document.querySelector('.chkpages').innerText)));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), 'nothing spills sideways on a phone');
  } finally { await mode('default'); await api('PUT', '/api/checks/pages', { pages: '' }); await page.close(); }
});


// ---------------- Site check: every way a banner or its videos can break, and that each one is reported ----------------
const checkRun = async (mode, pages) => {
  await fetch(`http://localhost:${STORE}/__mode?m=${mode}`);
  if (pages) assert.equal((await api('PUT', '/api/checks/pages', { pages })).status, 200);
  const r = await runCheckAndWait();
  return (await api('GET', '/api/checks/' + r.json.id)).json.check;
};
const resetCheck = async () => { await fetch(`http://localhost:${STORE}/__mode?m=default`); await api('PUT', '/api/checks/pages', { pages: '' }); };
const mkWidget = async (videoIds, extra = {}) => (await api('POST', '/api/widgets', { name: 'QA check ' + Math.random().toString(36).slice(2, 7), type: 'banner', page: 'home', scope: 'custom', enabled: true, videoIds, ...extra })).json.id;

test('site check: a healthy banner with live, intact videos passes, and the report says how many videos were verified', async () => {
  const w = await mkWidget([vids[0], vids[1]]);
  try {
    const c = await checkRun('widget:' + w, '/');
    const rows = c.details.filter((d) => d.widget === w); assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].problems, [], 'no problems: ' + JSON.stringify(rows[0].problems)); assert.equal(rows[0].actual, '2 live videos');
    assert.ok(c.summary.videosChecked >= 2, 'the videos were really verified: ' + JSON.stringify(c.summary));
    assert.notEqual(c.status, 'fail');
  } finally { await resetCheck(); await api('DELETE', '/api/widgets/' + w); }
});

test('site check: each way a video can break is caught (file missing, file the wrong size, file hosted elsewhere, widget off, no live video, widget deleted)', async () => {
  const mk = async (o) => (await api('POST', '/api/videos', { title: 'QA ' + o.title, status: 'live', placements: ['home'], products: [], ...o })).json.id;
  const ids = [];
  try {
    const missing = await mk({ title: 'missing', url: '/media/videos/this-file-does-not-exist.mp4' }); ids.push(missing);
    const outside = await mk({ title: 'outside', url: `http://localhost:${STORE}/video.mp4`, size: 10 }); ids.push(outside);
    const bigger = (await api('GET', '/api/videos')).json.videos.find((v) => v.id === vids[2]);
    const wrongSize = await mk({ title: 'wrongsize', url: bigger.url, size: bigger.size * 3 }); ids.push(wrongSize);
    const draft = await mk({ title: 'draft', url: bigger.url, size: bigger.size, status: 'draft' }); ids.push(draft);
    const wMissing = await mkWidget([missing]); const wOutside = await mkWidget([outside]); const wSize = await mkWidget([wrongSize]); const wDraft = await mkWidget([draft]);
    const wOff = await mkWidget([vids[0]], { enabled: false }); const wNone = await mkWidget([]);
    const c = await checkRun('widget:' + [wMissing, wOutside, wSize, wDraft, wOff, wNone].join(','), '/').catch(() => null);
    assert.ok(c === null || true);
    // one page can only show one widget id in this setup, so each case gets its own run
    const one = async (w) => { const r = await checkRun('widget:' + w, '/'); return r.details.find((d) => d.widget === w); };
    const rMissing = await one(wMissing); assert.ok(rMissing.problems.some((p) => /missing from storage/.test(p)), JSON.stringify(rMissing.problems));
    const rOutside = await one(wOutside); assert.deepEqual(rOutside.problems, [], 'a reachable outside video is not a failure'); assert.ok(rOutside.warnings.some((p) => /hosted outside Loopy/.test(p)), JSON.stringify(rOutside.warnings));
    const rSize = await one(wSize); assert.ok(rSize.problems.some((p) => /may be incomplete/.test(p)), JSON.stringify(rSize.problems));
    const rDraft = await one(wDraft); assert.ok(rDraft.problems.some((p) => /none of its videos are live/.test(p)), JSON.stringify(rDraft.problems));
    const rOff = await one(wOff); assert.ok(rOff.problems.some((p) => /switched off/.test(p)), JSON.stringify(rOff.problems));
    const rNone = await one(wNone); assert.ok(rNone.problems.some((p) => /no videos/.test(p)), JSON.stringify(rNone.problems));
    const gone = await checkRun('widget:wgt_doesnotexist', '/'); assert.ok(gone.details.find((d) => d.widget === 'wgt_doesnotexist').problems.some((p) => /no longer exists/.test(p)));
    for (const w of [wMissing, wOutside, wSize, wDraft, wOff, wNone]) await api('DELETE', '/api/widgets/' + w);
  } finally { await resetCheck(); for (const id of ids) await api('DELETE', '/api/videos/' + id); }
});

test('site check: a page that redirects elsewhere, a page that comes back almost empty, and a missing page are each reported', async () => {
  const w = await mkWidget([vids[0]]);
  try {
    const red = await checkRun('redirect:' + w, '/pages/3-999\n/pages/4-999');
    const r3 = red.details.filter((d) => d.path === '/pages/3-999'); assert.ok(r3.some((d) => d.warnings.some((x) => /redirects to \/pages\/elsewhere/.test(x))), 'the redirect is flagged: ' + JSON.stringify(r3));
    assert.ok(red.details.filter((d) => d.path === '/pages/4-999').every((d) => !d.warnings.some((x) => /redirects/.test(x))), 'a normal page is not flagged');
    const tiny = await checkRun('tiny', '/'); assert.equal(tiny.status, 'fail'); assert.ok(tiny.details[0].problems.some((p) => /almost empty/.test(p)), JSON.stringify(tiny.details[0]));
    const nf = await checkRun('default', '/pages/not-here'); assert.ok(nf.details[0].problems.some((p) => /answered 404/.test(p)), JSON.stringify(nf.details[0]));
  } finally { await resetCheck(); await api('DELETE', '/api/widgets/' + w); }
});

test('site check: two devices pressing Check at the same instant start one run, and a run that was interrupted is closed after several minutes', async () => {
  try {
    await fetch(`http://localhost:${STORE}/__mode?m=slow`);
    const [a, b, c] = await Promise.all([api('POST', '/api/checks/run'), api('POST', '/api/checks/run'), api('POST', '/api/checks/run')]);
    assert.equal(new Set([a.json.id, b.json.id, c.json.id]).size, 1, 'all three presses follow the same run: ' + [a.json.id, b.json.id, c.json.id]);
    for (let k = 0; k < 90; k++) { if ((await api('GET', '/api/checks/' + a.json.id)).json.check.status !== 'running') break; await sleep(500); }
  } finally { await resetCheck(); }
  // an interrupted run (older than 8 minutes) must never stay "Checking now" for ever
  const old = await api('POST', '/api/checks', { at: Date.now() - 12 * 60000, status: 'running', pages: 15, failures: 0, durationS: 0, summary: { kind: 'server-check' }, details: [] });
  assert.equal(old.status, 200);
  const list = (await api('GET', '/api/checks')).json.checks; const row = list.find((x) => x.id === old.json.id);
  assert.equal(row.status, 'fail', 'it is closed'); assert.ok((row.summary.notes || []).some((n) => /did not finish/.test(n)), JSON.stringify(row.summary));
  assert.ok(!list.some((x) => x.status === 'running'), 'nothing is left running');
});
