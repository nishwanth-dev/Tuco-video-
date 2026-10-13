#!/usr/bin/env node
// Imports a whatmore-export.json into Loopy: videos (with product tags) and widgets (with their video lists).
//
//   Preview only (writes nothing, needs no token):
//     node tools/import-whatmore.mjs whatmore-export.json --dry-run [--sizes]
//   Real run (set the address and your admin token as environment variables, do not paste them in chat):
//     LOOPY_API=https://... LOOPY_TOKEN=... node tools/import-whatmore.mjs whatmore-export.json [options]
//
// Options
//   --limit N           only the first N videos (good for a first test; re-running later completes the rest)
//   --compress          download each video, shrink it with ffmpeg, make a poster image, upload to Loopy storage (recommended)
//   --compress-over MB  with --compress, only re-encode files bigger than this (default 5); smaller ones are uploaded as they are
//   --copy              copy files into storage on the server without shrinking (use when ffmpeg is not installed)
//   --live              videos that are in an active Whatmore widget are set live (everything else stays a draft)
//   --parallel N        videos handled at the same time (default 2 with --compress, otherwise 1)
// Without --compress or --copy the videos are only linked to Whatmore's files (not recommended: they vanish when Whatmore does).
// Safe to run again: videos already imported are skipped, and widgets that are still switched off are topped up.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
let file = '';
let limit = Infinity;
let compressOver = 5;
let parallel = 0;
const flags = new Set();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit') limit = Number(args[++i]);
  else if (args[i] === '--compress-over') compressOver = Number(args[++i]);
  else if (args[i] === '--parallel') parallel = Number(args[++i]);
  else if (args[i].startsWith('--')) flags.add(args[i].slice(2));
  else file = args[i];
}
const flag = (n) => flags.has(n);
const DRY = flag('dry-run');
const { LOOPY_API: API, LOOPY_TOKEN: TOKEN } = process.env;
if (!file || (!DRY && (!API || !TOKEN))) {
  console.error('Usage: LOOPY_API=... LOOPY_TOKEN=... node tools/import-whatmore.mjs whatmore-export.json [--compress] [--copy] [--live] [--limit N] [--dry-run]');
  process.exit(1);
}
if (!parallel) parallel = flag('compress') ? 2 : 1;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const data = JSON.parse(readFileSync(file, 'utf8'));
const MB = 1048576;
const mb = (b) => (b / MB).toFixed(1);

