#!/usr/bin/env node
// Read-only health check of the Loopy API. Visits three public addresses like a visitor would, then saves the result to
// Loopy's "Site checks" page. It never changes widgets, videos or the website.
//   node tools/api-health.mjs [--dry]
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DRY = process.argv.includes('--dry');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://tuco-video-api.tucokids.workers.dev';
const targets = [
  ['Home banner data', `${API}/api/public/config?widget=wgt_4f3c2bba&page=home`],
  ['Haircare banner data', `${API}/api/public/config?widget=wgt_20418031`],
  ['Player script (widget.js)', 'https://loopy.tucokids.workers.dev/widget.js'],
];
const started = Date.now();
const LIMIT = /1015|1102|exceeded|rate limit|too many requests/i;

async function probe(url) {
  const t = Date.now();
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(url, { headers: { 'user-agent': 'LoopyHealthCheck/1.0' }, signal: ctl.signal }); const body = await r.text(); clearTimeout(to);
    return { status: r.status, ms: Date.now() - t, limit: LIMIT.test(r.status >= 400 ? body.slice(0, 600) : ''), size: body.length };
  } catch (e) { return { status: 0, ms: Date.now() - t, limit: false, size: 0, err: e.name === 'AbortError' ? 'no answer in 15 s' : 'could not connect' }; }
}

const details = [];
for (const [name, url] of targets) {
  let r = await probe(url);
  if (r.status !== 200) { await new Promise((s) => setTimeout(s, 5000)); const again = await probe(url); if (again.status === 200) r = { ...again, warn: `first try failed (${r.status || r.err}), second worked` }; }
  const problems = []; const warnings = [];
  if (r.status !== 200) problems.push(r.status === 0 ? r.err : `answered ${r.status}` + (r.limit ? ' (looks like the Cloudflare free daily limit was hit)' : ''));
  else if (r.ms > 3000) warnings.push(`slow: ${(r.ms / 1000).toFixed(1)} s`);
  if (r.warn) warnings.push(r.warn);
  details.push({ url, path: name, device: 'server', widget: 'API', type: 'api', drawn: r.status === 200, playing: null, shapeOk: null, expected: '200', actual: `${r.status || 'none'} in ${r.ms} ms`, problems, warnings });
}
const problems = details.reduce((n, d) => n + d.problems.length, 0);
const warns = details.reduce((n, d) => n + d.warnings.length, 0);
const status = problems ? 'fail' : warns ? 'warn' : 'ok';
const hitLimit = details.some((d) => d.problems.some((p) => /daily limit/.test(p)));
const notes = ['API health check (not a banner check).'];
if (problems) notes.push(hitLimit ? 'The Cloudflare free plan limit (100,000 requests a day) looks to be reached. Upgrading to Workers Paid ($5/month) removes it.' : 'The Loopy API is not answering normally.');
const rec = { at: Date.now(), status, pages: targets.length, failures: problems, durationS: Math.round((Date.now() - started) / 1000), summary: { kind: 'api-health', notes }, details };

const dir = join(homedir(), 'Downloads', 'loopy-site-checks'); mkdirSync(dir, { recursive: true });
if (!DRY) {
  const q = (s) => "'" + s.replace(/'/g, "''") + "'";
  const f = join(dir, '.last-health.sql');
  writeFileSync(f, `INSERT INTO site_checks (at,status,pages,failures,duration_s,summary,details) VALUES (${rec.at},${q(status)},${rec.pages},${rec.failures},${rec.durationS},${q(JSON.stringify(rec.summary))},${q(JSON.stringify(details))});`);
  try { execFileSync('npx', ['wrangler', 'd1', 'execute', 'tuco-video', '--remote', '--file', f], { cwd: join(ROOT, 'worker'), stdio: 'pipe' }); console.log('Saved to Loopy (Site checks page).'); }
  catch (e) { console.log('Could not save to Loopy: ' + String(e.stderr || e.message).slice(0, 200)); }
}
console.log(`API HEALTH ${status.toUpperCase()} | ${details.map((d) => `${d.path}: ${d.actual}`).join(' | ')}`);
details.filter((d) => d.problems.length).forEach((d) => console.log(` - ${d.path}: ${d.problems.join('; ')}`));
