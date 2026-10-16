import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { MetalButton } from '@/components/ui/metal-button';
import { GlowingCard } from '@/components/ui/glowing-card';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShinyButton } from '@/components/ui/shiny-button';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { type Dashboard as D, money, short, STATUS, type Status, when } from '../api';
import { Empty, Icon, LiveDot, Stat, useCan, useLive, useLoad, useMe } from '../ui';

const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Xayrli tun' : h < 12 ? 'Xayrli tong' : h < 18 ? 'Xayrli kun' : 'Xayrli kech'; };
const OY = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const KUN = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const today = () => { const d = new Date(); return `${KUN[d.getDay()]}, ${d.getDate()}-${OY[d.getMonth()]}`; };
const T = ({ v, f = money }: { v: number; f?: (n: number) => string }) => <NumberTicker value={v} format={f} />;

const fmtPhone = (p: string) => p.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');

export default function Dashboard(_: { arg: string | null }) {
  const { data: d, error, reload } = useLoad<D>('/api/admin/dashboard');
  const me = useMe();
  const can = useCan();
  useLive(reload);
  if (error) return <Empty title="Yuklab bo'lmadi" text={error} />;
  if (!d) return <div className="muted">Yuklanmoqda…</div>;
  const ss = (s: Status) => d.statusSums[s] ?? { n: 0, s: 0 };
  const onWay = { n: ss('ready').n, s: ss('ready').s };
  const m = d.money; // staff get counts only
  const go = (h: string) => () => { location.hash = h; };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="head" style={{ marginBottom: 4 }}>
        <div>
          <div className="small" style={{ color: 'var(--gold)', fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase' }}>{greet()}, {me.role === 'owner' ? 'admin' : me.name}</div>
          <TextShimmer as="h1" className="dash-title">Bosh panel</TextShimmer>
          <div className="muted small" style={{ marginTop: 6 }}>{today()} </div><div style={{ marginTop: 8 }}><LiveDot /></div>
        </div>
        <div className="actions"><ShinyButton tone="gold" className="shiny-sm" onClick={reload}><RefreshCw size={15} /> Yangilash</ShinyButton></div>
      </div>

      {/* Headline: everything customers have ordered (cancellations excluded). */}
      <GlowingCard>
        <div className="k">{m ? 'Jami buyurtmalar summasi' : 'Jami buyurtmalar'}</div>
        <span className="v gold-text">{m ? <T v={d.ordered.s} /> : <T v={d.ordered.n} f={n => `${n} ta`} />}</span>
        <div className="s">{m ? `${d.ordered.n} ta buyurtma · bugun +${money(d.orderedToday.s)} (${d.orderedToday.n} ta)` : `bugun +${d.orderedToday.n} ta yangi buyurtma`}</div>
      </GlowingCard>

      {m ? (
        <>
          <div className="grid g4">
            <Stat k="Umumiy savdo" v={<T v={ss('delivered').s} />} s="naqd pul olingan" icon="cash" tone="gold" onClick={go('finance')} />
            <Stat k="Dastavkada" v={<T v={onWay.s} />} s={`${onWay.n} ta buyurtma · yetkazilmoqda`} icon="truck" tone="amber" onClick={go('orders')} />
            <Stat k="Otkaz (bekor)" v={<T v={ss('cancelled').s} />} s={`${ss('cancelled').n} ta buyurtma`} icon="ban" tone="red" onClick={go('orders')} />
            <Stat k="Yetib bordi" v={<T v={ss('delivered').n} f={n => `${n} ta`} />} s={`${money(ss('delivered').s)} · o'rtacha ${short(ss('delivered').n ? ss('delivered').s / ss('delivered').n : 0)}`} icon="check" tone="green" onClick={go('orders')} />
          </div>
          <div className="grid g4">
            <Stat k="Bugungi savdo" v={<T v={d.today.s} f={short} />} s={`${d.today.n} ta yetkazildi`} icon="clock" tone="green" />
            <Stat k="7 kun" v={<T v={d.week.s} f={short} />} s={`${d.week.n} ta yetkazildi`} icon="chart" tone="blue" />
            <Stat k="Shu oy" v={<T v={d.month.s} f={short} />} s={`${d.month.n} ta yetkazildi`} icon="chart" tone="violet" />
            {d.consultNeeded ? <Stat k="🩺 Mutaxassis maslahati" v={<T v={d.consultNeeded} f={n => String(n)} />} s="mutaxassis tasdig'ini kutmoqda" icon="alert" tone="gold" onClick={go('orders')} />
              : <Stat k="Yangi buyurtmalar" v={<T v={ss('new').n} f={n => String(n)} />} s="tasdiqlash kutilmoqda" icon="orders" tone="gold" onClick={go('orders')} />}
          </div>
        </>
      ) : (
        <div className="grid g4">
          <Stat k="Yangi" v={<T v={ss('new').n} f={n => `${n} ta`} />} s="tekshirish kutilmoqda" icon="orders" tone="gold" onClick={can('orders') ? go('orders') : undefined} />
          {d.consultNeeded ? <Stat k="🩺 Maslahat kerak" v={<T v={d.consultNeeded} f={n => `${n} ta`} />} s="mutaxassis tasdig'ini kutmoqda" icon="alert" tone="gold" onClick={can('orders') ? go('orders') : undefined} />
            : <Stat k="Tekshiruvda" v={<T v={ss('checking').n} f={n => `${n} ta`} />} s="tekshiruvchida" icon="shield" tone="gold" onClick={can('orders') ? go('orders') : undefined} />}
          <Stat k="Dastavkada" v={<T v={onWay.n} f={n => `${n} ta`} />} s="yetkazilmoqda" icon="truck" tone="amber" onClick={can('orders') ? go('orders') : undefined} />
          <Stat k="Bugun yetkazildi" v={<T v={d.today.n} f={n => `${n} ta`} />} s={`shu oy: ${d.month.n} ta`} icon="check" tone="green" />
        </div>
      )}

      <div className="grid g3">
        {can('orders') ? <div className="card span2">
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
                  {m ? <div style={{ fontFamily: 'var(--display)', fontWeight: 700 }} className="num gold">{money(o.total)}</div> : <Icon name="arrow" size={16} />}
                </a>
              ))}
            </div>
          ) : <Empty title="Yangi buyurtma yo'q" text="Ilovadan buyurtma tushsa, shu yerda paydo bo'ladi." />}
        </div> : <div className="span2" />}

        <div className="stack">
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Holatlar</h2>
            {(['new', 'checking', 'confirmed', 'ready', 'delivered', 'cancelled'] as Status[]).map(s => (
              <div key={s} className="row between" style={{ padding: '8px 0' }}>
                <span className={`badge t-${STATUS[s].tone}`}>{STATUS[s].label}</span>
                <span className="num small"><b style={{ fontSize: 14 }}>{ss(s).n}</b>{m ? <span className="muted"> · {short(ss(s).s)}</span> : null}</span>
              </div>
            ))}
            <div className="muted small" style={{ marginTop: 8 }}>Mijozlar: {d.customers}{m ? ` · Kutilayotgan naqd: ${short(d.pendingCash)}` : ''}</div>
          </div>

        </div>
      </div>
    </div>
  );
}