const call = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.error || ''}`);
  return j;
};

// ---------- naming and mapping ----------
// Whatmore videos usually have no title, so they are named after their first product.
const titleOf = (v) => {
  const t = (v.title || '').trim() || (v.products[0] && v.products[0].title) || (v.sourceHandle || '').replace(/\.\w+$/, '') || `Whatmore video ${v.id}`;
  return String(t).trim().slice(0, 300);
};
// "collection" widgets become carousels on collection pages; names with PDP or product go on product pages; the rest on the home page.
const mapWidget = (w) => {
  const name = String(w.name || 'Widget').trim().slice(0, 120) || 'Widget';
  const page = w.type === 'collection' ? 'collection' : /pdp|product/i.test(name) ? 'product' : 'home';
  const type = w.type === 'banner' ? 'banner' : 'carousel';
  return { name, type, page };
};
// Two Whatmore widgets can share a name; the second becomes "name (2)" so neither is lost and re-runs stay stable.
const widgetPlan = (() => {
  const seen = new Map();
  return data.widgets.map((w) => {
    const m = mapWidget(w);
    const key = `${m.name}|${m.type}|${m.page}`;
    const n = (seen.get(key) || 0) + 1; seen.set(key, n);
    return { w, m: n > 1 ? { ...m, name: `${m.name} (${n})`.slice(0, 120) } : m };
  });
})();

const inWidget = new Set(data.videos.filter((v) => v.widgets.length).map((v) => v.id));
const videos = data.videos.filter((v) => v.url).slice(0, limit);

// ---------- dry run ----------
if (DRY) {
  console.log(`${videos.length} of ${data.videos.length} videos, ${data.widgets.length} widgets (dry run: nothing is written, nothing is downloaded)\n`);
  const how = flag('compress') ? 'download, shrink with ffmpeg, make a poster, upload to Loopy storage' : flag('copy') ? 'copy into Loopy storage as they are' : 'link only (NOT recommended)';
  console.log(`Plan for videos: ${how}`);
  console.log(`  tagged with products: ${videos.filter((v) => v.products.length).length}   |   in an active widget: ${videos.filter((v) => inWidget.has(v.id)).length} (set live with --live)   |   everything else becomes a draft`);
  console.log(`  untitled: ${videos.filter((v) => !(v.title || '').trim()).length}, named from their first product: ${videos.filter((v) => !(v.title || '').trim() && v.products[0] && v.products[0].title).length}, the rest named "Whatmore video <id>"`);
  console.log('  examples of the new names:', videos.slice(0, 3).map((v) => `"${titleOf(v)}"`).join(', '));
  const byKind = {};
  for (const { m } of widgetPlan) { const k = `${m.type} on ${m.page}`; byKind[k] = (byKind[k] || 0) + 1; }
  console.log(`\nPlan for widgets: ${widgetPlan.length} created, all switched OFF so you can review each one first`);
  for (const [k, n] of Object.entries(byKind)) console.log(`  ${n} x ${k}`);
  const dupes = widgetPlan.filter(({ m }) => / \(\d+\)$/.test(m.name)).length;
  if (dupes) console.log(`  ${dupes} share a name with another and get a "(2)" so none is lost`);
  console.log('  The export does not say which page or collection each Whatmore widget sits on, so check that for each widget after the import.');
  if (flag('sizes')) {
    let next = 0, total = 0, ok = 0, big = 0, over = 0;
    await Promise.all(Array.from({ length: 10 }, async () => {
      while (next < videos.length) {
        const v = videos[next++];
        try { const r = await fetch(v.url, { method: 'HEAD' }); const n = Number(r.headers.get('content-length')) || 0; if (r.ok) { ok++; total += n; if (n > compressOver * MB) over++; if (n > 100 * MB) big++; } } catch { /* counted as not ok */ }
      }
    }));
    console.log(`\nSizes (checked ${ok} of ${videos.length} files, nothing downloaded): ${mb(total)} MB in total, ${mb(total / Math.max(ok, 1))} MB on average`);
    console.log(`  ${over} files are over ${compressOver} MB (shrunk when you use --compress); ${big} are over 100 MB (the admin upload limit; the importer handles them)`);
  }
  console.log('\nNext: run again without --dry-run, first with --limit 10 to check a small batch.');
  process.exit(0);
}

// ---------- helpers for the real run ----------
const run = (cmd, a) => new Promise((resolveRun, rejectRun) => execFile(cmd, a, { maxBuffer: 1 << 26 }, (err, stdout, stderr) => (err ? rejectRun(new Error((stderr || err.message).toString().trim().split('\n').slice(-2).join(' '))) : resolveRun(stdout))));
const upload = async (path, name, type) => {
  const buf = readFileSync(path);
  if (buf.length > 100 * MB) throw new Error(`${name} is ${mb(buf.length)} MB, over the 100 MB upload limit even after shrinking`);
  const r = await fetch(`${API}/api/upload?name=${encodeURIComponent(name)}`, { method: 'PUT', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': type }, body: buf });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`upload -> ${r.status} ${j.error || ''}`);
  // Keep the address relative (/media/...) so it can move to a custom domain later without touching any video.
  const m = /(videos\/[^?#]+)$/.exec(j.url || '');
  if (!m) throw new Error('upload returned an unexpected address');
  return { url: `/media/${m[1]}`, size: j.size || buf.length };
};

// Downloads one video, shrinks it if it is big, makes a poster, uploads both. Returns what the import call needs.
async function prepare(v) {
  const dir = mkdtempSync(join(tmpdir(), 'loopy-wm-'));
  try {
    const src = await fetch(v.url);
    if (!src.ok) throw new Error(`could not download (${src.status})`);
    const raw = join(dir, 'in'); writeFileSync(raw, Buffer.from(await src.arrayBuffer()));
    const before = statSync(raw).size;
    const isMov = /quicktime/i.test(src.headers.get('content-type') || '');
    let final = raw;
    if (before > compressOver * MB || isMov) {
      final = join(dir, 'out.mp4');
      // Same settings as tools/compress-video.sh: longest side capped at 1280, H.264, fast start.
      await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', final]);
      if (statSync(final).size >= before && !isMov) final = raw; // already small and efficient: keep the original
    }
    const vid = await upload(final, `wm-${v.id}.mp4`, 'video/mp4');
    let poster = '';
    try {
      const jpg = join(dir, 'poster.jpg');
      await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', final, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', jpg]);
      poster = (await upload(jpg, `wm-${v.id}.jpg`, 'image/jpeg')).url;
    } catch { /* the video is still imported without a poster; use "Generate poster from video" in Loopy */ }
    return { url: vid.url, poster, size: vid.size, before };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---------- videos ----------
const report = { startedAt: new Date().toISOString(), imported: 0, skipped: 0, failed: [], savedBytes: 0, widgets: { created: 0, updated: 0, skipped: 0, failed: [] } };
const existing = new Set((await call('GET', '/api/videos')).videos.map((x) => x.sourceId).filter(Boolean));
const idMap = new Map();
let done = 0, next = 0;
const worker = async () => {
  while (next < videos.length) {
    const v = videos[next++];
    const label = titleOf(v);
    try {
      const already = existing.has(`wm:${v.id}`);
      // A video that is already imported is never downloaded again; the server answers with its existing id.
      const extra = !already && flag('compress') ? await prepare(v) : {};
      const body = {
        url: extra.url || v.url, copy: !flag('compress') && flag('copy'), poster: extra.poster || (already ? '' : v.poster || ''), title: label,
        status: flag('live') && v.widgets.length ? 'live' : 'draft', placements: v.widgets.length ? ['home'] : [], products: v.products.map((p) => ({ handle: p.handle, title: p.title })),
        source: 'whatmore', sourceId: `wm:${v.id}`,
      };
      if (extra.size) body.size = extra.size;
      const res = await call('POST', '/api/import', body);
      idMap.set(v.id, res.id);
      if (res.skipped) report.skipped++; else { report.imported++; if (extra.before) report.savedBytes += extra.before - extra.size; }
      console.log(`${++done}/${videos.length} ${res.skipped ? 'skipped (already imported)' : 'imported'}: ${label}${extra.before ? `  (${mb(extra.before)} MB -> ${mb(extra.size)} MB)` : ''}`);
    } catch (e) { report.failed.push({ id: v.id, title: label, error: e.message }); console.error(`failed ${v.id} (${label}): ${e.message}`); ++done; }
  }
};
await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));

// ---------- widgets ----------
const widgets = (await call('GET', '/api/widgets')).widgets;
for (const { w, m } of widgetPlan) {
  const members = data.videos.filter((v) => v.widgets.some((x) => x.id === w.id) && idMap.has(v.id))
    .sort((a, b) => (a.widgets.find((x) => x.id === w.id).rank || 0) - (b.widgets.find((x) => x.id === w.id).rank || 0))
    .map((v) => idMap.get(v.id));
  if (!members.length) continue;
  const have = widgets.find((x) => x.name === m.name && x.type === m.type && x.page === m.page);
  try {
    if (have) {
      // Top up a widget from an earlier partial run, but never touch one you have already switched on or edited.
      const merged = [...new Set([...have.videoIds, ...members])];
      if (have.enabled || merged.length === have.videoIds.length) { report.widgets.skipped++; console.log(`widget already exists, left alone: ${m.name}`); continue; }
      await call('PUT', `/api/widgets/${have.id}`, { ...have, videoIds: merged });
      report.widgets.updated++; console.log(`widget topped up to ${merged.length} videos: ${m.name}`);
    } else {
      await call('POST', '/api/widgets', { ...m, scope: 'custom', videoIds: members, enabled: false });
      report.widgets.created++; console.log(`widget created (switched off, review it): ${m.name}`);
    }
  } catch (e) { report.widgets.failed.push({ name: m.name, error: e.message }); console.error(`widget ${m.name} failed: ${e.message}`); }
}

// ---------- report ----------
report.finishedAt = new Date().toISOString();
const reportFile = join(dirname(resolve(file)), 'whatmore-import-report.json');
writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`\nVideos: ${report.imported} imported, ${report.skipped} skipped, ${report.failed.length} failed.${report.savedBytes ? ` Shrinking saved ${mb(report.savedBytes)} MB.` : ''}`);
console.log(`Widgets: ${report.widgets.created} created, ${report.widgets.updated} topped up, ${report.widgets.skipped} left alone, ${report.widgets.failed.length} failed.`);
console.log(`A report was saved to ${reportFile}`);
console.log('Done. Review the widgets in Loopy, set the right collection or page for each, then switch them on.');
if (report.failed.length || report.widgets.failed.length) process.exitCode = 2;
