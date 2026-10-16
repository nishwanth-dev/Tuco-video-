// "Is everything customizable?" Changes every look-and-feel setting (global, per widget, and theme-block attributes),
// on desktop and on mobile, and measures what a real Chrome actually draws. Needs Chrome installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME, haveChrome, startPageServer, seedVideos, render, measure, api, PORT } from './lib-browser.mjs';

const near = (got, want, msg, tol = 1.6) => assert.ok(Math.abs(got - want) <= tol, `${msg}: got ${Math.round(got * 10) / 10}, expected ${want}`);
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const gapOf = (m) => m.tiles[1].x - m.tiles[0].r;
const padOf = (m) => m.tiles[0].x - m.host.x;

let browser, srv, ids;
test.before(async () => {
  if (!haveChrome) return;
  srv = await startPageServer();
  ids = await seedVideos(4);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

// Table driven: [name, widget options, check(measurements)]
const run = (name, opts, check) => test(name, { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const r = await render(browser, ids, opts);
  try { check(await measure(r.page)); } finally { await r.close(); }
});

// ---------------- Carousel: global settings ----------------
const G = (o) => ({ carousel: o });
run('carousel: tile width, desktop only', { global: G({ tileWidthDesktop: 300 }) }, (m) => near(m.tiles[0].w, 300, 'desktop width'));
run('carousel: tile width, desktop leaves mobile alone', { global: G({ tileWidthDesktop: 300 }), device: 'mobile' }, (m) => near(m.tiles[0].w, 160, 'mobile width'));
run('carousel: tile width, mobile only', { global: G({ tileWidthMobile: 200 }), device: 'mobile' }, (m) => near(m.tiles[0].w, 200, 'mobile width'));
run('carousel: tile width, mobile leaves desktop alone', { global: G({ tileWidthMobile: 200 }) }, (m) => near(m.tiles[0].w, 220, 'desktop width'));
run('carousel: tile shape desktop (square)', { global: G({ tileAspectDesktop: '1/1' }) }, (m) => near(m.tiles[0].h, m.tiles[0].w, 'square'));
run('carousel: tile shape desktop leaves mobile alone', { global: G({ tileAspectDesktop: '1/1' }), device: 'mobile' }, (m) => near(m.tiles[0].h, m.tiles[0].w * 16 / 9, 'mobile stays 9:16', 2));
run('carousel: tile shape mobile (4:5)', { global: G({ tileAspectMobile: '4/5' }), device: 'mobile' }, (m) => near(m.tiles[0].h, m.tiles[0].w * 5 / 4, '4:5', 2));
run('carousel: tile shape mobile leaves desktop alone', { global: G({ tileAspectMobile: '4/5' }) }, (m) => near(m.tiles[0].h, m.tiles[0].w * 16 / 9, 'desktop stays 9:16', 2));
run('carousel: one shape for both (legacy tileAspect)', { global: G({ tileAspect: '3/4' }) }, (m) => near(m.tiles[0].h, m.tiles[0].w * 4 / 3, '3:4', 2));
run('carousel: corners desktop', { global: G({ tileRadiusDesktop: 28 }) }, (m) => assert.equal(m.radius, '28px'));
run('carousel: corners desktop leave mobile alone', { global: G({ tileRadiusDesktop: 28 }), device: 'mobile' }, (m) => assert.equal(m.radius, '16px'));
run('carousel: corners mobile (square)', { global: G({ tileRadiusMobile: 0 }), device: 'mobile' }, (m) => assert.equal(m.radius, '0px'));
run('carousel: pill corners', { global: G({ tileRadiusDesktop: 999 }) }, (m) => assert.equal(m.radius, '999px'));
run('carousel: gap desktop', { global: G({ tileGapDesktop: 40 }) }, (m) => near(gapOf(m), 40, 'desktop gap'));
run('carousel: gap desktop leaves mobile alone', { global: G({ tileGapDesktop: 40 }), device: 'mobile' }, (m) => near(gapOf(m), 12, 'mobile gap'));
run('carousel: gap mobile', { global: G({ tileGapMobile: 4 }), device: 'mobile' }, (m) => near(gapOf(m), 4, 'mobile gap'));
run('carousel: gap zero', { global: G({ tileGapDesktop: 0 }) }, (m) => near(gapOf(m), 0, 'no gap'));
run('carousel: side margin desktop', { global: G({ sidePaddingDesktop: 60 }) }, (m) => near(padOf(m), 60, 'desktop margin'));
run('carousel: side margin desktop leaves mobile alone', { global: G({ sidePaddingDesktop: 60 }), device: 'mobile' }, (m) => near(padOf(m), 16, 'mobile margin'));
run('carousel: side margin mobile', { global: G({ sidePaddingMobile: 4 }), device: 'mobile' }, (m) => near(padOf(m), 4, 'mobile margin'));
run('carousel: video fit "show whole video"', { global: G({ tileFit: 'contain' }) }, (m) => assert.equal(m.fit, 'contain'));
run('carousel: video fit default is fill', {}, (m) => assert.equal(m.fit, 'cover'));
run('carousel: squared corners setting', { global: { border: 'square' } }, (m) => assert.equal(m.radius, '4px'));
run('carousel: heading colour, weight and font', { global: { brandFont: 'Georgia', carousel: { headingColor: '#ff0000', headingWeight: '800' } } }, (m) => {
  assert.equal(m.title.text, 'Shop the looks'); assert.equal(m.title.color, rgb('#ff0000')); assert.equal(m.title.weight, '800'); assert.match(m.title.family, /Georgia/);
});
run('carousel: heading font of its own', { global: { carousel: { headingFont: 'Courier New' } } }, (m) => assert.match(m.title.family, /Courier/));
run('carousel: no heading when empty', { heading: '' }, (m) => assert.equal(m.title, null));
run('carousel: brand colour reaches the widget', { global: { brandColor: '#12ab34' } }, (m) => assert.equal(m.vars.brand, '#12ab34'));
run('carousel: show view counts', { global: { showViews: true } }, (m) => assert.equal(m.counts.views, 4));
run('carousel: price hidden', { global: { showPrice: false } }, (m) => assert.equal(m.counts.price, 4, 'only the 4 product names remain'));
run('carousel: price shown by default', {}, (m) => assert.equal(m.counts.price, 8));
run('carousel: tile style "overlay"', { global: { tileType: 'overlay' } }, (m) => { assert.equal(m.counts.info, 4); assert.equal(m.counts.meta, 0); });
run('carousel: tile style "below"', { global: { tileType: 'below' } }, (m) => { assert.equal(m.counts.meta, 4); assert.equal(m.counts.info, 0); });
run('carousel: tile style "feed" shows an Add to cart button', { global: { tileType: 'feed' } }, (m) => { assert.equal(m.counts.cta, 4); assert.equal(m.ctaText, 'Add to cart'); });
run('carousel: tile style "feed" without Add to cart', { global: { tileType: 'feed', showAtc: false } }, (m) => assert.equal(m.counts.cta, 0));
run('carousel: tile style "minimal" shows only video', { global: { tileType: 'minimal' } }, (m) => { assert.equal(m.counts.info + m.counts.meta, 0); });
run('carousel: order newest first', { global: G({ ordering: 'newest' }) }, (m) => assert.deepEqual(m.labels, ['Fixture 4', 'Fixture 3', 'Fixture 2', 'Fixture 1']));
run('carousel: order as picked', {}, (m) => assert.deepEqual(m.labels, ['Fixture 1', 'Fixture 2', 'Fixture 3', 'Fixture 4']));

// ---------------- Stories ----------------
const S = (o) => ({ stories: o });
run('stories: size desktop', { type: 'stories', global: S({ sizeDesktop: 120 }) }, (m) => near(m.tiles[0].w, 120, 'desktop size'));
run('stories: size desktop leaves mobile alone', { type: 'stories', global: S({ sizeDesktop: 120 }), device: 'mobile' }, (m) => near(m.tiles[0].w, 84, 'mobile size'));
run('stories: size mobile', { type: 'stories', global: S({ sizeMobile: 70 }), device: 'mobile' }, (m) => near(m.tiles[0].w, 70, 'mobile size'));
run('stories: size factor when no exact size', { type: 'stories', global: S({ sizeFactor: 1.5 }) }, (m) => near(m.tiles[0].w, 126, 'factor 1.5'));
run('stories: shape circle', { type: 'stories', global: S({ shape: 'circle' }) }, (m) => assert.equal(m.radius, '50%'));
run('stories: shape rounded square', { type: 'stories', global: S({ shape: 'rounded' }) }, (m) => assert.equal(m.radius, '26%'));
run('stories: shape square', { type: 'stories', global: S({ shape: 'square' }) }, (m) => assert.equal(m.radius, '0px'));
run('stories: gap desktop', { type: 'stories', global: S({ gapDesktop: 30 }) }, (m) => near(gapOf(m), 30, 'desktop gap'));
run('stories: gap mobile', { type: 'stories', global: S({ gapMobile: 6 }), device: 'mobile' }, (m) => near(gapOf(m), 6, 'mobile gap'));
run('stories: gap desktop leaves mobile alone', { type: 'stories', global: S({ gapDesktop: 30 }), device: 'mobile' }, (m) => near(gapOf(m), 14, 'mobile gap'));
run('stories: ring colour', { type: 'stories', global: S({ borderColor: '#00aa55' }) }, (m) => assert.equal(m.storyRing, rgb('#00aa55')));
run('stories: label colour', { type: 'stories', global: S({ titleColor: '#aa0055' }) }, (m) => assert.equal(m.lblColor, rgb('#aa0055')));

// ---------------- Banner ----------------
const Bn = (o) => ({ banner: o });
run('banner: exact height desktop', { type: 'banner', global: Bn({ desktopHeight: 600 }) }, (m) => near(m.tiles[0].h, 600, 'desktop height'));
run('banner: exact height desktop leaves mobile alone', { type: 'banner', global: Bn({ desktopHeight: 600 }), device: 'mobile' }, (m) => near(m.tiles[0].h, 420, 'mobile height'));
run('banner: exact height mobile', { type: 'banner', global: Bn({ mobileHeight: 300 }), device: 'mobile' }, (m) => near(m.tiles[0].h, 300, 'mobile height'));
run('banner: by shape, desktop 2:1', { type: 'banner', global: Bn({ heightMode: 'ratio', aspectLandscape: '2/1' }) }, (m) => near(m.tiles[0].h, m.tiles[0].w / 2, '2:1', 2));
run('banner: by shape, mobile 4:5', { type: 'banner', global: Bn({ heightMode: 'ratio', aspectPortrait: '4/5' }), device: 'mobile' }, (m) => near(m.tiles[0].h, m.tiles[0].w * 5 / 4, '4:5', 2));
run('banner: full screen', { type: 'banner', global: Bn({ fullScreen: true }) }, (m) => near(m.tiles[0].h, 800, 'viewport height', 2));
run('banner: corners desktop', { type: 'banner', global: Bn({ radiusDesktop: 24 }) }, (m) => assert.equal(m.radius, '24px'));
run('banner: corners desktop leave mobile alone', { type: 'banner', global: Bn({ radiusDesktop: 24 }), device: 'mobile' }, (m) => assert.equal(m.radius, '0px'));
run('banner: corners mobile', { type: 'banner', global: Bn({ radiusMobile: 12 }), device: 'mobile' }, (m) => assert.equal(m.radius, '12px'));
run('banner: side margin desktop', { type: 'banner', global: Bn({ marginDesktop: 40 }) }, (m) => { near(m.tiles[0].x, 40, 'left margin'); near(1280 - m.tiles[0].r, 40, 'right margin'); });
run('banner: side margin mobile', { type: 'banner', global: Bn({ marginMobile: 10 }), device: 'mobile' }, (m) => near(m.tiles[0].x, 10, 'left margin'));
run('banner: side margin desktop leaves mobile alone', { type: 'banner', global: Bn({ marginDesktop: 40 }), device: 'mobile' }, (m) => near(m.tiles[0].x, 0, 'mobile margin'));
run('banner: maximum width, centred', { type: 'banner', global: Bn({ maxWidthDesktop: 800 }) }, (m) => { near(m.tiles[0].w, 800, 'max width'); near(m.tiles[0].x, 240, 'centred'); });
run('banner: maximum width ignored on mobile', { type: 'banner', global: Bn({ maxWidthDesktop: 200 }), device: 'mobile' }, (m) => near(m.tiles[0].w, 390, 'full width on mobile'));
run('banner: dots off', { type: 'banner', global: Bn({ showDots: false }) }, (m) => assert.equal(m.counts.dots, 0));
run('banner: dots on', { type: 'banner', global: Bn({ showDots: true }) }, (m) => assert.equal(m.counts.dots, 4));
run('banner: button off', { type: 'banner', global: Bn({ showCta: false }) }, (m) => assert.equal(m.counts.cta, 0));
run('banner: button text', { type: 'banner', global: { shopNowText: 'See more', banner: { showCta: true } } }, (m) => assert.equal(m.ctaText, 'See more'));
run('banner: video fit whole', { type: 'banner', global: Bn({ fit: 'contain' }) }, (m) => assert.equal(m.fit, 'contain'));
run('banner: keep top when cropping', { type: 'banner', global: Bn({ focus: 'top' }) }, (m) => assert.match(m.objPos, /^50% 0%|center top|50% 0px/));
run('banner: bar colour', { type: 'banner', global: Bn({ background: '#101010' }) }, (m) => assert.equal(m.bg, rgb('#101010')));

// ---------------- Spotlight and floating ----------------
const Sp = (o) => ({ spotlight: o });
run('spotlight: width desktop', { type: 'spotlight', ids: undefined, global: Sp({ widthDesktop: 200 }) }, (m) => near(m.tiles[0].w, 200, 'desktop width'));
run('spotlight: width mobile', { type: 'spotlight', global: Sp({ widthMobile: 120 }), device: 'mobile' }, (m) => near(m.tiles[0].w, 120, 'mobile width'));
run('spotlight: width desktop leaves mobile alone', { type: 'spotlight', global: Sp({ widthDesktop: 200 }), device: 'mobile' }, (m) => near(m.tiles[0].w, 92, 'mobile width'));
run('spotlight: size factor when no exact width', { type: 'spotlight', global: Sp({ sizeFactor: 2 }) }, (m) => near(m.tiles[0].w, 220, 'factor 2'));
run('spotlight: corners desktop', { type: 'spotlight', global: Sp({ radiusDesktop: 4 }) }, (m) => assert.equal(m.radius, '4px'));
run('spotlight: corners mobile', { type: 'spotlight', global: Sp({ radiusMobile: 30 }), device: 'mobile' }, (m) => assert.equal(m.radius, '30px'));
run('spotlight: on the left', { type: 'spotlight', global: Sp({ position: 'left' }) }, (m) => assert.ok(m.tiles[0].x < 640, 'left half'));
run('spotlight: on the right', { type: 'spotlight', global: Sp({ position: 'right' }) }, (m) => assert.ok(m.tiles[0].x > 640, 'right half'));
run('spotlight: distance from bottom, desktop', { type: 'spotlight', global: Sp({ bottomOffsetDesktop: 100 }) }, (m) => near(800 - m.tiles[0].b, 100, 'bottom offset'));
run('spotlight: distance from bottom, mobile', { type: 'spotlight', global: Sp({ bottomOffsetMobile: 150 }), device: 'mobile' }, (m) => near(844 - m.tiles[0].b, 150, 'bottom offset'));
run('floating: position right', { type: 'floating', global: Sp({ position: 'right' }) }, (m) => assert.ok(m.tiles[0].x > 640));
run('floating: has a close button', { type: 'floating' }, (m) => assert.ok(m.counts.fl >= 1));

// ---------------- Per-widget overrides beat the global setting ----------------
const OV = [
  ['carousel gap', 'carousel', { carousel: { tileGapDesktop: 40 } }, { carousel: { tileGapDesktop: 8 } }, 'desktop', (m) => near(gapOf(m), 8, 'widget override wins')],
  ['carousel tile shape', 'carousel', { carousel: { tileAspectDesktop: '1/1' } }, { carousel: { tileAspectDesktop: '4/5' } }, 'desktop', (m) => near(m.tiles[0].h, m.tiles[0].w * 1.25, 'shape', 2)],
  ['carousel corners (mobile)', 'carousel', { carousel: { tileRadiusMobile: 0 } }, { carousel: { tileRadiusMobile: 28 } }, 'mobile', (m) => assert.equal(m.radius, '28px')],
  ['carousel side margin', 'carousel', { carousel: { sidePaddingDesktop: 60 } }, { carousel: { sidePaddingDesktop: 10 } }, 'desktop', (m) => near(padOf(m), 10, 'margin')],
  ['carousel tile width', 'carousel', { carousel: { tileWidthDesktop: 300 } }, { carousel: { tileWidthDesktop: 180 } }, 'desktop', (m) => near(m.tiles[0].w, 180, 'width')],
  ['carousel video fit', 'carousel', { carousel: { tileFit: 'cover' } }, { carousel: { tileFit: 'contain' } }, 'desktop', (m) => assert.equal(m.fit, 'contain')],
  ['tile style', 'carousel', { tileType: 'overlay' }, { tileType: 'below' }, 'desktop', (m) => assert.equal(m.counts.meta, 4)],
  ['price shown', 'carousel', { showPrice: true }, { showPrice: false }, 'desktop', (m) => assert.equal(m.counts.price, 4)],
  ['story size (desktop)', 'stories', { stories: { sizeDesktop: 120 } }, { stories: { sizeDesktop: 60 } }, 'desktop', (m) => near(m.tiles[0].w, 60, 'size')],
  ['story shape', 'stories', { stories: { shape: 'circle' } }, { stories: { shape: 'square' } }, 'desktop', (m) => assert.equal(m.radius, '0px')],
  ['story gap (mobile)', 'stories', { stories: { gapMobile: 30 } }, { stories: { gapMobile: 2 } }, 'mobile', (m) => near(gapOf(m), 2, 'gap')],
  ['banner height (desktop)', 'banner', { banner: { desktopHeight: 600 } }, { banner: { desktopHeight: 350 } }, 'desktop', (m) => near(m.tiles[0].h, 350, 'height')],
  ['banner height (mobile)', 'banner', { banner: { mobileHeight: 600 } }, { banner: { mobileHeight: 250 } }, 'mobile', (m) => near(m.tiles[0].h, 250, 'height')],
  ['banner shape (desktop)', 'banner', { banner: { heightMode: 'fixed' } }, { banner: { heightMode: 'ratio', aspectLandscape: '3/1' } }, 'desktop', (m) => near(m.tiles[0].h, m.tiles[0].w / 3, 'ratio', 2)],
  ['banner corners', 'banner', { banner: { radiusDesktop: 0 } }, { banner: { radiusDesktop: 20 } }, 'desktop', (m) => assert.equal(m.radius, '20px')],
  ['banner margin (desktop)', 'banner', { banner: { marginDesktop: 0 } }, { banner: { marginDesktop: 30 } }, 'desktop', (m) => near(m.tiles[0].x, 30, 'margin')],
  ['banner max width', 'banner', { banner: { maxWidthDesktop: 0 } }, { banner: { maxWidthDesktop: 700 } }, 'desktop', (m) => near(m.tiles[0].w, 700, 'width')],
  ['banner dots', 'banner', { banner: { showDots: true } }, { banner: { showDots: false } }, 'desktop', (m) => assert.equal(m.counts.dots, 0)],
  ['banner button', 'banner', { banner: { showCta: true } }, { banner: { showCta: false } }, 'desktop', (m) => assert.equal(m.counts.cta, 0)],
  ['spotlight width (desktop)', 'spotlight', { spotlight: { widthDesktop: 200 } }, { spotlight: { widthDesktop: 140 } }, 'desktop', (m) => near(m.tiles[0].w, 140, 'width')],
  ['spotlight corners', 'spotlight', { spotlight: { radiusDesktop: 0 } }, { spotlight: { radiusDesktop: 24 } }, 'desktop', (m) => assert.equal(m.radius, '24px')],
  ['spotlight side', 'spotlight', { spotlight: { position: 'left' } }, { spotlight: { position: 'right' } }, 'desktop', (m) => assert.ok(m.tiles[0].x > 640)],
];
for (const [name, type, global, overrides, device, check] of OV) run(`widget override beats global: ${name}`, { type, global, overrides, device }, check);
run('widget override on one widget does not change another', { type: 'carousel', global: { carousel: { tileGapDesktop: 40 } } }, (m) => near(gapOf(m), 40, 'untouched widget keeps the global gap'));

// ---------------- Theme block / section attributes (data-*) ----------------
// [attribute, value, widget type, device, check]
const AT = [
  ['data-banner-h-desktop', '600', 'banner', 'desktop', (m) => near(m.tiles[0].h, 600, 'height')],
  ['data-banner-h-mobile', '300', 'banner', 'mobile', (m) => near(m.tiles[0].h, 300, 'height')],
  ['data-banner-ratio-desktop', '2/1', 'banner', 'desktop', (m) => near(m.tiles[0].h, m.tiles[0].w / 2, 'shape', 2)],
  ['data-banner-ratio-mobile', '4/5', 'banner', 'mobile', (m) => near(m.tiles[0].h, m.tiles[0].w * 1.25, 'shape', 2)],
  ['data-banner-radius-desktop', '28', 'banner', 'desktop', (m) => assert.equal(m.radius, '28px')],
  ['data-banner-radius-mobile', '12', 'banner', 'mobile', (m) => assert.equal(m.radius, '12px')],
  ['data-banner-margin-desktop', '40', 'banner', 'desktop', (m) => near(m.tiles[0].x, 40, 'margin')],
  ['data-banner-margin-mobile', '10', 'banner', 'mobile', (m) => near(m.tiles[0].x, 10, 'margin')],
  ['data-banner-max-desktop', '800', 'banner', 'desktop', (m) => near(m.tiles[0].w, 800, 'width')],
  ['data-banner-fit', 'contain', 'banner', 'desktop', (m) => assert.equal(m.fit, 'contain')],
  ['data-banner-focus', 'top', 'banner', 'desktop', (m) => assert.match(m.objPos, /^50% 0%|center top|50% 0px/)],
  ['data-tile-w-desktop', '300', 'carousel', 'desktop', (m) => near(m.tiles[0].w, 300, 'width')],
  ['data-tile-w-mobile', '200', 'carousel', 'mobile', (m) => near(m.tiles[0].w, 200, 'width')],
  ['data-tile-shape-desktop', '1/1', 'carousel', 'desktop', (m) => near(m.tiles[0].h, m.tiles[0].w, 'square')],
  ['data-tile-shape-mobile', '4/5', 'carousel', 'mobile', (m) => near(m.tiles[0].h, m.tiles[0].w * 1.25, 'shape', 2)],
  ['data-tile-radius-desktop', '28', 'carousel', 'desktop', (m) => assert.equal(m.radius, '28px')],
  ['data-tile-radius-mobile', '0', 'carousel', 'mobile', (m) => assert.equal(m.radius, '0px')],
  ['data-tile-gap-desktop', '40', 'carousel', 'desktop', (m) => near(gapOf(m), 40, 'gap')],
  ['data-tile-gap-mobile', '4', 'carousel', 'mobile', (m) => near(gapOf(m), 4, 'gap')],
  ['data-tile-pad-desktop', '60', 'carousel', 'desktop', (m) => near(padOf(m), 60, 'margin')],
  ['data-tile-pad-mobile', '4', 'carousel', 'mobile', (m) => near(padOf(m), 4, 'margin')],
  ['data-tile-fit', 'contain', 'carousel', 'desktop', (m) => assert.equal(m.fit, 'contain')],
  ['data-story-size-desktop', '120', 'stories', 'desktop', (m) => near(m.tiles[0].w, 120, 'size')],
  ['data-story-size-mobile', '70', 'stories', 'mobile', (m) => near(m.tiles[0].w, 70, 'size')],
  ['data-story-shape', 'square', 'stories', 'desktop', (m) => assert.equal(m.radius, '0px')],
  ['data-story-gap-desktop', '30', 'stories', 'desktop', (m) => near(gapOf(m), 30, 'gap')],
  ['data-story-gap-mobile', '6', 'stories', 'mobile', (m) => near(gapOf(m), 6, 'gap')],
  ['data-spot-w-desktop', '200', 'spotlight', 'desktop', (m) => near(m.tiles[0].w, 200, 'width')],
  ['data-spot-w-mobile', '120', 'spotlight', 'mobile', (m) => near(m.tiles[0].w, 120, 'width')],
  ['data-spot-radius-desktop', '4', 'spotlight', 'desktop', (m) => assert.equal(m.radius, '4px')],
  ['data-spot-radius-mobile', '30', 'spotlight', 'mobile', (m) => assert.equal(m.radius, '30px')],
];
for (const [attr, value, type, device, check] of AT) run(`theme block option ${attr}=${value} (${device})`, { type, device, attrs: { [attr]: value } }, check);
run('theme block heading text', { type: 'carousel', attrs: { 'data-heading': 'From the block' } }, (m) => assert.equal(m.title.text, 'From the block'));
run('theme block beats widget override beats global', { type: 'carousel', global: { carousel: { tileGapDesktop: 40 } }, overrides: { carousel: { tileGapDesktop: 8 } }, attrs: { 'data-tile-gap-desktop': '24' } }, (m) => near(gapOf(m), 24, 'block wins'));
run('theme block: other device values are not touched', { type: 'carousel', device: 'mobile', attrs: { 'data-tile-w-desktop': '300' } }, (m) => near(m.tiles[0].w, 160, 'mobile unchanged'));

// ---------------- Junk and extreme values never break the page ----------------
const JUNK = [
  ['data-tile-w-desktop', 'abc', (m) => near(m.tiles[0].w, 220, 'falls back to the default')],
  ['data-tile-w-desktop', '-50', (m) => near(m.tiles[0].w, 220, 'negative ignored')],
  ['data-tile-w-desktop', '99999', (m) => assert.ok(m.tiles[0].w <= 700, 'huge value is capped')],
  ['data-tile-shape-desktop', '4/0', (m) => assert.ok(Number.isFinite(m.tiles[0].h) && m.tiles[0].h > 50, 'a zero-height shape is refused')],
  ['data-tile-shape-desktop', 'wide', (m) => assert.ok(m.tiles[0].h > 50)],
  ['data-tile-gap-desktop', '1e9', (m) => assert.ok(gapOf(m) < 200, 'huge gap is capped')],
  ['data-tile-radius-desktop', 'javascript:alert(1)', (m) => assert.ok(m.tiles[0].h > 50)],
  ['data-heading', '<img src=x onerror=window.__pwn=1>', (m) => assert.equal(m.title.text, '<img src=x onerror=window.__pwn=1>')],
];
for (const [attr, value, check] of JUNK) run(`junk value ${attr}="${value}" is handled`, { type: 'carousel', attrs: { [attr]: value } }, check);
run('junk in the heading is shown as text and never runs', { type: 'carousel', attrs: { 'data-heading': '<img src=x onerror=window.__pwn=1>' } }, (m) => assert.ok(!m.html0.includes('onerror')));

const EXTREME = [
  ['carousel: gap 5000', { carousel: { tileGapDesktop: 5000 } }, 'carousel'],
  ['carousel: width 100000', { carousel: { tileWidthDesktop: 100000 } }, 'carousel'],
  ['carousel: negative everything', { carousel: { tileGapDesktop: -20, sidePaddingDesktop: -40, tileRadiusDesktop: -5, tileWidthDesktop: -100 } }, 'carousel'],
  ['banner: height 100000', { banner: { desktopHeight: 100000 } }, 'banner'],
  ['stories: size 5000', { stories: { sizeDesktop: 5000 } }, 'stories'],
  ['spotlight: width 5000', { spotlight: { widthDesktop: 5000 } }, 'spotlight'],
];
for (const [name, global, type] of EXTREME) run(`extreme setting is survivable: ${name}`, { type, global }, (m) => {
  assert.ok(m.tileCount >= 1, 'still renders');
  assert.ok(m.page.scrollW <= m.page.innerW + 1, 'no sideways scrolling of the page');
});

// ---------------- Desktop and mobile switch exactly at 750 px ----------------
test('desktop and mobile values switch at the 750 px breakpoint', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const global = { carousel: { tileWidthDesktop: 300, tileWidthMobile: 200 } };
  await api('PUT', '/api/settings', global);
  const w = (await api('POST', '/api/widgets', { name: 'QA breakpoint', type: 'carousel', page: 'home', scope: 'custom', enabled: true, videoIds: ids, heading: '' })).json.id;
  for (const [width, want] of [[749, 200], [750, 300]]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800 });
    await page.goto(`http://localhost:8124/page?w=${w}&attrs=%7B%7D`);
    await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); return h && h.shadowRoot && h.shadowRoot.querySelector('.tile'); });
    const m = await measure(page); near(m.tiles[0].w, want, `width at ${width}px`); await page.close();
  }
});

