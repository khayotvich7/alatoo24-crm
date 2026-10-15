// Numbers for the CRM dashboard and analytics. Times are stored in UTC; reports use Tashkent time (UTC+5).
import { all, one } from './db.ts';

const LOCAL = "'+5 hours'";
const day = (col: string) => `date(${col}, ${LOCAL})`;

export function dashboard() {
  const today = `${day("'now'")}`;
  const sum = (where: string) => one<{ n: number; s: number }>(
    `SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE status = 'delivered' AND ${where}`,
  )!;
  const period = (expr: string) => sum(`${day('delivered_at')} >= ${expr}`);
  return {
    today: period(today),
    week: period(`date(${today}, '-6 days')`),
    month: period(`date(${today}, 'start of month')`),
    all: sum('1=1'),
    byStatus: Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) n FROM orders GROUP BY status').map(r => [r.status, r.n])),
    // Count and money per status, for the dashboard tiles (on the way, cancelled, delivered...).
    statusSums: Object.fromEntries(all<{ status: string; n: number; s: number }>('SELECT status, COUNT(*) n, COALESCE(SUM(total),0) s FROM orders GROUP BY status').map(r => [r.status, { n: r.n, s: r.s }])),
    // Everything customers ordered except cancellations: the headline number.
    ordered: one<{ n: number; s: number }>("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled'")!,
    orderedToday: one<{ n: number; s: number }>(`SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND ${day('created_at')} = ${today}`)!,
    // Cash the couriers still have to bring in: confirmed/out for delivery orders.
    pendingCash: one<{ s: number }>("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status IN ('confirmed','ready','courier')")!.s,
    newOrders: all(`SELECT id, no, name, phone, total, created_at createdAt FROM orders WHERE status = 'new' ORDER BY id DESC LIMIT 8`),
    lowStock: all('SELECT id, name, stock, low_stock lowStock FROM products WHERE active = 1 AND stock <= low_stock ORDER BY stock LIMIT 10'),
    customers: one<{ n: number }>('SELECT COUNT(*) n FROM customers')!.n,
  };
}

export function analytics(days: number) {
  const d = Math.min(Math.max(Math.floor(days) || 30, 7), 365);
  const from = `date(${day("'now'")}, '-${d - 1} days')`;
  const series = all<{ day: string; orders: number; revenue: number }>(
    `SELECT ${day('delivered_at')} day, COUNT(*) orders, SUM(total) revenue FROM orders
     WHERE status = 'delivered' AND ${day('delivered_at')} >= ${from} GROUP BY day ORDER BY day`,
  );
  // Fill days without sales so the chart has a continuous axis.
  const byDay = new Map(series.map(r => [r.day, r]));
  const start = new Date(Date.now() + 5 * 3600e3);
  const filled = Array.from({ length: d }, (_, i) => {
    const t = new Date(start.getTime() - (d - 1 - i) * 864e5).toISOString().slice(0, 10);
    return byDay.get(t) ?? { day: t, orders: 0, revenue: 0 };
  });
  const totals = one<{ n: number; s: number; items: number }>(
    `SELECT COUNT(*) n, COALESCE(SUM(total),0) s,
            (SELECT COALESCE(SUM(qty),0) FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id WHERE o2.status = 'delivered' AND ${day('o2.delivered_at')} >= ${from}) items
     FROM orders WHERE status = 'delivered' AND ${day('delivered_at')} >= ${from}`,
  )!;
  const created = one<{ n: number; c: number }>(
    `SELECT COUNT(*) n, SUM(status = 'cancelled') c FROM orders WHERE ${day('created_at')} >= ${from}`,
  )!;
  return {
    days: d,
    series: filled,
    revenue: totals.s,
    orders: totals.n,
    itemsSold: totals.items,
    avgCheck: totals.n ? Math.round(totals.s / totals.n) : 0,
    cancelRate: created.n ? Math.round(((created.c ?? 0) / created.n) * 100) : 0,
    topProducts: all(
      `SELECT oi.product_id id, oi.name, SUM(oi.qty) qty, SUM(oi.qty * oi.price) revenue FROM order_items oi
       JOIN orders o ON o.id = oi.order_id WHERE o.status = 'delivered' AND ${day('o.delivered_at')} >= ${from}
       GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 8`,
    ),
    byRegion: all(
      `SELECT region, COUNT(*) orders, SUM(total) revenue FROM orders
       WHERE status = 'delivered' AND ${day('delivered_at')} >= ${from} GROUP BY region ORDER BY revenue DESC`,
    ),
    byWeekday: all<{ wd: number; orders: number; revenue: number }>(
      `SELECT CAST(strftime('%w', created_at, ${LOCAL}) AS INTEGER) wd, COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders
       WHERE status != 'cancelled' AND ${day('created_at')} >= ${from} GROUP BY wd ORDER BY wd`,
    ),
    byHour: all<{ h: number; orders: number }>(
      `SELECT CAST(strftime('%H', created_at, ${LOCAL}) AS INTEGER) h, COUNT(*) orders FROM orders
       WHERE status != 'cancelled' AND ${day('created_at')} >= ${from} GROUP BY h ORDER BY h`,
    ),
    byCategory: all<{ category: string; revenue: number; qty: number }>(
      `SELECT COALESCE(NULLIF(p.category, ''), 'Boshqa') category, SUM(oi.qty * oi.price) revenue, SUM(oi.qty) qty FROM order_items oi
       JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.status = 'delivered' AND ${day('o.delivered_at')} >= ${from} GROUP BY category ORDER BY revenue DESC`,
    ),
    byStatus: all<{ status: string; n: number; s: number }>(
      `SELECT status, COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE ${day('created_at')} >= ${from} GROUP BY status`,
    ),
    topCustomers: all<{ id: number; name: string; orders: number; revenue: number }>(
      `SELECT c.id, c.name, COUNT(o.id) orders, SUM(o.total) revenue FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status = 'delivered' AND ${day('o.delivered_at')} >= ${from} GROUP BY c.id ORDER BY revenue DESC LIMIT 6`,
    ),
    // Hours from order to delivery, averaged.
    avgDeliveryHours: Math.round(one<{ h: number | null }>(
      `SELECT AVG((julianday(delivered_at) - julianday(created_at)) * 24) h FROM orders WHERE status = 'delivered' AND ${day('delivered_at')} >= ${from}`,
    )!.h ?? 0),
    // Profit only where a cost price is known; coverage says how much of revenue that is.
    profit: one<{ profit: number; covered: number }>(
      `SELECT COALESCE(SUM((oi.price - p.cost_price) * oi.qty),0) profit, COALESCE(SUM(oi.price * oi.qty),0) covered FROM order_items oi
       JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
       WHERE p.cost_price IS NOT NULL AND o.status = 'delivered' AND ${day('o.delivered_at')} >= ${from}`,
    )!,
    stock: all<{ id: number; name: string; stock: number; price: number; cost: number | null; sold: number }>(
      `SELECT p.id, p.name, p.stock, p.price, p.cost_price cost,
              COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                        WHERE oi.product_id = p.id AND o.status = 'delivered' AND ${day('o.delivered_at')} >= ${from}), 0) sold
       FROM products p WHERE p.active = 1 ORDER BY p.sort, p.id`,
    ).map(r => ({ ...r, daysLeft: r.sold > 0 ? Math.floor(r.stock / (r.sold / d)) : null })),
    repeatCustomers: one<{ n: number }>(
      "SELECT COUNT(*) n FROM (SELECT customer_id FROM orders WHERE status = 'delivered' GROUP BY customer_id HAVING COUNT(*) > 1)",
    )!.n,
  };
}

