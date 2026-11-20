import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../src/app/executor';
import { COST_LIST, DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, partyPriceList, priceListName, priceListPrice, priceListRule, type User } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

// قوائم الأسعار: سعر الكلفة، قوائم باسم المحل (سعر الشراء × نسبة)، قائمة الزبون

const D = '2026-11-20';
function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1500, wholesalePrice: 1300, priceCurrency: 'USD' });
  l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 1000 }] });
  return l;
}

describe('price lists', () => {
  it('cost list = last purchase price; custom list = basis × percent', () => {
    const l = shop();
    expect(priceListPrice(l.state, l.state.items['a']!, COST_LIST)).toEqual({ price: 1000, currency: 'USD' });
    const half = l.savePriceList({ name: 'نص جملة', basis: 'cost', percent: 15 });
    expect(priceListPrice(l.state, l.state.items['a']!, half.id)).toEqual({ price: 1150, currency: 'USD' });
    const w = l.savePriceList({ name: 'جملة ناقص 5', basis: 'wholesale', percent: -5 });
    expect(priceListPrice(l.state, l.state.items['a']!, w.id)).toEqual({ price: 1235, currency: 'USD' });
    expect(priceListRule(half)).toBe('سعر الشراء + 15%');
    expect(priceListName(l.state.info, half.id)).toBe('نص جملة');
    // الأسعار بتمشي مع آخر شراء
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 1, price: 1200 }] });
    expect(priceListPrice(l.state, l.state.items['a']!, half.id)!.price).toBe(1380);
  });

  it('a party can have a list; deleted lists fall back to the tier', () => {
    const l = shop();
    const half = l.savePriceList({ name: 'نص جملة', basis: 'cost', percent: 15 });
    l.saveParty({ id: 'c', kind: 'customer', name: 'زبون', priceTier: 'wholesale', priceList: half.id });
    expect(partyPriceList(l.state.parties['c'])).toBe(half.id);
    l.saveParty({ id: 'c2', kind: 'customer', name: 'زبون2', priceList: 'cost' });
    expect(partyPriceList(l.state.parties['c2'])).toBe('cost');
    expect(() => l.saveParty({ id: 'c3', kind: 'customer', name: 'زبون3', priceList: 'pl-nothing' })).toThrow(/قائمة الأسعار/);
    l.deletePriceList(half.id);
    expect(priceListPrice(l.state, l.state.items['a']!, half.id)!.price).toBe(1150); // القائمة المحذوفة لسا معروفة للفواتير القديمة
    expect(l.state.info!.priceLists![0]!.archived).toBe(true);
    // اسم جديد بنفس اسم المحذوفة مسموح
    l.savePriceList({ name: 'نص جملة', basis: 'cost', percent: 10 });
  });

  it('validates names, bases and percents', () => {
    const l = shop();
    l.savePriceList({ name: 'نص جملة', basis: 'cost', percent: 15 });
    expect(() => l.savePriceList({ name: ' نص جملة ', basis: 'cost', percent: 20 })).toThrow(/اسمها/);
    expect(() => l.savePriceList({ name: '', basis: 'cost', percent: 20 })).toThrow(/اسم/);
    expect(() => l.savePriceList({ name: 'x', basis: 'nope' as 'cost', percent: 20 })).toThrow(/أساس/);
    expect(() => l.savePriceList({ name: 'x', basis: 'cost', percent: -100 })).toThrow(/نسبة/);
    // تعديل بنفس الاسم مسموح
    const id = l.state.info!.priceLists![0]!.id;
    l.savePriceList({ id, name: 'نص جملة', basis: 'cost', percent: 12 });
    expect(l.state.info!.priceLists).toHaveLength(1);
    expect(l.state.info!.priceLists![0]!.percent).toBe(12);
  });

  it('permissions: a cashier can add a list from the invoice but not change or delete existing ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-pl-'));
    try {
      const { store } = CompanyStore.create(dir, {
        info: { name: 'x', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
        currencies: DEFAULT_CURRENCIES,
        accounts: chartFor('general'),
        owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
      });
      const cashier: User = { id: 'c', username: 'cashier1', displayName: 'c', role: 'cashier', active: true };
      execute(store, store.user, 'createUser', [cashier, 'pass1234']);
      const made = execute(store, cashier, 'savePriceList', [{ name: 'نص جملة', basis: 'retail', percent: -10 }]) as { value?: { id: string } } & { id?: string };
      const id = (made.value ?? made).id!;
      expect(() => execute(store, cashier, 'savePriceList', [{ id, name: 'نص جملة', basis: 'retail', percent: -50 }])).toThrow();
      expect(() => execute(store, cashier, 'deletePriceList', [id])).toThrow();
      execute(store, store.user, 'savePriceList', [{ id, name: 'نص جملة', basis: 'retail', percent: -12 }]);
      expect(store.ledger.state.info!.priceLists![0]!.percent).toBe(-12);
      // الحالة بتنقرا من جديد من الأحداث
      store.close?.();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
