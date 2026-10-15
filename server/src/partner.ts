// Read-only feed for Arden (the seller control centre). The admin creates one key in the CRM;
// only its SHA-256 is stored, the key itself is shown once. The feed carries no customer names or phones.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { all, db, one, run } from './db.ts';
import { analytics, dashboard } from './stats.ts';

db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

const KEY = 'arden_key';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
type Saved = { hash: string; last4: string; createdAt: string; usedAt?: string };
const saved = (): Saved | null => {
  const r = one<{ value: string }>('SELECT value FROM settings WHERE key = ?', KEY);
  return r ? JSON.parse(r.value) as Saved : null;
};
const save = (v: Saved | null) => v
  ? run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', KEY, JSON.stringify(v))
  : run('DELETE FROM settings WHERE key = ?', KEY);

function keyOk(given: string | undefined) {
  const s = saved();
  if (!s || !given) return false;
  const a = Buffer.from(hash(given)), b = Buffer.from(s.hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Admin routes (already behind the CRM login): show, create and revoke the key. */
export function partnerAdmin(admin: FastifyInstance) {
  admin.get('/integration', async () => {
    const s = saved();
    return s ? { connected: true, last4: s.last4, createdAt: s.createdAt, usedAt: s.usedAt ?? null } : { connected: false };
  });
  admin.post('/integration', async () => {
    const key = 'a24_' + randomBytes(24).toString('base64url');
    save({ hash: hash(key), last4: key.slice(-4), createdAt: new Date().toISOString() });
    return { key };
  });
  admin.delete('/integration', async () => { save(null); return { ok: true }; });
}

/** Public route guarded by the key: GET /api/partner/feed?days=30, header x-api-key. */
export function partnerFeed(app: FastifyInstance) {
  app.get('/api/partner/feed', async (req, reply) => {
    const given = req.headers['x-api-key'];
    if (!keyOk(Array.isArray(given) ? given[0] : given)) return reply.code(401).send({ error: 'Kalit noto‘g‘ri' });
    const s = saved()!;
    if (!s.usedAt || Date.now() - Date.parse(s.usedAt) > 3600e3) save({ ...s, usedAt: new Date().toISOString() });

    const days = Math.min(Math.max(Number((req.query as { days?: string }).days) || 30, 1), 90);
    const orders = all<{ id: number; no: number; status: string; region: string; total: number; createdAt: string; deliveredAt: string | null }>(
      `SELECT id, no, status, region, total, created_at createdAt, delivered_at deliveredAt FROM orders
       WHERE created_at >= datetime('now', ?) ORDER BY id DESC LIMIT 3000`, `-${days} days`,
    );
    const items = new Map<number, { name: string; qty: number; price: number }[]>();
    if (orders.length) {
      for (const r of all<{ orderId: number; name: string; qty: number; price: number }>(
        `SELECT order_id orderId, name, qty, price FROM order_items WHERE order_id >= ?`, orders[orders.length - 1].id,
      )) (items.get(r.orderId) ?? items.set(r.orderId, []).get(r.orderId)!).push({ name: r.name, qty: r.qty, price: r.price });
    }
    const d = dashboard();
    return {
      shop: 'Alatoo24', currency: 'UZS', at: new Date().toISOString(), days,
      totals: { ordered: d.ordered, orderedToday: d.orderedToday, delivered: d.statusSums.delivered ?? { n: 0, s: 0 }, statusSums: d.statusSums, pendingCash: d.pendingCash, customers: d.customers },
      analytics: (({ series, revenue, orders: n, avgCheck, cancelRate, topProducts, byRegion }) => ({ series, revenue, orders: n, avgCheck, cancelRate, topProducts, byRegion }))(analytics(days)),
      orders: orders.map(o => ({ no: o.no, status: o.status, region: o.region, total: o.total, createdAt: o.createdAt, deliveredAt: o.deliveredAt, items: items.get(o.id) ?? [] })),
      stock: all('SELECT name, stock, low_stock lowStock, price FROM products WHERE active = 1 AND deleted_at IS NULL ORDER BY sort, id'),
    };
  });
}
