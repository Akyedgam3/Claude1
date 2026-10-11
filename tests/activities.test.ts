import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCIES,
  Ledger,
  accountBalance,
  amountInWords,
  chartFor,
  defaultTaxes,
  ean13CheckDigit,
  expiringBatches,
  generateVariants,
  numberToArabicWords,
  resolveScan,
  traceSerial,
  trialBalance,
  type Activity,
  type Item,
} from '../src/core';

function company(activity: Activity) {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'x', activity, baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor(activity), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  return l;
}

const stock = (id: string, over: Partial<Item> = {}): Item => ({ id, code: id, name: id, kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'SYP', ...over });

const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  const stockValue = Object.values(l.state.stock).reduce((s, x) => s + x.value, 0);
  expect(accountBalance(l.state, '1104').balance).toBe(stockValue);
};

describe('pharmacy: batches and expiry', () => {
  it('sells the nearest expiry first and reports expiring batches', () => {
    const l = company('pharmacy');
    l.saveItem(stock('panadol', { trackExpiry: true, name: 'بنادول' }));
    l.postInvoice({
      kind: 'purchase',
      date: '2026-01-01',
      partyId: 's',
      lines: [
        { itemId: 'panadol', qty: 5, price: 100, batch: 'B2', expiry: '2027-06-01' },
        { itemId: 'panadol', qty: 3, price: 100, batch: 'B1', expiry: '2026-03-01' },
      ],
    });
    const sale = l.postInvoice({ kind: 'sale', date: '2026-01-10', lines: [{ itemId: 'panadol', qty: 4, price: 200 }] });
    expect(sale.lines[0]!.batches).toEqual([
      { batch: 'B1', qty: 3, expiry: '2026-03-01' },
      { batch: 'B2', qty: 1, expiry: '2027-06-01' },
    ]);
    expect(Object.values(l.state.stock['panadol']!.batches!).map((b) => [b.batch, b.qty])).toEqual([['B2', 4]]);
    expect(() => l.postInvoice({ kind: 'purchase', date: '2026-01-01', lines: [{ itemId: 'panadol', qty: 1, price: 1 }] })).toThrow(/الدفعة|الصلاحية/);

    l.voidInvoice(sale.id, '2026-01-11');
    expect(Object.values(l.state.stock['panadol']!.batches!).map((b) => [b.batch, b.qty]).sort()).toEqual([['B1', 3], ['B2', 5]]);
    const soon = expiringBatches(l.state, '2026-02-15', 30);
    expect(soon.map((b) => b.batch)).toEqual(['B1']);
    expect(expiringBatches(l.state, '2026-03-02', 0)[0]!.expired).toBe(true);

    l.adjustStock({ kind: 'damage', date: '2026-03-05', lines: [{ itemId: 'panadol', qty: 3, batch: 'B1' }] });
    expect(Object.keys(l.state.stock['panadol']!.batches!)).toEqual(['main|B2']);
    balanced(l);
  });
});

describe('mobiles: serial numbers', () => {
  it('tracks IMEI from purchase to sale and back', () => {
    const l = company('mobile');
    l.saveItem(stock('a54', { trackSerial: true, name: 'Galaxy A54', warrantyMonths: 12 }));
    l.postInvoice({ kind: 'purchase', date: '2026-01-01', partyId: 's', lines: [{ itemId: 'a54', qty: 2, price: 300_00, serials: ['IMEI-1', 'IMEI-2'] }] });
    expect(() => l.postInvoice({ kind: 'purchase', date: '2026-01-01', lines: [{ itemId: 'a54', qty: 1, price: 1, serials: ['IMEI-1'] }] })).toThrow(/موجود مسبقاً/);
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'a54', qty: 1, price: 1 }] })).toThrow(/رقم تسلسلي/);
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'a54', qty: 1, price: 1, serials: ['IMEI-9'] }] })).toThrow(/غير موجود/);
    l.postInvoice({ kind: 'sale', date: '2026-01-02', partyId: 'c', lines: [{ itemId: 'a54', qty: 1, price: 350_00, serials: ['IMEI-2'] }] });
    const trace = traceSerial(l.state, 'IMEI-2');
    expect(trace.inStock).toBeNull();
    expect(trace.history.map((h) => h.invoice.kind)).toEqual(['purchase', 'sale']);
    expect(traceSerial(l.state, 'IMEI-1').inStock).toEqual({ itemId: 'a54', warehouseId: 'main' });
    l.postInvoice({ kind: 'sale_return', date: '2026-01-03', partyId: 'c', lines: [{ itemId: 'a54', qty: 1, price: 350_00, serials: ['IMEI-2'] }] });
    expect(traceSerial(l.state, 'IMEI-2').inStock).not.toBeNull();
    balanced(l);
  });
});

