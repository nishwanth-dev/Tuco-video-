import { useEffect, useMemo, useState } from 'react';
import { searchProducts, getOrder, saveOrder } from './api.js';
import { Modal, Empty } from './ui.jsx';
import { Thumb } from './media.jsx';

export default function Products({ videos, setError }) {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [arrange, setArrange] = useState(null);
  const [onlyVideos, setOnlyVideos] = useState(true);
  useEffect(() => { searchProducts('').then(setProducts).catch((e) => setError(e.message)); }, [setError]);

  const rows = useMemo(() => products
    .map((p) => ({ ...p, vids: videos.filter((v) => !v.archived && v.products.some((x) => x.handle === p.handle)) }))
    .filter((p) => (!onlyVideos || p.vids.length) && (!q || p.title.toLowerCase().includes(q.toLowerCase()))), [products, videos, q, onlyVideos]);

  return (
    <>
      <div className="bar"><div><h1>Products <span className="muted">({rows.length})</span></h1><p className="sub">Products from your store and the videos tagged to them. Arrange the order shoppers see on each product page.</p></div></div>
      <div className="toolbar"><input className="search" placeholder="Search by product title..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={onlyVideos} onChange={(e) => setOnlyVideos(e.target.checked)} />Only products with videos</label></div>
      {!rows.length && <Empty>{products.length ? 'No products with videos yet. Tag products from the Videos page.' : 'Loading store products...'}</Empty>}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Product</th><th>Price</th><th>Status</th><th>Videos</th><th /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.handle}>
              <td><div className="pcell"><i style={{ backgroundImage: `url(${p.image})` }} />{p.title}</div></td>
              <td>{p.price}</td>
              <td><span className={'pill ' + (p.available ? 'live' : 'draft')}>{p.available ? 'Active' : 'Sold out'}</span></td>
              <td>{p.vids.length}</td>
              <td><button className="btn ghost sm" disabled={p.vids.length < 2} onClick={() => setArrange(p)}>Arrange Media</button></td>
            </tr>))}</tbody>
        </table>
      )}
      {arrange && <Arrange product={arrange} videos={videos} onClose={() => setArrange(null)} setError={setError} />}
    </>
  );
}

function Arrange({ product, videos, onClose, setError }) {
  const own = videos.filter((v) => !v.archived && v.products.some((x) => x.handle === product.handle));
  const [order, setOrder] = useState(own.map((v) => v.id));
  useEffect(() => { getOrder(product.handle).then((o) => setOrder([...o.filter((id) => own.some((v) => v.id === id)), ...own.map((v) => v.id).filter((id) => !o.includes(id))])).catch(() => {}); /* eslint-disable-next-line */ }, []);
  const move = (i, d) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return (
    <Modal title={`Arrange media: ${product.title}`} onClose={onClose}>
      <div className="arr">{order.map((id, i) => { const v = videos.find((x) => x.id === id); return v && (
        <div className="arow" key={id}><Thumb url={v.url} /><span>{v.title}</span><button className="link" onClick={() => move(i, -1)}>↑</button><button className="link" onClick={() => move(i, 1)}>↓</button></div>); })}</div>
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={async () => { try { await saveOrder(product.handle, order); onClose(); } catch (e) { setError(e.message); } }}>Save order</button></div>
    </Modal>
  );
}
