import { useEffect, useRef, useState } from 'react';
import { saveWidget, deleteWidget, searchProducts, listCollections, apiBase } from './api.js';
import { Modal, Toggle, Empty, Scaled } from './ui.jsx';
import LayoutField from './LayoutField.jsx';
import { NEW_LAYOUT } from './layoutSpec.js';
import { Thumb } from './media.jsx';

const TYPES = {
  carousel: ['Video Carousel', 'Showcase your best videos in an engaging carousel'],
  stories: ['Video Stories', 'Instagram-style stories with a fullscreen player'],
  banner: ['Banners', 'Full-width video banner with a call to action'],
  spotlight: ['Spotlight', 'Featured video that floats in a corner'],
  feature: ['Video section', 'One portrait video for a section you designed in your theme (sets the video size and shape)'],
  floating: ['Floating Widget', 'Small floating video on every page'],
  gallery: ['Media Gallery Video', "A tagged product's video inside its image gallery"],
};
const PAGE_TYPES = {
  home: ['carousel', 'banner', 'feature', 'stories', 'spotlight'],
  product: ['carousel', 'stories', 'floating', 'gallery'],
  collection: ['carousel', 'stories', 'banner', 'feature'],
  pages: ['carousel', 'stories', 'banner', 'feature'],
};
const TITLES = { home: 'Homepage', product: 'Product Pages', collection: 'Collection Pages', pages: 'Pages' };

export default function WidgetsPage({ page, widgets, videos, settings, loadWidgets, setError, go }) {
  const [editing, setEditing] = useState(null);
  const [embed, setEmbed] = useState(null);
  const mine = widgets.filter((w) => w.page === page);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const hit = (w) => !term || w.name.toLowerCase().includes(term) || w.id.toLowerCase().includes(term) || TYPES[w.type][0].toLowerCase().includes(term);
  const shown = mine.filter(hit);
  const elsewhere = term ? widgets.filter((w) => w.page !== page && hit(w)) : [];
  const act = (fn) => async (...a) => { setError(''); try { await fn(...a); await loadWidgets(); return ''; } catch (e) { setError(e.message); return e.message || 'Something went wrong'; } };
  const typeName = (t) => TYPES[t][0];

  return (
    <>
      <div className="bar"><div><h1>{TITLES[page]}</h1><p className="sub">Create video widgets and copy their embed code into your theme.</p></div></div>
      <h3 className="sect">Create widgets</h3>
      <div className="wcards">
        {PAGE_TYPES[page].map((t) => (
          <div className="wcard" key={t}>
            <div className={'wthumb ' + t}><i /><i /><i /></div>
            <b>{TYPES[t][0]}</b><p>{TYPES[t][1]}</p>
            <button className="btn" onClick={() => setEditing({ name: TYPES[t][0], type: t, page, scope: 'tagged', videoIds: [], productHandles: [], heading: '', enabled: true })}>Create</button>
          </div>
        ))}
      </div>
      <h3 className="sect">Manage widgets</h3>
      {(mine.length > 0 || widgets.length > 0) && (
        <div className="toolbar"><input className="search wsearch" placeholder="Search by widget ID or name, for example wgt_18e72081..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search widgets" />{term && <><span className="muted small">{shown.length} of {mine.length} here</span><button type="button" className="link" onClick={() => setQ('')}>Clear</button></>}</div>
      )}
      {term && !shown.length && mine.length > 0 && <p className="muted pad">No widget on this page matches "{q.trim()}".</p>}
      {term && elsewhere.length > 0 && (
        <div className="elsewhere"><span className="muted small">Found on other pages:</span>{elsewhere.map((w) => <button key={w.id} type="button" className="link" onClick={() => go('w:' + w.page)}>{w.name} <code>{w.id}</code> · {TITLES[w.page]}</button>)}</div>
      )}
      {!mine.length && <Empty>No widgets here yet. Create one above, then copy its embed code into your theme.</Empty>}
      {shown.length > 0 && (
        <table>
          <thead><tr><th>Widget</th><th>Type</th><th>Videos</th><th>On website</th><th /></tr></thead>
          <tbody>{shown.map((w) => (
            <tr key={w.id}>
              <td><b>{w.name}</b> <code>{w.id}</code></td>
              <td>{typeName(w.type)}</td>
              <td>{w.scope === 'custom' ? `${w.videoIds.length} picked` : 'All tagged videos'}{w.productHandles.length > 0 && ` · ${w.productHandles.length} product(s)`}{(w.collectionHandles || []).length > 0 && ` · ${w.collectionHandles.length} collection(s)`}{(w.pageHandles || []).length > 0 && ` · ${w.pageHandles.length} page(s)`}</td>
              <td><div className="row"><Toggle on={w.enabled} onChange={(on) => act(saveWidget)({ ...w, enabled: on })} /><button className="link" onClick={() => setEmbed(w)}>Get embed code</button></div></td>
              <td><div className="row"><button className="btn ghost sm" onClick={() => setEditing(w)}>Manage Widget</button><button className="link red" onClick={() => confirm('Delete this widget?') && act(deleteWidget)(w.id)}>Delete</button></div></td>
            </tr>))}</tbody>
        </table>
      )}
      {page === 'product' && <p className="muted pad">Videos shown on product pages are the ones tagged to that product. Set their order from <button className="link" onClick={() => go('products')}>Products → Arrange Media</button>.</p>}
      {editing && <Editor widget={editing} videos={videos} settings={settings} onClose={() => setEditing(null)} onSave={async (w) => { const m = await act(saveWidget)(w); if (!m) setEditing(null); return m; }} />}
      {embed && <Embed widget={embed} onClose={() => setEmbed(null)} />}
    </>
  );
}

