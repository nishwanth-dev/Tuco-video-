// Shared helpers for the browser tests: a local test store page, widget creation through the local API,
// and a real headless Chrome (the Chrome already installed on this computer; nothing is downloaded).
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const B = process.env.LOOPY_API || 'http://localhost:8799';
export const TOKEN = process.env.LOOPY_TOKEN || 'testtoken';
export const PORT = 8124;
export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(B)) throw new Error('Refusing to run against ' + B);
export const haveChrome = existsSync(CHROME);

export const api = async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

// A fake store page: the widget host div (with optional data-* attributes) and the widget script.
export function startPageServer() {
  const widgetJs = () => readFileSync(join(ROOT, 'public/widget.js'));
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname === '/widget.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(widgetJs()); }
    if (u.pathname === '/page' || u.pathname.startsWith('/products/')) {
      const wid = u.searchParams.get('w') || '';
      const attrs = JSON.parse(u.searchParams.get('attrs') || '{}');
      const extra = Object.entries(attrs).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:sans-serif}div:empty{display:none}</style><body><div data-tuco-video data-widget="${wid}"${extra}></div><script src="/widget.js" data-api="${B}" defer></script>`);
    }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => srv.listen(PORT, () => r(srv)));
}

// Uploads the tiny fixture clip and creates a few live, tagged videos. Returns their ids.
export async function seedVideos(n = 4) {
  const clip = readFileSync(join(ROOT, 'tests/fixtures/clip.mp4'));
  const up = await (await fetch(B + '/api/upload?name=fixture.mp4', { method: 'PUT', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'video/mp4' }, body: clip })).json();
  const ids = [];
  for (let i = 1; i <= n; i++) {
    const r = await api('POST', '/api/videos', { title: `Fixture ${i}`, url: up.url, status: 'live', placements: ['home'], products: [{ handle: `fixture-${i}`, title: `Fixture product ${i}`, price: '₹ 499' }], size: clip.length });
    ids.push(r.json.id);
  }
  return ids;
}

export const sizes = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 }, phone430: { width: 430, height: 932 } };

// Renders one widget in headless Chrome with the given global settings, per-widget overrides and data-* attributes.
// A fresh widget id is used every time, so the API's 60 second cache never returns an older look.
export async function render(browser, videoIds, { type = 'carousel', global = {}, overrides = {}, attrs = {}, device = 'desktop', heading = 'Shop the looks', ids = null }) {
  await api('PUT', '/api/settings', global);
  const w = await api('POST', '/api/widgets', { name: `QA ${type} ${Math.random().toString(36).slice(2, 7)}`, type, page: 'home', scope: 'custom', enabled: true, videoIds: ids || videoIds, heading, overrides });
  if (w.status >= 300) throw new Error('widget create failed: ' + JSON.stringify(w.json));
  const page = await browser.newPage();
  await page.setViewport({ ...sizes[device], deviceScaleFactor: 1, isMobile: false });
  await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=${encodeURIComponent(JSON.stringify(attrs))}`, { waitUntil: 'load' });
  await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); const s = h && h.shadowRoot; return s && s.querySelector('.tile'); }, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 250));
  return { page, widgetId: w.json.id, close: () => page.close() };
}

// Reads real geometry and styles out of the widget (all measured in the page, after layout).
export const measure = (page) => page.evaluate(() => {
  const host = document.querySelector('[data-tuco-video]');
  const sr = host.shadowRoot;
  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const tiles = [...sr.querySelectorAll('.tile')].filter((t) => getComputedStyle(t.closest('.card') || t).display !== 'none');
  const t0 = tiles[0];
  const cs = t0 ? getComputedStyle(t0) : null;
  const vid = t0 && t0.querySelector('video');
  const hv = (n) => getComputedStyle(host).getPropertyValue(n).trim();
  return {
    host: rect(host), tiles: tiles.map(rect), tileCount: tiles.length,
    radius: cs ? cs.borderTopLeftRadius : null, radiusStr: cs ? cs.borderRadius : null,
    fit: vid ? getComputedStyle(vid).objectFit : null, bg: cs ? cs.backgroundColor : null,
    vars: { brand: hv('--brand'), font: hv('--font'), tw: hv('--tw'), tar: hv('--tar'), gap: hv('--gap'), pad: hv('--pad-x'), tileR: hv('--tile-r'), bannerR: hv('--banner-r'), bannerM: hv('--banner-m'), bannerMax: hv('--banner-max'), ssize: hv('--ssize'), sgap: hv('--sgap'), sr: hv('--sr'), flw: hv('--flw'), flr: hv('--flr') },
    title: (() => { const t = sr.querySelector('.title'); return t ? { text: t.textContent, color: getComputedStyle(t).color, weight: getComputedStyle(t).fontWeight, family: getComputedStyle(t).fontFamily } : null; })(),
    counts: { dots: sr.querySelectorAll('.dots i').length, cta: sr.querySelectorAll('.cta').length, views: sr.querySelectorAll('.views').length, info: sr.querySelectorAll('.info').length, meta: sr.querySelectorAll('.meta').length, price: sr.querySelectorAll('.info b, .meta b').length, atc: sr.querySelectorAll('.atc, .feedatc, [class*=atc]').length, fl: sr.querySelectorAll('.fl').length },
    ctaBg: (() => { const c = sr.querySelector('.cta'); return c ? getComputedStyle(c).backgroundColor : null; })(),
    ctaColor: (() => { const c = sr.querySelector('.cta'); return c ? getComputedStyle(c).color : null; })(),
    ctaFont: (() => { const c = sr.querySelector('.cta'); return c ? getComputedStyle(c).fontFamily : null; })(),
    metaColor: (() => { const c = sr.querySelector('.meta'); return c ? getComputedStyle(c).color : null; })(),
    labels: tiles.map((t) => t.getAttribute('aria-label')),
    ctaText: (() => { const c = sr.querySelector('.cta'); return c ? c.textContent.trim() : null; })(),
    objPos: vid ? getComputedStyle(vid).objectPosition : null,
    borderColor: cs ? cs.borderTopColor : null, borderW: cs ? cs.borderTopWidth : null,
    storyRing: (() => { const el = sr.querySelector('.ring, .tile'); return el ? getComputedStyle(el).borderTopColor : null; })(),
    lblColor: (() => { const l = sr.querySelector('.lbl'); return l ? getComputedStyle(l).color : null; })(),
    html0: t0 ? (t0.closest('.card') || t0).outerHTML.slice(0, 700) : '',
    page: { scrollW: document.documentElement.scrollWidth, innerW: innerWidth },
    firstLabelColor: (() => { const l = sr.querySelector('.lbl'); return l ? getComputedStyle(l).color : null; })(),
  };
});
