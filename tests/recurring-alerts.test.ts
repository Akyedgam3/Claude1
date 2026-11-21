import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, alertsFor, chartFor, defaultTaxes, healthCheck, recurringStatus, trialBalance } from '../src/core';

const T = '2026-11-21';
function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  return l;
}
const expenseAccount = (l: Ledger) => Object.values(l.state.accounts).find((a) => a.type === 'expense' && !a.isGroup)!.id;
const ok = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(healthCheck(l.state).issues.filter((i) => i.level === 'error')).toEqual([]);
};

describe('recurring expenses (المصاريف الثابتة)', () => {
  it('define, pay once per month, edit keeps the month link, void frees it', () => {
    const l = shop();
    const acc = expenseAccount(l);
    const rent = l.saveRecurring({ name: 'إيجار المحل', amount: 500000, accountId: acc, day: 5 });
    l.saveRecurring({ name: 'كهربا', amount: 30000, accountId: acc, day: 25 });
    let rows = recurringStatus(l.state, '2026-11', T);
    expect(rows.map((r) => [r.def.name, r.status])).toEqual([
      ['إيجار المحل', 'overdue'],
      ['كهربا', 'due-soon'],
    ]);
    const e = l.payRecurring({ id: rent.id, month: '2026-11', date: T });
    expect(accountBalance(l.state, acc).balance).toBe(500000);
    expect(() => l.payRecurring({ id: rent.id, month: '2026-11', date: T })).toThrow(/مدفوع/);
    rows = recurringStatus(l.state, '2026-11', T);
    expect(rows[0]).toMatchObject({ status: 'paid', paidAmount: 500000 });
    // الشهر الجاي لسا مش مدفوع
    expect(recurringStatus(l.state, '2026-12', T)[0]!.status).toBe('upcoming');
    // تعديل السند (مبلغ تاني) بيضل مربوط بالشهر
    const edited = l.editVoucher(e.id, { kind: 'payment', date: T, amount: 450000, accountId: acc, memo: 'إيجار' });
    rows = recurringStatus(l.state, '2026-11', T);
    expect(rows[0]).toMatchObject({ status: 'paid', paidAmount: 450000 });
    // الإلغاء بيرجّعه مش مدفوع
    l.voidEntry(edited.id, T);
    expect(recurringStatus(l.state, '2026-11', T)[0]!.status).toBe('overdue');
    ok(l);
  });

  it('validates and deletes', () => {
    const l = shop();
    const acc = expenseAccount(l);
    expect(() => l.saveRecurring({ name: '', amount: 1, accountId: acc, day: 1 })).toThrow(/اسم/);
    expect(() => l.saveRecurring({ name: 'x', amount: 0, accountId: acc, day: 1 })).toThrow(/مبلغ/);
    expect(() => l.saveRecurring({ name: 'x', amount: 5, accountId: '1101', day: 1 })).toThrow(/مصروف/);
    expect(() => l.saveRecurring({ name: 'x', amount: 5, accountId: acc, day: 31 })).toThrow(/28/);
    const r = l.saveRecurring({ name: 'إنترنت', amount: 5000, accountId: acc, day: 10 });
    expect(() => l.saveRecurring({ name: 'إنترنت', amount: 5000, accountId: acc, day: 10 })).toThrow(/في مصروف/);
    l.deleteRecurring(r.id);
    expect(recurringStatus(l.state, '2026-11', T)).toEqual([]);
    expect(() => l.payRecurring({ id: r.id, month: '2026-11', date: T })).toThrow(/غير موجود/);
  });
});

describe('alerts (التنبيهات)', () => {
  it('collects low/out/negative stock, expiry, late debts, recurring and sales under cost', () => {
    const l = shop();
    l.updateCompany({ allowNegativeStock: true });
    l.saveParty({ id: 's', kind: 'supplier', name: 'المورد' });
    l.saveParty({ id: 'c', kind: 'customer', name: 'أبو خالد', debtDue: '2026-11-15' });
    l.saveItem({ id: 'a', code: 'A', name: 'رز', kind: 'stock', unit: 'كيس', price: 1000, priceCurrency: 'SYP', minStock: 10 });
    l.saveItem({ id: 'b', code: 'B', name: 'سكر', kind: 'stock', unit: 'كيس', price: 1000, priceCurrency: 'SYP', minStock: 5 });
    l.saveItem({ id: 'm', code: 'M', name: 'حليب', kind: 'stock', unit: 'علبة', price: 500, priceCurrency: 'SYP', trackExpiry: true });
    l.postInvoice({ kind: 'purchase', date: '2026-11-01', partyId: 's', lines: [{ itemId: 'a', qty: 12, price: 800 }, { itemId: 'b', qty: 5, price: 900 }, { itemId: 'm', qty: 4, price: 300, expiry: '2026-11-25' }] });
    // رز: باقي 4 (تحت الحد) ومنها بيع تحت الكلفة؛ سكر: خلص؛ وبيع سكر زيادة = سالب
    l.postInvoice({ kind: 'sale', date: T, partyId: 'c', lines: [{ itemId: 'a', qty: 8, price: 700 }, { itemId: 'b', qty: 5, price: 1000 }] });
    l.saveItem({ id: 'z', code: 'Z', name: 'زيت', kind: 'stock', unit: 'علبة', price: 1000, priceCurrency: 'SYP' });
    l.postInvoice({ kind: 'sale', date: T, lines: [{ itemId: 'z', qty: 2, price: 1000 }] });
    l.saveRecurring({ name: 'إيجار', amount: 1000, accountId: expenseAccount(l), day: 1 });
    const ids = alertsFor(l.state, T).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['stock-negative', 'stock-out', 'stock-low', 'expiring', 'debts-late', 'recurring-late', 'under-cost']));
    const all = alertsFor(l.state, T);
    const rank = { bad: 0, warn: 1, info: 2 } as const;
    expect(all.map((a) => rank[a.level])).toEqual([...all.map((a) => rank[a.level])].sort()); // الخطير أول
    expect(all.find((a) => a.id === 'stock-low')!.lines[0]).toContain('رز');
    expect(all.find((a) => a.id === 'under-cost')!.lines[0]).toContain('رز');
    expect(all.find((a) => a.id === 'debts-late')!.lines[0]).toContain('أبو خالد');
  });

  it('a clean shop has no alerts', () => {
    expect(alertsFor(shop().state, T)).toEqual([]);
  });
});
