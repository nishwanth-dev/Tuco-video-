import { useEffect, useMemo, useState } from 'react';
import { searchProducts, getOrder, saveOrder, saveWidget } from './api.js';
import { Modal, Empty } from './ui.jsx';
import { Thumb } from './media.jsx';

// A widget id with a one-click copy, so it can be pasted straight into the theme editor.
function CopyId({ id }) {
  const [done, setDone] = useState(false);
  return (
    <span className="copyid"><code>{id}</code>
      <button type="button" className="link" onClick={() => { navigator.clipboard.writeText(id).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}>{done ? 'Copied' : 'Copy ID'}</button></span>
  );
}

export default function Products({ videos, widgets = [], loadWidgets, setError }) {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [arrange, setArrange] = useState(null);
  const [onlyVideos, setOnlyVideos] = useState(true);
  useEffect(() => { searchProducts('').then(setProducts).catch((e) => setError(e.message)); }, [setError]);

  // The video sets (widgets) that are limited to a product by name are what its page shows.
  const setsFor = (handle) => widgets.filter((w) => w.page === 'product' && w.scope === 'custom' && w.productHandles.includes(handle));
  const rows = useMemo(() => products
    .map((p) => ({ ...p, vids: videos.filter((v) => !v.archived && v.products.some((x) => x.handle === p.handle)), sets: setsFor(p.handle) }))
    .filter((p) => (!onlyVideos || p.vids.length || p.sets.length) && (!q || p.title.toLowerCase().includes(q.toLowerCase()))), [products, videos, widgets, q, onlyVideos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="bar"><div><h1>Products <span className="muted">({rows.length})</span></h1><p className="sub">Products from your store, the video sets shown on each product page, and the widget ID to put in your theme. Arrange the order of the videos for each product page.</p></div></div>
      <div className="toolbar"><input className="search" placeholder="Search by product title..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={onlyVideos} onChange={(e) => setOnlyVideos(e.target.checked)} />Only products with videos</label></div>
      {!rows.length && <Empty>{products.length ? 'No products with videos yet. Tag products from the Videos page.' : 'Loading store products...'}</Empty>}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Product</th><th>Price</th><th>Status</th><th>Tagged videos</th><th>Video sets on its page (widget ID to use in the theme)</th><th /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.handle}>
              <td><div className="pcell"><i style={{ backgroundImage: `url(${p.image})` }} />{p.title}</div></td>
              <td>{p.price}</td>
              <td><span className={'pill ' + (p.available ? 'live' : 'draft')}>{p.available ? 'Active' : 'Sold out'}</span></td>
              <td>{p.vids.length}</td>
              <td>{p.sets.length ? p.sets.map((w) => <div key={w.id} className="setrow"><span className={'setname ' + (w.enabled ? 'on' : 'off')} title={w.enabled ? 'Switched on' : 'Switched off. Turn it on under Product Pages.'}>{w.name} ({w.videoIds.length})</span> <CopyId id={w.id} /></div>) : <span className="muted">none</span>}</td>
              <td><button className="btn ghost sm" disabled={!p.sets.length && p.vids.length < 2} title={!p.sets.length && p.vids.length < 2 ? 'Nothing to arrange: this product has no video set and fewer than 2 tagged videos.' : ''} onClick={() => setArrange(p)}>Arrange Media</button></td>
            </tr>))}</tbody>
        </table>
      )}
      {arrange && <Arrange product={arrange} videos={videos} sets={setsFor(arrange.handle)} reload={loadWidgets} onClose={() => setArrange(null)} setError={setError} />}
    </>
  );
}

function Arrange({ product, videos, sets, reload, onClose, setError }) {
  const own = videos.filter((v) => !v.archived && v.products.some((x) => x.handle === product.handle));
  const [order, setOrder] = useState(own.map((v) => v.id));
  const [orders, setOrders] = useState(() => Object.fromEntries(sets.map((w) => [w.id, w.videoIds])));
  const [saved, setSaved] = useState('');
  useEffect(() => { getOrder(product.handle).then((o) => setOrder([...o.filter((id) => own.some((v) => v.id === id)), ...own.map((v) => v.id).filter((id) => !o.includes(id))])).catch(() => {}); /* eslint-disable-next-line */ }, []);
  const mv = (arr, i, d) => { const n = [...arr]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; };
  const row = (list, id, i, onMove) => { const v = videos.find((x) => x.id === id); return v && (
    <div className="arow" key={id}><Thumb url={v.url} poster={v.poster} /><span>{i + 1}. {v.title}{v.status !== 'live' && <em className="muted"> (draft)</em>}</span>
      <button className="link" disabled={i === 0} onClick={() => onMove(-1)} aria-label="Move up">↑</button><button className="link" disabled={i === list.length - 1} onClick={() => onMove(1)} aria-label="Move down">↓</button></div>); };
  return (
    <Modal title={`Arrange media: ${product.title}`} onClose={onClose} wide>
      {saved && <p className="small" style={{ color: '#067647' }}>{saved}</p>}
      {sets.map((w) => (
        <div key={w.id} className="lab">
          <b>{w.name}</b> <span className={'pill ' + (w.enabled ? 'live' : 'draft')}>{w.enabled ? 'Switched on' : 'Switched off'}</span> <CopyId id={w.id} />
          <span className="muted small"> This video set is shared. A new order applies on every product page that uses it ({w.productHandles.length} products).</span>
          <div className="arr">{(orders[w.id] || []).map((id, i, list) => row(list, id, i, (d) => setOrders((o) => ({ ...o, [w.id]: mv(o[w.id], i, d) }))))}</div>
          <div className="row end"><button className="btn sm" onClick={async () => { try { await saveWidget({ ...w, videoIds: orders[w.id] }); if (reload) await reload(); setSaved(`Saved the order of "${w.name}".`); } catch (e) { setError(e.message); } }}>Save order of this set</button></div>
        </div>))}
      {own.length > 1 && (
        <div className="lab"><b>Videos tagged to this product</b> <span className="muted small">Used by widgets set to "each product's tagged videos".</span>
          <div className="arr">{order.map((id, i) => row(order, id, i, (d) => setOrder((o) => mv(o, i, d))))}</div>
          <div className="row end"><button className="btn sm" onClick={async () => { try { await saveOrder(product.handle, order); setSaved('Saved the order of the tagged videos.'); } catch (e) { setError(e.message); } }}>Save tagged order</button></div>
        </div>)}
      <div className="row end"><button className="link" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
