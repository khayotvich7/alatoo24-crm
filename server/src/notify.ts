// New-order alert to the shop's Telegram group. Optional: runs only when both env vars are set.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const money = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

type O = {
  no: unknown; name: unknown; phone: unknown; phone2: unknown; total: unknown; discount: unknown; comment: unknown;
  address: { region: unknown; street: unknown; flat: unknown; landmark: unknown };
  items: { name?: unknown; qty?: unknown; price?: unknown }[];
};

export async function notifyNewOrder(o: O) {
  if (!TOKEN || !CHAT) return;
  const a = o.address;
  const lines = [
    `🛒 <b>Yangi buyurtma № ${esc(o.no)}</b>`,
    '',
    ...o.items.map(i => `• ${esc(i.name)} × ${esc(i.qty)} = ${money(Number(i.price) * Number(i.qty))}`),
    '',
    `💰 <b>Jami (naqd): ${money(Number(o.total))}</b>${Number(o.discount) ? ` (chegirma ${money(Number(o.discount))})` : ''}`,
    `👤 ${esc(o.name)}`,
    `📞 +998 ${esc(o.phone)}  /  +998 ${esc(o.phone2)}`,
    `📍 ${esc(a.region)}, ${esc(a.street)}${a.flat ? `, ${esc(a.flat)}-xonadon` : ''}${a.landmark ? ` (mo'ljal: ${esc(a.landmark)})` : ''}`,
    o.comment ? `💬 ${esc(o.comment)}` : '',
  ].filter(l => l !== null);
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: lines.join('\n'), parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error('telegram notify failed', e);
  }
}