// ---------------- Live preview in the admin uses the same rules ----------------
test('every layout option offered in the admin is accepted by the API', async () => {
  const widgets = [['carousel', { tileAspectDesktop: '16/9', tileAspectMobile: '21/9', tileRadiusDesktop: 999, tileGapDesktop: 80, sidePaddingMobile: 120, tileWidthDesktop: 700 }], ['stories', { sizeDesktop: 300, shape: 'rounded', gapMobile: 80 }], ['banner', { desktopHeight: 1400, mobileHeight: 1200, maxWidthDesktop: 2400, marginDesktop: 200 }], ['spotlight', { widthDesktop: 500, radiusMobile: 999 }]];
  for (const [type, o] of widgets) {
    const r = await api('POST', '/api/widgets', { name: `Max ${type}`, type, page: 'home', scope: 'custom', videoIds: [], overrides: { [type]: o } });
    assert.ok([200, 201].includes(r.status), `${type}: ${JSON.stringify(r.json)}`);
  }
});

// ---------------- Colours, fonts and text: global, per widget, and theme block ----------------
const RED = '#cc0000', BLUE = '#0000cc', GREEN = '#00aa00';
const banner = (global = {}) => ({ type: 'banner', global: { banner: { showCta: true }, ...global } });
// [name, type, global settings, widget override, theme-block attribute, check]
const LOOK = [
  ['button and highlight colour', 'banner', { brandColor: RED }, { brandColor: BLUE }, ['data-brand-color', GREEN], (m, want) => assert.equal(m.ctaBg, rgb(want))],
  ['font', 'banner', { brandFont: 'Georgia' }, { brandFont: 'Courier New' }, ['data-font', 'Verdana'], (m, want) => assert.match(m.ctaFont, new RegExp(want.split(' ')[0]))],
  ['button text', 'banner', { shopNowText: 'Global text' }, { shopNowText: 'Widget text' }, ['data-button-text', 'Block text'], (m, want) => assert.equal(m.ctaText, want)],
  ['heading colour', 'carousel', { carousel: { headingColor: RED } }, { carousel: { headingColor: BLUE } }, ['data-heading-color', GREEN], (m, want) => assert.equal(m.title.color, rgb(want))],
  ['heading font', 'carousel', { carousel: { headingFont: 'Georgia' } }, { carousel: { headingFont: 'Courier New' } }, ['data-heading-font', 'Verdana'], (m, want) => assert.match(m.title.family, new RegExp(want.split(' ')[0]))],
  ['product text colour', 'carousel', { tileType: 'below', carousel: { detailsColor: RED } }, { carousel: { detailsColor: BLUE } }, ['data-text-color', GREEN], (m, want) => assert.equal(m.metaColor, rgb(want))],
  ['feed button colour', 'carousel', { tileType: 'feed', carousel: { feedAtcColor: RED } }, { carousel: { feedAtcColor: BLUE } }, ['data-feed-button-color', GREEN], (m, want) => assert.equal(m.ctaBg, rgb(want))],
  ['feed button text colour', 'carousel', { tileType: 'feed', carousel: { feedAtcTextColor: RED } }, { carousel: { feedAtcTextColor: BLUE } }, ['data-feed-button-text-color', GREEN], (m, want) => assert.equal(m.ctaColor, rgb(want))],
  ['story ring colour', 'stories', { stories: { borderColor: RED } }, { stories: { borderColor: BLUE } }, ['data-story-ring-color', GREEN], (m, want) => assert.equal(m.storyRing, rgb(want))],
  ['story label colour', 'stories', { stories: { titleColor: RED } }, { stories: { titleColor: BLUE } }, ['data-story-label-color', GREEN], (m, want) => assert.equal(m.lblColor, rgb(want))],
  ['banner bar colour', 'banner', { banner: { background: RED } }, { banner: { background: BLUE } }, ['data-banner-bg', GREEN], (m, want) => assert.equal(m.bg, rgb(want))],
];
const wantOf = { 'data-brand-color': GREEN };
for (const [name, type, global, override, [attr, attrValue], check] of LOOK) {
  const ovKey = Object.keys(override)[0];
  const ovValue = typeof override[ovKey] === 'object' ? Object.values(override[ovKey])[0] : override[ovKey];
  const gValue = typeof global[Object.keys(global).find((k) => k !== 'tileType')] === 'object' ? Object.values(global[Object.keys(global).find((k) => k !== 'tileType' && typeof global[k] === 'object')])[0] : global[Object.keys(global).find((k) => k !== 'tileType')];
  const base = type === 'banner' ? { banner: { showCta: true } } : {};
  const merge = (g) => ({ ...base, ...g, ...(g.banner && base.banner ? { banner: { ...base.banner, ...g.banner } } : {}) });
  run(`look, global setting: ${name}`, { type, global: merge(global) }, (m) => check(m, gValue));
  run(`look, widget override beats global: ${name}`, { type, global: merge(global), overrides: override }, (m) => check(m, ovValue));
  run(`look, theme block beats widget and global: ${name}`, { type, global: merge(global), overrides: override, attrs: { [attr]: attrValue } }, (m) => check(m, attrValue));
}
run('look: widget colour does not leak into the global look (second widget keeps the global colour)', banner({ brandColor: RED }), (m) => assert.equal(m.ctaBg, rgb(RED)));
run('look: show view counts per widget', { type: 'carousel', global: { showViews: false }, overrides: { showViews: true } }, (m) => assert.equal(m.counts.views, 4));
run('look: heading weight per widget', { type: 'carousel', global: { carousel: { headingWeight: '400' } }, overrides: { carousel: { headingWeight: '800' } } }, (m) => assert.equal(m.title.weight, '800'));
run('look: invalid colour in a theme block is ignored', { type: 'banner', global: { brandColor: RED, banner: { showCta: true } }, attrs: { 'data-brand-color': 'red; background:url(x)' } }, (m) => assert.equal(m.ctaBg, rgb(RED)));
run('look: invalid font in a theme block is ignored', { type: 'carousel', global: { brandFont: 'Georgia' }, attrs: { 'data-font': 'x}</style><script>window.__pwn=1</script>' } }, (m) => assert.match(m.title.family, /Georgia/));
run('look: button text with markup is shown as plain text', { type: 'banner', global: { banner: { showCta: true } }, attrs: { 'data-button-text': 'Buy <b>now</b>' } }, (m) => assert.notEqual(m.ctaText, 'Buy <b>now</b>'));

