// CRM login. The owner signs in with ADMIN_USERNAME / ADMIN_PASSWORD (env); staff accounts live in the
// `staff` table with scrypt-hashed passwords. Sessions are HMAC-signed tokens "uid.ver.exp.sig".
// Locally, missing secrets are generated once and kept in DATA_DIR so restarts don't log everyone out.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, one, run } from './db.ts';

function localSecret(file: string, make: () => string) {
  const p = join(DATA_DIR, file);
  if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  const v = make();
  writeFileSync(p, v + '\n', { mode: 0o600 });
  return v;
}

const SECRET = process.env.SESSION_SECRET ?? localSecret('session-secret.txt', () => randomBytes(32).toString('hex'));
const PASSWORD = process.env.ADMIN_PASSWORD ?? localSecret('admin-password.txt', () => randomBytes(9).toString('base64url'));
export const OWNER_LOGIN = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
export const PASSWORD_SOURCE = process.env.ADMIN_PASSWORD ? 'env ADMIN_PASSWORD' : join(DATA_DIR, 'admin-password.txt');

/** Access per CRM section: 0 = hidden, 1 = view only, 2 = full. */
export const AREAS = ['orders', 'products', 'stock', 'customers'] as const;
export type Area = (typeof AREAS)[number];
export type Perms = Record<Area, number>;
export type User = { id: number; role: 'owner' | 'staff' | 'api'; name: string; login: string; perms: Perms };

const FULL: Perms = { orders: 2, products: 2, stock: 2, customers: 2 };
const OWNER: User = { id: 0, role: 'owner', name: 'Rahbar', login: OWNER_LOGIN, perms: FULL };

export function cleanPerms(p: unknown): Perms {
  const src = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  return Object.fromEntries(AREAS.map(a => [a, Math.max(0, Math.min(a === 'customers' ? 1 : 2, Math.floor(Number(src[a]) || 0)))])) as Perms;
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
function checkPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const got = scryptSync(pw, Buffer.from(salt, 'hex'), 32), want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

const TTL = 7 * 24 * 3600e3;
const sign = (s: string) => createHmac('sha256', SECRET).update(s).digest('base64url');
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const issue = (uid: number, ver: number) => {
  const body = `${uid}.${ver}.${Date.now() + TTL}`;
  return `${body}.${sign(body)}`;
};

type StaffRow = { id: number; name: string; login: string; pass: string; perms: string; active: number; ver: number };
const staffUser = (r: StaffRow): User => ({ id: r.id, role: 'staff', name: r.name, login: r.login, perms: cleanPerms(JSON.parse(r.perms || '{}')) });

export function login(username: string, password: string) {
  const name = String(username ?? '').trim().toLowerCase();
  const pw = String(password ?? '');
  if (same(name, OWNER_LOGIN)) return same(pw, PASSWORD) ? issue(0, 0) : null;
  const r = one<StaffRow>('SELECT * FROM staff WHERE login = ? AND active = 1', name);
  if (!r) { hashPassword(pw); return null; } // same work either way, so timing doesn't reveal logins
  return checkPassword(pw, r.pass) ? issue(r.id, r.ver) : null;
}

// ---- API keys for other sites/services: "ak_<random>", sent as `X-API-Key` or `Authorization: Bearer`. ----
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
export function newApiKey() {
  const key = `ak_${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 9) };
}
function verifyApiKey(key: string): User | null {
  const r = one<{ id: number; name: string; perms: string; last_used: string | null }>('SELECT id, name, perms, last_used FROM api_keys WHERE hash = ?', hashKey(key));
  if (!r) return null;
  run("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?", r.id);
  return { id: r.id, role: 'api', name: `API: ${r.name}`, login: `api-${r.id}`, perms: cleanPerms(JSON.parse(r.perms || '{}')) };
}

export function verify(token: string | undefined): User | null {
  if (!token) return null;
  if (token.startsWith('ak_')) return verifyApiKey(token);
  const parts = token.split('.');
  // Sessions from before staff accounts existed: "exp.sig", always the owner.
  if (parts.length === 2) {
    const [exp, sig] = parts;
    return same(sig, sign(exp)) && Number(exp) > Date.now() ? OWNER : null;
  }
  if (parts.length !== 4) return null;
  const [uid, ver, exp, sig] = parts;
  if (!same(sig, sign(`${uid}.${ver}.${exp}`)) || !(Number(exp) > Date.now())) return null;
  if (uid === '0') return OWNER;
  const r = one<StaffRow>('SELECT * FROM staff WHERE id = ? AND active = 1', Number(uid));
  return r && String(r.ver) === ver ? staffUser(r) : null;
}
