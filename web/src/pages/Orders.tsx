import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { del, FLOW, money, type Order, type OrderRow, patch, STATUS, type Status, when } from '../api';
import { Badge, Confirm, Drawer, Empty, Icon, LiveDot, useCan, useLive, useLoad, useMe, useToast } from '../ui';
import { MetalButton } from '@/components/ui/metal-button';

// The four statuses the team works with; the rest stay reachable through "Hammasi".
const STATUS_OPTS = [
  { s: 'ready', label: "Yo'lda", icon: 'truck', tone: 'amber' },
  { s: 'problem', label: 'Muammoli', icon: 'alert', tone: 'red' },
  { s: 'delivered', label: 'Yetkazildi', icon: 'check', tone: 'green' },
  { s: 'cancelled', label: 'Otkaz', icon: 'ban', tone: 'gray' },
] as const;
type Filters = { q: string; status: string; region: string; product: string; from: string; to: string; dfrom: string; dto: string };
const NO_FILTERS: Filters = { q: '', status: '', region: '', product: '', from: '', to: '', dfrom: '', dto: '' };
// Shown for completeness but switched off: orders have no country or courier yet.
const MISSING = "Bazada hali bu ma'lumot yo'q";

const Pick = ({ icon, label, value, onChange, children, off }: { icon: string; label: string; value?: string; onChange?: (v: string) => void; children: React.ReactNode; off?: boolean }) => (
  <label className={`fp-field${value ? ' on' : ''}${off ? ' off' : ''}`} title={off ? MISSING : undefined}>
    <span className="fp-lbl">{label}</span>
    <span className="fp-box"><Icon name={icon} size={16} /><select value={value ?? ''} disabled={off} onChange={e => onChange?.(e.target.value)}>{children}</select></span>
  </label>
);

