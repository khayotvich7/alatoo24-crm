import { useEffect, useRef, useState } from 'react';
import { MetalButton } from '@/components/ui/metal-button';
import { money, post, STATUS, type Status, when } from '../api';
import { Empty, Icon, useLoad, useToast } from '../ui';

type Thread = { id: number; name: string; phone: string; lastText: string; updatedAt: string; unread: number; count: number };
type Msg = { id: number; role: 'user' | 'ai' | 'admin'; text: string; created_at: string };
type Detail = {
  thread: { id: number; name: string; phone: string; createdAt: string };
  orders: { no: number; status: Status; total: number; created_at: string; consult: string; items: string | null }[];
  messages: Msg[];
};

const WHO = { user: 'Mijoz', ai: 'AI yordamchi', admin: 'Operator' } as const;

/** Support chats from the app: the AI answers first, operators read along and can reply. */
export default function Chats({ arg }: { arg: string | null }) {
  const list = useLoad<{ threads: Thread[]; aiEnabled: boolean; unread: number }>('/api/admin/support');
  const openId = arg ? Number(arg) : null;
  useEffect(() => { const t = setInterval(list.reload, 10_000); return () => clearInterval(t); }, [list.reload]);
  const threads = list.data?.threads ?? [];

  return (
    <div className="stack">
      <div className="head">
        <h1>Chatlar</h1>
        <div className="actions">
          {list.data ? (
            list.data.aiEnabled
              ? <span className="badge t-green">AI yordamchi ulangan</span>
              : <span className="badge t-amber" title="Railway → Variables → ANTHROPIC_API_KEY">AI kaliti qo'shilmagan · tayyor javoblar ishlayapti</span>
          ) : null}
        </div>
      </div>

      <div className={`chats ${openId ? 'has-open' : ''}`}>
        <div className="card flat chat-list">
          {list.error ? <Empty title="Yuklab bo'lmadi" text={list.error} /> : !list.data ? <div className="empty">Yuklanmoqda…</div> : !threads.length ? (
            <Empty title="Hali chat yo'q" text="Mijoz ilovada «Yordam chat»ga yozganda suhbat shu yerda paydo bo'ladi." />
          ) : threads.map(t => (
            <a key={t.id} href={`#chats/${t.id}`} className={`chat-item ${t.id === openId ? 'on' : ''}`}>
              <div className="row between">
                <b>{t.name || 'Mijoz'}{t.unread ? <span className="dot-new" aria-label="yangi" /> : null}</b>
                <span className="muted small">{when(t.updatedAt)}</span>
              </div>
              <div className="muted small clip">{t.lastText}</div>
            </a>
          ))}
        </div>
        {openId ? <Conversation key={openId} id={openId} onChange={list.reload} /> : (
          <div className="card chat-empty"><Empty title="Suhbatni tanlang" text="Chap tomondagi ro'yxatdan mijozni tanlang." /></div>
        )}
      </div>
    </div>
  );
}

function Conversation({ id, onChange }: { id: number; onChange: () => void }) {
  const { data, error, reload } = useLoad<Detail>(`/api/admin/support/${id}`);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(reload, 6_000); return () => clearInterval(t); }, [reload]);
  useEffect(() => { onChange(); }, [data?.thread.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data?.messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await post(`/api/admin/support/${id}/reply`, { text }); setText(''); reload(); onChange(); toast('Javob yuborildi'); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  if (error) return <div className="card"><Empty title="Yuklab bo'lmadi" text={error} /></div>;
  if (!data) return <div className="card"><div className="empty">Yuklanmoqda…</div></div>;
  const t = data.thread;
  return (
    <div className="card chat-open">
      <div className="row between chat-top">
        <div>
          <a href="#chats" className="back-link">‹ Ro'yxat</a>
          <h3 style={{ margin: 0 }}>{t.name || 'Mijoz'}</h3>
          {t.phone ? <a className="muted small" href={`tel:+998${t.phone}`}><Icon name="phone" size={13} /> +998 {t.phone}</a> : <span className="muted small">Telefon noma'lum</span>}
        </div>
        <div className="chat-orders">
          {data.orders.slice(0, 3).map(o => (
            <a key={o.no} href={`#orders`} className="small" title={o.items ?? ''}>
              № {o.no} · <span className={`badge t-${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span> · {money(o.total)}
            </a>
          ))}
        </div>
      </div>

      <div className="chat-msgs">
        {data.messages.map(m => (
          <div key={m.id} className={`bub ${m.role}`}>
            <div className="who">{WHO[m.role]} · {when(m.created_at)}</div>
            <div className="tx">{m.text}</div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="chat-reply">
        <textarea className="textarea" rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Operator javobi… (javob berganingizdan keyin 30 daqiqa AI jim turadi)"
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
        <MetalButton tone="emerald" disabled={busy || !text.trim()} onClick={send}>Yuborish</MetalButton>
      </div>
    </div>
  );
}
