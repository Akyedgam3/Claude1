import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'عطور الشام', activity: 'perfumes', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('perfumes'), defaultTaxes());
  return l;
}

describe('perfumes: formulas and manufacturing', () => {
  it('making cologne takes the alcohol, oil and bottles out of stock and adds the cologne at its cost', () => {
    const l = shop();
    l.saveItem({ id: 'alc', code: '1', name: 'كحول', kind: 'stock', unit: 'مل', price: 0, priceCurrency: 'SYP' });
    l.saveItem({ id: 'oil', code: '2', name: 'زيت ليمون', kind: 'stock', unit: 'مل', price: 0, priceCurrency: 'SYP' });
    l.saveItem({ id: 'btl', code: '3', name: 'عبوة 100', kind: 'stock', unit: 'قطعة', price: 0, priceCurrency: 'SYP' });
    // الوصفة مكتوبة لـ 10 عبوات: 800 مل كحول + 200 مل زيت + 10 عبوات
    l.saveItem({ id: 'col', code: '4', name: 'كولونيا', kind: 'stock', unit: 'عبوة', price: 250_000, priceCurrency: 'SYP', recipe: [{ itemId: 'alc', qty: 80 }, { itemId: 'oil', qty: 20 }, { itemId: 'btl', qty: 1 }], recipeYield: 10 });
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'alc', qty: 1000, unitCost: 60 }, { itemId: 'oil', qty: 500, unitCost: 600 }, { itemId: 'btl', qty: 50, unitCost: 25_000 }] });
    const p = l.postProduction({ date: '2026-01-02', outputs: [{ itemId: 'col', qty: 10 }] });
    expect(l.state.stock['alc']!.totalQty).toBe(200);
    expect(l.state.stock['oil']!.totalQty).toBe(300);
    expect(l.state.stock['btl']!.totalQty).toBe(40);
    expect(l.state.stock['col']!.totalQty).toBe(10);
    // 800×60 + 200×600 + 10×25,000 = 48,000 + 120,000 + 250,000
    expect(p.outputs[0]!.cost).toBe(418_000);
    expect(l.state.items['col']!.recipeYield).toBe(10);
  });

  it('the actual quantities used can differ from the recipe', () => {
    const l = shop();
    l.saveItem({ id: 'alc', code: '1', name: 'كحول', kind: 'stock', unit: 'مل', price: 0, priceCurrency: 'SYP' });
    l.saveItem({ id: 'col', code: '4', name: 'كولونيا', kind: 'stock', unit: 'مل', price: 50, priceCurrency: 'SYP', recipe: [{ itemId: 'alc', qty: 0.8 }], recipeYield: 1000 });
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'alc', qty: 1000, unitCost: 60 }] });
    l.postProduction({ date: '2026-01-02', outputs: [{ itemId: 'col', qty: 1000 }], inputs: [{ itemId: 'alc', qty: 820 }] });
    expect(l.state.stock['alc']!.totalQty).toBe(180);
    expect(l.state.stock['col']!.totalQty).toBe(1000);
  });

  it('demo data loads with recipes, production runs and sales', () => {
    const l = shop();
    l.loadDemoData();
    expect(l.state.productions.length).toBe(3);
    expect(l.state.stock['p-cologne']!.totalQty).toBe(40 - 12 - 2);
    expect(l.state.stock['p-alcohol']!.totalQty).toBe(20000 - 40 * 80 - 20 * 32 - 700);
    expect(l.state.invoices.length).toBe(3);
  });
});
