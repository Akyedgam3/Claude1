import type { Account, CompanyState, Invoice, Item, JournalEntry, JournalLine } from './types';

export interface Period {
  from?: string; // YYYY-MM-DD شامل
  to?: string; // YYYY-MM-DD شامل
}

function inPeriod(entry: JournalEntry, p: Period): boolean {
  return (!p.from || entry.date >= p.from) && (!p.to || entry.date <= p.to);
}

/** الحساب نفسه وكل الحسابات الفرعية تحته. */
export function descendantsOf(state: CompanyState, accountId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const a of Object.values(state.accounts)) {
    if (a.parentId) children.set(a.parentId, [...(children.get(a.parentId) ?? []), a.id]);
  }
  const result = new Set<string>();
  const stack = [accountId];
  while (stack.length) {
    const id = stack.pop()!;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

export interface Balance {
  debit: number;
  credit: number;
  balance: number; // مدين - دائن
}

/** رصيد الحساب (مع فروعه) بالعملة الأساسية. */
export function accountBalance(state: CompanyState, accountId: string, period: Period = {}): Balance {
  const ids = descendantsOf(state, accountId);
  let debit = 0;
  let credit = 0;
  for (const e of state.entries) {
    if (!inPeriod(e, period)) continue;
    for (const l of e.lines) {
      if (ids.has(l.accountId)) {
        debit += l.baseDebit;
        credit += l.baseCredit;
      }
    }
  }
  return { debit, credit, balance: debit - credit };
}

/** رصيد الحساب بكل عملة على حدة (مفيد لصناديق الدولار والتركي). */
export function balancesByCurrency(state: CompanyState, accountId: string, period: Period = {}): Record<string, number> {
  const ids = descendantsOf(state, accountId);
  const result: Record<string, number> = {};
  for (const e of state.entries) {
    if (!inPeriod(e, period)) continue;
    for (const l of e.lines) {
      if (ids.has(l.accountId)) result[l.currency] = (result[l.currency] ?? 0) + l.debit - l.credit;
    }
  }
  return result;
}

export interface TrialBalanceRow {
  account: Account;
  level: number;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}

/** ميزان المراجعة: كل الحسابات التي عليها حركة، مع تجميع الحسابات الأب. */
export function trialBalance(state: CompanyState, period: Period = {}): TrialBalance {
  const totals = new Map<string, { debit: number; credit: number }>();
  const add = (id: string, debit: number, credit: number) => {
    const t = totals.get(id) ?? { debit: 0, credit: 0 };
    t.debit += debit;
    t.credit += credit;
    totals.set(id, t);
  };
  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of state.entries) {
    if (!inPeriod(e, period)) continue;
    for (const l of e.lines) {
      totalDebit += l.baseDebit;
      totalCredit += l.baseCredit;
      for (let a = state.accounts[l.accountId]; a; a = a.parentId ? state.accounts[a.parentId] : undefined) {
        add(a.id, l.baseDebit, l.baseCredit);
      }
    }
  }
  const levelOf = (a: Account): number => (a.parentId ? 1 + levelOf(state.accounts[a.parentId]!) : 0);
  const rows = [...totals.entries()]
    .map(([id, t]) => {
      const account = state.accounts[id]!;
      return { account, level: levelOf(account), ...t, balance: t.debit - t.credit };
    })
    .sort((a, b) => a.account.id.localeCompare(b.account.id));
  return { rows, totalDebit, totalCredit };
}

export interface StatementRow {
  entryId: string;
  number: number;
  date: string;
  memo: string;
  debit: number;
  credit: number;
  running: number;
}

export interface AccountStatement {
  opening: number;
  rows: StatementRow[];
  closing: number;
}

type LineFilter = (l: JournalLine) => boolean;

