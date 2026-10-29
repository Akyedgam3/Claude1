import { lineAmount } from './commerce';
import type { CompanyState } from './types';

// صندوق المورد الخاص: المورد (الجهاز الأساسي) بيبيع على صندوقه، والصيدلية (متصلة عن بعد) على الصندوق المشترك.
// المواد المشتركة اللي باعها المورد بسعر المبيع بتصير «مستحقة» للصندوق المشترك لحتى يحوّلها.

export const DEALER_BOX_ID = '11019';

export const isHiddenItem = (state: CompanyState, id: string | null | undefined) => !!id && !!state.items[id]?.hidden;
export const isHiddenAccount = (state: CompanyState, id: unknown) => typeof id === 'string' && !!state.accounts[id]?.hidden;

/** حصة المواد المشتركة من الفاتورة (نسبة من مجموع البنود). */
function sharedShare(state: CompanyState, lines: { itemId: string | null; qty: number; price: number; discount: number }[]): number {
  let all = 0, shared = 0;
  for (const l of lines) {
    const a = lineAmount(l);
    all += a;
    if (!isHiddenItem(state, l.itemId)) shared += a;
  }
  return all > 0 ? shared / all : 0;
}

/** شقد لازم يتحوّل من صندوق المورد للصندوق المشترك: المقبوض عن المواد المشتركة ناقص المرتجع وناقص اللي تحوّل. */
export function dueToShared(state: CompanyState, boxId: string, sharedId: string): number {
  const base = state.info?.baseCurrency;
  let due = 0;
  for (const inv of state.invoices) {
    if (inv.voidEntryId || inv.cashAccountId !== boxId || inv.currency !== base) continue;
    if (inv.kind !== 'sale' && inv.kind !== 'sale_return') continue;
    const part = Math.round(inv.paid * sharedShare(state, inv.lines));
    due += inv.kind === 'sale' ? part : -part;
  }
  for (const e of state.entries) {
    if (e.source?.type !== 'boxtransfer' || state.voided[e.id]) continue;
    const out = e.lines.find((l) => l.accountId === boxId && l.credit > 0);
    const into = e.lines.find((l) => l.accountId === sharedId && l.debit > 0);
    if (out && into) due -= into.debit;
    const back = e.lines.find((l) => l.accountId === sharedId && l.credit > 0);
    const toBox = e.lines.find((l) => l.accountId === boxId && l.debit > 0);
    if (back && toBox) due += toBox.debit;
  }
  return due;
}
