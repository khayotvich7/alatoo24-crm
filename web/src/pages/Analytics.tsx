import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type Analytics as A, money, short, STATUS } from '../api';
import { Empty, Stat, useChartColors, useLoad } from '../ui';

const RANGES = [7, 30, 90, 365];
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const WD = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Shan'];
const PIE = ['#2fbf7a', '#e3c98f', '#6aa8ff', '#a68cff', '#f2a24a', '#ff6b5e', '#c9d2d4', '#3dd68c'];
const STATUS_COLOR: Record<string, string> = { new: '#6aa8ff', checking: '#e3c98f', confirmed: '#a68cff', ready: '#5fe0d6', problem: '#f2a24a', delivered: '#2fbf7a', cancelled: '#ff6b5e' };


export default function Analytics(_: { arg: string | null }) {
  const [days, setDays] = useState(30);
  const { data: a, error } = useLoad<A>(`/api/admin/analytics?days=${days}`);

  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Analitika</h1>
          <div className="muted small" style={{ marginTop: 6 }}>Savdo — yetkazilgan (naqd olingan) buyurtmalar bo'yicha</div>
        </div>
        <div className="actions chips">
          {RANGES.map(r => <button key={r} className={`chip${r === days ? ' on' : ''}`} onClick={() => setDays(r)}>{r === 365 ? '1 yil' : `${r} kun`}</button>)}
        </div>
      </div>

      {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !a ? <div className="muted">Yuklanmoqda…</div> : <Body a={a} />}
    </div>
  );
}

