import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, type Item, applyListPricing, chartFor, defaultTaxes, guessColumns, listPrices, partyListPrice, readListRows, splitPasted, trialBalance } from '../src/core';

describe('list pricing (electrical)', () => {
  it('computes cost, master and retail prices from the list', () => {
    const info = { name: 'x', baseCurrency: 'SYP', fiscalYearStart: '01-01', listPricing: { buyDiscount: 15, masterDiscount: 10, retailMarkup: 5, brands: { 'ب': 20 } } };
    expect(listPrices(info, { listPrice: 1000 })).toEqual({ list: 1000, cost: 850, master: 900, retail: 1050 });
    expect(listPrices(info, { listPrice: 1000, brand: 'ب' }).cost).toBe(800);
    expect(listPrices(info, { listPrice: 1000, brand: 'ب', buyDiscount: 25 }).cost).toBe(750);
    const it2 = applyListPricing(info, <Item>{ id: 'i', code: '1', name: 'م', kind: 'stock', unit: 'قطعة', price: 0, priceCurrency: 'USD', listPrice: 200 });
    expect([it2.price, it2.wholesalePrice]).toEqual([210, 180]);
    expect(partyListPrice({ listPrice: 1000 }, { listDiscount: 12 })).toBe(880);
    expect(partyListPrice({ listPrice: 1000 }, {})).toBeUndefined();
  });

  it('reads a pasted price list and guesses the columns', () => {
    const text = 'تسلسل\tالصنف\tالكود\tالتعبئة\tالسعر $\n1\tمفتاح مفرد 16 امبير\t2000\t480\t0.7\n2\tمفتاح مفرد بضوء\t2010\t400\t1.5\n3\tكباسة جرس\t2011\t400\t1.0';
    const rows = splitPasted(text);
    const cols = guessColumns(rows.slice(1));
    expect(cols).toEqual(['skip', 'name', 'code', 'pack', 'price']);
    expect(readListRows(rows, cols)).toEqual([
      { code: '2000', name: 'مفتاح مفرد 16 امبير', pack: 480, price: 0.7 },
      { code: '2010', name: 'مفتاح مفرد بضوء', pack: 400, price: 1.5 },
      { code: '2011', name: 'كباسة جرس', pack: 400, price: 1 },
    ]);
  });

  it('reads rows copied from the PDF text (price first, serial last)', () => {
    const text = ' 0.7       480   2000          مفتاح مفرد 16 امبير                1\n 1.5       400   2010        مفتاح مفرد بضوء 16 امبير             2\n 1.0       480   2001         مفتاح دركسيون 16 امبير              3';
    const rows = splitPasted(text);
    const cols = guessColumns(rows);
    expect(cols).toEqual(['price', 'pack', 'code', 'name', 'skip']);
    expect(readListRows(rows, cols)[1]).toEqual({ code: '2010', name: 'مفتاح مفرد بضوء 16 امبير', pack: 400, price: 1.5 });
  });

  it('loads the electrical demo', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'كهربائيات', activity: 'electrical', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('electrical'), defaultTaxes());
    l.loadDemoData();
    expect(Object.values(l.state.items).filter((i) => i.brand === 'نيوباور').length).toBeGreaterThan(50);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });
});