test('look: the API accepts good colours, fonts and text, and rejects unsafe ones', async () => {
  const mk = (overrides) => api('POST', '/api/widgets', { name: 'Look check', type: 'carousel', page: 'home', scope: 'custom', videoIds: [], overrides });
  for (const good of [{ brandColor: '#ffd94a' }, { brandFont: 'Poppins' }, { brandFont: "Playfair Display, serif" }, { shopNowText: 'Buy now 🛍' }, { carousel: { headingColor: '#4D4747', headingWeight: '700' } }, { stories: { borderColor: '#000000' } }, { banner: { background: '#ffffff' } }, { showViews: true }]) {
    const r = await mk(good); assert.ok([200, 201].includes(r.status), JSON.stringify(good) + ' ' + JSON.stringify(r.json));
  }
  for (const bad of [{ brandColor: 'red' }, { brandColor: '#fff' }, { brandColor: '#gggggg' }, { brandColor: 'url(javascript:alert(1))' }, { brandFont: 'a;b' }, { brandFont: '}</style><script>' }, { brandFont: 'x'.repeat(61) }, { brandFont: '' }, { shopNowText: '<b>hi</b>' }, { shopNowText: 'x'.repeat(41) }, { shopNowText: '   ' }, { carousel: { headingWeight: '900' } }, { carousel: { headingColor: 5 } }, { showViews: 'yes' }, { banner: { background: '#12345' } }]) {
    const r = await mk(bad); assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

// ---------------- Desktop and mobile are fully independent (banner mode, fit, focus) ----------------
const BN = (o = {}) => ({ banner: { showCta: true, ...o } });
run('independent: desktop exact height, mobile shape 1:1 gives 430 x 430 on a 430 px phone', { type: 'banner', global: BN({ heightModeDesktop: 'fixed', desktopHeight: 520, heightModeMobile: 'ratio', aspectPortrait: '1/1' }), device: 'phone430' }, (m) => { near(m.tiles[0].w, 430, 'width'); near(m.tiles[0].h, 430, 'height'); });
run('independent: the same settings keep the desktop at its exact height', { type: 'banner', global: BN({ heightModeDesktop: 'fixed', desktopHeight: 520, heightModeMobile: 'ratio', aspectPortrait: '1/1' }) }, (m) => near(m.tiles[0].h, 520, 'desktop height'));
run('independent: desktop shape 2:1, mobile exact 300 (desktop)', { type: 'banner', global: BN({ heightModeDesktop: 'ratio', aspectLandscape: '2/1', heightModeMobile: 'fixed', mobileHeight: 300 }) }, (m) => near(m.tiles[0].h, m.tiles[0].w / 2, 'desktop 2:1', 2));
run('independent: desktop shape 2:1, mobile exact 300 (mobile)', { type: 'banner', global: BN({ heightModeDesktop: 'ratio', aspectLandscape: '2/1', heightModeMobile: 'fixed', mobileHeight: 300 }), device: 'mobile' }, (m) => near(m.tiles[0].h, 300, 'mobile height'));
run('independent: the older single mode still applies to both when per-device is empty', { type: 'banner', global: BN({ heightMode: 'ratio', aspectLandscape: '2/1', aspectPortrait: '1/1' }), device: 'mobile' }, (m) => near(m.tiles[0].h, m.tiles[0].w, 'mobile square via the old setting'));
run('independent: per-device mode beats the older single mode', { type: 'banner', global: BN({ heightMode: 'fixed', desktopHeight: 480, heightModeMobile: 'ratio', aspectPortrait: '1/1' }) }, (m) => near(m.tiles[0].h, 480, 'desktop still exact'));
run('independent: widget sets its own mobile mode', { type: 'banner', global: BN({ heightMode: 'fixed', mobileHeight: 420 }), overrides: { banner: { heightModeMobile: 'ratio', aspectPortrait: '1/1' } }, device: 'mobile' }, (m) => near(m.tiles[0].h, m.tiles[0].w, 'square on this widget only'));
run('independent: widget mobile mode leaves its desktop alone', { type: 'banner', global: BN({ heightMode: 'fixed', desktopHeight: 480 }), overrides: { banner: { heightModeMobile: 'ratio', aspectPortrait: '1/1' } } }, (m) => near(m.tiles[0].h, 480, 'desktop exact'));
run('independent: full screen still wins', { type: 'banner', global: BN({ heightModeMobile: 'ratio', aspectPortrait: '1/1', fullScreen: true }), device: 'mobile' }, (m) => near(m.tiles[0].h, 844, 'viewport height', 2));
run('independent: theme block shape for mobile does not change desktop', { type: 'banner', global: BN({ heightMode: 'fixed', desktopHeight: 480 }), attrs: { 'data-banner-ratio-mobile': '1/1' } }, (m) => near(m.tiles[0].h, 480, 'desktop unchanged'));
run('independent: theme block shape for mobile applies on mobile', { type: 'banner', global: BN({ heightMode: 'fixed', mobileHeight: 420 }), attrs: { 'data-banner-ratio-mobile': '1/1' }, device: 'phone430' }, (m) => { near(m.tiles[0].w, 430, 'w'); near(m.tiles[0].h, 430, 'h'); });
run('independent: theme block exact desktop height does not change mobile', { type: 'banner', global: BN({ heightMode: 'ratio', aspectPortrait: '1/1' }), attrs: { 'data-banner-h-desktop': '600' }, device: 'mobile' }, (m) => near(m.tiles[0].h, m.tiles[0].w, 'mobile stays square'));
run('independent: banner video fit, desktop contain / mobile cover (desktop)', { type: 'banner', global: BN({ fitDesktop: 'contain', fitMobile: 'cover' }) }, (m) => assert.equal(m.fit, 'contain'));
run('independent: banner video fit, desktop contain / mobile cover (mobile)', { type: 'banner', global: BN({ fitDesktop: 'contain', fitMobile: 'cover' }), device: 'mobile' }, (m) => assert.equal(m.fit, 'cover'));
run('independent: banner video fit, mobile contain only', { type: 'banner', global: BN({ fitMobile: 'contain' }), device: 'mobile' }, (m) => assert.equal(m.fit, 'contain'));
run('independent: banner video fit, mobile contain leaves desktop alone', { type: 'banner', global: BN({ fitMobile: 'contain' }) }, (m) => assert.equal(m.fit, 'cover'));
run('independent: banner crop focus, desktop top / mobile middle (desktop)', { type: 'banner', global: BN({ focusDesktop: 'top', focusMobile: 'center' }) }, (m) => assert.match(m.objPos, /^50% 0%|center top|50% 0px/));
run('independent: banner crop focus, desktop top / mobile middle (mobile)', { type: 'banner', global: BN({ focusDesktop: 'top', focusMobile: 'center' }), device: 'mobile' }, (m) => assert.match(m.objPos, /^50% 50%|center center|center$/));
run('independent: tile video fit, desktop contain / mobile cover (desktop)', { type: 'carousel', global: { carousel: { tileFitDesktop: 'contain', tileFitMobile: 'cover' } } }, (m) => assert.equal(m.fit, 'contain'));
run('independent: tile video fit, desktop contain / mobile cover (mobile)', { type: 'carousel', global: { carousel: { tileFitDesktop: 'contain', tileFitMobile: 'cover' } }, device: 'mobile' }, (m) => assert.equal(m.fit, 'cover'));
run('independent: widget fit override per device', { type: 'carousel', global: { carousel: { tileFit: 'cover' } }, overrides: { carousel: { tileFitMobile: 'contain' } }, device: 'mobile' }, (m) => assert.equal(m.fit, 'contain'));
run('independent: theme block fit for mobile only', { type: 'carousel', attrs: { 'data-tile-fit-mobile': 'contain' } }, (m) => assert.equal(m.fit, 'cover'));
run('independent: theme block fit for both replaces saved per-device values', { type: 'carousel', global: { carousel: { tileFitMobile: 'cover' } }, attrs: { 'data-tile-fit': 'contain' }, device: 'mobile' }, (m) => assert.equal(m.fit, 'contain'));
run('independent: theme block device fit beats its own "both" value', { type: 'banner', global: BN(), attrs: { 'data-banner-fit': 'contain', 'data-banner-fit-mobile': 'cover' }, device: 'mobile' }, (m) => assert.equal(m.fit, 'cover'));
test('independent: the API accepts the per-device settings and rejects junk', async () => {
  const mk = (o) => api('POST', '/api/widgets', { name: 'Per-device check', type: 'banner', page: 'home', scope: 'custom', videoIds: [], overrides: o });
  for (const good of [{ banner: { heightModeDesktop: 'fixed', heightModeMobile: 'ratio', fitDesktop: 'contain', fitMobile: 'cover', focusDesktop: 'top', focusMobile: 'bottom' } }, { carousel: { tileFitDesktop: 'contain', tileFitMobile: 'cover' } }]) assert.ok([200, 201].includes((await mk(good)).status), JSON.stringify(good));
  for (const bad of [{ banner: { heightModeMobile: 'tall' } }, { banner: { fitDesktop: 'stretch' } }, { banner: { focusMobile: 'left' } }, { carousel: { tileFitMobile: 5 } }]) assert.equal((await mk(bad)).status, 400, JSON.stringify(bad));
});

// ---------------- A page whose address has an emoji handle (percent-encoded) ----------------
test('widget limited to an emoji product handle shows on that product page and nowhere else', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const handle = '🎁-test-product';
  await api('PUT', '/api/settings', {});
  const w = (await api('POST', '/api/widgets', { name: 'Emoji handle', type: 'carousel', page: 'product', scope: 'custom', enabled: true, videoIds: ids, productHandles: [handle], heading: '' })).json.id;
  const visit = async (path) => {
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://localhost:8124${path}?w=${w}&attrs=%7B%7D`);
    await new Promise((r) => setTimeout(r, 1500));
    const n = await page.evaluate(() => { const h = document.querySelector('[data-tuco-video]'); return h && h.shadowRoot ? h.shadowRoot.querySelectorAll('.tile').length : 0; });
    await page.close(); return n;
  };
  assert.ok((await visit('/products/' + encodeURIComponent(handle))) >= 1, 'shows on the emoji product page');
  assert.equal(await visit('/products/another-product'), 0, 'hidden on other products');
});


// ---------------- Video section: a heading beside one portrait video ----------------
const SHAPES = { feature: { shapeDesktop: '5/6', shapeMobile: '4/5' } };
const featureRead = async (device, overrides = {}) => {
  const w = await api('POST', '/api/widgets', { name: 'QA section ' + Math.random().toString(36).slice(2, 7), type: 'feature', page: 'home', scope: 'custom', enabled: true, videoIds: [ids[0]], heading: 'for tangled and itchy hair', overrides });
  assert.ok(w.status < 300, JSON.stringify(w.json));
  const page = await browser.newPage();
  await page.setViewport(device === 'mobile' ? { width: 390, height: 800, deviceScaleFactor: 1, isMobile: false } : { width: 1200, height: 900, deviceScaleFactor: 1, isMobile: false });
  try {
    await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=%7B%7D`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); const v = h && h.shadowRoot && h.shadowRoot.querySelector('.v > div'); return v && v.shadowRoot && v.shadowRoot.querySelector('.tile'); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 250));
    return await page.evaluate(() => {
      const sr = document.querySelector('[data-tuco-video]').shadowRoot, h = sr.querySelector('.h').getBoundingClientRect();
      const tile = sr.querySelector('.v > div').shadowRoot.querySelector('.tile').getBoundingClientRect();
      return { text: sr.querySelector('.h').textContent, hx: h.x, hr: h.right, hy: h.y + h.height / 2, tx: tile.x, tr: tile.right, ty: tile.y + tile.height / 2, tw: tile.width, th: tile.height, tTop: tile.y, hBottom: h.bottom, one: sr.querySelectorAll('.v > div').length };
    });
  } finally { await page.close(); }
};
test('video section: desktop shows the heading left of a 5:6 video, centred vertically', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const m = await featureRead('desktop', SHAPES);
  assert.equal(m.text, 'for tangled and itchy hair'); assert.equal(m.one, 1);
  assert.ok(m.hr <= m.tx + 1, 'heading is left of the video'); near(m.tw / m.th, 5 / 6, 'portrait 5:6', 0.02); near(m.hy, m.ty, 'vertically centred', 3);
});
test('video section: phones stack a centred heading above a 4:5 video', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const m = await featureRead('mobile', SHAPES);
  assert.ok(m.hBottom <= m.tTop + 1, 'heading is above the video'); near(m.tw / m.th, 4 / 5, 'portrait 4:5', 0.02);
});
test('video section: the video can go on the left and the shape can change', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const m = await featureRead('desktop', { feature: { videoSide: 'left', videoWidthDesktop: 50 }, banner: { aspectLandscape: '1/1' } });
  assert.ok(m.tr <= m.hx + 1, 'video is left of the heading'); near(m.tw / m.th, 1, 'square', 0.02);
});

test('video section: with no heading it is just the video, as wide as the space it is given', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const w = await api('POST', '/api/widgets', { name: 'QA video only ' + Math.random().toString(36).slice(2, 7), type: 'feature', page: 'home', scope: 'custom', enabled: true, videoIds: [ids[0]], heading: '', overrides: SHAPES });
  assert.ok(w.status < 300, JSON.stringify(w.json));
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 900, deviceScaleFactor: 1, isMobile: false });
  try {
    await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=%7B%7D`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); const v = h && h.shadowRoot && h.shadowRoot.querySelector('.v > div'); return v && v.shadowRoot && v.shadowRoot.querySelector('.tile'); }, { timeout: 10000 });
    const m = await page.evaluate(() => { const h = document.querySelector('[data-tuco-video]'); const sr = h.shadowRoot; const t = sr.querySelector('.v > div').shadowRoot.querySelector('.tile').getBoundingClientRect(); return { host: h.getBoundingClientRect().width, tw: t.width, th: t.height, heading: !!sr.querySelector('.h') }; });
    assert.equal(m.heading, false); near(m.tw, m.host, 'fills its column', 2); near(m.tw / m.th, 4 / 5, 'phone-width screens use 4:5', 0.02);
  } finally { await page.close(); }
});

