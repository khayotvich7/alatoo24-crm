import { useEffect, useState } from 'react';
import { MetalButton } from '@/components/ui/metal-button';
import { api, patch, post, when } from '../api';
import { Empty, Field, useLoad, useToast } from '../ui';

type Settings = { cashback_pct: number; max_points_pct: number; referral_friend_pct: number; referral_bonus_pct: number; bottle_days: number; remind_before: number };
type Promo = { id: number; code: string; percent: number; firstOrderOnly: number; active: number; endsAt: string | null; title: string; uses: number };
type Banner = { id: number; title: string; subtitle: string; image: string; cta: string; productId: number | null; endsAt: string | null; active: number; sort: number };
type Product = { id: number; name: string };

const SETTINGS: [keyof Settings, string, string][] = [
  ['cashback_pct', 'Keshbek, %', 'Yetkazilgan buyurtmadan mijozga qaytadigan ball (1 ball = 1 so\'m)'],
  ['max_points_pct', 'Ball bilan to\'lash chegarasi, %', 'Buyurtmaning ko\'pi bilan shuncha qismi ball bilan to\'lanadi'],
  ['referral_friend_pct', "Do'stga chegirma, %", "Taklif kodi bilan birinchi buyurtmaga"],
  ['referral_bonus_pct', 'Taklif qilganga bonus, %', "Do'sti buyurtmasi yetkazilganda uning summasidan"],
  ['bottle_days', '1 shisha necha kunga yetadi', '"Siropingiz tugayaptimi?" eslatmasi uchun'],
  ['remind_before', 'Necha kun oldin eslatish', 'Tugashidan shuncha kun oldin xabar boradi'],
];

/** Marketing: tunable numbers, promo codes, home banners and a message to every customer's phone. */
export default function Marketing() {
  return (
    <div className="stack">
      <div className="head"><h1>Marketing</h1></div>
      <SettingsCard />
      <Promos />
      <Banners />
      <Broadcast />
    </div>
  );
}

function SettingsCard() {
  const { data, reload } = useLoad<Settings>('/api/admin/settings');
  const [f, setF] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <div className="card"><div className="empty">Yuklanmoqda…</div></div>;
  const save = async () => {
    setBusy(true);
    try { await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(f) }); toast('Saqlandi'); reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 14px' }}>Keshbek, referal va eslatma</h3>
      <div className="grid g3">
        {SETTINGS.map(([k, label, hint]) => (
          <Field key={k} label={label}>
            <input className="input" type="number" value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value) })} />
            <span className="muted small">{hint}</span>
          </Field>
        ))}
      </div>
      <div style={{ marginTop: 12 }}><MetalButton tone="emerald" disabled={busy} onClick={save}>Saqlash</MetalButton></div>
    </div>
  );
}

