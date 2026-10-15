import { Pencil, Plus, Save, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MetalButton } from '@/components/ui/metal-button';
import { type Area, AREA_LABEL, del, patch, type Perms, post, type Staff } from '../api';
import { Confirm, Drawer, Empty, Field, Icon, useLoad, useToast } from '../ui';

const AREAS: Area[] = ['orders', 'products', 'stock', 'customers'];
const LEVELS = [{ v: 0, label: "Yo'q" }, { v: 1, label: "Ko'rish" }, { v: 2, label: "To'liq" }];
const LEVEL_TEXT = ['yopiq', "faqat ko'rish", "to'liq"];

// What each area's "full" access lets a person do, shown under the switch.
const HINT: Record<Area, string> = {
  orders: "To'liq: holatini o'zgartiradi (tekshiruv, tasdiq, dastavka, yetkazildi), izoh yozadi",
  products: "To'liq: tovar qo'shadi, tahrirlaydi, o'chiradi, rasm yuklaydi",
  stock: "To'liq: kirim, chiqim va qoldiqni to'g'rilaydi",
  customers: "Mijozlar ro'yxati va ularning buyurtmalari",
};

const PRESETS: { label: string; perms: Perms }[] = [
  { label: "Faqat ko'rib chiqish", perms: { orders: 1, products: 1, stock: 1, customers: 1 } },
  { label: 'Operator', perms: { orders: 2, products: 1, stock: 1, customers: 1 } },
  { label: 'Tekshiruvchi', perms: { orders: 2, products: 1, stock: 0, customers: 1 } },
  { label: 'Omborchi', perms: { orders: 1, products: 1, stock: 2, customers: 0 } },
];

