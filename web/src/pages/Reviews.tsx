import { useState } from 'react';
import { patch, when } from '../api';
import { Empty, useCan, useLive, useLoad, useToast } from '../ui';

type Review = {
  id: number; orderId: number; orderNo: number; customerId: number; fullName: string; phone: string;
  rating: number; text: string; hidden: number; createdAt: string; products: string | null;
};
type Data = { reviews: Review[]; avg: number; count: number; dist: Record<string, number>; delivered: number };

const FILTERS = [['all', 'Hammasi'], ['low', '1–3 yulduz'], ['hidden', 'Yashirilgan']] as const;
const stars = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

/** Ratings customers leave after delivery; low ones are worth a call, abusive ones can be hidden. */
export default function Reviews() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const { data, error, reload } = useLoad<Data>(`/api/admin/reviews${filter === 'all' ? '' : `?filter=${filter}`}`);
  useLive(reload);
  const can = useCan();
  const toast = useToast();
  const edit = can('orders', 2);
  const toggle = async (r: Review) => {
    try { await patch(`/api/admin/reviews/${r.orderId}`, { hidden: !r.hidden }); toast(r.hidden ? "Ko'rsatildi" : 'Yashirildi'); reload(); }
    catch (e) { toast((e as Error).message); }
  };
  const max = Math.max(1, ...Object.values(data?.dist ?? {}));

  return (
    <div className="stack">
      <div className="head"><h1>Sharhlar</h1></div>

      {data ? (
        <div className="grid g3">
          <div className="card">
            <div className="muted small">O'rtacha baho</div>
            <div className="row" style={{ gap: 10, alignItems: 'baseline', marginTop: 6 }}>
              <b style={{ fontFamily: 'var(--display)', fontSize: 34 }}>{data.avg || '—'}</b>
              <span className="gold" style={{ fontSize: 20, letterSpacing: 2 }}>{stars(Math.round(data.avg))}</span>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>{data.count} ta baho · {data.delivered} ta yetkazilgan buyurtmadan</div>
          </div>
          <div className="card span2">
            {[5, 4, 3, 2, 1].map(k => (
              <div key={k} className="row" style={{ gap: 10, marginBottom: 6 }}>
                <span style={{ width: 34 }} className="small">{k} ★</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ width: `${((data.dist[k] ?? 0) / max) * 100}%`, height: '100%', background: k >= 4 ? 'var(--brand)' : k === 3 ? 'var(--amber)' : 'var(--sale)' }} />
                </div>
                <span className="small muted" style={{ width: 30, textAlign: 'right' }}>{data.dist[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="chips">
        {FILTERS.map(([k, label]) => <button key={k} className={`chip${k === filter ? ' on' : ''}`} onClick={() => setFilter(k)}>{label}</button>)}
      </div>

      <div className="card flat">
        {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !data ? <div className="empty">Yuklanmoqda…</div> : !data.reviews.length ? (
          <Empty title="Hali sharh yo'q" text="Buyurtma yetkazilgach, ilova mijozdan baho so'raydi. Baholar shu yerda ko'rinadi." />
        ) : data.reviews.map(r => (
          <div key={r.orderId} style={{ padding: '14px 4px', borderBottom: '1px solid var(--line)', opacity: r.hidden ? 0.5 : 1 }}>
            <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: r.rating >= 4 ? 'var(--gold)' : r.rating === 3 ? 'var(--amber)' : 'var(--sale)', fontSize: 17, letterSpacing: 2 }}>{stars(r.rating)}</span>
                <b style={{ marginLeft: 10 }}><a href={`#customers/${r.customerId}`}>{r.fullName}</a></b>
                <span className="muted small"> · +998 {r.phone} · <a href={`#orders/${r.orderId}`}>№ {r.orderNo}</a></span>
                {r.hidden ? <span className="badge t-gray" style={{ marginLeft: 8 }}>Yashirilgan</span> : null}
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className="muted small">{when(r.createdAt)}</span>
                {edit ? <button className="chip" onClick={() => toggle(r)}>{r.hidden ? "Ko'rsatish" : 'Yashirish'}</button> : null}
              </div>
            </div>
            {r.text ? <div style={{ marginTop: 6, fontSize: 15 }}>{r.text}</div> : null}
            {r.products ? <div className="muted small" style={{ marginTop: 4 }}>{r.products}</div> : null}
            {r.rating <= 3 && !r.hidden ? <div className="small" style={{ marginTop: 6, color: 'var(--sale)' }}>Past baho — mijozga qo'ng'iroq qilib, sababini so'rang.</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