function Promos() {
  const { data, reload } = useLoad<{ promos: Promo[] }>('/api/admin/promos');
  const [f, setF] = useState({ code: '', percent: 10, title: '', endsAt: '', firstOrderOnly: false });
  const toast = useToast();
  const create = async () => {
    try { await post('/api/admin/promos', f); toast("Promokod qo'shildi"); setF({ code: '', percent: 10, title: '', endsAt: '', firstOrderOnly: false }); reload(); }
    catch (e) { toast((e as Error).message); }
  };
  const toggle = async (p: Promo) => { await patch(`/api/admin/promos/${p.id}`, { active: !p.active }); reload(); };
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 14px' }}>Promokodlar</h3>
      <div className="grid g3" style={{ alignItems: 'end' }}>
        <Field label="Kod"><input className="input" value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="YOZ20" /></Field>
        <Field label="Chegirma, %"><input className="input" type="number" value={f.percent} onChange={e => setF({ ...f, percent: Number(e.target.value) })} /></Field>
        <Field label="Tugash sanasi (ixtiyoriy)"><input className="input" type="datetime-local" value={f.endsAt} onChange={e => setF({ ...f, endsAt: e.target.value })} /></Field>
        <Field label="Izoh"><input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Yozgi aksiya" /></Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={f.firstOrderOnly} onChange={e => setF({ ...f, firstOrderOnly: e.target.checked })} /> Faqat birinchi buyurtma uchun</label>
        <MetalButton tone="emerald" onClick={create}>Qo'shish</MetalButton>
      </div>
      {!data ? null : !data.promos.length ? <Empty title="Promokod yo'q" /> : (
        <table className="table" style={{ marginTop: 14 }}>
          <thead><tr><th>Kod</th><th>Chegirma</th><th>Izoh</th><th>Tugaydi</th><th className="r">Ishlatilgan</th><th></th></tr></thead>
          <tbody>
            {data.promos.map(p => (
              <tr key={p.id} style={{ cursor: 'default', opacity: p.active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 800 }}>{p.code}{p.firstOrderOnly ? <span className="badge t-violet" style={{ marginLeft: 8 }}>1-buyurtma</span> : null}</td>
                <td>−{p.percent}%</td>
                <td className="muted small">{p.title}</td>
                <td className="muted small">{p.endsAt ? when(p.endsAt) : 'Muddatsiz'}</td>
                <td className="r num">{p.uses}</td>
                <td className="r"><MetalButton lite size="sm" tone={p.active ? 'ruby' : 'emerald'} onClick={() => toggle(p)}>{p.active ? "O'chirish" : 'Yoqish'}</MetalButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Banners() {
  const { data, reload } = useLoad<{ banners: Banner[] }>('/api/admin/banners');
  const products = useLoad<{ products: Product[] }>('/api/admin/products');
  const [f, setF] = useState({ title: '', subtitle: '', image: '', cta: "Ko'rish", productId: '', endsAt: '' });
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try { const fd = new FormData(); fd.append('file', file); const { url } = await api<{ url: string }>('/api/admin/upload', { method: 'POST', body: fd }); setF(v => ({ ...v, image: url })); }
    catch (e) { toast((e as Error).message); } finally { setUploading(false); }
  };
  const create = async () => {
    try { await post('/api/admin/banners', { ...f, productId: f.productId ? Number(f.productId) : null }); toast("Banner qo'shildi"); setF({ title: '', subtitle: '', image: '', cta: "Ko'rish", productId: '', endsAt: '' }); reload(); }
    catch (e) { toast((e as Error).message); }
  };
  const toggle = async (b: Banner) => { await patch(`/api/admin/banners/${b.id}`, { active: !b.active }); reload(); };
  const remove = async (b: Banner) => { await api(`/api/admin/banners/${b.id}`, { method: 'DELETE' }); reload(); };
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 14px' }}>Bosh sahifa bannerlari</h3>
      <p className="muted small" style={{ marginTop: -6 }}>Banner bo'lmasa, ilovada standart "Birinchi buyurtmaga −15%" banneri chiqadi.</p>
      <div className="grid g3" style={{ alignItems: 'end' }}>
        <Field label="Sarlavha"><input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Yangi Alatoo siropi" /></Field>
        <Field label="Qo'shimcha matn"><input className="input" value={f.subtitle} onChange={e => setF({ ...f, subtitle: e.target.value })} placeholder="Faqat 3 kun −20%" /></Field>
        <Field label="Tugma matni"><input className="input" value={f.cta} onChange={e => setF({ ...f, cta: e.target.value })} /></Field>
        <Field label="Bosilganda ochiladigan tovar">
          <select className="select" value={f.productId} onChange={e => setF({ ...f, productId: e.target.value })}>
            <option value="">— tanlanmagan —</option>
            {(products.data?.products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Tugash vaqti (ixtiyoriy, taymer chiqadi)"><input className="input" type="datetime-local" value={f.endsAt} onChange={e => setF({ ...f, endsAt: e.target.value })} /></Field>
        <Field label="Rasm (ixtiyoriy)">
          <label className="input" style={{ cursor: 'pointer' }}>{uploading ? 'Yuklanmoqda…' : f.image ? 'Rasm tanlandi ✓' : 'Rasm tanlash'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => upload(e.target.files?.[0])} /></label>
        </Field>
      </div>
      <div style={{ marginTop: 12 }}><MetalButton tone="emerald" disabled={uploading} onClick={create}>Banner qo'shish</MetalButton></div>
      {data?.banners.length ? (
        <div className="grid g3" style={{ marginTop: 14 }}>
          {data.banners.map(b => (
            <div key={b.id} className="card flat" style={{ opacity: b.active ? 1 : 0.5 }}>
              <div style={{ height: 110, background: b.image ? `url(${b.image}) center/cover` : 'linear-gradient(135deg,#2c74ec,#0d3591)', padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <b style={{ color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>{b.title}</b>
                <span className="small" style={{ color: '#fff', opacity: 0.85 }}>{b.subtitle}</span>
              </div>
              <div className="row between" style={{ padding: 10 }}>
                <span className="muted small">{b.endsAt ? `Tugaydi: ${when(b.endsAt)}` : 'Muddatsiz'}</span>
                <div className="row" style={{ gap: 6 }}>
                  <MetalButton lite size="sm" tone="ghost" onClick={() => toggle(b)}>{b.active ? 'Yashirish' : "Ko'rsatish"}</MetalButton>
                  <MetalButton lite size="sm" tone="ruby" onClick={() => remove(b)}>O'chirish</MetalButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Broadcast() {
  const { data, reload } = useLoad<{ reach: number; broadcasts: { id: number; title: string; body: string; sent: number; createdAt: string }[] }>('/api/admin/broadcasts');
  const [f, setF] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const toast = useToast();
  const send = async () => {
    setBusy(true);
    try { const r = await post<{ sent: number; total: number }>('/api/admin/broadcast', f); toast(`Yuborildi: ${r.sent} ta telefon`); setF({ title: '', body: '' }); setSure(false); reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 14px' }}>Hamma mijozlarga xabar</h3>
      <p className="muted small" style={{ marginTop: -6 }}>Xabar bildirishnomaga ruxsat bergan {data?.reach ?? '…'} ta telefonga boradi.</p>
      <div className="grid g2">
        <Field label="Sarlavha"><input className="input" maxLength={60} value={f.title} onChange={e => { setF({ ...f, title: e.target.value }); setSure(false); }} placeholder="Bugun −20% 🎉" /></Field>
        <Field label="Matn"><input className="input" maxLength={180} value={f.body} onChange={e => { setF({ ...f, body: e.target.value }); setSure(false); }} placeholder="Alatoo siropiga faqat bugun chegirma" /></Field>
      </div>
      <div className="row" style={{ marginTop: 12, gap: 10 }}>
        {!sure ? (
          <MetalButton tone="emerald" disabled={!f.title.trim() || !f.body.trim()} onClick={() => setSure(true)}>Yuborish</MetalButton>
        ) : (
          <>
            <span className="small">Rostdan ham {data?.reach ?? 0} ta telefonga yuborilsinmi?</span>
            <MetalButton tone="emerald" disabled={busy} onClick={send}>{busy ? 'Yuborilmoqda…' : 'Ha, yuborish'}</MetalButton>
            <MetalButton tone="ghost" onClick={() => setSure(false)}>Bekor</MetalButton>
          </>
        )}
      </div>
      {data?.broadcasts.length ? (
        <table className="table" style={{ marginTop: 14 }}>
          <thead><tr><th>Sana</th><th>Sarlavha</th><th>Matn</th><th className="r">Yuborildi</th></tr></thead>
          <tbody>{data.broadcasts.map(b => <tr key={b.id} style={{ cursor: 'default' }}><td className="muted small">{when(b.createdAt)}</td><td style={{ fontWeight: 700 }}>{b.title}</td><td className="small">{b.body}</td><td className="r num">{b.sent}</td></tr>)}</tbody>
        </table>
      ) : null}
    </div>
  );
}
