import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listImages, deleteImage, uploadImage } from './api.js';
import { Modal, Empty } from './ui.jsx';

const MAX = 5 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EXTS = ['jpg', 'jpeg', 'png', 'webp'];
const PER = 40;

// Lowercase letters, numbers and hyphens only (what the server accepts for new files).
const slug = (t) => String(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const cleanFolder = (t) => slug(t).slice(0, 40);
const splitName = (file) => {
  const m = /^(.*?)(?:\.([A-Za-z0-9]+))?$/.exec(file.name);
  const ext = (m[2] || '').toLowerCase();
  return { stem: slug(m[1]).slice(0, 70), ext: EXTS.includes(ext) ? ext : TYPES[file.type] || '' };
};
const fullName = (stem, ext) => (stem && ext ? `${stem}.${ext}` : '');
const kb = (b) => `${Math.max(1, Math.round(b / 1024))} KB`;
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
let seq = 0;

export default function Images({ setError }) {
  const [data, setData] = useState({ images: [], folders: [] });
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [page, setPage] = useState(1);
  const [folder, setFolder] = useState('ingredients');
  const [queue, setQueue] = useState([]);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState('');
  const [del, setDel] = useState(null);
  const [delErr, setDelErr] = useState('');
  const pick = useRef(null);

  const load = useCallback(() => listImages().then((d) => { setData(d); setLoaded(true); }).catch((e) => { setError(e.message); setLoaded(true); }), [setError]);
  useEffect(() => { load(); }, [load]);

  const taken = useMemo(() => new Set(data.images.map((i) => `${i.folder}/${i.name}`)), [data]);
  const f = cleanFolder(folder);

  const addFiles = (files) => {
    const items = [...files].map((file) => {
      const { stem, ext } = splitName(file);
      const it = { id: ++seq, file, stem, ext, state: 'ready', pct: 0, error: '', changed: false };
      if (!ext) it.error = 'Only JPEG, PNG and WebP pictures are accepted.';
      else if (file.size > MAX) it.error = `Too big (${(file.size / 1048576).toFixed(1)} MB). The limit is 5 MB.`;
      else if (!file.size) it.error = 'This file is empty.';
      if (it.error) it.state = 'refused';
      it.changed = file.name !== fullName(stem, ext);
      return it;
    });
    setQueue((q) => [...q, ...items]);
  };
  const patch = (id, p) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const nameOf = (it) => fullName(it.stem, it.ext);
  const clash = (it) => taken.has(`${f}/${nameOf(it)}`);
  const ready = queue.filter((it) => ['ready', 'error'].includes(it.state) && it.stem && !clash(it));

  const start = async () => {
    if (!f) { setError('Type a folder name first, for example "ingredients".'); return; }
    setError('');
    for (const it of ready) {
      patch(it.id, { state: 'uploading', pct: 0, error: '' });
      const r = await uploadImage(f, nameOf(it), it.file, (p) => patch(it.id, { pct: p }));
      if (r.ok) patch(it.id, { state: 'done', pct: 1 });
      else patch(it.id, { state: 'error', error: r.status === 409 ? 'This name is already taken in this folder. Change the name and press Upload again.' : r.error });
    }
    await load();
  };

  const copy = (url) => {
    const done = () => { setCopied(url); setTimeout(() => setCopied((c) => (c === url ? '' : c)), 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this address:', url));
    else window.prompt('Copy this address:', url);
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.images.filter((i) => (!folderFilter || i.folder === folderFilter) && (!term || `${i.folder}/${i.name}`.toLowerCase().includes(term)));
  }, [data, q, folderFilter]);
  useEffect(() => { setPage(1); }, [q, folderFilter]);

  const confirmDelete = async () => {
    setDelErr('');
    try { await deleteImage(del.folder, del.name); setDel(null); await load(); } catch (e) { setDelErr(e.message); }
  };

  return (
    <>
      <div className="bar"><div><h1>Images <span className="muted">({data.images.length})</span></h1><p className="sub">Host pictures here. Each one gets a permanent public address you can paste anywhere.</p></div></div>

      <div className={'dropzone' + (drag ? ' over' : '')} data-testid="dropzone"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
        <p><b>Drag pictures here</b> or</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn ghost" onClick={() => pick.current.click()}>Choose files</button>
          <input ref={pick} type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden data-testid="picker" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        <p className="muted small">JPEG, PNG or WebP, up to 5 MB each. Names use lowercase letters, numbers and hyphens only.</p>
        <label className="lab imgfolder">Folder
          <input list="imgfolders" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="ingredients" aria-label="Folder" />
          <datalist id="imgfolders">{data.folders.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        {folder && f !== folder && <p className="muted small">Folder will be saved as <b>{f || '(not valid)'}</b>.</p>}
        {f === 'videos' && <p className="red small">"videos" is reserved. Pick another folder name.</p>}
      </div>

      {queue.length > 0 && (
        <div className="upq">
          {queue.map((it) => (
            <div className={'upr ' + it.state} key={it.id}>
              <div className="upn">
                {['ready', 'error'].includes(it.state)
                  ? <><input value={it.stem} onChange={(e) => patch(it.id, { stem: slug(e.target.value).slice(0, 70), changed: true, error: '' })} aria-label="File name" /><span className="ext">.{it.ext}</span></>
                  : <b>{it.state === 'refused' ? it.file.name : nameOf(it)}</b>}
                <span className="muted small">{kb(it.file.size)}</span>
              </div>
              {['ready', 'error'].includes(it.state) && it.changed && !clash(it) && <p className="muted small">Name cleaned up from <i>{it.file.name}</i>. You can edit it.</p>}
              {['ready', 'error'].includes(it.state) && clash(it) && <p className="red small">"{nameOf(it)}" already exists in {f || 'this folder'}. Pictures are never replaced, so use a new name.</p>}
              {it.state === 'uploading' && <div className="pbar"><i style={{ width: it.pct * 100 + '%' }} /></div>}
              {it.state === 'done' && <p className="small" style={{ color: '#067647' }}>Uploaded: {f}/{nameOf(it)}</p>}
              {it.error && <p className="red small" role="alert">{it.error}</p>}
              {it.state !== 'uploading' && <button className="link small" onClick={() => setQueue((q) => q.filter((x) => x.id !== it.id))}>{it.state === 'done' ? 'Clear' : 'Remove'}</button>}
            </div>
          ))}
          <div className="row end">
            {queue.some((i) => i.state === 'done') && <button className="link" onClick={() => setQueue((q) => q.filter((i) => i.state !== 'done'))}>Clear finished</button>}
            <button className="btn" disabled={!ready.length || !f || f === 'videos' || queue.some((i) => i.state === 'uploading')} onClick={start}>Upload {ready.length || ''} {ready.length === 1 ? 'file' : 'files'}</button>
          </div>
        </div>
      )}

      <div className="row imgtools">
        <input type="search" placeholder="Search file names" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search images" />
        <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} aria-label="Filter by folder">
          <option value="">All folders</option>{data.folders.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>

      {!loaded ? <p className="muted">Loading...</p> : !shown.length ? <Empty>{data.images.length ? 'No pictures match.' : 'No pictures yet. Drop some above.'}</Empty> : (
        <div className="imglist" data-testid="imglist">
          {shown.slice(0, page * PER).map((i) => (
            <div className="imgrow" key={i.folder + '/' + i.name}>
              <img src={i.url} alt={i.name} loading="lazy" className="imgthumb" />
              <div className="imginfo">
                <b>{i.name}</b>
                <span className="muted small">{i.folder} · {kb(i.size)} · {day(i.uploaded)}</span>
                <code className="imgaddr">{i.url}</code>
              </div>
              <div className="row">
                <button className="btn ghost sm" onClick={() => copy(i.url)}>{copied === i.url ? 'Copied' : 'Copy address'}</button>
                <button className="link red" onClick={() => { setDelErr(''); setDel(i); }}>Delete</button>
              </div>
            </div>
          ))}
          {shown.length > page * PER && <div className="row" style={{ justifyContent: 'center' }}><button className="btn ghost" onClick={() => setPage((n) => n + 1)}>Show more ({shown.length - page * PER} left)</button></div>}
        </div>
      )}

      {del && (
        <Modal title="Delete picture" onClose={() => setDel(null)}>
          <p>Delete <b>{del.folder}/{del.name}</b>? Any page using this address will lose the picture. This cannot be undone.</p>
          {delErr && <p className="red small" role="alert">{delErr}</p>}
          <div className="row end"><button className="link" onClick={() => setDel(null)}>Cancel</button><button className="btn" style={{ background: '#b42318' }} onClick={confirmDelete}>Delete</button></div>
        </Modal>
      )}
    </>
  );
}
