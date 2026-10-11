import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCIES,
  Ledger,
  accountBalance,
  allocate,
  chartFor,
  defaultTaxes,
  partyBalance,
  stockReport,
  trialBalance,
  type Item,
} from '../src/core';

function shop() {
  const ledger = new Ledger(() => {});
  ledger.createCompany(
    { name: 'قطع غيار أبو سمير', activity: 'auto', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
    DEFAULT_CURRENCIES,
    chartFor('auto'),
    defaultTaxes(),
  );
  ledger.saveParty({ id: 'sup', kind: 'supplier', name: 'مستودع الشام للقطع' });
  ledger.saveParty({ id: 'cus', kind: 'customer', name: 'أبو خالد' });
  const filter: Item = {
    id: 'filter',
    code: 'F-001',
    name: 'فلتر زيت كيا ريو',
    kind: 'stock',
    unit: 'قطعة',
    partNumber: '26300-35505',
    compat: 'كيا ريو 2012-2016',
    price: 50_000,
    priceCurrency: 'SYP',
  };
  ledger.saveItem(filter);
  return ledger;
}

const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
};

describe('invoices and stock', () => {
  it('purchase on credit then sale with partial payment', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', lines: [{ itemId: 'filter', qty: 10, price: 30_000 }] });
    expect(l.state.stock['filter']).toMatchObject({ totalQty: 10, value: 300_000 });
    expect(partyBalance(l.state, 'sup').base).toBe(-300_000);

    const sale = l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'cus', lines: [{ itemId: 'filter', qty: 2, price: 50_000 }], paid: 40_000 });
    expect(sale.total).toBe(100_000);
    expect(sale.lines[0]!.cost).toBe(60_000);
    expect(accountBalance(l.state, '4101').balance).toBe(-100_000);
    expect(accountBalance(l.state, '5101').balance).toBe(60_000);
    expect(accountBalance(l.state, '1104').balance).toBe(240_000);
    expect(accountBalance(l.state, '1101').balance).toBe(40_000);
    expect(partyBalance(l.state, 'cus').base).toBe(60_000);
    expect(stockReport(l.state)[0]).toMatchObject({ qty: 8, value: 240_000, avgCost: 30_000 });
    balanced(l);
  });

  it('uses moving average cost across purchases', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', lines: [{ itemId: 'filter', qty: 10, price: 30_000 }] });
    l.postInvoice({ kind: 'purchase', date: '2026-03-05', partyId: 'sup', lines: [{ itemId: 'filter', qty: 10, price: 40_000 }] });
    const sale = l.postInvoice({ kind: 'sale', date: '2026-03-06', lines: [{ itemId: 'filter', qty: 1, price: 60_000 }] });
    expect(sale.lines[0]!.cost).toBe(35_000);
    expect(sale.paid).toBe(60_000); // زبون نقدي
    balanced(l);
  });

  it('voiding an invoice restores stock and balances', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', lines: [{ itemId: 'filter', qty: 5, price: 30_000 }] });
    const sale = l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'cus', lines: [{ itemId: 'filter', qty: 2, price: 50_000 }] });
    l.voidInvoice(sale.id, '2026-03-03');
    expect(l.state.stock['filter']).toMatchObject({ totalQty: 5, value: 150_000 });
    expect(partyBalance(l.state, 'cus').base).toBe(0);
    expect(() => l.voidInvoice(sale.id, '2026-03-03')).toThrow(/ملغاة/);
    expect(() => l.voidEntry(sale.entryId, '2026-03-03')).toThrow(/فاتورة/);
    balanced(l);
  });

  it('handles sale returns and purchase returns', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', lines: [{ itemId: 'filter', qty: 5, price: 30_000 }] });
    l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'cus', lines: [{ itemId: 'filter', qty: 2, price: 50_000 }] });
    l.postInvoice({ kind: 'sale_return', date: '2026-03-03', partyId: 'cus', lines: [{ itemId: 'filter', qty: 1, price: 50_000 }] });
    expect(l.state.stock['filter']!.totalQty).toBe(4);
    expect(partyBalance(l.state, 'cus').base).toBe(50_000);
    l.postInvoice({ kind: 'purchase_return', date: '2026-03-04', partyId: 'sup', lines: [{ itemId: 'filter', qty: 1, price: 30_000 }] });
    expect(l.state.stock['filter']!.totalQty).toBe(3);
    expect(partyBalance(l.state, 'sup').base).toBe(-120_000);
    balanced(l);
  });

  it('prices in USD and posts in SYP at the day rate', () => {
    const l = shop();
    l.setRate({ date: '2026-03-01', currency: 'USD', kind: 'market', rate: 120 });
    l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', currency: 'USD', lines: [{ itemId: 'filter', qty: 3, price: 2_50 }] });
    expect(l.state.stock['filter']!.value).toBe(3 * 250 * 120);
    expect(partyBalance(l.state, 'sup').byCurrency).toEqual({ USD: -750 });
    balanced(l);
  });

  it('applies consumption tax and invoice discount', () => {
    const l = shop();
    l.saveTax({ ...l.state.taxes['consumption']!, percent: 5, active: true });
    const inv = l.postInvoice({
      kind: 'sale',
      date: '2026-03-02',
      lines: [{ itemId: 'filter', qty: 2, price: 50_000 }],
      discount: 10_000,
      taxIds: ['consumption'],
    });
    expect(inv).toMatchObject({ subtotal: 100_000, taxTotal: 4_500, total: 94_500 });
    expect(accountBalance(l.state, '2103').balance).toBe(-4_500);
    expect(accountBalance(l.state, '4103').balance).toBe(10_000);
    balanced(l);
  });

  it('rejects bad invoices', () => {
    const l = shop();
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-03-02', lines: [{ itemId: 'filter', qty: 1, price: 1 }], paid: 0 })).toThrow(/عميلاً/);
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'sup', lines: [{ itemId: 'filter', qty: 1, price: 1 }] })).toThrow(/مورد/);
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-03-02', lines: [{ itemId: 'filter', qty: 0, price: 1 }] })).toThrow(/الكمية/);
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-03-02', lines: [] })).toThrow(/فارغة/);
    expect(l.state.invoices).toHaveLength(0);
  });

  it('rejects duplicate item codes and barcodes', () => {
    const l = shop();
    const base = l.state.items['filter']!;
    expect(() => l.saveItem({ ...base, id: 'x' })).toThrow(/الرمز/);
    l.saveItem({ ...base, code: 'F-002', barcode: '123' });
    expect(() => l.saveItem({ ...base, id: 'y', code: 'F-003', barcode: '123' })).toThrow(/الباركود/);
  });
});