const Range = ({ label, from, to, onFrom, onTo }: { label: string; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) => (
  <div className={`fp-field fp-range${from || to ? ' on' : ''}`}>
    <span className="fp-lbl">{label}</span>
    <span className="fp-box">
      <Icon name="clock" size={16} />
      <input type="date" value={from} max={to || undefined} onChange={e => onFrom(e.target.value)} aria-label={`${label}: dan`} />
      <i>–</i>
      <input type="date" value={to} min={from || undefined} onChange={e => onTo(e.target.value)} aria-label={`${label}: gacha`} />
    </span>
  </div>
);

/** One filter panel above the orders table; every field narrows the list together with the others. */
function FilterPanel({ f, set, counts, found }: { f: Filters; set: (p: Partial<Filters>) => void; counts?: Record<string, number>; found?: number }) {
  const opts = useLoad<{ regions: string[]; products: { id: number; name: string }[] }>('/api/admin/orders/filters');
  const active = (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter(k => f[k] !== '').length;
  return (
    <div className="card fpanel">
      <div className="fp-top">
        <div className="fp-search"><Icon name="search" size={18} /><input value={f.q} onChange={e => set({ q: e.target.value })} placeholder="Mijoz, telefon, ID yoki manzil bo'yicha qidirish" />{f.q ? <button aria-label="Tozalash" onClick={() => set({ q: '' })}><Icon name="x" size={15} /></button> : null}</div>
        <button className="fp-clear" disabled={!active} onClick={() => set(NO_FILTERS)}><Icon name="x" size={15} />Tozalash{active ? <b>{active}</b> : null}</button>
      </div>

      <div className="fp-status">
        <button className={`fp-pill${f.status === '' ? ' on' : ''}`} onClick={() => set({ status: '' })}>Hammasi<b>{counts?.all ?? '…'}</b></button>
        {STATUS_OPTS.map(o => (
          <button key={o.s} className={`fp-pill t-${o.tone}${f.status === o.s ? ' on' : ''}`} onClick={() => set({ status: f.status === o.s ? '' : o.s })}>
            <Icon name={o.icon} size={15} />{o.label}<b>{counts?.[o.s] ?? 0}</b>
          </button>
        ))}
        {found !== undefined ? <span className="fp-found">{found} ta topildi</span> : null}
      </div>

      <div className="fp-grid">
        <Pick icon="pin" label="Hudud" value={f.region} onChange={v => set({ region: v })}>
          <option value="">Barcha hudud</option>
          {opts.data?.regions.map(r => <option key={r} value={r}>{r}</option>)}
        </Pick>
        <Pick icon="box" label="Mahsulot" value={f.product} onChange={v => set({ product: v })}>
          <option value="">Barcha mahsulot</option>
          {opts.data?.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Pick>
        <Pick icon="truck" label="Kuryer" off><option>Barcha kuryer</option></Pick>
        <Pick icon="home" label="Davlat" off><option>O'zbekiston</option></Pick>
        <Range label="Zakaz sanasi" from={f.from} to={f.to} onFrom={v => set({ from: v })} onTo={v => set({ to: v })} />
        <Range label="Yetkazilgan sana" from={f.dfrom} to={f.dto} onFrom={v => set({ dfrom: v })} onTo={v => set({ dto: v })} />
      </div>
    </div>
  );
}

const ConsultBadge = ({ c }: { c: string }) => c === 'needed' ? <span className="badge t-gold" title="Mutaxassis maslahati kerak">🩺 Maslahat kerak</span>
  : c === 'approved' ? <span className="badge t-green">🩺 Ruxsat</span> : c === 'rejected' ? <span className="badge t-red">🩺 Rad</span> : null;

// Quick status from the list: one button at the end of the row, three choices, no need to open the order.
const QUICK = [
  { to: 'ready', label: "Yo'lda", icon: 'truck', tone: 'var(--amber)' },
  { to: 'problem', label: 'Muammoli', icon: 'alert', tone: 'var(--amber)' },
  { to: 'delivered', label: 'Yetkazildi', icon: 'check', tone: 'var(--ok)' },
  { to: 'cancelled', label: 'Otkaz', icon: 'ban', tone: 'var(--sale)' },
] as const;

function QuickStatus({ o, onDone }: { o: OrderRow; onDone: () => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close); window.addEventListener('scroll', close, true); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', key); };
  }, [at]);
  const set = async (to: Status, label: string) => {
    setAt(null);
    if (to === o.status) return;
    if (to === 'cancelled' && !confirm(`№ ${o.no} — otkaz qilinsinmi?`)) return;
    setBusy(true);
    try { await patch(`/api/admin/orders/${o.id}`, { status: to }); toast(`№ ${o.no}: ${label}`); onDone(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <button className="qs-btn" title="Holatni o'zgartirish" aria-label="Holatni o'zgartirish" disabled={busy}
        onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setAt(at ? null : { x: Math.min(r.right, window.innerWidth - 8), y: r.bottom + 6 }); }}>
        <Icon name={o.status === 'ready' ? 'truck' : o.status === 'problem' ? 'alert' : o.status === 'delivered' ? 'check' : o.status === 'cancelled' ? 'ban' : 'refresh'} size={17} />
      </button>
      {at ? createPortal(
        <div className="qs-menu" style={{ top: Math.min(at.y, window.innerHeight - 170), left: at.x }} onClick={e => e.stopPropagation()}>
          {QUICK.map(q => (
            <button key={q.to} className={o.status === q.to ? 'on' : ''} onClick={() => set(q.to, q.label)}>
              <span style={{ color: q.tone, display: 'inline-flex' }}><Icon name={q.icon} size={17} /></span>{q.label}
            </button>
          ))}
        </div>, document.body,
      ) : null}
    </>
  );
}

export default function Orders({ arg }: { arg: string | null }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const set = (p: Partial<Filters>) => { setF(x => ({ ...x, ...p })); setPage(1); };
  useEffect(() => { const t = setTimeout(() => setDebounced(f.q), 300); return () => clearTimeout(t); }, [f.q]);

  // Search waits 300 ms after typing; every other filter applies at once.
  const qs = new URLSearchParams({ page: String(page), ...Object.fromEntries(Object.entries({ ...f, q: debounced }).filter(([, v]) => v)) });
  const { data, error, reload } = useLoad<{ total: number; pages: number; orders: OrderRow[]; counts: Record<string, number> }>(`/api/admin/orders?${qs}`);
  const counts = { reload };
  useLive(reload);
  const filtered = (Object.keys(NO_FILTERS) as (keyof Filters)[]).some(k => f[k] !== '');

  const openId = arg ? Number(arg) : null;
  const open = (id: number) => { location.hash = `orders/${id}`; };
  const close = () => { location.hash = 'orders'; };
  const edit = useCan()('orders', 2);

  return (
    <div className="stack">
      <div className="head">
        <h1>Buyurtmalar</h1>
        <LiveDot />
      </div>

      <FilterPanel f={f} set={set} counts={data?.counts} found={data?.total} />

      <div className="card flat">
        {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !data ? <div className="empty">Yuklanmoqda…</div> : !data.orders.length ? (
          <Empty title="Buyurtma topilmadi" text={filtered ? "Filtrni o'zgartirib ko'ring." : "Ilovadan birinchi buyurtma tushishi bilan shu yerda ko'rinadi."} />
        ) : (
          <>
            <table className="table m-collapse">
              <thead><tr><th>№</th><th>Mijoz</th><th>Manzil</th><th>Holat</th><th className="r">Summa</th><th>Vaqt</th>{edit ? <th aria-label="Holat" /> : null}</tr></thead>
              <tbody>
                {data.orders.map(o => (
                  <tr key={o.id} onClick={() => open(o.id)}>
                    <td style={{ fontWeight: 800 }}>{o.no}</td>
                    <td><div style={{ fontWeight: 700 }}>{o.name}</div><div className="muted small">+998 {o.phone}</div></td>
                    <td><div style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.street}</div><div className="muted small">{o.region}</div></td>
                    <td><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Badge status={o.status} /><ConsultBadge c={o.consult} /></div></td>
                    <td className="r num" style={{ fontWeight: 800 }}>{money(o.total)}<div className="muted small">{o.items} ta</div></td>
                    <td className="muted small">{when(o.createdAt)}</td>
                    {edit ? <td className="r" onClick={e => e.stopPropagation()}><QuickStatus o={o} onDone={() => { reload(); counts.reload(); }} /></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="list">
              {data.orders.map(o => (
                <div key={o.id} className="item" onClick={() => open(o.id)}>
                  <div className="row between"><b>№ {o.no} · {o.name}</b><div className="row" style={{ gap: 8 }} onClick={e => e.stopPropagation()}><Badge status={o.status} />{edit ? <QuickStatus o={o} onDone={() => { reload(); counts.reload(); }} /> : null}</div></div>
                  <div className="row between" style={{ marginTop: 6 }}>
                    <span className="muted small">{o.region} · {when(o.createdAt)}</span>
                    <b className="num">{money(o.total)}</b>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {data && data.pages > 1 ? (
        <div className="row" style={{ justifyContent: 'center' }}>
          <MetalButton lite size="sm" tone="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Oldingi</MetalButton>
          <span className="muted small">{page} / {data.pages}</span>
          <MetalButton lite size="sm" tone="ghost" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Keyingi ›</MetalButton>
        </div>
      ) : null}

      {openId ? <OrderDrawer id={openId} onClose={close} onChanged={() => { reload(); counts.reload(); }} /> : null}
    </div>
  );
}

const NEXT: Partial<Record<Status, { to: Status; label: string; cls: string }>> = {
  new: { to: 'checking', label: 'Tekshiruvga yuborish', cls: 'btn' },
  checking: { to: 'confirmed', label: 'Tekshirildi · tasdiqlash', cls: 'btn' },
  confirmed: { to: 'ready', label: 'Dastavkaga berildi', cls: 'btn' },
  ready: { to: 'delivered', label: 'Yetkazildi · naqd olindi', cls: 'btn sun' },
  problem: { to: 'delivered', label: 'Yetkazildi · naqd olindi', cls: 'btn sun' },
};

function OrderDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useLoad<{ order: Order }>(`/api/admin/orders/${id}`);
  useLive(reload); // see status changes made by others (or by the courier app) while the order is open
  const toast = useToast();
  const edit = useCan()('orders', 2);
  const owner = useMe().role === 'owner';
  const [rm, setRm] = useState(false);
  const remove = async () => {
    setBusy(true);
    try { await del(`/api/admin/orders/${id}`); toast("Buyurtma o'chirildi"); onChanged(); onClose(); }
    catch (e) { toast((e as Error).message); setBusy(false); }
  };
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const o = data?.order;

  const save = async (body: object, msg: string) => {
    setBusy(true);
    try { await patch(`/api/admin/orders/${id}`, body); toast(msg); reload(); onChanged(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  if (error) return <Drawer title="Buyurtma" onClose={onClose}><Empty title="Topilmadi" text={error} /></Drawer>;
  if (!o) return <Drawer title="Buyurtma" onClose={onClose}><div className="muted">Yuklanmoqda…</div></Drawer>;
  const next = NEXT[o.status];
  const at = FLOW.indexOf(o.status);
  const addr = [o.address.region, o.address.street, o.address.flat && `${o.address.flat}-xonadon`].filter(Boolean).join(', ');

  return (
    <Drawer
      title={`№ ${o.no}`}
      right={<div className="row" style={{ gap: 6 }}><ConsultBadge c={o.consult} /><Badge status={o.status} /></div>}
      onClose={onClose}
      footer={!edit ? <div className="readonly-note"><Icon name="shield" size={15} /> Sizda faqat ko'rib chiqish ruxsati bor</div> : <>
        {o.consult === 'needed' && o.status !== 'cancelled' ? <>
          <MetalButton tone="emerald" disabled={busy} onClick={() => { const n = prompt('Mutaxassis izohi (ixtiyoriy)') ?? ''; save({ consult: 'approved', note: n }, 'Mutaxassis tasdiqladi'); }}>🩺 Mutaxassis tasdiqladi</MetalButton>
          <MetalButton tone="ruby" disabled={busy} onClick={() => { if (!confirm('Mutaxassis rad etdimi? Buyurtma bekor qilinadi.')) return; save({ consult: 'rejected', status: 'cancelled', note: 'Mutaxassis rad etdi' }, 'Rad etildi'); }}>Rad etish</MetalButton>
        </> : null}
        {next && !(o.consult === 'needed' && (next.to === 'ready' || next.to === 'delivered')) && o.consult !== 'rejected' ? <MetalButton tone={next.to === 'delivered' ? 'emerald' : 'onyx'} disabled={busy} onClick={() => save({ status: next.to }, STATUS[next.to].label)}>{next.label}</MetalButton> : null}
        {o.status !== 'cancelled' && o.status !== 'delivered' ? (
          <MetalButton tone="ruby" disabled={busy} onClick={() => confirm(`№ ${o.no} bekor qilinsinmi?`) && save({ status: 'cancelled' }, 'Bekor qilindi')}>Bekor qilish</MetalButton>
        ) : null}
        {o.status === 'delivered' || o.status === 'cancelled' ? (
          <MetalButton tone="ghost" disabled={busy} onClick={() => confirm('Buyurtma qayta ochilsinmi?') && save({ status: 'confirmed' }, 'Qayta ochildi')}>Qayta ochish</MetalButton>
        ) : null}
        {owner ? <button className="del-btn" style={{ marginLeft: 'auto', width: 46, height: 46, flexBasis: 46 }} title="Buyurtmani o'chirish" aria-label="Buyurtmani o'chirish" disabled={busy} onClick={() => setRm(true)}><Icon name="trash" size={18} /></button> : null}
      </>}
    >
      <div className="card">
        <div className="row between">
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22 }} className="num">{money(o.total)}</div>
            <div className="muted small">Naqd, qabul qilganda{o.discount ? ` · chegirma ${money(o.discount)} (${o.promo})` : ''}</div>
          </div>
          <div className="muted small" style={{ textAlign: 'right' }}>{when(o.createdAt)}</div>
        </div>
        {o.status !== 'cancelled' ? (
          <div className="row" style={{ gap: 6, marginTop: 14 }}>
            {FLOW.map((s, i) => <div key={s} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= at ? 'var(--brand)' : 'var(--line)', boxShadow: i <= at ? '0 0 10px rgba(47,191,122,.5)' : 'none' }} title={STATUS[s].label} />)}
          </div>
        ) : o.cancelReason ? (
          <div className="small" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--sale-soft)', color: 'var(--sale)' }}>
            <b>Mijoz bekor qildi:</b> {o.cancelReason}
          </div>
        ) : null}
      </div>

      <div className="card">
        {o.health && (o.consult || o.health.conditions.length || o.health.other) ? (
          <div style={{ marginBottom: 14, padding: 14, borderRadius: 14, border: '1px solid rgba(227,201,143,.35)', background: 'var(--gold-soft)' }}>
            <div className="row between" style={{ marginBottom: 8 }}><b className="gold">🩺 Sog'liq holati</b><ConsultBadge c={o.consult} /></div>
            {o.health.conditions.length ? <div style={{ fontSize: 14 }}>{o.health.conditions.join(' · ')}</div> : null}
            {o.health.other ? <div style={{ fontSize: 14, marginTop: 4 }}><span className="muted">Mijoz yozgan:</span> {o.health.other}</div> : null}
            {o.health.age != null && o.health.age < 5 ? <div style={{ fontSize: 14, marginTop: 4 }}>Yoshi: {o.health.age} (5 yoshdan kichik)</div> : null}
            {o.consult === 'needed' ? <div className="small" style={{ marginTop: 8, color: 'var(--ink2)' }}>Mutaxassis mijoz bilan gaplashib, tasdiqlamaguncha buyurtma kuryerga berilmaydi.</div> : null}
          </div>
        ) : null}
        {o.health ? <div className="muted small" style={{ marginBottom: 10 }}>{[o.health.age != null ? `${o.health.age} yosh` : '', o.health.gender === 'female' ? 'ayol' : o.health.gender === 'male' ? 'erkak' : '', o.health.weight ? `${o.health.weight} kg` : ''].filter(Boolean).join(' · ')}</div> : null}
        <h3 style={{ marginBottom: 10 }}>Mijoz</h3>
        <dl className="kv">
          <dt>Ism</dt><dd><a href={`#customers/${o.customerId}`}>{o.name}</a></dd>
          <dt>1-raqam</dt><dd><a href={`tel:+998${o.phone.replace(/\D/g, '')}`}><Icon name="phone" size={14} /> +998 {o.phone}</a></dd>
          <dt>2-raqam</dt><dd><a href={`tel:+998${o.phone2.replace(/\D/g, '')}`}><Icon name="phone" size={14} /> +998 {o.phone2}</a></dd>
          <dt>Manzil</dt><dd>{addr}</dd>
          {o.address.landmark ? <><dt>Mo'ljal</dt><dd>{o.address.landmark}</dd></> : null}
          <dt>Xarita</dt><dd><a href={`https://yandex.uz/maps/?text=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer"><Icon name="pin" size={14} /> Yandex xaritada ochish</a></dd>
        </dl>
        {o.comment ? <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--gold-soft)', color: 'var(--gold)', fontSize: 14 }}><b>Izoh:</b> {o.comment}</div> : null}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Tovarlar</h3>
        {o.items.map(i => (
          <div key={i.id} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div><div style={{ fontWeight: 700 }}>{i.name}</div><div className="muted small">{i.qty} × {money(i.price)}</div></div>
            <b className="num">{money(i.qty * i.price)}</b>
          </div>
        ))}
        <div className="row between" style={{ paddingTop: 8 }}><span className="muted">Mahsulotlar</span><span className="num">{money(o.subtotal)}</span></div>
        {o.discount ? <div className="row between"><span className="muted">Promokod</span><span className="num">−{money(o.discount)}</span></div> : null}
        <div className="row between" style={{ paddingTop: 4 }}><b>Jami, naqd</b><b className="num">{money(o.total)}</b></div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Ichki izoh (mijoz ko'rmaydi)</h3>
        <textarea className="textarea" placeholder="Masalan: kuryer Ali, 2-qavat" value={note ?? o.adminNote} readOnly={!edit} onChange={e => setNote(e.target.value)} />
        {note !== null && note !== o.adminNote ? <MetalButton size="sm" tone="emerald" style={{ marginTop: 10 }} disabled={busy} onClick={() => save({ adminNote: note }, 'Saqlandi').then(() => setNote(null))}>Saqlash</MetalButton> : null}
      </div>

      {rm ? <Confirm title={`№ ${o.no} o'chirilsinmi?`} text={<>Buyurtma, uning tovarlari va tarixi butunlay o'chiriladi.</>} busy={busy} onOk={remove} onCancel={() => setRm(false)} /> : null}

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Tarix</h3>
        <div className="timeline">
          {o.events.map((e, i) => (
            <div key={i} className="ev">
              <span className={`dot t-${STATUS[e.status].tone}`} style={{ background: 'currentColor' }} />
              <div><b>{STATUS[e.status].label}</b>{e.note ? <span className="muted"> · {e.note}</span> : null}<div className="muted small">{when(e.createdAt)}</div></div>
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
