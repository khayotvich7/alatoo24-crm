// Thin client for the CRM API. The session token lives in localStorage so a reload keeps you signed in.
const KEY = 'alatoo.crm.token';

export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const t = getToken();
  if (t) headers.set('authorization', `Bearer ${t}`);
  const r = await fetch(path, { ...init, headers });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/admin/login') { setToken(null); onUnauthorized(); }
  if (!r.ok) throw new ApiError(r.status, data.error ?? 'Xatolik');
  return data as T;
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

// ---- types shared by pages ----

export type Status = 'new' | 'checking' | 'confirmed' | 'ready' | 'delivered' | 'cancelled';

export type OrderRow = {
  id: number; no: number; status: Status; name: string; phone: string; phone2: string;
  region: string; street: string; total: number; items: number; createdAt: string; consult: Consult;
};

/** Specialist check for customers with a listed health condition. */
export type Consult = '' | 'needed' | 'approved' | 'rejected';

export type Order = {
  id: number; no: number; status: Status; name: string; phone: string; phone2: string;
  address: { region: string; street: string; flat: string; landmark: string };
  comment: string; subtotal: number; discount: number; total: number; promo: string | null; adminNote: string;
  customerId: number; createdAt: string; updatedAt: string; deliveredAt: string | null;
  items: { id: number; name: string; price: number; qty: number }[];
  events: { status: Status; note: string; createdAt: string }[];
  consult: Consult;
  cancelReason: string;
  health: { age: number | null; gender: string; weight: number | null; conditions: string[]; other: string } | null;
};

export type Bundle = { label: string; mult: number; off?: string };
export type Product = {
  id: number; name: string; short: string; category: string; price: number; oldPrice: number | null; tag: string | null;
  isNew: boolean; volume: string | null; description: string; images: string[]; tint: string; bg: string; bundles: Bundle[];
  stock: number; lowStock: number; costPrice: number | null; active: boolean; sort: number; updatedAt: string;
};

export type Move = { id: number; productId: number; product: string; kind: string; qty: number; note: string; createdAt: string; orderNo: number | null };

export type Customer = { id: number; name: string; phone: string; phone2: string; createdAt: string; orders: number; spent: number; lastOrder: string | null };

export type Dashboard = {
  today: { n: number; s: number }; week: { n: number; s: number }; month: { n: number; s: number }; all: { n: number; s: number };
  byStatus: Partial<Record<Status, number>>; pendingCash: number; customers: number; consultNeeded: number;
  statusSums: Partial<Record<Status, { n: number; s: number }>>; ordered: { n: number; s: number }; orderedToday: { n: number; s: number };
  newOrders: { id: number; no: number; name: string; phone: string; total: number; createdAt: string }[];
  /** false for staff: money fields are zeroed */
  money: boolean;
  lowStock: { id: number; name: string; stock: number; lowStock: number }[];
};

export type Analytics = {
  days: number; series: { day: string; orders: number; revenue: number }[]; revenue: number; orders: number; itemsSold: number;
  avgCheck: number; cancelRate: number; repeatCustomers: number;
  topProducts: { id: number; name: string; qty: number; revenue: number }[];
  byRegion: { region: string; orders: number; revenue: number }[];
  byWeekday: { wd: number; orders: number; revenue: number }[];
  byHour: { h: number; orders: number }[];
  byCategory: { category: string; revenue: number; qty: number }[];
  byStatus: { status: Status; n: number; s: number }[];
  topCustomers: { id: number; name: string; orders: number; revenue: number }[];
  avgDeliveryHours: number;
  profit: { profit: number; covered: number };
  stock: { id: number; name: string; stock: number; price: number; cost: number | null; sold: number; daysLeft: number | null }[];
};

// ---- formatting ----

export const money = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
export const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} mln` : n >= 1e3 ? `${Math.round(n / 1e3)} ming` : String(n));

/** Server times are UTC "YYYY-MM-DD HH:MM:SS"; show them in Tashkent time. */
export const when = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};

export const STATUS: Record<Status, { label: string; tone: string }> = {
  new: { label: 'Yangi', tone: 'blue' },
  checking: { label: 'Tekshiruvda', tone: 'gold' },
  confirmed: { label: 'Tasdiqlandi', tone: 'violet' },
  ready: { label: 'Dastavkaga', tone: 'teal' },
  delivered: { label: 'Yetkazildi', tone: 'green' },
  cancelled: { label: 'Bekor', tone: 'red' },
};
export const FLOW: Status[] = ['new', 'checking', 'confirmed', 'ready', 'delivered'];

// ---- users & access ----

export type Area = 'orders' | 'products' | 'stock' | 'customers';
/** 0 = hidden, 1 = view only, 2 = full */
export type Perms = Record<Area, number>;
export type Me = { id: number; role: 'owner' | 'staff'; name: string; login: string; perms: Perms };
export type Staff = { id: number; name: string; phone: string; login: string; active: boolean; perms: Perms; createdAt: string };
export type ApiKey = { id: number; name: string; prefix: string; perms: Perms; lastUsed: string | null; createdAt: string };

export const AREA_LABEL: Record<Area, string> = { orders: 'Buyurtmalar', products: 'Tovarlar', stock: 'Sklad', customers: 'Mijozlar' };

export type Expense = { id: number; day: string; category: string; amount: number; note: string };
export type Finance = {
  days: number;
  kassa: Record<'onTheWay' | 'expected' | 'today' | 'week' | 'month', { s: number; n: number }>;
  revenue: number; orders: number; cogs: number; costCoverage: number; gross: number; expenses: number; net: number;
  expensesByCategory: { category: string; amount: number }[];
  series: { day: string; revenue: number; expenses: number }[];
  list: Expense[];
};
