import type { Account, CompanyState, Item, JournalEntry, JournalLine } from './types';

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
