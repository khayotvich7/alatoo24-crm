// One-time import of the catalogue the app shipped with. Skips if products already exist.
// Usage: node src/seed.ts [path-to-app-assets/products]
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { one, tx, UPLOAD_DIR } from './db.ts';
import { createProduct } from './shop.ts';

const SRC = process.argv[2] ?? join(import.meta.dirname, '..', 'seed');

const BOTTLES = [{ label: '1 shisha', mult: 1 }, { label: '3 shisha', mult: 3, off: '−10%' }, { label: '6 shisha', mult: 6, off: '−16%' }];
const UNITS = [{ label: '1 dona', mult: 1 }, { label: '2 dona', mult: 2, off: '−5%' }, { label: '3 dona', mult: 3, off: '−10%' }];

const P = [
  { name: 'Alatoo papayya ichimligi, 0,5 L', short: 'Papayya', category: 'Alatoo', price: 85000, oldPrice: 99000, tag: '-14%', photos: ['cover', 'tall', 'studio', 'lying', 'pair'], tint: '#f08a24', bg: '#eef3ea', volume: '0,5 L, shisha', bundles: BOTTLES,
    description: "Alatoo tabiiy papayya ichimligi. Shisha idishda, sovg'abop qutida. Kuniga 1–2 stakan, sovutib ichish tavsiya etiladi. Tarkibi va sertifikatlar quti yorlig'ida ko'rsatilgan." },
  { name: 'Alatoo papayya, 3 shisha (kurs)', short: '3 shisha', category: 'Alatoo', price: 229000, oldPrice: 255000, tag: '-10%', photos: ['pair', 'studio', 'lying'], tint: '#f08a24', bg: '#eef3ea', volume: '3 × 0,5 L', bundles: UNITS,
    description: "Bir oylik kurs uchun 3 shisha Alatoo. Donalab olishdan 26 000 so'm arzon." },
  { name: 'Alatoo papayya, 6 shisha (oilaviy)', short: '6 shisha', category: 'Alatoo', price: 429000, oldPrice: 510000, tag: '-16%', photos: ['hero', 'tall', 'scene', 'box'], tint: '#f08a24', bg: '#eef3ea', volume: '6 × 0,5 L', bundles: UNITS,
    description: "Oila uchun eng foydali to'plam: 6 shisha Alatoo va sovg'a qutisi. To'lov naqd, qabul qilganda." },
  { name: "Tog' asali, gulli, 500 g", short: "Tog' asali", category: 'Asal', price: 89000, tint: '#e9a23b', bg: '#fbf0dc', volume: '500 g', bundles: UNITS,
    description: "Tog' etaklaridagi gulli o'tloqlardan yig'ilgan tabiiy asal. Choy, bo'tqa va shirinliklarga qo'shish uchun. Quruq, salqin joyda saqlang: vaqt o'tib kristallanishi tabiiy holat." },
  { name: "Asal va yong'oq aralashmasi, 450 g", short: "Asal+yong'oq", category: 'Asal', price: 110000, oldPrice: 128000, tag: '-14%', tint: '#c9852f', bg: '#f8ebd8', volume: '450 g', bundles: UNITS,
    description: "Tabiiy asal va saralangan yong'oq mag'zi aralashmasi. Nonushta yoki choy bilan tayyor shirinlik. Ochilgandan keyin qopqog'ini mahkam yoping." },
  { name: "Yong'oq mag'zi, saralangan, 500 g", short: "Yong'oq", category: "Yong'oqlar", price: 75000, tint: '#8f6a43', bg: '#efe6dc', volume: '500 g', bundles: UNITS,
    description: "Qo'lda saralangan, po'chog'idan tozalangan yong'oq mag'zi. Salatlar, pishiriqlar va tamaddi uchun. Muzlatkichda uzoqroq saqlanadi." },
  { name: "Quritilgan o'rik, 1 kg", short: "O'rik", category: 'Quruq mevalar', price: 65000, oldPrice: 79000, tag: '-18%', tint: '#f08a2c', bg: '#fdeedd', volume: '1 kg', bundles: UNITS,
    description: "Quyoshda quritilgan o'rik, qo'shimcha shakarsiz. Kompot, palov va pishiriqlar uchun yoki o'zicha tamaddi sifatida." },
  { name: "Tog' o'tlari choyi, 100 g", short: "Tog' choyi", category: 'Choy', price: 42000, tint: '#4f9a6a', bg: '#e5f1e8', volume: '100 g', bundles: UNITS,
    description: "Tog' o'tlaridan tayyorlangan xushbo'y choy yig'masi. 1 choy qoshiq yig'mani 250 ml qaynoq suvga solib, 5–7 daqiqa damlang." },
  { name: "Na'matak sharbati, 500 ml", short: "Na'matak", category: 'Ichimliklar', price: 48000, tag: 'Yangi', isNew: true, tint: '#c7362f', bg: '#f9e3e1', volume: '500 ml', bundles: UNITS,
    description: "Na'matak mevasidan tayyorlangan sharbat. Sovutib iching, ochilgandan keyin muzlatkichda saqlang." },
  { name: "Yong'oq moyi, sovuq presslangan, 250 ml", short: "Yong'oq moyi", category: 'Moylar', price: 120000, tint: '#d6b04a', bg: '#f7f0d9', volume: '250 ml', bundles: UNITS,
    description: "Sovuq usulda presslangan yong'oq moyi. Salat va tayyor taomlarga qo'shish uchun, qovurishga mo'ljallanmagan. Qorong'i, salqin joyda saqlang." },
  { name: 'Pista, tuzlangan, 500 g', short: 'Pista', category: "Yong'oqlar", price: 135000, tag: 'Yangi', isNew: true, tint: '#8db35b', bg: '#edf3e2', volume: '500 g', bundles: UNITS,
    description: 'Qovurilgan va yengil tuzlangan pista. Tamaddi va mehmon dasturxoni uchun.' },
  { name: "Alatoo sovg'a to'plami, 6 mahsulot", short: "Sovg'a", category: "Sovg'alar", price: 349000, oldPrice: 420000, tag: '-17%', tint: '#15703b', bg: '#e2f1e6', volume: '6 mahsulot', bundles: UNITS,
    description: "Alatoo mahsulotlaridan tuzilgan sovg'a to'plami, chiroyli qutida. Bayram va mehmondorchilik uchun tayyor sovg'a." },
];

if (one('SELECT id FROM products LIMIT 1')) {
  console.log('Products already exist, nothing to seed.');
} else {
  tx(() => P.forEach((p, i) => {
    const images = (p.photos ?? []).flatMap(ph => {
      const src = join(SRC, `${ph}.jpg`);
      if (!existsSync(src)) return [];
      copyFileSync(src, join(UPLOAD_DIR, `seed-${ph}.jpg`));
      return [`/uploads/seed-${ph}.jpg`];
    });
    const { photos: _p, ...rest } = p;
    createProduct({ ...rest, images, sort: i, lowStock: 10 });
  }));
  console.log(`Seeded ${P.length} products (stock 0: record real arrivals in Ombor).`);
}
