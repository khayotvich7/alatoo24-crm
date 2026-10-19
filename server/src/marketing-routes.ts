// HTTP routes for marketing: public ones for the app, admin ones for the CRM's Marketing page.
import type { FastifyInstance } from 'fastify';
import { all, one, run } from './db.ts';
import { activeBanners, broadcast, findPromo, getSettings, me, registerDevice, saveSettings } from './marketing.ts';
import { validPushToken } from './push.ts';
import { HttpError } from './shop.ts';

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const date = (v: unknown) => {
  const s = str(v, 30);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Sana noto'g'ri");
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

export function registerMarketing(app: FastifyInstance) {
  // Everything the app needs at start: banners and the numbers it shows or uses for reminders.
  app.get('/api/config', async () => {
    const s = getSettings();
    return {
      banners: activeBanners(),
      cashbackPct: s.cashback_pct, maxPointsPct: s.max_points_pct, referralFriendPct: s.referral_friend_pct,
      referralBonusPct: s.referral_bonus_pct, bottleDays: s.bottle_days, remindBefore: s.remind_before,
    };
  });

  app.post('/api/promo/check', async req => {
    const b = (req.body ?? {}) as { code?: string; phone?: string };
    const hit = findPromo(str(b.code, 40), str(b.phone, 20).replace(/\D/g, '').slice(-9));
    if (!hit) throw new HttpError(404, 'Promokod topilmadi yoki muddati tugagan');
    return { code: hit.code, percent: hit.percent, title: hit.title, kind: hit.kind, firstOrderOnly: hit.firstOrderOnly };
  });

  // Points balance, referral code and history for the device holding the customer token.
  app.get('/api/me', async req => {
    const r = me(str((req.query as { token?: string }).token, 80));
    if (!r) throw new HttpError(404, 'Mijoz topilmadi');
    return r;
  });

  app.post('/api/push/register', async req => {
    const t = validPushToken(((req.body ?? {}) as { token?: string }).token);
    if (!t) throw new HttpError(400, "Token noto'g'ri");
    registerDevice(t);
    return { ok: true };
  });
}

export function registerMarketingAdmin(admin: FastifyInstance) {
  admin.get('/settings', async () => getSettings());
  admin.put('/settings', async req => {
    try { return saveSettings((req.body ?? {}) as Record<string, unknown>); }
    catch (e) { throw new HttpError(400, (e as Error).message); }
  });

  admin.get('/promos', async () => ({
    promos: all(`SELECT p.id, p.code, p.percent, p.first_order_only firstOrderOnly, p.active, p.ends_at endsAt, p.title, p.created_at createdAt,
                        (SELECT COUNT(*) FROM orders o WHERE o.promo = p.code AND o.status != 'cancelled') uses
                 FROM promos p ORDER BY p.id DESC`),
  }));
  admin.post('/promos', async req => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const code = str(b.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const percent = Math.round(Number(b.percent));
    if (code.length < 3) throw new HttpError(400, 'Kod kamida 3 belgi');
    if (!(percent >= 1 && percent <= 90)) throw new HttpError(400, 'Chegirma 1–90%');
    if (one('SELECT id FROM promos WHERE code = ?', code) || one('SELECT id FROM customers WHERE ref_code = ?', code)) throw new HttpError(409, 'Bunday kod bor');
    run('INSERT INTO promos (code, percent, first_order_only, ends_at, title) VALUES (?,?,?,?,?)', code, percent, b.firstOrderOnly ? 1 : 0, date(b.endsAt), str(b.title, 80));
    return { ok: true };
  });
  admin.patch('/promos/:id', async req => {
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.active !== undefined) run('UPDATE promos SET active = ? WHERE id = ?', b.active ? 1 : 0, id);
    if (b.endsAt !== undefined) run('UPDATE promos SET ends_at = ? WHERE id = ?', date(b.endsAt), id);
    if (b.title !== undefined) run('UPDATE promos SET title = ? WHERE id = ?', str(b.title, 80), id);
    return { ok: true };
  });
  admin.delete('/promos/:id', async req => {
    run('DELETE FROM promos WHERE id = ?', Number((req.params as { id: string }).id));
    return { ok: true };
  });

  admin.get('/banners', async () => ({
    banners: all('SELECT id, title, subtitle, image, cta, product_id productId, ends_at endsAt, active, sort FROM banners ORDER BY sort, id DESC'),
  }));
  admin.post('/banners', async req => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const title = str(b.title, 80);
    if (title.length < 2) throw new HttpError(400, 'Sarlavha yozing');
    const pid = b.productId ? Number(b.productId) : null;
    if (pid && !one('SELECT id FROM products WHERE id = ?', pid)) throw new HttpError(400, 'Tovar topilmadi');
    run('INSERT INTO banners (title, subtitle, image, cta, product_id, ends_at, sort) VALUES (?,?,?,?,?,?,?)',
      title, str(b.subtitle, 140), str(b.image, 300), str(b.cta, 30) || "Ko'rish", pid, date(b.endsAt), Math.round(Number(b.sort ?? 0)) || 0);
    return { ok: true };
  });
  admin.patch('/banners/:id', async req => {
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.active !== undefined) run('UPDATE banners SET active = ? WHERE id = ?', b.active ? 1 : 0, id);
    if (b.sort !== undefined) run('UPDATE banners SET sort = ? WHERE id = ?', Math.round(Number(b.sort)) || 0, id);
    return { ok: true };
  });
  admin.delete('/banners/:id', async req => {
    run('DELETE FROM banners WHERE id = ?', Number((req.params as { id: string }).id));
    return { ok: true };
  });

  admin.get('/broadcasts', async () => ({
    reach: one<{ n: number }>("SELECT COUNT(*) n FROM (SELECT token t FROM devices UNION SELECT push_token t FROM orders WHERE push_token <> '')")!.n,
    broadcasts: all('SELECT id, title, body, sent, created_at createdAt FROM broadcasts ORDER BY id DESC LIMIT 50'),
  }));
  admin.post('/broadcast', async req => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const title = str(b.title, 60), body = str(b.body, 180);
    if (title.length < 2 || body.length < 2) throw new HttpError(400, 'Sarlavha va matnni yozing');
    return broadcast(title, body);
  });
}
