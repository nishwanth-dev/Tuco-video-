import { useEffect, useRef, useState } from 'react';
import { trackEvent } from './api.js';

export default function Player({ videos, start, onClose }) {
  const reel = useRef(null);
  const [muted, setMuted] = useState(true);
  const [added, setAdded] = useState({});
  const watch = useRef({});

  useEffect(() => { reel.current.children[start]?.scrollIntoView(); }, [start]);

  // Plays the slide in view, pauses others, and logs watch time when it leaves view.
  useEffect(() => {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const el = e.target.querySelector('video');
      const id = e.target.dataset.id;
      if (e.isIntersecting) { el.play().catch(() => {}); watch.current[id] = Date.now(); trackEvent({ type: 'play', videoId: id }); }
      else { el.pause(); if (watch.current[id]) { trackEvent({ type: 'watch', videoId: id, secs: (Date.now() - watch.current[id]) / 1000 }); delete watch.current[id]; } }
    }), { threshold: 0.7 });
    [...reel.current.children].forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  const close = () => {
    Object.entries(watch.current).forEach(([id, t]) => trackEvent({ type: 'watch', videoId: id, secs: (Date.now() - t) / 1000 }));
    onClose();
  };
  // Demo add to cart: logs the event only. The real store call comes with the theme widget.
  const add = (v) => { trackEvent({ type: 'atc', videoId: v.id }); setAdded((a) => ({ ...a, [v.id]: true })); };

  return (
    <div className="modal-full">
      <button className="pbtn pclose" onClick={close} aria-label="Close">✕</button>
      <button className="pbtn psound" onClick={() => setMuted((m) => !m)} aria-label="Toggle sound">{muted ? '🔇' : '🔊'}</button>
      <div className="reel" ref={reel}>
        {videos.map((v) => (
          <div className="slide" key={v.id} data-id={v.id}>
            <video src={v.url} muted={muted} loop playsInline />
            <div className="sui">
              <p className="stitle">{v.title}</p>
              <div className="prod">
                <div className="pmeta"><b>{v.product.title}</b><span>{v.product.price}</span></div>
                <button className="atc" disabled={added[v.id]} onClick={() => add(v)}>{added[v.id] ? 'Added ✓' : 'Add to cart'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
