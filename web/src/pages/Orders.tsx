import { useEffect, useState } from 'react';
import { type Dashboard, FLOW, money, type Order, type OrderRow, patch, STATUS, type Status, when } from '../api';
import { Badge, Drawer, Empty, Icon, Search, useCan, useLoad, useToast } from '../ui';
import { MetalButton } from '@/components/ui/metal-button';

const FILTERS: (Status | 'all')[] = ['all', 'new', 'checking', 'confirmed', 'ready', 'courier', 'delivered', 'cancelled'];

export default function Orders({ arg }: { arg: string | null }) {
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const qs = new URLSearchParams({ page: String(page), ...(status !== 'all' ? { status } : {}), ...(debounced ? { q: debounced } : {}) });
  const { data, error, reload } = useLoad<{ total: number; pages: number; orders: OrderRow[] }>(`/api/admin/orders?${qs}`);
  const counts = useLoad<Dashboard>('/api/admin/dashboard');
  useEffect(() => { const t = setInterval(() => { reload(); counts.reload(); }, 30_000); return () => clearInterval(t); }, [reload, counts.reload]);

  const openId = arg ? Number(arg) : null;
  const open = (id: number) => { location.hash = `orders/${id}`; };
  const close = () => { location.hash = 'orders'; };
  const total = Object.values(counts.data?.byStatus ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="stack">
      <div className="head">
        <h1>Buyurtmalar</h1>
        <div className="actions" style={{ minWidth: 'min(320px, 100%)' }}><Search value={q} onChange={setQ} placeholder="Ism, telefon, № yoki manzil" /></div>
      </div>

      <div className="chips">
        {FILTERS.map(f => (
          <button key={f} className={`chip${f === status ? ' on' : ''}`} onClick={() => { setStatus(f); setPage(1); }}>
            {f === 'all' ? 'Hammasi' : STATUS[f].label}<b>{f === 'all' ? total : counts.data?.byStatus[f] ?? 0}</b>
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
                    <td><Badge status={o.status} /></td>
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
  confirmed: { to: 'ready', label: 'Dastavkaga tayyor', cls: 'btn' },
  ready: { to: 'courier', label: 'Kuryerga berildi', cls: 'btn' },
  courier: { to: 'delivered', label: 'Yetkazildi · naqd olindi', cls: 'btn sun' },
};

function OrderDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useLoad<{ order: Order }>(`/api/admin/orders/${id}`);
  const toast = useToast();
  const edit = useCan()('orders', 2);
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
      right={<Badge status={o.status} />}
      onClose={onClose}
      footer={!edit ? <div className="readonly-note"><Icon name="shield" size={15} /> Sizda faqat ko'rib chiqish ruxsati bor</div> : <>
        {next ? <MetalButton tone={next.to === 'delivered' ? 'emerald' : 'onyx'} disabled={busy} onClick={() => save({ status: next.to }, STATUS[next.to].label)}>{next.label}</MetalButton> : null}
        {o.status !== 'cancelled' && o.status !== 'delivered' ? (
          <MetalButton tone="ruby" disabled={busy} onClick={() => confirm(`№ ${o.no} bekor qilinsinmi?`) && save({ status: 'cancelled' }, 'Bekor qilindi')}>Bekor qilish</MetalButton>
        ) : null}
        {o.status === 'delivered' || o.status === 'cancelled' ? (
          <MetalButton tone="ghost" disabled={busy} onClick={() => confirm('Buyurtma qayta ochilsinmi? Yetkazilgan bo‘lsa, tovar skladga qaytariladi.') && save({ status: 'confirmed' }, 'Qayta ochildi')}>Qayta ochish</MetalButton>
        ) : null}
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
            {FLOW.map((s, i) => <div key={s} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= at ? 'var(--brand)' : 'rgba(255,255,255,.08)', boxShadow: i <= at ? '0 0 10px rgba(47,191,122,.5)' : 'none' }} title={STATUS[s].label} />)}
          </div>
        ) : null}
      </div>

      <div className="card">
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
