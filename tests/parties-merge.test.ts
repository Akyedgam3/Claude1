import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, partyBalance, trialBalance } from '../src/core';

describe('merge duplicate parties', () => {
  it('moves the balance to the other party and archives the duplicate', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'م', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
    l.saveParty({ id: 'a', kind: 'supplier', name: 'أبو عمران' });
    l.saveParty({ id: 'b', kind: 'supplier', name: 'أبو عمران' });
    // دين قديم علينا لـ a، وفاتورة شراء ودفعة على b
    l.postInvoice({ kind: 'purchase', date: '2026-11-01', partyId: 'a', lines: [{ itemId: null, description: 'قديم', qty: 1, price: 123700 }], paid: 0 });
    l.postInvoice({ kind: 'purchase', date: '2026-11-02', partyId: 'b', lines: [{ itemId: null, description: 'جديد', qty: 1, price: 22600 }], paid: 0 });
    l.postVoucher({ kind: 'payment', date: '2026-11-02', amount: 26300, partyId: 'b', memo: 'دفعة' });
    expect(partyBalance(l.state, 'b').base).toBe(3700);
    l.mergeParty('b', 'a', '2026-11-02');
    expect(partyBalance(l.state, 'b').base).toBe(0);
    expect(partyBalance(l.state, 'a').base).toBe(-120000);
    expect(l.state.parties['b']!.archived).toBe(true);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(() => l.mergeParty('a', 'a', '2026-11-02')).toThrow();
  });
});
