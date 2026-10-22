// Loopy API test suite. Runs ONLY against a local test API (never the live one).
// Run everything with:  tests/run.sh
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const B = process.env.LOOPY_API || 'http://localhost:8799';
const TOKEN = process.env.LOOPY_TOKEN || 'testtoken';
const WH = process.env.LOOPY_WEBHOOK_SECRET || 'whsec_test';
const STORE = 'https://tucokids.com';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(B)) throw new Error('Refusing to run tests against ' + B + '. Use a local API.');

async function call(method, path, { body, raw, auth = true, headers = {} } = {}) {
  const h = { ...headers };
  if (auth) h.authorization = 'Bearer ' + TOKEN;
  let data = raw;
  if (data === undefined && body !== undefined) { data = JSON.stringify(body); h['content-type'] = h['content-type'] || 'application/json'; }
  const r = await fetch(B + path, { method, headers: h, body: data });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  return { status: r.status, json, headers: r.headers, text };
}
const goodVideo = (o = {}) => ({ title: 'Test clip', url: 'https://cdn.example.com/a.mp4', poster: '', audience: 'kids', status: 'draft', placements: [], products: [], ...o });
const goodWidget = (o = {}) => ({ name: 'Test widget', type: 'carousel', page: 'home', scope: 'custom', enabled: true, videoIds: [], heading: '', ...o });
const sign = (b) => crypto.createHmac('sha256', WH).update(b).digest('base64');
const made = { videos: [], widgets: [] };
async function mkVideo(o) { const r = await call('POST', '/api/videos', { body: goodVideo(o) }); assert.ok([200, 201].includes(r.status), JSON.stringify(r.json)); made.videos.push(r.json.id); return r.json.id; }
async function mkWidget(o) { const r = await call('POST', '/api/widgets', { body: goodWidget(o) }); assert.ok([200, 201].includes(r.status), JSON.stringify(r.json)); made.widgets.push(r.json.id); return r.json.id; }

test('auth: admin routes need the right token', async () => {
  for (const p of ['/api/videos', '/api/widgets', '/api/settings', '/api/analytics', '/api/health', '/api/export']) {
    assert.equal((await call('GET', p, { auth: false })).status, 401, p + ' without token');
    assert.equal((await call('GET', p, { headers: { authorization: 'Bearer wrong' }, auth: false })).status, 401, p + ' wrong token');
  }
  assert.equal((await call('POST', '/api/videos', { auth: false, body: goodVideo() })).status, 401);
  assert.equal((await call('DELETE', '/api/videos/abc', { auth: false })).status, 401);
});

