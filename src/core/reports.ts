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

/** قائمة الدخل المختصرة: الإيرادات (دائن) - المصاريف (مدين). */
export function incomeStatement(state: CompanyState, period: Period = {}): IncomeStatement {
  let revenue = 0;
  let expenses = 0;
  for (const e of state.entries) {
    if (!inPeriod(e, period)) continue;
    for (const l of e.lines) {
      const type = state.accounts[l.accountId]?.type;
      if (type === 'revenue') revenue += l.baseCredit - l.baseDebit;
      else if (type === 'expense') expenses += l.baseDebit - l.baseCredit;
    }
  }
  return { revenue, expenses, netProfit: revenue - expenses };
}
