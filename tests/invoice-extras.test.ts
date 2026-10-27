import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, incomeStatement, invoicePartyBalance, invoiceProfit, partyBalance, type Item } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'ماركت', activity: 'supermarket', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('supermarket'), defaultTaxes());
  l.saveParty({ id: 'sup', kind: 'supplier', name: 'المورد' });
  l.saveParty({ id: 'cus', kind: 'customer', name: 'أبو خالد' });
  const item: Item = { id: 'rice', code: '0001', name: 'رز', kind: 'stock', unit: 'كيس', price: 15_000, priceCurrency: 'SYP' };
  l.saveItem(item);
  l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', lines: [{ itemId: 'rice', qty: 10, price: 10_000 }], paid: 100_000 });
  return l;
}

describe('profits of credit invoices', () => {
  it('a credit sale counts in the profit exactly like a cash sale', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-03-02', lines: [{ itemId: 'rice', qty: 2, price: 15_000 }] });
    const credit = l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'cus', lines: [{ itemId: 'rice', qty: 2, price: 15_000 }], paid: 0 });
    expect(incomeStatement(l.state, { from: '2026-03-02', to: '2026-03-02' }).netProfit).toBe(20_000);
    expect(invoiceProfit(l.state, credit)).toEqual({ revenue: 30_000, cost: 20_000, profit: 10_000 });
  });
});

describe('delete an invoice made by mistake', () => {
  it('reverses it on its own date, returns the stock and hides it', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'cus', lines: [{ itemId: 'rice', qty: 3, price: 15_000 }], paid: 0 });
    l.deleteInvoice(inv.id, '2026-03-20');
    const after = l.state.invoices.find((i) => i.id === inv.id)!;
    expect(after.deleted).toBe(true);
    expect(after.voidEntryId).toBeTruthy();
    expect(l.state.entries.find((e) => e.id === after.voidEntryId)!.date).toBe('2026-03-02');
    expect(l.state.stock['rice']!.totalQty).toBe(10);
    expect(partyBalance(l.state, 'cus').base).toBe(0);
    expect(incomeStatement(l.state, { from: '2026-03-02', to: '2026-03-02' }).netProfit).toBe(0);
    expect(() => l.deleteInvoice(inv.id, '2026-03-20')).toThrow();
  });

  it('uses today when the invoice date is in a locked period', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'sale', date: '2026-03-02', lines: [{ itemId: 'rice', qty: 1, price: 15_000 }] });
    l.lockPeriod('2026-03-10');
    l.deleteInvoice(inv.id, '2026-03-20');
    const voidEntry = l.state.entries.find((e) => e.id === l.state.invoices.find((i) => i.id === inv.id)!.voidEntryId)!;
    expect(voidEntry.date).toBe('2026-03-20');
  });
});

describe('delete an item', () => {
  it('refuses while it has stock, then hides it and frees its code', () => {
    const l = shop();
    expect(() => l.deleteItem('rice')).toThrow(/رصيد/);
    l.saveItem({ id: 'oops', code: '0002', name: 'غلط', kind: 'stock', unit: 'قطعة', price: 1, priceCurrency: 'SYP', barcode: '123' });
    l.deleteItem('oops');
    expect(l.state.items['oops']!.archived).toBe(true);
    // الرمز والباركود صاروا متاحين لمادة جديدة
    l.saveItem({ id: 'new', code: '0002', name: 'صح', kind: 'stock', unit: 'قطعة', price: 1, priceCurrency: 'SYP', barcode: '123' });
    expect(l.state.items['new']!.code).toBe('0002');
  });

  it('refuses an item used in a recipe', () => {
    const l = shop();
    l.saveItem({ id: 'salt', code: '0003', name: 'ملح', kind: 'stock', unit: 'كيلو', price: 1, priceCurrency: 'SYP' });
    l.saveItem({ id: 'meal', code: '0004', name: 'وجبة', kind: 'composite', unit: 'صحن', price: 1, priceCurrency: 'SYP', recipe: [{ itemId: 'salt', qty: 0.01 }] });
    expect(() => l.deleteItem('salt')).toThrow(/وصفة/);
  });
});

describe('previous balance on the invoice', () => {
  it('shows what the customer owed before the invoice and after it', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'cus', lines: [{ itemId: 'rice', qty: 2, price: 15_000 }], paid: 0 });
    const second = l.postInvoice({ kind: 'sale', date: '2026-03-03', partyId: 'cus', lines: [{ itemId: 'rice', qty: 1, price: 15_000 }], paid: 10_000 });
    expect(invoicePartyBalance(l.state, second)).toEqual({ previous: 30_000, after: 35_000 });
    // دفعة بعدين ما بتغيّر شي عالفاتورة القديمة
    l.postVoucher({ kind: 'receipt', date: '2026-03-04', partyId: 'cus', amount: 25_000, memo: 'دفعة' });
    expect(invoicePartyBalance(l.state, second)).toEqual({ previous: 30_000, after: 35_000 });
  });
});
