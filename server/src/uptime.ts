// Keeping the server up around the clock: daily database backups on the volume,
// a clean shutdown when Railway restarts or redeploys, and logging instead of silent crashes.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DATA_DIR, db } from './db.ts';

export const BACKUP_DIR = join(DATA_DIR, 'backups');
const KEEP = 7; // one per day, a week back
const DAY = 24 * 60 * 60 * 1000;

/** Writes a consistent copy of the database (safe while the app is running). */
export function backupNow() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `alatoo-${new Date().toISOString().slice(0, 10)}.db`);
  if (existsSync(file)) rmSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = listBackups().slice(KEEP);
  for (const b of old) rmSync(join(BACKUP_DIR, b.name));
  return file;
}

export const listBackups = () => existsSync(BACKUP_DIR)
  ? readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse()
    .map(name => ({ name, size: statSync(join(BACKUP_DIR, name)).size }))
  : [];

export function keepAlive(app: FastifyInstance) {
  // First backup a minute after start (once a day at most), then every 24 hours.
  const run = () => { try { app.log.info(`backup: ${backupNow()}`); } catch (e) { app.log.error(e, 'backup failed'); } };
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY).unref();

  // A stray rejected promise (a slow push or Telegram call) is logged, not fatal.
  process.on('unhandledRejection', e => app.log.error(e, 'unhandled rejection'));

  // Railway sends SIGTERM before replacing the container: finish requests, flush the database, exit.
  let closing = false;
  const stop = async (sig: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${sig}: shutting down`);
    const force = setTimeout(() => process.exit(0), 10_000);
    force.unref();
    try { await app.close(); } catch { /* already closed */ }
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch { /* best effort */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}
