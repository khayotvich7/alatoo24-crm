import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlowingCard } from '@/components/ui/glowing-card';
import { MetalButton } from '@/components/ui/metal-button';
import { NumberTicker } from '@/components/ui/number-ticker';
import { del, type Finance as F, money, post, short } from '../api';
import { Empty, Field, Stat, useLoad, useToast } from '../ui';

const RANGES = [7, 30, 90, 365];
const CATS = ['Reklama', 'Yetkazish', 'Ish haqi', 'Ijara', 'Tovar xaridi', 'Qadoq', 'Boshqa'];
const axis = { fill: '#8aa094', fontSize: 11 };
const grid = 'rgba(255,255,255,.06)';
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const todayStr = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const T = ({ v, f = money }: { v: number; f?: (n: number) => string }) => <NumberTicker value={v} format={f} />;

export default function Finance(_: { arg: string | null }) {
  const [days, setDays] = useState(30);
  const { data: f, error, reload } = useLoad<F>(`/api/admin/finance?days=${days}`);

  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Moliya</h1>
          <div className="muted small" style={{ marginTop: 6 }}>Faqat sizga ko'rinadi · tushum yetkazilgan (naqd olingan) buyurtmalar bo'yicha</div>
        </div>
        <div className="actions chips">
          {RANGES.map(r => <button key={r} className={`chip${r === days ? ' on' : ''}`} onClick={() => setDays(r)}>{r === 365 ? '1 yil' : `${r} kun`}</button>)}
        </div>
      </div>
      {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !f ? <div className="muted">Yuklanmoqda…</div> : <Body f={f} reload={reload} />}
    </div>
  );
}

