import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, dealerCash, dealerStock, dealerSummary, defaultTaxes, incomeStatement, partyBalance, priceFromMargin, trialBalance } from '../src/core';

function pharmacy() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'صيدلية', activity: 'pharmacydealers', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('pharmacydealers'), defaultTaxes());
  // دوا: شراء 100، الصيدلية بتبيع 150، المورّد بيبيع 180
  l.saveItem({ id: 'med', code: 'M', name: 'بنادول', kind: 'stock', unit: 'علبة', price: 15_000, dealerPrice: 18_000, priceCurrency: 'SYP' });
  l.adjustStock({ kind: 'opening', date: '2026-10-01', lines: [{ itemId: 'med', qty: 50, unitCost: 10_000 }] });
  const d = l.saveDealer({ id: 'd1', name: 'أبو سامر', phone: '0944' });
  return { l, d };
}
const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
};

describe('pharmacy with independent dealers', () => {
  it('dealer sells pharmacy medicine at his price: pharmacy books its price as debt on him, his profit stays in his book', () => {
    const { l, d } = pharmacy();
    const s = l.postDealerSale({ dealerId: d.id, date: '2026-10-28', lines: [{ itemId: 'med', qty: 2, price: 18_000 }] });
    expect(s.total).toBe(36_000);
    // الصيدلية: بيعة بسعرها دين على المورّد، والمخزون نقص
    expect(l.state.stock['med']!.totalQty).toBe(48);
    expect(partyBalance(l.state, d.partyId).base).toBe(30_000);
    expect(incomeStatement(l.state, { from: '2026-10-28', to: '2026-10-28' }).netProfit).toBe(10_000);
    // المورّد: ربحه 6,000 وصندوقه 36,000
    expect(dealerSummary(l.state, d.id)).toMatchObject({ sales: 36_000, cost: 30_000, profit: 6_000, medsCost: 30_000 });
    expect(dealerCash(l.state, d.id)).toBe(36_000);
    // بيسدّد للصيدلية من صندوقه
    l.postDealerMove({ dealerId: d.id, date: '2026-10-28', kind: 'payment', amount: 30_000 });
    expect(partyBalance(l.state, d.partyId).base).toBe(0);
    expect(dealerCash(l.state, d.id)).toBe(6_000);
    balanced(l);
  });

  it('dealer own goods: his stock and full profit, not the pharmacy stock', () => {
    const { l, d } = pharmacy();
    l.saveItem({ id: 'toy', code: 'T', name: 'لعبة أطفال', kind: 'stock', unit: 'قطعة', price: 0, dealerPrice: 5_000, priceCurrency: 'SYP', dealerId: d.id });
    l.postDealerMove({ dealerId: d.id, date: '2026-10-27', kind: 'deposit', amount: 50_000, note: 'رأس مال' });
    l.postDealerMove({ dealerId: d.id, date: '2026-10-27', kind: 'purchase', lines: [{ itemId: 'toy', qty: 10, unitCost: 3_000 }] });
    expect(dealerStock(l.state, d.id)['toy']).toEqual({ qty: 10, value: 30_000 });
    expect(dealerCash(l.state, d.id)).toBe(20_000);
    const s = l.postDealerSale({ dealerId: d.id, date: '2026-10-28', lines: [{ itemId: 'toy', qty: 4, price: 5_000 }, { itemId: 'med', qty: 1, price: 18_000 }] });
    expect(s.lines.find((x) => x.own)!.cost).toBe(12_000);
    expect(dealerStock(l.state, d.id)['toy']!.qty).toBe(6);
    expect(l.state.stock['toy']).toBeUndefined();
    expect(partyBalance(l.state, d.partyId).base).toBe(15_000);
    expect(dealerSummary(l.state, d.id)).toMatchObject({ sales: 38_000, ownProfit: 8_000, profit: 11_000 });
    expect(() => l.postDealerSale({ dealerId: d.id, date: '2026-10-28', lines: [{ itemId: 'toy', qty: 7, price: 5_000 }] })).toThrow(/ما بيكفي/);
    // إلغاء البيعة: الدوا بيرجع والدين بينشال، واللعب بترجع لمخزونه
    l.voidDealerSale(s.id, '2026-10-28');
    expect(partyBalance(l.state, d.partyId).base).toBe(0);
    expect(l.state.stock['med']!.totalQty).toBe(50);
    expect(dealerStock(l.state, d.id)['toy']!.qty).toBe(10);
    expect(dealerCash(l.state, d.id)).toBe(20_000);
    balanced(l);
  });

  it('suggested prices from purchase cost and margin', () => {
    expect(priceFromMargin(10_000, 50)).toBe(15_000);
    expect(priceFromMargin(10_100, 20)).toBe(12_500);
  });
});

describe('pharmacy with dealers demo', () => {
  it('loads and balances', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'صيدلية', activity: 'pharmacydealers', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('pharmacydealers'), defaultTaxes());
    l.loadDemoData();
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(Object.keys(l.state.dealers!).length).toBe(2);
    expect(dealerCash(l.state, 'd-samer')).toBeGreaterThan(0);
  });
});
