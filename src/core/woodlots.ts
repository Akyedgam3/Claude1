import type { CompanyState, Invoice, WoodExpense, WoodLot } from './types';

/** وحدات بيع الحطب الشائعة (الزبون بيقدر يكتب غيرها). */
export const WOOD_UNITS = ['طن', 'شوال', 'قطعة', 'كيلو', 'ربطة', 'متر'] as const;

/** أنواع مصاريف المعمل وحساب كل نوع بدليل الحسابات. */
export const WOOD_EXPENSE_KINDS: { kind: string; accountId: string }[] = [
  { kind: 'أجور عمال', accountId: '5201' },
  { kind: 'صيانة', accountId: '5207' },
  { kind: 'مازوت ومحروقات', accountId: '5204' },
  { kind: 'كهرباء', accountId: '5203' },
  { kind: 'نقل وتحميل', accountId: '5206' },
  { kind: 'إيجار', accountId: '5202' },
  { kind: 'شوالات وتغليف', accountId: '5209' },
  { kind: 'مصاريف تانية', accountId: '5209' },
];

export function woodExpenseAccount(kind: string): string {
  return WOOD_EXPENSE_KINDS.find((k) => k.kind === kind)?.accountId ?? '5209';
}

/** فواتير مبيع الحمولة (غير الملغاة). */
export function woodLotSales(state: CompanyState, lotId: string): Invoice[] {
  return state.invoices.filter((i) => i.source?.type === 'woodlot' && i.source.id === lotId && !i.voidEntryId && !i.deleted);
}

/** مصاريف المعمل الفعّالة (مش ملغاة)؛ lotId = undefined ← كلها، null ← العامة بس. */
export function woodExpenses(state: CompanyState, lotId?: string | null): WoodExpense[] {
  return Object.values(state.woodExpenses ?? {})
    .filter((x) => !state.voided[x.entryId])
    .filter((x) => (lotId === undefined ? true : lotId === null ? !x.lotId : x.lotId === lotId))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface WoodLotSummary {
  cost: number;
  expenses: number;
  sales: number;
  /** الربح = المبيع − الشراء − المصاريف (إذا لسا ما خلصت، هاد الربح لهلق). */
  profit: number;
  /** قديش لسا لازم تبيع لترجع رأس المال (الشراء + المصاريف)؛ 0 إذا رجع. */
  toBreakEven: number;
  /** الكميات المبيعة حسب الوحدة: { طن: 3.5، شوال: 40 } */
  byUnit: Record<string, number>;
  invoices: number;
}

export function woodLotSummary(state: CompanyState, lot: WoodLot): WoodLotSummary {
  const invoices = woodLotSales(state, lot.id);
  const byUnit: Record<string, number> = {};
  let sales = 0;
  for (const inv of invoices) {
    sales += inv.total - inv.taxTotal;
    for (const l of inv.lines) {
      const u = l.unit || /\(([^()]+)\)$/.exec(l.description)?.[1] || 'قطعة';
      byUnit[u] = Math.round(((byUnit[u] ?? 0) + l.qty) * 1000) / 1000;
    }
  }
  const expenses = woodExpenses(state, lot.id).reduce((s, x) => s + x.amount, 0);
  const profit = sales - lot.cost - expenses;
  return { cost: lot.cost, expenses, sales, profit, toBreakEven: Math.max(0, lot.cost + expenses - sales), byUnit, invoices: invoices.length };
}

/** نص قصير للكميات: «3.5 طن + 40 شوال». */
export function woodUnitsText(byUnit: Record<string, number>): string {
  return Object.entries(byUnit)
    .filter(([, q]) => q)
    .map(([u, q]) => `${Number.isInteger(q) ? q : q.toFixed(3).replace(/0+$/, '')} ${u}`)
    .join(' + ');
}