/** Owner-only money view: cash in hand / on the way, revenue, profit after product cost and expenses. */
export function finance(days: number) {
  const a = analytics(days);
  const d = a.days;
  const today = day("'now'");
  const from = `date(${today}, '-${d - 1} days')`;
  const delivered = (expr: string) => one<{ s: number; n: number }>(
    `SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM orders WHERE status = 'delivered' AND ${day('delivered_at')} >= ${expr}`,
  )!;
  const status = (list: string) => one<{ s: number; n: number }>(`SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM orders WHERE status IN (${list})`)!;
  const expenses = all<{ id: number; day: string; category: string; amount: number; note: string }>(
    `SELECT id, day, category, amount, note FROM expenses WHERE day >= ${from} ORDER BY day DESC, id DESC`,
  );
  const expTotal = expenses.reduce((x, e) => x + e.amount, 0);
  const byCat = new Map<string, number>();
  for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  const expByDay = new Map<string, number>();
  for (const e of expenses) expByDay.set(e.day, (expByDay.get(e.day) ?? 0) + e.amount);
  // Product cost of goods sold where a cost price is known.
  const cogs = a.profit.covered - a.profit.profit;
  const gross = a.revenue - cogs;
  return {
    days: d,
    kassa: {
      onTheWay: status("'courier'"),                // courier holds this cash right now
      expected: status("'confirmed','ready'"),      // confirmed, not yet handed to the courier
      today: delivered(today),
      week: delivered(`date(${today}, '-6 days')`),
      month: delivered(`date(${today}, 'start of month')`),
    },
    revenue: a.revenue,
    orders: a.orders,
    cogs,
    costCoverage: a.revenue ? Math.round((a.profit.covered / a.revenue) * 100) : 0,
    gross,
    expenses: expTotal,
    net: gross - expTotal,
    expensesByCategory: [...byCat].map(([category, amount]) => ({ category, amount })).sort((x, y) => y.amount - x.amount),
    series: a.series.map(r => ({ day: r.day, revenue: r.revenue ?? 0, expenses: expByDay.get(r.day) ?? 0 })),
    list: expenses,
  };
}
