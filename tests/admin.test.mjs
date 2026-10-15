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
let browser, adminSrv, storeSrv, vids, handle2 = 'mock-soap', handle1 = 'mock-single';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

test.before(async () => {
  if (!haveChrome) return;
  storeSrv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/products.json') {
      const page = Number(u.searchParams.get('page') || 1);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ products: page > 1 ? [] : [
        { handle: handle2, title: 'Mock Soap', variants: [{ price: '300', available: true, id: 1 }], images: [] },
        { handle: handle1, title: 'Mock Single', variants: [{ price: '100', available: true, id: 2 }], images: [] },
        { handle: 'mock-none', title: 'Mock Untagged', variants: [{ price: '50', available: true, id: 3 }], images: [] }] }));
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
  const titles = () => page.evaluate(() => [...document.querySelectorAll('.modal .arr .arow span')].map((s) => s.textContent.replace(/^\d+\.\s*/, '').trim()));
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
