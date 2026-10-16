// Business rules shared by the public API (mobile app) and the CRM.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { all, one, type Row, run, tx } from './db.ts';

export const PROMO = { code: 'ALATOO15', percent: 15 };
// new → checking (Tekshiruvda) → confirmed → ready (Dastavkaga, out for delivery) → delivered; cancelled at any point.
// 'courier' is no longer used by the CRM; old orders in it are moved to 'ready' at startup (db.ts).
export const STATUSES = ['new', 'checking', 'confirmed', 'ready', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

// Conditions under which the product needs a specialist's go-ahead (owner's list, conditions.json).
export const CONDITIONS = JSON.parse(readFileSync(new URL('./conditions.json', import.meta.url), 'utf8')) as {
  notAllowed: { code: string; label: string }[]; minAge: number;
};
const CONDITION_LABEL = new Map(CONDITIONS.notAllowed.map(c => [c.code, c.label]));

export type HealthProfile = { age?: number | null; gender?: string; weight?: number | null; conditions?: string[]; other?: string; consent?: boolean };

/** True when the answers mean a specialist must talk to the customer first. */
export function needsConsult(h: HealthProfile | undefined) {
  if (!h) return false;
  return (h.conditions ?? []).some(c => CONDITION_LABEL.has(c)) || (h.age != null && h.age < CONDITIONS.minAge) || !!h.other?.trim();
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const json = <T>(s: unknown, fallback: T): T => { try { return JSON.parse(String(s)) as T; } catch { return fallback; } };
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
/** "901234567" → "90 123 45 67", the format the app shows. */
export const fmtPhone = (s: string) => { const d = digits(s).slice(-9); return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' '); };

// ---------- products ----------

export function productOut(p: Row, admin = false) {
  const out: Row = {
    id: p.id, name: p.name, short: p.short, category: p.category, price: p.price,
    oldPrice: p.old_price ?? null, tag: p.tag ?? null, isNew: !!p.is_new, volume: p.volume ?? null,
    description: p.description, images: json<string[]>(p.images, []), tint: p.tint, bg: p.bg,
    bundles: json(p.bundles, []), inStock: Number(p.stock) > 0,
  };
  if (admin) Object.assign(out, { stock: p.stock, lowStock: p.low_stock, costPrice: p.cost_price ?? null, active: !!p.active, sort: p.sort, updatedAt: p.updated_at });
  return out;
}

export type ProductInput = {
  name: string; short?: string; category?: string; price: number; oldPrice?: number | null; tag?: string | null;
  isNew?: boolean; volume?: string | null; description?: string; images?: string[]; tint?: string; bg?: string;
  bundles?: { label: string; mult: number; off?: string }[]; lowStock?: number; costPrice?: number | null; active?: boolean; sort?: number;
};

function checkProduct(b: Partial<ProductInput>, partial: boolean) {
  if (!partial || b.name !== undefined) if (!b.name || String(b.name).trim().length < 2) throw new HttpError(400, 'Nomi kamida 2 harf');
  if (!partial || b.price !== undefined) if (!Number.isInteger(b.price) || (b.price as number) <= 0) throw new HttpError(400, "Narx musbat butun son bo'lsin");
  if (b.oldPrice != null && (!Number.isInteger(b.oldPrice) || b.oldPrice <= 0)) throw new HttpError(400, "Eski narx noto'g'ri");
}

const COLS: Record<keyof ProductInput, [string, (v: never) => unknown]> = {
  name: ['name', v => String(v).trim()], short: ['short', v => String(v ?? '').trim()], category: ['category', v => String(v ?? '').trim()],
  price: ['price', v => v], oldPrice: ['old_price', v => v ?? null], tag: ['tag', v => (v ? String(v) : null)], isNew: ['is_new', v => (v ? 1 : 0)],
  volume: ['volume', v => (v ? String(v) : null)], description: ['description', v => String(v ?? '')], images: ['images', v => JSON.stringify(v ?? [])],
  tint: ['tint', v => v], bg: ['bg', v => v], bundles: ['bundles', v => JSON.stringify(v ?? [])], lowStock: ['low_stock', v => Number(v) || 0],
  costPrice: ['cost_price', v => v ?? null], active: ['active', v => (v ? 1 : 0)], sort: ['sort', v => Number(v) || 0],
};

export function createProduct(b: ProductInput) {
  checkProduct(b, false);
  const keys = (Object.keys(COLS) as (keyof ProductInput)[]).filter(k => b[k] !== undefined);
  const r = run(`INSERT INTO products (${keys.map(k => COLS[k][0]).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => COLS[k][1](b[k] as never)));
  return Number(r.lastInsertRowid);
}

export function updateProduct(id: number, b: Partial<ProductInput>) {
  if (!one('SELECT id FROM products WHERE id = ?', id)) throw new HttpError(404, 'Tovar topilmadi');
  checkProduct(b, true);
  const keys = (Object.keys(COLS) as (keyof ProductInput)[]).filter(k => b[k] !== undefined);
  if (!keys.length) return;
  run(`UPDATE products SET ${keys.map(k => `${COLS[k][0]} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...keys.map(k => COLS[k][1](b[k] as never)), id);
}

// ---------- stock ----------

export function moveStock(productId: number, kind: string, qty: number, note = '', orderId: number | null = null) {
  if (!Number.isInteger(qty) || qty === 0) throw new HttpError(400, "Miqdor 0 bo'lmagan butun son bo'lsin");
  const p = one<{ stock: number }>('SELECT stock FROM products WHERE id = ?', productId);
  if (!p) throw new HttpError(404, 'Tovar topilmadi');
  run('INSERT INTO stock_moves (product_id, kind, qty, order_id, note) VALUES (?,?,?,?,?)', productId, kind, qty, orderId, note);
  run("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?", qty, productId);
}

// ---------- orders ----------

export type OrderInput = {
  name: string; phone: string; phone2: string; comment?: string; promo?: string | null;
  address: { region: string; street: string; flat?: string; landmark?: string };
  items: { id: number; qty: number }[];
  profile?: HealthProfile;
};

function nextOrderNo() {
  const r = one<{ m: number | null }>('SELECT MAX(no) m FROM orders');
  return (r?.m ?? 48209) + 1;
}

export function createOrder(b: OrderInput) {
  const phone = digits(b.phone).slice(-9), phone2 = digits(b.phone2).slice(-9);
  if (!b.name || b.name.trim().length < 2) throw new HttpError(400, 'Ismingizni yozing');
  if (phone.length !== 9) throw new HttpError(400, "1-raqam noto'g'ri");
  if (phone2.length !== 9) throw new HttpError(400, "2-raqam noto'g'ri");
  if (phone === phone2) throw new HttpError(400, 'Ikkinchi raqam birinchisidan farq qilsin');
  if (!b.address?.street || b.address.street.trim().length < 5) throw new HttpError(400, "Manzilni to'liq yozing");
  if (!Array.isArray(b.items) || !b.items.length) throw new HttpError(400, "Savat bo'sh");

  return tx(() => {
    const items = b.items.map(it => {
      const p = one<Row>('SELECT * FROM products WHERE id = ? AND active = 1', it.id);
      if (!p) throw new HttpError(400, 'Tovar sotuvda yo‘q');
      const qty = Math.floor(Number(it.qty));
      if (!(qty > 0 && qty <= 100)) throw new HttpError(400, "Miqdor noto'g'ri");
      return { id: Number(p.id), name: String(p.name), price: Number(p.price), qty };
    });
    const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);

    let customer = one<{ id: number }>('SELECT id FROM customers WHERE phone = ?', phone);
    if (!customer) customer = { id: Number(run('INSERT INTO customers (phone, name, phone2) VALUES (?,?,?)', phone, b.name.trim(), phone2).lastInsertRowid) };
    else run('UPDATE customers SET name = ?, phone2 = ? WHERE id = ?', b.name.trim(), phone2, customer.id);

    const h = b.profile;
    const conds = (h?.conditions ?? []).filter(c => CONDITION_LABEL.has(c));
    const age = h?.age != null && Number.isFinite(Number(h.age)) ? Math.max(0, Math.min(120, Math.round(Number(h.age)))) : null;
    const weight = h?.weight != null && Number.isFinite(Number(h.weight)) ? Math.max(0, Math.min(400, Math.round(Number(h.weight)))) : null;
    const other = String(h?.other ?? '').trim().slice(0, 300);
    if (h) run(`UPDATE customers SET age = ?, gender = ?, weight = ?, conditions = ?, health_note = ?, consent_at = COALESCE(consent_at, CASE WHEN ? THEN datetime('now') END) WHERE id = ?`,
      age, String(h.gender ?? '').slice(0, 10), weight, JSON.stringify(conds), other, h.consent ? 1 : 0, customer.id);
    const consult = needsConsult({ conditions: conds, age, other }) ? 'needed' : '';
    const health = h ? JSON.stringify({ age, gender: h.gender ?? '', weight, conditions: conds.map(c => CONDITION_LABEL.get(c)), other }) : '';

    // Promo is for a customer's first (not cancelled) order only.
    const promoOk = (b.promo ?? '').trim().toUpperCase() === PROMO.code
      && !one("SELECT id FROM orders WHERE customer_id = ? AND status != 'cancelled'", customer.id);
    const discount = promoOk ? Math.round((subtotal * PROMO.percent) / 100 / 100) * 100 : 0;

    const no = nextOrderNo();
    const token = randomBytes(16).toString('hex');
    const a = b.address;
    const id = Number(run(
      `INSERT INTO orders (no, token, customer_id, name, phone, phone2, region, street, flat, landmark, comment, subtotal, discount, total, promo, health, consult)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      no, token, customer.id, b.name.trim(), phone, phone2, String(a.region ?? ''), a.street.trim(), String(a.flat ?? ''), String(a.landmark ?? ''),
      String(b.comment ?? '').slice(0, 300), subtotal, discount, subtotal - discount, promoOk ? PROMO.code : null, health, consult,
    ).lastInsertRowid);
    for (const i of items) run('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?,?,?,?,?)', id, i.id, i.name, i.price, i.qty);
    run("INSERT INTO order_events (order_id, status, note) VALUES (?, 'new', ?)", id, consult ? 'Ilovadan · mutaxassis maslahati kerak' : 'Ilovadan');
    return getOrder(id)!;
  });
}

