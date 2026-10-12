import { CORNERS } from './layoutSpec.js';

// One layout control. An empty value means "use the default" (Customizations) or "use the global setting" (widget panel).
export default function LayoutField({ spec, value, onChange, placeholder, emptyLabel = 'Use default' }) {
  const [, , , kind, opts] = spec;
  const cur = value === undefined || value === null ? '' : value;
  if (kind === 'num') {
    return <input type="number" min="0" step="any" value={cur} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  }
  const list = kind === 'corner' ? CORNERS : opts;
  const known = list.some(([v]) => String(v) === String(cur));
  return (
    <select value={cur} onChange={(e) => onChange(e.target.value === '' ? '' : kind === 'corner' ? Number(e.target.value) : e.target.value)}>
      <option value="">{emptyLabel}</option>
      {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      {cur !== '' && !known && <option value={cur}>{cur}{kind === 'corner' ? ' px (custom)' : ''}</option>}
    </select>
  );
}
