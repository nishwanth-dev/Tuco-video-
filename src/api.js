// Local mock store (browser storage). Swap these functions for the Cloudflare Worker API later.
const VKEY = 'tuco_videos_v1';
const EKEY = 'tuco_events_v1';
const SAMPLE = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const seed = [
  { id: 'v1', title: 'Gentle face wash routine', url: SAMPLE, poster: '', audience: 'kids', status: 'live', placements: ['home', 'product'], product: { title: 'Kids Face Wash', handle: 'kids-face-wash', price: '₹249' } },
  { id: 'v2', title: 'Teen acne kit unboxing', url: SAMPLE, poster: '', audience: 'teens', status: 'live', placements: ['home', 'teens'], product: { title: 'Acne Kit for Teens', handle: 'acne-kit-for-teens', price: '₹599' } },
  { id: 'v3', title: 'Mom reviews body lotion', url: SAMPLE, poster: '', audience: 'kids', status: 'draft', placements: ['collection'], product: { title: 'Body Lotion', handle: 'body-lotion', price: '₹329' } },
];

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const listVideos = () => read(VKEY, seed);
export const saveVideo = (video) => {
  const all = listVideos();
  const next = video.id ? all.map((v) => (v.id === video.id ? video : v)) : [...all, { ...video, id: 'v' + Date.now() }];
  write(VKEY, next);
  return next;
};
export const deleteVideo = (id) => { const next = listVideos().filter((v) => v.id !== id); write(VKEY, next); return next; };

export const trackEvent = (e) => write(EKEY, [...read(EKEY, []), { ...e, at: Date.now() }]);
export const listEvents = () => read(EKEY, []);
export const clearEvents = () => write(EKEY, []);
