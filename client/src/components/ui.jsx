import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// ---------- formatting ----------
export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const kg = (n) => `${fmt(n)} kg`;
export const tonnes = (n) => `${fmt(n / 1000, n >= 100000 ? 0 : 1)} t`;
export const inr = (n) => `₹${fmt(n)}`;
export const inrShort = (n) => (Math.abs(n) >= 1e7 ? `₹${fmt(n / 1e7, 2)} Cr` : Math.abs(n) >= 1e5 ? `₹${fmt(n / 1e5, 1)} L` : inr(n));
export const pct = (n, d = 0) => (n == null ? '-' : `${fmt(n * 100, d)}%`);
export const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export const MODES = ['road', 'rail', 'sea', 'air'];
export const MODE_LABEL = { road: 'Road', rail: 'Rail', sea: 'Sea', air: 'Air' };

// Reads chart colors from CSS variables so charts follow the light/dark theme.
export function useChartColors() {
  const { theme } = useAuth();
  const [colors, setColors] = useState(read);
  function read() {
    const s = getComputedStyle(document.documentElement);
    const v = (n) => s.getPropertyValue(n).trim();
    return {
      road: v('--mode-road'), rail: v('--mode-rail'), sea: v('--mode-sea'), air: v('--mode-air'),
      brand: v('--brand'), accent: v('--accent'), grid: v('--grid'), axis: v('--axis'), muted: v('--muted'), text: v('--text-2'),
      good: v('--good'), warning: v('--warning'), critical: v('--critical'), surface: v('--surface'),
    };
  }
  useEffect(() => {
    setColors(read());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setColors(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  return colors;
}

// ---------- data hook ----------
export function useApi(url, deps = []) {
  const { liveTick } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    return api.get(url)
      .then((r) => { setData(r.data); setError(null); })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { load(); }, [load, liveTick]);
  return { data, error, loading, reload: load, setData };
}

// ---------- components ----------
export function Kpi({ label, value, sub, tone }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {sub && <div className={`sub ${tone ? `delta-${tone}` : ''}`}>{sub}</div>}
    </div>
  );
}

export function ModeChip({ mode }) {
  return (
    <span className="mode-chip">
      <i style={{ background: `var(--mode-${mode})` }} />
      {MODE_LABEL[mode] || mode}
    </span>
  );
}

const RISK_TEXT = { green: 'Low risk', amber: 'Medium risk', red: 'High risk' };
export function RiskBadge({ risk, onClick }) {
  if (!risk?.level) return <span className="muted">-</span>;
  return (
    <button type="button" className={`badge ${risk.level}`} onClick={onClick} title={(risk.reasons || []).join(' · ')} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <span className="dot" />
      {RISK_TEXT[risk.level]} {pct(risk.probability)}
    </button>
  );
}

export function Loading({ text = 'Loading…' }) {
  return <div className="empty"><span className="spinner" /> {text}</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert error" role="alert">{error}</div>;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(960px, 100%)' } : undefined}>
        <div className="card-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = kg }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="t-title">{labelFormatter ? labelFormatter(label) : label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div className="t-row" key={p.dataKey}>
          <span><i style={{ background: p.color || p.fill || p.stroke }} />{p.name}</span>
          <b className="num">{Array.isArray(p.value) ? `${valueFormatter(p.value[0])} – ${valueFormatter(p.value[1])}` : valueFormatter(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}><i style={{ background: it.color, ...(it.dashed && { background: 'none', borderTop: `2px dashed ${it.color}`, height: 0, width: 14, borderRadius: 0 }) }} />{it.label}</span>
      ))}
    </div>
  );
}

export function BudgetBar({ used, budget }) {
  const ratio = budget ? used / budget : 0;
  const color = ratio >= 1 ? 'var(--critical)' : ratio >= 0.8 ? 'var(--warning)' : 'var(--good)';
  const label = ratio >= 1 ? 'Over budget' : ratio >= 0.8 ? 'Near budget' : 'On track';
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="num"><b>{tonnes(used)}</b> <span className="muted">of {tonnes(budget)}</span></span>
        <span className={`badge ${ratio >= 1 ? 'red' : ratio >= 0.8 ? 'amber' : 'green'}`}><span className="dot" />{label} · {pct(ratio)}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  truck: 'M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 18a2 2 0 1 0 0-.01M17 18a2 2 0 1 0 0-.01',
  factory: 'M3 21V10l5 3V10l5 3V5h3l1 6h4v10z',
  pin: 'M12 22s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  graph: 'M5 5h4v4H5zM15 5h4v4h-4zM10 15h4v4h-4zM9 7h6M7 9l5 6M17 9l-5 6',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  plus: 'M12 5v14M5 12h14',
  leaf: 'M5 21c0-9 6-15 16-16-1 10-7 16-16 16zM5 21l8-8',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
