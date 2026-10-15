import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MetalButton } from '@/components/ui/metal-button';
import { GlowingCard } from '@/components/ui/glowing-card';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShinyButton } from '@/components/ui/shiny-button';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { del, type Dashboard as D, money, post, short, STATUS, type Status, when } from '../api';
import { Empty, Icon, Stat, useLoad, useToast } from '../ui';

const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Xayrli tun' : h < 12 ? 'Xayrli tong' : h < 18 ? 'Xayrli kun' : 'Xayrli kech'; };
const OY = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const KUN = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const today = () => { const d = new Date(); return `${KUN[d.getDay()]}, ${d.getDate()}-${OY[d.getMonth()]}`; };
const T = ({ v, f = money }: { v: number; f?: (n: number) => string }) => <NumberTicker value={v} format={f} />;

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
          <div className="small" style={{ color: 'var(--gold)', fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase' }}>{greet()}, admin</div>
          <TextShimmer as="h1" className="dash-title">Bosh panel</TextShimmer>
          <div className="muted small" style={{ marginTop: 6 }}>{today()} · har 30 soniyada yangilanadi</div>
        </div>
        <div className="actions"><ShinyButton tone="gold" className="shiny-sm" onClick={reload}><RefreshCw size={15} /> Yangilash</ShinyButton></div>
      </div>

      {/* Headline: everything customers have ordered (cancellations excluded). */}
      <GlowingCard>
        <div className="k">Jami buyurtmalar summasi</div>
        <span className="v gold-text"><T v={d.ordered.s} /></span>
        <div className="s">{d.ordered.n} ta buyurtma · bugun +{money(d.orderedToday.s)} ({d.orderedToday.n} ta)</div>
      </GlowingCard>

      <div className="grid g4">
        <Stat k="Umumiy savdo" v={<T v={ss('delivered').s} />} s="naqd pul olingan" icon="cash" tone="gold" onClick={go('analytics')} />
        <Stat k="Yo'lda" v={<T v={onWay.s} />} s={`${onWay.n} ta buyurtma · tasdiqlangan va kuryerda`} icon="truck" tone="amber" onClick={go('orders')} />
        <Stat k="Otkaz (bekor)" v={<T v={ss('cancelled').s} />} s={`${ss('cancelled').n} ta buyurtma`} icon="ban" tone="red" onClick={go('orders')} />
        <Stat k="Yetib bordi" v={<T v={ss('delivered').n} f={n => `${n} ta`} />} s={`${money(ss('delivered').s)} · o'rtacha ${short(ss('delivered').n ? ss('delivered').s / ss('delivered').n : 0)}`} icon="check" tone="green" onClick={go('orders')} />
      </div>

      <div className="grid g4">
        <Stat k="Bugungi savdo" v={<T v={d.today.s} f={short} />} s={`${d.today.n} ta yetkazildi`} icon="clock" tone="green" />
        <Stat k="7 kun" v={<T v={d.week.s} f={short} />} s={`${d.week.n} ta yetkazildi`} icon="chart" tone="blue" />
        <Stat k="Shu oy" v={<T v={d.month.s} f={short} />} s={`${d.month.n} ta yetkazildi`} icon="chart" tone="violet" />
        <Stat k="Yangi buyurtmalar" v={<T v={ss('new').n} f={n => String(n)} />} s="tasdiqlash kutilmoqda" icon="orders" tone="gold" onClick={go('orders')} />
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

      <ArdenCard />
    </div>
  );
}

type Integ = { connected: boolean; last4?: string; createdAt?: string; usedAt?: string | null };

/** Read-only key for Arden: created here, shown once, can be revoked. */
function ArdenCard() {
  const { data, reload } = useLoad<Integ>('/api/admin/integration');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const toast = useToast();
  const create = async () => {
    setBusy(true);
    try { const r = await post<{ key: string }>('/api/admin/integration', {}); setKey(r.key); setSure(false); reload(); } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };
  const revoke = async () => {
    if (!sure) { setSure(true); return; }
    setBusy(true);
    try { await del('/api/admin/integration'); setKey(''); setSure(false); reload(); toast('Kalit bekor qilindi'); } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(key); toast('Nusxalandi'); } catch { toast('Kalitni belgilab, qo‘lda nusxalang'); }
  };
  const tsh = (iso?: string | null) => iso ? when(iso.replace('T', ' ').slice(0, 19)) : '—';
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Arden integratsiyasi</h2>
          <div className="muted small" style={{ marginTop: 4 }}>Arden markazi buyurtma, ombor va analitikani o‘qiy oladi. Mijozlarning ismi va telefoni berilmaydi, hech narsa o‘zgartirilmaydi.</div>
        </div>
        {data?.connected
          ? <span className="badge t-green">Ulangan · …{data.last4}</span>
          : <span className="badge t-amber">Ulanmagan</span>}
      </div>
      {key ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="small" style={{ fontWeight: 700 }}>Yangi kalit — faqat hozir ko‘rinadi. Uni Arden’dagi «Loyiha qo‘shish» oynasiga qo‘ying:</div>
          <code style={{ display: 'block', padding: '12px 14px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', wordBreak: 'break-all', userSelect: 'all' }}>{key}</code>
          <div className="row" style={{ gap: 8 }}>
            <MetalButton size="sm" tone="emerald" onClick={copy}>Nusxalash</MetalButton>
            <MetalButton size="sm" tone="ghost" onClick={() => setKey('')}>Tayyor</MetalButton>
          </div>
        </div>
      ) : (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <MetalButton size="sm" tone="emerald" onClick={create} disabled={busy}>{data?.connected ? 'Yangi kalit yaratish' : 'Kalit yaratish'}</MetalButton>
          {data?.connected && <MetalButton size="sm" tone="ruby" onClick={revoke} disabled={busy}>{sure ? 'Aniqmi? Yana bosing' : 'Bekor qilish'}</MetalButton>}
          {data?.connected && <span className="muted small">Yaratilgan: {tsh(data.createdAt)} · oxirgi ulanish: {tsh(data.usedAt)}</span>}
        </div>
      )}
    </div>
  );
}
