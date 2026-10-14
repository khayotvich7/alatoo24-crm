import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { MetalButton } from '@/components/ui/metal-button';
import { type Dashboard as D, money, short, STATUS, type Status, when } from '../api';
import { Empty, Icon, Stat, useLoad } from '../ui';

const fmtPhone = (p: string) => p.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');

export default function Dashboard(_: { arg: string | null }) {
  const { data: d, error, reload } = useLoad<D>('/api/admin/dashboard');
  useEffect(() => { const t = setInterval(reload, 30_000); return () => clearInterval(t); }, [reload]);
  if (error) return <Empty title="Yuklab bo'lmadi" text={error} />;
  if (!d) return <div className="muted">Yuklanmoqda…</div>;
  const ss = (s: Status) => d.statusSums[s] ?? { n: 0, s: 0 };
  const onWay = { n: ss('confirmed').n + ss('courier').n, s: ss('confirmed').s + ss('courier').s };
  const go = (h: string) => () => { location.hash = h; };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="head" style={{ marginBottom: 4 }}>
        <div>
          <h1>Bosh panel</h1>
          <div className="muted small" style={{ marginTop: 6 }}>Har 30 soniyada avtomatik yangilanadi</div>
        </div>
        <div className="actions"><MetalButton size="sm" tone="ghost" icon={<RefreshCw size={15} />} onClick={reload}>Yangilash</MetalButton></div>
      </div>

      {/* Headline: everything customers have ordered (cancellations excluded). */}
      <div className="hero-total">
        <svg className="ridge" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden>
          <path d="M0 150 L60 90 L100 120 L170 40 L240 120 L290 80 L350 130 L400 100 L400 200 L0 200Z" fill="#2fbf7a" opacity=".18" />
          <path d="M0 175 L80 135 L150 165 L220 120 L300 160 L360 140 L400 160 L400 200 L0 200Z" fill="#e3c98f" opacity=".1" />
        </svg>
        <div className="k">Jami buyurtmalar summasi</div>
        <div className="v num metal-text">{money(d.ordered.s)}</div>
        <div className="s">{d.ordered.n} ta buyurtma · bugun +{money(d.orderedToday.s)} ({d.orderedToday.n} ta)</div>
      </div>

      <div className="grid g4">
        <Stat k="Umumiy savdo" v={money(ss('delivered').s)} s="naqd pul olingan" icon="cash" tone="gold" onClick={go('analytics')} />
        <Stat k="Yo'lda" v={money(onWay.s)} s={`${onWay.n} ta buyurtma · tasdiqlangan va kuryerda`} icon="truck" tone="amber" onClick={go('orders')} />
        <Stat k="Otkaz (bekor)" v={money(ss('cancelled').s)} s={`${ss('cancelled').n} ta buyurtma`} icon="ban" tone="red" onClick={go('orders')} />
        <Stat k="Yetib bordi" v={`${ss('delivered').n} ta`} s={`${money(ss('delivered').s)} · o'rtacha ${short(ss('delivered').n ? ss('delivered').s / ss('delivered').n : 0)}`} icon="check" tone="green" onClick={go('orders')} />
      </div>

      <div className="grid g4">
        <Stat k="Bugungi savdo" v={short(d.today.s)} s={`${d.today.n} ta yetkazildi`} icon="clock" tone="green" />
        <Stat k="7 kun" v={short(d.week.s)} s={`${d.week.n} ta yetkazildi`} icon="chart" tone="blue" />
        <Stat k="Shu oy" v={short(d.month.s)} s={`${d.month.n} ta yetkazildi`} icon="chart" tone="violet" />
        <Stat k="Yangi buyurtmalar" v={ss('new').n} s="tasdiqlash kutilmoqda" icon="orders" tone="gold" onClick={go('orders')} />
      </div>

      <div className="grid g3">
        <div className="card span2">
          <div className="row between" style={{ marginBottom: 14 }}>
            <h2>Yangi buyurtmalar</h2>
            <MetalButton size="sm" tone="emerald" onClick={go('orders')} icon={<Icon name="arrow" size={15} />}>Hammasi</MetalButton>
          </div>
          {d.newOrders.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {d.newOrders.map(o => (
                <a key={o.id} href={`#orders/${o.id}`} className="row between" style={{ textDecoration: 'none', color: 'inherit', padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>№ {o.no} · {o.name}</div>
                    <div className="muted small">+998 {fmtPhone(o.phone)} · {when(o.createdAt)}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--display)', fontWeight: 700 }} className="num gold">{money(o.total)}</div>
                </a>
              ))}
            </div>
          ) : <Empty title="Yangi buyurtma yo'q" text="Ilovadan buyurtma tushsa, shu yerda paydo bo'ladi." />}
        </div>

        <div className="stack">
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Holatlar</h2>
            {(['new', 'confirmed', 'courier', 'delivered', 'cancelled'] as Status[]).map(s => (
              <div key={s} className="row between" style={{ padding: '8px 0' }}>
                <span className={`badge t-${STATUS[s].tone}`}>{STATUS[s].label}</span>
                <span className="num small"><b style={{ fontSize: 14 }}>{ss(s).n}</b> <span className="muted">· {short(ss(s).s)}</span></span>
              </div>
            ))}
            <div className="muted small" style={{ marginTop: 8 }}>Mijozlar: {d.customers} · Kutilayotgan naqd: {short(d.pendingCash)}</div>
          </div>

          <div className="card">
            <div className="row" style={{ marginBottom: 10, gap: 8 }}>
              <span className="t-amber" style={{ borderRadius: 10, width: 30, height: 30, display: 'grid', placeItems: 'center' }}><Icon name="alert" size={16} /></span>
              <h2>Skladda kam qolgan</h2>
            </div>
            {d.lowStock.length ? d.lowStock.map(p => (
              <a key={p.id} href="#stock" className="row between" style={{ padding: '6px 0', textDecoration: 'none', color: 'inherit', fontSize: 14 }}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{p.name}</span>
                <b className="num" style={{ color: p.stock <= 0 ? 'var(--sale)' : 'var(--amber)' }}>{p.stock} ta</b>
              </a>
            )) : <div className="muted small">Hammasi yetarli ✓</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