function statement(state: CompanyState, match: LineFilter, period: Period, currency?: string): AccountStatement {
  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  let opening = 0;
  let running = 0;
  const rows: StatementRow[] = [];
  for (const e of sorted) {
    let debit = 0;
    let credit = 0;
    for (const l of e.lines) {
      if (!match(l)) continue;
      if (currency) {
        if (l.currency !== currency) continue;
        debit += l.debit;
        credit += l.credit;
      } else {
        debit += l.baseDebit;
        credit += l.baseCredit;
      }
    }
    if (debit === 0 && credit === 0) continue;
    if (period.from && e.date < period.from) {
      opening += debit - credit;
      continue;
    }
    if (period.to && e.date > period.to) continue;
    if (rows.length === 0) running = opening;
    running += debit - credit;
    rows.push({ entryId: e.id, number: e.number, date: e.date, memo: e.memo, debit, credit, running });
  }
  return { opening, rows, closing: rows.length ? running : opening };
}

/**
 * كشف حساب مع رصيد تراكمي.
 * إن حُددت عملة يُعرض الكشف بمبالغ تلك العملة فقط (مثلاً كشف عميل بالدولار).
 */
export function accountStatement(state: CompanyState, accountId: string, period: Period = {}, currency?: string): AccountStatement {
  const ids = descendantsOf(state, accountId);
  return statement(state, (l) => ids.has(l.accountId), period, currency);
}

/** كشف حساب عميل/مورد (موجب = له علينا دين لصالحنا، أي مدين). */
export function partyStatement(state: CompanyState, partyId: string, period: Period = {}, currency?: string): AccountStatement {
  return statement(state, (l) => l.partyId === partyId, period, currency);
}

/** رصيد العميل/المورد بالعملة الأساسية وبكل عملة. موجب = مدين لنا. */
export function partyBalance(state: CompanyState, partyId: string): { base: number; byCurrency: Record<string, number> } {
  let base = 0;
  const byCurrency: Record<string, number> = {};
  for (const e of state.entries) {
    for (const l of e.lines) {
      if (l.partyId !== partyId) continue;
      base += l.baseDebit - l.baseCredit;
      byCurrency[l.currency] = (byCurrency[l.currency] ?? 0) + l.debit - l.credit;
    }
  }
  return { base, byCurrency };
}

export interface StockRow {
  item: Item;
  qty: number;
  byWarehouse: Record<string, number>;
  value: number;
  avgCost: number;
  low: boolean; // تحت الحد الأدنى
}

export function stockReport(state: CompanyState): StockRow[] {
  return Object.values(state.items)
    .filter((i) => i.kind === 'stock' && !i.archived)
    .map((item) => {
      const s = state.stock[item.id];
      const qty = s?.totalQty ?? 0;
      return {
        item,
        qty,
        byWarehouse: s?.qty ?? {},
        value: s?.value ?? 0,
        avgCost: s && qty > 0 ? Math.round(s.value / qty) : (s?.lastCost ?? 0),
        low: item.minStock !== undefined && qty <= item.minStock,
      };
    })
    .sort((a, b) => a.item.code.localeCompare(b.item.code));
}

export interface IncomeStatement {
  revenue: number;
  expenses: number;
  netProfit: number;
}

/** قائمة الدخل المختصرة: الإيرادات (دائن) - المصاريف (مدين). قيود إقفال السنة لا تدخل فيها. */
export function incomeStatement(state: CompanyState, period: Period = {}): IncomeStatement {
  let revenue = 0;
  let expenses = 0;
  for (const e of state.entries) {
    if (!inPeriod(e, period) || e.source?.type === 'closing') continue;
    for (const l of e.lines) {
      const type = state.accounts[l.accountId]?.type;
      if (type === 'revenue') revenue += l.baseCredit - l.baseDebit;
      else if (type === 'expense') expenses += l.baseDebit - l.baseCredit;
    }
  }
  return { revenue, expenses, netProfit: revenue - expenses };
}

export interface DayProfit {
  date: string;
  revenue: number; // صافي المبيعات والإيرادات (بعد المرتجع والخصم)
  cogs: number; // تكلفة البضاعة المباعة
  losses: number; // تالف وفروقات جرد ومواد مستهلكة
  expenses: number; // باقي المصاريف (رواتب، أجار، مازوت...)
  gross: number; // الربح الإجمالي = المبيعات − التكلفة
  net: number; // صافي الربح = الإجمالي − التالف − المصاريف
}

