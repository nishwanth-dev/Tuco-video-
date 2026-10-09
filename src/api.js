// Talks to the Cloudflare Worker. VITE_API_URL points at it (local: http://localhost:8799).
const BASE = import.meta.env.VITE_API_URL || '';
const TKEY = 'tuco_admin_token';

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
export const uploadVideo = (file) => req(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'PUT', headers: { 'content-type': file.type || 'video/mp4' }, body: file }).then((d) => d.url);

export const listWidgets = () => req('/api/widgets').then((d) => d.widgets);
export const saveWidget = (w) => (w.id ? send('PUT', `/api/widgets/${w.id}`, w) : send('POST', '/api/widgets', w));
export const deleteWidget = (id) => req(`/api/widgets/${id}`, { method: 'DELETE' });

export const getSettings = () => req('/api/settings').then((d) => d.settings);
export const saveSettings = (s) => send('PUT', '/api/settings', s);
export const getOrder = (handle) => req(`/api/order/${handle}`).then((d) => d.order);
export const saveOrder = (handle, order) => send('PUT', `/api/order/${handle}`, { order });

export const searchProducts = (q = '') => req(`/api/store/products?q=${encodeURIComponent(q)}`).then((d) => d.products);
export const getAnalytics = (days) => req(`/api/analytics?days=${days}`);
export const syncInstagram = () => send('POST', '/api/sync/instagram', {});

export const listCollections = () => req('/api/store/collections').then((d) => d.collections);
export const reorderVideos = (ids) => send('PUT', '/api/videos/order', { ids });
