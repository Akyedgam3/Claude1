import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, partyBalance, partyDebts, trialBalance } from '../src/core';

// زبون عليه 35$ ودفع 30$ بالليرة (شركة عملتها الأساسية دولار): الليرات بتفوت صندوق الليرة والدين بالدولار بينقص 30
const D = '2026-11-27';
function shop() {
  const l = new Ledger(() => undefined);
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.setRate({ date: D, currency: 'SYP', kind: 'market', rate: 1 / 120 }); // 1 ل.س جديدة = 1/120 $
  l.saveParty({ id: 'c', kind: 'customer', name: 'علي ابو سلوم' });
  l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 3500, priceCurrency: 'USD' });
  l.adjustStock({ kind: 'opening', date: D, lines: [{ itemId: 'a', qty: 5, unitCost: 1000 }] });
  l.postInvoice({ kind: 'sale', date: D, partyId: 'c', paid: 0, lines: [{ itemId: 'a', qty: 1, price: 3500 }] });
  return l;
}
const ok = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
};
describe('paying a dollar debt in lira', () => {
  it('lira go to the lira box, the dollar debt drops by 30$', () => {
    const l = shop();
    // 30$ × 120 = 3,600 ل.س (بخانتين = 360000)
    l.settleDebt({ direction: 'in', partyId: 'c', date: D, currency: 'USD', amount: 3000, payCurrency: 'SYP', payAmount: 360000, cashAccountId: '1101' });
    expect(partyBalance(l.state, 'c').byCurrency['USD']).toBe(500);
    expect(partyBalance(l.state, 'c').byCurrency['SYP'] ?? 0).toBe(0);
    expect(partyDebts(l.state, 'c')[0]!.open.reduce((t, m) => t + m.remaining, 0)).toBe(500);
    const box = l.state.entries.flatMap((e) => e.lines).filter((x) => x.accountId === '1101' && x.currency === 'SYP').reduce((t, x) => t + x.debit - x.credit, 0);
    expect(box).toBe(360000);
    expect(accountBalance(l.state, '4301').balance).toBe(0);
    ok(l);
  });
  it('a different rate goes to exchange gain/loss, and it can be cancelled', () => {
    const l = shop();
    // قبض 3,000 ل.س بس (سعر 100) عن 30$: خسارة صرف 5$
    const e = l.settleDebt({ direction: 'in', partyId: 'c', date: D, currency: 'USD', amount: 3000, payCurrency: 'SYP', payAmount: 300000, cashAccountId: '1101' });
    expect(accountBalance(l.state, '5301').balance).toBe(500);
    ok(l);
    l.voidEntry(e.id, D);
    expect(partyBalance(l.state, 'c').byCurrency['USD']).toBe(3500);
    ok(l);
  });
});