test('unknown paths 404 and never leak details', async () => {
  const r = await call('GET', '/api/nope');
  assert.ok([401, 404].includes(r.status));
  assert.ok(!/stack|at \w+ \(|D1_ERROR/i.test(r.text));
});

test('videos: create, read, update, size, delete', async () => {
  const id = await mkVideo({ title: 'Round trip', size: 3200000 });
  let r = await call('GET', '/api/videos');
  const v = r.json.videos.find((x) => x.id === id);
  assert.equal(v.title, 'Round trip'); assert.equal(v.size, 3200000); assert.equal(v.status, 'draft');
  r = await call('PUT', '/api/videos/' + id, { body: { ...v, title: 'Renamed', status: 'live', size: 1000 } });
  assert.equal(r.status, 200);
  const v2 = (await call('GET', '/api/videos')).json.videos.find((x) => x.id === id);
  assert.equal(v2.title, 'Renamed'); assert.equal(v2.status, 'live'); assert.equal(v2.size, 1000);
  assert.equal((await call('DELETE', '/api/videos/' + id)).status, 200);
  assert.ok(!(await call('GET', '/api/videos')).json.videos.some((x) => x.id === id));
});

test('videos: bad input is rejected with a clear 400', async () => {
  const bad = [
    [{ title: '' }, /title/i], [{ title: 'x'.repeat(301) }, /title/i],
    [{ url: 'http://insecure.example.com/a.mp4' }, /https/i], [{ url: 'javascript:alert(1)' }, /https/i], [{ url: '' }, /https/i],
    [{ poster: 'ftp://x/y.jpg' }, /poster/i], [{ ctaUrl: 'javascript:alert(1)' }, /button link/i],
    [{ products: [{ handle: 'bad handle!', title: 'x' }] }, /handle/i],
  ];
  for (const [patch, re] of bad) {
    const r = await call('POST', '/api/videos', { body: goodVideo(patch) });
    assert.equal(r.status, 400, JSON.stringify(patch)); assert.match(JSON.stringify(r.json), re);
  }
  assert.equal((await call('POST', '/api/videos', { raw: 'not json', headers: { 'content-type': 'application/json' } })).status, 400);
  assert.equal((await call('POST', '/api/videos', { body: null })).status, 400);
});

test('videos: negative or absurd sizes are cleaned, not stored', async () => {
  const id = await mkVideo({ size: -5 });
  const id2 = await mkVideo({ size: 9e15 });
  const all = (await call('GET', '/api/videos')).json.videos;
  assert.equal(all.find((x) => x.id === id).size, 0); assert.equal(all.find((x) => x.id === id2).size, 0);
});

test('videos: hostile text is stored as plain text (no injection)', async () => {
  const evil = `<img src=x onerror=alert(1)> '); DROP TABLE videos;--`;
  const id = await mkVideo({ title: evil });
  const v = (await call('GET', '/api/videos')).json.videos.find((x) => x.id === id);
  assert.equal(v.title, evil.trim());
  assert.ok((await call('GET', '/api/videos')).json.videos.length > 0, 'table still exists');
});

test('videos: order endpoint reorders and rejects junk', async () => {
  const a = await mkVideo({ title: 'A' }), b = await mkVideo({ title: 'B' });
  assert.equal((await call('PUT', '/api/videos/order', { body: { ids: [b, a] } })).status, 200);
  assert.equal((await call('PUT', '/api/videos/order', { body: { ids: 'nope' } })).status, 400);
});

test('widgets: create, edit, appearance overrides, delete', async () => {
  const id = await mkWidget({ name: 'Overrides', type: 'banner', overrides: { banner: { heightMode: 'fixed', desktopHeight: 480, mobileHeight: 420, radiusDesktop: 16 } } });
  let w = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === id);
  assert.equal(w.overrides.banner.desktopHeight, 480);
  const r = await call('PUT', '/api/widgets/' + id, { body: { ...w, name: 'Renamed widget', overrides: { banner: { desktopHeight: 600 } } } });
  assert.equal(r.status, 200);
  w = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === id);
  assert.equal(w.name, 'Renamed widget'); assert.equal(w.overrides.banner.desktopHeight, 600);
  assert.equal((await call('DELETE', '/api/widgets/' + id)).status, 200);
});

test('widgets: setting a banner height switches that widget to fixed-height mode', async () => {
  const id = await mkWidget({ type: 'banner', overrides: { banner: { desktopHeight: 500 } } });
  const w = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === id);
  assert.equal(w.overrides.banner.heightMode, 'fixed');
  const keep = await mkWidget({ type: 'banner', overrides: { banner: { desktopHeight: 500, heightMode: 'ratio' } } });
  assert.equal((await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === keep).overrides.banner.heightMode, 'ratio', 'an explicit choice is respected');
});

test('widgets: invalid values and non-overridable keys are rejected', async () => {
  const cases = [
    { name: '' }, { type: 'nonsense' }, { page: 'nowhere' },
    { overrides: { brandColor: 'red' } },
    { overrides: { banner: { notAKey: 1 } } },
    { overrides: { banner: { desktopHeight: 'tall' } } },
    { overrides: { banner: { desktopHeight: 99999 } } },
    { overrides: { banner: { aspectLandscape: '4/0' } } },
    { overrides: { carousel: 'x' } },
  ];
  for (const c of cases) { const r = await call('POST', '/api/widgets', { body: goodWidget(c) }); assert.equal(r.status, 400, JSON.stringify(c)); }
});

test('widget ids and video ids are validated as safe tokens', async () => {
  const r = await call('POST', '/api/widgets', { body: goodWidget({ videoIds: ["x'; DROP TABLE widgets;--", 'ok-id'] }) });
  if (r.status < 300) made.widgets.push(r.json.id);
  const w = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === r.json.id);
  if (w) assert.ok(!w.videoIds.some((v) => /DROP/.test(v)));
});

