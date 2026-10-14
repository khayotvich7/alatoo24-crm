import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, STATUS, type Status } from './api';

// ---------- icons (inline so the panel has no icon-font dependency) ----------

const P: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  store: 'M3 21V9l9-6 9 6v12M7 21v-7h10v7M3 21h18',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 19v-1a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  cash: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 7v10M18 7v10',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  truck: 'M1 4h14v12H1zM15 9h4l3 3v4h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M4.9 4.9l14.2 14.2',
  check: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
};

export const Icon = ({ name, size = 20, stroke = 2 }: { name: keyof typeof P | string; size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={P[name] ?? ''} />
  </svg>
);

// ---------- small components ----------

export const Badge = ({ status }: { status: Status }) => <span className={`badge t-${STATUS[status].tone}`}>{STATUS[status].label}</span>;

const GLOW: Record<string, string> = { green: '#2fbf7a', blue: '#6aa8ff', violet: '#a68cff', amber: '#f2a24a', red: '#ff6b5e', gold: '#e3c98f', gray: '#6c8075' };

export function Stat({ k, v, s, icon, tone = 'green', onClick }: { k: string; v: ReactNode; s?: ReactNode; icon: string; tone?: string; hero?: boolean; onClick?: () => void }) {
  return (
    <div className="card stat" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <span className="glow" style={{ background: GLOW[tone] }} />
      <div className={`ic t-${tone}`}><Icon name={icon} size={18} /></div>
      <div className="k">{k}</div>
      <div className="v num">{v}</div>
      {s ? <div className="s">{s}</div> : null}
    </div>
  );
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{text ? <div>{text}</div> : null}{children ? <div style={{ marginTop: 14 }}>{children}</div> : null}</div>;
}

export function Drawer({ title, onClose, children, footer, right }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; right?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal>
        <header><h2>{title}</h2>{right}<button className="x" onClick={onClose} aria-label="Yopish"><Icon name="x" size={18} /></button></header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </aside>
    </>
  );
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="search"><Icon name="search" size={17} /><input className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export const Thumb = ({ src, name, tint }: { src?: string; name: string; tint?: string }) =>
  src ? <img className="thumb" src={src} alt="" loading="lazy" /> : <div className="thumb ph" style={{ background: tint ?? 'var(--brand)' }}>{name.slice(0, 2)}</div>;

// ---------- data hook ----------

/** Loads `path`, re-loads when it changes or when `reload()` is called. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    if (!path) return;
    const n = ++seq.current;
    setError('');
    api<T>(path).then(d => n === seq.current && setData(d)).catch(e => n === seq.current && setError(e.message));
  }, [path, tick]);
  return { data, error, reload: useCallback(() => setTick(t => t + 1), []) };
}

// ---------- toast ----------

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  return <ToastCtx.Provider value={show}>{children}{msg ? <div className="toast" role="status">{msg}</div> : null}</ToastCtx.Provider>;
}