// ---------------- Click-through link ----------------
const clickTile = (page) => page.evaluate(() => document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile').click());
test('click link: a block link sends people there instead of opening the player', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const r = await render(browser, ids, { type: 'banner', attrs: { 'data-link': '/collections/all' } });
  try {
    await Promise.all([r.page.waitForNavigation({ timeout: 8000 }), clickTile(r.page)]);
    assert.equal(new URL(r.page.url()).pathname, '/collections/all');
  } finally { await r.close(); }
});
test('click link: a widget link works too, and can open in a new tab', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const r = await render(browser, ids, { type: 'carousel', overrides: { clickLink: 'https://example.com/sale', clickTarget: 'new' } });
  try {
    const popup = new Promise((res) => browser.once('targetcreated', (t) => res(t.url())));
    await clickTile(r.page);
    const url = await Promise.race([popup, new Promise((res) => setTimeout(() => res('none'), 8000))]);
    assert.match(url, /example\.com\/sale/);
    assert.equal(new URL(r.page.url()).pathname, '/page', 'this page stayed where it was');
  } finally { await r.close(); }
});
test('click link: without a link the video player still opens, and unsafe links are ignored', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const r = await render(browser, ids, { type: 'carousel', attrs: { 'data-link': 'javascript:alert(1)' } });
  try {
    await clickTile(r.page); await new Promise((x) => setTimeout(x, 600));
    assert.equal(new URL(r.page.url()).pathname, '/page', 'no navigation');
    assert.ok(await r.page.evaluate(() => [...document.querySelectorAll('div')].some((d) => d.shadowRoot && d.shadowRoot.querySelector('.slide'))), 'the player opened');
  } finally { await r.close(); }
});

