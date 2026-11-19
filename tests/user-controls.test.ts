import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../src/app/executor';
import { DEFAULT_CURRENCIES, can, chartFor, type User } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

// تحكم دقيق بالمستخدمين: البيع بالدين، الأقسام المخفية، الصلاحيات الافتراضية للأدوار

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-uc-'));
  const { store } = CompanyStore.create(dir, {
    info: { name: 'x', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
    currencies: DEFAULT_CURRENCIES,
    accounts: chartFor('general'),
    owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
  });
  execute(store, store.user, 'saveItem', [{ id: 'i', code: '1', name: 'مادة', kind: 'service', unit: 'قطعة', price: 1000, priceCurrency: 'SYP' }]);
  execute(store, store.user, 'saveParty', [{ id: 'p', kind: 'customer', name: 'زبون' }]);
  return { store, dir };
}

describe('user controls', () => {
  it('existing roles keep the new permissions by default', () => {
    const cashier: User = { id: 'c', username: 'c', displayName: 'c', role: 'cashier', active: true };
    expect(can(cashier, 'sales.credit')).toBe(true);
    expect(can(cashier, 'price.edit')).toBe(true);
    expect(can(cashier, 'invoices.all')).toBe(true);
    expect(can(cashier, 'costs.view')).toBe(false);
    expect(can({ ...cashier, denied: ['sales.credit'] }, 'sales.credit')).toBe(false);
  });

  it('a user without sales.credit can only post fully paid sales (everywhere, incl. edits)', () => {
    const { store, dir } = setup();
    try {
      const cashier: User = { id: 'c', username: 'cash', displayName: 'كاشير', role: 'cashier', active: true, denied: ['sales.credit'], extra: ['sales.void'] };
      execute(store, store.user, 'createUser', [cashier, 'pass1234']);
      const line = { itemId: 'i', qty: 1, price: 1000 };
      expect(() => execute(store, cashier, 'postInvoice', [{ kind: 'sale', date: '2026-01-02', partyId: 'p', paid: 0, lines: [line] }])).toThrow(/البيع بالدين/);
      expect(() => execute(store, cashier, 'postInvoice', [{ kind: 'sale', date: '2026-01-02', partyId: 'p', paid: 400, lines: [line] }])).toThrow(/البيع بالدين/);
      const ok = execute(store, cashier, 'postInvoice', [{ kind: 'sale', date: '2026-01-02', partyId: 'p', paid: 1000, lines: [line] }]).value as { id: string };
      expect(store.ledger.state.invoices).toHaveLength(1);
      // التعديل لدين ممنوع، والفاتورة الأصلية بتضل متل ما هي
      expect(() => execute(store, cashier, 'replaceInvoice', [ok.id, { kind: 'sale', date: '2026-01-02', partyId: 'p', paid: 0, lines: [line] }])).toThrow(/البيع بالدين/);
      expect(store.ledger.state.invoices.filter((i) => !i.voidEntryId)).toHaveLength(1);
      // المالك بيبيع بالدين عادي، والفحص ما بيضل عالقاً بعد عملية الكاشير
      execute(store, store.user, 'postInvoice', [{ kind: 'sale', date: '2026-01-03', partyId: 'p', paid: 0, lines: [line] }]);
      expect(store.ledger.invoiceCheck).toBeUndefined();
    } finally {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hidden screens are saved and validated', () => {
    const { store, dir } = setup();
    try {
      const u: User = { id: 'u', username: 'u1', displayName: 'موظف', role: 'cashier', active: true, hiddenScreens: ['invoices', 'debts'] };
      execute(store, store.user, 'createUser', [u, 'pass1234']);
      expect(store.ledger.state.users['u']!.hiddenScreens).toEqual(['invoices', 'debts']);
      expect(() => execute(store, store.user, 'updateUser', [{ ...u, hiddenScreens: 'invoices' as unknown as string[] }])).toThrow(/الأقسام المخفية/);
    } finally {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fine-grained visibility (1.2.90)', () => {
  it('existing users keep what they saw: costs implied profits, purchases implied viewing purchase invoices', () => {
    const acc: User = { id: 'a', username: 'a', displayName: 'a', role: 'accountant', active: true };
    expect(can(acc, 'profits.view')).toBe(true);
    expect(can(acc, 'purchases.view')).toBe(true);
    const custom: User = { id: 'b', username: 'b', displayName: 'b', role: 'cashier', active: true, extra: ['costs.view'] };
    expect(can(custom, 'profits.view')).toBe(true);
    const keeper: User = { id: 'k', username: 'k', displayName: 'k', role: 'storekeeper', active: true };
    expect(can(keeper, 'purchases.view')).toBe(true);
    expect(can(keeper, 'stock.qty')).toBe(true);
  });
  it('the owner can switch each one off separately', () => {
    const u: User = { id: 'a', username: 'a', displayName: 'a', role: 'accountant', active: true, denied: ['profits.view'] };
    expect(can(u, 'costs.view')).toBe(true);
    expect(can(u, 'profits.view')).toBe(false);
    const c: User = { id: 'c', username: 'c', displayName: 'c', role: 'cashier', active: true, denied: ['stock.qty', 'balances.view'] };
    expect(can(c, 'stock.qty')).toBe(false);
    expect(can(c, 'balances.view')).toBe(false);
    expect(can(c, 'purchases.view')).toBe(false);
    expect(can(c, 'costs.view')).toBe(false);
  });
});