/** الربح يوم بيوم من القيود نفسها، فبيشمل كل الأقسام (فواتير، طلبات، حجوزات، مصاريف، تالف...). */
export function dailyProfit(state: CompanyState, from: string, to: string): DayProfit[] {
  const LOSS = new Set(['5402', '5403', '5404']);
  const days = new Map<string, DayProfit>();
  const day = (d: string) => days.get(d) ?? days.set(d, { date: d, revenue: 0, cogs: 0, losses: 0, expenses: 0, gross: 0, net: 0 }).get(d)!;
  for (const e of state.entries) {
    if (e.date < from || e.date > to || e.source?.type === 'closing') continue;
    for (const l of e.lines) {
      const acc = state.accounts[l.accountId];
      if (!acc) continue;
      if (acc.type === 'revenue') day(e.date).revenue += l.baseCredit - l.baseDebit;
      else if (acc.type === 'expense') {
        const v = l.baseDebit - l.baseCredit;
        if (l.accountId === '5101' || acc.parentId === '5101') day(e.date).cogs += v;
        else if (LOSS.has(l.accountId)) day(e.date).losses += v;
        else day(e.date).expenses += v;
      }
    }
  }
  for (const d of days.values()) {
    d.gross = d.revenue - d.cogs;
    d.net = d.gross - d.losses - d.expenses;
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// ───────────── تقارير إضافية ─────────────

export interface BalanceSheet {
  assets: number;
  liabilities: number;
  equity: number; // يشمل أرباح الفترة غير المقفلة
  currentProfit: number;
}

/** الميزانية العمومية حتى تاريخ معيّن. */
export function balanceSheet(state: CompanyState, to?: string): BalanceSheet {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let profit = 0;
  for (const e of state.entries) {
    if (to && e.date > to) continue;
    for (const l of e.lines) {
      const d = l.baseDebit - l.baseCredit;
      switch (state.accounts[l.accountId]?.type) {
        case 'asset':
          assets += d;
          break;
        case 'liability':
          liabilities -= d;
          break;
        case 'equity':
          equity -= d;
          break;
        case 'revenue':
        case 'expense':
          profit -= d;
      }
    }
  }
  return { assets, liabilities, equity: equity + profit, currentProfit: profit };
}

export interface ItemSalesRow {
  item: Item;
  qty: number; // بالوحدة الأساسية
  revenue: number; // بالعملة الأساسية بعد خصم السطر (قبل خصم الفاتورة)
  cost: number;
  profit: number;
}

/** أرباح المواد: الكمية المباعة والإيراد والتكلفة والربح لكل مادة (بعد طرح المرتجعات). */
export function salesByItem(state: CompanyState, period: Period = {}): ItemSalesRow[] {
  const base = state.currencies[state.info!.baseCurrency]!;
  const rows = new Map<string, ItemSalesRow>();
  for (const inv of state.invoices) {
    if (inv.voidEntryId || (inv.kind !== 'sale' && inv.kind !== 'sale_return')) continue;
    if ((period.from && inv.date < period.from) || (period.to && inv.date > period.to)) continue;
    const sign = inv.kind === 'sale' ? 1 : -1;
    const cur = state.currencies[inv.currency]!;
    const scale = 10 ** (base.decimals - cur.decimals);
    for (const l of inv.lines) {
      if (!l.itemId) continue;
      const item = state.items[l.itemId];
      if (!item) continue;
      const row = rows.get(item.id) ?? { item, qty: 0, revenue: 0, cost: 0, profit: 0 };
      row.qty += sign * l.qty * (l.factor ?? 1);
      row.revenue += sign * Math.round((Math.round(l.qty * l.price) - l.discount) * inv.rate * scale);
      row.cost += sign * (l.cost ?? 0);
      row.profit = row.revenue - row.cost;
      rows.set(item.id, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.profit - a.profit);
}

/** المبيعات حسب البائع/المندوب أو المستخدم. */
export function salesByPerson(state: CompanyState, period: Period = {}, by: 'salesman' | 'createdBy' = 'createdBy') {
  const base = state.currencies[state.info!.baseCurrency]!;
  const rows = new Map<string, { name: string; count: number; total: number }>();
  for (const inv of state.invoices) {
    if (inv.voidEntryId || (inv.kind !== 'sale' && inv.kind !== 'sale_return')) continue;
    if ((period.from && inv.date < period.from) || (period.to && inv.date > period.to)) continue;
    const name = (by === 'salesman' ? inv.salesman : state.users[inv.createdBy]?.displayName ?? inv.createdBy) || 'بدون';
    const cur = state.currencies[inv.currency]!;
    const total = Math.round(inv.total * inv.rate * 10 ** (base.decimals - cur.decimals)) * (inv.kind === 'sale' ? 1 : -1);
    const row = rows.get(name) ?? { name, count: 0, total: 0 };
    row.count += inv.kind === 'sale' ? 1 : 0;
    row.total += total;
    rows.set(name, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

export interface AgingRow {
  partyId: string;
  name: string;
  balance: number;
  buckets: [number, number, number, number]; // 0-30، 31-60، 61-90، أكثر من 90 يوماً
}

/**
 * أعمار الديون: يوزّع رصيد كل عميل على أعمار فواتيره (الأقدم يُسدَّد أولاً).
 */
export function receivablesAging(state: CompanyState, today: string): AgingRow[] {
  const day = (d: string) => Math.floor(new Date(d).getTime() / 86_400_000);
  const now = day(today);
  const perParty = new Map<string, { debits: { date: string; amount: number }[]; credits: number }>();
  for (const e of state.entries) {
    for (const l of e.lines) {
      if (!l.partyId || state.accounts[l.accountId]?.id !== '1103') continue;
      const p = perParty.get(l.partyId) ?? { debits: [], credits: 0 };
      if (l.baseDebit) p.debits.push({ date: e.date, amount: l.baseDebit });
      p.credits += l.baseCredit;
      perParty.set(l.partyId, p);
    }
  }
  const rows: AgingRow[] = [];
  for (const [partyId, p] of perParty) {
    let credits = p.credits;
    const buckets: [number, number, number, number] = [0, 0, 0, 0];
    for (const d of p.debits.sort((a, b) => a.date.localeCompare(b.date))) {
      const open = Math.max(0, d.amount - credits);
      credits = Math.max(0, credits - d.amount);
      if (!open) continue;
      const age = now - day(d.date);
      buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += open;
    }
    const balance = buckets.reduce((s, b) => s + b, 0);
    if (balance > 0) rows.push({ partyId, name: state.parties[partyId]?.name ?? '', balance, buckets });
  }
  return rows.sort((a, b) => b.balance - a.balance);
}

/** حركة الصناديق في يوم (أو فترة): الداخل والخارج لكل صندوق بكل عملة. */
export function cashMovement(state: CompanyState, period: Period) {
  const boxes = Object.values(state.accounts).filter((a) => !a.isGroup && (a.parentId === '11' || a.parentId === '1101') && /^110[128]/.test(a.id));
  return boxes.map((a) => {
    const rows: Record<string, { opening: number; inflow: number; outflow: number; closing: number }> = {};
    for (const e of state.entries) {
      for (const l of e.lines) {
        if (l.accountId !== a.id) continue;
        const r = (rows[l.currency] ??= { opening: 0, inflow: 0, outflow: 0, closing: 0 });
        if (period.from && e.date < period.from) r.opening += l.debit - l.credit;
        else if (!period.to || e.date <= period.to) {
          r.inflow += l.debit;
          r.outflow += l.credit;
        }
      }
    }
    for (const r of Object.values(rows)) r.closing = r.opening + r.inflow - r.outflow;
    return { account: a, byCurrency: rows };
  });
}

// ───────────── تقرير إغلاق اليوم ─────────────

export interface DailyCurrencyRow {
  currency: string;
  sales: number; // إجمالي فواتير المبيع
  salesCash: number; // المقبوض منها نقداً
  salesCredit: number; // الباقي بالدين
  returns: number; // مرتجعات المبيع
  returnsCash: number; // المدفوع للزبائن عن المرتجعات
  purchases: number;
  purchasesCash: number;
  receipts: number; // سندات القبض
  payments: number; // سندات الدفع
  cashIn: number; // صافي حركة الصناديق بهذه العملة (داخل - خارج)
}

export interface DailySummary {
  date: string;
  userId?: string;
  invoices: number; // عدد فواتير المبيع
  voided: number; // فواتير أُلغيت في ذلك اليوم
  discounts: number; // بالعملة الأساسية
  rows: DailyCurrencyRow[];
  topItems: { itemId: string; name: string; qty: number }[];
}

/** ملخص يوم عمل (أو موظف واحد): المبيعات، النقد، الدين، المرتجعات، السندات. يُطبع آخر الدوام. */
export function dailySummary(state: CompanyState, date: string, userId?: string): DailySummary {
  const rows = new Map<string, DailyCurrencyRow>();
  const row = (c: string) => {
    let r = rows.get(c);
    if (!r) rows.set(c, (r = { currency: c, sales: 0, salesCash: 0, salesCredit: 0, returns: 0, returnsCash: 0, purchases: 0, purchasesCash: 0, receipts: 0, payments: 0, cashIn: 0 }));
    return r;
  };
  const mine = (by: string | undefined) => !userId || by === userId;
  let invoices = 0;
  let voided = 0;
  let discounts = 0;
  const items = new Map<string, number>();
  for (const inv of state.invoices) {
    if (inv.date !== date || !mine(inv.createdBy)) continue;
    if (inv.voidEntryId) {
      voided++;
      continue;
    }
    const r = row(inv.currency);
    if (inv.kind === 'sale') {
      invoices++;
      r.sales += inv.total;
      r.salesCash += inv.paid;
      r.salesCredit += inv.total - inv.paid;
      discounts += Math.round((inv.discount + inv.lines.reduce((s, l) => s + l.discount, 0)) * inv.rate);
      for (const l of inv.lines) if (l.itemId) items.set(l.itemId, (items.get(l.itemId) ?? 0) + l.qty * (l.factor ?? 1));
    } else if (inv.kind === 'sale_return') {
      r.returns += inv.total;
      r.returnsCash += inv.paid;
    } else if (inv.kind === 'purchase') {
      r.purchases += inv.total;
      r.purchasesCash += inv.paid;
    }
  }
  const cashIds = new Set(Object.values(state.accounts).filter((a) => !a.isGroup && /^110[128]/.test(a.id)).map((a) => a.id));
  for (const e of state.entries) {
    if (e.date !== date || !mine(e.createdBy)) continue;
    const kind = e.source?.type;
    if ((kind === 'receipt' || kind === 'payment') && !e.voidOf && !state.voided[e.id]) {
      const cash = e.lines.find((l) => cashIds.has(l.accountId));
      if (cash) row(cash.currency)[kind === 'receipt' ? 'receipts' : 'payments'] += kind === 'receipt' ? cash.debit : cash.credit;
    }
    for (const l of e.lines) if (cashIds.has(l.accountId)) row(l.currency).cashIn += l.debit - l.credit;
  }
  const topItems = [...items]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([itemId, qty]) => ({ itemId, name: state.items[itemId]?.name ?? '', qty: Math.round(qty * 1000) / 1000 }));
  return { date, ...(userId ? { userId } : {}), invoices, voided, discounts, rows: [...rows.values()], topItems };
}

/** تكلفة الوحدة الأساسية من المادة حالياً (متوسط التكلفة؛ والمركّب = مجموع مكوّناته؛ والخدمة صفر). بالعملة الأساسية. */
export function itemUnitCost(state: CompanyState, itemId: string, depth = 0): number {
  const item = state.items[itemId];
  if (!item || depth > 5) return 0;
  if (item.kind === 'composite') return (item.recipe ?? []).reduce((s, r) => s + itemUnitCost(state, r.itemId, depth + 1) * r.qty, 0);
  if (item.kind !== 'stock') return 0;
  const w = state.stock[itemId];
  if (!w) return 0;
  return w.totalQty > 0 ? w.value / w.totalQty : w.lastCost;
}

/** ربح فاتورة مبيع محفوظة: صافي المبيع (بدون الضريبة) ناقص تكلفة البضاعة، بالعملة الأساسية. */
export function invoiceProfit(state: CompanyState, inv: Invoice): { revenue: number; cost: number; profit: number } {
  const base = state.currencies[state.info!.baseCurrency]!;
  const cur = state.currencies[inv.currency] ?? base;
  const revenue = Math.round((inv.subtotal - inv.discount) * inv.rate * 10 ** (base.decimals - cur.decimals));
  let cost = inv.lines.reduce((s, l) => s + (l.cost ?? 0), 0);
  // مصاريف الشحنة (أجرة السائق، رسوم دفعناها...) بعملة الفاتورة
  const shipment = inv.source?.type === 'shipment' ? state.shipments?.[inv.source.id] : undefined;
  if (shipment) cost += Math.round(shipment.costs.reduce((s, c) => s + c.amount, 0) * inv.rate * 10 ** (base.decimals - cur.decimals));
  // مواد طلب الطباعة (فلكس، ورق) اللي انصرفت من المخزون، بالعملة الأساسية
  const pj = inv.source?.type === 'printjob' ? state.printJobs?.[inv.source.id] : undefined;
  const adj = pj?.materialsAdjustmentId ? state.adjustments.find((a) => a.id === pj.materialsAdjustmentId) : undefined;
  if (adj) cost += adj.lines.reduce((s, l) => s - l.cost, 0);
  return { revenue, cost, profit: revenue - cost };
}

/**
 * حساب الشخص حول الفاتورة (بعملتها): الرصيد قبلها، وبعدها.
 * موجب = لنا عليه (زبون مديون)، سالب = إله علينا. «قبلها» = كل الحركات اللي انسجّلت قبل قيد الفاتورة.
 */
export function invoicePartyBalance(state: CompanyState, inv: Invoice): { previous: number; after: number } | null {
  if (!inv.partyId) return null;
  let previous = 0;
  let own = 0;
  for (const e of state.entries) {
    const mine = e.id === inv.entryId;
    for (const l of e.lines) if (l.partyId === inv.partyId && l.currency === inv.currency) (mine ? (own += l.debit - l.credit) : (previous += l.debit - l.credit));
    if (mine) return { previous, after: previous + own };
  }
  return null;
}

/** حركة على حساب شخص (فاتورة، دين، قبض، دفع) مع ما تبقّى منها غير مسدَّد. */
export interface DebtItem {
  entryId: string;
  date: string;
  memo: string;
  source?: { type: string; id: string };
  amount: number; // موجب = زاد ما له علينا من حق، سالب = نقص (بعملة الحركة)
  remaining: number; // ما بقي غير مسدَّد من هذه الحركة (بنفس إشارتها)
}

export interface PartyDebts {
  currency: string;
  balance: number; // موجب = لنا عليه، سالب = له علينا
  movements: DebtItem[];
  open: DebtItem[]; // الحركات غير المسدَّدة (الأقدم أولاً)
}

/**
 * ديون الشخص بكل عملة: الرصيد، والحركات، والفواتير/الديون غير المسدَّدة.
 * الدفعات تُسدِّد الأقدم فالأقدم (FIFO)، لذلك «غير المسدَّد» هو آخر ما تراكم.
 */
export function partyDebts(state: CompanyState, partyId: string): PartyDebts[] {
  const byCur = new Map<string, DebtItem[]>();
  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  for (const e of sorted) {
    const sums = new Map<string, number>();
    for (const l of e.lines) if (l.partyId === partyId) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.debit - l.credit);
    for (const [cur, amount] of sums) {
      if (amount === 0) continue;
      const list = byCur.get(cur) ?? [];
      list.push({ entryId: e.id, date: e.date, memo: e.memo, ...(e.source ? { source: e.source } : {}), amount, remaining: amount });
      byCur.set(cur, list);
    }
  }
  const out: PartyDebts[] = [];
  for (const [currency, movements] of byCur) {
    const balance = movements.reduce((s, m) => s + m.amount, 0);
    const sign = Math.sign(balance);
    // كل حركة بعكس اتجاه الرصيد تُسدِّد أقدم الحركات المفتوحة باتجاهه
    const queue: DebtItem[] = [];
    let credit = 0;
    for (const m of movements) {
      if (sign !== 0 && Math.sign(m.amount) === sign) queue.push(m);
      else credit += Math.abs(m.amount);
    }
    for (const m of movements) m.remaining = 0;
    for (const m of queue) {
      const use = Math.min(credit, Math.abs(m.amount));
      credit -= use;
      m.remaining = (Math.abs(m.amount) - use) * sign;
    }
    out.push({ currency, balance, movements, open: queue.filter((m) => m.remaining !== 0) });
  }
  return out.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}
