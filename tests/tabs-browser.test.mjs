// Product tabs in a real browser. The widget is given made-up data (so no real store is involved) and a made-up cart. Needs Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME, haveChrome, startPageServer, seedVideos, api, B, PORT } from './lib-browser.mjs';

let browser, srv, vids, videoUrl;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CORS = { 'access-control-allow-origin': '*' };
test.before(async () => {
  if (!haveChrome) return;
  srv = await startPageServer(); vids = await seedVideos(2);
  videoUrl = (await api('GET', '/api/videos')).json.videos.find((v) => v.id === vids[0]).url;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

const P = (h, o = {}) => ({ handle: h, title: 'Product ' + h, price: '₹499', from: false, compare: '', off: 0, image: '', soldOut: false, variantId: 1000 + h.length, variants: [], rating: null, ...o });
const baseTabs = () => [
  { title: 'Face Wash', icon: '', slide: { id: vids[0], title: 'Slide video', url: videoUrl, poster: '' }, overlayHeading: 'Glow Naturally', overlaySub: 'Every day', link: '/pages/glow',
    products: [P('a', { rating: { value: 4.85, count: 35 }, compare: '₹750', off: 6, price: '₹699' }), P('b', { price: '₹1,299' }), P('c', { from: true, price: '₹299', variants: [{ id: 1, title: 'Rose', available: true }, { id: 2, title: 'Nude', available: true }] }), P('d', { soldOut: true })],
    viewAll: { text: 'View all Face Wash products', url: '/collections/face-wash' } },
  { title: 'Sunscreen', icon: '', slide: null, overlayHeading: '', overlaySub: '', link: '', products: [P('e'), P('f')], viewAll: null },
  { title: 'Hair Care', icon: '', slide: null, overlayHeading: '', overlaySub: '', link: '', products: [P('g')], viewAll: null },
];

async function open({ tabs = baseTabs(), content = {}, tabsSettings = {}, viewport = { width: 1280, height: 900 }, mobile = false, init = null, intercept = null } = {}) {
  const w = await api('POST', '/api/widgets', { name: 'QA tabs ' + Math.random().toString(36).slice(2, 7), type: 'tabs', page: 'home', scope: 'custom', enabled: true, videoIds: [], overrides: { content: { heading: 'Our bestsellers', subheading: 'Loved by parents', ...content, tabs: [{ title: 'x' }] } } });
  assert.ok(w.status < 300, JSON.stringify(w.json));
  const cfg = await (await fetch(`${B}/api/public/config?widget=${w.json.id}`)).json();
  cfg.tabs = tabs; cfg.widget.overrides.content = { heading: 'Our bestsellers', subheading: 'Loved by parents', atcText: 'add to cart', soldOutText: 'sold out', ...content };
  cfg.settings.tabs = { ...cfg.settings.tabs, ...tabsSettings };
  const page = await browser.newPage(); const cart = []; const events = [];
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  if (init) await page.evaluateOnNewDocument(init);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/public/config')) return r.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(cfg) });
    if (u.includes('/api/public/events')) { events.push(r.postData() || ''); return r.respond({ status: 200, headers: CORS, body: '{}' }); }
    if (intercept) { const x = intercept(r); if (x) return x; }
    if (u.includes('/cart/add.js')) { cart.push(r.postData() || ''); return r.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '{}' }); }
    r.continue();
  });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200))); page.on('console', (m) => { if (/Loopy|error|warn/i.test(m.type() + m.text())) errs.push(m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=%7B%7D`, { waitUntil: 'load' });
  await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); return h && h.shadowRoot && (h.shadowRoot.querySelector('.tb, p') || getComputedStyle(h).display === 'none'); }, { timeout: 10000 }).catch((e) => { throw new Error('widget did not draw. page errors: ' + errs.join(' | ') + ' / ' + e.message); });
  await sleep(400);
  return { page, cart, events, id: w.json.id };
}
const sr = (page, fn, ...a) => page.evaluate((src, ...args) => new Function('root', 'args', 'return (' + src + ')(root, ...args)')(document.querySelector('[data-tuco-video]').shadowRoot, args), fn.toString(), ...a);
const skip = { skip: !haveChrome && 'Chrome is not installed' };

test('product tabs: heading, tabs and the cards of the first tab are drawn, with rating, price, % off, sold out and options', skip, async () => {
  const { page } = await open();
  try {
    const r = await sr(page, (root) => ({
      heading: root.querySelector('.hd').textContent, sub: root.querySelector('.sb').textContent, tabs: [...root.querySelectorAll('.tab')].map((t) => t.textContent.trim()), on: [...root.querySelectorAll('.tab')].map((t) => t.getAttribute('aria-selected')),
      visiblePanels: [...root.querySelectorAll('.panel')].filter((p) => getComputedStyle(p).display !== 'none').length,
      cards: [...root.querySelectorAll('.panel.on .card')].length, titles: [...root.querySelectorAll('.panel.on .pt')].map((x) => x.textContent), text: root.querySelector('.panel.on').textContent,
      atc: [...root.querySelectorAll('.panel.on .atc')].map((b) => ({ t: b.textContent.trim(), d: !!b.disabled, tag: b.tagName })), overlay: (root.querySelector('.panel.on .ov') || {}).textContent, link: (root.querySelector('.panel.on .media a') || {}).getAttribute && root.querySelector('.panel.on .media a').getAttribute('href'),
    }));
    assert.equal(r.heading, 'Our bestsellers'); assert.equal(r.sub, 'Loved by parents'); assert.deepEqual(r.tabs, ['Face Wash', 'Sunscreen', 'Hair Care']); assert.deepEqual(r.on, ['true', 'false', 'false']); assert.equal(r.visiblePanels, 1, 'only the open tab is shown');
    assert.equal(r.cards, 6, 'video slide + 4 products + the "View all" card'); assert.deepEqual(r.titles, ['Product a', 'Product b', 'Product c', 'Product d']);
    assert.match(r.text, /4\.85/); assert.match(r.text, /\(35\)/); assert.match(r.text, /₹699/); assert.match(r.text, /₹750/); assert.match(r.text, /\(6% off\)/); assert.match(r.text, /₹1,299/); assert.match(r.text, /From ₹299/); assert.match(r.text, /View all Face Wash products/);
    assert.deepEqual(r.atc.map((b) => [b.t, b.d]), [['add to cart', false], ['add to cart', false], ['choose options', false], ['sold out', true]], 'a product with options sends the shopper to its page, a sold-out one cannot be added');
    assert.equal(r.atc[2].tag, 'A'); assert.match(r.overlay, /Glow Naturally/); assert.equal(r.link, '/pages/glow');
  } finally { await page.close(); }
});

test('product tabs: switching tabs (click and keyboard) shows that tab only', skip, async () => {
  const { page } = await open();
  try {
    await sr(page, (root) => root.querySelectorAll('.tab')[1].click()); await sleep(200);
    let r = await sr(page, (root) => ({ on: [...root.querySelectorAll('.tab')].map((t) => t.getAttribute('aria-selected')), titles: [...root.querySelectorAll('.panel.on .pt')].map((x) => x.textContent), shown: [...root.querySelectorAll('.panel')].filter((p) => getComputedStyle(p).display !== 'none').length }));
    assert.deepEqual(r.on, ['false', 'true', 'false']); assert.deepEqual(r.titles, ['Product e', 'Product f']); assert.equal(r.shown, 1);
    await sr(page, (root) => root.querySelectorAll('.tab')[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))); await sleep(200);
    r = await sr(page, (root) => ({ on: [...root.querySelectorAll('.tab')].map((t) => t.getAttribute('aria-selected')) })); assert.deepEqual(r.on, ['false', 'false', 'true'], 'the right arrow key moves to the next tab');
    await sr(page, (root) => root.querySelectorAll('.tab')[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))); await sleep(200);
    r = await sr(page, (root) => ({ on: [...root.querySelectorAll('.tab')].map((t) => t.getAttribute('aria-selected')) })); assert.deepEqual(r.on, ['true', 'false', 'false'], 'it wraps round to the first');
  } finally { await page.close(); }
});

test('product tabs: the first-slide video plays when its tab is open and on screen, and is not loaded in tabs that are closed', skip, async () => {
  const { page, events } = await open();
  try {
    await sleep(2500);
    const r = await sr(page, (root) => { const v = root.querySelector('.panel.on video'); const m = root.querySelector('.panel.on .media'); return { src: !!v.src, playing: !v.paused && v.readyState >= 2, pl: m.classList.contains('pl'), rect: [Math.round(m.getBoundingClientRect().width), Math.round(m.getBoundingClientRect().height)], otherSrc: [...root.querySelectorAll('.panel:not(.on) video')].some((x) => !!x.src) }; });
    assert.ok(r.src && r.playing, 'the video plays: ' + JSON.stringify(r)); assert.ok(r.pl, 'it fades in once playing'); assert.ok(Math.abs(r.rect[1] / r.rect[0] - 16 / 9) < 0.05, 'the slide is tall (9:16): ' + r.rect);
    await sleep(4500); // events are sent in batches
    assert.ok(events.join('').includes('"impression"') && events.join('').includes(vids[0]), 'a view of the video is counted: ' + events.join('').slice(0, 200));
    await sr(page, (root) => root.querySelectorAll('.tab')[1].click()); await sleep(600);
    assert.equal(await sr(page, (root) => { const v = root.querySelector('.panel:first-of-type video') || root.querySelector('video'); return v.paused; }), true, 'the video stops when its tab is closed');
  } finally { await page.close(); }
});

test('product tabs: add to cart puts the right option in the real cart, credits the video, and a failed add sends the shopper to the product page', skip, async () => {
  const { page, cart, events } = await open();
  try {
    await sr(page, (root) => root.querySelector('.panel.on [data-add="a"]').click()); await sleep(900);
    assert.equal(cart.length, 1); assert.match(cart[0], new RegExp('name="id"[\\s\\S]*?\\b' + (1000 + 1) + '\\b')); assert.match(cart[0], /_tuco_video/); assert.ok(cart[0].includes(vids[0]), 'the video is credited for the sale');
    assert.equal(await sr(page, (root) => root.querySelector('.panel.on [data-add="a"]').textContent), 'Added ✓');
    await sleep(2200); assert.equal(await sr(page, (root) => root.querySelector('.panel.on [data-add="a"]').textContent), 'add to cart', 'the button returns to normal');
    await sleep(4500); assert.ok(events.join('').includes('"atc"'), 'the add to cart is counted');
  } finally { await page.close(); }
  const fail = await open({ intercept: (r) => (r.url().includes('/cart/add.js') ? r.respond({ status: 422, headers: CORS, body: '{}' }) : null) });
  try {
    await sr(fail.page, (root) => root.querySelector('.panel.on [data-add="b"]').click()); await sleep(1500);
    assert.match(fail.page.url(), /\/products\/b$/, 'a failed add opens the product page: ' + fail.page.url());
  } finally { await fail.page.close(); }
});

test('product tabs: arrows scroll a long list on a computer, are hidden on a phone, and cards per row follows the setting', skip, async () => {
  const many = baseTabs(); many[0].products = Array.from({ length: 14 }, (_, i) => P('p' + i));
  const d = await open({ tabs: many, tabsSettings: { cardsPerRow: 4 } });
  try {
    await sleep(400);
    const a = await sr(d.page, (root) => { const tr = root.querySelector('.panel.on .track'); const c = root.querySelectorAll('.panel.on .card')[1]; return { next: !root.querySelector('.panel.on .next').hidden, prev: root.querySelector('.panel.on .prev').hidden, per: Math.round((tr.clientWidth / c.getBoundingClientRect().width) * 10) / 10 }; });
    assert.ok(a.next && a.prev, 'only the "next" arrow at the start'); assert.ok(a.per >= 3.7 && a.per <= 4.3, 'about 4 cards across: ' + a.per);
    await sr(d.page, (root) => root.querySelector('.panel.on .next').click()); await sleep(900);
    const b = await sr(d.page, (root) => ({ left: root.querySelector('.panel.on .track').scrollLeft, prev: root.querySelector('.panel.on .prev').hidden })); assert.ok(b.left > 100 && !b.prev, 'it scrolled and the "previous" arrow appeared: ' + JSON.stringify(b));
  } finally { await d.page.close(); }
  const six = await open({ tabs: many, tabsSettings: { cardsPerRow: 6 } });
  try { const per = await sr(six.page, (root) => { const tr = root.querySelector('.panel.on .track'); return Math.round((tr.clientWidth / root.querySelectorAll('.panel.on .card')[1].getBoundingClientRect().width) * 10) / 10; }); assert.ok(per >= 5.6 && per <= 6.4, '6 across: ' + per); } finally { await six.page.close(); }
  const m = await open({ tabs: many, viewport: { width: 390, height: 800 }, mobile: true });
  try {
    const r = await sr(m.page, (root) => { const tr = root.querySelector('.panel.on .track'); return { arrow: getComputedStyle(root.querySelector('.panel.on .next')).display, per: Math.round((tr.clientWidth / root.querySelectorAll('.panel.on .card')[1].getBoundingClientRect().width) * 10) / 10, wide: document.documentElement.scrollWidth }; });
    assert.equal(r.arrow, 'none', 'no arrows on a phone (swipe instead)'); assert.ok(r.per >= 2.0 && r.per <= 2.3, 'a bit over two cards, so the next one peeks in: ' + r.per); assert.ok(r.wide <= 392, 'nothing spills sideways');
  } finally { await m.page.close(); }
});

test('product tabs: colours and texts come from the settings, and bad text or links in the data cannot run anything', skip, async () => {
  const evil = baseTabs(); evil[0].title = '<img src=x onerror="window.__pwn=1">Tab'; evil[0].products[0].title = '<script>window.__pwn=2</script>Nice'; evil[0].link = 'javascript:window.__pwn=3'; evil[0].viewAll.url = 'javascript:window.__pwn=4'; evil[1].icon = 'javascript:window.__pwn=5';
  const { page } = await open({ tabs: evil, tabsSettings: { accentColor: '#ff0000', headingColor: '#112233', background: '#fafafa' }, content: { offersHeading: 'Buy 2 get 1 free', atcText: 'Add it', soldOutText: 'Gone' } });
  try {
    const r = await sr(page, (root) => ({ line: getComputedStyle(root.querySelector('.tab.on')).borderBottomColor, head: getComputedStyle(root.querySelector('.hd')).color, bg: getComputedStyle(root.querySelector('.tb')).backgroundColor, offer: root.querySelector('.panel.on .offer').textContent, atc: root.querySelector('.panel.on [data-add]').textContent, sold: root.querySelector('.panel.on button[disabled]').textContent, title0: root.querySelector('.tab').textContent, ptitle: root.querySelector('.pt').textContent, mediaLink: !!root.querySelector('.panel.on .media a'), viewAll: !!root.querySelector('.panel.on .va'), icons: root.querySelectorAll('.tab img').length }));
    assert.equal(r.line, 'rgb(255, 0, 0)'); assert.equal(r.head, 'rgb(17, 34, 51)'); assert.equal(r.bg, 'rgb(250, 250, 250)'); assert.equal(r.offer, 'Buy 2 get 1 free'); assert.equal(r.atc, 'Add it'); assert.equal(r.sold, 'Gone');
    assert.match(r.title0, /<img src=x/, 'markup in a title is shown as text'); assert.match(r.ptitle, /<script>/); assert.equal(r.mediaLink, false, 'a javascript: slide link is dropped'); assert.equal(r.viewAll, false, 'a javascript: "View all" link is dropped'); assert.equal(r.icons, 0, 'a javascript: icon is dropped');
    assert.equal(await page.evaluate(() => window.__pwn), undefined, 'nothing from the data ran');
  } finally { await page.close(); }
});

test('product tabs: a visitor browsing in another currency sees that currency, and a widget with nothing to show hides itself', skip, async () => {
  const usd = await open({ init: () => { window.Shopify = { currency: { active: 'USD' } }; }, intercept: (r) => (/\/products\/[^/]+\.js/.test(r.url()) ? r.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ title: 'x', variants: [{ id: 5, price: 1250, compare_at_price: 1500, available: true }] }) }) : null) });
  try { await sleep(1200); const t = await sr(usd.page, (root) => root.querySelector('.panel.on .card[data-h="a"] .pr').textContent); assert.match(t, /12\.50/); assert.ok(!/₹/.test(t), 'no rupee sign: ' + t); } finally { await usd.page.close(); }
  const none = await open({ tabs: [{ title: 'Empty', slide: null, products: [], viewAll: null }] });
  try { const r = await none.page.evaluate(() => { const h = document.querySelector('[data-tuco-video]'); return { display: getComputedStyle(h).display, html: h.shadowRoot ? h.shadowRoot.innerHTML.length : -1 }; }); assert.equal(r.display, 'none', 'an empty widget takes no space'); } finally { await none.page.close(); }
});

test('product tabs: the admin preview draws the same widget without counting views or touching the cart', skip, async () => {
  const { page, cart, events } = await open();
  try {
    const out = await page.evaluate(async () => {
      const host = document.createElement('div'); document.body.appendChild(host);
      const cfg = { settings: { brandColor: '#ffd94a', brandFont: 'Poppins', showPrice: true, tabs: { cardsPerRow: 4 } }, widget: { id: 'preview', type: 'tabs', overrides: { content: { heading: '', tabs: [] } } }, tabs: [{ title: 'Draft', slide: null, products: [{ handle: 'z', title: 'Zed', price: '₹10', variantId: 9, variants: [], compare: '', off: 0, image: '', soldOut: false }], viewAll: { text: 'All', url: '/collections/z' } }] };
      await window.TucoVideo.render(host, cfg, { preview: true, device: 'mobile' });
      const root = host.shadowRoot; root.querySelector('[data-add]').click(); await new Promise((r) => setTimeout(r, 400));
      return { heading: root.querySelector('.hd') && root.querySelector('.hd').textContent, link: root.querySelector('.pt').getAttribute('href'), va: root.querySelector('.va').getAttribute('href'), btn: root.querySelector('[data-add]').textContent };
    });
    assert.equal(out.heading, 'Your heading goes here', 'an example heading is shown while the heading is empty'); assert.equal(out.link, 'https://tucokids.com/products/z', 'links point at the real store'); assert.equal(out.va, 'https://tucokids.com/collections/z'); assert.equal(out.btn, 'Added ✓');
    assert.equal(cart.length, 0, 'the preview never adds to the cart');
  } finally { await page.close(); }
});
