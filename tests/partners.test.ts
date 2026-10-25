import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, partnerMoves, partnersSummary, permissionFor, trialBalance } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'شركة الأخوة', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.savePartner({ id: 'a', name: 'أبو أحمد' });
  l.savePartner({ id: 'b', name: 'أبو خالد' });
  l.partnerMove({ partnerId: 'a', kind: 'capital_in', amount: 6_000_000, date: '2026-01-01' });
  l.partnerMove({ partnerId: 'b', kind: 'capital_in', amount: 4_000_000, date: '2026-01-01' });
  // ربح 1,000,000 (خدمة بدون كلفة)
  l.postInvoice({ kind: 'sale', date: '2026-02-01', lines: [{ description: 'خدمة', qty: 1, price: 1_000_000 }], paid: 1_000_000 });
  return l;
}

describe('partners and shareholders', () => {
  it('splits capital and profit by the capital each partner put in', () => {
    const l = shop();
    const s = partnersSummary(l.state, { from: '2026-01-01', to: '2026-12-31' });
    expect(s.totalCapital).toBe(10_000_000);
    expect(s.netProfit).toBe(1_000_000);
    const [a, b] = s.rows;
    expect(a).toMatchObject({ capital: 6_000_000, capitalPct: 60, profitPct: 60, profitShare: 600_000 });
    expect(b).toMatchObject({ capital: 4_000_000, capitalPct: 40, profitPct: 40, profitShare: 400_000 });
    expect(accountBalance(l.state, '3101')).toMatchObject({ credit: 10_000_000 }); // رأس المال دائن
    { const tb = trialBalance(l.state); expect(tb.totalDebit).toBe(tb.totalCredit); }
  });

  it('uses an agreed profit percentage and gives the rest to the others by capital', () => {
    const l = shop();
    l.savePartner({ id: 'c', name: 'شريك بالجهد', profitPercent: 20 }); // بدون رأس مال
    const s = partnersSummary(l.state, {});
    const by = Object.fromEntries(s.rows.map((r) => [r.partner.id, r]));
    expect(by['c']!.profitPct).toBe(20);
    expect(by['a']!.profitPct).toBeCloseTo(48);
    expect(by['b']!.profitPct).toBeCloseTo(32);
    expect(() => l.savePartner({ id: 'd', name: 'زيادة', profitPercent: 90 })).toThrow(/100/);
  });

  it('records withdrawals from profit and capital with their dates, and can undo them', () => {
    const l = shop();
    l.partnerMove({ partnerId: 'a', kind: 'profit_out', amount: 200_000, date: '2026-03-05', memo: 'مصروف بيت' });
    l.partnerMove({ partnerId: 'b', kind: 'capital_out', amount: 1_000_000, date: '2026-03-10' });
    l.partnerMove({ partnerId: 'a', kind: 'profit_share', amount: 600_000, date: '2026-12-31' });
    const s = partnersSummary(l.state, { from: '2026-01-01', to: '2026-12-31' });
    const [a, b] = s.rows;
    expect(a).toMatchObject({ withdrawnProfit: 200_000, distributed: 600_000, current: 400_000, due: 466_667 }); // نسبته صارت 66.67٪ بعد ما سحب التاني من رأس ماله
    expect(b!.capital).toBe(3_000_000);
    expect(s.totalCapital).toBe(9_000_000);
    expect(a!.capitalPct).toBeCloseTo(66.67, 1);
    const moves = partnerMoves(l.state, 'a');
    expect(moves.map((m) => [m.date, m.kind, m.amount])).toEqual([
      ['2026-01-01', 'capital_in', 6_000_000],
      ['2026-03-05', 'profit_out', 200_000],
      ['2026-12-31', 'profit_share', 600_000],
    ]);
    expect(moves[1]!.memo).toContain('مصروف بيت');
    l.voidPartnerMove(moves[1]!.entryId, '2026-03-06');
    expect(partnerMoves(l.state, 'a')[1]!.voided).toBe(true);
    expect(partnersSummary(l.state, {}).rows[0]!.withdrawnProfit).toBe(0);
    expect(() => l.voidPartnerMove(moves[1]!.entryId, '2026-03-07')).toThrow(/ملغاة/);
    { const tb = trialBalance(l.state); expect(tb.totalDebit).toBe(tb.totalCredit); }
  });

  it('protects the section with its own permission', () => {
    expect(permissionFor('partnerMove', [])).toBe('partners.manage');
    expect(permissionFor('savePartner', [])).toBe('partners.manage');
  });
});
