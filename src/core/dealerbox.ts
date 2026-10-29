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

/** حصة الفاتورة من المواد المشتركة بسعر الفاتورة (المورد ممكن يبيع أغلى). */
export function sharedPart(state: CompanyState, inv: Invoice): { amount: number; paid: number } {
  const share = sharedShare(state, inv.lines);
  return { amount: Math.round(inv.total * share), paid: Math.round(inv.paid * share) };
}

/** قيمة أدوية الصيدلية بالفاتورة بسعر بيع الصيدلية (مش بسعر المورد). */
export function pharmacyValue(state: CompanyState, inv: Invoice): number {
  let v = 0;
  for (const l of inv.lines) {
    const it = l.itemId ? state.items[l.itemId] : undefined;
    if (!it || it.hidden) continue;
    const unit = l.unit ? it.units?.find((u) => u.name === l.unit) : undefined;
    const sameCur = it.priceCurrency === inv.currency;
    const unitPrice = sameCur ? (unit?.price ?? Math.round(it.price * (l.factor ?? 1))) : l.price;
    v += Math.round(unitPrice * l.qty);
  }
  return v;
}

/** الباقي على المورد للصيدلية: أدويتها اللي باعها بسعر بيعها، ناقص اللي تحوّل لصندوقها. */
export function dueToShared(state: CompanyState, boxId: string, sharedId: string): number {
  let due = 0;
  const live = new Set(state.invoices.filter((i) => !i.voidEntryId).map((i) => i.id));
  for (const [id, amount] of Object.entries(state.dealerDues ?? {})) if (live.has(id)) due += amount;
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

/** بعد ما المورد يسكّر فاتورة: بيصير عليه للصيدلية سعر بيعها لأدويتها، والمقبوض (لحد هالمبلغ) بيتحوّل لحاله لصندوقها. فرق السعر إله. */
export function settleDealerInvoice(ledger: Ledger, inv: Invoice): void {
  const st = ledger.state;
  if (inv.cashAccountId !== DEALER_BOX_ID || (inv.kind !== 'sale' && inv.kind !== 'sale_return')) return;
  const owed = pharmacyValue(st, inv);
  if (owed <= 0) return;
  ledger.setDealerDue(inv.id, inv.kind === 'sale' ? owed : -owed);
  if (inv.kind !== 'sale') return;
  const pay = Math.min(owed, sharedPart(st, inv).paid);
  const to = sharedBoxOf(st);
  if (pay <= 0 || to === DEALER_BOX_ID) return;
  ledger.transferBox({ date: inv.date, from: DEALER_BOX_ID, to, amount: pay, memo: `حق الصيدلية من فاتورة مبيع رقم ${inv.number}`, sourceId: `inv:${inv.id}` });
}

/** إلغاء الفاتورة: التحويل التلقائي إلها بيتلغى معها. */
export function unsettleDealerInvoice(ledger: Ledger, invoiceId: string, date: string): void {
  for (const e of ledger.state.entries) if (e.source?.type === 'boxtransfer' && e.source.id === `inv:${invoiceId}` && !e.voidOf && !ledger.state.voided[e.id]) ledger.voidEntry(e.id, date);
}
