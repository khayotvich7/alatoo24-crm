import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { type Area, cleanPerms, hashPassword, login, OWNER_LOGIN, PASSWORD_SOURCE, type User, verify } from './auth.ts';
import { all, one, type Row, run, tx, UPLOAD_DIR } from './db.ts';
import { notifyNewOrder } from './notify.ts';
import {
  createOrder, createProduct, fmtPhone, getOrder, HttpError, moveStock, type OrderInput, productOut, type ProductInput, publicOrder,
  setStatus, type Status, STATUSES, updateProduct,
} from './shop.ts';
import { analytics, dashboard, finance } from './stats.ts';

// ---- who is calling, and what they may do ----
type Req = FastifyRequest & { user?: User };
const userOf = (req: FastifyRequest) => (req as Req).user!;
const NO_ACCESS = "Bu bo'lim uchun ruxsatingiz yo'q";
/** Throws 403 unless the caller has at least `level` (1 view, 2 full) in one of the areas. */
function need(req: FastifyRequest, level: 1 | 2, ...areas: Area[]) {
  const u = userOf(req);
  if (u.role === 'owner') return;
  if (!areas.some(a => (u.perms[a] ?? 0) >= level)) throw new HttpError(403, NO_ACCESS);
}
function ownerOnly(req: FastifyRequest) {
  if (userOf(req).role !== 'owner') throw new HttpError(403, NO_ACCESS);
}
const isOwner = (req: FastifyRequest) => userOf(req).role === 'owner';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 1_000_000 });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/', decorateReply: false, maxAge: '30d', immutable: true });

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
  if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
  app.log.error(err);
  return reply.code(500).send({ error: 'Server xatosi' });
});

// ---------------- public API (mobile app) ----------------

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/catalog', async () => {
  const products = all('SELECT * FROM products WHERE active = 1 ORDER BY sort, id').map(p => productOut(p));
  return { products, categories: [...new Set(products.map(p => String(p.category)).filter(Boolean))] };
});

app.post('/api/orders', async (req, reply) => {
  const order = createOrder(req.body as OrderInput);
  void notifyNewOrder(order as never);
  return reply.code(201).send({ order: { ...publicOrder(order), token: order.token } });
});

app.get('/api/orders/:no', async req => {
  const { no } = req.params as { no: string };
  const { token } = req.query as { token?: string };
  const r = one<{ id: number; token: string }>('SELECT id, token FROM orders WHERE no = ?', Number(no));
  if (!r || !token || r.token !== token) throw new HttpError(404, 'Buyurtma topilmadi');
  return { order: publicOrder(getOrder(r.id)!) };
});

// The customer may cancel only while the shop has not confirmed the order yet.
app.post('/api/orders/:no/cancel', async req => {
  const { no } = req.params as { no: string };
  const { token } = req.query as { token?: string };
  const r = one<{ id: number; token: string; status: string }>('SELECT id, token, status FROM orders WHERE no = ?', Number(no));
  if (!r || !token || r.token !== token) throw new HttpError(404, 'Buyurtma topilmadi');
  if (r.status !== 'new') throw new HttpError(409, "Buyurtma tasdiqlangan, bekor qilish uchun qo'ng'iroq qiling");
  return { order: publicOrder(setStatus(r.id, 'cancelled', 'Mijoz bekor qildi')) };
});

// ---------------- CRM API ----------------

app.post('/api/admin/login', async (req, reply) => {
  const b = (req.body ?? {}) as { username?: string; password?: string };
  const token = login(b.username ?? '', b.password ?? '');
  if (!token) return reply.code(401).send({ error: "Login yoki parol noto'g'ri" });
  return { token };
});

