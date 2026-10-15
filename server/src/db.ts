// SQLite through Node's built-in driver: one file, no external database to run.
// On Railway the file lives on a mounted volume (DATA_DIR) so it survives deploys.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'alatoo.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  short       TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL,
  old_price   INTEGER,
  tag         TEXT,
  is_new      INTEGER NOT NULL DEFAULT 0,
  volume      TEXT,
  description TEXT NOT NULL DEFAULT '',
  images      TEXT NOT NULL DEFAULT '[]',   -- JSON array of /uploads/... paths
  tint        TEXT NOT NULL DEFAULT '#15703b',
  bg          TEXT NOT NULL DEFAULT '#e2f1e6',
  bundles     TEXT NOT NULL DEFAULT '[]',   -- JSON [{label, mult, off}]
  stock       INTEGER NOT NULL DEFAULT 0,
  low_stock   INTEGER NOT NULL DEFAULT 10,
  cost_price  INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  phone2      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  no          INTEGER NOT NULL UNIQUE,
  token       TEXT NOT NULL,                -- lets the app read its own order without an account
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  phone2      TEXT NOT NULL,
  region      TEXT NOT NULL,
  street      TEXT NOT NULL,
  flat        TEXT NOT NULL DEFAULT '',
  landmark    TEXT NOT NULL DEFAULT '',
  comment     TEXT NOT NULL DEFAULT '',
  subtotal    INTEGER NOT NULL,
  discount    INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL,
  promo       TEXT,
  status      TEXT NOT NULL DEFAULT 'new',  -- new | confirmed | courier | delivered | cancelled
  admin_note  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,
  qty         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every stock change: incoming goods (in), sold on delivery (sale), returned (return), manual fix (adjust).
CREATE TABLE IF NOT EXISTS stock_moves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  kind        TEXT NOT NULL,
  qty         INTEGER NOT NULL,             -- signed: + adds to stock, - removes
  order_id    INTEGER REFERENCES orders(id),
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration: products are removed with a soft delete (deleted_at) so old orders keep their product rows.
if (!(db.prepare('PRAGMA table_info(products)').all() as { name: string }[]).some(c => c.name === 'deleted_at')) {
  db.exec('ALTER TABLE products ADD COLUMN deleted_at TEXT');
}

// Staff accounts (the owner logs in with ADMIN_USERNAME/ADMIN_PASSWORD) and business expenses.
db.exec(`
CREATE TABLE IF NOT EXISTS staff (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  login       TEXT NOT NULL UNIQUE,
  pass        TEXT NOT NULL,                -- scrypt "salt:hash"
  perms       TEXT NOT NULL DEFAULT '{}',   -- {"orders":0|1|2,"products":..,"stock":..,"customers":..}
  active      INTEGER NOT NULL DEFAULT 1,
  ver         INTEGER NOT NULL DEFAULT 1,   -- bumped on password change / block: old sessions stop working
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         TEXT NOT NULL,                -- YYYY-MM-DD, Tashkent date
  category    TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS expenses_day ON expenses(day);
`);

export type Row = Record<string, unknown>;

export const all = <T = Row>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as never[])) as T[];
export const one = <T = Row>(sql: string, ...params: unknown[]) => db.prepare(sql).get(...(params as never[])) as T | undefined;
export const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...(params as never[]));

/** Runs fn inside a transaction; rolls back if it throws. */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
