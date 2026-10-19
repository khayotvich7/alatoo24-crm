import { useEffect, useState } from 'react';
import { type Dashboard, del, FLOW, money, type Order, type OrderRow, patch, STATUS, type Status, when } from '../api';
import { Badge, Confirm, Drawer, Empty, Icon, LiveDot, Search, useCan, useLive, useLoad, useMe, useToast } from '../ui';
import { MetalButton } from '@/components/ui/metal-button';

const FILTERS: (Status | 'all' | 'consult')[] = ['all', 'consult', 'new', 'checking', 'confirmed', 'ready', 'delivered', 'cancelled'];

const ConsultBadge = ({ c }: { c: string }) => c === 'needed' ? <span className="badge t-gold" title="Mutaxassis maslahati kerak">🩺 Maslahat kerak</span>
  : c === 'approved' ? <span className="badge t-green">🩺 Ruxsat</span> : c === 'rejected' ? <span className="badge t-red">🩺 Rad</span> : null;

export default function Orders({ arg }: { arg: string | null }) {
  const [status, setStatus] = useState<Status | 'all' | 'consult'>('all');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const qs = new URLSearchParams({ page: String(page), ...(status !== 'all' ? { status } : {}), ...(debounced ? { q: debounced } : {}) });
  const { data, error, reload } = useLoad<{ total: number; pages: number; orders: OrderRow[] }>(`/api/admin/orders?${qs}`);
  const counts = useLoad<Dashboard>('/api/admin/dashboard');
  useLive(() => { reload(); counts.reload(); });

  const openId = arg ? Number(arg) : null;
  const open = (id: number) => { location.hash = `orders/${id}`; };
  const close = () => { location.hash = 'orders'; };
  const total = Object.values(counts.data?.byStatus ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="stack">
      <div className="head">
        <h1>Buyurtmalar</h1>
        <LiveDot />
        <div className="actions" style={{ minWidth: 'min(320px, 100%)' }}><Search value={q} onChange={setQ} placeholder="Ism, telefon, № yoki manzil" /></div>
      </div>

      <div className="chips">
        {FILTERS.map(f => (
          <button key={f} className={`chip${f === status ? ' on' : ''}`} onClick={() => { setStatus(f); setPage(1); }}>
            {f === 'all' ? 'Hammasi' : f === 'consult' ? '🩺 Maslahat kerak' : STATUS[f].label}<b>{f === 'all' ? total : f === 'consult' ? counts.data?.consultNeeded ?? 0 : counts.data?.byStatus[f] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className="card flat">
        {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !data ? <div className="empty">Yuklanmoqda…</div> : !data.orders.length ? (
          <Empty title="Buyurtma topilmadi" text={debounced || status !== 'all' ? "Filtrni o'zgartirib ko'ring." : "Ilovadan birinchi buyurtma tushishi bilan shu yerda ko'rinadi."} />
        ) : (
          <>
            <table className="table m-collapse">
              <thead><tr><th>№</th><th>Mijoz</th><th>Manzil</th><th>Holat</th><th className="r">Summa</th><th>Vaqt</th></tr></thead>
              <tbody>
                {data.orders.map(o => (
                  <tr key={o.id} onClick={() => open(o.id)}>
                    <td style={{ fontWeight: 800 }}>{o.no}</td>
                    <td><div style={{ fontWeight: 700 }}>{o.name}</div><div className="muted small">+998 {o.phone}</div></td>
                    <td><div style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.street}</div><div className="muted small">{o.region}</div></td>
                    <td><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Badge status={o.status} /><ConsultBadge c={o.consult} /></div></td>
                    <td className="r num" style={{ fontWeight: 800 }}>{money(o.total)}<div className="muted small">{o.items} ta</div></td>
                    <td className="muted small">{when(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="list">
              {data.orders.map(o => (
                <div key={o.id} className="item" onClick={() => open(o.id)}>
                  <div className="row between"><b>№ {o.no} · {o.name}</b><Badge status={o.status} /></div>
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