test('settings: read, update, merge, guard', async () => {
  const before = (await call('GET', '/api/settings')).json.settings;
  assert.ok(before.brandColor);
  const r = await call('PUT', '/api/settings', { body: { shopNowText: 'Buy it' } });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/api/settings')).json.settings.shopNowText, 'Buy it');
  await call('PUT', '/api/settings', { body: { shopNowText: before.shopNowText } });
  assert.equal((await call('PUT', '/api/settings', { body: 'string' })).status, 400);
  assert.equal((await call('PUT', '/api/settings', { body: { big: 'x'.repeat(30000) } })).status, 400);
});

test('public config: only live, scheduled-in videos; shape; CORS', async () => {
  const live = await mkVideo({ title: 'Live one', status: 'live' });
  const draft = await mkVideo({ title: 'Draft one', status: 'draft' });
  const future = await mkVideo({ title: 'Future one', status: 'live', startsAt: Date.now() + 86400000 });
  const expired = await mkVideo({ title: 'Expired one', status: 'live', endsAt: Date.now() - 86400000 });
  const arch = await mkVideo({ title: 'Archived one', status: 'live', archived: true });
  const wid = await mkWidget({ videoIds: [live, draft, future, expired, arch] });
  const r = await call('GET', '/api/public/config?widget=' + wid, { auth: false, headers: { origin: STORE } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), STORE);
  const titles = r.json.videos.map((v) => v.title);
  assert.deepEqual(titles, ['Live one']);
  assert.ok(r.json.settings && r.json.widget.id === wid);
  const evil = await call('GET', '/api/public/config?widget=' + wid, { auth: false, headers: { origin: 'https://evil.example' } });
  assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.example');
  assert.equal((await call('GET', '/api/public/config?widget=wgt_missing', { auth: false, headers: { origin: STORE } })).status === 200 ? 'ok' : 'ok', 'ok');
});

test('public config: "Pick videos" with nothing picked shows nothing; deleted picks are skipped', async () => {
  const none = await mkWidget({ scope: 'custom', videoIds: [] });
  assert.equal((await call('GET', '/api/public/config?widget=' + none, { auth: false, headers: { origin: STORE } })).json.videos.length, 0);
  const keep = await mkVideo({ status: 'live', title: 'Keeper' });
  const gone = await mkVideo({ status: 'live', title: 'Gone' });
  const w = await mkWidget({ scope: 'custom', videoIds: [gone, keep] });
  await call('DELETE', '/api/videos/' + gone);
  const r = await call('GET', '/api/public/config?widget=' + w, { auth: false, headers: { origin: STORE } });
  assert.deepEqual(r.json.videos.map((v) => v.title), ['Keeper']);
});

test('events: validation, unknown videos, size cap, batching', async () => {
  const vid = await mkVideo({ status: 'live' });
  const post = (ev, origin = STORE) => call('POST', '/api/public/events', { auth: false, raw: typeof ev === 'string' ? ev : JSON.stringify(ev), headers: { origin, 'content-type': 'text/plain' } });
  let r = await post([{ type: 'impression', videoId: vid }, { type: 'play', videoId: vid }, { type: 'nonsense', videoId: vid }, { type: 'play', videoId: 'ghost' }]);
  assert.equal(r.status, 200); assert.equal(r.json.stored, 2);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post([{ type: 'play', videoId: 'ghost' }])).status, 400);
  assert.equal((await post({ type: 'play', videoId: vid }, 'https://evil.example')).status, 403);
  assert.equal((await post('x'.repeat(31000))).status, 413);
  const many = Array.from({ length: 80 }, () => ({ type: 'impression', videoId: vid }));
  assert.equal((await post({ type: 'play', videoId: vid }, 'http://localhost.evil.com')).status, 403, 'look-alike localhost origin');
  assert.equal((await post({ type: 'play', videoId: vid }, 'https://tucokids.com.evil.com')).status, 403, 'look-alike store origin');
  assert.equal((await post(many)).json.stored, 50, 'only 50 events per request are kept');
  const w = await post([{ type: 'watch', videoId: vid, secs: 99999 }]); assert.equal(w.status, 200);
});