// ---------------- One banner widget, two videos: desktop and phone switch by themselves ----------------
test('paired banner: one widget id shows the desktop video on desktop and the phone video on phones, and switches live', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const w = await api('POST', '/api/widgets', { name: 'QA paired ' + Math.random().toString(36).slice(2, 7), type: 'banner', page: 'home', scope: 'custom', enabled: true, videoIds: [ids[0], ids[1]], overrides: { deviceOnly: { [ids[0]]: 'desktop', [ids[1]]: 'mobile' }, banner: { aspectLandscape: '2/1', aspectPortrait: '5/4', heightModeDesktop: 'ratio', heightModeMobile: 'ratio' } } });
  assert.ok(w.status < 300, JSON.stringify(w.json));
  const page = await browser.newPage();
  const read = () => page.evaluate(() => { const sr = document.querySelector('[data-tuco-video]').shadowRoot; const tiles = [...sr.querySelectorAll('.tile')]; const t = tiles[0].getBoundingClientRect(); return { tiles: tiles.length, id: tiles[0].querySelector('video').getAttribute('data-id'), ratio: +(t.width / t.height).toFixed(2), dots: sr.querySelectorAll('.dots i').length }; });
  try {
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1, isMobile: false });
    await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=%7B%7D`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); return h && h.shadowRoot && h.shadowRoot.querySelector('.tile'); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    let m = await read();
    assert.equal(m.tiles, 1, 'one video at a time'); assert.equal(m.id, ids[0], 'desktop video on desktop'); near(m.ratio, 2, 'desktop shape 2:1', 0.03); assert.equal(m.dots, 0);
    await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 1, isMobile: false });
    await page.waitForFunction((id) => { const h = document.querySelector('[data-tuco-video]'); const t = h.shadowRoot.querySelector('.tile video'); return t && t.getAttribute('data-id') === id; }, { timeout: 6000 }, ids[1]);
    m = await read();
    assert.equal(m.tiles, 1); assert.equal(m.id, ids[1], 'phone video on phones, switched without a reload'); near(m.ratio, 1.25, 'phone shape 5:4', 0.03);
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1, isMobile: false });
    await page.waitForFunction((id) => { const t = document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile video'); return t && t.getAttribute('data-id') === id; }, { timeout: 6000 }, ids[0]);
    near((await read()).ratio, 2, 'back to the desktop shape', 0.03);
  } finally { await page.close(); }
});

// ---------------- Banner shape "Match the video" ----------------
test('banner: "Match the video" takes the shape of the video itself', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const r = await render(browser, ids, { type: 'banner', overrides: { banner: { aspectLandscape: 'auto', aspectPortrait: 'auto', heightModeDesktop: 'ratio', heightModeMobile: 'ratio' } } });
  try {
    await r.page.waitForFunction(() => { const v = document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile video'); return v && v.readyState >= 1; }, { timeout: 10000 });
    await new Promise((x) => setTimeout(x, 400));
    const m = await r.page.evaluate(() => { const t = document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile'); const v = t.querySelector('video'); const b = t.getBoundingClientRect(); return { box: b.width / b.height, video: v.videoWidth / v.videoHeight }; });
    near(m.box, Math.min(2.4, Math.max(0.5, m.video)), 'box follows the video shape', 0.03);
  } finally { await r.close(); }
});

// ---------------- Instant repeat visits ----------------
test('speed: on a repeat visit the widget draws from its saved answer even before the API replies', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const r = await render(browser, ids, { type: 'banner', overrides: { banner: { aspectLandscape: '2/1', heightModeDesktop: 'ratio' } } });
  try {
    await r.page.setRequestInterception(true);
    r.page.on('request', (q) => { if (/\/api\/public\/config/.test(q.url())) q.abort(); else q.continue(); });
    await r.page.reload({ waitUntil: 'domcontentloaded' });
    await r.page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); return h && h.shadowRoot && h.shadowRoot.querySelector('.tile'); }, { timeout: 8000 });
    const note = await r.page.evaluate(() => document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile') ? 'drawn' : 'empty');
    assert.equal(note, 'drawn');
  } finally { await r.close(); }
});

// ---------------- Click behaviour ----------------
const playerOpens = (page) => page.evaluate(() => [...document.querySelectorAll('div')].some((d) => d.shadowRoot && d.shadowRoot.querySelector('.slide')));
test('click behaviour: a banner does nothing when clicked, a carousel opens the player', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const a = await render(browser, ids, { type: 'banner' });
  try { await clickTile(a.page); await new Promise((x) => setTimeout(x, 500)); assert.equal(await playerOpens(a.page), false, 'banner: no player'); } finally { await a.close(); }
  const b = await render(browser, ids, { type: 'carousel' });
  try { await clickTile(b.page); await new Promise((x) => setTimeout(x, 500)); assert.equal(await playerOpens(b.page), true, 'carousel: player opens'); } finally { await b.close(); }
});
test('click behaviour: it can be switched either way per widget or per block', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const a = await render(browser, ids, { type: 'banner', overrides: { clickAction: 'player' } });
  try { await clickTile(a.page); await new Promise((x) => setTimeout(x, 500)); assert.equal(await playerOpens(a.page), true, 'banner set to open the player'); } finally { await a.close(); }
  const b = await render(browser, ids, { type: 'carousel', attrs: { 'data-click-action': 'none' } });
  try { await clickTile(b.page); await new Promise((x) => setTimeout(x, 500)); assert.equal(await playerOpens(b.page), false, 'carousel set to do nothing'); } finally { await b.close(); }
});

test('video section: by default it matches the shape of its own video', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const w = await api('POST', '/api/widgets', { name: 'QA section auto ' + Math.random().toString(36).slice(2, 7), type: 'feature', page: 'home', scope: 'custom', enabled: true, videoIds: [ids[0]], heading: '', overrides: {} });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1, isMobile: false });
  try {
    await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=%7B%7D`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const h = document.querySelector('[data-tuco-video]'); const v = h && h.shadowRoot && h.shadowRoot.querySelector('.v > div'); const vid = v && v.shadowRoot && v.shadowRoot.querySelector('.tile video'); return vid && vid.readyState >= 1; }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 400));
    const m = await page.evaluate(() => { const t = document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.v > div').shadowRoot.querySelector('.tile'); const v = t.querySelector('video'); const b = t.getBoundingClientRect(); return { box: b.width / b.height, video: v.videoWidth / v.videoHeight }; });
    near(m.box, Math.min(2.4, Math.max(0.5, m.video)), 'box follows the video', 0.03);
  } finally { await page.close(); }
});

