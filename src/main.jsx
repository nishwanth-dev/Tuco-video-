import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// A crash shows a friendly message and a reload button instead of a blank page.
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ padding: 40, fontFamily: 'Inter, sans-serif' }}>
        <h2>Something went wrong</h2>
        <p style={{ color: '#52525b' }}>{String(this.state.err.message || this.state.err)}</p>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);

// The opening splash stays up for 3 seconds from the moment the page started loading, then fades out.
const SPLASH_MS = 3000;
setTimeout(() => {
  const s = document.getElementById('splash');
  if (!s) return;
  s.classList.add('hide');
  setTimeout(() => s.remove(), 400);
}, Math.max(0, SPLASH_MS - performance.now()));
