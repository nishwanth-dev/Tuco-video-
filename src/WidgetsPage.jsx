import { useState } from 'react';
import { saveWidget, deleteWidget, searchProducts, apiBase } from './api.js';
import { Modal, Toggle, Empty } from './ui.jsx';
import { Thumb } from './media.jsx';

const TYPES = {
  carousel: ['Video Carousel', 'Showcase your best videos in an engaging carousel'],
  stories: ['Video Stories', 'Instagram-style stories with a fullscreen player'],
  banner: ['Banners', 'Full-width video banner with a call to action'],
  spotlight: ['Spotlight', 'Featured video that floats in a corner'],
  floating: ['Floating Widget', 'Small floating video on every page'],
  gallery: ['Media Gallery Video', "A tagged product's video inside its image gallery"],
};
const PAGE_TYPES = {
  home: ['carousel', 'banner', 'stories', 'spotlight'],
  product: ['carousel', 'stories', 'floating', 'gallery'],
  collection: ['carousel', 'stories', 'banner'],
  pages: ['carousel', 'stories', 'banner'],
};
const TITLES = { home: 'Homepage', product: 'Product Pages', collection: 'Collection Pages', pages: 'Pages' };

export default function WidgetsPage({ page, widgets, videos, loadWidgets, setError, go }) {
  const [editing, setEditing] = useState(null);
  const [embed, setEmbed] = useState(null);
  const mine = widgets.filter((w) => w.page === page);
  const act = (fn) => async (...a) => { try { await fn(...a); await loadWidgets(); } catch (e) { setError(e.message); } };
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
      {!mine.length && <Empty>No widgets here yet. Create one above, then copy its embed code into your theme.</Empty>}
      {mine.length > 0 && (
        <table>
          <thead><tr><th>Widget</th><th>Type</th><th>Videos</th><th>On website</th><th /></tr></thead>
          <tbody>{mine.map((w) => (
            <tr key={w.id}>
              <td><b>{w.name}</b> <code>{w.id}</code></td>
              <td>{typeName(w.type)}</td>
              <td>{w.scope === 'custom' ? `${w.videoIds.length} picked` : 'All tagged videos'}{w.productHandles.length > 0 && ` · ${w.productHandles.length} product(s)`}</td>
              <td><div className="row"><Toggle on={w.enabled} onChange={(on) => act(saveWidget)({ ...w, enabled: on })} /><button className="link" onClick={() => setEmbed(w)}>Get embed code</button></div></td>
              <td><div className="row"><button className="btn ghost sm" onClick={() => setEditing(w)}>Manage Widget</button><button className="link red" onClick={() => confirm('Delete this widget?') && act(deleteWidget)(w.id)}>Delete</button></div></td>
            </tr>))}</tbody>
        </table>
      )}
      {page === 'product' && <p className="muted pad">Videos shown on product pages are the ones tagged to that product. Set their order from <button className="link" onClick={() => go('products')}>Products → Arrange Media</button>.</p>}
      {editing && <Editor widget={editing} videos={videos} onClose={() => setEditing(null)} onSave={async (w) => { await act(saveWidget)(w); setEditing(null); }} />}
      {embed && <Embed widget={embed} onClose={() => setEmbed(null)} />}
    </>
  );
}

function Editor({ widget, videos, onClose, onSave }) {
  const [w, setW] = useState(widget);
  const [prods, setProds] = useState([]);
  const set = (k, v) => setW((o) => ({ ...o, [k]: v }));
  const live = videos.filter((v) => v.status === 'live' && !v.archived);
  const toggleVid = (id) => set('videoIds', w.videoIds.includes(id) ? w.videoIds.filter((x) => x !== id) : [...w.videoIds, id]);
  const showHeading = ['carousel'].includes(w.type);
  const targetable = w.page === 'product';
  const loadProds = () => !prods.length && searchProducts('').then(setProds).catch(() => {});
  return (
    <Modal title={widget.id ? 'Manage widget' : 'Create widget'} onClose={onClose} wide>
      <div className="two">
        <label className="lab">Widget name<input value={w.name} onChange={(e) => set('name', e.target.value)} /></label>
        {showHeading && <label className="lab">Heading shown above videos<input value={w.heading} onChange={(e) => set('heading', e.target.value)} placeholder="Watch & shop" /></label>}
      </div>
      {w.type !== 'gallery' && (
        <div className="lab">Which videos
          <div className="checks">
            <label className="chk"><input type="radio" checked={w.scope === 'tagged'} onChange={() => set('scope', 'tagged')} />{targetable ? "Each product's tagged videos" : 'All live tagged videos'}</label>
            {!targetable && <label className="chk"><input type="radio" checked={w.scope === 'custom'} onChange={() => set('scope', 'custom')} />Pick videos</label>}
          </div>
        </div>
      )}
      {w.scope === 'custom' && !targetable && (
        <div className="vpick">{live.map((v) => <label key={v.id} className={'vp' + (w.videoIds.includes(v.id) ? ' on' : '')}><input type="checkbox" checked={w.videoIds.includes(v.id)} onChange={() => toggleVid(v.id)} /><Thumb url={v.url} /><span>{v.title}</span></label>)}{!live.length && <p className="muted">No live videos yet.</p>}</div>
      )}
      {targetable && (
        <div className="lab">Show on products
          <select value={w.productHandles.length ? 'some' : 'all'} onChange={(e) => { set('productHandles', e.target.value === 'all' ? [] : ['']); loadProds(); }}><option value="all">All products</option><option value="some">Specific products</option></select>
          {w.productHandles.length > 0 && (
            <select multiple size={6} onFocus={loadProds} value={w.productHandles} onChange={(e) => set('productHandles', [...e.target.selectedOptions].map((o) => o.value))}>
              {prods.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={() => onSave({ ...w, productHandles: w.productHandles.filter(Boolean) })}>Save widget</button></div>
    </Modal>
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
      {simple && <><h3>Simple: just the widget ID</h3><textarea readOnly rows={1} className="code" value={widget.id} onFocus={(e) => e.target.select()} /><div className="row end"><button className="btn ghost sm" onClick={() => navigator.clipboard.writeText(widget.id)}>Copy ID</button></div></>}
      <h3>{simple ? 'Or the full tag' : 'Full tag (needed for the gallery widget)'}</h3>
      <textarea readOnly rows={2} className="code" value={full} onFocus={(e) => e.target.select()} />
      <div className="row end"><button className="btn" onClick={() => navigator.clipboard.writeText(full)}>Copy tag</button></div>
    </Modal>
  );
}
