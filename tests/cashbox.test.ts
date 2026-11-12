import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, cashBoxes, cashMovement, chartFor, defaultTaxes } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.setRate({ date: '2026-01-01', currency: 'USD', kind: 'market', rate: 120 });
  return l;
}

describe('cash boxes', () => {
  it('counts user-added currency boxes, not customers or stock', () => {
    const l = shop();
    l.saveCurrency({ code: 'EUR', nameAr: 'يورو', symbol: '€', decimals: 2 });
    const ids = cashBoxes(l.state).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['1101', '1102', '1108']));
    expect(ids.some((id) => l.state.accounts[id]!.currency === 'EUR')).toBe(true);
    expect(ids).not.toContain('1103');
    expect(ids).not.toContain('1104');
    expect(cashMovement(l.state, {}).length).toBe(ids.length);
  });

  it('zeroes a dollar box into another box in dollars, or as an owner draw (not an expense)', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-01-05', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 5000 }], paid: 5000, cashAccountId: '1108' });
    l.saveAccount({ id: '1110', name: 'خزنة الدولار', type: 'asset', parentId: '11', isGroup: false, currency: 'USD' });
    l.transferBox({ date: '2026-01-06', from: '1108', to: '1110', amount: 3000 });
    l.drawFromBox({ date: '2026-01-06', from: '1108', amount: 2000 });
    const usd = (id: string) => l.state.entries.flatMap((e) => e.lines).filter((x) => x.accountId === id).reduce((t, x) => t + x.debit - x.credit, 0);
    expect(usd('1108')).toBe(0);
    expect(usd('1110')).toBe(3000);
    expect(usd('3102')).toBe(2000);
    expect(() => l.transferBox({ date: '2026-01-06', from: '1108', to: '1101', amount: 1, currency: 'SYP' })).toThrow(/بيقبل/);
  });

  it('zeroing a negative box: the owner puts the difference in, back to zero', () => {
    const l = shop();
    l.drawFromBox({ date: '2026-01-06', from: '1101', amount: 70000 });
    const bal = () => l.state.entries.flatMap((e) => e.lines).filter((x) => x.accountId === '1101').reduce((t, x) => t + x.debit - x.credit, 0);
    expect(bal()).toBe(-70000);
    l.fillBox({ date: '2026-01-07', to: '1101', amount: 70000 });
    expect(bal()).toBe(0);
    expect(() => l.fillBox({ date: '2026-01-07', to: '1101', amount: 0 })).toThrow();
  });
});
