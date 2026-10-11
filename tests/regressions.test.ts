import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../src/app/executor';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, partyBalance, trialBalance, type User } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

// اختبارات لأخطاء وُجدت في مراجعة الكود، حتى لا تعود

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'x', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  l.saveItem({ id: 'w', code: 'W', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 300, priceCurrency: 'SYP' });
  l.setRate({ date: '2026-01-01', currency: 'USD', rate: 130, kind: 'market' });
  return l;
}
const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(accountBalance(l.state, '1104').balance).toBe(Object.values(l.state.stock).reduce((s, x) => s + x.value, 0));
};

describe('regressions', () => {
  it('year close includes months locked earlier and never closes twice', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-02-01', lines: [{ description: 'خدمة', qty: 1, price: 1000 }] });
    l.postInvoice({ kind: 'sale', date: '2026-06-01', lines: [{ description: 'خدمة', qty: 1, price: 500 }] });
    l.lockPeriod('2026-03-31');
    l.closeYear('2026-12-31');
    expect(accountBalance(l.state, '4201').balance).toBe(0);
    expect(accountBalance(l.state, '3103').balance).toBe(-1500);
    l.closeYear('2026-12-31'); // مرة ثانية: لا شيء جديد
    expect(accountBalance(l.state, '3103').balance).toBe(-1500);
    balanced(l);
  });

  it('cannot void a purchase whose goods were already sold', () => {
    const l = shop();
    const p = l.postInvoice({ kind: 'purchase', date: '2026-01-02', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 100 }] });
    l.postInvoice({ kind: 'sale', date: '2026-01-03', lines: [{ itemId: 'w', qty: 10, price: 300 }] });
    expect(() => l.voidInvoice(p.id, '2026-01-04')).toThrow(/الكمية المتوفرة/);
    expect(l.state.stock['w']!.totalQty).toBe(0);
  });

  it('purchase return leaves stock at average cost and books the price difference', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: '2026-01-02', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 100 }] });
    l.postInvoice({ kind: 'purchase_return', date: '2026-01-03', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 150 }] });
    expect(l.state.stock['w']!.value).toBe(0);
    expect(accountBalance(l.state, '1104').balance).toBe(0);
    expect(accountBalance(l.state, '5402').balance).toBe(-500);
    balanced(l);
  });

  it('does not silently fix an unbalanced multi-currency entry', () => {
    const l = shop();
    expect(() =>
      l.postEntry({ date: '2026-01-05', memo: 'x', lines: [{ accountId: '1108', debit: 100, currency: 'USD', rate: 130 }, { accountId: '1101', credit: 12999 }] }),
    ).toThrow();
  });

  it('composite items consume ingredient batches and can be returned', () => {
    const l = shop();
    l.saveItem({ id: 'milk', code: 'M', name: 'حليب', kind: 'stock', unit: 'علبة', price: 100, priceCurrency: 'SYP', trackExpiry: true });
    l.saveItem({ id: 'coffee', code: 'C', name: 'قهوة بحليب', kind: 'composite', unit: 'كوب', price: 500, priceCurrency: 'SYP', recipe: [{ itemId: 'milk', qty: 1 }] });
    l.postInvoice({ kind: 'purchase', date: '2026-01-02', partyId: 's', lines: [{ itemId: 'milk', qty: 10, price: 50, expiry: '2026-03-01' }] });
    l.postInvoice({ kind: 'sale', date: '2026-01-03', lines: [{ itemId: 'coffee', qty: 4, price: 500 }] });
    const batches = Object.values(l.state.stock['milk']!.batches!);
    expect(batches.reduce((s, b) => s + b.qty, 0)).toBe(6);
    l.postInvoice({ kind: 'sale_return', date: '2026-01-04', lines: [{ itemId: 'coffee', qty: 1, price: 500 }] });
    expect(l.state.stock['milk']!.totalQty).toBe(7);
    balanced(l);
  });

  it('tailor order cannot change customer or currency after a deposit', () => {
    const l = shop();
    l.saveTailorOrder({ id: 't', partyId: 'c', date: '2026-02-01', status: 'received', currency: 'SYP', garments: [{ description: 'ثوب', qty: 1, price: 100000 }], fabrics: [], measurements: {} });
    l.addTailorDeposit('t', { date: '2026-02-01', amount: 50000 });
    expect(() => l.saveTailorOrder({ ...l.state.tailorOrders['t']!, currency: 'USD' })).toThrow(/عربون/);
    expect(() => l.saveTailorOrder({ ...l.state.tailorOrders['t']!, partyId: 's' })).toThrow(/عربون/);
    expect(partyBalance(l.state, 'c').base).toBe(-50000);
  });

  it('production rejects negative manual inputs', () => {
    const l = shop();
    l.saveItem({ id: 'bread', code: 'B', name: 'خبز', kind: 'stock', unit: 'ربطة', price: 100, priceCurrency: 'SYP' });
    expect(() => l.postProduction({ date: '2026-01-05', inputs: [{ itemId: 'w', qty: -5 }], outputs: [{ itemId: 'bread', qty: 1 }] })).toThrow(/أكبر من صفر/);
  });

  it('executor closes privilege escalation paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-reg-'));
    const { store } = CompanyStore.create(dir, {
      info: { name: 'x', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
      currencies: DEFAULT_CURRENCIES,
      accounts: chartFor('general'),
      owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
    });
    try {
      const acc: User = { id: 'a', username: 'acc', displayName: 'محاسب', role: 'accountant', active: true, extra: ['users.manage'] };
      const keeper: User = { id: 'k', username: 'keeper', displayName: 'أمين', role: 'storekeeper', active: true };
      const cashier: User = { id: 'c', username: 'cash', displayName: 'كاشير', role: 'cashier', active: true };
      for (const u of [acc, keeper, cashier]) execute(store, store.user, 'createUser', [u, 'pass1234']);
      // لا يرفع نفسه إلى مالك عبر saveUser
      expect(() => execute(store, acc, 'saveUser', [{ ...acc, role: 'owner' }])).toThrow(/غير معروفة/);
      expect(store.ledger.state.users['a']!.role).toBe('accountant');
      // أمين المستودع لا يرحّل قيوداً مالية عبر الأرصدة الافتتاحية
      expect(() =>
        execute(store, keeper, 'postOpeningBalances', [{ date: '2026-01-01', accounts: [{ accountId: '1101', credit: 100000 }, { accountId: '5209', debit: 100000 }] }]),
      ).toThrow(/صلاحية/);
      // لا ينتحل اسم مستخدم آخر
      execute(store, store.user, 'saveItem', [{ id: 'i', code: '1', name: 'مادة', kind: 'service', unit: 'قطعة', price: 1000, priceCurrency: 'SYP' }]);
      const inv = execute(store, cashier, 'postInvoice', [{ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i', qty: 1, price: 1000 }], createdBy: store.user.id }]).value as { createdBy: string };
      expect(inv.createdBy).toBe('c');
    } finally {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
