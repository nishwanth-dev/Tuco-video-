import { useEffect, useRef, useState } from 'react';

export function Modal({ title, onClose, children, wide }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  // The back button closes the window instead of leaving the page.
  useEffect(() => {
    let byBack = false;
    history.pushState({ loopyModal: 1 }, '');
    const onPop = () => { byBack = true; closeRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!byBack && history.state && history.state.loopyModal) history.back();
    };
  }, []);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mhead"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const Toggle = ({ on, onChange }) => <button type="button" role="switch" aria-checked={on} className={'tog' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i /></button>;

export const Field = ({ label, hint, children }) => (
  <div className="fld"><div className="flab"><b>{label}</b>{hint && <span>{hint}</span>}</div><div className="fctl">{children}</div></div>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;

// Draws its children at a full desktop width (1200 px) and shrinks the whole picture to fit the space, so a desktop preview is never cut off.
export function Scaled({ children, base = 1200 }) {
  const outer = useRef(); const inner = useRef();
  const [k, setK] = useState(0.4); const [h, setH] = useState(0);
  useEffect(() => {
    const fit = () => { if (!outer.current || !inner.current) return; const nk = Math.min(1, outer.current.clientWidth / base); setK(nk); setH(inner.current.scrollHeight * nk); };
    fit();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(outer.current); ro.observe(inner.current);
    return () => ro.disconnect();
  }, [base]);
  return <div ref={outer} style={{ width: '100%', height: h || undefined, overflow: 'hidden' }}><div ref={inner} style={{ width: base, transform: `scale(${k})`, transformOrigin: 'top left' }}>{children}</div></div>;
}

// Tables scroll sideways inside their own box on a phone instead of squeezing or pushing the page wider.
export const Table = (props) => <div className="tscroll"><table {...props} /></div>;
