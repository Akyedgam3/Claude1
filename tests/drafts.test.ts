import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../src/app/executor';
import { DEFAULT_CURRENCIES, chartFor, trialBalance, type User } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

// فواتير المسودة: بتنحفظ بالشركة بدون أي أثر عالمخزون والحسابات، وبالصلاحيات

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-drafts-'));
  const { store } = CompanyStore.create(dir, {
    info: { name: 'x', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
    currencies: DEFAULT_CURRENCIES,
    accounts: chartFor('general'),
    owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
  });
  execute(store, store.user, 'saveItem', [{ id: 'i', code: '1', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'SYP' }]);
  return { store, dir };
}
const draft = (id: string, kind = 'sale') => ({ id, kind, date: '2026-11-19', partyId: null, title: 'زبون نقدي', currency: 'SYP', lines: [{ description: 'مادة', qty: 2, price: 1000 }], subtotal: 2000, discount: 0, taxes: [], total: 2000, data: { lines: [] } });

describe('draft invoices', () => {
  it('saved and numbered, no effect on stock or accounts, deleted when approved', () => {
    const { store, dir } = setup();
    try {
      const entries = store.ledger.state.entries.length;
      const a = execute(store, store.user, 'saveDraft', [draft('d1')]).value as { number: number };
      const b = execute(store, store.user, 'saveDraft', [draft('d2')]).value as { number: number };
      expect([a.number, b.number]).toEqual([1, 2]);
      // تعديل نفس المسودة بيحافظ على رقمها
      const a2 = execute(store, store.user, 'saveDraft', [{ ...draft('d1'), total: 3000 }]).value as { number: number; total: number };
      expect(a2).toMatchObject({ number: 1, total: 3000 });
      expect(store.ledger.state.entries.length).toBe(entries);
      expect(store.ledger.state.stock['i']?.totalQty ?? 0).toBe(0);
      expect(trialBalance(store.ledger.state).totalDebit).toBe(trialBalance(store.ledger.state).totalCredit);
      execute(store, store.user, 'deleteDraft', ['d1', 'sale']);
      expect(Object.keys(store.ledger.state.drafts ?? {})).toEqual(['d2']);
      expect(() => execute(store, store.user, 'deleteDraft', ['d2', 'purchase'])).toThrow(/غير مطابق/);
    } finally {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('permissions follow the invoice kind (a cashier cannot touch purchase drafts)', () => {
    const { store, dir } = setup();
    try {
      const cashier: User = { id: 'c', username: 'cash', displayName: 'كاشير', role: 'cashier', active: true };
      execute(store, store.user, 'createUser', [cashier, 'pass1234']);
      execute(store, cashier, 'saveDraft', [draft('s1')]);
      expect(() => execute(store, cashier, 'saveDraft', [draft('p1', 'purchase')])).toThrow(/صلاحية/);
      execute(store, store.user, 'saveDraft', [draft('p2', 'purchase')]);
      // بعت النوع غلط ليلتف عالصلاحية: المنفّذ بيشوف النوع المحفوظ
      expect(() => execute(store, cashier, 'deleteDraft', ['p2', 'sale'])).toThrow(/صلاحية/);
      expect(() => execute(store, cashier, 'saveDraft', [{ ...draft('p2'), kind: 'sale' }])).toThrow(/صلاحية|نوع/);
    } finally {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('data health check', () => {
  it('a sound company passes; a broken inventory value is reported', async () => {
    const { healthCheck, Ledger, chartFor: chart, defaultTaxes } = await import('../src/core');
    const l = new Ledger(() => {});
    l.createCompany({ name: 'x', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chart('general'), defaultTaxes());
    l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'USD' });
    l.postInvoice({ kind: 'purchase', date: '2026-11-01', lines: [{ itemId: 'a', qty: 5, price: 600 }] });
    expect(healthCheck(l.state).ok).toBe(true);
    l.state.stock['a']!.value += 100; // خراب مقصود
    const r = healthCheck(l.state);
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.text).toContain('حساب المخزون');
  });
});
