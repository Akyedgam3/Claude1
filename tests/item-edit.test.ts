import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, SYSTEM_ACCOUNTS, accountBalance, chartFor, defaultTaxes, invoiceProfit, partyBalance, stockReport, trialBalance } from '../src/core';
import { costPlan } from '../src/core/recost';

// تعديل سعر الشراء من بطاقة المادة، حذف مادة إلها رصيد وترجيعها، والمسوّق اللي بيشتري لحالو

const D = '2026-11-10';
function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'USD' });
  return l;
}
const consistent = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(accountBalance(l.state, SYSTEM_ACCOUNTS.inventory).balance).toBe(Object.values(l.state.stock).reduce((s, x) => s + x.value, 0));
  expect(costPlan(l.state).lines).toHaveLength(0);
};

describe('purchase price from the item card', () => {
  it('changes the purchase price and the cost of the stock on hand, quantity stays', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    l.revalueItem({ date: D, itemId: 'a', unitCost: 500, applyToStock: true });
    expect(l.state.stock['a']).toMatchObject({ totalQty: 10, value: 5000, lastCost: 500 });
    // اشترى من قبل: الفرق على فروقات الجرد والتقييم
    expect(accountBalance(l.state, SYSTEM_ACCOUNTS.countDifferences).balance).toBe(1000);
    const s = l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 2, price: 1000 }] });
    expect(invoiceProfit(l.state, s).cost).toBe(1000);
    consistent(l);
    expect(l.recalculateCosts()).toBe(0);
  });

  it('opening stock with a wrong cost: the fix goes to opening balances (does not touch profit)', () => {
    const l = shop();
    l.adjustStock({ kind: 'opening', date: D, lines: [{ itemId: 'a', qty: 4, unitCost: 900 }] });
    l.revalueItem({ date: D, itemId: 'a', unitCost: 700, applyToStock: true });
    expect(l.state.stock['a']).toMatchObject({ totalQty: 4, value: 2800 });
    expect(accountBalance(l.state, SYSTEM_ACCOUNTS.countDifferences).balance).toBe(0);
    consistent(l);
  });

  it('only the purchase price (no stock, or not applied): next purchase invoices start from it', () => {
    const l = shop();
    l.revalueItem({ date: D, itemId: 'a', unitCost: 450, applyToStock: true });
    expect(l.state.stock['a']).toMatchObject({ totalQty: 0, value: 0, lastCost: 450 });
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 3, price: 600 }] });
    l.revalueItem({ date: D, itemId: 'a', unitCost: 650, applyToStock: false });
    expect(l.state.stock['a']).toMatchObject({ totalQty: 3, value: 1800, lastCost: 650 });
    consistent(l);
  });

  it('voiding the change brings the old cost back', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    const r = l.revalueItem({ date: D, itemId: 'a', unitCost: 500, applyToStock: true });
    l.voidAdjustment(r.id, D);
    expect(l.state.stock['a']!.value).toBe(6000);
    consistent(l);
  });
});

describe('delete an item that still has stock', () => {
  it('disappears from the lists, stock and value stay, and it comes back', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 5, price: 600 }] });
    l.deleteItem('a');
    expect(l.state.items['a']!.archived).toBe(true);
    expect(l.state.stock['a']).toMatchObject({ totalQty: 5, value: 3000 });
    expect(stockReport(l.state).find((r) => r.item.id === 'a')?.qty).toBe(5);
    consistent(l);
    l.restoreItem('a');
    expect(l.state.items['a']!.archived).toBeUndefined();
  });
});

describe('marketer buying for himself', () => {
  it('no commission is taken from his own invoice; recalculating removes old ones', () => {
    const l = shop();
    l.saveParty({ id: 'm', kind: 'customer', name: 'مسوّق', marketerRate: 10 });
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    l.postInvoice({ kind: 'sale', date: D, partyId: 'm', marketerId: 'm', lines: [{ itemId: 'a', qty: 2, price: 1000 }] });
    expect(partyBalance(l.state, 'm').base).toBe(2000); // عليه الفاتورة كاملة
    expect(l.state.entries.some((e) => e.source?.type === 'commission')).toBe(false);
    // لزبون تاني: عمولته عادي
    l.postInvoice({ kind: 'sale', date: D, partyId: 'c', marketerId: 'm', lines: [{ itemId: 'a', qty: 2, price: 1000 }] });
    expect(partyBalance(l.state, 'm').base).toBe(2000 - 80);
  });
});
