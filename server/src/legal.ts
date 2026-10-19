// Public privacy policy and terms pages: the app stores ask for a link to each.
import type { FastifyInstance } from 'fastify';

const page = (title: string, body: string) => `<!doctype html><html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Alatoo Market</title>
<style>body{font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;max-width:760px;margin:0 auto;padding:32px 20px;color:#16213d;background:#f4ead8}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 6px}small{color:#5d6377}hr{border:0;border-top:1px solid #e6d9c2;margin:36px 0}</style></head>
<body>${body}</body></html>`;

const PRIVACY = page('Maxfiylik siyosati', `
<h1>Maxfiylik siyosati</h1><small>Alatoo Market ilovasi · Doctor Ali mahsulotlari</small>
<h2>1. Qanday ma'lumot yig'amiz</h2><p>Ismingiz, ikki telefon raqamingiz, yetkazish manzilingiz, buyurtma izohlari va buyurtmalar tarixi. Ixtiyoriy ravishda: yoshingiz, jinsingiz, vazningiz va sog'liq holati haqidagi javoblar (mutaxassis maslahati uchun). Bank kartasi ma'lumotlari yig'ilmaydi: to'lov faqat naqd.</p>
<h2>2. Nima uchun</h2><p>Buyurtmani rasmiylashtirish va yetkazish, buyurtma holati haqida xabar berish, sog'liq holatiga ko'ra mutaxassis maslahati, yordam chati va keshbek ballari uchun.</p>
<h2>3. Kimga beriladi</h2><p>Ma'lumotlar faqat buyurtmani bajarayotgan do'kon xodimlari, mutaxassis va kuryerga ko'rinadi. Uchinchi shaxslarga sotilmaydi va berilmaydi. Yordam chatidagi savollarga javob berish uchun xabar matni sun'iy intellekt xizmatiga (Anthropic) yuborilishi mumkin.</p>
<h2>4. Bildirishnomalar</h2><p>Ruxsat bersangiz, buyurtma holati, eslatmalar va aksiyalar haqida xabar yuboramiz. Telefon sozlamalarida istalgan vaqtda o'chirishingiz mumkin.</p>
<h2>5. Saqlash va o'chirish</h2><p>Ma'lumotlar O'zbekiston Respublikasining "Shaxsga doir ma'lumotlar to'g'risida"gi qonuniga muvofiq saqlanadi. Ilovada Profil → "Akkauntni o'chirish" orqali yoki +998 55 777 07 07 raqamiga qo'ng'iroq qilib ma'lumotlaringizni o'chirishni so'rashingiz mumkin.</p>
<hr>
<h1>Политика конфиденциальности</h1>
<h2>1. Какие данные мы собираем</h2><p>Имя, два номера телефона, адрес доставки, комментарии и история заказов. По желанию — возраст, пол, вес и ответы о здоровье (для консультации специалиста). Данные банковских карт не собираются: оплата только наличными.</p>
<h2>2. Зачем</h2><p>Для оформления и доставки заказов, уведомлений о статусе, консультации специалиста, чата поддержки и кешбэк-баллов.</p>
<h2>3. Кому передаются</h2><p>Данные видят только сотрудники магазина, специалист и курьер. Третьим лицам не продаются и не передаются. Текст сообщений чата поддержки может обрабатываться сервисом ИИ (Anthropic) для ответа.</p>
<h2>4. Уведомления</h2><p>С вашего разрешения присылаем статусы заказов, напоминания и акции. Отключить можно в настройках телефона.</p>
<h2>5. Хранение и удаление</h2><p>Данные хранятся в соответствии с законом Республики Узбекистан «О персональных данных». Удалить их можно в приложении (Профиль → «Удалить аккаунт») или по телефону +998 55 777 07 07.</p>`);

const TERMS = page('Ommaviy oferta', `
<h1>Ommaviy oferta</h1><small>Alatoo Market ilovasi · Doctor Ali mahsulotlari</small>
<h2>1. Umumiy qoidalar</h2><p>Ilova orqali buyurtma berish ushbu oferta shartlariga rozilik bildirishni anglatadi.</p>
<h2>2. Buyurtma</h2><p>Buyurtma operator telefon orqali tasdiqlagandan keyin kuchga kiradi. Narxlar buyurtma berilgan paytdagi holatda qayd etiladi. Buyurtma kuryerga berilgunga qadar ilovada sabab ko'rsatib bekor qilinishi mumkin.</p>
<h2>3. To'lov</h2><p>To'lov faqat naqd pulda, mahsulotni qabul qilganda kuryerga amalga oshiriladi. Keshbek ballari buyurtma summasining bir qismini to'lash uchun ishlatilishi mumkin; ballar pulga almashtirilmaydi.</p>
<h2>4. Yetkazish</h2><p>Buyurtma rasmiylashtirilgan paytdan boshlab belgilangan muddatda ko'rsatilgan manzilga yetkaziladi.</p>
<h2>5. Qaytarish</h2><p>Sifatsiz yoki noto'g'ri mahsulot qabul qilish paytida qaytarilishi mumkin. Savollar: +998 55 777 07 07.</p>`);

export function registerLegal(app: FastifyInstance) {
  app.get('/privacy', async (_req, reply) => reply.type('text/html; charset=utf-8').send(PRIVACY));
  app.get('/terms', async (_req, reply) => reply.type('text/html; charset=utf-8').send(TERMS));
}
