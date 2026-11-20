import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, SYSTEM_ACCOUNTS, accountBalance, chartFor, defaultTaxes, partyBalance, trialBalance } from '../src/core';

// التعديل بكل الأقسام: سند، دين، قيد يدوي، عملية مخزون — بيلغي القديم بتاريخه وبيسجّل الجديد، وما بيخرب شي إذا فشل

const D = '2026-11-10';
function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 'd', kind: 'customer', name: 'زبون تاني' });
  l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'USD' });
  return l;
}
const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(accountBalance(l.state, SYSTEM_ACCOUNTS.inventory).balance).toBe(Object.values(l.state.stock).reduce((s, x) => s + x.value, 0));
};

describe('edit everything', () => {
  it('voucher: amount and person change, the number stays', () => {
    const l = shop();
    const v = l.postVoucher({ kind: 'receipt', date: D, amount: 500, partyId: 'c', memo: 'دفعة' });
    const e = l.editVoucher(v.id, { kind: 'receipt', date: D, amount: 700, partyId: 'd', memo: 'دفعة مصحّحة' });
    expect(partyBalance(l.state, 'c').base).toBe(0);
    expect(partyBalance(l.state, 'd').base).toBe(-700);
    expect(e.memo).toMatch(/سند قبض رقم 1:/);
    expect(() => l.editVoucher(v.id, { kind: 'receipt', date: D, amount: 1, partyId: 'c', memo: 'x' })).toThrow(/ملغاة/);
    balanced(l);
  });

  it('a failed edit changes nothing', () => {
    const l = shop();
    const v = l.postVoucher({ kind: 'receipt', date: D, amount: 500, partyId: 'c', memo: 'دفعة' });
    const n = l.state.entries.length;
    expect(() => l.editVoucher(v.id, { kind: 'receipt', date: D, amount: 0, partyId: 'c', memo: 'x' })).toThrow();
    expect(l.state.entries.length).toBe(n);
    expect(l.state.voided[v.id]).toBeUndefined();
  });

  it('debt and manual entry', () => {
    const l = shop();
    const debt = l.postDebt({ direction: 'owed', partyId: 'c', date: D, amount: 300, reason: 'old' });
    l.editDebt(debt.id, { direction: 'owed', partyId: 'c', date: D, amount: 450, reason: 'old' });
    expect(partyBalance(l.state, 'c').base).toBe(450);
    const m = l.postEntry({ date: D, memo: 'قيد', lines: [{ accountId: '5209', debit: 100 }, { accountId: '1101', credit: 100 }], source: { type: 'manual', id: 'm1' } });
    l.editEntry(m.id, { date: D, memo: 'قيد مصحّح', lines: [{ accountId: '5209', debit: 120 }, { accountId: '1101', credit: 120 }] });
    expect(accountBalance(l.state, '5209').balance).toBe(120);
    balanced(l);
  });

  it('stock adjustment: opening quantity and cost corrected', () => {
    const l = shop();
    const a = l.adjustStock({ kind: 'opening', date: D, lines: [{ itemId: 'a', qty: 10, unitCost: 600 }] });
    l.editAdjustment(a.id, { kind: 'opening', date: D, lines: [{ itemId: 'a', qty: 12, unitCost: 500 }] });
    expect(l.state.stock['a']).toMatchObject({ totalQty: 12, value: 6000 });
    balanced(l);
  });
});
