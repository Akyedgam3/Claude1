// لوحة الإدارة (2.0): أرقام فترة كاملة مع مقارنة بالفترة اللي قبلها، اتجاه المبيعات والربح، ساعات وأيام الذروة،
// أفضل المواد والزباين والموظفين، المواد الراكدة، طرق الدفع، المصاريف، وأعمار الديون.
// كله قراءة بس من الحالة (ما في ولا حدث جديد)، والربح من نفس قيود قائمة الدخل حتى تطابق التقارير حرفياً.
import { cashBoxes, dailyProfit, receivablesAging, salesByItem, salesByPerson } from './reports';
import type { CompanyState, Invoice } from './types';

export interface Range {
  from: string;
  to: string;
}

const DAY = 86_400_000;
const toDay = (d: string) => Math.floor(Date.parse(d + 'T00:00:00Z') / DAY);
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** عدد أيام الفترة (مع أول وآخر يوم) */
export function rangeDays(r: Range): number {
  return toDay(r.to) - toDay(r.from) + 1;
}

/** الفترة اللي قبلها بنفس الطول (هالشهر ← الشهر الماضي بنفس عدد الأيام) */
export function previousRange(r: Range): Range {
  const n = rangeDays(r);
  return { from: fromDay(toDay(r.from) - n), to: fromDay(toDay(r.from) - 1) };
}

/** فترات جاهزة لتاريخ اليوم */
export function presetRange(kind: 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'quarter' | 'year', today: string): Range {
  const t = toDay(today);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (kind) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: fromDay(t - 1), to: fromDay(t - 1) };
    case 'week':
      return { from: fromDay(t - 6), to: today };
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
    }
    case 'quarter':
      return { from: fromDay(t - 89), to: today };
    case 'year':
      return { from: `${y}-01-01`, to: today };
  }
}

const inRange = (d: string, r: Range) => d >= r.from && d <= r.to;
const live = (i: Invoice) => !i.voidEntryId;

/** قيمة الفاتورة بالعملة الأساسية (أصغر وحدة) */
export function invoiceBase(state: CompanyState, inv: Invoice, amount = inv.total): number {
  const base = state.currencies[state.info!.baseCurrency]!;
  const cur = state.currencies[inv.currency] ?? base;
  return Math.round(amount * inv.rate * 10 ** (base.decimals - cur.decimals));
}

export interface Kpis {
  sales: number; // فواتير المبيع
  returns: number; // مرتجعات المبيع
  netSales: number;
  invoices: number;
  avgInvoice: number;
  revenue: number; // الإيرادات بالقيود (متل قائمة الدخل)
  cogs: number;
  gross: number;
  losses: number; // التالف والعجز
  expenses: number;
  net: number;
  margin: number; // صافي الربح ÷ الإيرادات %
  purchases: number;
  credit: number; // الباقي بالدين من فواتير الفترة
  cashIn: number; // داخل الصناديق (بدون التحويل بين صندوق وصندوق)
  cashOut: number;
  customers: number; // زباين اشتروا بالفترة
  newCustomers: number; // أول فاتورة إلهن بالفترة
}

export function kpis(state: CompanyState, r: Range): Kpis {
  const k: Kpis = { sales: 0, returns: 0, netSales: 0, invoices: 0, avgInvoice: 0, revenue: 0, cogs: 0, gross: 0, losses: 0, expenses: 0, net: 0, margin: 0, purchases: 0, credit: 0, cashIn: 0, cashOut: 0, customers: 0, newCustomers: 0 };
  const buyers = new Set<string>();
  const firstSale = new Map<string, string>();
  for (const inv of state.invoices) {
    if (!live(inv)) continue;
    if (inv.kind === 'sale' && inv.partyId) {
      const f = firstSale.get(inv.partyId);
      if (!f || inv.date < f) firstSale.set(inv.partyId, inv.date);
    }
    if (!inRange(inv.date, r)) continue;
    const v = invoiceBase(state, inv);
    if (inv.kind === 'sale') {
      k.sales += v;
      k.invoices++;
      k.credit += Math.max(0, v - invoiceBase(state, inv, inv.paid));
      if (inv.partyId) buyers.add(inv.partyId);
    } else if (inv.kind === 'sale_return') k.returns += v;
    else if (inv.kind === 'purchase') k.purchases += v;
    else if (inv.kind === 'purchase_return') k.purchases -= v;
  }
  k.netSales = k.sales - k.returns;
  k.avgInvoice = k.invoices ? Math.round(k.sales / k.invoices) : 0;
  k.customers = buyers.size;
  for (const d of firstSale.values()) if (inRange(d, r)) k.newCustomers++;
  for (const d of dailyProfit(state, r.from, r.to)) {
    k.revenue += d.revenue;
    k.cogs += d.cogs;
    k.losses += d.losses;
    k.expenses += d.expenses;
  }
  k.gross = k.revenue - k.cogs;
  k.net = k.gross - k.losses - k.expenses;
  k.margin = k.revenue ? Math.round((k.net / k.revenue) * 1000) / 10 : 0;
  // حركة الصناديق: القيد اللي كل أسطره صناديق (تحويل بين صندوقين أو صرف عملة) ما بيتحسب
  const boxes = new Set(cashBoxes(state).map((a) => a.id));
  for (const e of state.entries) {
    if (!inRange(e.date, r)) continue;
    if (e.lines.every((l) => boxes.has(l.accountId))) continue;
    // تصفير السالب وسحب المالك مصاري المالك نفسه، مش شغل داخل وطالع
    if (e.source?.type === 'boxtransfer') continue;
    for (const l of e.lines) {
      if (!boxes.has(l.accountId)) continue;
      k.cashIn += l.baseDebit;
      k.cashOut += l.baseCredit;
    }
  }
  return k;
}

