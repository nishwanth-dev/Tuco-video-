import { useState } from 'react';
import Player from './Player.jsx';

const LAYOUTS = ['carousel', 'stories', 'spotlight'];

export default function Widgets({ videos }) {
  const [layout, setLayout] = useState('carousel');
  const [placement, setPlacement] = useState('home');
  const [open, setOpen] = useState(null);
  const list = videos.filter((v) => v.status === 'live' && v.placements.includes(placement));

  return (
    <>
      <div className="bar">
        <h1>Widget preview</h1>
        <div className="row">
          <select value={layout} onChange={(e) => setLayout(e.target.value)}>{LAYOUTS.map((l) => <option key={l}>{l}</option>)}</select>
          <select value={placement} onChange={(e) => setPlacement(e.target.value)}>{['home', 'product', 'collection', 'teens'].map((p) => <option key={p}>{p}</option>)}</select>
        </div>
      </div>
      <p className="muted">Shows live videos tagged for this placement. Tap a tile to open the fullscreen player.</p>
      {list.length === 0 && <div className="empty">No live videos for this placement.</div>}
      <div className={'track ' + layout}>
        {(layout === 'spotlight' ? list.slice(0, 1) : list).map((v, i) => (
          <div className="tile-wrap" key={v.id}>
            <button className="tile" onClick={() => setOpen(i)}>
              <video src={v.url} poster={v.poster || undefined} muted loop autoPlay playsInline preload="metadata" />
              {layout !== 'stories' && <span className="tinfo">{v.product.title}<br /><b>{v.product.price}</b></span>}
            </button>
            {layout === 'stories' && <span className="slabel">{v.title}</span>}
          </div>
        ))}
      </div>
      {open !== null && <Player videos={layout === 'spotlight' ? list.slice(0, 1) : list} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}
