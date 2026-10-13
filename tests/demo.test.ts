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

  it('fills a general shop', () => {
    const l = company('general');
    l.loadDemoData();
    expect(l.state.invoices.length).toBe(2);
  });
});
