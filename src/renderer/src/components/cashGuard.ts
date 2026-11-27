// قبل ما يطلع دفع من صندوق: إذا المبلغ أكبر من اللي بالصندوق منسأل (تقرير التجربة B4: دفع 642,000 والصندوق
// فيه 251,680 انقبل بدون كلمة وصار الصندوق بالسالب).
import { cashAccountFor, convertMinor, findRate, itemUnitCost, type CompanyState } from '../../../core';
import { money } from '../api';
import { askChoice, askConfirm } from './ui';

/** رصيد الصندوق بعملة معيّنة (حركاته بهالعملة) */
export function boxBalanceIn(state: CompanyState, boxId: string, currency: string): number {
  let b = 0;
  for (const e of state.entries) for (const l of e.lines) if (l.accountId === boxId && l.currency === currency) b += l.debit - l.credit;
  return b;
}

/** true = كمّل. بيسأل بس إذا الدفع أكبر من رصيد الصندوق */
export async function confirmCashOut(state: CompanyState, boxId: string | undefined | null, currency: string, amount: number): Promise<boolean> {
  if (!(amount > 0)) return true;
  const box = boxId || cashAccountFor(state, currency);
  const acc = state.accounts[box];
  if (!acc) return true;
  const bal = boxBalanceIn(state, box, currency);
  if (amount <= bal) return true;
  return askConfirm(`بـ«${acc.name}» ${money(state, Math.max(0, bal), currency)} بس، والدفع ${money(state, amount, currency)}. الصندوق رح يصير بالسالب ${money(state, bal - amount, currency)}. كمّل؟`);
}

/**
 * فاتورة شراء مدفوعة من صندوق ما فيه كفاية (زبون دخّل بضاعة المحل القديمة كفواتير «مدفوعة من الصندوق» فصار الصندوق
 * بالسالب 11 ألف): منسأله شو القصة بدل نعم/لا.
 * 'ok' = كمّل عادي، 'capital' = المصاري (أو البضاعة) من عندو: كمّل ومنسجّل الناقص رأس مال، 'credit' = لسا ما دفع للمورد، null = رجوع.
 */
export async function purchaseCashChoice(state: CompanyState, boxId: string | undefined | null, currency: string, amount: number): Promise<{ choice: 'ok' | 'capital' | 'credit' | null; shortfall: number }> {
  if (!(amount > 0)) return { choice: 'ok', shortfall: 0 };
  const box = boxId || cashAccountFor(state, currency);
  const acc = state.accounts[box];
  if (!acc) return { choice: 'ok', shortfall: 0 };
  const bal = boxBalanceIn(state, box, currency);
  if (amount <= bal) return { choice: 'ok', shortfall: 0 };
  const shortfall = amount - Math.max(0, bal);
  const m = (v: number) => money(state, v, currency);
  const choice = (await askChoice(
    `الفاتورة ${m(amount)} مدفوعة من «${acc.name}»، وبالصندوق ${m(Math.max(0, bal))} بس. من وين إجت المصاري؟`,
    [
      { value: 'capital', label: 'البضاعة كانت عندي من قبل، أو دفعت من جيبتي', hint: `بتنحفظ الفاتورة، والناقص ${m(shortfall)} بينسجّل رأس مال إلك، فالصندوق ما بيصير بالسالب`, primary: true },
      { value: 'credit', label: 'لسا ما دفعت للمورد', hint: 'بتتحوّل الفاتورة لـ«دون دفع» وبتنحسب دين للمورد' },
      { value: 'ok', label: 'دفعت من الصندوق', hint: `الصندوق بيصير بالسالب ${m(bal - amount)} (يعني في مصاري ناقصة ما انسجّلت)` },
    ],
    'الصندوق ما فيه كفاية',
  )) as 'ok' | 'capital' | 'credit' | null;
  return { choice, shortfall };
}

/**
 * بيع تحت الكلفة (تقرير 2.0.14: الكاشير باع معكرونة كلفتها 5,000 بـ 100): اللي ما معه «البيع بأقل من الكلفة» بيترفض،
 * والباقي بيسألهن. السعر بعملة الفاتورة ولوحدة السطر، والكلفة بالعملة الأساسية للوحدة الأساسية. true = كمّل.
 */
export async function checkBelowCost(
  state: CompanyState,
  can: (p: string) => boolean,
  notify: (m: string, k?: 'ok' | 'error') => void,
  lines: { itemId?: string | null; price: number; unit?: string }[],
  currency: string,
  date: string,
  rate?: number,
): Promise<boolean> {
  const base = state.info!.baseCurrency;
  const r = currency === base ? 1 : (rate ?? findRate(state, currency, date) ?? 0);
  if (!(r > 0)) return true;
  const under: string[] = [];
  for (const l of lines) {
    const item = l.itemId ? state.items[l.itemId] : undefined;
    if (!item || (item.kind !== 'stock' && item.kind !== 'composite') || !(l.price > 0)) continue; // سعر صفر = عينة مجانية مقصودة
    const cost = itemUnitCost(state, item.id);
    if (!(cost > 0)) continue;
    const factor = (l.unit && item.units?.find((u) => u.name === l.unit)?.factor) || 1;
    const priceBase = currency === base ? l.price : convertMinor(l.price, state.currencies[currency]!, state.currencies[base]!, r);
    if (priceBase / factor < cost - 0.5) under.push(item.name);
  }
  if (!under.length) return true;
  const names = under.slice(0, 3).join('، ') + (under.length > 3 ? ` و${under.length - 3} غيرهن` : '');
  if (!can('price.belowCost')) {
    notify(`سعر «${names}» أقل من سعر الكلفة. ما فيك تبيع بخسارة، اسأل المالك`, 'error');
    return false;
  }
  return askConfirm(`سعر «${names}» أقل من سعر الكلفة (رح تبيع بخسارة). كمّل؟`);
}
