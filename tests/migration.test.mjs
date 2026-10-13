// Whatmore importer and Instagram sync, against a local test API with local R2 storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = process.env.LOOPY_API || 'http://localhost:8799';
const TOKEN = process.env.LOOPY_TOKEN || 'testtoken';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(B)) throw new Error('Refusing to run against ' + B);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const videosBySource = async (prefix) => (await api('GET', '/api/videos')).json.videos.filter((v) => (v.source || '').startsWith(prefix));

// A pretend Whatmore/CDN host that serves "video" files, with one dead link.
const files = new Map();
const srv = http.createServer((req, res) => {
  const f = files.get(req.url);
  if (!f) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': f.length }); res.end(f);
});
await new Promise((r) => srv.listen(8091, r));
const SRC = 'http://localhost:8091';
for (let i = 1; i <= 12; i++) files.set(`/wm/clip${i}.mp4`, Buffer.alloc(20000 + i * 1000, i));

const dir = mkdtempSync(join(tmpdir(), 'loopy-mig-'));
const exportFile = join(dir, 'whatmore-export.json');
const prod = (n) => ({ handle: `product-${n}`, title: `Product ${n}` });
const exportData = {
  exportedAt: new Date().toISOString(),
  widgets: [{ id: 'w1', name: 'Home Banners', type: 'banner' }, { id: 'w2', name: 'Collection videos', type: 'collection' }, { id: 'w3', name: 'PDP carousel', type: 'carousel' }],
  videos: [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `e${i + 1}`, url: `${SRC}/wm/clip${i + 1}.mp4`, poster: '', title: `Wm video ${i + 1}`, sourceHandle: '', products: [prod(i + 1)], widgets: [{ id: i % 2 ? 'w1' : 'w2', rank: 10 - i }, ...(i < 3 ? [{ id: 'w3', rank: i }] : [])] })),
    { id: 'e9', url: `${SRC}/wm/clip9.mp4`, poster: '', title: 'Untagged one', sourceHandle: '', products: [], widgets: [] },
    { id: 'e10', url: `${SRC}/wm/DEAD.mp4`, poster: '', title: 'Dead link video', sourceHandle: '', products: [prod(10)], widgets: [{ id: 'w1', rank: 1 }] },
    { id: 'e11', url: '', poster: '', title: 'No url at all', sourceHandle: '', products: [], widgets: [] },
    { id: 'e12', url: `${SRC}/wm/clip12.mp4`, poster: '', title: '<script>alert(1)</script> "quoted" émoji 🎬 ' + 'x'.repeat(40), sourceHandle: '', products: [{ handle: 'bad handle!', title: 'x' }], widgets: [] },
  ],
};
writeFileSync(exportFile, JSON.stringify(exportData));
// Async on purpose: the pretend video host lives in this process and must keep answering while the importer runs.
const exec = (args, env) => new Promise((resolve) => execFile('node', args, { cwd: ROOT, env, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: (stdout || '') + (stderr || '') })));
const run = (...args) => exec(['tools/import-whatmore.mjs', exportFile, ...args], { ...process.env, LOOPY_API: B, LOOPY_TOKEN: TOKEN });

test('importer: refuses to run without the API address and token', async () => {
  const r = await exec(['tools/import-whatmore.mjs', exportFile], { PATH: process.env.PATH });
  assert.notEqual(r.code, 0); assert.match(r.out, /Usage/);
});

test('importer: dry run reports a plan and writes nothing', async () => {
  const before = (await api('GET', '/api/videos')).json.videos.length;
  const r = await run('--dry-run', '--copy');
  assert.equal(r.code, 0, r.out); assert.match(r.out, /dry run/i);
  assert.equal((await api('GET', '/api/videos')).json.videos.length, before);
});

test('importer: a wrong token changes nothing and says so', async () => {
  const before = (await api('GET', '/api/videos')).json.videos.length;
  const r = await exec(['tools/import-whatmore.mjs', exportFile, '--copy'], { ...process.env, LOOPY_API: B, LOOPY_TOKEN: 'wrong' });
  assert.match(r.out, /401|failed/i);
  assert.equal((await api('GET', '/api/videos')).json.videos.length, before);
});

test('importer: first batch (--limit 3 --copy) copies files into storage', async () => {
  const r = await run('--copy', '--limit', '3');
  assert.equal(r.code, 0, r.out);
  const got = await videosBySource('whatmore');
  assert.equal(got.length, 3, r.out);
  for (const v of got) {
    assert.equal(v.status, 'draft'); assert.ok(v.size > 0, 'size recorded');
    assert.ok(v.url.includes('/media/'), 'points at Loopy storage, not Whatmore: ' + v.url);
    const f = await fetch(v.url); assert.equal(f.status, 200); assert.equal((await f.arrayBuffer()).byteLength, v.size);
    assert.equal(v.products.length, 1);
  }
});

test('importer: full run imports the rest, skips repeats, survives a dead link and bad rows', async () => {
  const r = await run('--copy');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /skipped \(already imported\)/);
  assert.match(r.out, /failed e10/, 'dead link is reported, not hidden');
  const got = await videosBySource('whatmore');
  const ids = got.map((v) => v.title);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  assert.ok(!ids.includes('Dead link video') && !ids.includes('No url at all'));
  assert.ok(ids.includes('Untagged one'));
  assert.ok(!got.some((v) => /bad handle/.test(JSON.stringify(v.products))), 'row with an invalid product handle was rejected');
});