/** نسبة التغيّر عن الفترة اللي قبل (null إذا ما في أساس للمقارنة) */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}

export interface TrendPoint {
  key: string; // اليوم أو الشهر (YYYY-MM)
  revenue: number;
  net: number;
}

/** اتجاه الإيرادات وصافي الربح: يومي لحد 3 أشهر، وبعدها شهري */
export function trend(state: CompanyState, r: Range): TrendPoint[] {
  const monthly = rangeDays(r) > 93;
  const map = new Map<string, TrendPoint>();
  if (!monthly) for (let d = toDay(r.from); d <= toDay(r.to); d++) map.set(fromDay(d), { key: fromDay(d), revenue: 0, net: 0 });
  else {
    let [y, m] = r.from.split('-').map(Number) as [number, number];
    const end = r.to.slice(0, 7);
    for (;;) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      map.set(key, { key, revenue: 0, net: 0 });
      if (key >= end) break;
      m++;
      if (m > 12) (m = 1), y++;
    }
  }
  for (const d of dailyProfit(state, r.from, r.to)) {
    const p = map.get(monthly ? d.date.slice(0, 7) : d.date);
    if (!p) continue;
    p.revenue += d.revenue;
    p.net += d.net;
  }
  return [...map.values()];
}

/** المبيعات حسب ساعة الفاتورة (0-23) وحسب يوم الأسبوع (0 = الأحد) */
export function salesRhythm(state: CompanyState, r: Range): { hours: number[]; weekdays: number[] } {
  const hours = Array<number>(24).fill(0);
  const weekdays = Array<number>(7).fill(0);
  for (const inv of state.invoices) {
    if (!live(inv) || inv.kind !== 'sale' || !inRange(inv.date, r)) continue;
    const v = invoiceBase(state, inv);
    const t = new Date(inv.createdAt);
    if (!Number.isNaN(t.getTime()) && inv.createdAt.slice(0, 10) === inv.date) hours[t.getHours()]! += v;
    weekdays[new Date(inv.date + 'T12:00:00Z').getUTCDay()]! += v;
  }
  return { hours, weekdays };
}

export interface TopRow {
  id: string;
  name: string;
  value: number;
  extra?: number; // ربح المادة، أو عدد فواتير الزبون/الموظف
}

