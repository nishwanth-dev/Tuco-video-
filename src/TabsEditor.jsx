// The editor for the "Product tabs" widget: heading, tabs (each with a collection, hand-picked products and a first-slide video), and a live preview.
import { useEffect, useRef, useState } from 'react';
import { searchProducts, listCollections, previewWidget } from './api.js';
import { Thumb } from './media.jsx';
import { Scaled } from './ui.jsx';

export const blankTab = (n) => ({ title: n ? `Tab ${n}` : 'New tab', icon: '', collection: '', limit: 10, showRating: true, products: [], videoId: '', overlayHeading: '', overlaySub: '', link: '', viewAllText: '', viewAllUrl: '' });
export const newTabsOverrides = () => ({ content: { heading: '', subheading: '', atcText: 'add to cart', soldOutText: 'sold out', offersHeading: '', tabs: [blankTab(1)] } });

// Hand-picked products: the chosen ones as chips, and a search box to add more.
function ProductPicker({ value, onChange, prods, load }) {
  const [q, setQ] = useState('');
  const name = (h) => (prods.find((p) => p.handle === h) || {}).title || h;
  const term = q.trim().toLowerCase();
  const matches = term ? prods.filter((p) => !value.includes(p.handle) && (p.title.toLowerCase().includes(term) || p.handle.includes(term))).slice(0, 8) : [];
  return (
    <div className="lab">Hand-picked products <span className="muted">They are shown after the collection's products.</span>
      {value.length > 0 && <div className="tags">{value.map((h) => <span className="tag" key={h}>{name(h)} <button type="button" className="x2" aria-label={`Remove ${name(h)}`} onClick={() => onChange(value.filter((x) => x !== h))}>×</button></span>)}</div>}
      <input value={q} onFocus={load} onChange={(e) => { setQ(e.target.value); load(); }} placeholder="Type to find a product to add" aria-label="Find a product to add" />
      {matches.length > 0 && <div className="pmatch">{matches.map((p) => <button type="button" key={p.handle} className="link" onClick={() => { onChange([...value, p.handle]); setQ(''); }}>+ {p.title}</button>)}</div>}
      {term && !matches.length && prods.length > 0 && <span className="muted small">No product matches "{q.trim()}".</span>}
    </div>
  );
}

