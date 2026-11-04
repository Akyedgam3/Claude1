import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, incomeStatement, partyBalance, woodLotSummary } from '../src/core';

const P = (n: number) => Math.round(n * 100);
function mill() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'معمل حطب', activity: 'woodmill', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('woodmill'), defaultTaxes());
  l.saveParty({ id: 'sup', kind: 'supplier', name: 'أبو علي — حطب' });
  l.saveParty({ id: 'cus', kind: 'customer', name: 'مدفأة الحارة' });
  return l;
}

describe('wood mill: lots by value', () => {
  it('a lot bought by value, expenses, sales by ton/sack/piece and its profit', () => {
    const l = mill();
    // حمولة بـ 60,000 (6 مليون قديم)، دفع 20,000 والباقي دين للمورد
    const lot = l.buyWoodLot({ date: '2026-11-01', title: 'سنديان', cost: P(60000), supplierId: 'sup', paid: P(20000) });
    expect(-partyBalance(l.state, 'sup').base).toBe(P(40000));
    expect(accountBalance(l.state, '1104').balance).toBe(P(60000));
    l.addWoodExpense({ date: '2026-11-02', kind: 'أجور عمال', amount: P(5000), lotId: lot.id });
    l.addWoodExpense({ date: '2026-11-02', kind: 'مازوت ومحروقات', amount: P(2000), lotId: lot.id });
    l.addWoodExpense({ date: '2026-11-03', kind: 'صيانة', amount: P(1500) }); // مصروف عام
    l.sellWood(lot.id, { date: '2026-11-04', partyId: 'cus', lines: [{ unit: 'طن', qty: 2, price: P(25000) }, { unit: 'شوال', qty: 10, price: P(800) }], paid: P(30000) });
    l.sellWood(lot.id, { date: '2026-11-05', lines: [{ unit: 'قطعة', qty: 50, price: P(100) }] });
    const s = woodLotSummary(l.state, l.state.woodLots![lot.id]!);
    expect(s.sales).toBe(P(50000 + 8000 + 5000));
    expect(s.expenses).toBe(P(7000));
    expect(s.profit).toBe(P(63000 - 60000 - 7000));
    expect(s.byUnit).toEqual({ طن: 2, شوال: 10, قطعة: 50 });
    expect(partyBalance(l.state, 'cus').base).toBe(P(58000 - 30000));
    // قبل ما تخلص: قيمتها لسا بالمخزون. لما تخلص: بتنتقل لتكلفة المبيعات
    l.closeWoodLot(lot.id, '2026-11-06');
    expect(accountBalance(l.state, '1104').balance).toBe(0);
    const is = incomeStatement(l.state, { from: '2026-11-01', to: '2026-11-30' });
    expect(is.netProfit).toBe(P(63000 - 60000 - 7000 - 1500));
    l.reopenWoodLot(lot.id, '2026-11-07');
    expect(l.state.woodLots![lot.id]!.status).toBe('open');
    expect(accountBalance(l.state, '1104').balance).toBe(P(60000));
  });

  it('a lot entered by mistake can be cancelled while nothing was sold from it', () => {
    const l = mill();
    const lot = l.buyWoodLot({ date: '2026-11-01', title: 'زيتون', cost: P(10000) });
    l.addWoodExpense({ date: '2026-11-01', kind: 'نقل وتحميل', amount: P(500), lotId: lot.id });
    l.cancelWoodLot(lot.id, '2026-11-02');
    expect(l.state.woodLots![lot.id]!.status).toBe('cancelled');
    expect(accountBalance(l.state, '1104').balance).toBe(0);
    const lot2 = l.buyWoodLot({ date: '2026-11-01', title: 'حمضيات', cost: P(10000) });
    l.sellWood(lot2.id, { date: '2026-11-02', lines: [{ unit: 'شوال', qty: 1, price: P(900) }] });
    expect(() => l.cancelWoodLot(lot2.id, '2026-11-03')).toThrow();
  });

  it('demo data loads', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'معمل', activity: 'woodmill', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('woodmill'), defaultTaxes());
    l.loadDemoData();
    expect(Object.keys(l.state.woodLots ?? {}).length).toBeGreaterThan(1);
  });
});
