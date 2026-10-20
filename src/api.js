// Talks to the Cloudflare Worker. VITE_API_URL points at it (local: http://localhost:8799).
const BASE = import.meta.env.VITE_API_URL || '';
const TKEY = 'tuco_admin_token';

// Checks a token before it is saved, so a typo gets a clear message instead of a silent bounce back to the sign-in screen.
export async function checkToken(t) {
  let r;
  try { r = await fetch(`${BASE}/api/health`, { headers: { authorization: `Bearer ${t}` } }); } catch { return 'Could not reach Loopy. Check your internet connection and try again.'; }
  if (r.status === 401) return 'That token is not right. Check it and try again.';
  if (!r.ok) return 'Loopy answered with an error. Try again in a minute.';
  return '';
}
export const getToken = () => localStorage.getItem(TKEY) || '';
export const setToken = (t) => (t ? localStorage.setItem(TKEY, t) : localStorage.removeItem(TKEY));
export const apiBase = BASE;

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) } });
  if (r.status === 401) { setToken(''); throw new Error('unauthorized'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
const send = (method, path, body) => req(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const listVideos = () => req('/api/videos').then((d) => d.videos);
export const saveVideo = (v) => (v.id ? send('PUT', `/api/videos/${v.id}`, v) : send('POST', '/api/videos', v));
export const deleteVideo = (id) => req(`/api/videos/${id}`, { method: 'DELETE' });
// Returns the stored address and the file size in bytes.
export const uploadFile = (file) => req(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'PUT', headers: { 'content-type': file.type || 'video/mp4' }, body: file });
export const uploadVideo = (file) => uploadFile(file).then((d) => d.url);

export const listWidgets = () => req('/api/widgets').then((d) => d.widgets);
export const saveWidget = (w) => (w.id ? send('PUT', `/api/widgets/${w.id}`, w) : send('POST', '/api/widgets', w));
export const deleteWidget = (id) => req(`/api/widgets/${id}`, { method: 'DELETE' });

export const getSettings = () => req('/api/settings').then((d) => d.settings);
export const saveSettings = (s) => send('PUT', '/api/settings', s);
export const getOrder = (handle) => req(`/api/order/${handle}`).then((d) => d.order);
export const saveOrder = (handle, order) => send('PUT', `/api/order/${handle}`, { order });

export const searchProducts = (q = '') => req(`/api/store/products?q=${encodeURIComponent(q)}`).then((d) => d.products);
export const getAnalytics = (days, live = false) => req(`/api/analytics?days=${days}${live ? '&live=1' : ''}`);
export const syncInstagram = () => send('POST', '/api/sync/instagram', {});

export const listCollections = () => req('/api/store/collections').then((d) => d.collections);
export const reorderVideos = (ids) => send('PUT', '/api/videos/order', { ids });

export const getHealth = () => req('/api/health');
// Saves the full data backup as a file in the browser.
export async function downloadBackup() {
  const r = await fetch(BASE + '/api/export', { headers: { authorization: `Bearer ${getToken()}` } });
  if (!r.ok) throw new Error(`Backup failed (${r.status})`);
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `loopy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const listChecks = () => req('/api/checks');
export const getCheck = (id) => req(`/api/checks/${id}`).then((d) => d.check);

export const runCheck = () => req('/api/checks/run', { method: 'POST' });

export const getInstagram = () => req('/api/instagram');
export const setInstagramAuto = (auto) => send('PUT', '/api/instagram', { auto });
export const getInstagramReview = () => req('/api/instagram/review');
export const approveInstagram = (approvals) => send('POST', '/api/instagram/approve', { approvals });

export const getCheckPages = () => req('/api/checks/pages');
export const saveCheckPages = (pages) => send('PUT', '/api/checks/pages', { pages });
