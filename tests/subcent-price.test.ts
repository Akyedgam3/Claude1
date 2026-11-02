import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, formatMinor, toUnitPrice, type Item } from '../src/core';

describe('unit prices finer than the currency (0.076$ a piece)', () => {
  it('parses and formats sub-cent prices', () => {
    expect(toUnitPrice('0.076', 2)).toBe(7.6);
    expect(toUnitPrice('31.35', 2)).toBe(3135);
    expect(formatMinor(7.6, 2)).toBe('0.076');
    expect(formatMinor(3135, 2)).toBe('31.35');
    expect(() => toUnitPrice('0.000001', 2)).toThrow();
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
