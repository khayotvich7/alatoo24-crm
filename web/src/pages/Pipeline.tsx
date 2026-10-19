import { useState } from 'react';
import { patch, short, when } from '../api';
import { Empty, useLive, useLoad, useMe, useToast } from '../ui';
import './pipeline.css';

type Stage = 'first' | 'refill' | 'repeat' | 'loyal' | 'lost';
type Card = {
  id: number; name: string; phone: string; stage: Stage; auto: Stage; manual: boolean; hint: Stage | null;
  movedBy: string | null; movedAt: string | null; orders: number; delivered: number; pending: number; spent: number;
  lastOrder: string | null; runsOut: string | null; daysLeft: number | null; lastItems: string;
};
type Cart = { key: string; customerId: number | null; name: string; phone: string; items: { name: string; qty: number }[]; total: number; updatedAt: string };
type Data = { customers: Card[]; carts: Cart[]; bottleDays: number };

export const STAGE: Record<Stage, { label: string; icon: string; tone: string; help: string }> = {
  first: { label: 'Birinchi xarid', icon: '🆕', tone: 'blue', help: '1 marta sotib olgan yoki buyurtmasi yo‘lda' },
  refill: { label: 'Tugash arafasida', icon: '⏳', tone: 'amber', help: 'Mahsuloti tugayapti — qo‘ng‘iroq qiling' },
  repeat: { label: 'Qayta xaridor', icon: '🔁', tone: 'green', help: '2 va undan ko‘p marta olgan' },
  loyal: { label: 'Doimiy mijoz', icon: '⭐', tone: 'gold', help: 'Faqat rahbar o‘tkazadi' },
  lost: { label: "Yo'qolgan", icon: '💤', tone: 'gray', help: '60 kundan beri xarid yo‘q' },
};
const ORDER: Stage[] = ['first', 'refill', 'repeat', 'loyal', 'lost'];

