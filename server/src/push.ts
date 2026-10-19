// Phone notifications for the three delivery steps, sent through Expo's push service
// (no key needed; the app hands us its Expo push token with the order).
import { one } from './db.ts';

const MESSAGES: Record<'placed' | 'courier' | 'delivered', (no: number) => { title: string; body: string }> = {
  placed: no => ({ title: 'Buyurtma rasmiylashtirildi ✅', body: `№ ${no} qabul qilindi. Operator tez orada qo'ng'iroq qiladi.` }),
  courier: no => ({ title: 'Buyurtma kuryerda 🚚', body: `№ ${no} yo'lda. To'lov qabul qilganda, naqd.` }),
  delivered: no => ({ title: 'Yetkazildi 🎉', body: `№ ${no} yetkazildi. Xaridingiz uchun rahmat!` }),
};

export const validPushToken = (t: unknown) =>
  typeof t === 'string' && /^Expo(nent)?PushToken\[[\w-]+\]$/.test(t) ? t : '';

export async function pushOrder(token: string, no: number, kind: keyof typeof MESSAGES) {
  if (!token) return;
  try {
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ to: token, sound: 'default', channelId: 'orders', data: { no }, ...MESSAGES[kind](no) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error('push failed', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.error('push failed', e);
  }
}

export async function pushOrderStatus(orderId: number, status: 'ready' | 'delivered') {
  const o = one<{ no: number; push_token: string }>('SELECT no, push_token FROM orders WHERE id = ?', orderId);
  if (o) await pushOrder(o.push_token, o.no, status === 'ready' ? 'courier' : status);
}