function Body({ a }: { a: A }) {
  const { axis, grid, tip, cursor } = useChartColors();
  const created = a.byStatus.reduce((x, s) => x + s.n, 0);
  const delivered = a.byStatus.find(s => s.status === 'delivered')?.n ?? 0;
  const conversion = created ? Math.round((delivered / created) * 100) : 0;
  const margin = a.profit.covered ? Math.round((a.profit.profit / a.profit.covered) * 100) : null;
  const weekday = WD.map((label, wd) => ({ label, ...(a.byWeekday.find(r => r.wd === wd) ?? { orders: 0, revenue: 0 }) }));
  const hours = Array.from({ length: 24 }, (_, h) => ({ h: `${h}`, orders: a.byHour.find(r => r.h === h)?.orders ?? 0 }));

  return (
    <>
      <div className="grid g4">
        <Stat k="Savdo" v={short(a.revenue)} s={money(a.revenue)} icon="cash" tone="gold" />
        <Stat k="Yetkazilgan buyurtmalar" v={a.orders} s={`${a.itemsSold} ta tovar sotildi`} icon="check" tone="green" />
        <Stat k="O'rtacha chek" v={short(a.avgCheck)} s={money(a.avgCheck)} icon="chart" tone="blue" />
        <Stat k="Yetkazilish ulushi" v={`${conversion}%`} s={`bekor: ${a.cancelRate}% · doimiy mijoz: ${a.repeatCustomers}`} icon="truck" tone="violet" />
      </div>
      <div className="grid g4">
        <Stat k="Foyda (tannarx bo'yicha)" v={margin === null ? '—' : short(a.profit.profit)} s={margin === null ? 'tovarlarga tannarx kiriting' : `ustama ${margin}% · ${short(a.profit.covered)} savdodan`} icon="cash" tone="green" />
        <Stat k="O'rtacha yetkazish" v={a.avgDeliveryHours ? `${a.avgDeliveryHours} soat` : '—'} s="buyurtmadan yetkazilguncha" icon="clock" tone="amber" />
        <Stat k="Sotilgan tovarlar" v={`${a.itemsSold} ta`} s="yetkazilgan buyurtmalarda" icon="box" tone="blue" />
        <Stat k="Buyurtmalar (jami)" v={created} s={`shu davrda yaratilgan`} icon="orders" tone="gold" />
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Kunlik savdo</h2>
        <div style={{ height: 290 }}>
          <ResponsiveContainer>
            <AreaChart data={a.series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2fbf7a" stopOpacity={0.45} />
                  <stop offset="1" stopColor="#2fbf7a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={dm} tick={axis} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis tickFormatter={v => short(Number(v))} tick={axis} axisLine={false} tickLine={false} width={58} />
              <Tooltip {...tip} formatter={v => [money(Number(v)), 'Savdo']} labelFormatter={l => dm(String(l))} />
              <Area type="monotone" dataKey="revenue" stroke="#2fbf7a" strokeWidth={2.5} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid g3">
        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Holatlar bo'yicha</h2>
          {!created ? <div className="muted">Bu davrda buyurtma yo'q</div> : (
            <>
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={a.byStatus} dataKey="n" nameKey="status" innerRadius={52} outerRadius={80} paddingAngle={3} stroke="none">
                      {a.byStatus.map(s => <Cell key={s.status} fill={STATUS_COLOR[s.status]} />)}
                    </Pie>
                    <Tooltip {...tip} formatter={(v, _n, p) => [`${v} ta`, STATUS[(p.payload as { status: keyof typeof STATUS }).status].label]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {a.byStatus.map(s => (
                <div key={s.status} className="row between small" style={{ padding: '4px 0' }}>
                  <span className="row" style={{ gap: 8 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: STATUS_COLOR[s.status] }} />{STATUS[s.status].label}</span>
                  <span className="num"><b>{s.n}</b> <span className="muted">· {short(s.s)}</span></span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Kategoriyalar ulushi</h2>
          {!a.byCategory.length ? <div className="muted">Bu davrda sotuv yo'q</div> : (
            <>
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={a.byCategory} dataKey="revenue" nameKey="category" innerRadius={52} outerRadius={80} paddingAngle={3} stroke="none">
                      {a.byCategory.map((c, i) => <Cell key={c.category} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip {...tip} formatter={(v, n) => [money(Number(v)), String(n)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {a.byCategory.map((c, i) => (
                <div key={c.category} className="row between small" style={{ padding: '4px 0' }}>
                  <span className="row" style={{ gap: 8 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: PIE[i % PIE.length] }} />{c.category}</span>
                  <span className="num"><b>{short(c.revenue)}</b> <span className="muted">· {c.qty} ta</span></span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Eng yaxshi mijozlar</h2>
          {!a.topCustomers.length ? <div className="muted">Bu davrda sotuv yo'q</div> : a.topCustomers.map((c, i) => (
            <a key={c.id} href={`#customers/${c.id}`} className="row between" style={{ padding: '9px 0', textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--line)' }}>
              <span className="row" style={{ gap: 10 }}>
                <span style={{ width: 26, height: 26, borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, background: i === 0 ? 'var(--gold-soft)' : 'var(--surface)', color: i === 0 ? 'var(--gold)' : 'var(--ink2)' }}>{i + 1}</span>
                <span style={{ fontWeight: 700 }}>{c.name}</span>
              </span>
              <span className="num"><b>{short(c.revenue)}</b> <span className="muted small">· {c.orders} ta</span></span>
            </a>
          ))}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Eng ko'p sotilgan tovarlar</h2>
          {!a.topProducts.length ? <div className="muted">Bu davrda sotuv yo'q</div> : a.topProducts.map((p, i) => (
            <div key={p.id} style={{ padding: '8px 0' }}>
              <div className="row between" style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 700 }}>{i + 1}. {p.name}</span>
                <span className="num"><b>{short(p.revenue)}</b> <span className="muted small">· {p.qty} ta</span></span>
              </div>
              <div className="bar" style={{ marginTop: 7 }}><i style={{ width: `${(p.revenue / a.topProducts[0].revenue) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Hududlar bo'yicha savdo</h2>
          {!a.byRegion.length ? <div className="muted">Bu davrda sotuv yo'q</div> : (
            <div style={{ height: Math.max(170, a.byRegion.length * 40) }}>
              <ResponsiveContainer>
                <BarChart data={a.byRegion} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="region" width={124} tick={{ fontSize: 12, fill: '#a8b8ae' }} axisLine={false} tickLine={false} />
                  <Tooltip {...tip} cursor={cursor} formatter={v => [money(Number(v)), 'Savdo']} />
                  <Bar dataKey="revenue" fill="#e3c98f" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Hafta kunlari bo'yicha buyurtmalar</h2>
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <BarChart data={weekday} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...tip} cursor={cursor} formatter={v => [Number(v), 'Buyurtma']} />
                <Bar dataKey="orders" fill="#6aa8ff" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Soatlar bo'yicha buyurtmalar</h2>
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <BarChart data={hours} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="h" tick={axis} axisLine={false} tickLine={false} interval={2} />
                <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...tip} cursor={cursor} formatter={v => [Number(v), 'Buyurtma']} labelFormatter={l => `${l}:00`} />
                <Bar dataKey="orders" fill="#a68cff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </>
  );
}