export function getOrder(id: number) {
  const o = one<Row>('SELECT * FROM orders WHERE id = ?', id);
  if (!o) return undefined;
  return {
    id: o.id, no: o.no, token: o.token, status: o.status, name: o.name, phone: fmtPhone(String(o.phone)), phone2: fmtPhone(String(o.phone2)),
    address: { region: o.region, street: o.street, flat: o.flat, landmark: o.landmark }, comment: o.comment,
    subtotal: o.subtotal, discount: o.discount, total: o.total, promo: o.promo, adminNote: o.admin_note,
    customerId: o.customer_id, createdAt: o.created_at, updatedAt: o.updated_at, deliveredAt: o.delivered_at,
    consult: String(o.consult ?? ''), health: o.health ? JSON.parse(String(o.health)) : null,
    items: all('SELECT product_id id, name, price, qty FROM order_items WHERE order_id = ?', id),
    events: all('SELECT status, note, created_at createdAt FROM order_events WHERE order_id = ? ORDER BY id', id),
  };
}

/** What the customer's app may see about its own order. */
// The mobile app only knows the original five statuses, so internal steps are shown as their nearest one.
const APP_STATUS: Record<string, string> = { checking: 'new', ready: 'courier' };
const appStatus = (s: unknown) => APP_STATUS[String(s)] ?? s;
export const publicOrder = (o: NonNullable<ReturnType<typeof getOrder>>) => {
  const { adminNote: _a, customerId: _c, token: _t, health: _h, ...rest } = o;
  return {
    ...rest,
    status: appStatus(rest.status),
    events: (rest.events as { status: unknown }[]).filter(e => !(String(e.status) in APP_STATUS)).map(e => ({ ...e, status: appStatus(e.status) })),
  };
};