export default function Pipeline({ q }: { q: string }) {
  const { data, error, reload } = useLoad<Data>('/api/admin/pipeline');
  useLive(reload);
  const owner = useMe().role === 'owner';
  const toast = useToast();
  const [over, setOver] = useState<Stage | null>(null);
  const [moved, setMoved] = useState<Record<number, Stage | 'auto'>>({});

  if (error) return <Empty title="Yuklab bo'lmadi" text={error} />;
  if (!data) return <div className="muted">Yuklanmoqda…</div>;

  const t = q.trim().toLowerCase(), d = t.replace(/\D/g, '');
  const match = (name: string, phone: string) => !t || name.toLowerCase().includes(t) || (!!d && phone.replace(/\D/g, '').includes(d));
  const cards = data.customers
    .map(c => { const m = moved[c.id]; return m ? { ...c, stage: m === 'auto' ? c.auto : m, manual: m !== 'auto', hint: null } : c; })
    .filter(c => match(c.name, c.phone));
  const carts = data.carts.filter(c => match(c.name, c.phone));

  const move = async (id: number, stage: Stage | 'auto') => {
    setMoved(m => ({ ...m, [id]: stage }));
    try { await patch(`/api/admin/pipeline/${id}`, { stage }); reload(); }
    catch (e) { toast((e as Error).message); setMoved(m => { const n = { ...m }; delete n[id]; return n; }); }
  };
  const drop = (stage: Stage) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (id && owner) void move(id, stage);
  };

  return (
    <div className="pipe-wrap">
      {!owner ? <div className="readonly-note">Bosqichlarni faqat rahbar o'zgartiradi. Siz ko'rishingiz mumkin.</div> : null}
      <div className="pipe">
        <section className="pipe-col">
          <header className="pipe-head t-violet"><span>🛒 Savatda</span><b className="num">{carts.length}</b></header>
          <div className="pipe-help muted small">Savatga qo'shgan, lekin buyurtma bermagan</div>
          <div className="pipe-list">
            {!carts.length ? <div className="pipe-empty muted small">Hozircha yo'q. Ilova savatni CRMga yuborganda shu yerda chiqadi.</div> : carts.map(c => (
              <div key={c.key} className="pipe-card" onClick={c.customerId ? () => { location.hash = `customers/${c.customerId}`; } : undefined}>
                <div className="row between"><b>{c.name || 'Noma’lum mijoz'}</b><b className="num gold">{short(c.total)}</b></div>
                {c.phone ? <a className="small" href={`tel:+998${c.phone.replace(/\D/g, '')}`} onClick={e => e.stopPropagation()}>+998 {c.phone}</a> : <div className="muted small">telefon hali yo'q</div>}
                <div className="muted small pipe-items">{c.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</div>
                <div className="muted small">{when(c.updatedAt)}</div>
              </div>
            ))}
          </div>
        </section>

        {ORDER.map(s => {
          const list = cards.filter(c => c.stage === s);
          return (
            <section key={s} className={`pipe-col${over === s ? ' over' : ''}`}
              onDragOver={owner ? e => { e.preventDefault(); setOver(s); } : undefined}
              onDragLeave={owner ? () => setOver(o => (o === s ? null : o)) : undefined}
              onDrop={owner ? drop(s) : undefined}>
              <header className={`pipe-head t-${STAGE[s].tone}`}><span>{STAGE[s].icon} {STAGE[s].label}</span><b className="num">{list.length}</b></header>
              <div className="pipe-help muted small">{STAGE[s].help}{list.length ? ` · ${short(list.reduce((a, c) => a + c.spent, 0))}` : ''}</div>
              <div className="pipe-list">
                {!list.length ? <div className="pipe-empty muted small">Bo'sh{owner ? ' — kartochkani shu yerga sudrang' : ''}</div> : list.map(c => (
                  <div key={c.id} className="pipe-card" draggable={owner}
                    onDragStart={e => { e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => { location.hash = `customers/${c.id}`; }}>
                    <div className="row between"><b>{c.name}</b><b className="num gold">{short(c.spent)}</b></div>
                    <a className="small" href={`tel:+998${c.phone.replace(/\D/g, '')}`} onClick={e => e.stopPropagation()}>+998 {c.phone}</a>
                    <div className="muted small">{c.delivered} ta xarid · {c.lastOrder ? `oxirgi ${when(c.lastOrder)}` : 'buyurtma yo‘q'}</div>
                    {c.lastItems ? <div className="muted small pipe-items">{c.lastItems}</div> : null}
                    {c.daysLeft != null && c.delivered ? <div className={`small pipe-days${c.daysLeft <= 2 ? ' warn' : ''}`}>
                      {c.daysLeft > 0 ? `Mahsuloti ~${c.daysLeft} kunda tugaydi` : c.daysLeft === 0 ? 'Mahsuloti bugun tugaydi' : `Mahsuloti ${-c.daysLeft} kun oldin tugagan`}
                    </div> : null}
                    {c.pending ? <div className="small pipe-days">🚚 {c.pending} ta buyurtma yo'lda</div> : null}
                    {c.hint ? <div className="pipe-hint small">Tavsiya: {STAGE[c.hint].icon} {STAGE[c.hint].label}
                      {owner ? <button className="pipe-mini" onClick={e => { e.stopPropagation(); void move(c.id, c.hint!); }}>O'tkazish</button> : null}</div> : null}
                    {owner ? (
                      <div className="pipe-foot" onClick={e => e.stopPropagation()}>
                        <select className="pipe-select" value={c.stage} onChange={e => void move(c.id, e.target.value as Stage)} aria-label="Bosqich">
                          {ORDER.map(o => <option key={o} value={o}>{STAGE[o].icon} {STAGE[o].label}</option>)}
                        </select>
                        {c.manual ? <button className="pipe-mini" title="Bosqichni yana avtomatik hisoblashga qaytarish" onClick={() => void move(c.id, 'auto')}>Avto</button> : <span className="muted small">avto</span>}
                      </div>
                    ) : c.manual && c.movedBy ? <div className="muted small">{c.movedBy} o'tkazgan</div> : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div className="muted small" style={{ marginTop: 10 }}>
        1 shisha ≈ {data.bottleDays} kun (Marketing → sozlamalar). Rahbar sudrab yoki ro'yxatdan tanlab o'tkazgan mijoz shu bosqichda qoladi; "Avto" uni yana avtomatik hisoblashga qaytaradi.
      </div>
    </div>
  );
}
