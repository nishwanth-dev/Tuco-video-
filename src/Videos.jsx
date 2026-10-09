import { useMemo, useRef, useState } from 'react';
import { saveVideo, deleteVideo, uploadVideo, searchProducts, syncInstagram } from './api.js';
import { Modal, Empty } from './ui.jsx';
import { Thumb, Player } from './media.jsx';

const WHERE = [['social', 'Social videos'], ['website', 'Videos on website'], ['home', 'Homepage'], ['product', 'Product Pages'], ['collection', 'Collection & Other Pages'], ['archived', 'Archived']];
const SHOW_ON = [['home', 'Homepage'], ['product', 'Product pages'], ['collection', 'Collection pages'], ['pages', 'Other pages']];

export default function Videos({ videos, loadVideos, setError }) {
  const [where, setWhere] = useState('');
  const [prod, setProd] = useState('');
  const [sort, setSort] = useState('new');
  const [q, setQ] = useState('');
  const [per, setPer] = useState(24);
  const [page, setPage] = useState(0);
  const [pop, setPop] = useState(false);
  const [sel, setSel] = useState([]);
  const [tagging, setTagging] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');

  const list = useMemo(() => {
    let l = videos.filter((v) => (where === 'archived' ? v.archived : !v.archived));
    if (where === 'social') l = l.filter((v) => v.source === 'instagram');
    if (where === 'website') l = l.filter((v) => v.status === 'live');
    if (['home', 'collection'].includes(where)) l = l.filter((v) => v.placements.includes(where));
    if (where === 'product') l = l.filter((v) => v.products.length);
    if (prod === 'tagged') l = l.filter((v) => v.products.length);
    if (prod === 'untagged') l = l.filter((v) => !v.products.length);
    if (q) l = l.filter((v) => (v.title + v.products.map((p) => p.title + p.handle).join(' ')).toLowerCase().includes(q.toLowerCase()));
    return [...l].sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  }, [videos, where, prod, sort, q]);

  const pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice(page * per, page * per + per);
  const act = (fn) => async (...a) => { try { await fn(...a); await loadVideos(); } catch (e) { setError(e.message); } };
  const patch = act((v, p) => saveVideo({ ...v, ...p }));
  const bulk = act(async (fn) => { await Promise.all(sel.map((id) => fn(videos.find((v) => v.id === id)))); setSel([]); });
  const toggleSel = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const sync = async () => {
    setMsg('Syncing Instagram...');
    try { const r = await syncInstagram(); setMsg(r.skipped || r.error || `Copied ${r.added} new reel(s) as drafts`); loadVideos(); } catch (e) { setMsg(e.message); }
  };

  return (
    <>
      <div className="bar"><div><h1>Videos <span className="muted">({videos.length})</span></h1><p className="sub">Tag a video with products or add it to a widget to show it on your website.</p></div></div>
      <div className="toolbar">
        <div className="rel">
          <button className="btn ghost" onClick={() => setPop(!pop)}>Filters{(where || prod) && ' •'}</button>
          {pop && (
            <div className="pop" onMouseLeave={() => setPop(false)}>
              <div className="pgroup"><span>Where</span><div className="chips">{WHERE.map(([k, l]) => <button key={k} className={'chip' + (where === k ? ' on' : '')} onClick={() => { setWhere(where === k ? '' : k); setPage(0); }}>{l}</button>)}</div></div>
              <div className="pgroup"><span>Products</span><div className="chips">{[['tagged', 'Tagged'], ['untagged', 'Untagged']].map(([k, l]) => <button key={k} className={'chip' + (prod === k ? ' on' : '')} onClick={() => { setProd(prod === k ? '' : k); setPage(0); }}>{l}</button>)}</div></div>
              <div className="pgroup"><span>Sort</span><div className="chips">{[['new', 'Newest first'], ['old', 'Oldest first']].map(([k, l]) => <button key={k} className={'chip' + (sort === k ? ' on' : '')} onClick={() => setSort(k)}>{l}</button>)}</div></div>
              <button className="link" onClick={() => { setWhere(''); setProd(''); setSort('new'); }}>Clear</button>
            </div>
          )}
        </div>
        <button className="btn" onClick={() => setAdding(true)}>+ Add Media</button>
        <button className="btn ghost" onClick={sync}>Sync Instagram</button>
        <input className="search" placeholder="Search by video, product title or handle..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      </div>
      {msg && <p className="muted">{msg}</p>}
      {sel.length > 0 && (
        <div className="bulk"><b>{sel.length} selected</b>
          <button className="link" onClick={() => bulk((v) => saveVideo({ ...v, status: 'live' }))}>Set live</button>
          <button className="link" onClick={() => bulk((v) => saveVideo({ ...v, status: 'draft' }))}>Set draft</button>
          <button className="link" onClick={() => bulk((v) => saveVideo({ ...v, archived: !v.archived }))}>{where === 'archived' ? 'Unarchive' : 'Archive'}</button>
          <button className="link red" onClick={() => confirm(`Delete ${sel.length} video(s)?`) && bulk((v) => deleteVideo(v.id))}>Delete</button>
          <button className="link" onClick={() => setSel([])}>Clear</button>
        </div>
      )}
      {!shown.length && <Empty>{videos.length ? 'No videos match these filters.' : 'No videos yet. Click "Add Media" or sync Instagram to begin.'}</Empty>}
      <div className="vgrid">
        {shown.map((v) => (
          <div className="vtile" key={v.id}>
            <div className="vmedia" onClick={() => setEditing(v)}>
              <Thumb url={v.url} hover />
              <label className="sel" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.includes(v.id)} onChange={() => toggleSel(v.id)} /></label>
              {v.source === 'instagram' && <span className="src">Social</span>}
              <span className={'st ' + v.status}>{v.status}</span>
              <Menu video={v} onEdit={() => setEditing(v)} onArchive={() => patch(v, { archived: !v.archived })} onDelete={() => confirm('Delete this video?') && act(deleteVideo)(v.id)} />
              <button className="tagbtn" onClick={(e) => { e.stopPropagation(); setTagging(v); }}>
                {v.products.length ? <span className="avs">{v.products.slice(0, 3).map((p) => <i key={p.handle} style={p.image ? { backgroundImage: `url(${p.image})` } : {}} />)}{v.products.length > 3 && <em>+{v.products.length - 3}</em>}</span> : 'Tag Products'}
              </button>
            </div>
            <div className="vcap" title={v.title}>{v.title}</div>
          </div>
        ))}
      </div>
      <div className="pager">
        <button className="link" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
        <span>Page {page + 1} of {pages}</span>
        <button className="link" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next ›</button>
        <select value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(0); }}>{[12, 24, 48].map((n) => <option key={n} value={n}>{n} per page</option>)}</select>
      </div>
      {tagging && <TagProducts video={tagging} onClose={() => setTagging(null)} onSave={async (products) => { await patch(tagging, { products }); setTagging(null); }} />}
      {editing && <EditVideo video={editing} onClose={() => setEditing(null)} onSave={async (v) => { await act(saveVideo)(v); setEditing(null); }} />}
      {adding && <AddMedia onClose={() => setAdding(false)} onSave={async (v) => { await act(saveVideo)(v); setAdding(false); }} />}
    </>
  );
}

