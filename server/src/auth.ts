// CRM login: one admin password (ADMIN_PASSWORD) and signed session tokens.
// Locally, missing secrets are generated once and kept in DATA_DIR so restarts don't log everyone out.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './db.ts';

function localSecret(file: string, make: () => string) {
  const p = join(DATA_DIR, file);
  if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  const v = make();
  writeFileSync(p, v + '\n', { mode: 0o600 });
  return v;
}

const SECRET = process.env.SESSION_SECRET ?? localSecret('session-secret.txt', () => randomBytes(32).toString('hex'));
const PASSWORD = process.env.ADMIN_PASSWORD ?? localSecret('admin-password.txt', () => randomBytes(9).toString('base64url'));
// Login name; the password is the real secret, the name just has to match too.
const USERNAME = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
export const PASSWORD_SOURCE = process.env.ADMIN_PASSWORD ? 'env ADMIN_PASSWORD' : join(DATA_DIR, 'admin-password.txt');

const TTL = 7 * 24 * 3600e3;
const sign = (s: string) => createHmac('sha256', SECRET).update(s).digest('base64url');

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function login(username: string, password: string) {
  const nameOk = same(String(username ?? '').trim().toLowerCase(), USERNAME);
  if (!same(String(password ?? ''), PASSWORD) || !nameOk) return null;
  const exp = String(Date.now() + TTL);
  return `${exp}.${sign(exp)}`;
}

export function verify(token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  return !!exp && !!sig && same(sig, sign(exp)) && Number(exp) > Date.now();
}
