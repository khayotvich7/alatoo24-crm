import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Area, type Me, STATUS, type Status } from './api';

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
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12zM8 11h.01M12 11h.01M16 11h.01',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
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

/** Small centred "are you sure?" dialog. */
export function Confirm({ title, text, okLabel = "O'chirish", busy, onOk, onCancel }: { title: string; text: ReactNode; okLabel?: string; busy?: boolean; onOk: () => void; onCancel: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
  return createPortal(
    <>
      <div className="overlay" style={{ zIndex: 60 }} onClick={onCancel} />
      <div className="confirm card" role="alertdialog" aria-modal>
        <div className="confirm-ic"><Icon name="alert" size={22} /></div>
        <h2>{title}</h2>
        <div className="muted" style={{ marginTop: 8, lineHeight: 1.55, fontSize: 14 }}>{text}</div>
        <div className="row" style={{ marginTop: 20, gap: 10, justifyContent: 'flex-end' }}>
          <button className="confirm-btn ghost" onClick={onCancel} disabled={busy}>Bekor qilish</button>
          <button className="confirm-btn danger" onClick={onOk} disabled={busy} autoFocus>{busy ? 'O‘chirilmoqda…' : okLabel}</button>
        </div>
      </div>
    </>,
    document.body,
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
  const has = useRef(false);
  useEffect(() => {
    if (!path) return;
    const n = ++seq.current;
    api<T>(path).then(d => { if (n === seq.current) { has.current = true; setError(''); setData(d); } })
      .catch(e => { if (n === seq.current && !has.current) setError(e.message); }); // a failed background refresh keeps the last data
  }, [path, tick]);
  return { data, error, reload: useCallback(() => setTick(t => t + 1), []) };
}

// ---------- live refresh ----------

/** How often open pages re-fetch their data (orders can arrive from the app at any moment). */
export const LIVE_MS = 5_000;

/** Calls `refresh` every LIVE_MS while the tab is visible, and right away when the tab comes back into view. */
export function useLive(refresh: () => void, ms = LIVE_MS) {
  const fn = useRef(refresh);
  fn.current = refresh;
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') fn.current(); };
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [ms]);
}

/** Small "● Jonli" badge shown next to live pages. */
export const LiveDot = () => <span className="live-dot" title="Har 5 soniyada avtomatik yangilanadi"><i />Jonli</span>;

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

// ---------- day / night theme ----------

export type Theme = 'light' | 'dark';
const THEME_KEY = 'alatoo.crm.theme';
/** Saved choice, else the device setting. */
export const initialTheme = (): Theme => {
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') return t; } catch { /* private mode */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};
export const saveTheme = (t: Theme) => { try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ } };
export const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);
/** Chart colours that read well on the current background. */
export const useChartColors = () => {
  const dark = useTheme().theme === 'dark';
  const ink = dark ? '#eef4f0' : '#14281d';
  return {
    grid: dark ? 'rgba(255,255,255,.06)' : 'rgba(20,40,30,.08)',
    axis: { fontSize: 11, fill: dark ? '#8aa094' : '#6b7d72' },
    cursor: { fill: dark ? 'rgba(255,255,255,.04)' : 'rgba(20,40,30,.05)' },
    tip: {
      contentStyle: { borderRadius: 14, border: `1px solid ${dark ? 'rgba(255,255,255,.12)' : 'rgba(20,40,30,.12)'}`, background: dark ? '#0b1410' : '#ffffff', color: ink, fontFamily: 'Manrope' },
      itemStyle: { color: ink }, labelStyle: { color: dark ? '#a8b8ae' : '#4b5e53' },
    },
  };
};

export function ThemeButton({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button className={`theme-btn${className ? ' ' + className : ''}`} onClick={toggle} title={dark ? 'Kunduzgi rejim' : 'Tungi rejim'} aria-label={dark ? 'Kunduzgi rejimga o‘tish' : 'Tungi rejimga o‘tish'}>
      <Icon name={dark ? 'sun' : 'moon'} size={18} /><span>{dark ? 'Kunduzgi rejim' : 'Tungi rejim'}</span>
    </button>
  );
}

// ---------- signed-in user ----------

export const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;
/** Access level of the signed-in user in an area: 0 hidden, 1 view, 2 full. The owner has everything. */
export const useCan = () => {
  const me = useMe();
  return (area: Area, level: 1 | 2 = 1) => me.role === 'owner' || (me.perms[area] ?? 0) >= level;
};
