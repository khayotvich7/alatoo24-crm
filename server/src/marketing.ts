// Marketing: promo codes, home banners, cashback points, referral codes and broadcast messages.
// Everything the owner tunes (percentages, reminder days) lives in `settings` and is edited in the CRM.
import { randomBytes } from 'node:crypto';
import { all, db, one, run } from './db.ts';

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  percent INTEGER NOT NULL,
  first_order_only INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  ends_at TEXT,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  product_id INTEGER,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS points_moves (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS devices (token TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const addColumn = (table: string, col: string, def: string) => {
  const cols = all<{ name: string }>(`PRAGMA table_info(${table})`).map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
};
addColumn('customers', 'token', "TEXT NOT NULL DEFAULT ''");
addColumn('customers', 'points', 'INTEGER NOT NULL DEFAULT 0');
addColumn('customers', 'ref_code', "TEXT NOT NULL DEFAULT ''");
addColumn('orders', 'points_used', 'INTEGER NOT NULL DEFAULT 0');
addColumn('orders', 'points_awarded', 'INTEGER NOT NULL DEFAULT 0');
addColumn('orders', 'ref_customer_id', 'INTEGER');
addColumn('orders', 'ref_awarded', 'INTEGER NOT NULL DEFAULT 0');

export const DEFAULTS = {
  cashback_pct: 5, // % of a delivered order returned as points (1 point = 1 so'm)
  max_points_pct: 50, // points may pay at most this % of an order
  referral_friend_pct: 15, // discount for a friend's first order with a referral code
  referral_bonus_pct: 10, // % of the friend's delivered order credited to the referrer
  bottle_days: 14, // how long one bottle lasts
  remind_before: 2, // reminder this many days before it runs out
};
export type Settings = typeof DEFAULTS;

export function getSettings(): Settings {
  const s = { ...DEFAULTS };
  for (const r of all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    if (r.key in s && Number.isFinite(Number(r.value))) (s as Record<string, number>)[r.key] = Number(r.value);
  }
  return s;
}

export function saveSettings(input: Partial<Record<keyof Settings, unknown>>) {
  const limits: Record<keyof Settings, [number, number]> = {
    cashback_pct: [0, 50], max_points_pct: [0, 100], referral_friend_pct: [0, 50], referral_bonus_pct: [0, 50], bottle_days: [1, 120], remind_before: [0, 30],
  };
  for (const k of Object.keys(limits) as (keyof Settings)[]) {
    if (input[k] === undefined) continue;
    const v = Math.round(Number(input[k]));
    const [lo, hi] = limits[k];
    if (!Number.isFinite(v) || v < lo || v > hi) throw Object.assign(new Error(`${k}: ${lo}–${hi}`), { statusCode: 400 });
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(v));
  }
  return getSettings();
}

// The original first-order code keeps working as a regular promo.
if (!one('SELECT id FROM promos LIMIT 1')) {
  run("INSERT INTO promos (code, percent, first_order_only, title) VALUES ('ALATOO15', 15, 1, 'Birinchi buyurtmaga −15%')");
}

const round100 = (n: number) => Math.round(n / 100) * 100;
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** Ensures the customer has a private token and a shareable referral code. */
export function customerKeys(customerId: number) {
  const c = one<{ token: string; ref_code: string }>('SELECT token, ref_code FROM customers WHERE id = ?', customerId)!;
  let { token, ref_code } = c;
  if (!token) { token = randomBytes(18).toString('base64url'); run('UPDATE customers SET token = ? WHERE id = ?', token, customerId); }
  if (!ref_code) {
    // Short, readable, unambiguous: AL + 5 chars without 0/O/1/I.
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do { ref_code = 'AL' + Array.from(randomBytes(5), b => A[b % A.length]).join(''); } while (one('SELECT id FROM customers WHERE ref_code = ?', ref_code));
    run('UPDATE customers SET ref_code = ? WHERE id = ?', ref_code, customerId);
  }
  return { token, refCode: ref_code };
}

type PromoHit = { kind: 'promo' | 'referral'; code: string; percent: number; title: string; refCustomerId?: number; firstOrderOnly: boolean };

/** Resolves a code typed at checkout: a CRM promo or another customer's referral code. */
export function findPromo(raw: string, phone?: string): PromoHit | null {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  const p = one<{ code: string; percent: number; first_order_only: number; title: string; ends_at: string | null }>(
    'SELECT code, percent, first_order_only, title, ends_at FROM promos WHERE code = ? AND active = 1', code);
  if (p) {
    if (p.ends_at && p.ends_at < now()) return null;
    return { kind: 'promo', code: p.code, percent: p.percent, title: p.title || `−${p.percent}%`, firstOrderOnly: !!p.first_order_only };
  }
  const ref = one<{ id: number; phone: string }>('SELECT id, phone FROM customers WHERE ref_code = ?', code);
  if (ref && ref.phone !== (phone ?? '')) {
    const s = getSettings();
    return { kind: 'referral', code, percent: s.referral_friend_pct, title: `Do'st taklifi: −${s.referral_friend_pct}%`, refCustomerId: ref.id, firstOrderOnly: true };
  }
  return null;
}

const firstOrder = (customerId: number) => !one("SELECT id FROM orders WHERE customer_id = ? AND status != 'cancelled'", customerId);

/** Discount and points for a new order. Throws a friendly message when something does not apply. */
export function priceOrder(opts: { subtotal: number; customerId: number; isNewCustomer: boolean; phone: string; promo?: string | null; points?: number; customerToken?: string }) {
  let discount = 0, promoCode: string | null = null, refCustomerId: number | null = null;
  if (opts.promo && opts.promo.trim()) {
    const hit = findPromo(opts.promo, opts.phone);
    if (!hit) throw Object.assign(new Error('Promokod topilmadi yoki muddati tugagan'), { statusCode: 400 });
    if (hit.firstOrderOnly && !firstOrder(opts.customerId)) throw Object.assign(new Error('Bu promokod faqat birinchi buyurtma uchun'), { statusCode: 400 });
    if (hit.refCustomerId === opts.customerId) throw Object.assign(new Error("O'zingizning taklif kodingizni ishlatib bo'lmaydi"), { statusCode: 400 });
    discount = round100((opts.subtotal * hit.percent) / 100);
    promoCode = hit.code;
    refCustomerId = hit.refCustomerId ?? null;
  }
  let pointsUsed = 0;
  const want = Math.max(0, Math.floor(Number(opts.points ?? 0)));
  if (want > 0) {
    const c = one<{ token: string; points: number }>('SELECT token, points FROM customers WHERE id = ?', opts.customerId);
    if (!c || !c.token || c.token !== opts.customerToken) throw Object.assign(new Error("Ballarni ishlatish uchun qaytadan kiring"), { statusCode: 400 });
    const cap = Math.floor(((opts.subtotal - discount) * getSettings().max_points_pct) / 100);
    pointsUsed = Math.min(want, c.points, cap);
    pointsUsed -= pointsUsed % 100;
  }
  return { discount, promoCode, refCustomerId, pointsUsed };
}

function move(customerId: number, delta: number, reason: string, orderId: number | null) {
  if (!delta) return;
  run('UPDATE customers SET points = MAX(0, points + ?) WHERE id = ?', delta, customerId);
  run('INSERT INTO points_moves (customer_id, delta, reason, order_id) VALUES (?,?,?,?)', customerId, delta, reason, orderId);
}

/** Called inside the order transaction right after the order row exists. */
export function spendPoints(customerId: number, orderId: number, no: number, points: number) {
  if (points > 0) move(customerId, -points, `№ ${no} buyurtmada ishlatildi`, orderId);
}

/** Status hooks: cashback and referral bonus on delivery; everything is reversed if that is undone. */
export function onStatus(orderId: number, from: string, to: string) {
  const o = one<{ no: number; customer_id: number; total: number; points_used: number; points_awarded: number; ref_customer_id: number | null; ref_awarded: number }>(
    'SELECT no, customer_id, total, points_used, points_awarded, ref_customer_id, ref_awarded FROM orders WHERE id = ?', orderId);
  if (!o) return;
  const s = getSettings();
  if (to === 'delivered' && from !== 'delivered') {
    const award = Math.round((o.total * s.cashback_pct) / 100);
    move(o.customer_id, award, `№ ${o.no} uchun keshbek ${s.cashback_pct}%`, orderId);
    let ref = 0;
    if (o.ref_customer_id) {
      ref = Math.round((o.total * s.referral_bonus_pct) / 100);
      move(o.ref_customer_id, ref, `Do'stingiz buyurtmasi № ${o.no} uchun bonus`, orderId);
    }
    run('UPDATE orders SET points_awarded = ?, ref_awarded = ? WHERE id = ?', award, ref, orderId);
  }
  if (from === 'delivered' && to !== 'delivered') {
    move(o.customer_id, -o.points_awarded, `№ ${o.no} keshbeki qaytarildi`, orderId);
    if (o.ref_customer_id) move(o.ref_customer_id, -o.ref_awarded, `№ ${o.no} bonusi qaytarildi`, orderId);
    run('UPDATE orders SET points_awarded = 0, ref_awarded = 0 WHERE id = ?', orderId);
  }
  if (to === 'cancelled' && from !== 'cancelled' && o.points_used) move(o.customer_id, o.points_used, `№ ${o.no} bekor qilindi: ballar qaytdi`, orderId);
  if (from === 'cancelled' && to !== 'cancelled' && o.points_used) move(o.customer_id, -o.points_used, `№ ${o.no} qayta ochildi`, orderId);
}

export function me(token: string) {
  const c = one<{ id: number; name: string; points: number }>('SELECT id, name, points FROM customers WHERE token = ? AND token <> \'\'', token);
  if (!c) return null;
  const { refCode } = customerKeys(c.id);
  const friends = one<{ n: number }>("SELECT COUNT(DISTINCT customer_id) n FROM orders WHERE ref_customer_id = ? AND status != 'cancelled'", c.id)!.n;
  return { name: c.name, points: c.points, refCode, friends, moves: all('SELECT delta, reason, created_at createdAt FROM points_moves WHERE customer_id = ? ORDER BY id DESC LIMIT 30', c.id) };
}

export function activeBanners() {
  return all(`SELECT id, title, subtitle, image, cta, product_id productId, ends_at endsAt FROM banners
              WHERE active = 1 AND (ends_at IS NULL OR ends_at > ?) ORDER BY sort, id DESC`, now());
}

export function registerDevice(token: string) {
  run('INSERT OR IGNORE INTO devices (token) VALUES (?)', token);
}

/** Sends one message to every phone we know (order tokens and registered devices), 100 per request. */
export async function broadcast(title: string, body: string) {
  const tokens = all<{ t: string }>("SELECT token t FROM devices UNION SELECT push_token t FROM orders WHERE push_token <> ''").map(r => r.t);
  let sent = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100).map(to => ({ to, title, body, sound: 'default', channelId: 'orders' }));
    try {
      const r = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(batch), signal: AbortSignal.timeout(15000) });
      if (r.ok) sent += batch.length;
    } catch (e) { console.error('broadcast failed', e); }
  }
  run('INSERT INTO broadcasts (title, body, sent) VALUES (?,?,?)', title, body, sent);
  return { sent, total: tokens.length };
}