export function setStatus(id: number, status: Status, note = '') {
  if (!STATUSES.includes(status)) throw new HttpError(400, "Holat noto'g'ri");
  return tx(() => {
    const o = one<{ status: Status }>('SELECT status FROM orders WHERE id = ?', id);
    if (!o) throw new HttpError(404, 'Buyurtma topilmadi');
    if (o.status === status) return getOrder(id)!;
    const c = one<{ consult: string }>('SELECT consult FROM orders WHERE id = ?', id)!.consult;
    if ((status === 'ready' || status === 'courier' || status === 'delivered') && c === 'needed') throw new HttpError(409, 'Avval mutaxassis maslahati kerak: buyurtmani mutaxassis tasdiqlasin');
    if ((status === 'ready' || status === 'courier' || status === 'delivered') && c === 'rejected') throw new HttpError(409, "Mutaxassis rad etgan buyurtmani jo'natib bo'lmaydi");
    const items = all<{ product_id: number; qty: number }>('SELECT product_id, qty FROM order_items WHERE order_id = ?', id);
    // Stock leaves the warehouse when the courier hands the goods over (delivered),
    // and comes back if a delivered order is reopened or cancelled.
    if (status === 'delivered') for (const i of items) moveStock(i.product_id, 'sale', -i.qty, 'Yetkazildi', id);
    if (o.status === 'delivered') for (const i of items) moveStock(i.product_id, 'return', i.qty, 'Yetkazish bekor qilindi', id);
    run(`UPDATE orders SET status = ?, updated_at = datetime('now'), delivered_at = ${status === 'delivered' ? "datetime('now')" : 'NULL'} WHERE id = ?`, status, id);
    run('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)', id, status, note);
    return getOrder(id)!;
  });
}

export function setConsult(id: number, decision: 'approved' | 'rejected', note = '') {
  return tx(() => {
    const o = one<{ status: string; consult: string }>('SELECT status, consult FROM orders WHERE id = ?', id);
    if (!o) throw new HttpError(404, 'Buyurtma topilmadi');
    if (!o.consult) throw new HttpError(400, 'Bu buyurtmaga maslahat kerak emas');
    run("UPDATE orders SET consult = ?, updated_at = datetime('now') WHERE id = ?", decision, id);
    run('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)', id, o.status,
      (decision === 'approved' ? 'Mutaxassis tasdiqladi' : 'Mutaxassis rad etdi') + (note ? ` · ${note}` : ''));
    return getOrder(id)!;
  });
}
