import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, healthCheck, trialBalance } from '../src/core';

// زبون عندو ليرات بصندوق الليرة وبدو يصرفهن دولار بصندوق الدولار (من شاشة الصندوق ← «صرف عملة»)
const T = '2026-11-26';
function shop() {
  const l = new Ledger(() => undefined);
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.setRate({ date: T, currency: 'USD', kind: 'market', rate: 130 });
  l.postEntry({ date: T, memo: 'رأس مال', lines: [{ accountId: '1101', debit: 1_000_000 }, { accountId: '3101', credit: 1_000_000 }] }); // 10,000 ل.س
  return l;
}
const bal = (l: Ledger, id: string, cur?: string) => l.state.entries.flatMap((e) => e.lines).filter((x) => x.accountId === id && (!cur || x.currency === cur)).reduce((t, x) => t + x.debit - x.credit, 0);

describe('exchange between boxes (صرف بين الصناديق)', () => {
  it('lira box → dollar box at the day rate, no gain or loss', () => {
    const l = shop();
    l.exchangeBoxes({ date: T, from: '1101', to: '1108', fromCurrency: 'SYP', amount: 650_000, toCurrency: 'USD', toAmount: 5_000 }); // 6,500 ل.س = 50$
    expect(bal(l, '1101')).toBe(350_000);
    expect(bal(l, '1108', 'USD')).toBe(5_000);
    expect(accountBalance(l.state, '4301').balance).toBe(0);
    expect(accountBalance(l.state, '5301').balance).toBe(0);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(healthCheck(l.state).issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('a different rate than the recorded one goes to exchange gain/loss', () => {
    const l = shop();
    // اشترى 50$ بـ 6,600 (أغلى من 130): خسارة 100 ل.س
    l.exchangeBoxes({ date: T, from: '1101', to: '1108', fromCurrency: 'SYP', amount: 660_000, toCurrency: 'USD', toAmount: 5_000 });
    expect(accountBalance(l.state, '5301').balance).toBe(10_000);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('refuses the same currency, wrong box currency, and missing rate', () => {
    const l = shop();
    expect(() => l.exchangeBoxes({ date: T, from: '1101', to: '1108', fromCurrency: 'SYP', amount: 100, toCurrency: 'SYP', toAmount: 100 })).toThrow(/عملتين/);
    expect(() => l.exchangeBoxes({ date: T, from: '1108', to: '1101', fromCurrency: 'SYP', amount: 100, toCurrency: 'USD', toAmount: 1 })).toThrow(/بيقبل/);
    expect(() => l.exchangeBoxes({ date: '2020-01-01', from: '1101', to: '1108', fromCurrency: 'SYP', amount: 100, toCurrency: 'USD', toAmount: 1 })).toThrow(/سعر/);
  });
});