describe('restaurant: recipes, tables and orders', () => {
  it('closes an order and deducts the ingredients of each dish', () => {
    const l = company('restaurant');
    l.saveItem(stock('meat', { unit: 'كيلو', name: 'لحمة' }));
    l.saveItem(stock('bread', { name: 'خبز' }));
    l.saveItem({ id: 'shawarma', code: 'M1', name: 'سندويشة شاورما', kind: 'composite', unit: 'قطعة', price: 25_000, priceCurrency: 'SYP', recipe: [{ itemId: 'meat', qty: 0.1 }, { itemId: 'bread', qty: 1 }] });
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'meat', qty: 5, unitCost: 100_000 }, { itemId: 'bread', qty: 100, unitCost: 1_000 }] });
    l.saveTable({ id: 't1', name: 'طاولة 1' });
    const order = l.saveOrder({ id: 'o1', type: 'dine_in', tableId: 't1', status: 'open', lines: [{ id: 'x', itemId: 'shawarma', qty: 3, price: 25_000 }] });
    expect(order.number).toBe(1);
    expect(() => l.saveOrder({ id: 'o2', type: 'dine_in', tableId: 't1', status: 'open', lines: [] })).toThrow(/طلب مفتوح/);
    const inv = l.closeOrder('o1', { date: '2026-01-02' });
    expect(inv.total).toBe(75_000);
    expect(inv.lines[0]!.cost).toBe(3 * (10_000 + 1_000));
    expect(l.state.stock['meat']!.totalQty).toBe(4.7);
    expect(l.state.stock['bread']!.totalQty).toBe(97);
    expect(l.state.orders['o1']!.status).toBe('closed');
    expect(accountBalance(l.state, '4101').balance).toBe(-75_000);
    expect(() => l.closeOrder('o1', { date: '2026-01-02' })).toThrow(/مغلق/);
    balanced(l);
  });
});

describe('bakery: production', () => {
  it('turns raw materials into finished goods at cost', () => {
    const l = company('bakery');
    l.saveItem(stock('flour', { unit: 'كيلو', name: 'طحين' }));
    l.saveItem(stock('sugar', { unit: 'كيلو', name: 'سكر' }));
    l.saveItem(stock('cake', { unit: 'قطعة', name: 'كيك', recipe: [{ itemId: 'flour', qty: 0.2 }, { itemId: 'sugar', qty: 0.1 }] }));
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'flour', qty: 50, unitCost: 5_000 }, { itemId: 'sugar', qty: 20, unitCost: 10_000 }] });
    const p = l.postProduction({ date: '2026-01-02', outputs: [{ itemId: 'cake', qty: 20 }] });
    expect(p.inputs).toEqual([
      { itemId: 'flour', qty: 4, cost: 20_000 },
      { itemId: 'sugar', qty: 2, cost: 20_000 },
    ]);
    expect(l.state.stock['cake']).toMatchObject({ totalQty: 20, value: 40_000, lastCost: 2_000 });
    expect(() => l.postProduction({ date: '2026-01-02', outputs: [{ itemId: 'cake', qty: 1000 }] })).toThrow(/المتوفرة/);
    balanced(l);
  });
});

describe('clinic: appointments', () => {
  it('invoices a finished appointment', () => {
    const l = company('clinic');
    l.saveItem({ id: 'visit', code: 'S1', name: 'معاينة', kind: 'service', unit: 'جلسة', price: 50_000, priceCurrency: 'SYP' });
    l.saveAppointment({ id: 'a1', partyId: 'c', date: '2026-01-05', time: '10:30', minutes: 30, itemId: 'visit', status: 'booked' });
    const inv = l.invoiceAppointment('a1', { date: '2026-01-05', paid: 50_000 });
    expect(accountBalance(l.state, '4201').balance).toBe(-50_000);
    expect(l.state.appointments['a1']).toMatchObject({ status: 'done', invoiceId: inv.id });
    expect(() => l.invoiceAppointment('a1', { date: '2026-01-05' })).toThrow(/مفوتر/);
    l.voidInvoice(inv.id, '2026-01-06');
    expect(l.state.appointments['a1']!.invoiceId).toBeUndefined();
    expect(() => l.saveAppointment({ id: 'a2', partyId: 'c', date: '2026-01-05', time: '25', minutes: 30, status: 'booked' })).toThrow(/وقت/);
  });
});

