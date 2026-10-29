import { lineAmount } from './commerce';
import type { Ledger } from './ledger';
import type { CompanyState, Invoice } from './types';

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

/** الصندوق المشترك (صندوق الصيدلية): صندوق أول مستخدم إلو صندوق مش مخفي، وإلا «الصندوق». */
export function sharedBoxOf(state: CompanyState): string {
  for (const u of Object.values(state.users)) if (u.active && u.cashAccountId && state.accounts[u.cashAccountId] && !state.accounts[u.cashAccountId]!.hidden) return u.cashAccountId;
  return '1101';
}

/** حصة أدوية الصيدلية (المواد المشتركة) من فاتورة على صندوق المورد: القيمة كاملة والمقبوض منها. */
export function sharedPart(state: CompanyState, inv: Invoice): { amount: number; paid: number } {
  const share = sharedShare(state, inv.lines);
  return { amount: Math.round(inv.total * share), paid: Math.round(inv.paid * share) };
}

/** الباقي على المورد للصيدلية: قيمة أدوية الصيدلية اللي باعها (بسعر الصيدلية) ناقص المرتجع وناقص اللي تحوّل لصندوقها. */
export function dueToShared(state: CompanyState, boxId: string, sharedId: string): number {
  const base = state.info?.baseCurrency;
  let due = 0;
  for (const inv of state.invoices) {
    if (inv.voidEntryId || inv.cashAccountId !== boxId || inv.currency !== base) continue;
    if (inv.kind !== 'sale' && inv.kind !== 'sale_return') continue;
    const part = sharedPart(state, inv).amount;
    due += inv.kind === 'sale' ? part : -part;
  }
  for (const e of state.entries) {
    if (e.source?.type !== 'boxtransfer' || state.voided[e.id] || e.voidOf) continue;
    const out = e.lines.find((l) => l.accountId === boxId && l.credit > 0);
    const into = e.lines.find((l) => l.accountId === sharedId && l.debit > 0);
    if (out && into) due -= into.debit;
    const back = e.lines.find((l) => l.accountId === sharedId && l.credit > 0);
    const toBox = e.lines.find((l) => l.accountId === boxId && l.debit > 0);
    if (back && toBox) due += toBox.debit;
  }
  return due;
}

/** بعد ما المورد يسكّر فاتورة: المقبوض عن أدوية الصيدلية بيتحوّل لحاله لصندوقها (والباقي بيضل دين عليه). */
export function settleDealerInvoice(ledger: Ledger, inv: Invoice): void {
  const st = ledger.state;
  if (inv.cashAccountId !== DEALER_BOX_ID || inv.kind !== 'sale' || inv.currency !== st.info?.baseCurrency) return;
  const { paid } = sharedPart(st, inv);
  if (paid <= 0) return;
  const to = sharedBoxOf(st);
  if (to === DEALER_BOX_ID) return;
  ledger.transferBox({ date: inv.date, from: DEALER_BOX_ID, to, amount: paid, memo: `حصة الصيدلية من فاتورة مبيع رقم ${inv.number}`, sourceId: `inv:${inv.id}` });
}

/** إلغاء الفاتورة: التحويل التلقائي إلها بيتلغى معها. */
export function unsettleDealerInvoice(ledger: Ledger, invoiceId: string, date: string): void {
  for (const e of ledger.state.entries) if (e.source?.type === 'boxtransfer' && e.source.id === `inv:${invoiceId}` && !e.voidOf && !ledger.state.voided[e.id]) ledger.voidEntry(e.id, date);
}
