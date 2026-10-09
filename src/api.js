// Uses the Cloudflare Worker when VITE_API_URL is set; otherwise a local browser mock for demos.
const BASE = import.meta.env.VITE_API_URL || '';
export const isLive = !!BASE;

const VKEY = 'tuco_videos_v1';
const EKEY = 'tuco_events_v1';
const TKEY = 'tuco_admin_token';
const SAMPLE = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const seed = [
  { id: 'v1', title: 'Gentle face wash routine', url: SAMPLE, poster: '', audience: 'kids', status: 'live', placements: ['home', 'product'], product: { title: 'Kids Face Wash', handle: 'kids-face-wash', price: '₹249' } },
  { id: 'v2', title: 'Teen acne kit unboxing', url: SAMPLE, poster: '', audience: 'teens', status: 'live', placements: ['home', 'teens'], product: { title: 'Acne Kit for Teens', handle: 'acne-kit-for-teens', price: '₹599' } },
];

const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const getToken = () => localStorage.getItem(TKEY) || '';
export const setToken = (t) => (t ? localStorage.setItem(TKEY, t) : localStorage.removeItem(TKEY));

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) } });
  if (r.status === 401) { setToken(''); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.json();
}

export async function listVideos() {
  if (isLive) return (await req('/api/videos')).videos;
  return read(VKEY, seed);
}

export async function saveVideo(v) {
  if (isLive) {
    await req(v.id ? `/api/videos/${v.id}` : '/api/videos', { method: v.id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });
    return;
  }
  const all = read(VKEY, seed);
  write(VKEY, v.id ? all.map((x) => (x.id === v.id ? v : x)) : [...all, { ...v, id: 'v' + Date.now() }]);
}

export async function deleteVideo(id) {
  if (isLive) return req(`/api/videos/${id}`, { method: 'DELETE' });
  write(VKEY, read(VKEY, seed).filter((v) => v.id !== id));
}

// Live mode stores the file in R2; the mock keeps a temporary local link.
export async function uploadVideo(file) {
  if (!isLive) return URL.createObjectURL(file);
  return (await req(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'PUT', headers: { 'content-type': file.type || 'video/mp4' }, body: file })).url;
}

export async function getAnalytics() {
  if (isLive) return (await req('/api/analytics')).rows;
  const ev = read(EKEY, []);
  const ids = [...new Set(ev.map((e) => e.videoId))];
  return ids.map((id) => {
    const m = ev.filter((e) => e.videoId === id);
    return { video_id: id, plays: m.filter((e) => e.type === 'play').length, secs: m.filter((e) => e.type === 'watch').reduce((s, e) => s + e.secs, 0), atc: m.filter((e) => e.type === 'atc').length };
  });
}

// Preview-player events go to the mock log only, so testing never pollutes real numbers.
export const trackEvent = (e) => write(EKEY, [...read(EKEY, []), { ...e, at: Date.now() }]);
export const clearEvents = () => write(EKEY, []);

export const syncInstagram = () => req('/api/sync/instagram', { method: 'POST' });
