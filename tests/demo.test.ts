import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, orderTotals, trialBalance, workOrderProgress, type Activity } from '../src/core';

function company(activity: Activity) {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'تجربة', activity, baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor(activity), defaultTaxes());
  return l;
}

describe('demo data', () => {
  it('fills a restaurant with menu, tables, ingredients and live orders', () => {
    const l = company('restaurant');
    l.loadDemoData();
    expect(Object.keys(l.state.tables).length).toBe(15);
    const open = Object.values(l.state.orders).filter((o) => o.status === 'open');
    expect(open.length).toBe(4);
    expect(l.state.invoices.filter((i) => i.source?.type === 'order').length).toBe(2);
    // المكوّنات نقصت من المخزون بسبب الطلبات المسكّرة
    expect(l.state.stock['r-chicken']!.totalQty).toBeLessThan(60);
    const delivery = open.find((o) => o.type === 'delivery')!;
    expect(orderTotals(delivery).delivery).toBe(5000);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(() => l.loadDemoData()).toThrow('فاضية');
  });

  it('fills a tailor shop with orders, rolls and a production order', () => {
    const l = company('tailor');
    l.loadDemoData();
    expect(Object.keys(l.state.rolls).length).toBe(6);
    const p = workOrderProgress(l.state, l.state.workOrders['wo-1']!);
    expect(p.lays).toBe(46);
    expect(p.cut).toBe(138);
    expect(p.done).toBe(120);
    expect(p.delivered).toBe(110);
    expect(p.expensesCustomer).toBe(24000);
    expect(Object.keys(l.state.tailorOrders).length).toBe(2);
  });

  it('fills a sweets and ice cream shop with units by box and cup', () => {
    const l = company('sweets');
    l.loadDemoData();
    const ice = l.state.items['sw-icecream']!;
    expect(ice.units?.map((u) => u.name)).toContain('كاسة وسط');
    // كاستين وسط = 0.3 كيلو نقصت من 20
    expect(l.state.stock['sw-icecream']!.totalQty).toBeCloseTo(19.7, 5);
    // علبة كيلو بقلاوة نقصت من الدفعة اللي إلها صلاحية
    expect(l.state.stock['sw-baklava']!.totalQty).toBeCloseTo(11, 5);
    const cash = l.state.invoices.find((i) => i.partyId === null)!;
    expect(cash.lines.find((x) => x.itemId === 'sw-icecream')!.note).toBe('فستق حلبي، قشطة');
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('fills a supermarket with barcodes, cartons, weighed goods, expiry and debts', () => {
    const l = company('supermarket');
    l.loadDemoData();
    const rice = l.state.items['g-rice']!;
    expect(rice.units?.[0]).toMatchObject({ name: 'كرتونة', factor: 10 });
    // كرتونة رز للمطعم نقصت 10 قطع
    expect(l.state.stock['g-rice']!.totalQty).toBe(60 - 2 - 10);
    expect(l.state.items['w-cheese']!.weighed).toBe(true);
    expect(l.state.stock['w-cheese']!.totalQty).toBeCloseTo(17.25, 5);
    expect(l.state.invoices.filter((i) => i.kind === 'sale').length).toBe(6);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('fills a phone shop with IMEIs, an installment plan and a trade-in', () => {
    const l = company('mobile');
    l.loadDemoData();
    expect(Object.keys(l.state.installments).length).toBe(1);
    expect(l.state.stock['p-used']!.totalQty).toBe(1);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('fills a general shop', () => {
    const l = company('general');
    l.loadDemoData();
    expect(l.state.invoices.length).toBe(2);
  });
});
