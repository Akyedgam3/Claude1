import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, itemMovements, itemsSummary } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'c1', kind: 'customer', name: 'أبو أحمد' });
  l.saveItem({ id: 'x', code: '1', name: 'زيت', kind: 'stock', unit: 'قطعة', price: 1500, priceCurrency: 'USD' });
  l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'x', qty: 10, unitCost: 1000 }] });
  l.postInvoice({ kind: 'purchase', date: '2026-02-01', currency: 'USD', lines: [{ itemId: 'x', qty: 10, price: 1000 }] });
  return l;
}

describe('item tracker', () => {
  it('same-day moves keep the order they were recorded in (stock added, then sold)', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
    l.saveItem({ id: 'z', code: '9', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 800, priceCurrency: 'USD' });
    l.adjustStock({ kind: 'opening', date: '2026-05-05', lines: [{ itemId: 'z', qty: 10, unitCost: 500 }] });
    l.postInvoice({ kind: 'sale', date: '2026-05-05', currency: 'USD', lines: [{ itemId: 'z', qty: 2, price: 800 }], paid: 1600 });
    l.adjustStock({ kind: 'opening', date: '2026-05-05', lines: [{ itemId: 'z', qty: 3, unitCost: 0 }] });
    expect(itemMovements(l.state, 'z').moves.map((m) => m.balance)).toEqual([10, 8, 11]);
  });

  it('lists every movement with a running balance, opening and closing for a period', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-03-01', partyId: 'c1', currency: 'USD', lines: [{ itemId: 'x', qty: 4, price: 1500 }], paid: 6000 });
    l.adjustStock({ kind: 'damage', date: '2026-03-05', lines: [{ itemId: 'x', qty: 1 }] });
    const all = itemMovements(l.state, 'x');
    expect(all.moves.map((m) => m.balance)).toEqual([10, 20, 16, 15]);
    const march = itemMovements(l.state, 'x', { from: '2026-03-01', to: '2026-03-31' });
    expect(march.opening).toBe(20);
    expect(march.moves).toHaveLength(2);
    expect(march.closing).toBe(15);
    expect(march.moves[0]).toMatchObject({ type: 'فاتورة مبيع', ref: '#1', party: 'أبو أحمد', qty: -4, revenue: 6000, cost: 4000, profit: 2000 });
  });

  it('profit per item counts the invoice discount, returns and shows losses', () => {
    const l = shop();
    // خصم على الفاتورة 10.00 من 30.00: صافي البيع 20.00 والتكلفة 20.00 فالربح صفر
    l.postInvoice({ kind: 'sale', date: '2026-03-01', currency: 'USD', lines: [{ itemId: 'x', qty: 2, price: 1500 }], discount: 1000, paid: 2000 });
    // بيعة بخسارة: 9.00 والتكلفة 10.00
    l.postInvoice({ kind: 'sale', date: '2026-03-02', currency: 'USD', lines: [{ itemId: 'x', qty: 1, price: 900 }], paid: 900 });
    const s = itemsSummary(l.state).find((r) => r.item.id === 'x')!;
    expect(s.soldQty).toBe(3);
    expect(s.revenue).toBe(2900);
    expect(s.cost).toBe(3000);
    expect(s.profit).toBe(-100);
    expect(s.invoices).toBe(2);
    expect(s.purchasedQty).toBe(10);
    expect(s.closing).toBe(17);
  });

  it('voided invoices are ignored and sales without cost are flagged', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'sale', date: '2026-03-01', currency: 'USD', lines: [{ itemId: 'x', qty: 5, price: 1500 }], paid: 7500 });
    l.deleteInvoice(inv.id, '2026-03-02');
    expect(itemMovements(l.state, 'x').closing).toBe(20);
    l.saveItem({ id: 'y', code: '2', name: 'بلا تكلفة', kind: 'stock', unit: 'قطعة', price: 500, priceCurrency: 'USD' });
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'y', qty: 5, unitCost: 0 }] });
    l.postInvoice({ kind: 'sale', date: '2026-03-03', currency: 'USD', lines: [{ itemId: 'y', qty: 1, price: 500 }], paid: 500 });
    expect(itemsSummary(l.state).find((r) => r.item.id === 'y')!.noCost).toBe(true);
  });
});
