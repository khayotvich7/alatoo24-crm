// Customer funnel (Bitrix-style board in Mijozlar):
//   Savatda → Birinchi xarid → Tugash arafasida → Qayta xaridor → Doimiy mijoz → Yo'qolgan
// Every customer gets an automatic stage from their orders. Only the owner moves cards by hand;
// a hand-placed card stays where it was put, and the board shows a hint when the data suggests another stage.
// "Savatda" comes from the app: POST /api/cart with what is in the basket (empty list = basket cleared).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { all, db, one, run } from './db.ts';
import { getSettings } from './marketing.ts';
import { fmtPhone, HttpError } from './shop.ts';

db.exec(`
CREATE TABLE IF NOT EXISTS customer_stage (
  customer_id INTEGER PRIMARY KEY,
  stage       TEXT NOT NULL,
  moved_by    TEXT NOT NULL DEFAULT '',
  moved_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS carts (
  key         TEXT PRIMARY KEY,
  customer_id INTEGER,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  items       TEXT NOT NULL DEFAULT '[]',
  total       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export const STAGES = ['first', 'refill', 'repeat', 'loyal', 'lost'] as const;
export type Stage = (typeof STAGES)[number];
const LOST_DAYS = 60;   // no order for this long → Yo'qolgan
const CART_DAYS = 30;   // forgotten baskets are dropped after this
const DAY = 864e5;

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const ts = (s: string | null | undefined) => (s ? Date.parse(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')) : NaN);
const hasCustomerToken = () => all<{ name: string }>('PRAGMA table_info(customers)').some(c => c.name === 'token');

/** Public: the app reports the basket. Identified by the customer's token (after the first order) or a device id. */
export function registerPipeline(app: FastifyInstance) {
  app.post('/api/cart', async req => {
    const b = (req.body ?? {}) as { customerToken?: string; device?: string; name?: string; phone?: string; items?: unknown };
    const token = str(b.customerToken, 80), device = str(b.device, 200);
    const cust = token && hasCustomerToken()
      ? one<{ id: number; name: string; phone: string }>("SELECT id, name, phone FROM customers WHERE token = ? AND token <> ''", token)
      : null;
    const key = cust ? `c${cust.id}` : device ? `d${device}` : '';
    if (!key) throw new HttpError(400, 'device yoki customerToken kerak');

    const want = (Array.isArray(b.items) ? b.items : []).slice(0, 30) as { id?: unknown; qty?: unknown }[];
    const items: { id: number; name: string; qty: number; price: number }[] = [];
    for (const it of want) {
      const id = Math.floor(Number(it?.id)), qty = Math.min(99, Math.floor(Number(it?.qty)));
      if (!(id > 0) || !(qty > 0)) continue;
      const p = one<{ name: string; price: number }>('SELECT name, price FROM products WHERE id = ? AND deleted_at IS NULL', id);
      if (p) items.push({ id, name: p.name, qty, price: p.price });
    }
    if (cust && device) run('DELETE FROM carts WHERE key = ?', `d${device}`); // the device is now a known customer
    if (!items.length) { run('DELETE FROM carts WHERE key = ?', key); return { ok: true }; }

    const phone = str(b.phone ?? cust?.phone, 20).replace(/\D/g, '').slice(-9);
    const name = str(b.name, 60) || cust?.name || '';
    const total = items.reduce((a, i) => a + i.qty * i.price, 0);
    run(`INSERT INTO carts (key, customer_id, name, phone, items, total, updated_at) VALUES (?,?,?,?,?,?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET customer_id = excluded.customer_id, name = excluded.name, phone = excluded.phone,
           items = excluded.items, total = excluded.total, updated_at = excluded.updated_at`,
      key, cust?.id ?? null, name, phone, JSON.stringify(items), total);
    return { ok: true };
  });
}

type Row = {
  id: number; name: string; phone: string; createdAt: string; manual: Stage | null; movedBy: string | null; movedAt: string | null;
  orders: number; delivered: number; cancelled: number; pending: number; spent: number;
  lastOrder: string | null; lastDelivered: string | null; lastQty: number; lastItems: string | null;
};

/** Admin: the board for anyone who may see customers; moving cards is for the owner only. */
export function pipelineAdmin(admin: FastifyInstance, canView: (req: FastifyRequest) => void, ownerOnly: (req: FastifyRequest) => void) {
  admin.get('/pipeline', async req => {
    canView(req);
    const s = getSettings() as unknown as Record<string, number>;
    const bottle = Number(s.bottle_days) || 14;
    const before = Math.max(2, Number(s.remind_before) || 2);
    const now = Date.now();

    const rows = all<Row>(`
      SELECT c.id, c.name, c.phone, c.created_at createdAt, st.stage manual, st.moved_by movedBy, st.moved_at movedAt,
        COUNT(o.id) orders,
        COALESCE(SUM(o.status = 'delivered'), 0) delivered,
        COALESCE(SUM(o.status = 'cancelled'), 0) cancelled,
        COALESCE(SUM(o.status NOT IN ('delivered', 'cancelled')), 0) pending,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total END), 0) spent,
        MAX(o.created_at) lastOrder,
        MAX(CASE WHEN o.status = 'delivered' THEN COALESCE(o.delivered_at, o.created_at) END) lastDelivered,
        (SELECT COALESCE(SUM(i.qty), 0) FROM order_items i WHERE i.order_id =
          (SELECT id FROM orders WHERE customer_id = c.id AND status = 'delivered' ORDER BY id DESC LIMIT 1)) lastQty,
        (SELECT GROUP_CONCAT(i.qty || '× ' || i.name, ', ') FROM order_items i WHERE i.order_id =
          (SELECT id FROM orders WHERE customer_id = c.id ORDER BY id DESC LIMIT 1)) lastItems
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      LEFT JOIN customer_stage st ON st.customer_id = c.id
      GROUP BY c.id ORDER BY lastOrder DESC LIMIT 1000`);

    const customers = rows.map(r => {
      let auto: Stage, runsOut: string | null = null;
      if (!r.delivered) auto = r.orders && r.cancelled === r.orders ? 'lost' : 'first';
      else {
        const out = ts(r.lastDelivered) + Math.max(1, r.lastQty) * bottle * DAY;
        runsOut = new Date(out).toISOString();
        if (now - ts(r.lastOrder) > LOST_DAYS * DAY) auto = 'lost';
        else if (!r.pending && out - now <= before * DAY) auto = 'refill';
        else auto = r.delivered >= 2 ? 'repeat' : 'first';
      }
      const stage = r.manual && (STAGES as readonly string[]).includes(r.manual) ? r.manual : auto;
      // Hint only when the data points somewhere useful (a "Doimiy" card is not nagged to go back to "Qayta xaridor").
      const hint = r.manual && auto !== r.manual && (r.manual !== 'loyal' || auto === 'refill' || auto === 'lost') ? auto : null;
      return {
        id: r.id, name: r.name, phone: fmtPhone(String(r.phone)), stage, auto, manual: !!r.manual, hint,
        movedBy: r.movedBy, movedAt: r.movedAt,
        orders: r.orders, delivered: r.delivered, pending: r.pending, spent: r.spent,
        lastOrder: r.lastOrder, runsOut, daysLeft: runsOut ? Math.ceil((ts(runsOut) - now) / DAY) : null, lastItems: r.lastItems ?? '',
      };
    });

    run(`DELETE FROM carts WHERE updated_at < datetime('now', ?)`, `-${CART_DAYS} days`);
    // A basket that turned into an order is no longer "in the basket".
    const carts = all<{ key: string; customerId: number | null; name: string; phone: string; items: string; total: number; updatedAt: string }>(`
      SELECT k.key, k.customer_id customerId, k.name, k.phone, k.items, k.total, k.updated_at updatedAt FROM carts k
      WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.created_at >= k.updated_at
        AND (o.customer_id = k.customer_id OR (k.phone <> '' AND o.phone = k.phone)))
      ORDER BY k.updated_at DESC LIMIT 300`)
      .map(c => ({ ...c, phone: c.phone ? fmtPhone(c.phone) : '', items: JSON.parse(c.items) as { name: string; qty: number }[] }));

    return { customers, carts, bottleDays: bottle };
  });

  admin.patch('/pipeline/:id', async req => {
    ownerOnly(req);
    const id = Number((req.params as { id: string }).id);
    const stage = String(((req.body ?? {}) as { stage?: string }).stage ?? '');
    if (!one('SELECT id FROM customers WHERE id = ?', id)) throw new HttpError(404, 'Mijoz topilmadi');
    if (stage === 'auto') { run('DELETE FROM customer_stage WHERE customer_id = ?', id); return { ok: true }; }
    if (!(STAGES as readonly string[]).includes(stage)) throw new HttpError(400, "Bosqich noto'g'ri");
    const who = str((req as FastifyRequest & { user?: { name?: string } }).user?.name, 60) || 'Rahbar';
    run(`INSERT INTO customer_stage (customer_id, stage, moved_by, moved_at) VALUES (?,?,?, datetime('now'))
         ON CONFLICT(customer_id) DO UPDATE SET stage = excluded.stage, moved_by = excluded.moved_by, moved_at = excluded.moved_at`, id, stage, who);
    return { ok: true };
  });
}
