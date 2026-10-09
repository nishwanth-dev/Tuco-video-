import { useState } from 'react';

const PLACEMENTS = ['home', 'product', 'collection', 'teens'];
const blank = { title: '', url: '', poster: '', audience: 'kids', status: 'draft', placements: [], product: { title: '', handle: '', price: '' } };

export default function Library({ videos, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const shown = videos.filter((v) => filter === 'all' || v.status === filter || v.audience === filter);

  return (
    <>
      <div className="bar">
        <h1>Videos <span className="muted">({videos.length})</span></h1>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['all', 'live', 'draft', 'kids', 'teens'].map((f) => <option key={f}>{f}</option>)}
          </select>
          <button className="btn" onClick={() => setEditing(blank)}>+ Add video</button>
        </div>
      </div>
      <div className="grid">
        {shown.map((v) => (
          <div className="vcard" key={v.id}>
            <video src={v.url + '#t=0.1'} poster={v.poster || undefined} muted playsInline preload="metadata" />
            <div className="vbody">
              <strong>{v.title}</strong>
              <div className="muted">{v.product.title || 'No product'}</div>
              <div className="tags"><span className={'pill ' + v.status}>{v.status}</span><span className="pill">{v.audience}</span>{v.placements.map((p) => <span className="pill" key={p}>{p}</span>)}</div>
              <div className="row"><button className="link" onClick={() => setEditing(v)}>Edit</button><button className="link red" onClick={() => confirm('Delete this video?') && onDelete(v.id)}>Delete</button></div>
            </div>
          </div>
        ))}
      </div>
      {editing && <VideoForm video={editing} onClose={() => setEditing(null)} onSave={(v) => { onSave(v); setEditing(null); }} />}
    </>
  );
}

function VideoForm({ video, onClose, onSave }) {
  const [v, setV] = useState(video);
  const set = (k, val) => setV((o) => ({ ...o, [k]: val }));
  const setP = (k, val) => setV((o) => ({ ...o, product: { ...o.product, [k]: val } }));
  const toggle = (p) => set('placements', v.placements.includes(p) ? v.placements.filter((x) => x !== p) : [...v.placements, p]);
  // File picks only last this session until Cloudflare R2 upload is connected.
  const pick = (e) => { const f = e.target.files[0]; if (f) set('url', URL.createObjectURL(f)); };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
        <h2>{v.id ? 'Edit video' : 'Add video'}</h2>
        <label>Title<input required value={v.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>Video URL (.mp4)<input required value={v.url} onChange={(e) => set('url', e.target.value)} placeholder="https://..." /></label>
        <label>or choose a file (this session only)<input type="file" accept="video/*" onChange={pick} /></label>
        <label>Poster image URL (optional)<input value={v.poster} onChange={(e) => set('poster', e.target.value)} /></label>
        <div className="two">
          <label>Product name<input value={v.product.title} onChange={(e) => setP('title', e.target.value)} /></label>
          <label>Product handle<input value={v.product.handle} onChange={(e) => setP('handle', e.target.value)} placeholder="kids-face-wash" /></label>
        </div>
        <label>Price shown<input value={v.product.price} onChange={(e) => setP('price', e.target.value)} placeholder="₹249" /></label>
        <div className="two">
          <label>Audience<select value={v.audience} onChange={(e) => set('audience', e.target.value)}><option>kids</option><option>teens</option></select></label>
          <label>Status<select value={v.status} onChange={(e) => set('status', e.target.value)}><option>draft</option><option>live</option></select></label>
        </div>
        <div className="checks">{PLACEMENTS.map((p) => <label key={p} className="chk"><input type="checkbox" checked={v.placements.includes(p)} onChange={() => toggle(p)} />{p}</label>)}</div>
        <div className="row end"><button type="button" className="link" onClick={onClose}>Cancel</button><button className="btn">Save</button></div>
      </form>
    </div>
  );
}
