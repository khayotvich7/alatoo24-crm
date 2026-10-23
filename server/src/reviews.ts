// Customer ratings. After an order is delivered the app asks the customer for 1–5 stars and an
// optional comment; the rating counts for every product in that order. Staff can hide a review.
import type { FastifyInstance } from 'fastify';
import { all, db, one, run, tx } from './db.ts';
import { HttpError } from './shop.ts';

db.exec(`
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL,
  product_id  INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  rating      INTEGER NOT NULL,
  text        TEXT NOT NULL DEFAULT '',
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_id, product_id)
);
CREATE INDEX IF NOT EXISTS reviews_product ON reviews (product_id, hidden);
`);

/** "Dilnoza Karimova" → "Dilnoza K." so a public review does not show the full name. */
const shortName = (s: string) => {
  const [first = 'Mijoz', last] = s.trim().split(/\s+/);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
};

/** Average and count of visible ratings per product, for the catalogue. */
export function ratingMap() {
  const m = new Map<number, { rating: number; reviews: number }>();
  for (const r of all<{ product_id: number; avg: number; n: number }>(
    'SELECT product_id, AVG(rating) avg, COUNT(*) n FROM reviews WHERE hidden = 0 GROUP BY product_id')) {
    m.set(r.product_id, { rating: Math.round(r.avg * 10) / 10, reviews: r.n });
  }
  return m;
}

export function registerReviews(app: FastifyInstance) {
  // The customer rates a delivered order they own (proved by the order token).
  app.post('/api/orders/:no/review', async req => {
    const { no } = req.params as { no: string };
    const { token } = req.query as { token?: string };
    const b = (req.body ?? {}) as { rating?: unknown; text?: unknown };
    const rating = Math.round(Number(b.rating));
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Bahoni 1 dan 5 gacha tanlang');
    const text = String(b.text ?? '').trim().slice(0, 600);
    const o = one<{ id: number; token: string; status: string; customer_id: number; name: string }>(
      'SELECT id, token, status, customer_id, name FROM orders WHERE no = ?', Number(no));
    if (!o || !token || o.token !== token) throw new HttpError(404, 'Buyurtma topilmadi');
    if (o.status !== 'delivered') throw new HttpError(409, 'Baho buyurtma yetkazilgandan keyin beriladi');
    const items = all<{ product_id: number }>('SELECT DISTINCT product_id FROM order_items WHERE order_id = ?', o.id);
    tx(() => {
      for (const i of items) {
        run(`INSERT INTO reviews (order_id, product_id, customer_id, name, rating, text) VALUES (?,?,?,?,?,?)
             ON CONFLICT(order_id, product_id) DO UPDATE SET rating = excluded.rating, text = excluded.text, created_at = datetime('now')`,
          o.id, i.product_id, o.customer_id, shortName(o.name), rating, text);
      }
    });
    return { ok: true, rating, text };
  });

  // Public list for a product page.
  app.get('/api/reviews', async req => {
    const id = Number((req.query as { product?: string }).product);
    if (!id) throw new HttpError(400, 'Mahsulot tanlanmagan');
    const stats = one<{ avg: number | null; n: number }>('SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE product_id = ? AND hidden = 0', id)!;
    const reviews = all(
      `SELECT id, name, rating, text, created_at createdAt FROM reviews
       WHERE product_id = ? AND hidden = 0 ORDER BY (text != '') DESC, id DESC LIMIT 30`, id);
    return { rating: stats.avg ? Math.round(stats.avg * 10) / 10 : 0, count: stats.n, reviews };
  });
}

/** CRM routes; the caller mounts them behind the order permissions. */
export function registerReviewsAdmin(admin: FastifyInstance) {
  admin.get('/reviews', async req => {
    const { filter } = req.query as { filter?: string };
    const where = filter === 'low' ? 'WHERE r.rating <= 3' : filter === 'hidden' ? 'WHERE r.hidden = 1' : '';
    const reviews = all(
      `SELECT MIN(r.id) id, r.order_id orderId, o.no orderNo, r.customer_id customerId, o.name fullName, o.phone,
              r.rating, r.text, r.hidden, r.created_at createdAt, group_concat(p.name, ', ') products
       FROM reviews r JOIN orders o ON o.id = r.order_id LEFT JOIN products p ON p.id = r.product_id
       ${where} GROUP BY r.order_id ORDER BY MAX(r.id) DESC LIMIT 300`);
    const s = one<{ avg: number | null; n: number }>('SELECT AVG(rating) avg, COUNT(DISTINCT order_id) n FROM reviews WHERE hidden = 0')!;
    const dist = Object.fromEntries([1, 2, 3, 4, 5].map(k => [k, one<{ n: number }>('SELECT COUNT(DISTINCT order_id) n FROM reviews WHERE rating = ?', k)!.n]));
    const delivered = one<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE status = 'delivered'")!.n;
    return { reviews, avg: s.avg ? Math.round(s.avg * 10) / 10 : 0, count: s.n, dist, delivered };
  });

  // Hide or show every product row of one order's review.
  admin.patch('/reviews/:orderId', async req => {
    const orderId = Number((req.params as { orderId: string }).orderId);
    const hidden = (req.body as { hidden?: boolean } | undefined)?.hidden ? 1 : 0;
    if (!one('SELECT id FROM reviews WHERE order_id = ?', orderId)) throw new HttpError(404, 'Sharh topilmadi');
    run('UPDATE reviews SET hidden = ? WHERE order_id = ?', hidden, orderId);
    return { ok: true };
  });
}