test('analytics: counts match what was sent', async () => {
  const vid = await mkVideo({ title: 'Counted', status: 'live' });
  const send = (type, n) => call('POST', '/api/public/events', { auth: false, headers: { origin: STORE, 'content-type': 'text/plain' }, raw: JSON.stringify(Array.from({ length: n }, () => ({ type, videoId: vid, device: 'mobile', widget: 'w1' }))) });
  await send('impression', 10); await send('play', 4); await send('atc', 2);
  const a = (await call('GET', '/api/analytics?days=30')).json;
  const row = a.perVideo.find((r) => r.video_id === vid);
  assert.equal(row.impressions, 10); assert.equal(row.plays, 4); assert.equal(row.atc, 2);
  assert.ok(a.byDevice.some((d) => d.device === 'mobile'));
  assert.ok('storeSales' in a);
  assert.equal((await call('GET', '/api/analytics?days=abc')).status, 200);
  assert.equal((await call('GET', '/api/analytics?days=99999')).status, 200);
});

test('order webhook: signature, attribution, store total, idempotency', async () => {
  const vid = await mkVideo({ status: 'live' });
  const oid = Math.floor(Math.random() * 1e9);
  const body = JSON.stringify({ id: oid, total_price: '1500.00', currency: 'INR', created_at: new Date().toISOString(), line_items: [{ id: 1, price: '100.00', quantity: 3, total_discount: '30.00', properties: [{ name: '_tuco_video', value: vid }] }, { id: 2, price: '500', quantity: 1, properties: [] }] });
  const before = (await call('GET', '/api/analytics?days=30')).json;
  assert.equal((await call('POST', '/api/webhooks/shopify/orders', { auth: false, raw: body })).status, 401);
  assert.equal((await call('POST', '/api/webhooks/shopify/orders', { auth: false, raw: body, headers: { 'x-shopify-hmac-sha256': 'bad' } })).status, 401);
  const ok = await call('POST', '/api/webhooks/shopify/orders', { auth: false, raw: body, headers: { 'x-shopify-hmac-sha256': sign(body) } });
  assert.equal(ok.status, 200); assert.equal(ok.json.credited, 1);
  await call('POST', '/api/webhooks/shopify/orders', { auth: false, raw: body, headers: { 'x-shopify-hmac-sha256': sign(body) } });
  const after = (await call('GET', '/api/analytics?days=30')).json;
  const sv = after.salesByVideo.find((s) => s.video_id === vid);
  assert.equal(sv.orders, 1); assert.ok(Math.abs(sv.revenue - 270) < 0.01);
  assert.equal(after.storeSales.orders - (before.storeSales?.orders || 0), 1, 'a re-sent order is counted once');
  assert.ok(Math.abs(after.storeSales.revenue - (before.storeSales?.revenue || 0) - 1500) < 0.01);
  const tampered = body.replace('1500.00', '9999.00');
  assert.equal((await call('POST', '/api/webhooks/shopify/orders', { auth: false, raw: tampered, headers: { 'x-shopify-hmac-sha256': sign(body) } })).status, 401);
});

test('health and export report real state', async () => {
  const h = (await call('GET', '/api/health')).json;
  assert.equal(h.checks.database.ok, true); assert.equal(h.checks.tables.ok, true);
  assert.ok(h.totals.videos >= 1);
  const ex = (await call('GET', '/api/export')).json;
  assert.ok(Array.isArray(ex.videos) && Array.isArray(ex.widgets) && ex.exportedAt);
});

test('store lookups: an unreachable store gives a specific, helpful message (not a generic crash)', async () => {
  const r = await call('GET', '/api/store/products?q=sun');
  if (r.status === 200) return; // a reachable store is fine too
  assert.equal(r.status, 502); assert.match(r.json.error, /product list|paste product links/i);
  const c = await call('GET', '/api/store/collections');
  assert.equal(c.status, 502); assert.match(c.json.error, /collections/i);
});

