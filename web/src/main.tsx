import { StrictMode, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type Area, getToken, type Me, setToken, setUnauthorizedHandler } from './api';
import Analytics from './pages/Analytics';
import Finance from './pages/Finance';
import Settings from './pages/Settings';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Orders from './pages/Orders';
import Products, { CreateProduct } from './pages/Products';
import Velaris from '@/components/ui/velaris';
import { useSpotlight } from '@/components/ui/spotlight-card';
import { TextShimmer } from '@/components/ui/text-shimmer';
import './styles.css';
import { Icon, initialTheme, MeCtx, saveTheme, type Theme, ThemeButton, ThemeCtx, ToastProvider, useCan, useLoad, useMe } from './ui';

type Rule = { area?: Area; level?: 1 | 2; owner?: boolean };
const PAGES = [
  { id: 'home', label: 'Bosh panel', short: 'Panel', icon: 'home', el: Dashboard, sec: 'Savdo' },
  { id: 'orders', label: 'Buyurtmalar', short: 'Buyurtma', icon: 'orders', el: Orders, sec: '', rule: { area: 'orders' } as Rule },
  { id: 'products', label: 'Tovarlar', short: 'Tovar', icon: 'box', el: Products, sec: 'Katalog', rule: { area: 'products' } as Rule },
  { id: 'create', label: 'Yangi tovar', short: 'Yaratish', icon: 'plus', el: CreateProduct, sec: '', rule: { area: 'products', level: 2 } as Rule },
  { id: 'customers', label: 'Mijozlar', short: 'Mijoz', icon: 'users', el: Customers, sec: 'Tahlil', rule: { area: 'customers' } as Rule },
  { id: 'finance', label: 'Moliya', short: 'Moliya', icon: 'wallet', el: Finance, sec: 'Rahbar', rule: { owner: true } as Rule },
  { id: 'analytics', label: 'Analitika', short: 'Tahlil', icon: 'chart', el: Analytics, sec: '', rule: { owner: true } as Rule },
  { id: 'settings', label: 'Sozlamalar', short: 'Sozlama', icon: 'gear', el: Settings, sec: '', rule: { owner: true } as Rule },
] as const;
type PageId = (typeof PAGES)[number]['id'];
type Page = (typeof PAGES)[number];

const allowed = (me: Me, p: Page) => {
  const r: Rule | undefined = 'rule' in p ? p.rule : undefined;
  if (!r || me.role === 'owner') return true;
  if (r.owner) return false;
  return (me.perms[r.area!] ?? 0) >= (r.level ?? 1);
};

// Hash routing keeps the panel a single static page: #orders, #orders/12, ...
const readHash = () => {
  const [page, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: (PAGES.some(p => p.id === page) ? page : 'home') as PageId, arg: arg ?? null };
};

// Brand palette for the animated night background: emerald greens with a hint of champagne gold.
const BG_COLORS = ['#0f5c3a', '#1f7a49', '#8a6a2e', '#020604'];

function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const themeCtx = { theme, toggle: () => setTheme(t => { const n = t === 'dark' ? 'light' : 'dark'; saveTheme(n); return n; }) };
  return (
    <ThemeCtx.Provider value={themeCtx}>
      <Shell />
    </ThemeCtx.Provider>
  );
}

function Shell() {
  const theme = useContext(ThemeCtx).theme;
  const [authed, setAuthed] = useState(!!getToken());
  const [route, setRoute] = useState(readHash);
  const [me, setMe] = useState<Me | null>(null);
  useSpotlight();
  useEffect(() => {
    setUnauthorizedHandler(() => { setAuthed(false); setMe(null); });
    const h = () => { setRoute(readHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    if (!authed) return;
    api<{ user: Me }>('/api/admin/me').then(r => setMe(r.user)).catch(() => {});
  }, [authed]);

  // The animated background stays on the login page in both modes (its card is designed for it).
  const bg = !authed || theme === 'dark' ? <Velaris bg="#030806" colors={BG_COLORS} speed={1.2} grain={0.35} height="100%" className="app-bg" /> : null;
  if (!authed) return <>{bg}<Login onDone={() => setAuthed(true)} /></>;
  if (!me) return <>{bg}<div className="boot"><img src="/favicon.png" alt="" /></div></>;
  const pages = PAGES.filter(p => allowed(me, p));
  const page = pages.find(p => p.id === route.page) ?? pages[0];
  const Page = page.el;
  return (
    <MeCtx.Provider value={me}>
      {bg}
      <ThemeButton className="mobile-only" />
      <div className="shell">
        <Side current={page.id} pages={pages} />
        <main className="main">
          <div className="page" key={page.id}><Page arg={page.id === route.page ? route.arg : null} /></div>
        </main>
        <TabBar current={page.id} pages={pages} />
      </div>
    </MeCtx.Provider>
  );
}

function useNewCount() {
  // Refresh the "new orders" badge every 30 s so a fresh order is noticed without reloading.
  const can = useCan();
  const { data, reload } = useLoad<{ total: number }>(can('orders') ? '/api/admin/orders?status=new' : null);
  useEffect(() => { const t = setInterval(reload, 30_000); return () => clearInterval(t); }, [reload]);
  return data?.total ?? 0;
}

function Side({ current, pages }: { current: PageId; pages: Page[] }) {
  const n = useNewCount();
  const me = useMe();
  return (
    <aside className="side">
      <div className="logo"><img src="/favicon.png" alt="" /><div><TextShimmer className="on-gold">Alatoo24</TextShimmer><small>CRM</small></div></div>
      <nav className="nav">
        {pages.map((p, i) => [
          p.sec && (i === 0 || pages[i - 1].sec !== p.sec) ? <div key={p.id + '-sec'} className="sec">{p.sec}</div> : null,
          <a key={p.id} href={`#${p.id}`} className={p.id === current ? 'on' : ''}>
            <Icon name={p.icon} size={19} />{p.label}
            {p.id === 'orders' && n ? <span className="count">{n}</span> : null}
          </a>,
        ])}
      </nav>
      <div className="foot nav">
        <ThemeButton />
        <div className="who"><span>{me.name.slice(0, 1).toUpperCase()}</span><div><b>{me.role === 'owner' ? 'Rahbar' : me.name}</b><small>{me.role === 'owner' ? `Rahbar · ${me.login}` : `Xodim · ${me.login}`}</small></div></div>
        <a href="#" onClick={e => { e.preventDefault(); setToken(null); location.reload(); }}><Icon name="out" size={19} />Chiqish</a>
      </div>
    </aside>
  );
}

function TabBar({ current, pages }: { current: PageId; pages: Page[] }) {
  const n = useNewCount();
  return (
    <nav className="tabbar">
      {pages.map(p => (
        <a key={p.id} href={`#${p.id}`} className={p.id === current ? 'on' : ''}>
          <Icon name={p.icon} size={20} />{p.short}
          {p.id === 'orders' && n ? <span className="count">{n}</span> : null}
        </a>
      ))}
    </nav>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider><App /></ToastProvider>
  </StrictMode>,
);