function Editor({ widget, videos, settings, onClose, onSave }) {
  const [w, setW] = useState({ collectionHandles: [], pageHandles: [], overrides: {}, ...widget });
  const [prods, setProds] = useState([]);
  const [colls, setColls] = useState([]);
  const [saveErr, setSaveErr] = useState('');
  const set = (k, v) => setW((o) => ({ ...o, [k]: v }));
  const live = videos.filter((v) => v.status === 'live' && !v.archived);
  const toggleVid = (id) => set('videoIds', w.videoIds.includes(id) ? w.videoIds.filter((x) => x !== id) : [...w.videoIds, id]);
  // Limits a picked video to desktop or phones (empty = both). Stored in the widget's overrides.
  const setDevice = (id, dev) => setW((o) => {
    const next = JSON.parse(JSON.stringify(o.overrides || {}));
    const m = next.deviceOnly || {};
    if (dev === 'desktop' || dev === 'mobile') m[id] = dev; else delete m[id];
    if (Object.keys(m).length) next.deviceOnly = m; else delete next.deviceOnly;
    return { ...o, overrides: next };
  });
  const moveVid = (i, d) => setW((o) => { const n = [...o.videoIds]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return { ...o, videoIds: n }; });
  const showHeading = ['carousel'].includes(w.type);
  const isProduct = w.page === 'product';
  const isColl = w.page === 'collection';
  const loadProds = () => !prods.length && searchProducts('').then(setProds).catch(() => {});
  const loadColls = () => !colls.length && listCollections().then(setColls).catch(() => {});
  const taggedLabel = isProduct ? "Each product's tagged videos" : isColl ? "Videos tagged to the collection's products" : 'All live tagged videos';
  return (
    <Modal title={widget.id ? 'Manage widget' : 'Create widget'} onClose={onClose} wide>
      <div className="two">
        <label className="lab">Widget name<input value={w.name} onChange={(e) => set('name', e.target.value)} /></label>
        {showHeading && <label className="lab">{w.type === 'feature' ? 'Heading shown beside the video' : 'Heading shown above videos'}<input value={w.heading} onChange={(e) => set('heading', e.target.value)} placeholder={w.type === 'feature' ? 'for tangled & itchy hair!' : 'Watch & shop'} /></label>}
      </div>
      {w.type !== 'gallery' && (
        <div className="lab">Which videos
          <div className="checks">
            <label className="chk"><input type="radio" checked={w.scope === 'tagged'} onChange={() => set('scope', 'tagged')} />{taggedLabel}</label>
            <label className="chk"><input type="radio" checked={w.scope === 'custom'} onChange={() => set('scope', 'custom')} />Pick videos</label>
          </div>
        </div>
      )}
      {w.scope === 'custom' && (
        <div className="vpick">{live.map((v) => <label key={v.id} className={'vp' + (w.videoIds.includes(v.id) ? ' on' : '')}><input type="checkbox" checked={w.videoIds.includes(v.id)} onChange={() => toggleVid(v.id)} /><Thumb url={v.url} poster={v.poster} /><span>{v.title}</span></label>)}{!live.length && <p className="muted">No live videos yet.</p>}</div>
      )}
      {w.scope === 'custom' && w.type !== 'gallery' && w.videoIds.length > 1 && (
        <div className="lab">Order of the picked videos <span className="muted">The first one is shown first. Use the arrows to change the order. To use a different video on phones than on desktop, set one to "Desktop only" and the other to "Phones only".</span>
          <div className="arr">{w.videoIds.map((id, i) => { const v = videos.find((x) => x.id === id); return v && (
            <div className="arow" key={id}><Thumb url={v.url} poster={v.poster} /><span>{i + 1}. {v.title}{v.status !== 'live' && <em className="muted"> (draft, not shown until live)</em>}</span>
              <button type="button" className="link" disabled={i === 0} onClick={() => moveVid(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="link" disabled={i === w.videoIds.length - 1} onClick={() => moveVid(i, 1)} aria-label="Move down">↓</button>
              <select className="devsel" aria-label="Show on" value={(w.overrides && w.overrides.deviceOnly && w.overrides.deviceOnly[id]) || ''} onChange={(e) => setDevice(id, e.target.value)}><option value="">Show on desktop and phones</option><option value="desktop">Desktop only</option><option value="mobile">Phones only</option></select>
              <button type="button" className="link red" onClick={() => { toggleVid(id); setDevice(id, ''); }}>Remove</button></div>); })}</div>
        </div>
      )}
      {isProduct && (
        <div className="lab">Show on products
          <select value={w.productHandles.length ? 'some' : 'all'} onChange={(e) => { set('productHandles', e.target.value === 'all' ? [] : ['']); loadProds(); }}><option value="all">All products</option><option value="some">Specific products</option></select>
          {w.productHandles.length > 0 && (
            <select multiple size={6} onFocus={loadProds} value={w.productHandles} onChange={(e) => set('productHandles', [...e.target.selectedOptions].map((o) => o.value))}>
              {prods.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}
            </select>
          )}
        </div>
      )}
      {isColl && (
        <div className="lab">Show on collections
          <select value={w.collectionHandles.length ? 'some' : 'all'} onChange={(e) => { set('collectionHandles', e.target.value === 'all' ? [] : ['']); loadColls(); }}><option value="all">All collections</option><option value="some">Specific collections</option></select>
          {w.collectionHandles.length > 0 && (
            <select multiple size={7} onFocus={loadColls} value={w.collectionHandles} onChange={(e) => set('collectionHandles', [...e.target.selectedOptions].map((o) => o.value))}>
              {colls.map((c) => <option key={c.handle} value={c.handle}>{c.title}</option>)}
            </select>
          )}
          <span className="muted">Hold Cmd (Mac) or Ctrl to pick several. The widget shows only on those collection pages.</span>
        </div>
      )}
      {w.page === 'pages' && (
        <label className="lab">Show only on these pages (optional)
          <input value={w.pageHandles.join(', ')} onChange={(e) => set('pageHandles', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="e.g. gifting, about-us (the last part of the page address)" />
          <span className="muted">Leave empty to show wherever you paste the embed code.</span>
        </label>
      )}
      <Appearance w={w} setW={setW} settings={settings} />
      {w.type !== 'gallery' && <LivePreview w={w} videos={videos} settings={settings} />}
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={async () => setSaveErr((await onSave({ ...w, productHandles: w.productHandles.filter(Boolean), collectionHandles: w.collectionHandles.filter(Boolean) })) || '')}>Save widget</button></div>
      {saveErr && <p className="red small">{saveErr}</p>}
    </Modal>
  );
}

// Merges one widget's overrides into the global settings the same way the API does, so the preview matches the store.
function mergeOv(settings, ov) {
  const out = JSON.parse(JSON.stringify(settings || {}));
  for (const [k, v] of Object.entries(ov || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') Object.assign(out[k], v); else out[k] = v;
  }
  return out;
}

// Shows the real store widget, with the settings being edited, on a desktop-width and a phone-width canvas.
function LivePreview({ w, videos, settings }) {
  const [device, setDevice] = useState('desktop');
  const ref = useRef();
  const live = videos.filter((v) => v.status === 'live' && !v.archived);
  const picked = w.scope === 'custom' ? w.videoIds.map((id) => live.find((v) => v.id === id)).filter(Boolean) : live.filter((v) => v.products && v.products.length).slice(0, 8);
  const shown = picked.filter((v) => !(w.overrides && w.overrides.deviceOnly && w.overrides.deviceOnly[v.id] && w.overrides.deviceOnly[v.id] !== device));
  const key = JSON.stringify([w.type, w.heading, w.overrides, w.videoIds, w.scope, device, shown.length]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.TucoVideo || !settings) return;
    el.replaceChildren();
    const host = document.createElement('div');
    el.appendChild(host);
    try { window.TucoVideo.render(host, { settings: mergeOv(settings, w.overrides), widget: { id: 'preview', type: w.type, heading: w.heading || (w.type === 'feature' ? 'Your heading goes here' : ''), overrides: w.overrides || {} }, videos: shown }, { preview: true, device }); } catch { /* the preview is only a convenience */ }
  }, [key, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="lab">Preview
      <div className="row"><button type="button" className={'btn sm ' + (device === 'desktop' ? '' : 'ghost')} onClick={() => setDevice('desktop')}>Desktop</button><button type="button" className={'btn sm ' + (device === 'mobile' ? '' : 'ghost')} onClick={() => setDevice('mobile')}>Phone</button><span className="muted small">Updates as you change the settings above.</span></div>
      <div className="lpv" style={{ width: device === 'mobile' ? 390 : '100%' }}>{device === 'desktop' ? <Scaled><div ref={ref} /></Scaled> : <div ref={ref} />}{!shown.length && <p className="muted small pad">Pick at least one live video to see the preview.</p>}</div>
    </div>
  );
}

function Embed({ widget, onClose }) {
  const attr = widget.type === 'gallery' ? ' data-insert-into=".product__media-list"' : '';
  const full = `<div data-tuco-video data-widget="${widget.id}"${attr}></div>`;
  const simple = widget.type !== 'gallery';
  const where = ['floating', 'spotlight'].includes(widget.type) ? 'Paste it into a Custom Liquid section anywhere on the page; the video floats in the corner.' : 'In the theme editor, add a Custom Liquid section where the widget should appear and paste it into the box.';
  return (
    <Modal title="Embed code" onClose={onClose}>
      <p className="muted">{where} The Loopy script line must already be in theme.liquid (once per page).</p>
      {simple && <><h3>For testing: just the widget ID</h3><p className="muted small">If the Loopy script is ever blocked (for example by an ad blocker), the ID text would show on the page. Use the full tag below on your live store, because it stays invisible.</p><textarea readOnly rows={1} className="code" value={widget.id} onFocus={(e) => e.target.select()} /><div className="row end"><button className="btn ghost sm" onClick={() => navigator.clipboard.writeText(widget.id)}>Copy ID</button></div></>}
      <h3>{simple ? 'For the live store: the full tag (recommended)' : 'Full tag (needed for the gallery widget)'}</h3>
      <textarea readOnly rows={2} className="code" value={full} onFocus={(e) => e.target.select()} />
      <div className="row end"><button className="btn" onClick={() => navigator.clipboard.writeText(full)}>Copy tag</button></div>
    </Modal>
  );
}

const AUTO_SHAPE = ['auto', 'Match the video (recommended)'];
const RATIOS_WIDE = ['16/9', '21/9', '2/1', '3/1', '4/3', '1/1'];
const RATIOS_TALL = ['9/16', '4/5', '3/4', '1/1', '4/3', '16/9'];
const FIT = [['cover', 'Fill (crop to fit)'], ['contain', 'Show whole video']];
// Which settings each widget type can override, and the control to use for each.
const OV_FIELDS = {
  banner: [
    ['banner', 'heightModeDesktop', 'Banner on desktop', 'sel', [['ratio', 'By shape'], ['fixed', 'Exact height']]], ['banner', 'heightModeMobile', 'Banner on phones', 'sel', [['ratio', 'By shape'], ['fixed', 'Exact height']]],
    ['banner', 'desktopHeight', 'Desktop height (px)', 'num'], ['banner', 'mobileHeight', 'Mobile height (px)', 'num'],
    ['banner', 'aspectLandscape', 'Desktop shape', 'sel', [AUTO_SHAPE, ...RATIOS_WIDE.map((r) => [r, r])]], ['banner', 'aspectPortrait', 'Mobile shape', 'sel', [AUTO_SHAPE, ...RATIOS_TALL.map((r) => [r, r === '1/1' ? '1/1 (square, e.g. 430 × 430)' : r])]],
    ['banner', 'fitDesktop', 'Video fit, desktop', 'sel', FIT], ['banner', 'fitMobile', 'Video fit, mobile', 'sel', FIT],
    ['banner', 'focusDesktop', 'Keep when cropping, desktop', 'sel', [['center', 'Middle'], ['top', 'Top'], ['bottom', 'Bottom']]], ['banner', 'focusMobile', 'Keep when cropping, mobile', 'sel', [['center', 'Middle'], ['top', 'Top'], ['bottom', 'Bottom']]],
    ['banner', 'showDots', 'Navigation dots', 'bool'], ['banner', 'showCta', 'Call to action', 'bool'],
  ],
  carousel: [
    ['carousel', 'tileAspect', 'Tile shape', 'sel', [['9/16', 'Tall 9:16'], ['4/5', 'Portrait 4:5'], ['3/4', 'Portrait 3:4'], ['1/1', 'Square'], ['4/3', 'Landscape 4:3'], ['16/9', 'Wide 16:9']]],
    ['carousel', 'tileWidthDesktop', 'Tile width, desktop (px)', 'num'], ['carousel', 'tileWidthMobile', 'Tile width, mobile (px)', 'num'],
    ['carousel', 'tileFitDesktop', 'Video fit, desktop', 'sel', FIT], ['carousel', 'tileFitMobile', 'Video fit, mobile', 'sel', FIT], [null, 'tileType', 'Tile style', 'sel', [['overlay', 'Overlay'], ['below', 'Info below'], ['feed', 'Feed'], ['minimal', 'Minimal']]],
    ['carousel', 'ordering', 'Video order', 'sel', [['none', 'As arranged'], ['newest', 'Newest first'], ['shuffle', 'Shuffle']]],
  ],
  stories: [['stories', 'sizeFactor', 'Story size factor', 'num'], ['stories', 'spacing', 'Spacing factor', 'num']],
  spotlight: [
    ['spotlight', 'position', 'Position', 'sel', [['left', 'Left'], ['right', 'Right']]], ['spotlight', 'sizeFactor', 'Size factor', 'num'],
    ['spotlight', 'bottomOffsetMobile', 'Distance from bottom, mobile (px)', 'num'], ['spotlight', 'bottomOffsetDesktop', 'Distance from bottom, desktop (px)', 'num'],
  ],
};
// The shared layout rows (sizes, corners, gaps, margins) apply to each widget type too.
for (const t of ['banner', 'carousel', 'stories', 'spotlight']) OV_FIELDS[t] = [...OV_FIELDS[t], ...NEW_LAYOUT[t]];
// Colours, fonts and text: empty means "use the global setting". Every widget type can change its main colour, font and button text.
const WEIGHTS = [['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra bold']];
const LOOK = {
  all: [[null, 'brandColor', 'Button and highlight colour', 'color'], [null, 'brandFont', 'Font', 'font'], [null, 'shopNowText', 'Button text', 'text'], [null, 'clickAction', 'When the video is clicked', 'sel', [['player', 'Open the video player'], ['none', 'Do nothing']]], [null, 'clickLink', 'Link when the video is clicked (optional)', 'url'], [null, 'clickTarget', 'Open that link in', 'sel', [['same', 'The same tab'], ['new', 'A new tab']]]],
  carousel: [['carousel', 'headingColor', 'Heading colour', 'color'], ['carousel', 'headingFont', 'Heading font', 'font'], ['carousel', 'headingWeight', 'Heading weight', 'sel', WEIGHTS], ['carousel', 'detailsColor', 'Product text colour', 'color'], ['carousel', 'feedAtcColor', 'Feed button colour', 'color'], ['carousel', 'feedAtcTextColor', 'Feed button text colour', 'color'], [null, 'showViews', 'Show view counts', 'bool']],
  stories: [['stories', 'borderColor', 'Story ring colour', 'color'], ['stories', 'titleColor', 'Story label colour', 'color']],
  banner: [['banner', 'background', 'Banner bar colour', 'color']],
};
for (const t of ['banner', 'carousel', 'stories', 'spotlight']) OV_FIELDS[t] = [...OV_FIELDS[t], ...LOOK.all, ...(LOOK[t] || [])];
OV_FIELDS.floating = OV_FIELDS.spotlight;
// "Video section": the heading and layout settings first, then the video box uses the banner settings (portrait by default).
const FEATURE_RATIOS = [AUTO_SHAPE, ['5/6', 'Portrait 5:6'], ['4/5', 'Portrait 4:5'], ['3/4', 'Portrait 3:4'], ['1/1', 'Square'], ['4/3', 'Landscape 4:3'], ['16/9', 'Wide 16:9']];
OV_FIELDS.feature = [
  ['feature', 'shapeDesktop', 'Video shape, desktop', 'sel', FEATURE_RATIOS], ['feature', 'shapeMobile', 'Video shape, mobile', 'sel', FEATURE_RATIOS],
  ...NEW_LAYOUT.feature,
  ['banner', 'fitDesktop', 'Video fit, desktop', 'sel', FIT], ['banner', 'fitMobile', 'Video fit, mobile', 'sel', FIT],
  ['banner', 'focusDesktop', 'Keep when cropping, desktop', 'sel', [['center', 'Middle'], ['top', 'Top'], ['bottom', 'Bottom']]], ['banner', 'focusMobile', 'Keep when cropping, mobile', 'sel', [['center', 'Middle'], ['top', 'Top'], ['bottom', 'Bottom']]],
  [null, 'clickAction', 'When the video is clicked', 'sel', [['player', 'Open the video player'], ['none', 'Do nothing']]],
  [null, 'clickLink', 'Link when the video is clicked (optional)', 'url'], [null, 'clickTarget', 'Open that link in', 'sel', [['same', 'The same tab'], ['new', 'A new tab']]],
];

// Lets one widget look different from the global Customizations. Empty fields follow the global setting.
function Appearance({ w, setW, settings }) {
  const fields = OV_FIELDS[w.type];
  if (!fields) return null;
  const ov = w.overrides || {};
  const get = (g, k) => (g ? ov[g] && ov[g][k] : ov[k]);
  const glob = (g, k) => (settings ? (g ? settings[g] && settings[g][k] : settings[k]) : undefined);
  const set = (g, k, val) => setW((o) => {
    const next = JSON.parse(JSON.stringify(o.overrides || {}));
    const clear = val === '' || val === undefined;
    if (g) { next[g] = next[g] || {}; if (clear) delete next[g][k]; else next[g][k] = val; if (!Object.keys(next[g]).length) delete next[g]; }
    else if (clear) delete next[k]; else next[k] = val;
    return { ...o, overrides: next };
  });
  const used = fields.filter(([g, k]) => get(g, k) !== undefined).length;
  return (
    <details className="appear">
      <summary>Appearance for this widget (optional){used > 0 && <span className="pill live">{used} changed</span>}</summary>
      <p className="muted small">Anything left on "Use global setting" follows Customizations. Change a field here to make only this widget different.</p>
      <div className="ovgrid">
        {fields.map(([g, k, label, kind, opts]) => {
          const cur = get(g, k);
          const gv = glob(g, k);
          return (
            <label className="lab" key={(g || 'root') + k}>{label}
              {['num', 'sel', 'corner'].includes(kind) && <LayoutField spec={[g, k, label, kind, opts]} value={cur} placeholder={gv !== undefined && gv !== null && gv !== '' ? `Global: ${gv}` : 'Global: default'} emptyLabel="Use global setting" onChange={(v) => set(g, k, v)} />}
              {kind === 'color' && <OvColor value={cur} placeholder={gv ? `Global: ${gv}` : 'Global: default'} fallback={gv} onChange={(v) => set(g, k, v)} />}
              {kind === 'url' && <input value={cur || ''} maxLength={2000} placeholder="Empty: the video opens the player. Example: /collections/all" onChange={(e) => set(g, k, e.target.value.trim())} />}
              {(kind === 'font' || kind === 'text') && <input value={cur || ''} maxLength={kind === 'font' ? 60 : 40} placeholder={gv ? `Global: ${gv}` : 'Use global setting'} onChange={(e) => set(g, k, e.target.value)} />}
              {kind === 'bool' && <select value={cur === undefined ? '' : String(cur)} onChange={(e) => set(g, k, e.target.value === '' ? '' : e.target.value === 'true')}><option value="">Use global setting</option><option value="true">On</option><option value="false">Off</option></select>}
            </label>
          );
        })}
      </div>
      {used > 0 && <button type="button" className="link" onClick={() => setW((o) => ({ ...o, overrides: {} }))}>Reset all to global</button>}
    </details>
  );
}

// A colour that can be left empty (follow the global setting). Typing is only applied once it is a full #rrggbb colour.
const HEX = /^#[0-9a-fA-F]{6}$/;
function OvColor({ value, placeholder, fallback, onChange }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  const ok = draft === '' || HEX.test(draft);
  return (
    <span className="ovcolor">
      <input className={ok ? '' : 'bad'} value={draft} maxLength={7} placeholder={placeholder} aria-invalid={!ok}
        onChange={(e) => { const v = e.target.value.trim(); setDraft(v); if (v === '') onChange(''); else if (HEX.test(v)) onChange(v); }} />
      <input type="color" aria-label="Pick a colour" value={HEX.test(value || '') ? value : HEX.test(fallback || '') ? fallback : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}