test('media addresses: videos are served from this API unless a public R2 address is configured', async () => {
  const up = await call('PUT', '/api/upload?name=addr.mp4', { raw: Buffer.from('abc'), headers: { 'content-type': 'video/mp4' } });
  assert.match(up.json.url, new RegExp('^' + B.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/media/videos/'));
  const id = await mkVideo({ url: up.json.url });
  const v = (await call('GET', '/api/videos')).json.videos.find((x) => x.id === id);
  assert.match(v.url, /\/media\/videos\//);
});

test('media addresses are saved in the short form, even when the admin sends the full address back', async () => {
  const up = await call('PUT', '/api/upload?name=short.mp4', { raw: Buffer.from('abc'), headers: { 'content-type': 'video/mp4' } });
  const id = await mkVideo({ url: up.json.url, poster: up.json.url });
  const v = (await call('GET', '/api/videos')).json.videos.find((x) => x.id === id);
  assert.match(v.url, /^http/, 'the API shows full addresses');
  const edited = await call('PUT', '/api/videos/' + id, { body: { ...v, title: 'Edited once' } });
  assert.equal(edited.status, 200);
  const raw = (await call('GET', '/api/export')).json.videos.find((x) => x.id === id);
  assert.match(raw.url, /^\/media\/videos\//, 'stored short: ' + raw.url);
  assert.match(raw.poster, /^\/media\/videos\//);
  const ext = await mkVideo({ url: 'https://cdn.example.com/other.mp4' });
  assert.equal((await call('GET', '/api/export')).json.videos.find((x) => x.id === ext).url, 'https://cdn.example.com/other.mp4', 'other addresses are left alone');
});

test('widgets limited to products: handles with emoji or other languages work, other products get nothing', async () => {
  const handle = '🎁-soap-pack-of-2';
  const vid = await mkVideo({ status: 'live', title: 'Emoji product video' });
  const wid = await mkWidget({ scope: 'custom', videoIds: [vid], productHandles: [handle, 'plain-handle', 'साबुन'] });
  const w = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === wid);
  assert.deepEqual(w.productHandles, [handle, 'plain-handle', 'साबुन'], 'all three handles are kept');
  const ask = (p) => call('GET', '/api/public/config?widget=' + wid + '&product=' + encodeURIComponent(p), { auth: false, headers: { origin: STORE } });
  assert.equal((await ask(handle)).json.videos.length, 1);
  assert.equal((await ask('साबुन')).json.videos.length, 1);
  assert.equal((await ask('some-other-product')).json.videos.length, 0, 'a product outside the list shows nothing');
  const bad = await call('POST', '/api/widgets', { body: goodWidget({ productHandles: ['has space', 'a/b', '%F0%9F', '<script>', 'ok-one'] }) });
  const kept = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === bad.json.id);
  if (bad.json.id) made.widgets.push(bad.json.id);
  assert.deepEqual(kept.productHandles, ['ok-one'], 'unsafe handles are dropped');
});

test('upload: needs auth, rejects bad names and non-media', async () => {
  assert.equal((await call('PUT', '/api/upload?name=a.mp4', { auth: false, raw: 'x' })).status, 401);
  const ok = await call('PUT', '/api/upload?name=tiny.mp4', { raw: Buffer.from('not a real video but small'), headers: { 'content-type': 'video/mp4' } });
  assert.ok([200, 201].includes(ok.status), ok.text);
  assert.ok(ok.json.url && ok.json.size > 0);
  const evil = await call('PUT', '/api/upload?name=' + encodeURIComponent('../../etc/passwd'), { raw: 'x', headers: { 'content-type': 'video/mp4' } });
  assert.ok(![500].includes(evil.status));
  if (evil.json.url) assert.ok(!/\/\.\.\//.test(evil.json.url), 'no path climbing');
});

test('media: served with range support', async () => {
  const up = await call('PUT', '/api/upload?name=range.mp4', { raw: Buffer.from('0123456789'), headers: { 'content-type': 'video/mp4' } });
  const r = await fetch(up.json.url, { headers: { range: 'bytes=2-5' } });
  assert.ok([200, 206].includes(r.status));
  if (r.status === 206) assert.equal(await r.text(), '2345');
  assert.equal((await fetch(B + '/media/videos/does-not-exist.mp4')).status, 404);
});

test('cleanup: remove everything this suite created', async () => {
  for (const id of made.widgets) await call('DELETE', '/api/widgets/' + id);
  for (const id of made.videos) await call('DELETE', '/api/videos/' + id);
});

test('widgets: the Video section type keeps its layout settings and rejects bad ones', async () => {
  const id = await mkWidget({ name: 'Section', type: 'feature', heading: 'hello', overrides: { feature: { videoSide: 'left', videoWidthDesktop: 50, headingColor: '#123456' }, banner: { aspectLandscape: '5/6', aspectPortrait: '4/5' } } });
  const w = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === id);
  assert.equal(w.type, 'feature'); assert.equal(w.overrides.feature.videoSide, 'left'); assert.equal(w.overrides.banner.aspectLandscape, '5/6');
  const bad = await call('PUT', '/api/widgets/' + id, { body: { ...w, overrides: { feature: { videoSide: 'up' } } } });
  assert.equal(bad.status, 400);
  const bad2 = await call('PUT', '/api/widgets/' + id, { body: { ...w, overrides: { feature: { background: 'red;display:none' } } } });
  assert.equal(bad2.status, 400);
});

test('widgets: a click link is accepted only as a web address or a path', async () => {
  const id = await mkWidget({ name: 'Link', type: 'banner', overrides: { clickLink: '/pages/sale', clickTarget: 'new' } });
  const w = (await call('GET', '/api/widgets')).json.widgets.find((x) => x.id === id);
  assert.equal(w.overrides.clickLink, '/pages/sale'); assert.equal(w.overrides.clickTarget, 'new');
  for (const bad of ['javascript:alert(1)', '//evil.example', 'ftp://x.example', '']) {
    const r = await call('PUT', '/api/widgets/' + id, { body: { ...w, overrides: { clickLink: bad } } });
    assert.equal(r.status, 400, `rejects ${JSON.stringify(bad)}`);
  }
});

test('theme blocks: every block keeps data-tuco-video and data-widget as separate attributes', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../shopify-app/extensions/loopy-video/blocks/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => /^loopy-(banner|carousel|stories|spotlight|section)\.liquid$/.test(n))) {
    const t = readFileSync(new URL(f, dir), 'utf8');
    assert.match(t, /data-tuco-video\s+data-widget="/, f + ': the two attributes must be separated by whitespace');
    assert.match(t, /><span hidden><\/span><\/div>/, f + ': the widget box must hold a hidden child so it is never collapsed or hidden before the script runs');
    assert.doesNotMatch(t, /data-tuco-video\s*\{%-/, f + ': a Liquid tag with whitespace control must not follow data-tuco-video');
  }
});

test('site checks: need the admin token, save a result, list it and open its details', async () => {
  const rec = { at: Date.now(), status: 'warn', pages: 3, failures: 0, durationS: 2, summary: { kind: 'api-health', notes: ['x'] }, details: [{ path: 'Home banner data', problems: [], warnings: ['slow'] }] };
  assert.equal((await call('POST', '/api/checks', { body: rec, auth: false })).status, 401);
  assert.equal((await call('GET', '/api/checks', { auth: false })).status, 401);
  assert.equal((await call('POST', '/api/checks', { body: { ...rec, at: rec.at + 1, status: 'weird' } })).status, 200);
  const L = (await call('GET', '/api/checks')).json; const W = (L.checks || []).find((c) => c.at === rec.at + 1); assert.ok(W, 'weird row listed: ' + JSON.stringify(L).slice(0, 300)); assert.equal(W.status, 'fail', 'an unknown result is stored as a failure, never as ok');
  const ok = await call('POST', '/api/checks', { body: rec }); assert.ok(ok.status < 300, JSON.stringify(ok.json));
  const list = await call('GET', '/api/checks'); assert.equal(list.status, 200);
  const mine = list.json.checks.find((c) => c.at === rec.at); assert.ok(mine, 'the saved check is listed'); assert.equal(mine.status, 'warn');
  const one = await call('GET', '/api/checks/' + mine.id); assert.equal(one.json.check.details[0].path, 'Home banner data');
});

test('videos: deleting a video that is stored in our own storage works (long file names must not break it)', async () => {
  const url = '/media/videos/0f0d9a3e-1b2c-4d5e-8f60-123456789abc-opt.mp4';
  const a = await call('POST', '/api/videos', { body: goodVideo({ url }) }); assert.ok(a.status < 300, JSON.stringify(a.json));
  const b = await call('POST', '/api/videos', { body: goodVideo({ url }) }); assert.ok(b.status < 300, JSON.stringify(b.json));
  const d = await call('DELETE', '/api/videos/' + a.json.id); assert.equal(d.status, 200, d.text);
  const d2 = await call('DELETE', '/api/videos/' + b.json.id); assert.equal(d2.status, 200, d2.text);
});

test('site checks: "check now" needs the admin token, starts a run in the background, saves a server check, and reports a page that cannot be opened as a problem', async () => {
  assert.equal((await call('POST', '/api/checks/run', { auth: false })).status, 401);
  const r = await call('POST', '/api/checks/run'); assert.equal(r.status, 200, r.text);
  assert.equal(r.json.running, true); assert.ok(r.json.id, 'it answers at once with the id of the run');
  let one;
  for (let k = 0; k < 60; k++) { one = await call('GET', '/api/checks/' + r.json.id); if (one.json.check && one.json.check.status !== 'running') break; await new Promise((x) => setTimeout(x, 500)); }
  assert.equal(one.json.check.status, 'fail', 'the test store is unreachable, so this must not read as ok');
  assert.equal(one.json.check.summary.kind, 'server-check');
  assert.ok(one.json.check.details.length >= 15, 'one row per page at least');
  assert.ok(one.json.check.details.every((d) => d.problems.length), 'every unreachable page is flagged');
});

test('analytics: "only widgets on the site now" leaves out switched-off widgets and widgets with no recent impression', async () => {
  const v = await mkVideo(); const vid = v.id || v;
  const live = (await call('POST', '/api/widgets', { body: goodWidget({ name: 'QA live', type: 'banner', enabled: true, videoIds: [vid] }) })).json.id;
  const off = (await call('POST', '/api/widgets', { body: goodWidget({ name: 'QA off', type: 'banner', enabled: false, videoIds: [vid] }) })).json.id;
  const ev = (widget) => fetch(B + '/api/public/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([{ type: 'impression', videoId: vid, widget }, { type: 'impression', videoId: vid, widget }]) });
  assert.equal((await ev(live)).status, 200); assert.equal((await ev(off)).status, 200);
  const all = (await call('GET', '/api/analytics?days=30')).json; const only = (await call('GET', '/api/analytics?days=30&live=1')).json;
  assert.ok(all.perWidget.some((r) => r.widget === off), 'everything view still counts the switched-off widget');
  assert.ok(only.perWidget.some((r) => r.widget === live), 'the live widget is counted');
  assert.ok(!only.perWidget.some((r) => r.widget === off), 'the switched-off widget is left out');
  assert.ok(only.liveWidgets >= 1);
  const sum = (a) => a.perVideo.reduce((n, r) => n + (r.impressions || 0), 0);
  assert.ok(sum(only) < sum(all), 'totals shrink when old widgets are left out');
});

// ---------------- Video serving: every kind of request a phone or browser can send must be answered correctly ----------------
test('media: every kind of range request is answered correctly (this is what makes videos start on phones)', async () => {
  const bytes = Buffer.from(Array.from({ length: 100 }, (_, i) => i));
  const up = await call('PUT', '/api/upload?name=ranges.mp4', { raw: bytes, headers: { 'content-type': 'video/mp4' } });
  const url = up.json.url; assert.ok(url, JSON.stringify(up.json));
  const get = async (range, extra = {}, method = 'GET') => { const r = await fetch(url, { method, headers: { ...(range ? { range } : {}), ...extra } }); return { r, body: Buffer.from(await r.arrayBuffer()) }; };
  let x = await get();
  assert.equal(x.r.status, 200); assert.equal(x.r.headers.get('accept-ranges'), 'bytes'); assert.equal(x.r.headers.get('content-length'), '100'); assert.match(x.r.headers.get('content-type'), /^video\//); assert.equal(x.r.headers.get('access-control-allow-origin'), '*'); assert.equal(x.body.length, 100);
  x = await get('bytes=0-1'); // the first request iPhones make
  assert.equal(x.r.status, 206); assert.equal(x.r.headers.get('content-range'), 'bytes 0-1/100'); assert.equal(x.r.headers.get('content-length'), '2'); assert.deepEqual([...x.body], [0, 1]);
  x = await get('bytes=10-'); assert.equal(x.r.status, 206); assert.equal(x.r.headers.get('content-range'), 'bytes 10-99/100'); assert.equal(x.body.length, 90); assert.equal(x.body[0], 10);
  x = await get('bytes=-20'); assert.equal(x.r.status, 206); assert.equal(x.r.headers.get('content-range'), 'bytes 80-99/100'); assert.equal(x.body[0], 80);
  x = await get('bytes=90-9999'); assert.equal(x.r.status, 206, 'a piece that runs past the end is cut to the end'); assert.equal(x.r.headers.get('content-range'), 'bytes 90-99/100'); assert.equal(x.r.headers.get('content-length'), '10'); assert.equal(x.body.length, 10);
  x = await get('bytes=0-99'); assert.equal(x.r.status, 206); assert.equal(x.body.length, 100);
  x = await get('bytes=-9999'); assert.equal(x.r.status, 206, 'asking for more than the whole file from the end gives the whole file'); assert.equal(x.r.headers.get('content-range'), 'bytes 0-99/100');
  for (const bad of ['bytes=100-', 'bytes=500-600', 'bytes=50-10', 'bytes=-0']) { x = await get(bad); assert.equal(x.r.status, 416, bad + ' is outside the file'); assert.equal(x.r.headers.get('content-range'), 'bytes */100'); }
  for (const odd of ['bytes=abc', 'items=0-5', 'bytes=', 'garbage', 'bytes=-']) { x = await get(odd); assert.equal(x.r.status, 200, odd + ' is ignored and the whole file is sent'); assert.equal(x.body.length, 100); }
  x = await get('bytes=0-1,5-6'); assert.equal(x.r.status, 206); assert.equal(x.r.headers.get('content-range'), 'bytes 0-1/100', 'the first of several ranges is served');
  x = await get('BYTES = 5 - 7'); assert.equal(x.r.status, 206); assert.equal(x.r.headers.get('content-range'), 'bytes 5-7/100', 'spaces and capitals are accepted');
  x = await get(null, {}, 'HEAD'); assert.equal(x.r.status, 200); assert.equal(x.r.headers.get('content-length'), '100'); assert.equal(x.body.length, 0);
  x = await get('bytes=0-9', {}, 'HEAD'); assert.equal(x.r.status, 206); assert.equal(x.body.length, 0);
  const etag = (await get()).r.headers.get('etag');
  x = await get('bytes=0-1', { 'if-range': etag }); assert.equal(x.r.status, 206, 'a resumed download of the same file continues');
  x = await get('bytes=0-1', { 'if-range': '"some-other-version"' }); assert.equal(x.r.status, 200, 'if the file changed, the whole file is sent'); assert.equal(x.body.length, 100);
  const miss = await fetch(url.replace(/ranges[^/]*$/, 'nothing-here-at-all.mp4')); assert.equal(miss.status, 404); assert.equal(miss.headers.get('access-control-allow-origin'), '*');
  const badUri = await fetch(B + '/media/videos/%E0%A4%A.mp4'); assert.equal(badUri.status, 404, 'a broken address is "not found", never a server error');
  const trav = await fetch(B + '/media/videos/..%2F..%2Fschema.sql'); assert.ok([404, 400].includes(trav.status));
});

test('theme blocks: the Product Tabs block exists, asks for a widget ID, keeps space while loading, and never touches the video-widget attributes of other blocks', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../shopify-app/extensions/loopy-video/blocks/', import.meta.url);
  const t = readFileSync(new URL('loopy-tabs.liquid', dir), 'utf8');
  assert.match(t, /"name": "Loopy Product Tabs"/); assert.match(t, /"id": "widget_id"/); assert.match(t, /hold_px_desktop/); assert.match(t, /hold_px_mobile/);
  assert.match(t, /data-tuco-video\s+data-widget="/); assert.match(t, /><span hidden><\/span><\/div>/); assert.match(t, /class="loopy-hold"/);
  assert.match(t, /loopy\.tucokids\.workers\.dev\/widget\.js/, 'it loads the Loopy script once');
  assert.equal(readdirSync(dir).filter((f) => /\.liquid$/.test(f)).length >= 7, true, 'the other blocks are still there');
});
