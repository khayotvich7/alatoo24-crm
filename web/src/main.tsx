import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getToken, setToken, setUnauthorizedHandler } from './api';
import Analytics from './pages/Analytics';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Orders from './pages/Orders';
import Products, { CreateProduct } from './pages/Products';
import Warehouse from './pages/Warehouse';
import Velaris from '@/components/ui/velaris';
import './styles.css';
import { Icon, ToastProvider, useLoad } from './ui';

const PAGES = [
  { id: 'home', label: 'Bosh panel', short: 'Panel', icon: 'home', el: Dashboard, sec: 'Savdo' },
  { id: 'orders', label: 'Buyurtmalar', short: 'Buyurtma', icon: 'orders', el: Orders, sec: '' },
  { id: 'products', label: 'Tovarlar', short: 'Tovar', icon: 'box', el: Products, sec: 'Katalog' },
  { id: 'create', label: 'Yangi tovar', short: 'Yaratish', icon: 'plus', el: CreateProduct, sec: '' },
  { id: 'stock', label: 'Sklad', short: 'Sklad', icon: 'store', el: Warehouse, sec: '' },
  { id: 'customers', label: 'Mijozlar', short: 'Mijoz', icon: 'users', el: Customers, sec: 'Tahlil' },
  { id: 'analytics', label: 'Analitika', short: 'Tahlil', icon: 'chart', el: Analytics, sec: '' },
] as const;
type PageId = (typeof PAGES)[number]['id'];

// Hash routing keeps the panel a single static page: #orders, #orders/12, ...
const readHash = () => {
  const [page, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: (PAGES.some(p => p.id === page) ? page : 'home') as PageId, arg: arg ?? null };
};

function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [route, setRoute] = useState(readHash);
  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
    const h = () => { setRoute(readHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const page = PAGES.find(p => p.id === route.page)!;
  const Page = page.el;
  return (
    <div className="shell">
      <Side current={route.page} />
      <main className="main">
        <div className="page" key={route.page}><Page arg={route.arg} /></div>
      </main>
      <TabBar current={route.page} />
    </div>
  );
}

function useNewCount() {
  // Refresh the "new orders" badge every 30 s so a fresh order is noticed without reloading.
  const { data, reload } = useLoad<{ total: number }>('/api/admin/orders?status=new');
  useEffect(() => { const t = setInterval(reload, 30_000); return () => clearInterval(t); }, [reload]);
  return data?.total ?? 0;
}

function Side({ current }: { current: PageId }) {
  const n = useNewCount();
  return (
    <aside className="side">
      <div className="logo"><span className="metal-text">Alatoo24</span><small>CRM</small></div>
      <nav className="nav">
        {PAGES.map(p => [
          p.sec ? <div key={p.id + '-sec'} className="sec">{p.sec}</div> : null,
          <a key={p.id} href={`#${p.id}`} className={p.id === current ? 'on' : ''}>
            <Icon name={p.icon} size={19} />{p.label}
            {p.id === 'orders' && n ? <span className="count">{n}</span> : null}
          </a>,
        ])}
      </nav>
      <div className="foot nav">
        <a href="#" onClick={e => { e.preventDefault(); setToken(null); location.reload(); }}><Icon name="out" size={19} />Chiqish</a>
      </div>
    </aside>
  );
}

function TabBar({ current }: { current: PageId }) {
  const n = useNewCount();
  return (
    <nav className="tabbar">
      {PAGES.map(p => (
        <a key={p.id} href={`#${p.id}`} className={p.id === current ? 'on' : ''}>
          <Icon name={p.icon} size={20} />{p.short}
          {p.id === 'orders' && n ? <span className="count">{n}</span> : null}
        </a>
      ))}
    </nav>
  );
}

// Brand palette for the animated background: emerald greens with a hint of champagne gold.
const BG_COLORS = ['#0f5c3a', '#1f7a49', '#8a6a2e', '#020604'];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Velaris bg="#030806" colors={BG_COLORS} speed={1.2} grain={0.35} height="100%" className="app-bg" />
    <ToastProvider><App /></ToastProvider>
  </StrictMode>,
);
