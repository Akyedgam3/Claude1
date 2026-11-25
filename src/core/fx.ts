// «الصرافة والحوالات» (2.0.8): نشرة أسعار شراء/مبيع لكل عملة، عمليات تصريف بربح فرق السعر،
// وحوالات صادرة وواردة عن طريق مكاتب (وكلاء) بعمولة ورمز استلام.
import type { CompanyState, FxDeal, Remittance } from './types';

/** سعر الوسط (بيصير سعر الصرف بالبرنامج) */
export const fxMid = (r: { buy: number; sell: number }) => (r.buy + r.sell) / 2;

/** نوع العملية من جهة المحل: شراء عملة أجنبية من الزبون، بيع إلو، أو عملة بعملة */
export function fxSide(base: string, give: string, take: string): FxDeal['side'] {
  if (give !== base && take === base) return 'buy';
  if (give === base && take !== base) return 'sell';
  return 'cross';
}

export const FX_SIDE_NAMES: Record<FxDeal['side'], string> = { buy: 'شراء', sell: 'مبيع', cross: 'عملة بعملة' };

/**
 * المبلغ المقابل حسب النشرة: الزبون بيعطي `amount` من `give` وبياخد من `take`.
 * المحل بيشتري الأجنبي بسعر الشراء وبيبيع بسعر المبيع، وعملة بعملة بتمر عالعملة الأساسية.
 * المبالغ بالوحدة الكبيرة (دولار، ليرة).
 */
export function fxQuote(state: CompanyState, give: string, take: string, amount: number): { amount: number; rate: number } | null {
  const base = state.info!.baseCurrency;
  const board = new Map((state.fxBoard?.rates ?? []).map((r) => [r.currency, r]));
  // كم عملة أساسية بياخد الزبون مقابل وحدة من give (المحل بيشتري بسعر الشراء)
  const inBase = give === base ? 1 : board.get(give)?.buy;
  // كم عملة أساسية بيدفع الزبون مقابل وحدة من take (المحل بيبيع بسعر المبيع)
  const outBase = take === base ? 1 : board.get(take)?.sell;
  if (!inBase || !outBase || give === take) return null;
  const rate = inBase / outBase; // وحدات take لكل وحدة give
  return { amount: amount * rate, rate };
}

/** سعر العملية للعرض: دايماً «كم ليرة بالدولار» للشراء والمبيع، و take/give لعملة بعملة */
export function fxDealRate(deal: Pick<FxDeal, 'side' | 'give' | 'take'>, decimals: (c: string) => number): number {
  const major = (x: { currency: string; amount: number }) => x.amount / 10 ** decimals(x.currency);
  if (deal.side === 'buy') return major(deal.take) / major(deal.give);
  if (deal.side === 'sell') return major(deal.give) / major(deal.take);
  return major(deal.take) / major(deal.give);
}

/** ملخص يوم: كم انشترى وانباع من كل عملة، وعدد العمليات، وربح فرق السعر (بالعملة الأساسية) */
export function fxDaySummary(state: CompanyState, date: string): { deals: number; profit: number; bought: Record<string, number>; sold: Record<string, number> } {
  const out = { deals: 0, profit: 0, bought: {} as Record<string, number>, sold: {} as Record<string, number> };
  for (const d of Object.values(state.fxDeals ?? {})) {
    if (d.date !== date || d.voided) continue;
    out.deals++;
    out.profit += d.profit;
    out.bought[d.give.currency] = (out.bought[d.give.currency] ?? 0) + d.give.amount;
    out.sold[d.take.currency] = (out.sold[d.take.currency] ?? 0) + d.take.amount;
  }
  return out;
}

export function fxDealList(state: CompanyState): FxDeal[] {
  return Object.values(state.fxDeals ?? {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function remittanceList(state: CompanyState): Remittance[] {
  return Object.values(state.remittances ?? {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const REMIT_STATUS_NAMES: Record<Remittance['status'], string> = { pending: 'معلّقة', delivered: 'انسلّمت', cancelled: 'ملغاة' };

/** رمز استلام من 6 أرقام (بيتأكد إنو مش مكرر بالحوالات المعلّقة) */
export function newRemitCode(state: CompanyState, random: () => number = Math.random): string {
  const used = new Set(Object.values(state.remittances ?? {}).filter((r) => r.status === 'pending').map((r) => r.code));
  for (;;) {
    const c = String(Math.floor(100000 + random() * 900000));
    if (!used.has(c)) return c;
  }
}

/** نص النشرة للواتساب */
export function fxBoardText(state: CompanyState, fmt: (code: string, rate: number) => string): string {
  const b = state.fxBoard;
  if (!b?.rates.length) return '';
  const name = (c: string) => state.currencies[c]?.nameAr ?? c;
  const lines = b.rates.map((r) => `${name(r.currency)}: شراء ${fmt(r.currency, r.buy)} · مبيع ${fmt(r.currency, r.sell)}`);
  return [`نشرة أسعار ${state.info?.name ?? ''} — ${b.date}`, ...lines].join('\n');
}