app.register(async admin => {
  admin.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization;
    const u = verify(h?.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!u) return reply.code(401).send({ error: 'Qayta kiring' });
    (req as Req).user = u;
  });

  admin.get('/me', async req => ({ user: userOf(req) }));

  // Staff see counts only; money totals are for the owner.
  admin.get('/dashboard', async req => {
    const d = dashboard();
    if (isOwner(req)) return { ...d, money: true };
    const n = (x: { n: number }) => ({ n: x.n, s: 0 });
    return {
      ...d, money: false,
      today: n(d.today), week: n(d.week), month: n(d.month), all: n(d.all), ordered: n(d.ordered), orderedToday: n(d.orderedToday),
      statusSums: Object.fromEntries(Object.entries(d.statusSums).map(([k, v]) => [k, n(v)])),
      pendingCash: 0,
      newOrders: userOf(req).perms.orders ? d.newOrders.map(o => ({ ...(o as object), total: 0 })) : [],
    };
  });
  admin.get('/analytics', async req => { ownerOnly(req); return analytics(Number((req.query as { days?: string }).days)); });

  // Finance (owner only): cash, revenue, profit and expenses.
  admin.get('/finance', async req => { ownerOnly(req); return finance(Number((req.query as { days?: string }).days)); });
  admin.post('/expenses', async (req, reply) => {
    ownerOnly(req);
    const b = req.body as { day?: string; category?: string; amount?: number; note?: string };
    const amount = Math.round(Number(b.amount));
    if (!(amount > 0)) throw new HttpError(400, 'Summani kiriting');
    const category = String(b.category ?? '').trim().slice(0, 40);
    if (!category) throw new HttpError(400, 'Turini tanlang');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) ? String(b.day) : new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const id = run('INSERT INTO expenses (day, category, amount, note) VALUES (?,?,?,?)', day, category, amount, String(b.note ?? '').slice(0, 200)).lastInsertRowid;
    return reply.code(201).send({ id: Number(id) });
  });
  admin.delete('/expenses/:id', async req => {
    ownerOnly(req);
    run('DELETE FROM expenses WHERE id = ?', Number((req.params as { id: string }).id));
    return { ok: true };
  });

  // Staff accounts (owner only)
  const staffOut = (r: Row) => ({ id: r.id, name: r.name, phone: r.phone, login: r.login, active: !!r.active, perms: cleanPerms(JSON.parse(String(r.perms || '{}'))), createdAt: r.created_at });
  const staffInput = (b: Record<string, unknown>, creating: boolean) => {
    const name = String(b.name ?? '').trim().slice(0, 60);
    const login = String(b.login ?? '').trim().toLowerCase();
    const phone = String(b.phone ?? '').replace(/[^\d+ ]/g, '').trim().slice(0, 20);
    const password = b.password == null ? '' : String(b.password);
    if (creating || b.name !== undefined) { if (name.length < 2) throw new HttpError(400, 'Ismini yozing'); }
    if (creating || b.login !== undefined) {
      if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new HttpError(400, 'Login: 3–30 ta lotin harf, raqam, nuqta yoki chiziqcha');
      if (login === OWNER_LOGIN) throw new HttpError(400, 'Bu login band');
    }
    if (creating && password.length < 6) throw new HttpError(400, "Parol kamida 6 belgidan iborat bo'lsin");
    if (!creating && password && password.length < 6) throw new HttpError(400, "Parol kamida 6 belgidan iborat bo'lsin");
    return { name, login, phone, password };
  };
  admin.get('/staff', async req => { ownerOnly(req); return { staff: all('SELECT * FROM staff ORDER BY id').map(staffOut) }; });
  admin.post('/staff', async (req, reply) => {
    ownerOnly(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const v = staffInput(b, true);
    if (one('SELECT id FROM staff WHERE login = ?', v.login)) throw new HttpError(400, 'Bu login band');
    const id = Number(run('INSERT INTO staff (name, phone, login, pass, perms) VALUES (?,?,?,?,?)',
      v.name, v.phone, v.login, hashPassword(v.password), JSON.stringify(cleanPerms(b.perms))).lastInsertRowid);
    return reply.code(201).send({ staff: staffOut(one('SELECT * FROM staff WHERE id = ?', id)!) });
  });
  admin.patch('/staff/:id', async req => {
    ownerOnly(req);
    const id = Number((req.params as { id: string }).id);
    if (!one('SELECT id FROM staff WHERE id = ?', id)) throw new HttpError(404, 'Xodim topilmadi');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const v = staffInput(b, false);
    if (b.login !== undefined && one('SELECT id FROM staff WHERE login = ? AND id != ?', v.login, id)) throw new HttpError(400, 'Bu login band');
    if (b.name !== undefined) run('UPDATE staff SET name = ? WHERE id = ?', v.name, id);
    if (b.phone !== undefined) run('UPDATE staff SET phone = ? WHERE id = ?', v.phone, id);
    if (b.login !== undefined) run('UPDATE staff SET login = ? WHERE id = ?', v.login, id);
    if (b.perms !== undefined) run('UPDATE staff SET perms = ? WHERE id = ?', JSON.stringify(cleanPerms(b.perms)), id);
    // A new password or blocking signs the person out everywhere.
    if (v.password) run('UPDATE staff SET pass = ?, ver = ver + 1 WHERE id = ?', hashPassword(v.password), id);
    if (b.active !== undefined) run('UPDATE staff SET active = ?, ver = ver + 1 WHERE id = ?', b.active ? 1 : 0, id);
    return { staff: staffOut(one('SELECT * FROM staff WHERE id = ?', id)!) };
  });
  admin.delete('/staff/:id', async req => {
    ownerOnly(req);
    run('DELETE FROM staff WHERE id = ?', Number((req.params as { id: string }).id));
    return { ok: true };
  });

  // Orders
  admin.get('/orders', async req => {
    need(req, 1, 'orders');
    const { status, q, page } = req.query as { status?: string; q?: string; page?: string };
    const where: string[] = [], params: unknown[] = [];
    if (status && STATUSES.includes(status as Status)) { where.push('status = ?'); params.push(status); }
    if (q?.trim()) {
      const t = q.trim(), d = t.replace(/\D/g, '');
      where.push(`(name LIKE ? OR street LIKE ?${d ? ' OR phone LIKE ? OR phone2 LIKE ? OR CAST(no AS TEXT) LIKE ?' : ''})`);
      params.push(`%${t}%`, `%${t}%`, ...(d ? [`%${d}%`, `%${d}%`, `%${d}%`] : []));
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const size = 30, p = Math.max(1, Number(page) || 1);
    const total = one<{ n: number }>(`SELECT COUNT(*) n FROM orders ${w}`, ...params)!.n;
    const rows = all<Row>(
      `SELECT o.id, o.no, o.status, o.name, o.phone, o.phone2, o.region, o.street, o.total, o.created_at createdAt,
              (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) items
       FROM orders o ${w} ORDER BY o.id DESC LIMIT ${size} OFFSET ${(p - 1) * size}`, ...params,
    ).map(r => ({ ...r, phone: fmtPhone(String(r.phone)), phone2: fmtPhone(String(r.phone2)) }));
    return { total, page: p, pages: Math.max(1, Math.ceil(total / size)), orders: rows };
  });
  admin.get('/orders/:id', async req => {
    need(req, 1, 'orders');
    const o = getOrder(Number((req.params as { id: string }).id));
    if (!o) throw new HttpError(404, 'Buyurtma topilmadi');
    return { order: o };
  });
  admin.patch('/orders/:id', async req => {
    need(req, 2, 'orders');
    const id = Number((req.params as { id: string }).id);
    const b = req.body as { status?: Status; note?: string; adminNote?: string };
    const who = userOf(req).role === 'staff' ? userOf(req).name : '';
    if (b.adminNote !== undefined) run("UPDATE orders SET admin_note = ?, updated_at = datetime('now') WHERE id = ?", String(b.adminNote).slice(0, 1000), id);
    if (b.status) setStatus(id, b.status, [who, String(b.note ?? '').slice(0, 300)].filter(Boolean).join(' · '));
    const o = getOrder(id);
    if (!o) throw new HttpError(404, 'Buyurtma topilmadi');
    return { order: o };
  });

  // Products
  // Cost prices are the owner's business.
  const forUser = (req: FastifyRequest, p: ReturnType<typeof productOut>) => (isOwner(req) ? p : { ...p, costPrice: null });
  admin.get('/products', async req => {
    need(req, 1, 'products', 'stock');
    return { products: all('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY sort, id').map(p => forUser(req, productOut(p, true))) };
  });
  admin.post('/products', async (req, reply) => {
    need(req, 2, 'products');
    const b = req.body as ProductInput & { stock?: number };
    if (!isOwner(req)) b.costPrice = null;
    const id = tx(() => {
      const id = createProduct(b);
      if (b.stock && b.stock > 0) moveStock(id, 'in', Math.floor(b.stock), "Boshlang'ich qoldiq");
      return id;
    });
    return reply.code(201).send({ product: forUser(req, productOut(one('SELECT * FROM products WHERE id = ?', id)!, true)) });
  });
  admin.patch('/products/:id', async req => {
    need(req, 2, 'products');
    const id = Number((req.params as { id: string }).id);
    const b = { ...(req.body as Partial<ProductInput>) };
    if (!isOwner(req)) delete b.costPrice;
    updateProduct(id, b);
    return { product: forUser(req, productOut(one('SELECT * FROM products WHERE id = ?', id)!, true)) };
  });

  // Remove a product: hidden from the app and the CRM; order history keeps pointing at the row.
  admin.delete('/products/:id', async req => {
    need(req, 2, 'products');
    const id = Number((req.params as { id: string }).id);
    if (!one('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', id)) throw new HttpError(404, 'Tovar topilmadi');
    run("UPDATE products SET deleted_at = datetime('now'), active = 0, updated_at = datetime('now') WHERE id = ?", id);
    return { ok: true };
  });
  admin.post('/upload', async req => {
    need(req, 2, 'products');
    const f = await req.file();
    if (!f) throw new HttpError(400, 'Fayl yo‘q');
    const ext = extname(f.filename).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext) || !f.mimetype.startsWith('image/')) throw new HttpError(400, 'Faqat JPG, PNG yoki WEBP rasm');
    const buf = await f.toBuffer();
    const name = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}${ext === '.jpeg' ? '.jpg' : ext}`;
    await writeFile(join(UPLOAD_DIR, name), buf);
    return { url: `/uploads/${name}` };
  });

  // Warehouse
  admin.get('/stock/moves', async req => {
    need(req, 1, 'stock');
    const { productId } = req.query as { productId?: string };
    return {
      moves: all(
        `SELECT m.id, m.product_id productId, p.name product, m.kind, m.qty, m.note, m.created_at createdAt, o.no orderNo
         FROM stock_moves m JOIN products p ON p.id = m.product_id LEFT JOIN orders o ON o.id = m.order_id
         ${productId ? 'WHERE m.product_id = ?' : ''} ORDER BY m.id DESC LIMIT 200`, ...(productId ? [Number(productId)] : []),
      ),
    };
  });
  admin.post('/stock', async req => {
    need(req, 2, 'stock');
    const b = req.body as { productId: number; kind: 'in' | 'adjust' | 'writeoff'; qty: number; note?: string };
    if (!['in', 'adjust', 'writeoff'].includes(b.kind)) throw new HttpError(400, "Tur noto'g'ri");
    const qty = b.kind === 'writeoff' ? -Math.abs(b.qty) : b.kind === 'in' ? Math.abs(b.qty) : b.qty;
    tx(() => moveStock(Number(b.productId), b.kind, qty, String(b.note ?? '').slice(0, 200)));
    return { product: forUser(req, productOut(one('SELECT * FROM products WHERE id = ?', Number(b.productId))!, true)) };
  });

  // Customers
  admin.get('/customers', async req => {
    need(req, 1, 'customers');
    const { q } = req.query as { q?: string };
    const t = (q ?? '').trim(), d = t.replace(/\D/g, '');
    const rows = all<Row>(
      `SELECT c.id, c.name, c.phone, c.phone2, c.created_at createdAt,
              COUNT(o.id) orders, COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total END),0) spent, MAX(o.created_at) lastOrder
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       ${t ? `WHERE c.name LIKE ?${d ? ' OR c.phone LIKE ?' : ''}` : ''}
       GROUP BY c.id ORDER BY lastOrder DESC LIMIT 300`, ...(t ? [`%${t}%`, ...(d ? [`%${d}%`] : [])] : []),
    );
    return { customers: rows.map(r => ({ ...r, phone: fmtPhone(String(r.phone)), phone2: fmtPhone(String(r.phone2)) })) };
  });
  admin.get('/customers/:id', async req => {
    need(req, 1, 'customers');
    const id = Number((req.params as { id: string }).id);
    const c = one<Row>('SELECT id, name, phone, phone2, created_at createdAt FROM customers WHERE id = ?', id);
    if (!c) throw new HttpError(404, 'Mijoz topilmadi');
    return {
      customer: { ...c, phone: fmtPhone(String(c.phone)), phone2: fmtPhone(String(c.phone2)) },
      orders: all('SELECT id, no, status, total, created_at createdAt FROM orders WHERE customer_id = ? ORDER BY id DESC', id),
    };
  });
}, { prefix: '/api/admin' });

// ---------------- CRM web panel ----------------

const WEB = join(import.meta.dirname, '..', 'public');
if (existsSync(WEB)) {
  await app.register(fastifyStatic, { root: WEB, prefix: '/', decorateReply: true });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') || req.url.startsWith('/uploads/') ? reply.code(404).send({ error: 'Topilmadi' }) : reply.sendFile('index.html'),
  );
}

// A fresh database (first deploy) starts with the original catalogue.
if (!one('SELECT id FROM products LIMIT 1')) await import('./seed.ts');

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`CRM password: ${PASSWORD_SOURCE}`);