describe('vouchers', () => {
  it('receipt from a customer reduces the debt', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-03-02', partyId: 'cus', lines: [{ itemId: 'filter', qty: 1, price: 50_000 }] });
    const e = l.postVoucher({ kind: 'receipt', date: '2026-03-05', amount: 20_000, partyId: 'cus', memo: 'دفعة' });
    expect(e.memo).toContain('سند قبض رقم 1');
    expect(partyBalance(l.state, 'cus').base).toBe(30_000);
    l.postVoucher({ kind: 'payment', date: '2026-03-05', amount: 5_000, accountId: '5204', memo: 'أمبيرات' });
    expect(accountBalance(l.state, '5204').balance).toBe(5_000);
    balanced(l);
  });
});

describe('auto repair module', () => {
  it('turns a repair order into an invoice with parts and labor', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', lines: [{ itemId: 'filter', qty: 5, price: 30_000 }] });
    l.saveVehicle({ id: 'car', partyId: 'cus', plate: 'دمشق 123456', make: 'كيا', model: 'ريو', year: 2014 });
    const order = l.saveRepair({
      id: 'r1',
      vehicleId: 'car',
      partyId: 'cus',
      date: '2026-03-10',
      status: 'open',
      odometer: 154_000,
      complaint: 'تغيير زيت وفلتر',
      currency: 'SYP',
      parts: [{ itemId: 'filter', qty: 1, price: 50_000 }],
      labor: [{ description: 'أجور تغيير زيت', amount: 25_000 }],
    });
    expect(order.number).toBe(1);

    const inv = l.invoiceRepair('r1', { date: '2026-03-10', paid: 75_000 });
    expect(inv.total).toBe(75_000);
    expect(accountBalance(l.state, '4201').balance).toBe(-25_000); // أجور اليد
    expect(accountBalance(l.state, '4101').balance).toBe(-50_000); // القطع
    expect(l.state.repairs['r1']).toMatchObject({ status: 'invoiced', invoiceId: inv.id });
    expect(l.state.stock['filter']!.totalQty).toBe(4);
    expect(() => l.invoiceRepair('r1', { date: '2026-03-10' })).toThrow(/مفوتر/);
    expect(l.saveRepair({ ...l.state.repairs['r1']!, id: 'r2', status: 'open' }).number).toBe(2);
    balanced(l);
  });
});

describe('allocate', () => {
  it('splits exactly', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([33, 33, 34]);
    expect(allocate(0, [0, 0])).toEqual([0, 0]);
    expect(allocate(10, [0, 5, 0]).reduce((a, b) => a + b)).toBe(10);
  });
});
