// قبل ما يطلع دفع من صندوق: إذا المبلغ أكبر من اللي بالصندوق منسأل (تقرير التجربة B4: دفع 642,000 والصندوق
// فيه 251,680 انقبل بدون كلمة وصار الصندوق بالسالب).
import { cashAccountFor, type CompanyState } from '../../../core';
import { money } from '../api';
import { askConfirm } from './ui';

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