function TabCard({ t, i, n, set, move, remove, videos, colls, prods, loadProds }) {
  const live = videos.filter((v) => v.status === 'live' && !v.archived).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const chosen = videos.find((v) => v.id === t.videoId);
  return (
    <details className="tabcard" open={i === 0}>
      <summary><b>{t.title || 'Untitled tab'}</b> <span className="muted small">{t.collection ? 'collection' : ''}{t.collection && t.products.length ? ' + ' : ''}{t.products.length ? `${t.products.length} picked` : ''}{!t.collection && !t.products.length ? 'no products yet' : ''}{t.videoId ? ' · video' : ''}</span></summary>
      <div className="two">
        <label className="lab">Tab name<input value={t.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="lab">Tab icon picture link (optional)<input value={t.icon} placeholder="https://..." onChange={(e) => set({ icon: e.target.value.trim() })} /></label>
      </div>
      <div className="two">
        <label className="lab">Collection (its products are shown)
          <select value={t.collection} onFocus={() => {}} onChange={(e) => set({ collection: e.target.value })}>
            <option value="">None, only hand-picked products</option>
            {t.collection && !colls.some((c) => c.handle === t.collection) && <option value={t.collection}>{t.collection}</option>}
            {colls.map((c) => <option key={c.handle} value={c.handle}>{c.title}</option>)}
          </select>
        </label>
        <label className="lab">Most products from the collection<input type="number" min="1" max="25" value={t.limit} onChange={(e) => set({ limit: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
      </div>
      <label className="chk"><input type="checkbox" checked={t.showRating !== false} onChange={(e) => set({ showRating: e.target.checked })} />Show star ratings on this tab's products</label>
      <ProductPicker value={t.products} onChange={(products) => set({ products })} prods={prods} load={loadProds} />
      <div className="lab">First slide: a video
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {chosen && <Thumb url={chosen.url} poster={chosen.poster} className="tabthumb" />}
          <select value={t.videoId} onChange={(e) => set({ videoId: e.target.value })} style={{ flex: 1, minWidth: 200 }}>
            <option value="">No video, products only</option>
            {t.videoId && !live.some((v) => v.id === t.videoId) && <option value={t.videoId}>{chosen ? `${chosen.title} (not live)` : 'A video that was removed'}</option>}
            {live.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
          </select>
        </div>
        <span className="muted small">It plays by itself, muted, in a tall 9:16 slide before the products. Only live videos can be chosen.</span>
      </div>
      <div className="two">
        <label className="lab">Text on the video (optional)<input value={t.overlayHeading} maxLength={80} onChange={(e) => set({ overlayHeading: e.target.value })} placeholder="e.g. Glow Naturally" /></label>
        <label className="lab">Smaller text on the video (optional)<input value={t.overlaySub} maxLength={160} onChange={(e) => set({ overlaySub: e.target.value })} /></label>
      </div>
      <label className="lab">Link when the video is clicked (optional)<input value={t.link} placeholder="/collections/face-wash" onChange={(e) => set({ link: e.target.value.trim() })} /></label>
      <div className="two">
        <label className="lab">"View all" text (optional)<input value={t.viewAllText} maxLength={80} placeholder={`View all ${t.title || 'this'} products`} onChange={(e) => set({ viewAllText: e.target.value })} /></label>
        <label className="lab">"View all" link (optional)<input value={t.viewAllUrl} placeholder={t.collection ? `/collections/${t.collection}` : 'Leave empty for no View all card'} onChange={(e) => set({ viewAllUrl: e.target.value.trim() })} /></label>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="link" disabled={i === 0} onClick={() => move(-1)}>↑ Move left</button>
        <button type="button" className="link" disabled={i === n - 1} onClick={() => move(1)}>↓ Move right</button>
        <button type="button" className="link red" disabled={n <= 1} onClick={remove}>Remove this tab</button>
      </div>
    </details>
  );
}

export function TabsContent({ w, setW, videos }) {
  const content = (w.overrides && w.overrides.content) || {};
  const tabs = content.tabs || [];
  const [colls, setColls] = useState([]);
  const [prods, setProds] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const loadProds = () => { if (!loaded) { setLoaded(true); searchProducts('').then(setProds).catch(() => {}); } };
  useEffect(() => { listCollections().then(setColls).catch(() => {}); loadProds(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setContent = (patch) => setW((o) => ({ ...o, overrides: { ...(o.overrides || {}), content: { ...((o.overrides || {}).content || {}), ...patch } } }));
  const setTab = (i, patch) => setContent({ tabs: tabs.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const moveTab = (i, d) => { const n = [...tabs]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setContent({ tabs: n }); };
  return (
    <div className="tabsed">
      <button type="button" className="link" onClick={() => { const el = document.getElementById('tabs-preview'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Jump to the preview ↓</button>
      <div className="two">
        <label className="lab">Heading<input value={content.heading || ''} maxLength={120} onChange={(e) => setContent({ heading: e.target.value })} placeholder="e.g. Our Bestsellers" /></label>
        <label className="lab">Subheading (optional)<input value={content.subheading || ''} maxLength={300} onChange={(e) => setContent({ subheading: e.target.value })} /></label>
      </div>
      <div className="two">
        <label className="lab">Add to cart button text<input value={content.atcText || ''} maxLength={30} onChange={(e) => setContent({ atcText: e.target.value })} placeholder="add to cart" /></label>
        <label className="lab">Sold out button text<input value={content.soldOutText || ''} maxLength={30} onChange={(e) => setContent({ soldOutText: e.target.value })} placeholder="sold out" /></label>
      </div>
      <label className="lab">Offer badge on every product card (optional)<input value={content.offersHeading || ''} maxLength={40} onChange={(e) => setContent({ offersHeading: e.target.value })} placeholder="e.g. Buy 2 get 1 free" /></label>
      <h3 className="sect" style={{ marginTop: 14 }}>Tabs ({tabs.length})</h3>
      {tabs.map((t, i) => <TabCard key={i} t={t} i={i} n={tabs.length} videos={videos} colls={colls} prods={prods} loadProds={loadProds}
        set={(patch) => setTab(i, patch)} move={(d) => moveTab(i, d)} remove={() => setContent({ tabs: tabs.filter((_, k) => k !== i) })} />)}
      <button type="button" className="btn ghost" disabled={tabs.length >= 12} onClick={() => setContent({ tabs: [...tabs, blankTab(tabs.length + 1)] })}>+ Add a tab</button>
      {tabs.length >= 12 && <span className="muted small"> The most is 12 tabs.</span>}
    </div>
  );
}

// Shows the real widget with the products, prices and ratings the store would show, on a computer-width and a phone-width canvas.
export function TabsPreview({ w }) {
  const [device, setDevice] = useState('desktop');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const seq = useRef(0);
  const key = JSON.stringify(w.overrides || {});
  useEffect(() => {
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      previewWidget(w.overrides || {})
        .then((d) => { if (seq.current === my) { setData(d); setErr(''); } })
        .catch((e) => { if (seq.current === my) setErr(e.message || 'The preview could not be made'); })
        .finally(() => { if (seq.current === my) setBusy(false); });
    }, 700);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current;
    if (!el || !data || !window.TucoVideo) return;
    el.replaceChildren();
    const host = document.createElement('div');
    el.appendChild(host);
    try { window.TucoVideo.render(host, { settings: data.settings, widget: data.widget, tabs: data.tabs, catalogOk: data.catalogOk }, { preview: true, device }); } catch (e) { setErr('The preview could not be drawn'); }
  }, [data, device]);
  return (
    <div className="lab" id="tabs-preview">Preview
      <div className="row"><button type="button" className={'btn sm ' + (device === 'desktop' ? '' : 'ghost')} onClick={() => setDevice('desktop')}>Desktop</button><button type="button" className={'btn sm ' + (device === 'mobile' ? '' : 'ghost')} onClick={() => setDevice('mobile')}>Phone</button><span className="muted small">{busy ? 'Updating the preview...' : 'Real products, prices and ratings from your store.'}</span></div>
      {err && <p className="red small" role="alert">{err}</p>}
      {data && data.catalogOk === false && <p className="muted small">The store's product list could not be read just now, so product cards are missing here.</p>}
      <div className="lpv" style={{ width: device === 'mobile' ? 390 : '100%' }}>{device === 'desktop' ? <Scaled><div ref={ref} /></Scaled> : <div ref={ref} />}</div>
    </div>
  );
}
