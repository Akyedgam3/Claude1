import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, dailyProfit, defaultTaxes, incomeStatement, invoiceProfit, partyBalance, trialBalance } from '../src/core';
import { partyDebts } from '../src/core/reports';

// الإحصائيات لازم تطابق بعضها: ربح الفواتير = الربح اليومي = قائمة الدخل، والباقي من كل فاتورة صح.
const D = '2026-11-15';
function shop(opts: { negative?: boolean } = {}) {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  if (opts.negative) l.updateCompany({ ...l.state.info!, allowNegativeStock: true });
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'USD' });
  return l;
}
const remaining = (l: Ledger, invId: string) => {
  const inv = l.state.invoices.find((x) => x.id === invId)!;
  return partyDebts(l.state, inv.partyId!).find((x) => x.currency === inv.currency)?.movements.find((m) => m.entryId === inv.entryId)?.remaining;
};
const dayGross = (l: Ledger) => dailyProfit(l.state, D, D)[0]!.gross;

describe('profit and balances stay consistent', () => {
  it('editing an invoice does not mark the customer’s other invoices as paid', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 100, price: 600 }] });
    const small = l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 1, price: 190 }] });
    const big = l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 10, price: 1000 }] });
    const edited = l.replaceInvoice(big.id, { kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 11, price: 1000 }] } as never);
    expect(remaining(l, small.id)).toBe(190);
    expect(remaining(l, edited.id)).toBe(11_000);
    expect(partyBalance(l.state, 'c').base).toBe(11_190);
    // دفعة حقيقية بتسدّ الأقدم أول
    l.postVoucher({ kind: 'receipt', date: D, amount: 500, partyId: 'c', memo: 'دفعة' });
    expect(remaining(l, small.id)).toBe(0);
    expect(remaining(l, edited.id)).toBe(10_690);
  });

  it('selling before buying (negative stock): the purchase fixes the cost, daily profit is right', () => {
    const l = shop({ negative: true });
    l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 5, price: 1000 }] });
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    const s2 = l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 5, price: 1000 }] });
    expect(invoiceProfit(l.state, s2).cost).toBe(3_000);
    // 10 قطع × (1000 − 600)
    expect(dayGross(l)).toBe(4_000);
    expect(incomeStatement(l.state, { from: D, to: D }).netProfit).toBe(4_000);
    expect(l.state.stock['a']).toMatchObject({ totalQty: 0, value: 0, lastCost: 600 });
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('adding stock (+ quantity) after selling short fixes the cost too, and voiding the purchase undoes it', () => {
    const l = shop({ negative: true });
    l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 4, price: 1000 }] });
    l.adjustStock({ kind: 'opening', date: D, lines: [{ itemId: 'a', qty: 10, unitCost: 700 }] });
    expect(dayGross(l)).toBe(4 * 300);
    expect(l.state.stock['a']).toMatchObject({ totalQty: 6, value: 4_200 });
    const l2 = shop({ negative: true });
    l2.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 4, price: 1000 }] });
    const p = l2.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 700 }] });
    l2.voidInvoice(p.id, D);
    // انلغى الشراء: الـ4 المنباعين بيضلوا بآخر تكلفة معروفة (700)، مش ببلاش
    expect(l2.state.stock['a']).toMatchObject({ totalQty: -4, value: -2_800 });
    expect(dayGross(l2)).toBe(4 * 300);
    const tb = trialBalance(l2.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('normal flows: invoice profits = daily profit = income statement', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 20, price: 600 }] });
    const a = l.postInvoice({ kind: 'sale', date: D, partyId: 'c', discount: 100, lines: [{ itemId: 'a', qty: 3, price: 1000 }] });
    const r = l.postInvoice({ kind: 'sale_return', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 1, price: 1000 }] });
    const b = l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 2, price: 950 }] });
    l.replaceInvoice(b.id, { kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 4, price: 950 }] } as never);
    const live = l.state.invoices.filter((i) => !i.voidEntryId);
    const sum = live.filter((i) => i.kind === 'sale').reduce((s, i) => s + invoiceProfit(l.state, i).profit, 0) - invoiceProfit(l.state, r).profit;
    expect(dayGross(l)).toBe(sum);
    expect(incomeStatement(l.state, { from: D, to: D }).netProfit).toBe(sum);
    void a;
  });
});
