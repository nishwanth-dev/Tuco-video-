// How product prices and options look in a real browser: "From" price, size/shade picker, removed products. Needs Chrome.
// The widget is given a made-up answer from the API (so no real store is involved) and a made-up cart.
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME, haveChrome, startPageServer, seedVideos, api, B, PORT } from './lib-browser.mjs';

let browser, srv, ids;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test.before(async () => {
  if (!haveChrome) return;
  srv = await startPageServer(); ids = await seedVideos(1);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });
const CORS = { 'access-control-allow-origin': '*' };

async function openWith(products) {
  const w = await api('POST', '/api/widgets', { name: 'QA price ' + Math.random().toString(36).slice(2, 7), type: 'carousel', page: 'home', scope: 'custom', enabled: true, videoIds: [ids[0]], heading: 'Shop' });
  const cfg = await (await fetch(`${B}/api/public/config?widget=${w.json.id}`)).json();
  cfg.videos[0].products = products;
  const page = await browser.newPage(); const cart = [];
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: false });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/public/config')) return r.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(cfg) });
    if (u.includes('/cart/add.js')) { cart.push(r.postData() || ''); return r.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '{}' }); }
    r.continue();
  });
  await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=%7B%7D`, { waitUntil: 'load' });
  await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); return h && h.shadowRoot && h.shadowRoot.querySelector('.tile'); }, { timeout: 10000 });
  await sleep(300);
  return { page, cart };
}
const tileText = (page) => page.evaluate(() => document.querySelector('[data-tuco-video]').shadowRoot.textContent);
const openPlayer = async (page) => { await page.evaluate(() => document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile').click()); await sleep(500); };
const inPlayer = (page, fn, ...a) => page.evaluate((src, ...args) => { const h = [...document.body.children].find((e) => e.shadowRoot && e.shadowRoot.querySelector('.reel')); return new Function('root', 'args', 'return (' + src + ')(root, ...args)')(h.shadowRoot, args); }, fn.toString(), ...a);

const SHADE = { handle: 'mock-shade', title: 'Shade stick', price: '₹299', from: true, compare: '', off: 0, image: '', soldOut: false, variantId: 11, live: true,
  variants: [{ id: 11, title: 'Rose', price: '₹299', available: true }, { id: 12, title: 'Nude', price: '₹349', available: true }, { id: 13, title: 'Brown', price: '₹349', available: false }] };

test('pricing, browser: a product with options shows "From", the player lets the shopper choose, and the cart gets the chosen option', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const { page, cart } = await openWith([SHADE]);
  try {
    assert.match(await tileText(page), /From\s*₹299/, 'the tile says From for a range of prices');
    await openPlayer(page);
    const info = await inPlayer(page, (root) => { const s = root.querySelector('.vsel'); return { has: !!s, opts: s ? [...s.options].map((o) => ({ t: o.textContent, d: o.disabled })) : [], price: root.querySelector('.pm span').textContent.trim() }; });
    assert.ok(info.has, 'there is an option picker'); assert.equal(info.opts.length, 3); assert.equal(info.opts[2].d, true, 'a sold-out option cannot be chosen'); assert.match(info.opts[2].t, /sold out/i);
    assert.match(info.price, /From\s*₹299/);
    await inPlayer(page, (root) => { const s = root.querySelector('.vsel'); s.value = '12'; s.dispatchEvent(new Event('change')); });
    const after = await inPlayer(page, (root) => ({ price: root.querySelector('.pm span').textContent.trim(), btn: root.querySelector('.atc').textContent, off: root.querySelector('.atc').disabled }));
    assert.equal(after.price, '₹349', 'the price follows the choice'); assert.equal(after.btn, 'Add to cart'); assert.equal(after.off, false);
    await inPlayer(page, (root) => root.querySelector('.atc').click()); await sleep(600);
    assert.equal(cart.length, 1, 'one add to cart request'); assert.match(cart[0], /12/, 'the chosen option (12) was added, not the default');
    assert.ok(!/\bname="id"[\s\S]*\b11\b/.test(cart[0]), 'not the default option');
    await inPlayer(page, (root) => { const s = root.querySelector('.vsel'); s.value = '13'; s.dispatchEvent(new Event('change')); });
    const sold = await inPlayer(page, (root) => ({ btn: root.querySelector('.atc').textContent, off: root.querySelector('.atc').disabled }));
    assert.equal(sold.btn, 'Sold out'); assert.equal(sold.off, true, 'a sold-out option can never be added');
  } finally { await page.close(); }
});

test('pricing, browser: a single-option product has no picker and no "From"', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const { page, cart } = await openWith([{ handle: 'mock-big', title: 'Big one', price: '₹1,299', from: false, compare: '₹1,599', off: 19, image: '', soldOut: false, variantId: 21, live: true, variants: [] }]);
  try {
    const t = await tileText(page); assert.ok(!/From/.test(t)); assert.match(t, /₹1,299/);
    await openPlayer(page);
    const info = await inPlayer(page, (root) => ({ picker: !!root.querySelector('.vsel'), price: root.querySelector('.pm span').textContent.trim() }));
    assert.equal(info.picker, false); assert.equal(info.price, '₹1,299');
    await inPlayer(page, (root) => root.querySelector('.atc').click()); await sleep(600);
    assert.equal(cart.length, 1); assert.match(cart[0], /21/);
  } finally { await page.close(); }
});

test('pricing, browser: a tagged product that no longer exists shows no old price and no add to cart', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const { page } = await openWith([{ handle: 'removed-thing', title: 'Old name', price: '₹100', gone: true, soldOut: false, variantId: 9 }]);
  try {
    const t = await tileText(page); assert.ok(!/₹100/.test(t) && !/Old name/.test(t), 'no stale price or name: ' + t.slice(0, 120));
    await openPlayer(page);
    const rows = await inPlayer(page, (root) => root.querySelectorAll('.p').length); assert.equal(rows, 0, 'no product row, so no dead link');
  } finally { await page.close(); }
});

test('pricing, browser: when only one of two tagged products was removed, the other still shows', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const { page } = await openWith([{ handle: 'removed-thing', title: 'Old name', price: '₹100', gone: true }, { handle: 'mock-big', title: 'Big one', price: '₹1,299', from: false, compare: '', off: 0, image: '', soldOut: false, variantId: 21, live: true, variants: [] }]);
  try {
    await openPlayer(page);
    const rows = await inPlayer(page, (root) => [...root.querySelectorAll('.p')].map((r) => r.textContent));
    assert.equal(rows.length, 1); assert.match(rows[0], /Big one/); assert.match(rows[0], /₹1,299/);
  } finally { await page.close(); }
});
