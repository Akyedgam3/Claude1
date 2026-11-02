import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, formatMinor, toUnitPrice, type Item } from '../src/core';

describe('unit prices finer than the currency (0.076$ a piece)', () => {
  it('parses and formats sub-cent prices', () => {
    expect(toUnitPrice('0.076', 2)).toBe(7.6);
    expect(toUnitPrice('31.35', 2)).toBe(3135);
    expect(formatMinor(7.6, 2)).toBe('0.076');
    expect(formatMinor(3135, 2)).toBe('31.35');
    expect(() => toUnitPrice('0.000000001', 2)).toThrow();
  });

  it('posts a purchase line of 600 × 0.076$ = 45.60$', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'أدوات', activity: 'supermarket', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('supermarket'), defaultTaxes());
    l.saveParty({ id: 'sup', kind: 'supplier', name: 'عمي اغا' });
    const item: Item = { id: 'sh', code: '1', name: 'شرار مسدس', kind: 'stock', unit: 'قطعة', price: 10, priceCurrency: 'USD' };
    l.saveItem(item);
    const inv = l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 'sup', currency: 'USD', lines: [{ itemId: 'sh', qty: 600, price: 7.6 }, { itemId: null, description: 'خلاط', qty: 12, price: 3135 }], paid: 0 });
    expect(inv.total).toBe(4560 + 37620);
    expect(l.state.stock['sh']!.value).toBe(4560);
  });
});

describe('half a cent and smaller (0.0005$)', () => {
  it('accepts item and invoice prices like 0.0005$', () => {
    expect(toUnitPrice('0.0005', 2)).toBe(0.05);
    expect(formatMinor(0.05, 2)).toBe('0.0005');
    expect(formatMinor(toUnitPrice('0.000001', 2), 2)).toBe('0.000001');
    expect(formatMinor(toUnitPrice('0.00000005', 2), 2)).toBe('0.00000005');
    const l = new Ledger(() => {});
    l.createCompany({ name: 'أدوات', activity: 'supermarket', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('supermarket'), defaultTaxes());
    l.saveItem({ id: 'b', code: '1', name: 'برغي', kind: 'stock', unit: 'قطعة', price: 0.08, priceCurrency: 'USD' } as Item);
    l.postInvoice({ kind: 'purchase', date: '2026-03-01', currency: 'USD', lines: [{ itemId: 'b', qty: 10_000, price: 0.05 }] });
    expect(l.state.stock['b']!.value).toBe(500);
    expect(l.state.stock['b']!.lastCost).toBe(0.05);
    const sale = l.postInvoice({ kind: 'sale', date: '2026-03-02', currency: 'USD', lines: [{ itemId: 'b', qty: 5000, price: 0.08 }] });
    expect(sale.total).toBe(400);
    expect(l.state.stock['b']!.value).toBe(250);
  });
});

describe('average unit cost display', () => {
  it('keeps 4 significant digits under one unit', async () => {
    const { niceUnitCost } = await import('../src/core');
    expect(formatMinor(niceUnitCost(9409 / 144, 2), 2)).toBe('0.6534');
    expect(formatMinor(niceUnitCost(0.005, 2), 2)).toBe('0.00005');
    expect(formatMinor(niceUnitCost(1234.4, 2), 2)).toBe('12.34');
  });
});
