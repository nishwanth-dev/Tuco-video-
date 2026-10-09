#!/usr/bin/env node
// Imports a whatmore-export.json into Loopy: videos (with product tags) and widgets (with their video lists).
// Usage: LOOPY_API=https://... LOOPY_TOKEN=... node tools/import-whatmore.mjs whatmore-export.json [--copy] [--live] [--limit 10] [--dry-run]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
let file = '';
let limit = Infinity;
const flags = new Set();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit') limit = Number(args[++i]);
  else if (args[i].startsWith('--')) flags.add(args[i].slice(2));
  else file = args[i];
}
const flag = (n) => flags.has(n);
const { LOOPY_API: API, LOOPY_TOKEN: TOKEN } = process.env;
if (!file || !API || !TOKEN) { console.error('Usage: LOOPY_API=... LOOPY_TOKEN=... node tools/import-whatmore.mjs whatmore-export.json [--copy] [--live] [--limit N] [--dry-run]'); process.exit(1); }

const data = JSON.parse(readFileSync(file, 'utf8'));
const call = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.error || ''}`);
  return j;
};

// Whatmore "banner" widgets become Loopy banners; "collection" ones become carousels on collection pages; names with PDP go on product pages.
const mapWidget = (w) => {
  const name = w.name || 'Widget';
  const page = w.type === 'collection' ? 'collection' : /pdp|product/i.test(name) ? 'product' : 'home';
  const type = w.type === 'banner' ? 'banner' : 'carousel';
  return { name, type: page === 'product' && type === 'carousel' ? 'carousel' : type, page };
};

const inWidget = new Set(data.widgets.length ? data.videos.filter((v) => v.widgets.length).map((v) => v.id) : []);
const videos = data.videos.filter((v) => v.url).slice(0, limit);
console.log(`${videos.length} videos, ${data.widgets.length} widgets${flag('dry-run') ? ' (dry run, nothing is written)' : ''}`);
if (flag('dry-run')) { console.log(`copy mode: ${flag('copy') ? 'copy into R2' : 'link only'}; tagged: ${videos.filter((v) => v.products.length).length}; in widgets: ${videos.filter((v) => inWidget.has(v.id)).length}`); process.exit(0); }

const idMap = new Map();
let done = 0;
for (const v of videos) {
  try {
    const res = await call('POST', '/api/import', {
      url: v.url, copy: flag('copy'), poster: v.poster, title: v.title || v.sourceHandle.replace(/\.mp4$/i, '') || `Whatmore video ${v.id}`,
      status: flag('live') && v.widgets.length ? 'live' : 'draft', placements: v.widgets.length ? ['home'] : [], products: v.products.map((p) => ({ handle: p.handle, title: p.title })),
      source: 'whatmore', sourceId: `wm:${v.id}`,
    });
    idMap.set(v.id, res.id);
    console.log(`${++done}/${videos.length} ${res.skipped ? 'skipped (already imported)' : 'imported'}: ${v.title || v.id}`);
  } catch (e) { console.error(`failed ${v.id}: ${e.message}`); }
}

const existing = (await call('GET', '/api/widgets')).widgets;
for (const w of data.widgets) {
  const m = mapWidget(w);
  if (existing.some((x) => x.name === m.name && x.type === m.type && x.page === m.page)) { console.log(`widget already exists, skipped: ${w.name}`); continue; }
  const members = videos.filter((v) => v.widgets.some((x) => x.id === w.id) && idMap.has(v.id))
    .sort((a, b) => (a.widgets.find((x) => x.id === w.id).rank || 0) - (b.widgets.find((x) => x.id === w.id).rank || 0));
  if (!members.length) continue;
  try {
    await call('POST', '/api/widgets', { ...mapWidget(w), scope: 'custom', videoIds: members.map((v) => idMap.get(v.id)), enabled: false });
    console.log(`widget created (switched off, review it): ${w.name}`);
  } catch (e) { console.error(`widget ${w.name} failed: ${e.message}`); }
}
console.log('Done. Review widgets in Loopy, set the right collection or page for each, then switch them on.');
