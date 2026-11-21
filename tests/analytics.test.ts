import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, agingTotals, chartFor, defaultTaxes, expenseBreakdown, incomeStatement, positions, kpis, paymentMix, presetRange, previousRange, rangeDays, salesRhythm, slowItems, topCustomers, topItems, trend } from '../src/core';

// لوحة الإدارة: أرقامها لازم تطابق التقارير (قائمة الدخل) حرفياً، وهي قراءة بس

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  l.saveParty({ id: 'c1', kind: 'customer', name: 'أبو علي' });
  l.saveParty({ id: 'c2', kind: 'customer', name: 'مطعم' });
  l.saveItem({ id: 'a', code: 'A', name: 'رز', kind: 'stock', unit: 'كيس', price: 1500, priceCurrency: 'USD' });
  l.saveItem({ id: 'b', code: 'B', name: 'زيت', kind: 'stock', unit: 'قطعة', price: 3000, priceCurrency: 'USD' });
  l.saveItem({ id: 'z', code: 'Z', name: 'راكد', kind: 'stock', unit: 'قطعة', price: 900, priceCurrency: 'USD' });
  l.postInvoice({ kind: 'purchase', date: '2026-10-01', partyId: 's', lines: [{ itemId: 'a', qty: 50, price: 1000 }, { itemId: 'b', qty: 20, price: 2000 }, { itemId: 'z', qty: 5, price: 500 }] });
  l.postInvoice({ kind: 'sale', date: '2026-10-20', partyId: 'c1', paid: 3000, lines: [{ itemId: 'a', qty: 2, price: 1500 }] });
  l.postInvoice({ kind: 'sale', date: '2026-11-03', partyId: 'c1', lines: [{ itemId: 'a', qty: 4, price: 1500 }] }); // دين كامل
  l.postInvoice({ kind: 'sale', date: '2026-11-05', partyId: 'c2', paid: 9000, lines: [{ itemId: 'b', qty: 3, price: 3000 }] });
  l.postInvoice({ kind: 'sale', date: '2026-11-10', paid: 1500, lines: [{ itemId: 'a', qty: 1, price: 1500 }] });
  l.postInvoice({ kind: 'sale_return', date: '2026-11-11', partyId: 'c2', lines: [{ itemId: 'b', qty: 1, price: 3000 }] });
  return l;
}

describe('management dashboard analytics', () => {
  it('periods: presets and the previous period of the same length', () => {
    expect(presetRange('month', '2026-11-21')).toEqual({ from: '2026-11-01', to: '2026-11-21' });
    expect(presetRange('lastMonth', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('lastMonth', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(previousRange({ from: '2026-11-01', to: '2026-11-21' })).toEqual({ from: '2026-10-11', to: '2026-10-31' });
    expect(rangeDays({ from: '2026-11-01', to: '2026-11-21' })).toBe(21);
  });

  it('kpis match the income statement and the invoices', () => {
    const l = shop();
    const r = { from: '2026-11-01', to: '2026-11-30' };
    const k = kpis(l.state, r);
    const is = incomeStatement(l.state, r);
    expect(k.net).toBe(is.netProfit);
    expect(k.revenue).toBe(is.revenue);
    expect(k.sales).toBe(6000 + 9000 + 1500);
    expect(k.returns).toBe(3000);
    expect(k.netSales).toBe(13500);
    expect(k.invoices).toBe(3);
    expect(k.avgInvoice).toBe(5500);
    expect(k.credit).toBe(6000);
    expect(k.customers).toBe(2);
    expect(k.newCustomers).toBe(1); // المطعم اشترى أول مرة بتشرين التاني، أبو علي من قبل
    expect(k.cogs).toBe(4000 + 6000 + 1000 - 2000);
  });

  it('trend, top lists, payment mix, slow items and aging', () => {
    const l = shop();
    const r = { from: '2026-11-01', to: '2026-11-30' };
    const t = trend(l.state, r);
    expect(t).toHaveLength(30);
    expect(t.reduce((s, p) => s + p.revenue, 0)).toBe(kpis(l.state, r).revenue);
    expect(trend(l.state, { from: '2026-01-01', to: '2026-11-30' }).map((p) => p.key)).toHaveLength(11);
    expect(topItems(l.state, r, 'revenue')[0]).toMatchObject({ id: 'a', value: 7500 });
    expect(topCustomers(l.state, r).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(paymentMix(l.state, r)).toEqual({ cash: 10500, partial: 0, credit: 6000 });
    expect(slowItems(l.state, r).map((s) => s.id)).toEqual(['z']);
    expect(salesRhythm(l.state, r).weekdays.reduce((a, b) => a + b, 0)).toBe(16500);
    expect(expenseBreakdown(l.state, r)).toEqual([]);
    expect(positions(l.state, '2026-11-30')).toMatchObject({ receivables: 6000 - 3000, payables: 50000 + 40000 + 2500 }); // مرتجع المطعم صار إلو عنا
    const ag = agingTotals(l.state, '2026-11-21');
    expect(ag.total).toBe(6000 + 0);
    expect(ag.parties).toBe(1);
  });

  it('is read only: the state does not change', () => {
    const l = shop();
    const before = JSON.stringify(l.state);
    const r = presetRange('year', '2026-11-21');
    kpis(l.state, r);
    trend(l.state, r);
    topItems(l.state, r, 'profit');
    slowItems(l.state, r);
    agingTotals(l.state, '2026-11-21');
    expect(JSON.stringify(l.state)).toBe(before);
  });
});
