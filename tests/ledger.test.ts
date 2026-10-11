import { describe, expect, it } from 'vitest';
import { accountBalance, accountStatement, balancesByCurrency, computeTaxes, incomeStatement, trialBalance } from '../src/core';
import { newLedger } from './helpers';

describe('ledger', () => {
  it('posts a balanced entry and updates balances', () => {
    const { ledger } = newLedger();
    ledger.postEntry({
      date: '2026-01-05',
      memo: 'رأس المال',
      lines: [
        { accountId: '1101', debit: 1_000_000_00 },
        { accountId: '3101', credit: 1_000_000_00 },
      ],
    });
    expect(accountBalance(ledger.state, '1101').balance).toBe(1_000_000_00);
    expect(accountBalance(ledger.state, '1').balance).toBe(1_000_000_00); // الحساب الأب يجمع أبناءه
    const tb = trialBalance(ledger.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('rejects unbalanced entries, group accounts and one-sided lines', () => {
    const { ledger, events } = newLedger();
    const count = events.length;
    expect(() =>
      ledger.postEntry({ date: '2026-01-05', memo: '', lines: [{ accountId: '1101', debit: 100 }, { accountId: '3101', credit: 90 }] }),
    ).toThrow(/غير متوازن/);
    expect(() =>
      ledger.postEntry({ date: '2026-01-05', memo: '', lines: [{ accountId: '11', debit: 100 }, { accountId: '3101', credit: 100 }] }),
    ).toThrow(/تجميعي/);
    expect(() =>
      ledger.postEntry({ date: '2026-01-05', memo: '', lines: [{ accountId: '1101', debit: 100, credit: 100 }, { accountId: '3101', credit: 0 }] }),
    ).toThrow();
    expect(events.length).toBe(count); // لم يُحفظ شيء
    expect(ledger.state.entries).toHaveLength(0);
  });

  it('handles USD lines using the stored exchange rate', () => {
    const { ledger } = newLedger();
    ledger.setRate({ date: '2026-01-01', currency: 'USD', kind: 'market', rate: 110 });
    ledger.setRate({ date: '2026-02-01', currency: 'USD', kind: 'market', rate: 120 });
    const entry = ledger.postEntry({
      date: '2026-01-15',
      memo: 'إيداع دولار',
      lines: [
        { accountId: '1101', debit: 500_00, currency: 'USD' },
        { accountId: '3101', credit: 55_000_00 },
      ],
    });
    expect(entry.lines[0]!.rate).toBe(110);
    expect(entry.lines[0]!.baseDebit).toBe(55_000_00);
    expect(balancesByCurrency(ledger.state, '1101')).toEqual({ USD: 500_00 });
    expect(() =>
      ledger.postEntry({ date: '2025-12-01', memo: '', lines: [{ accountId: '1101', debit: 1, currency: 'USD' }, { accountId: '3101', credit: 1 }] }),
    ).toThrow(/سعر صرف/);
  });

  it('absorbs small rounding differences in multi-currency entries', () => {
    const { ledger } = newLedger();
    const entry = ledger.postEntry({
      date: '2026-01-15',
      memo: '',
      lines: [
        { accountId: '1101', debit: 1, currency: 'USD', rate: 0.5 },
        { accountId: '1102', debit: 1, currency: 'USD', rate: 0.5 },
        { accountId: '3101', credit: 2, currency: 'USD', rate: 0.5 },
      ],
    });
    const d = entry.lines.reduce((s, l) => s + l.baseDebit, 0);
    const c = entry.lines.reduce((s, l) => s + l.baseCredit, 0);
    expect(d).toBe(c);
  });

  it('voids entries with a reversing entry instead of deleting', () => {
    const { ledger } = newLedger();
    const e = ledger.postEntry({ date: '2026-01-05', memo: 'بيع', lines: [{ accountId: '1101', debit: 500 }, { accountId: '4101', credit: 500 }] });
    ledger.voidEntry(e.id, '2026-01-06');
    expect(ledger.state.entries).toHaveLength(2);
    expect(accountBalance(ledger.state, '1101').balance).toBe(0);
    expect(() => ledger.voidEntry(e.id, '2026-01-07')).toThrow(/ملغى/);
  });

  it('produces an account statement with opening and running balance', () => {
    const { ledger } = newLedger();
    const post = (date: string, amount: number) =>
      ledger.postEntry({ date, memo: '', lines: [{ accountId: '1103', debit: amount }, { accountId: '4101', credit: amount }] });
    post('2026-01-01', 100);
    post('2026-02-01', 200);
    post('2026-03-01', 300);
    const st = accountStatement(ledger.state, '1103', { from: '2026-02-01', to: '2026-02-28' });
    expect(st.opening).toBe(100);
    expect(st.rows.map((r) => r.running)).toEqual([300]);
    expect(st.closing).toBe(300);
  });

  it('computes income statement', () => {
    const { ledger } = newLedger();
    ledger.postEntry({ date: '2026-01-05', memo: '', lines: [{ accountId: '1101', debit: 1000 }, { accountId: '4101', credit: 1000 }] });
    ledger.postEntry({ date: '2026-01-06', memo: '', lines: [{ accountId: '5204', debit: 300 }, { accountId: '1101', credit: 300 }] });
    expect(incomeStatement(ledger.state)).toEqual({ revenue: 1000, expenses: 300, netProfit: 700 });
  });

  it('validates account tree changes', () => {
    const { ledger } = newLedger();
    expect(() => ledger.saveAccount({ id: '9', name: 'x', type: 'asset', parentId: '1101', isGroup: false, currency: null })).toThrow(/تجميعي/);
    expect(() => ledger.saveAccount({ id: '1107', name: 'x', type: 'expense', parentId: '11', isGroup: false, currency: null })).toThrow(/نوع/);
    ledger.saveAccount({ id: '1107', name: 'صندوق الدولار', type: 'asset', parentId: '11', isGroup: false, currency: 'USD' });
    expect(() =>
      ledger.postEntry({ date: '2026-01-05', memo: '', lines: [{ accountId: '1107', debit: 100 }, { accountId: '3101', credit: 100 }] }),
    ).toThrow(/يقبل عملة USD/);
  });
});

describe('taxes', () => {
  const tax = { id: 't', name: 'ضريبة', percent: 5, accountId: '2103', active: true };
  it('adds tax on top of net amount', () => {
    expect(computeTaxes(10000, [tax])).toMatchObject({ net: 10000, total: 10500 });
  });
  it('extracts tax from an inclusive price exactly', () => {
    const r = computeTaxes(10499, [tax, { ...tax, id: 'u', percent: 2 }], true);
    expect(r.total).toBe(10499);
  });
  it('ignores inactive taxes', () => {
    expect(computeTaxes(10000, [{ ...tax, active: false }]).total).toBe(10000);
  });
});
