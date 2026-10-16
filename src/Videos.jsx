import { useEffect, useMemo, useRef, useState } from 'react';
import { compressVideo, MAX_INPUT } from './compress.js';
import { saveVideo, deleteVideo, uploadVideo, uploadFile, searchProducts, syncInstagram, reorderVideos } from './api.js';
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
  // The Filters panel closes on any click outside it, or Escape.
  useEffect(() => {
    if (!pop) return undefined;
    const away = (e) => { if (!e.target.closest || !e.target.closest('.rel')) setPop(false); };
    const esc = (e) => { if (e.key === 'Escape') setPop(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [pop]);
  const [sel, setSel] = useState([]);
  const [tagging, setTagging] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [arranging, setArranging] = useState(false);
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
  // Returns '' on success or the error message, so dialogs can stay open and show what went wrong.
  const act = (fn) => async (...a) => { setError(''); try { await fn(...a); await loadVideos(); return ''; } catch (e) { setError(e.message); return e.message || 'Something went wrong'; } };
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
            <div className="pop">
              <div className="pgroup"><span>Where</span><div className="chips">{WHERE.map(([k, l]) => <button key={k} className={'chip' + (where === k ? ' on' : '')} onClick={() => { setWhere(where === k ? '' : k); setPage(0); }}>{l}</button>)}</div></div>
              <div className="pgroup"><span>Products</span><div className="chips">{[['tagged', 'Tagged'], ['untagged', 'Untagged']].map(([k, l]) => <button key={k} className={'chip' + (prod === k ? ' on' : '')} onClick={() => { setProd(prod === k ? '' : k); setPage(0); }}>{l}</button>)}</div></div>
              <div className="pgroup"><span>Sort</span><div className="chips">{[['new', 'Newest first'], ['old', 'Oldest first']].map(([k, l]) => <button key={k} className={'chip' + (sort === k ? ' on' : '')} onClick={() => setSort(k)}>{l}</button>)}</div></div>
              <button className="link" onClick={() => { setWhere(''); setProd(''); setSort('new'); }}>Clear</button>
            </div>
          )}
        </div>
        <button className="btn" onClick={() => setAdding(true)}>+ Add Media</button>
        <button className="btn ghost" onClick={sync}>Sync Instagram</button>
        <button className="btn ghost" onClick={() => setArranging(true)}>Arrange</button>
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
              <CheckedThumb url={v.url} />
              <label className="sel" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.includes(v.id)} onChange={() => toggleSel(v.id)} /></label>
              {v.source === 'instagram' && <span className="src">Social</span>}
              <SizeBadge bytes={v.size} />
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
      {tagging && <TagProducts video={tagging} onClose={() => setTagging(null)} onSave={async (products) => { const m = await patch(tagging, { products }); if (!m) setTagging(null); return m; }} />}
      {editing && <EditVideo video={editing} onClose={() => setEditing(null)} onSave={async (v) => { const m = await act(saveVideo)(v); if (!m) setEditing(null); return m; }} />}
      {arranging && <ArrangeVideos videos={videos.filter((v) => !v.archived)} onClose={() => setArranging(false)} onSaved={async () => { setArranging(false); await loadVideos(); }} setError={setError} />}
      {adding && <AddMedia onClose={() => setAdding(false)} onSaveMany={async (v) => act(saveVideo)(v)} onSave={async (v) => { const m = await act(saveVideo)(v); if (!m) setAdding(false); return m; }} />}
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
  const [saveErr, setSaveErr] = useState('');
  const t = useRef();
  const has = (h) => chosen.some((p) => p.handle === h);
  const toggle = (p) => setChosen((c) => (has(p.handle) ? c.filter((x) => x.handle !== p.handle) : [...c, { handle: p.handle, title: p.title, price: p.price, image: p.image }]));
  const search = (val) => { setQ(val); clearTimeout(t.current); t.current = setTimeout(() => searchProducts(val).then((r) => setResults(r.slice(0, 30))).catch((e) => setErr(e.message)), 250); };
  const addUrls = async () => {
    setErr('');
    const handles = url.split(/[\s,]+/).map((u) => (u.match(/\/products\/([^/?#\s]+)/) || [])[1]).filter(Boolean);
    if (!handles.length) return setErr('Paste product links like https://tucokids.com/products/handle');
    let all = null;
    try { all = await searchProducts(''); } catch { all = null; }
    const missing = [];
    handles.forEach((h) => {
      const p = all && all.find((x) => x.handle === h);
      if (p) { if (!has(h)) toggle(p); return; }
      if (all) { missing.push(h); return; }
      // The store list could not be read: keep the link anyway, named from its address (you can rename it later).
      if (!has(h)) toggle({ handle: h, title: h.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), price: '' });
    });
    if (missing.length) setErr(`No product found for: ${missing.join(', ')}. Check the link.`);
    else if (!all) setErr('Your store could not be reached, so the link was added without checking it. Its name comes from the link.');
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
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={async () => setSaveErr((await onSave(chosen)) || '')}>Save</button></div>
      {saveErr && <p className="red small">{saveErr}</p>}
    </Modal>
  );
}

function EditVideo({ video, onClose, onSave }) {
  const [v, setV] = useState(video);
  const set = (k, val) => setV((o) => ({ ...o, [k]: val }));
  const toggle = (p) => set('placements', v.placements.includes(p) ? v.placements.filter((x) => x !== p) : [...v.placements, p]);
  const [saveErr, setSaveErr] = useState('');
  const [posterBusy, setPosterBusy] = useState(false);
  const [posterMsg, setPosterMsg] = useState('');
  // Grabs a frame from the video and stores it as the poster image.
  const makePoster = async () => {
    setPosterBusy(true); setPosterMsg('');
    try {
      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous'; vid.muted = true; vid.src = v.url;
      await new Promise((res, rej) => { vid.onloadeddata = res; vid.onerror = () => rej(new Error('The video could not be read.')); });
      vid.currentTime = Math.min(0.5, (vid.duration || 1) / 2);
      await new Promise((res) => { vid.onseeked = res; });
      const c = document.createElement('canvas');
      c.width = 540; c.height = Math.round((540 * vid.videoHeight) / vid.videoWidth) || 960;
      c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
      if (!blob) throw new Error('This video host blocks reading frames. Upload the video to Loopy instead.');
      const url = await uploadVideo(new File([blob], 'poster.jpg', { type: 'image/jpeg' }));
      set('poster', url); setPosterMsg('Poster added.');
    } catch (e) { setPosterMsg(e.message || 'Could not generate a poster.'); }
    setPosterBusy(false);
  };
  return (
    <Modal title="Video details" onClose={onClose}>
      <Player className="vprev" url={v.url} />
      <label className="lab">Title<input value={v.title} onChange={(e) => set('title', e.target.value)} /></label>
      <label className="lab">Poster image URL (optional)<input value={v.poster} onChange={(e) => set('poster', e.target.value)} /></label>
      <div className="row"><button type="button" className="btn ghost sm" disabled={posterBusy} onClick={makePoster}>{posterBusy ? 'Generating...' : 'Generate poster from video'}</button>{posterMsg && <span className="muted">{posterMsg}</span>}</div>
      <div className="two">
        <label className="lab">Button text (optional)<input value={v.ctaText || ''} onChange={(e) => set('ctaText', e.target.value)} placeholder="e.g. Buy the set" /></label>
        <label className="lab">Button link (optional)<input value={v.ctaUrl || ''} onChange={(e) => set('ctaUrl', e.target.value)} placeholder="/collections/gifting" /></label>
      </div>
      <div className="two">
        <label className="lab">Show from (optional)<input type="datetime-local" value={toLocal(v.startsAt)} onChange={(e) => set('startsAt', fromLocal(e.target.value))} /></label>
        <label className="lab">Hide after (optional)<input type="datetime-local" value={toLocal(v.endsAt)} onChange={(e) => set('endsAt', fromLocal(e.target.value))} /></label>
      </div>
      <div className="two">
        <label className="lab">Status<select value={v.status} onChange={(e) => set('status', e.target.value)}><option value="live">live</option><option value="draft">draft</option></select></label>
        <label className="lab">Audience<select value={v.audience} onChange={(e) => set('audience', e.target.value)}><option>kids</option><option>teens</option></select></label>
      </div>
      <div className="lab">Show on<div className="checks">{SHOW_ON.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={v.placements.includes(k)} onChange={() => toggle(k)} />{l}</label>)}</div></div>
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={async () => setSaveErr((await onSave(v)) || '')}>Save</button></div>
      {saveErr && <p className="red small">{saveErr}</p>}
    </Modal>
  );
}

function AddMedia({ onClose, onSave, onSaveMany }) {
  const [batch, setBatch] = useState(null); // several files chosen at once
  const [squeeze, setSqueeze] = useState('none'); // none | quality | under5
  const [url, setUrl] = useState('');
  const [size, setSize] = useState(0);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [staged, setStaged] = useState(null);
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState('');
  const send = async (f) => {
    setBusy(true); setErr(''); setNote('');
    try { const up = await uploadFile(f); setUrl(up.url); setSize(up.size || f.size); setStaged(null); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/-web$/, '')); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const pick = async (e) => {
    const files = [...e.target.files].slice(0, 50);
    e.target.value = '';
    if (files.length > 1) { setErr(''); setUrl(''); setSize(0); setStaged(null); setBatch(files.map((f, i) => ({ id: i, file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/-web$/, ''), status: 'waiting', msg: '' }))); return; }
    const f = files[0];
    if (!f) return;
    setErr(''); setUrl(''); setSize(0); setStaged(null);
    if (f.size > 5 * 1048576) { setStaged(f); return; } // big files: offer to shrink first
    await send(f);
  };
  const shrink = async () => {
    setBusy(true); setErr(''); setPct(0);
    try {
      const small = await compressVideo(staged, { onStatus: setNote, onProgress: setPct });
      if (small.size >= staged.size) { setNote('It was already small, so it is uploaded as it is.'); await send(staged.size > 100 * 1048576 ? small : staged); return; }
      setNote(`Shrunk from ${(staged.size / 1048576).toFixed(1)} MB to ${(small.size / 1048576).toFixed(1)} MB. Uploading...`);
      await send(small);
    } catch (x) { setErr(x.message); setBusy(false); }
  };
  const setItem = (id, patch) => setBatch((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const runBatch = async () => {
    setBusy(true); setErr('');
    for (const it of batch.filter((x) => x.status !== 'done')) {
      setItem(it.id, { status: 'working', msg: 'Uploading...' });
      try {
        let f = it.file, note = 'Added as a draft';
        if (squeeze === 'quality' && f.size <= MAX_INPUT) {
          const small = await compressVideo(f, { mode: 'quality', onStatus: (m) => setItem(it.id, { msg: m }), onProgress: () => {} });
          if (small.size < f.size * 0.9) { note = `Added, ${(f.size / 1048576).toFixed(1)} -> ${(small.size / 1048576).toFixed(1)} MB`; f = small; } else note = 'Added as it is (it could not shrink without losing quality)';
        } else if (squeeze === 'under5' && f.size > 5 * 1048576 && f.size <= MAX_INPUT) {
          const small = await compressVideo(f, { mode: 'under5', onStatus: (m) => setItem(it.id, { msg: m }), onProgress: () => {} });
          if (small.size < f.size) { note = `Added, ${(f.size / 1048576).toFixed(1)} -> ${(small.size / 1048576).toFixed(1)} MB`; f = small; }
        } else if (f.size > 100 * 1048576) throw new Error('Over 100 MB: choose one of the compression options above, or shrink it first.');
        const up = await uploadFile(f);
        const m = await onSaveMany({ title: it.title.trim() || f.name.replace(/\.[^.]+$/, ''), url: up.url, poster: '', audience: 'kids', status: 'draft', placements: [], products: [], size: up.size || f.size });
        if (m) throw new Error(m);
        setItem(it.id, { status: 'done', msg: note });
      } catch (x) { setItem(it.id, { status: 'error', msg: x.message || 'Failed' }); }
    }
    setBusy(false);
  };
  if (batch) {
    const done = batch.filter((x) => x.status === 'done').length, todo = batch.filter((x) => x.status !== 'done').length;
    return (
      <Modal title={`Add ${batch.length} videos`} onClose={onClose} wide>
        <div className="batch">
          {batch.map((it) => (
            <div className={'brow ' + it.status} key={it.id}>
              <input value={it.title} disabled={busy || it.status === 'done'} onChange={(e) => setItem(it.id, { title: e.target.value })} aria-label="Title" />
              <span className="muted small"><SizeBadge bytes={it.file.size} inline /></span>
              <span className={'bst ' + it.status}>{it.status === 'waiting' ? 'Waiting' : it.status === 'working' ? (it.msg || 'Working...') : it.status === 'done' ? '✓ ' + it.msg : 'Failed: ' + it.msg}</span>
            </div>
          ))}
        </div>
        <div className="lab">Compression
          <label className="chk"><input type="radio" name="sq" checked={squeeze === 'none'} disabled={busy} onChange={() => setSqueeze('none')} />Upload exactly as they are (no compression)</label>
          <label className="chk"><input type="radio" name="sq" checked={squeeze === 'quality'} disabled={busy} onChange={() => setSqueeze('quality')} />Best quality: shrink as much as possible without visible loss (same size, same picture; a video that can't shrink is left as it is)</label>
          <label className="chk"><input type="radio" name="sq" checked={squeeze === 'under5'} disabled={busy} onChange={() => setSqueeze('under5')} />Under 5 MB each: smaller and faster to load, lower quality (videos already under 5 MB are left alone)</label>
        </div>
        <p className="muted small">Compression happens in your browser, one video at a time, so keep this tab open. Videos are saved as drafts; tag products and set them live afterwards.</p>
        <div className="row end"><button className="link" disabled={busy} onClick={onClose}>{done === batch.length ? 'Close' : 'Cancel'}</button>{todo > 0 && <button className="btn" disabled={busy} onClick={runBatch}>{busy ? 'Uploading...' : done ? `Try the other ${todo} again` : `Upload ${batch.length} videos`}</button>}</div>
      </Modal>
    );
  }
  return (
    <Modal title="Add Media" onClose={onClose}>
      <label className="lab">Upload video files <span className="muted">(MP4 or MOV. Pick one or several at once. Big files can be shrunk here)</span><input type="file" accept="video/*" multiple onChange={pick} /></label>
      <label className="lab">or paste a video URL (.mp4)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></label>
      <label className="lab">Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      {staged && !busy && (
        <div className="shrinkbox">
          <p><b>{staged.name}</b> is <SizeBadge bytes={staged.size} inline /> {sizeAdvice(staged.size)}</p>
          {staged.size > MAX_INPUT && <p className="red small">Too big to shrink here. Use tools/compress-video.sh on a computer with ffmpeg.</p>}
          <div className="row">{staged.size <= MAX_INPUT && <button className="btn" onClick={shrink}>Make smaller (recommended)</button>}{staged.size <= 100 * 1048576 && <button className="link" onClick={() => send(staged)}>Upload as it is</button>}</div>
        </div>
      )}
      {busy && <p className="muted">{note || 'Uploading...'}{pct > 0 && pct < 1 ? ` ${Math.round(pct * 100)}%` : ''}</p>}
      {busy && pct > 0 && pct < 1 && <div className="pbar"><i style={{ width: pct * 100 + '%' }} /></div>}
      {err && <p className="red small">{err}</p>}
      {size > 0 && <p className="muted"><SizeBadge bytes={size} inline /> {sizeAdvice(size)}</p>}
      <p className="muted">The video is saved as a draft. Tag products and set it live afterwards.</p>
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" disabled={!/^https:\/\//i.test(url) && !/^http:\/\/localhost/i.test(url) || !title.trim() || busy} onClick={async () => { const m = await onSave({ title: title.trim(), url: url.trim(), poster: '', audience: 'kids', status: 'draft', placements: [], products: [], size }); if (m) setErr(m); }}>Add</button></div>
    </Modal>
  );
}

const pad = (n) => String(n).padStart(2, '0');
const toLocal = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocal = (t) => (t ? new Date(t).getTime() : 0);

function ArrangeVideos({ videos, onClose, onSaved, setError }) {
  const [ids, setIds] = useState(videos.map((v) => v.id));
  const move = (i, d) => setIds((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return (
    <Modal title="Arrange videos" onClose={onClose}>
      <p className="muted">This sets the default order widgets use when they show all tagged videos.</p>
      <div className="arr">{ids.map((id, i) => { const v = videos.find((x) => x.id === id); return v && (
        <div className="arow" key={id}><Thumb url={v.url} poster={v.poster} /><span>{v.title}</span><button className="link" onClick={() => move(i, -1)}>↑</button><button className="link" onClick={() => move(i, 1)}>↓</button></div>); })}</div>
      <div className="row end"><button className="link" onClick={onClose}>Cancel</button><button className="btn" onClick={async () => { try { await reorderVideos(ids); await onSaved(); } catch (e) { setError(e.message); } }}>Save order</button></div>
    </Modal>
  );
}

// Small files make the store fast: green is great, amber is fine, red is heavy.
const mb = (b) => b / 1048576;
const sizeLevel = (b) => (mb(b) <= 5 ? 'ok' : mb(b) <= 15 ? 'mid' : 'heavy');
const sizeAdvice = (b) => (sizeLevel(b) === 'ok' ? 'Light and fast.' : sizeLevel(b) === 'mid' ? 'Fine, but smaller is faster. Aim for under 5 MB.' : 'Heavy. This will slow your pages. Use Make smaller when you upload (or tools/compress-video.sh).');
function SizeBadge({ bytes, inline }) {
  if (!bytes) return null;
  const text = mb(bytes) < 10 ? mb(bytes).toFixed(1) : Math.round(mb(bytes));
  return <span className={'sz ' + sizeLevel(bytes) + (inline ? ' inl' : '')} title={sizeAdvice(bytes)}>{text} MB</span>;
}

// A tile preview that tells you when the video file can no longer be loaded (deleted file, expired link),
// because the store would silently hide that video.
function CheckedThumb({ url }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <>
      <Thumb url={url} hover onError={() => setBroken(true)} />
      {broken && <span className="brokenlink" title="This video cannot be loaded, so shoppers will not see it. Replace the link or upload it again.">Link broken</span>}
    </>
  );
}