function Body({ f, reload }: { f: F; reload: () => void }) {
  const margin = f.revenue ? Math.round((f.net / f.revenue) * 100) : 0;
  return (
    <>
      <GlowingCard>
        <div className="k">Sof foyda · {f.days === 365 ? '1 yil' : `${f.days} kun`}</div>
        <span className={`v ${f.net < 0 ? 'neg-text' : 'gold-text'}`}><T v={f.net} /></span>
        <div className="s">Tushum {money(f.revenue)} − tannarx {money(f.cogs)} − xarajatlar {money(f.expenses)}{f.revenue ? ` · rentabellik ${margin}%` : ''}</div>
      </GlowingCard>

      <h2 className="sec-title">Kassa</h2>
      <div className="grid g4">
        <Stat k="Kuryerda (yo'lda)" v={<T v={f.kassa.onTheWay.s} />} s={`${f.kassa.onTheWay.n} ta buyurtma · kuryer olib keladi`} icon="truck" />
        <Stat k="Kutilmoqda" v={<T v={f.kassa.expected.s} />} s={`${f.kassa.expected.n} ta · tasdiqlangan va dastavkaga`} icon="clock" />
        <Stat k="Bugun yig'ildi" v={<T v={f.kassa.today.s} />} s={`${f.kassa.today.n} ta yetkazildi · 7 kun: ${short(f.kassa.week.s)}`} icon="cash" />
        <Stat k="Shu oy yig'ildi" v={<T v={f.kassa.month.s} />} s={`${f.kassa.month.n} ta yetkazildi`} icon="wallet" />
      </div>

      <h2 className="sec-title">Tushum va foyda</h2>
      <div className="grid g4">
        <Stat k="Tushum" v={<T v={f.revenue} />} s={`${f.orders} ta yetkazilgan buyurtma`} icon="chart" />
        <Stat k="Tovar tannarxi" v={<T v={f.cogs} />} s={f.costCoverage < 100 ? `tannarx ${f.costCoverage}% tushum uchun kiritilgan` : 'barcha tovarlar uchun'} icon="box" />
        <Stat k="Yalpi foyda" v={<T v={f.gross} />} s="tushum − tannarx" icon="check" />
        <Stat k="Xarajatlar" v={<T v={f.expenses} />} s={f.expensesByCategory.slice(0, 2).map(c => `${c.category} ${short(c.amount)}`).join(' · ') || 'hali kiritilmagan'} icon="ban" tone="red" />
      </div>
      {f.costCoverage < 100 && f.revenue ? <div className="readonly-note">Aniq foyda uchun tovarlarga tannarx kiriting: Tovarlar → Tahrirlash → Tannarx.</div> : null}

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Kunlik tushum va xarajat</h2>
        <div style={{ height: 290 }}>
          <ResponsiveContainer>
            <ComposedChart data={f.series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="finRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#e3c98f" stopOpacity={0.45} />
                  <stop offset="1" stopColor="#e3c98f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={dm} tick={axis} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis tickFormatter={v => short(Number(v))} tick={axis} axisLine={false} tickLine={false} width={70} />
              <Tooltip contentStyle={{ background: '#0b1410', border: '1px solid rgba(227,201,143,.25)', borderRadius: 12 }} labelFormatter={l => dm(String(l))} formatter={(v, n) => [money(Number(v)), n === 'revenue' ? 'Tushum' : 'Xarajat']} />
              <Legend formatter={v => (v === 'revenue' ? 'Tushum' : 'Xarajat')} />
              <Area type="monotone" dataKey="revenue" stroke="#e3c98f" strokeWidth={2} fill="url(#finRev)" />
              <Bar dataKey="expenses" fill="#e2554a" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Expenses f={f} reload={reload} />
    </>
  );
}

function Expenses({ f, reload }: { f: F; reload: () => void }) {
  const [day, setDay] = useState(todayStr());
  const [category, setCategory] = useState(CATS[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const n = Number(amount.replace(/\D/g, ''));

  const add = async () => {
    if (!(n > 0)) { toast('Summani kiriting'); return; }
    setBusy(true);
    try { await post('/api/admin/expenses', { day, category, amount: n, note }); toast("Xarajat qo'shildi"); setAmount(''); setNote(''); reload(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!confirm("Xarajat o'chirilsinmi?")) return;
    try { await del(`/api/admin/expenses/${id}`); toast("O'chirildi"); reload(); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="grid g3">
      <div className="card stack">
        <h2>Xarajat qo'shish</h2>
        <Field label="Turi">
          <select className="select" value={category} onChange={e => setCategory(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Summa, so'm"><input className="input num" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="250 000" /></Field>
        <Field label="Sana"><input className="input" type="date" value={day} onChange={e => setDay(e.target.value)} /></Field>
        <Field label="Izoh"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Masalan: Instagram reklama" /></Field>
        <MetalButton tone="emerald" disabled={busy} icon={<Plus size={16} />} onClick={add}>{busy ? 'Saqlanmoqda…' : "Qo'shish"}</MetalButton>
      </div>

      <div className="card span2">
        <div className="row between wrap" style={{ marginBottom: 10 }}>
          <h2>Xarajatlar</h2>
          <div className="row wrap" style={{ gap: 6 }}>{f.expensesByCategory.map(c => <span key={c.category} className="badge t-gray">{c.category}: {short(c.amount)}</span>)}</div>
        </div>
        {!f.list.length ? <Empty title="Xarajat yo'q" text="Reklama, yetkazish, ish haqi kabi xarajatlarni kiriting — sof foyda avtomatik hisoblanadi." /> : (
          <div className="stack" style={{ gap: 0 }}>
            {f.list.map(e => (
              <div key={e.id} className="row between" style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{e.category}{e.note ? <span className="muted" style={{ fontWeight: 500 }}> · {e.note}</span> : null}</div>
                  <div className="muted small">{dm(e.day)}.{e.day.slice(0, 4)}</div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <b className="num" style={{ color: '#ff8b80' }}>−{money(e.amount)}</b>
                  <button className="del-btn" title="O'chirish" aria-label="O'chirish" onClick={() => remove(e.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
