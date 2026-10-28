import type { CompanyState, Dealer, DealerMove, DealerMoveKind, DealerSale } from './types';

// صيدلية مع موردين مستقلين: كل مورّد بيبيع من أدوية الصيدلية بسعره (الأغلى)، وبيتسجّل عليه سعر الصيدلية دين.
// إلو صندوقه وبضاعته الإضافية الخاصة، وأرباحه بدفتره لحال (ما بتدخل بأرباح الصيدلية).

export const DEALER_MOVE_NAMES: Record<DealerMoveKind, string> = {
  purchase: 'شراء بضاعة خاصة',
  payment: 'تسديد للصيدلية',
  expense: 'مصروف',
  withdraw: 'سحب',
  deposit: 'إيداع بالصندوق',
};

const liveSales = (state: CompanyState, dealerId: string) => (state.dealerSales ?? []).filter((s) => s.dealerId === dealerId && !s.voided);
const liveMoves = (state: CompanyState, dealerId: string) => (state.dealerMoves ?? []).filter((m) => m.dealerId === dealerId && !m.voided);

/** بضاعة المورّد الخاصة: الكمية والقيمة لكل مادة (شراء − مبيع). */
export function dealerStock(state: CompanyState, dealerId: string): Record<string, { qty: number; value: number }> {
  type Ev = { at: string; order: number; itemId: string; qty: number; value?: number };
  const evs: Ev[] = [];
  for (const m of liveMoves(state, dealerId)) if (m.kind === 'purchase') for (const l of m.lines ?? []) evs.push({ at: m.createdAt, order: 0, itemId: l.itemId, qty: l.qty, value: l.cost });
  for (const s of liveSales(state, dealerId)) for (const l of s.lines) if (l.own) evs.push({ at: s.createdAt, order: 1, itemId: l.itemId, qty: -l.qty, value: -l.cost });
  evs.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
  const out: Record<string, { qty: number; value: number }> = {};
  for (const e of evs) {
    const s = (out[e.itemId] ??= { qty: 0, value: 0 });
    s.qty = Math.round((s.qty + e.qty) * 1000) / 1000;
    s.value += e.value ?? 0;
    if (Math.abs(s.qty) < 1e-9) s.value = 0;
  }
  return out;
}

/** وسطي تكلفة الوحدة من بضاعة المورّد الخاصة. */
export function dealerUnitCost(state: CompanyState, dealerId: string, itemId: string): number {
  const s = dealerStock(state, dealerId)[itemId];
  return s && s.qty > 0 ? s.value / s.qty : 0;
}

/** صندوق المورّد: مبيعاته وإيداعاته ناقص الشراء والتسديد والمصاريف والسحب. */
export function dealerCash(state: CompanyState, dealerId: string): number {
  let cash = liveSales(state, dealerId).reduce((s, x) => s + x.total, 0);
  for (const m of liveMoves(state, dealerId)) cash += m.kind === 'deposit' ? m.amount : -m.amount;
  return cash;
}

export interface DealerSummary {
  sales: number;
  cost: number;
  profit: number;
  medsCost: number; // اللي انسجّل عليه للصيدلية من الأدوية
  ownProfit: number; // ربح بضاعته الخاصة
  invoices: number;
  expenses: number;
}

/** ملخص المورّد لفترة: المبيعات، التكلفة، الربح (أدوية + بضاعته)، المصاريف. */
export function dealerSummary(state: CompanyState, dealerId: string, from?: string, to?: string): DealerSummary {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const r: DealerSummary = { sales: 0, cost: 0, profit: 0, medsCost: 0, ownProfit: 0, invoices: 0, expenses: 0 };
  for (const s of liveSales(state, dealerId)) {
    if (!inRange(s.date)) continue;
    r.invoices++;
    r.sales += s.total;
    const gross = s.lines.reduce((a, l) => a + Math.round(l.qty * l.price), 0) || 1;
    for (const l of s.lines) {
      r.cost += l.cost;
      if (l.own) r.ownProfit += Math.round(l.qty * l.price - (s.discount * l.qty * l.price) / gross) - l.cost;
      else r.medsCost += l.cost;
    }
  }
  r.profit = r.sales - r.cost;
  for (const m of liveMoves(state, dealerId)) if (m.kind === 'expense' && inRange(m.date)) r.expenses += m.amount;
  return r;
}

/** الحركات بترتيبها لكشف المورّد. */
export function dealerLedger(state: CompanyState, dealer: Dealer): ({ kind: 'sale'; date: string; at: string; sale: DealerSale } | { kind: 'move'; date: string; at: string; move: DealerMove })[] {
  return [
    ...(state.dealerSales ?? []).filter((s) => s.dealerId === dealer.id).map((sale) => ({ kind: 'sale' as const, date: sale.date, at: sale.createdAt, sale })),
    ...(state.dealerMoves ?? []).filter((m) => m.dealerId === dealer.id).map((move) => ({ kind: 'move' as const, date: move.date, at: move.createdAt, move })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
}

/** السعر المقترح من التكلفة ونسبة الربح، مقرّب لأقرب 5 ليرات (أو أصغر وحدة). */
export function priceFromMargin(cost: number, margin: number, round = 500): number {
  const raw = cost * (1 + margin / 100);
  return round > 0 ? Math.ceil(raw / round) * round : Math.round(raw);
}
