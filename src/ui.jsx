import { useEffect, useRef } from 'react';

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