// ---------------- Widgets far below the fold wait ----------------
test('speed: a widget far below the first screen only loads when the shopper scrolls near it', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const w = await api('POST', '/api/widgets', { name: 'QA far below ' + Math.random().toString(36).slice(2, 7), type: 'carousel', page: 'home', scope: 'custom', enabled: true, videoIds: ids, heading: 'Far below' });
  const first = await render(browser, ids, { type: 'banner' });
  try {
    const asked = [];
    first.page.on('request', (q) => { const m = q.url().match(/\/api\/public\/config\?widget=([\w-]+)/); if (m) asked.push(m[1]); });
    await first.page.evaluate((id) => { const sp = document.createElement('div'); sp.style.height = '6000px'; sp.textContent = ' '; document.body.appendChild(sp); const h = document.createElement('div'); h.setAttribute('data-tuco-video', ''); h.setAttribute('data-widget', id); h.id = 'far'; document.body.appendChild(h); }, w.json.id);
    await new Promise((r) => setTimeout(r, 900));
    assert.ok(!asked.includes(w.json.id), 'no request while it is far below');
    await first.page.evaluate(() => document.getElementById('far').scrollIntoView());
    await first.page.waitForFunction(() => { const h = document.getElementById('far'); return h && h.shadowRoot && h.shadowRoot.querySelector('.tile'); }, { timeout: 10000 });
    assert.ok(asked.includes(w.json.id), 'it asks once the shopper is near');
  } finally { await first.close(); }
});

