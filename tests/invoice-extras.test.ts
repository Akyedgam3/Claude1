import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, incomeStatement, invoicePartyBalance, invoiceProfit, partyBalance, trialBalance, accountBalance, type Item } from '../src/core';

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

describe('edit the price of a purchase whose goods moved or sold', () => {
  it('reprices without moving stock: the remaining stock takes the difference, the sold part goes to cost of sales', () => {
    const l = shop(); // 10 رز بسعر 10,000 مدفوعة
    l.saveWarehouse({ id: 'b', name: 'مستودع 2' });
    l.saveParty({ id: 'sup2', kind: 'supplier', name: 'مورد' });
    const p = l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup2', lines: [{ itemId: 'rice', qty: 10, price: 12_000 }] });
    l.transferStock({ date: '2026-03-02', from: 'main', to: 'b', lines: [{ itemId: 'rice', qty: 15 }] });
    l.postInvoice({ kind: 'sale', date: '2026-03-03', warehouseId: 'b', lines: [{ itemId: 'rice', qty: 12, price: 15_000 }] });
    const valueBefore = l.state.stock['rice']!.value;
    const re = l.replaceInvoice(p.id, { kind: 'purchase', date: '2026-03-01', partyId: 'sup2', lines: [{ itemId: 'rice', qty: 10, price: 11_000 }] });
    expect(re.total).toBe(110_000);
    expect(re.number).toBe(p.number);
    expect(l.state.invoices.find((i) => i.id === p.id)!.voidEntryId).toBeTruthy();
    expect(l.state.stock['rice']!.qty).toEqual({ main: 5, b: 3 });
    // 8 بالمخزون من أصل 10: 8,000 فرق على المخزون، و2,000 على تكلفة المبيعات
    expect(l.state.stock['rice']!.value).toBe(valueBefore - 8_000);
    expect(partyBalance(l.state, 'sup2').base).toBe(-110_000);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(accountBalance(l.state, '1104').balance).toBe(l.state.stock['rice']!.value);
  });

  it('serial items moved to another warehouse can be repriced', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'موبايلات', activity: 'mobile', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('mobile'), defaultTaxes());
    l.saveWarehouse({ id: 'b', name: 'مستودع 2' });
    l.saveItem({ id: 'ph', code: 'P', name: 'موبايل', kind: 'stock', unit: 'قطعة', price: 1, priceCurrency: 'SYP', trackSerial: true });
    const p = l.postInvoice({ kind: 'purchase', date: '2026-03-01', lines: [{ itemId: 'ph', qty: 2, price: 50_000, serials: ['A1', 'A2'] }] });
    l.transferStock({ date: '2026-03-02', from: 'main', to: 'b', lines: [{ itemId: 'ph', qty: 1, serials: ['A1'] }] });
    l.replaceInvoice(p.id, { kind: 'purchase', date: '2026-03-01', lines: [{ itemId: 'ph', qty: 2, price: 45_000, serials: ['A2', 'A1'] }] });
    expect(l.state.stock['ph']!.serials).toEqual({ A1: 'b', A2: 'main' });
    expect(l.state.stock['ph']!.value).toBe(90_000);
  });
});
