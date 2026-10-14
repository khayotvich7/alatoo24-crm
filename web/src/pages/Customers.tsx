import { useEffect, useState } from 'react';
import { type Customer, money, type Status, when } from '../api';
import { Badge, Drawer, Empty, Icon, Search, useLoad } from '../ui';

export default function Customers({ arg }: { arg: string | null }) {
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  useEffect(() => { const t = setTimeout(() => setDeb(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, error } = useLoad<{ customers: Customer[] }>(`/api/admin/customers${deb ? `?q=${encodeURIComponent(deb)}` : ''}`);
  const openId = arg ? Number(arg) : null;
  const list = data?.customers ?? [];
  const repeat = list.filter(c => c.orders > 1).length;

  return (
    <div className="stack">
      <div className="head">
        <h1>Mijozlar</h1>
        <div className="actions" style={{ minWidth: 'min(280px, 100%)' }}><Search value={q} onChange={setQ} placeholder="Ism yoki telefon" /></div>
      </div>
      <div className="grid g3">
        <div className="card stat"><div className="k">Mijozlar</div><div className="v num">{list.length}</div></div>
        <div className="card stat"><div className="k">Qayta xarid qilganlar</div><div className="v num">{repeat}</div></div>
        <div className="card stat"><div className="k">Jami xarid</div><div className="v num">{money(list.reduce((a, c) => a + c.spent, 0))}</div></div>
      </div>
      <div className="card flat">
        {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !data ? <div className="empty">Yuklanmoqda…</div> : !list.length ? <Empty title="Mijoz topilmadi" text="Ilovadan buyurtma bergan har bir mijoz shu yerga avtomatik qo'shiladi." /> : (
          <>
            <table className="table collapse">
              <thead><tr><th>Mijoz</th><th>Telefonlar</th><th className="r">Buyurtmalar</th><th className="r">Xarid (yetkazilgan)</th><th>Oxirgi buyurtma</th></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id} onClick={() => { location.hash = `customers/${c.id}`; }}>
                    <td style={{ fontWeight: 700 }}>{c.name}{c.orders > 1 ? <span className="badge t-violet" style={{ marginLeft: 8 }}>Doimiy</span> : null}</td>
                    <td className="small">+998 {c.phone}<div className="muted">+998 {c.phone2}</div></td>
                    <td className="r num">{c.orders}</td>
                    <td className="r num" style={{ fontWeight: 800 }}>{money(c.spent)}</td>
                    <td className="muted small">{when(c.lastOrder)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="list">
              {list.map(c => (
                <div key={c.id} className="item" onClick={() => { location.hash = `customers/${c.id}`; }}>
                  <div className="row between"><b>{c.name}</b><b className="num">{money(c.spent)}</b></div>
                  <div className="muted small">+998 {c.phone} · {c.orders} ta buyurtma</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {openId ? <CustomerDrawer id={openId} /> : null}
    </div>
  );
}

function CustomerDrawer({ id }: { id: number }) {
  const { data } = useLoad<{ customer: Customer; orders: { id: number; no: number; status: Status; total: number; createdAt: string }[] }>(`/api/admin/customers/${id}`);
  const close = () => { location.hash = 'customers'; };
  return (
    <Drawer title={data?.customer.name ?? 'Mijoz'} onClose={close}>
      {!data ? <div className="muted">Yuklanmoqda…</div> : (
        <>
          <div className="card">
            <dl className="kv">
              <dt>1-raqam</dt><dd><a href={`tel:+998${data.customer.phone.replace(/\D/g, '')}`}><Icon name="phone" size={14} /> +998 {data.customer.phone}</a></dd>
              <dt>2-raqam</dt><dd><a href={`tel:+998${data.customer.phone2.replace(/\D/g, '')}`}><Icon name="phone" size={14} /> +998 {data.customer.phone2}</a></dd>
              <dt>Birinchi xarid</dt><dd>{when(data.customer.createdAt)}</dd>
              <dt>Buyurtmalar</dt><dd>{data.orders.length} ta</dd>
              <dt>Jami xarid</dt><dd>{money(data.orders.filter(o => o.status === 'delivered').reduce((a, o) => a + o.total, 0))}</dd>
            </dl>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Buyurtmalar</h3>
            {data.orders.map(o => (
              <a key={o.id} href={`#orders/${o.id}`} className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'inherit' }}>
                <div><b>№ {o.no}</b><div className="muted small">{when(o.createdAt)}</div></div>
                <div className="row"><Badge status={o.status} /><b className="num">{money(o.total)}</b></div>
              </a>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}