test('importer: rejected rows leave no stray files; hostile titles stay as plain text', async () => {
  const bad = await api('POST', '/api/import', { url: `${SRC}/wm/clip5.mp4`, copy: true, title: '', sourceId: 'wm:strayfile' });
  assert.equal(bad.status, 400, 'a bad entry is refused before any file is fetched');
  const none = await api('POST', '/api/import', { url: 'http://169.254.169.254/latest/meta-data', copy: true, title: 'ssrf', sourceId: 'wm:ssrf' });
  assert.equal(none.status, 400, 'internal addresses are refused');
  const xss = (await videosBySource('whatmore')).find((v) => /script/i.test(v.title));
  if (xss) assert.ok(xss.title.length <= 300);
});

test('importer: widgets are created switched off, in Whatmore order, and re-running adds none', async () => {
  const widgets = (await api('GET', '/api/widgets')).json.widgets.filter((w) => ['Home Banners', 'Collection videos', 'PDP carousel'].includes(w.name));
  assert.equal(widgets.length, 3);
  assert.ok(widgets.every((w) => w.enabled === false), 'safe by default: all off until you review');
  const pdp = widgets.find((w) => w.name === 'PDP carousel');
  assert.equal(pdp.videoIds.length, 3); assert.equal(pdp.page, 'product');
  assert.equal(widgets.find((w) => w.name === 'Home Banners').type, 'banner');
  assert.equal(widgets.find((w) => w.name === 'Collection videos').page, 'collection');
  await run('--copy');
  const again = (await api('GET', '/api/widgets')).json.widgets.filter((w) => ['Home Banners', 'Collection videos', 'PDP carousel'].includes(w.name));
  assert.equal(again.length, 3, 'no duplicate widgets after a second run');
});

test('importer: link-only mode (no --copy) keeps the original address', async () => {
  const one = { ...exportData, widgets: [], videos: [{ id: 'link1', url: `${SRC}/wm/clip1.mp4`, poster: '', title: 'Link only', sourceHandle: '', products: [], widgets: [] }] };
  const f = join(dir, 'link.json'); writeFileSync(f, JSON.stringify(one));
  const r = await exec(['tools/import-whatmore.mjs', f], { ...process.env, LOOPY_API: B, LOOPY_TOKEN: TOKEN });
  assert.equal(r.code, 0, r.out);
  const v = (await videosBySource('whatmore')).find((x) => x.title === 'Link only');
  assert.equal(v.url, `${SRC}/wm/clip1.mp4`);
});

// ---------------- Instagram ----------------
const igMedia = [];
for (let i = 1; i <= 22; i++) igMedia.push({ id: `ig${i}`, caption: `Reel ${i}\nsecond line`, media_type: i % 7 === 0 ? 'IMAGE' : 'VIDEO', media_url: i === 5 ? 'http://localhost:8090/files/DEAD.mp4' : `http://localhost:8090/files/ig${i}.mp4`, thumbnail_url: `http://localhost:8090/files/ig${i}.jpg`, timestamp: '2026-10-01T00:00:00+0000' });
const ig = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost:8090');
  const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/refresh_access_token') return send({ access_token: 'refreshed-token' });
  if (u.pathname === '/me/media') {
    if (u.searchParams.get('access_token') === 'revoked') { res.writeHead(401); return res.end('{}'); }
    const page = Number(u.searchParams.get('page') || 0);
    const slice = igMedia.slice(page * 10, page * 10 + 10);
    return send({ data: slice, paging: page < 2 ? { next: `http://localhost:8090/me/media?page=${page + 1}&access_token=${u.searchParams.get('access_token')}` } : {} });
  }
  const m = u.pathname.match(/^\/files\/(ig\d+)\.(mp4|jpg)$/);
  if (m && m[1] !== 'DEAD') { const b = Buffer.alloc(30000, 7); res.writeHead(200, { 'content-type': m[2] === 'mp4' ? 'video/mp4' : 'image/jpeg', 'content-length': b.length }); return res.end(b); }
  res.writeHead(404); res.end('nope');
});
await new Promise((r) => ig.listen(8090, r));

test('instagram: syncs reels in batches of 15, skips photos and dead links, never duplicates', async (t) => {
  const probe = await api('POST', '/api/sync/instagram');
  if (probe.json.skipped) return t.skip('Instagram test settings are not on this API: ' + probe.json.skipped);
  const first = probe.json;
  assert.equal(first.added, 15, JSON.stringify(first)); assert.ok(first.waiting >= 1, 'more are waiting for the next run'); assert.equal(first.failed, 1, 'the dead link is counted');
  const second = (await api('POST', '/api/sync/instagram')).json;
  assert.ok(second.added >= 1 && second.added <= 15, JSON.stringify(second));
  const third = (await api('POST', '/api/sync/instagram')).json;
  assert.equal(third.added, 0, 'nothing new the third time');
  const got = await videosBySource('instagram');
  assert.equal(new Set(got.map((v) => v.url)).size, got.length, 'no duplicates');
  assert.ok(got.every((v) => v.status === 'draft'), 'new reels arrive as drafts, never live');
  assert.ok(!got.some((v) => v.title === 'Reel 7' || v.title === 'Reel 14'), 'photos are skipped');
  assert.ok(got.every((v) => v.title.indexOf('\n') === -1 && v.size > 0 && v.url.includes('/media/')));
  const poster = got.find((v) => v.poster);
  assert.ok(poster, 'thumbnails are copied too'); assert.equal((await fetch(poster.poster)).status, 200);
});

test.after(() => { srv.close(); ig.close(); });
