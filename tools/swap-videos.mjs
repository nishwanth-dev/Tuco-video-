#!/usr/bin/env node
// Replaces videos in Loopy with re-packed copies (same picture, "fast start" layout) and points the existing videos at them.
// Widgets, tags, titles and posters are not touched: only each video's file address and size change.
// The old files stay stored, and the old addresses are saved in swap-backup.json inside the folder so a swap can be undone.
// The admin token is read from the LOOPY_TOKEN environment variable and is never printed.
//
//   LOOPY_TOKEN=... node tools/swap-videos.mjs /path/to/folder [--dry]      (folder holds files named like the stored ones, e.g. <uuid>-name.mp4)
//   LOOPY_TOKEN=... node tools/swap-videos.mjs /path/to/folder --revert     (puts the old addresses back)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const DRY = process.argv.includes('--dry');
const REVERT = process.argv.includes('--revert');
const API = (process.env.LOOPY_API || 'https://tuco-video-api.tucokids.workers.dev').replace(/\/$/, '');
const token = process.env.LOOPY_TOKEN;
if (!dir) { console.error('Usage: LOOPY_TOKEN=... node tools/swap-videos.mjs <folder> [--dry | --revert]'); process.exit(2); }
if (!token) { console.error('Set the LOOPY_TOKEN environment variable first (it is not printed).'); process.exit(2); }
const auth = { authorization: `Bearer ${token}` };
const backupFile = join(dir, 'swap-backup.json');
const call = async (method, path, opts = {}) => {
  const r = await fetch(API + path, { method, ...opts, headers: { ...auth, ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} failed (${r.status}): ${d.error || ''}`);
  return d;
};
const tail = (u) => decodeURIComponent(String(u).split('?')[0].split('/').pop());
const { videos } = await call('GET', '/api/videos');
const save = (v, url, size) => call('PUT', `/api/videos/${v.id}`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...v, url, size }) });

if (REVERT) {
  if (!existsSync(backupFile)) { console.error('No swap-backup.json in that folder, nothing to undo.'); process.exit(1); }
  for (const b of JSON.parse(readFileSync(backupFile, 'utf8'))) {
    const v = videos.find((x) => x.id === b.id);
    if (!v) { console.log('skip (video no longer exists):', b.title); continue; }
    await save(v, b.oldUrl, b.oldSize); console.log('restored:', b.title);
  }
  process.exit(0);
}

const files = readdirSync(dir).filter((f) => /\.mp4$/i.test(f)).sort();
const backup = existsSync(backupFile) ? JSON.parse(readFileSync(backupFile, 'utf8')) : [];
let done = 0, bad = 0;
for (const f of files) {
  const v = videos.find((x) => tail(x.url) === f);
  if (!v) { console.log(`skip ${f}: no video in Loopy uses this file (already swapped, or the name changed)`); continue; }
  const data = readFileSync(join(dir, f));
  console.log(`${v.title}: ${(data.length / 1048576).toFixed(1)} MB`);
  if (DRY) { console.log('  would upload and swap'); continue; }
  try {
    const name = f.replace(/^[0-9a-f-]{36}-/, '');
    const up = await call('PUT', `/api/upload?name=${encodeURIComponent(name)}`, { headers: { 'content-type': 'video/mp4' }, body: data });
    // the new file must answer, and answer with the right size, before anything points to it
    const head = await fetch(up.url, { method: 'HEAD' });
    if (!head.ok || Number(head.headers.get('content-length')) !== data.length) throw new Error('the uploaded file did not check out; nothing was changed');
    backup.push({ id: v.id, title: v.title, oldUrl: v.url, oldSize: v.size || 0, newUrl: up.url, at: new Date().toISOString() });
    writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    await save(v, up.url, data.length);
    console.log('  swapped ->', up.url); done++;
  } catch (e) { console.log('  FAILED:', e.message); bad++; }
}
console.log(`${done} swapped, ${bad} failed.${DRY ? ' (dry run, nothing changed)' : ''}`);
process.exitCode = bad ? 1 : 0;
