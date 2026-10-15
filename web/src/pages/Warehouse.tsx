import { useState } from 'react';
import { type Move, post, type Product, when } from '../api';
import { Drawer, Empty, Field, Icon, Search, Thumb, useCan, useLoad, useToast } from '../ui';
import { MetalButton } from '@/components/ui/metal-button';

const KIND: Record<string, { label: string; tone: string }> = {
  in: { label: 'Kirim', tone: 'green' },
  sale: { label: 'Sotildi', tone: 'blue' },
  return: { label: 'Qaytdi', tone: 'violet' },
  adjust: { label: "To'g'rilash", tone: 'gray' },
  writeoff: { label: 'Hisobdan chiqarish', tone: 'red' },
};

export default function Warehouse(_: { arg: string | null }) {
  const products = useLoad<{ products: Product[] }>('/api/admin/products');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | ''>('');
  const moves = useLoad<{ moves: Move[] }>(`/api/admin/stock/moves${sel ? `?productId=${sel}` : ''}`);
  const [form, setForm] = useState<Product | null>(null);
  const edit = useCan()('stock', 2);
  const list = (products.data?.products ?? []).filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  const totalUnits = list.reduce((a, p) => a + Math.max(0, p.stock), 0);
  const low = list.filter(p => p.stock <= p.lowStock).length;

  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Sklad</h1>
          <div className="muted small" style={{ marginTop: 4 }}>Buyurtma "Yetkazildi" bo'lganda qoldiq avtomatik kamayadi</div>
        </div>
        <div className="actions" style={{ minWidth: 'min(260px, 100%)' }}><Search value={q} onChange={setQ} placeholder="Tovar nomi" /></div>
      </div>

      <div className="grid g3">
        <div className="card stat"><div className="k">Tovar turlari</div><div className="v num">{list.length}</div></div>
        <div className="card stat"><div className="k">Jami qoldiq</div><div className="v num">{totalUnits} ta</div></div>
        <div className="card stat"><div className="k">Kam qolgan</div><div className="v num" style={{ color: low ? '#b2600c' : undefined }}>{low}</div></div>
      </div>

      <div className="card flat">
        {!products.data ? <div className="empty">Yuklanmoqda…</div> : (
          <>
            <table className="table m-collapse">
              <thead><tr><th>Tovar</th><th>Qoldiq</th><th>Daraja</th><th></th></tr></thead>
              <tbody>
                {list.map(p => {
                  const pct = Math.min(100, (Math.max(0, p.stock) / Math.max(p.lowStock * 3, 1)) * 100);
                  return (
                    <tr key={p.id} onClick={() => setSel(p.id)} style={sel === p.id ? { background: 'rgba(21,112,59,.06)' } : undefined}>
                      <td><div className="row"><Thumb src={p.images[0]} name={p.short || p.name} tint={p.tint} /><div><div style={{ fontWeight: 700 }}>{p.name}</div><div className="muted small">{p.category}</div></div></div></td>
                      <td><span className={`badge ${p.stock <= 0 ? 't-red' : p.stock <= p.lowStock ? 't-amber' : 't-green'}`}>{p.stock} ta</span></td>
                      <td style={{ width: 180 }}><div className="bar"><i style={{ width: `${pct}%`, background: p.stock <= p.lowStock ? 'linear-gradient(90deg,#ff6b5e,#f2a24a)' : undefined }} /></div><div className="muted small" style={{ marginTop: 4 }}>chegara: {p.lowStock}</div></td>
                      <td className="r">{edit ? <MetalButton lite size="sm" icon={<Icon name="plus" size={15} />} onClick={e => { e.stopPropagation(); setForm(p); }}>Kirim / chiqim</MetalButton> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="list">
              {list.map(p => (
                <div key={p.id} className="item row between">
                  <div className="row" onClick={() => setSel(p.id)}><Thumb src={p.images[0]} name={p.short || p.name} tint={p.tint} /><div><div style={{ fontWeight: 700 }}>{p.name}</div><span className={`badge ${p.stock <= 0 ? 't-red' : p.stock <= p.lowStock ? 't-amber' : 't-green'}`}>{p.stock} ta</span></div></div>
                  {edit ? <MetalButton lite size="sm" onClick={() => setForm(p)}><Icon name="plus" size={15} /></MetalButton> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 10 }}>
          <h2>Harakatlar tarixi</h2>
          <select className="select" style={{ width: 'auto', maxWidth: '100%' }} value={sel} onChange={e => setSel(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Barcha tovarlar</option>
            {(products.data?.products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {!moves.data ? <div className="muted">Yuklanmoqda…</div> : !moves.data.moves.length ? <Empty title="Hali harakat yo'q" text="Skladga tovar kelganda “Kirim / chiqim” orqali yozing." /> : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Vaqt</th><th>Tovar</th><th>Turi</th><th className="r">Miqdor</th><th>Izoh</th></tr></thead>
              <tbody>
                {moves.data.moves.map(m => (
                  <tr key={m.id} style={{ cursor: 'default' }}>
                    <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{when(m.createdAt)}</td>
                    <td>{m.product}</td>
                    <td><span className={`badge t-${KIND[m.kind]?.tone ?? 'gray'}`}>{KIND[m.kind]?.label ?? m.kind}</span></td>
                    <td className="r num" style={{ fontWeight: 800, color: m.qty > 0 ? 'var(--ok)' : 'var(--sale)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                    <td className="muted small">{m.orderNo ? <a href={`#orders`}>№ {m.orderNo}</a> : null} {m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form ? <MoveForm p={form} onClose={() => setForm(null)} onDone={() => { setForm(null); products.reload(); moves.reload(); }} /> : null}
    </div>
  );
}

function MoveForm({ p, onClose, onDone }: { p: Product; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<'in' | 'writeoff' | 'adjust'>('in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Math.round(Number(qty));
  const after = kind === 'in' ? p.stock + Math.abs(n || 0) : kind === 'writeoff' ? p.stock - Math.abs(n || 0) : p.stock + (n || 0);
  const submit = async () => {
    if (!n) return toast('Miqdorni yozing');
    setBusy(true);
    try { await post('/api/admin/stock', { productId: p.id, kind, qty: n, note }); toast('Saqlandi'); onDone(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Drawer title={p.name} onClose={onClose} footer={<><MetalButton tone="emerald" disabled={busy} onClick={submit}>Saqlash</MetalButton><MetalButton tone="ghost" onClick={onClose}>Bekor</MetalButton></>}>
      <div className="card stack">
        <div className="chips">
          {([['in', 'Kirim (tovar keldi)'], ['writeoff', 'Hisobdan chiqarish'], ['adjust', "Qoldiqni to'g'rilash (±)"]] as const).map(([k, l]) => (
            <button key={k} className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        <Field label={kind === 'adjust' ? 'Farq (+ yoki −)' : 'Miqdor, dona'}>
          <input className="input num" inputMode="numeric" autoFocus value={qty} onChange={e => setQty(e.target.value)} placeholder={kind === 'adjust' ? '-2' : '24'} />
        </Field>
        <Field label="Izoh"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'in' ? 'Masalan: 13-oktabr partiyasi' : kind === 'writeoff' ? 'Masalan: singan shisha' : 'Masalan: inventarizatsiya'} /></Field>
        <div className="row between" style={{ padding: 14, borderRadius: 14, background: 'var(--brand-soft)', border: '1px solid rgba(47,191,122,.25)' }}>
          <span>Hozir: <b>{p.stock}</b> ta</span><Icon name="arrow" size={16} /><span>Keyin: <b style={{ color: after < 0 ? 'var(--sale)' : undefined }}>{after}</b> ta</span>
        </div>
      </div>
    </Drawer>
  );
}