export default function Settings(_: { arg: string | null }) {
  const { data, error, reload } = useLoad<{ staff: Staff[] }>('/api/admin/staff');
  const [form, setForm] = useState<Staff | 'new' | null>(null);
  const [rm, setRm] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const toggle = async (s: Staff) => {
    try { await patch(`/api/admin/staff/${s.id}`, { active: !s.active }); toast(s.active ? 'Bloklandi — endi kira olmaydi' : 'Faollashtirildi'); reload(); }
    catch (e) { toast((e as Error).message); }
  };
  const remove = async () => {
    if (!rm) return;
    setBusy(true);
    try { await del(`/api/admin/staff/${rm.id}`); toast("Xodim o'chirildi"); setRm(null); reload(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Sozlamalar</h1>
          <div className="muted small" style={{ marginTop: 6 }}>Xodimlar va ularning ruxsatlari. Moliya, Analitika va Sozlamalar faqat sizga ko'rinadi.</div>
        </div>
        <div className="actions"><MetalButton tone="emerald" icon={<UserPlus size={17} />} onClick={() => setForm('new')}>Xodim qo'shish</MetalButton></div>
      </div>

      {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !data ? <div className="muted">Yuklanmoqda…</div> : !data.staff.length ? (
        <div className="card"><Empty title="Hali xodim yo'q" text="Xodim qo'shing: ismi, telefoni, login va parolini kiriting, keyin nimalarni ko'ra olishini belgilang.">
          <MetalButton tone="emerald" icon={<Plus size={16} />} onClick={() => setForm('new')}>Birinchi xodimni qo'shish</MetalButton>
        </Empty></div>
      ) : (
        <div className="grid g3">
          {data.staff.map(s => (
            <div key={s.id} className="card staff-card" style={s.active ? undefined : { opacity: 0.6 }}>
              <div className="row between">
                <div className="row" style={{ gap: 12 }}>
                  <span className="avatar">{s.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <div style={{ fontWeight: 800 }}>{s.name}</div>
                    <div className="muted small">@{s.login}{s.phone ? ` · ${s.phone}` : ''}</div>
                  </div>
                </div>
                <button className={`switch${s.active ? ' on' : ''}`} title={s.active ? 'Bloklash' : 'Faollashtirish'} aria-label={s.active ? 'Bloklash' : 'Faollashtirish'} onClick={() => toggle(s)} />
              </div>
              <div className="perms">
                {AREAS.map(a => <span key={a} className={`badge ${s.perms[a] === 2 ? 't-green' : s.perms[a] === 1 ? 't-gold' : 't-gray'}`}>{AREA_LABEL[a]}: {LEVEL_TEXT[s.perms[a]]}</span>)}
              </div>
              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                <MetalButton lite size="sm" block icon={<Pencil size={14} />} onClick={() => setForm(s)}>Tahrirlash</MetalButton>
                <button className="del-btn" title="O'chirish" aria-label={`${s.name} — o'chirish`} onClick={() => setRm(s)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Buyurtma holatlari</h2>
        <div className="muted small" style={{ lineHeight: 1.7 }}>
          Yangi → <b className="gold">Tekshiruvda</b> (tekshiruvchi qo'ng'iroq qilib tekshiradi) → Tasdiqlandi → <b style={{ color: '#5fe0d6' }}>Dastavkaga</b> (kuryerga berilgan, yetkazilmoqda) → Yetkazildi.
          Xodim holatni o'zgartirsa, buyurtma tarixida uning ismi yoziladi.
        </div>
      </div>

      <Cleanup />

      {form ? <StaffForm staff={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} /> : null}
      {rm ? (
        <Confirm title="Xodimni o'chirasizmi?" text={<><b style={{ color: 'var(--ink)' }}>{rm.name}</b> endi CRMga kira olmaydi. Vaqtincha to'xtatish uchun o'chirish o'rniga bloklash tugmasidan foydalaning.</>}
          busy={busy} onOk={remove} onCancel={() => setRm(null)} />
      ) : null}
    </div>
  );
}

function StaffForm({ staff: s, onClose, onSaved }: { staff: Staff | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(s?.name ?? '');
  const [phone, setPhone] = useState(s?.phone ?? '');
  const [login, setLogin] = useState(s?.login ?? '');
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState<Perms>(s?.perms ?? PRESETS[0].perms);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setBusy(true);
    try {
      const body = { name, phone, login, perms, ...(password ? { password } : {}) };
      if (s) await patch(`/api/admin/staff/${s.id}`, body); else await post('/api/admin/staff', body);
      toast(s ? 'Saqlandi' : "Xodim qo'shildi");
      onSaved();
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Drawer title={s ? 'Xodimni tahrirlash' : 'Yangi xodim'} onClose={onClose} footer={<>
      <MetalButton tone="emerald" disabled={busy} icon={<Save size={16} />} onClick={save}>{busy ? 'Saqlanmoqda…' : s ? 'Saqlash' : "Qo'shish"}</MetalButton>
      <MetalButton tone="ghost" icon={<X size={16} />} onClick={onClose}>Bekor</MetalButton>
    </>}>
      <div className="card stack">
        <h3>Ma'lumotlar</h3>
        <div className="grid g2">
          <Field label="Ismi *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Aziz Karimov" /></Field>
          <Field label="Telefon raqami"><input className="input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+998 90 123 45 67" /></Field>
          <Field label="Login *"><input className="input" autoCapitalize="none" spellCheck={false} value={login} onChange={e => setLogin(e.target.value.toLowerCase())} placeholder="aziz" /></Field>
          <Field label={s ? "Yangi parol (o'zgartirmasangiz bo'sh qoldiring)" : 'Parol * (kamida 6 belgi)'}>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder={s ? 'Yangi parol' : 'Kamida 6 belgi'} />
          </Field>
        </div>
        <div className="muted small">Xodim CRMga shu login va parol bilan kiradi. Parolni o'zgartirsangiz, u barcha qurilmalardan chiqib ketadi.</div>
      </div>

      <div className="card stack">
        <div className="row between wrap">
          <h3>Nimalar qila oladi</h3>
        </div>
        <div className="chips">
          {PRESETS.map(p => (
            <button key={p.label} type="button" className={`chip${JSON.stringify(p.perms) === JSON.stringify(perms) ? ' on' : ''}`} onClick={() => setPerms(p.perms)}>{p.label}</button>
          ))}
        </div>
        <div>
          {AREAS.map(a => (
            <div key={a} className="perm-row">
              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                <div style={{ fontWeight: 800 }}>{AREA_LABEL[a]}</div>
                <div className="muted small">{HINT[a]}</div>
              </div>
              <div className="seg">
                {LEVELS.filter(l => a !== 'customers' || l.v < 2).map(l => (
                  <button key={l.v} type="button" className={`${perms[a] === l.v ? 'on' : ''}${l.v === 0 ? ' none' : ''}`} onClick={() => setPerms(p => ({ ...p, [a]: l.v }))}>{l.label}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="perm-row">
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
              <div style={{ fontWeight: 800 }}>Moliya, Analitika, Sozlamalar</div>
              <div className="muted small">Pul summalari, foyda, xarajatlar va tannarx — faqat siz uchun</div>
            </div>
            <span className="badge t-gray"><Icon name="shield" size={12} /> Faqat rahbar</span>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

type Counts = { orders: number; customers: number; expenses: number };

/** Danger zone: wipe orders / customers / expenses (e.g. test data). Needs the word TOZALASH typed in. */
function Cleanup() {
  const { data, reload } = useLoad<Counts>('/api/admin/cleanup');
  const [pick, setPick] = useState({ orders: false, customers: false, expenses: false, restock: false });
  const [ask, setAsk] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k: keyof typeof pick, v: boolean) => setPick(p => {
    const n = { ...p, [k]: v };
    if (k === 'customers' && v) n.orders = true;          // customers are removed together with their orders
    if (k === 'orders' && !v) { n.customers = false; n.restock = false; }
    return n;
  });
  const any = pick.orders || pick.customers || pick.expenses;
  const items = [
    pick.orders && `${data?.orders ?? 0} ta buyurtma`,
    pick.customers && `${data?.customers ?? 0} ta mijoz`,
    pick.expenses && `${data?.expenses ?? 0} ta xarajat`,
  ].filter(Boolean).join(', ');

  const run = async () => {
    setBusy(true);
    try {
      const r = await post<{ deleted: Counts }>('/api/admin/cleanup', { ...pick, confirm: word });
      toast(`O'chirildi: ${r.deleted.orders} buyurtma, ${r.deleted.customers} mijoz, ${r.deleted.expenses} xarajat`);
      setAsk(false); setWord(''); setPick({ orders: false, customers: false, expenses: false, restock: false }); reload();
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  const Row = ({ k, title, text, n }: { k: keyof typeof pick; title: string; text: string; n?: number }) => (
    <label className="perm-row" style={{ cursor: 'pointer' }}>
      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
        <div style={{ fontWeight: 800 }}>{title}{n !== undefined ? <span className="muted" style={{ fontWeight: 600 }}> · {n} ta</span> : null}</div>
        <div className="muted small">{text}</div>
      </div>
      <input type="checkbox" className="check" checked={pick[k]} onChange={e => set(k, e.target.checked)} />
    </label>
  );

  return (
    <div className="card danger-zone">
      <div className="row" style={{ gap: 10, marginBottom: 4 }}>
        <span className="confirm-ic" style={{ width: 36, height: 36, margin: 0 }}><Icon name="trash" size={17} /></span>
        <div>
          <h2>Ma'lumotlarni tozalash</h2>
          <div className="muted small">Masalan, sinov buyurtmalarini o'chirish uchun. O'chirilgan ma'lumotni qaytarib bo'lmaydi.</div>
        </div>
      </div>
      <Row k="orders" title="Buyurtmalar" text="Barcha buyurtmalar, ularning tovarlari va tarixi" n={data?.orders} />
      {pick.orders ? <Row k="restock" title="Tovarlarni skladga qaytarish" text="Yetkazilgan buyurtmalardagi tovarlar sklad qoldig'iga qo'shiladi (sinov buyurtmalari uchun)" /> : null}
      <Row k="customers" title="Mijozlar" text="Mijozlar ro'yxati (buyurtmalar bilan birga o'chadi)" n={data?.customers} />
      <Row k="expenses" title="Xarajatlar" text="Moliya bo'limidagi kiritilgan xarajatlar" n={data?.expenses} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="confirm-btn danger" disabled={!any} onClick={() => setAsk(true)}>Tanlanganlarni o'chirish</button>
      </div>

      {ask ? createPortal(
        <>
          <div className="overlay" style={{ zIndex: 60 }} onClick={() => !busy && setAsk(false)} />
          <div className="confirm card" role="alertdialog" aria-modal>
            <div className="confirm-ic"><Icon name="alert" size={22} /></div>
            <h2>Rostdan o'chirasizmi?</h2>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.55, fontSize: 14 }}>
              <b style={{ color: 'var(--ink)' }}>{items}</b> butunlay o'chiriladi va qaytarib bo'lmaydi. Tasdiqlash uchun pastga <b className="gold">TOZALASH</b> deb yozing.
            </div>
            <input className="input" style={{ marginTop: 14 }} autoFocus value={word} onChange={e => setWord(e.target.value)} placeholder="TOZALASH" />
            <div className="row" style={{ marginTop: 18, gap: 10, justifyContent: 'flex-end' }}>
              <button className="confirm-btn ghost" disabled={busy} onClick={() => { setAsk(false); setWord(''); }}>Bekor qilish</button>
              <button className="confirm-btn danger" disabled={busy || word.trim().toUpperCase() !== 'TOZALASH'} onClick={run}>{busy ? "O'chirilmoqda…" : "O'chirish"}</button>
            </div>
          </div>
        </>, document.body) : null}
    </div>
  );
}