describe('auto: void reopens the repair order', () => {
  it('lets a voided repair invoice be edited and invoiced again', () => {
    const l = company('auto');
    l.saveItem(stock('oil'));
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'oil', qty: 5, unitCost: 500 }] });
    l.saveVehicle({ id: 'v', partyId: 'c', plate: '123', make: 'كيا', model: 'ريو' });
    l.saveRepair({ id: 'r', vehicleId: 'v', partyId: 'c', date: '2026-01-02', status: 'open', complaint: '', currency: 'SYP', parts: [{ itemId: 'oil', qty: 1, price: 1000 }], labor: [] });
    const inv = l.invoiceRepair('r', { date: '2026-01-02' });
    expect(() => l.saveRepair({ ...l.state.repairs['r']!, status: 'open' })).toThrow(/مفوتر/);
    l.voidInvoice(inv.id, '2026-01-03');
    expect(l.state.repairs['r']).toMatchObject({ status: 'done' });
    expect(l.state.repairs['r']!.invoiceId).toBeUndefined();
    l.invoiceRepair('r', { date: '2026-01-03' });
    balanced(l);
  });

  it('supports devices without plate numbers', () => {
    const l = company('mobile');
    l.saveVehicle({ id: 'd', partyId: 'c', kind: 'device', plate: '', make: 'Samsung', model: 'A54', vin: 'IMEI-7' });
    expect(() => l.saveVehicle({ id: 'v', partyId: 'c', plate: '', make: 'كيا', model: 'ريو' })).toThrow(/اللوحة/);
  });
});

describe('scale barcodes, variants and words', () => {
  it('reads weight from a scale barcode', () => {
    const l = company('butcher');
    l.saveItem(stock('lamb', { code: '00123', name: 'لحم غنم', weighed: true, unit: 'كيلو' }));
    const first12 = '210012301250';
    const code = first12 + ean13CheckDigit(first12);
    expect(resolveScan(l.state, code)).toMatchObject({ item: { id: 'lamb' }, qty: 1.25 });
    expect(resolveScan(l.state, first12 + ((ean13CheckDigit(first12) + 1) % 10))).toBeNull();
    expect(resolveScan(l.state, '00123')).toMatchObject({ item: { id: 'lamb' } });
  });

  it('generates size and color variants', () => {
    const variants = generateVariants({ name: 'قميص', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'SYP' }, 'SH', ['M', 'L'], ['أبيض', 'أسود']);
    expect(variants).toHaveLength(4);
    expect(variants[0]).toMatchObject({ code: 'SH-01', name: 'قميص أبيض M', group: 'قميص', attributes: { المقاس: 'M', اللون: 'أبيض' } });
    const l = company('clothing');
    expect(l.saveItems(variants)).toBe(4);
  });

  it('writes amounts in Arabic words', () => {
    expect(numberToArabicWords(0)).toBe('صفر');
    expect(numberToArabicWords(21)).toBe('واحد وعشرون');
    expect(numberToArabicWords(1250)).toBe('ألف ومئتان وخمسون');
    expect(numberToArabicWords(2000)).toBe('ألفان');
    expect(numberToArabicWords(5000)).toBe('خمسة آلاف');
    expect(numberToArabicWords(15000)).toBe('خمسة عشر ألفاً');
    expect(numberToArabicWords(300000)).toBe('ثلاثمئة ألف');
    expect(numberToArabicWords(2_500_000)).toBe('مليونان وخمسمئة ألف');
    expect(amountInWords(125_050, 'SYP')).toBe('فقط ألف ومئتان وخمسون ليرة سورية وخمسون قرشاً لا غير');
    expect(amountInWords(10_000, 'USD')).toBe('فقط مئة دولار أمريكي لا غير');
  });
});
