#!/usr/bin/env node
// Uploads every .jpg/.png/.webp in a folder to Loopy under /media/ingredients/<same file name>.
// The admin token is read from the LOOPY_TOKEN environment variable and is never printed.
//
//   LOOPY_TOKEN=... node tools/upload-ingredients.mjs /path/to/folder [--dry]
//
// Files that are already uploaded are skipped, so it is safe to run again.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const DRY = process.argv.includes('--dry');
const API = (process.env.LOOPY_API || 'https://tuco-video-api.tucokids.workers.dev').replace(/\/$/, '');
const token = process.env.LOOPY_TOKEN;
if (!dir) { console.error('Usage: LOOPY_TOKEN=... node tools/upload-ingredients.mjs <folder> [--dry]'); process.exit(2); }
if (!token && !DRY) { console.error('Set the LOOPY_TOKEN environment variable first (it is not printed).'); process.exit(2); }

const files = readdirSync(dir).filter((f) => /^[a-z0-9][a-z0-9._-]{0,80}\.(jpe?g|png|webp)$/.test(f)).sort();
const skippedNames = readdirSync(dir).filter((f) => !files.includes(f) && !f.startsWith('.'));
let up = 0, had = 0, bad = 0;
for (const f of files) {
  const url = `${API}/media/ingredients/${f}`;
  if ((await fetch(url, { method: 'HEAD' })).ok) { had++; continue; }
  if (DRY) { console.log('would upload', f); up++; continue; }
  const ext = f.split('.').pop();
  const r = await fetch(`${API}/api/files/ingredients/${f}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' }, body: readFileSync(join(dir, f)) });
  if (r.status === 201) up++; else if (r.status === 409) had++; else { bad++; console.log(`FAILED ${f}: HTTP ${r.status}`); }
}
console.log(`${up} ${DRY ? 'to upload' : 'uploaded'}, ${had} already there, ${bad} failed${skippedNames.length ? `, ${skippedNames.length} ignored (names not allowed)` : ''}.`);
if (bad) process.exit(1);