function Menu({ video, onEdit, onArchive, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="kebab" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen(!open)} aria-label="More">⋮</button>
      {open && <div className="menu"><button onClick={onEdit}>Edit details</button><button onClick={onArchive}>{video.archived ? 'Unarchive' : 'Archive'}</button><button className="red" onClick={onDelete}>Delete</button></div>}
    </div>
  );
}

export function TagProducts({ video, onClose, onSave }) {
  const [chosen, setChosen] = useState(video.products || []);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const t = useRef();
  const has = (h) => chosen.some((p) => p.handle === h);
  const toggle = (p) => setChosen((c) => (has(p.handle) ? c.filter((x) => x.handle !== p.handle) : [...c, { handle: p.handle, title: p.title, price: p.price, image: p.image }]));
  const search = (val) => { setQ(val); clearTimeout(t.current); t.current = setTimeout(() => searchProducts(val).then((r) => setResults(r.slice(0, 30))).catch((e) => setErr(e.message)), 250); };
  const addUrls = async () => {
    setErr('');
    const handles = url.split(/[\s,]+/).map((u) => (u.match(/\/products\/([^/?#\s]+)/) || [])[1]).filter(Boolean);
    if (!handles.length) return setErr('Paste product links like https://tucokids.com/products/handle');
    const all = await searchProducts('').catch((e) => { setErr(e.message); return []; });
    handles.forEach((h) => { const p = all.find((x) => x.handle === h); if (p && !has(h)) toggle(p); });
    setUrl('');
  };
  return (
    <Modal title="Tag Products" onClose={onClose} wide>
      <div className="split">
        <div>
          <h3>Search products</h3>
          <input placeholder="Search your store products..." value={q} onChange={(e) => search(e.target.value)} onFocus={() => !results.length && search('')} />
          <div className="plistx">{results.map((p) => (
            <label key={p.handle} className="prow"><input type="checkbox" checked={has(p.handle)} onChange={() => toggle(p)} /><i style={{ backgroundImage: `url(${p.image})` }} /><span>{p.title}<em>{p.price}</em></span></label>
          ))}</div>
          <h3>Or paste product links</h3>
          <div className="row"><input placeholder="https://tucokids.com/products/..." value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn ghost" onClick={addUrls}>Add</button></div>
          {err && <p className="red small">{err}</p>}
        </div>
        <div>
          <h3>Tagged products ({chosen.length})</h3>
          {!chosen.length && <p className="muted">Nothing tagged yet.</p>}
          <div className="plistx tall">{chosen.map((p) => (
            <div key={p.handle} className="prow"><i style={{ backgroundImage: `url(${p.image})` }} /><span>{p.title}<em>{p.price}</em></span><button className="link red" onClick={() => toggle(p)}>Remove</button></div>
          ))}</div>
        </div>
      </div>
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={() => onSave(chosen)}>Save</button></div>
    </Modal>
  );
}

function EditVideo({ video, onClose, onSave }) {
  const [v, setV] = useState(video);
  const set = (k, val) => setV((o) => ({ ...o, [k]: val }));
  const toggle = (p) => set('placements', v.placements.includes(p) ? v.placements.filter((x) => x !== p) : [...v.placements, p]);
  return (
    <Modal title="Video details" onClose={onClose}>
      <Player className="vprev" url={v.url} />
      <label className="lab">Title<input value={v.title} onChange={(e) => set('title', e.target.value)} /></label>
      <label className="lab">Poster image URL (optional)<input value={v.poster} onChange={(e) => set('poster', e.target.value)} /></label>
      <div className="two">
        <label className="lab">Status<select value={v.status} onChange={(e) => set('status', e.target.value)}><option value="live">live</option><option value="draft">draft</option></select></label>
        <label className="lab">Audience<select value={v.audience} onChange={(e) => set('audience', e.target.value)}><option>kids</option><option>teens</option></select></label>
      </div>
      <div className="lab">Show on<div className="checks">{SHOW_ON.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={v.placements.includes(k)} onChange={() => toggle(k)} />{l}</label>)}</div></div>
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={() => onSave(v)}>Save</button></div>
    </Modal>
  );
}

function AddMedia({ onClose, onSave }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBusy(true); setErr('');
    try { setUrl(await uploadVideo(f)); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <Modal title="Add Media" onClose={onClose}>
      <label className="lab">Upload a video file <span className="muted">(MP4, up to 100 MB)</span><input type="file" accept="video/*" onChange={pick} /></label>
      <label className="lab">or paste a video URL (.mp4)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></label>
      <label className="lab">Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      {busy && <p className="muted">Uploading...</p>}
      {err && <p className="red small">{err}</p>}
      <p className="muted">The video is saved as a draft. Tag products and set it live afterwards.</p>
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" disabled={!url || !title || busy} onClick={() => onSave({ title, url, poster: '', audience: 'kids', status: 'draft', placements: [], products: [] })}>Add</button></div>
    </Modal>
  );
}
