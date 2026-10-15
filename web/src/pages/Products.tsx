import { Eye, EyeOff, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { MetalButton } from '@/components/ui/metal-button';
import { api, type Bundle, del, money, patch, post, short, type Product } from '../api';
import { Confirm, Drawer, Empty, Field, Search, Stat, useLoad, useToast } from '../ui';

const PRESETS: Record<string, Bundle[]> = {
  units: [{ label: '1 dona', mult: 1 }, { label: '2 dona', mult: 2, off: '−5%' }, { label: '3 dona', mult: 3, off: '−10%' }],
  bottles: [{ label: '1 shisha', mult: 1 }, { label: '3 shisha', mult: 3, off: '−10%' }, { label: '6 shisha', mult: 6, off: '−16%' }],
  single: [{ label: '1 dona', mult: 1 }],
};
const presetOf = (b: Bundle[]) => Object.entries(PRESETS).find(([, v]) => JSON.stringify(v) === JSON.stringify(b))?.[0] ?? 'units';

export default function Products(_: { arg: string | null }) {
  const { data, error, reload } = useLoad<{ products: Product[] }>('/api/admin/products');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<Product | null>(null);
  const [rm, setRm] = useState<Product | null>(null);
  const [rmBusy, setRmBusy] = useState(false);
  const toast = useToast();
  const cats = useMemo(() => [...new Set((data?.products ?? []).map(p => p.category).filter(Boolean))], [data]);
  const list = (data?.products ?? []).filter(p => (!cat || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()));

  const toggle = async (p: Product) => {
    try { await patch(`/api/admin/products/${p.id}`, { active: !p.active }); toast(p.active ? 'Ilovadan yashirildi' : 'Ilovada ko‘rinadi'); reload(); }
    catch (e) { toast((e as Error).message); }
  };

  const remove = async () => {
    if (!rm) return;
    setRmBusy(true);
    try { await del(`/api/admin/products/${rm.id}`); toast('Tovar o‘chirildi'); setRm(null); setEdit(null); reload(); }
    catch (e) { toast((e as Error).message); }
    finally { setRmBusy(false); }
  };

  const all = data?.products ?? [];
  const units = all.reduce((a, p) => a + Math.max(0, p.stock), 0);
  const value = all.reduce((a, p) => a + Math.max(0, p.stock) * p.price, 0);

  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Tovarlar</h1>
          <div className="muted small" style={{ marginTop: 6 }}>Tovar kartochkalari — ilovada mijoz shularni ko'radi</div>
        </div>
        <div className="actions">
          <div style={{ minWidth: 'min(260px, 100%)' }}><Search value={q} onChange={setQ} placeholder="Tovar nomi" /></div>
          <MetalButton tone="emerald" icon={<Plus size={17} />} onClick={() => { location.hash = 'create'; }}>Yangi tovar</MetalButton>
        </div>
      </div>

      <div className="grid g4">
        <Stat k="Tovar turlari" v={all.length} s={`${all.filter(p => p.active).length} tasi ilovada`} icon="box" tone="green" />
        <Stat k="Skladdagi jami" v={`${units} ta`} s="barcha tovarlar" icon="store" tone="blue" />
        <Stat k="Sklad qiymati" v={short(value)} s="sotuv narxida" icon="cash" tone="gold" />
        <Stat k="Kam qolgan" v={all.filter(p => p.stock <= p.lowStock).length} s="to'ldirish kerak" icon="alert" tone="amber" onClick={() => { location.hash = 'stock'; }} />
      </div>

      <div className="chips">
        <button className={`chip${!cat ? ' on' : ''}`} onClick={() => setCat('')}>Hammasi<b>{all.length}</b></button>
        {cats.map(c => <button key={c} className={`chip${c === cat ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>

      {error ? <Empty title="Yuklab bo'lmadi" text={error} /> : !data ? <div className="muted">Yuklanmoqda…</div> : !list.length ? <Empty title="Tovar topilmadi" /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {list.map(p => (
            <div key={p.id} className="card pcard" style={{ opacity: p.active ? 1 : 0.55 }}>
              <div className="media" onClick={() => setEdit(p)} style={{ background: p.images[0] ? p.bg : 'radial-gradient(circle at 50% 40%, #16261e, #070b09)' }}>
                {p.images[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: '46%', aspectRatio: '0.7', borderRadius: 16, background: p.tint, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--display)', fontWeight: 800 }}>{p.short || p.name.slice(0, 6)}</div>
                  </div>
                )}
                {p.tag ? <span className="badge" style={{ position: 'absolute', top: 10, left: 10, background: 'var(--sale)', color: '#fff', zIndex: 1 }}>{p.tag}</span> : null}
                {!p.active ? <span className="badge t-gray" style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>Yashirin</span> : null}
                <span className={`badge ${p.stock <= 0 ? 't-red' : p.stock <= p.lowStock ? 't-amber' : 't-green'}`} style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 1, backdropFilter: 'blur(8px)' }}>Skladda {p.stock} ta</span>
              </div>
              <div className="body">
                <div className="muted small">{p.category || 'Kategoriyasiz'}</div>
                <div style={{ fontWeight: 700, margin: '4px 0 8px', minHeight: 40 }}>{p.name}</div>
                <div className="row between">
                  <b className="num gold" style={{ fontFamily: 'var(--display)' }}>{money(p.price)}</b>
                  {p.oldPrice ? <span className="muted small" style={{ textDecoration: 'line-through' }}>{money(p.oldPrice)}</span> : null}
                </div>
                <div className="row" style={{ marginTop: 14, gap: 8 }}>
                  <MetalButton lite size="sm" block icon={<Pencil size={14} />} onClick={() => setEdit(p)}>Tahrirlash</MetalButton>
                  <MetalButton lite size="sm" tone="ghost" title={p.active ? 'Ilovadan yashirish' : "Ilovada ko'rsatish"} onClick={() => toggle(p)}>{p.active ? <EyeOff size={15} /> : <Eye size={15} />}</MetalButton>
                  <button className="del-btn" title="O'chirish" aria-label={`${p.name} — o'chirish`} onClick={() => setRm(p)}><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit ? <ProductForm product={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} onDelete={() => setRm(edit)} /> : null}
      {rm ? (
        <Confirm
          title="Tovarni o‘chirasizmi?"
          text={<><b style={{ color: 'var(--ink)' }}>«{rm.name}»</b> ilovadan ham, CRM ro‘yxatidan ham olib tashlanadi. Eski buyurtmalardagi ma'lumotlar saqlanib qoladi.</>}
          busy={rmBusy}
          onOk={remove}
          onCancel={() => setRm(null)}
        />
      ) : null}
    </div>
  );
}

type Form = {
  name: string; short: string; category: string; price: string; oldPrice: string; tag: string; isNew: boolean; volume: string;
  description: string; images: string[]; preset: string; lowStock: string; costPrice: string; active: boolean; stock: string;
};

/** Separate "create product" section (#create). */
export function CreateProduct(_: { arg: string | null }) {
  const { data } = useLoad<{ products: Product[] }>('/api/admin/products');
  const cats = useMemo(() => [...new Set((data?.products ?? []).map(p => p.category).filter(Boolean))], [data]);
  const [k, setK] = useState(0);
  // After saving, a fresh empty form (new key) is ready for the next product.
  return <ProductForm key={k} page product={null} cats={cats} onClose={() => { location.hash = 'products'; }} onSaved={() => setK(x => x + 1)} />;
}

function ProductForm({ product: p, cats, onClose, onSaved, onDelete, page }: { product: Product | null; cats: string[]; onClose: () => void; onSaved: () => void; onDelete?: () => void; page?: boolean }) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => ({
    name: p?.name ?? '', short: p?.short ?? '', category: p?.category ?? '', price: p ? String(p.price) : '', oldPrice: p?.oldPrice ? String(p.oldPrice) : '',
    tag: p?.tag ?? '', isNew: p?.isNew ?? false, volume: p?.volume ?? '', description: p?.description ?? '', images: p?.images ?? [],
    preset: p ? presetOf(p.bundles) : 'units', lowStock: String(p?.lowStock ?? 10), costPrice: p?.costPrice ? String(p.costPrice) : '', active: p?.active ?? true, stock: '',
  }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<Form>) => setF(x => ({ ...x, ...patch }));
  const int = (s: string) => (s.trim() ? Math.round(Number(s.replace(/\s/g, ''))) : null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const { url } = await api<{ url: string }>('/api/admin/upload', { method: 'POST', body: fd });
        setF(x => ({ ...x, images: [...x.images, url] }));
      }
    } catch (e) { toast((e as Error).message); }
    finally { setUploading(false); }
  };

  const save = async () => {
    const price = int(f.price), old = int(f.oldPrice);
    if (!f.name.trim()) return toast('Nomini yozing');
    if (!price || price <= 0) return toast("Narxni to'g'ri yozing");
    if (old && old <= price) return toast("Eski narx yangisidan katta bo'lsin");
    const autoTag = old ? `-${Math.round((1 - price / old) * 100)}%` : f.isNew ? 'Yangi' : '';
    const body = {
      name: f.name.trim(), short: f.short.trim() || f.name.trim().split(/[ ,]/)[0], category: f.category.trim(), price, oldPrice: old,
      tag: f.tag.trim() || autoTag || null, isNew: f.isNew, volume: f.volume.trim() || null, description: f.description.trim(), images: f.images,
      bundles: PRESETS[f.preset], lowStock: int(f.lowStock) ?? 10, costPrice: int(f.costPrice), active: f.active,
      ...(p ? {} : { stock: int(f.stock) ?? 0 }),
    };
    setBusy(true);
    try {
      if (p) await patch(`/api/admin/products/${p.id}`, body); else await post('/api/admin/products', body);
      toast(p ? 'Saqlandi' : "Tovar qo'shildi");
      onSaved();
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  const margin = int(f.costPrice) && int(f.price) ? Math.round((1 - (int(f.costPrice)! / int(f.price)!)) * 100) : null;

  const actions = <>
    <MetalButton tone="emerald" disabled={busy || uploading} icon={<Save size={16} />} onClick={save}>{busy ? 'Saqlanmoqda…' : p ? 'Saqlash' : "Tovarni qo'shish"}</MetalButton>
    <MetalButton tone="ghost" icon={<X size={16} />} onClick={onClose}>{page ? 'Tovarlarga qaytish' : 'Bekor'}</MetalButton>
    {p && onDelete ? <MetalButton tone="ruby" icon={<Trash2 size={16} />} onClick={onDelete} style={{ marginLeft: 'auto' }}>O‘chirish</MetalButton> : null}
  </>;

  return wrap(page, onClose, actions, <>
      <div className="card stack">
        <h3>Rasmlar</h3>
        <div className="images">
          {f.images.map((src, i) => (
            <div key={src} className="im">
              <img src={src} alt="" />
              <button type="button" onClick={() => set({ images: f.images.filter(x => x !== src) })} aria-label="O'chirish">×</button>
              {i === 0 ? <span className="first">Asosiy</span> : (
                <button type="button" style={{ top: 'auto', bottom: 4, right: 'auto', left: 4, width: 'auto', padding: '0 6px', borderRadius: 6, fontSize: 10 }} onClick={() => set({ images: [src, ...f.images.filter(x => x !== src)] })}>Asosiy qilish</button>
              )}
            </div>
          ))}
          <label className="add">{uploading ? 'Yuklanmoqda…' : <>＋<br />Rasm</>}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => upload(e.target.files)} /></label>
        </div>
        <div className="muted small">Birinchi rasm kartochkada ko'rinadi. JPG/PNG/WEBP, 8 MB gacha.</div>
      </div>

      <div className="card stack">
        <Field label="Nomi *"><input className="input" value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Alatoo papayya ichimligi, 0,5 L" /></Field>
        <div className="grid g2">
          <Field label="Qisqa nomi"><input className="input" value={f.short} onChange={e => set({ short: e.target.value })} placeholder="Papayya" /></Field>
          <Field label="Kategoriya">
            <input className="input" list="cats" value={f.category} onChange={e => set({ category: e.target.value })} placeholder="Alatoo" />
            <datalist id="cats">{cats.map(c => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <Field label="Tavsif"><textarea className="textarea" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Tarkibi, qanday ishlatiladi, saqlash" /></Field>
        <Field label="Hajmi / og'irligi"><input className="input" value={f.volume} onChange={e => set({ volume: e.target.value })} placeholder="0,5 L yoki 500 g" /></Field>
      </div>

      <div className="card stack">
        <h3>Narx</h3>
        <div className="grid g2">
          <Field label="Narxi, so'm *"><input className="input num" inputMode="numeric" value={f.price} onChange={e => set({ price: e.target.value })} placeholder="85000" /></Field>
          <Field label="Eski narx (chegirma uchun)"><input className="input num" inputMode="numeric" value={f.oldPrice} onChange={e => set({ oldPrice: e.target.value })} placeholder="99000" /></Field>
          <Field label="Tannarx (faqat CRM'da)"><input className="input num" inputMode="numeric" value={f.costPrice} onChange={e => set({ costPrice: e.target.value })} placeholder="50000" /></Field>
          <Field label="Belgi"><input className="input" value={f.tag} onChange={e => set({ tag: e.target.value })} placeholder="Avtomatik: −14% yoki Yangi" /></Field>
        </div>
        {margin !== null ? <div className="muted small">Ustama: {margin}% · Foyda: {money(int(f.price)! - int(f.costPrice)!)} / dona</div> : null}
        <Field label="Miqdor tanlovi (ilovada)">
          <select className="select" value={f.preset} onChange={e => set({ preset: e.target.value })}>
            <option value="units">1 / 2 / 3 dona (−5%, −10%)</option>
            <option value="bottles">1 / 3 / 6 shisha (−10%, −16%)</option>
            <option value="single">Faqat 1 dona</option>
          </select>
        </Field>
      </div>

      <div className="card stack">
        <h3>Sklad va ko'rinish</h3>
        <div className="grid g2">
          {!p ? <Field label="Boshlang'ich qoldiq"><input className="input num" inputMode="numeric" value={f.stock} onChange={e => set({ stock: e.target.value })} placeholder="0" /></Field> : (
            <Field label="Hozirgi qoldiq"><div className="input" style={{ background: 'transparent' }}>{p.stock} ta · <a href="#stock">Skladda o'zgartirish</a></div></Field>
          )}
          <Field label="Kam qoldi ogohlantirishi"><input className="input num" inputMode="numeric" value={f.lowStock} onChange={e => set({ lowStock: e.target.value })} /></Field>
        </div>
        <label className="row"><input type="checkbox" checked={f.active} onChange={e => set({ active: e.target.checked })} /> Ilovada ko'rsatish</label>
        <label className="row"><input type="checkbox" checked={f.isNew} onChange={e => set({ isNew: e.target.checked })} /> "Yangi" deb belgilash</label>
      </div>
  </>);
}

/** The same form as a full page (create) or a side drawer (edit). */
function wrap(page: boolean | undefined, onClose: () => void, actions: ReactNode, children: ReactNode) {
  if (!page) return <Drawer title="Tovarni tahrirlash" onClose={onClose} footer={actions}>{children}</Drawer>;
  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Yangi tovar yaratish</h1>
          <div className="muted small" style={{ marginTop: 6 }}>Saqlangach tovar darhol ilovada chiqadi ("Ilovada ko'rsatish" yoqilgan bo'lsa)</div>
        </div>
      </div>
      <div className="create-grid">{children}</div>
      <div className="row wrap" style={{ gap: 10 }}>{actions}</div>
    </div>
  );
}