/** أفضل المواد: حسب المبيع أو حسب الربح */
export function topItems(state: CompanyState, r: Range, by: 'revenue' | 'profit' | 'qty', n = 8): (TopRow & { qty: number; profit: number })[] {
  return salesByItem(state, r)
    .map((x) => ({ id: x.item.id, name: x.item.name, value: by === 'profit' ? x.profit : by === 'qty' ? x.qty : x.revenue, qty: x.qty, profit: x.profit }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/** أفضل الزباين بالفترة (صافي المبيع بعد المرتجع) */
export function topCustomers(state: CompanyState, r: Range, n = 8): TopRow[] {
  const map = new Map<string, TopRow>();
  for (const inv of state.invoices) {
    if (!live(inv) || !inv.partyId || !inRange(inv.date, r) || (inv.kind !== 'sale' && inv.kind !== 'sale_return')) continue;
    const row = map.get(inv.partyId) ?? { id: inv.partyId, name: state.parties[inv.partyId]?.name ?? '', value: 0, extra: 0 };
    row.value += (inv.kind === 'sale' ? 1 : -1) * invoiceBase(state, inv);
    if (inv.kind === 'sale') row.extra = (row.extra ?? 0) + 1;
    map.set(inv.partyId, row);
  }
  return [...map.values()].filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, n);
}

/** مبيعات كل موظف (اللي عمل الفاتورة) */
export function topUsers(state: CompanyState, r: Range): TopRow[] {
  return salesByPerson(state, r, 'createdBy').map((x) => ({ id: x.name, name: x.name, value: x.total, extra: x.count }));
}

/** مواد راكدة: إلها كمية بالمخزون وما انباعت ولا مرة بالفترة، مرتبة حسب قيمتها */
export function slowItems(state: CompanyState, r: Range, n = 8): { id: string; name: string; qty: number; value: number; lastSale: string | null }[] {
  const sold = new Set<string>();
  const last = new Map<string, string>();
  for (const inv of state.invoices) {
    if (!live(inv) || inv.kind !== 'sale') continue;
    for (const l of inv.lines) {
      if (!l.itemId) continue;
      if (inRange(inv.date, r)) sold.add(l.itemId);
      const p = last.get(l.itemId);
      if (!p || inv.date > p) last.set(l.itemId, inv.date);
    }
  }
  const rows = [];
  for (const [id, s] of Object.entries(state.stock)) {
    const item = state.items[id];
    if (!item || item.archived || item.kind !== 'stock' || sold.has(id) || s.totalQty <= 0) continue;
    rows.push({ id, name: item.name, qty: s.totalQty, value: s.value, lastSale: last.get(id) ?? null });
  }
  return rows.sort((a, b) => b.value - a.value).slice(0, n);
}

/** طرق الدفع بفواتير المبيع: نقدي كامل، جزء، دين كامل */
export function paymentMix(state: CompanyState, r: Range): { cash: number; partial: number; credit: number } {
  const mix = { cash: 0, partial: 0, credit: 0 };
  for (const inv of state.invoices) {
    if (!live(inv) || inv.kind !== 'sale' || !inRange(inv.date, r)) continue;
    const v = invoiceBase(state, inv);
    if (inv.paid >= inv.total) mix.cash += v;
    else if (inv.paid > 0) mix.partial += v;
    else mix.credit += v;
  }
  return mix;
}

/** المصاريف حسب الحساب (بدون تكلفة البضاعة والتالف) */
export function expenseBreakdown(state: CompanyState, r: Range, n = 6): TopRow[] {
  const LOSS = new Set(['5402', '5403', '5404']);
  const map = new Map<string, TopRow>();
  for (const e of state.entries) {
    if (!inRange(e.date, r) || e.source?.type === 'closing') continue;
    for (const l of e.lines) {
      const acc = state.accounts[l.accountId];
      if (!acc || acc.type !== 'expense' || l.accountId === '5101' || acc.parentId === '5101' || LOSS.has(l.accountId)) continue;
      const row = map.get(acc.id) ?? { id: acc.id, name: acc.name, value: 0 };
      row.value += l.baseDebit - l.baseCredit;
      map.set(acc.id, row);
    }
  }
  return [...map.values()].filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, n);
}

/** أعمار ديون الزباين: مجموع كل عمر */
export function agingTotals(state: CompanyState, today: string): { buckets: [number, number, number, number]; total: number; parties: number } {
  const rows = receivablesAging(state, today);
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  for (const r of rows) for (let i = 0; i < 4; i++) buckets[i]! += r.buckets[i]!;
  return { buckets, total: buckets.reduce((s, b) => s + b, 0), parties: rows.length };
}

export interface Positions {
  cash: number; // الأموال الجاهزة: كل الصناديق والبنك (بالعملة الأساسية)
  receivables: number; // لنا عند الزباين
  payables: number; // علينا للموردين
}

/** الوضع المالي بنهاية يوم: الأموال الجاهزة والديون (متل «مؤشرات مختصرة» بالبرامج الكبيرة) */
export function positions(state: CompanyState, to: string): Positions {
  const boxes = new Set(cashBoxes(state).map((a) => a.id));
  const p: Positions = { cash: 0, receivables: 0, payables: 0 };
  for (const e of state.entries) {
    if (e.date > to) continue;
    for (const l of e.lines) {
      if (boxes.has(l.accountId)) p.cash += l.baseDebit - l.baseCredit;
      else if (l.accountId === '1103') p.receivables += l.baseDebit - l.baseCredit;
      else if (l.accountId === '2101') p.payables += l.baseCredit - l.baseDebit;
    }
  }
  return p;
}
