import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, birdAverage, chartFor, defaultTaxes, lastPriceBoard, parseWeights, partyBalance, poultryDay, priceBoardText, trialBalance, weighingText } from '../src/core';

function distributor() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'موزع فروج', activity: 'poultry', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('poultry'), defaultTaxes());
  l.saveParty({ id: 'farm', kind: 'supplier', name: 'المدجنة' });
  l.saveParty({ id: 'shop', kind: 'customer', name: 'كوكي للدواجن', priceTier: 'wholesale' });
  return l;
}

describe('poultry distribution', () => {
  it('parses weights typed on the scale, Arabic digits included', () => {
    expect(parseWeights('99+110 ١١٤، 98٫5')).toEqual([99, 110, 114, 98.5]);
  });

  it('a load bought by weighings: net = weights − empty cages, with birds and dead', () => {
    const l = distributor();
    expect(l.addPoultryCuts()).toBe(15);
    expect(l.addPoultryCuts()).toBe(0);
    const inv = l.postInvoice({
      kind: 'purchase',
      date: '2026-10-27',
      partyId: 'farm',
      lines: [{ itemId: 'pl-whole', qty: 0, price: 24_000, weighing: { weights: [99, 110, 114], boxes: 6, tare: 42, count: 75, dead: 2 } }],
    });
    const line = inv.lines[0]!;
    expect(line.qty).toBe(281);
    expect(inv.total).toBe(281 * 24_000);
    expect(birdAverage(line.weighing!)).toBeCloseTo(281 / 73, 3);
    expect(weighingText(line.weighing!)).toContain('99 + 110 + 114 = 323 − فارغ 42 (6 قفص) = 281');
    expect(l.state.stock['pl-whole']!.totalQty).toBe(281);
    expect(partyBalance(l.state, 'farm').base).toBe(-281 * 24_000);
    expect(() => l.postInvoice({ kind: 'purchase', date: '2026-10-27', lines: [{ itemId: 'pl-whole', qty: 1, price: 1, weighing: { weights: [10], tare: 12 } }] })).toThrow(/الصافي/);
  });

  it('daily price board updates the items and keeps the history', () => {
    const l = distributor();
    l.addPoultryCuts();
    l.savePriceBoard('2026-10-27', { 'pl-whole': { price: 30_000, wholesale: 28_500 } });
    l.savePriceBoard('2026-10-28', { 'pl-whole': { price: 31_000, wholesale: 29_000 }, 'pl-wings': { price: 25_000 } });
    expect(l.state.items['pl-whole']).toMatchObject({ price: 31_000, wholesalePrice: 29_000 });
    expect(l.state.items['pl-wings']!.wholesalePrice).toBeUndefined();
    expect(lastPriceBoard(l.state, '2026-10-27')!.prices['pl-whole']!.price).toBe(30_000);
    const text = priceBoardText({ company: 'موزع', date: '28/10/2026', items: [l.state.items['pl-whole']!], prices: [{ price: 31_000, wholesale: 29_000 }], fmt: (m) => String(m / 100) });
    expect(text).toContain('فروج (كيلو): جملة 290 — مستهلك 310');
    expect(() => l.savePriceBoard('2026-10-28', { nope: { price: 1 } })).toThrow();
  });

  it('day summary: kilos bought and sold, profit per kilo, credit', () => {
    const l = distributor();
    l.addPoultryCuts();
    l.postInvoice({ kind: 'purchase', date: '2026-10-28', partyId: 'farm', lines: [{ itemId: 'pl-whole', qty: 0, price: 24_000, weighing: { weights: [100, 100], tare: 0, count: 50 } }] });
    l.postInvoice({ kind: 'sale', date: '2026-10-28', partyId: 'shop', lines: [{ itemId: 'pl-whole', qty: 0, price: 28_000, weighing: { weights: [52, 48], boxes: 2, tare: 10 } }], paid: 1_000_000 });
    const d = poultryDay(l.state, '2026-10-28');
    expect(d.bought).toMatchObject({ kg: 200, birds: 50, invoices: 1 });
    expect(d.sold).toMatchObject({ kg: 90, revenue: 90 * 28_000, cost: 90 * 24_000, invoices: 1, credit: 90 * 28_000 - 1_000_000 });
    expect(d.profitPerKg).toBe(4_000);
    expect(d.items.find((r) => r.itemId === 'pl-whole')!.stock).toBe(110);
  });

  it('demo data loads and balances', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'موزع', activity: 'poultry', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('poultry'), defaultTaxes());
    l.loadDemoData();
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(Object.keys(l.state.priceBoards!).length).toBe(2);
    expect(l.state.invoices.some((i) => i.lines.some((x) => x.weighing?.count === 75))).toBe(true);
  });
});