// ---------------- Reserved space while loading ----------------
test('reserved space: the placeholder class is cleared once the banner has drawn', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const r = await render(browser, ids, { type: 'banner', attrs: { class: 'loopy-hold' }, overrides: { banner: { aspectLandscape: '2/1', heightModeDesktop: 'ratio' } } });
  try {
    await new Promise((x) => setTimeout(x, 400));
    assert.equal(await r.page.evaluate(() => document.querySelector('[data-tuco-video]').classList.contains('loopy-hold')), false);
  } finally { await r.close(); }
});

test('reserved space: a "match the video" banner starts at the kept shape, then settles once on the video\'s own shape', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const w = await api('POST', '/api/widgets', { name: 'QA hold ' + Math.random().toString(36).slice(2, 7), type: 'banner', page: 'home', scope: 'custom', enabled: true, videoIds: [ids[0]], overrides: { banner: { aspectLandscape: 'auto', aspectPortrait: 'auto', heightModeDesktop: 'ratio', heightModeMobile: 'ratio' } } });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 800, deviceScaleFactor: 1, isMobile: false });
  await page.evaluateOnNewDocument(() => { window.__hs = []; const tick = () => { const h = document.querySelector('[data-tuco-video]'); const t = h && h.shadowRoot && h.shadowRoot.querySelector('.tile'); if (t) window.__hs.push(Math.round(h.getBoundingClientRect().height)); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  try {
    await page.goto(`http://localhost:${PORT}/page?w=${w.json.id}&attrs=${encodeURIComponent(JSON.stringify({ class: 'loopy-hold', style: 'display:block;aspect-ratio:1/1' }))}`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 2500));
    const hs = await page.evaluate(() => window.__hs);
    assert.ok(hs.length > 5, 'measured');
    near(hs[0], 400, 'the first drawn height is the kept 400 px square, not a tall guess', 3);
    const distinct = [...new Set(hs)];
    assert.ok(distinct.length <= 2, 'at most one change (to the real shape): ' + distinct.join(', '));
  } finally { await page.close(); }
});

test('smooth start: with a thumbnail the video stays invisible until it plays, then fades in', { skip: !haveChrome && 'Chrome is not installed' }, async () => {
  const v = (await api('GET', '/api/videos')).json.videos.find((x) => x.id === ids[0]);
  await api('PUT', '/api/videos/' + ids[0], { ...v, poster: `http://localhost:${PORT}/poster-test.jpg` });
  const r = await render(browser, ids, { type: 'banner', overrides: { banner: { aspectLandscape: '2/1', heightModeDesktop: 'ratio' } } });
  try {
    await r.page.waitForFunction(() => { const t = document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile'); return t && t.classList.contains('hasth'); }, { timeout: 8000 });
    await r.page.waitForFunction(() => { const t = document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile'); return t.classList.contains('pl'); }, { timeout: 8000 });
    await new Promise((x) => setTimeout(x, 700));
    assert.equal(await r.page.evaluate(() => getComputedStyle(document.querySelector('[data-tuco-video]').shadowRoot.querySelector('.tile video')).opacity), '1', 'visible once playing');
  } finally { await r.close(); await api('PUT', '/api/videos/' + ids[0], { ...v, poster: v.poster || '' }); }
});
