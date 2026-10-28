import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_LIST,
  DEFAULT_CURRENCIES,
  Ledger,
  accountBalance,
  balanceSheet,
  can,
  cashMovement,
  chartFor,
  defaultTaxes,
  incomeStatement,
  partyBalance,
  permissionFor,
  receivablesAging,
  salesByItem,
  trialBalance,
  type Item,
  type User,
} from '../src/core';

const owner: User = { id: 'u1', username: 'admin', displayName: 'المالك', role: 'owner', active: true };

function company(activity: Parameters<typeof chartFor>[0] = 'general') {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'شركة', activity, baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor(activity), defaultTaxes(), undefined, owner);
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  return l;
}

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1',
  code: '1',
  name: 'مادة',
  kind: 'stock',
  unit: 'قطعة',
  price: 1000,
  priceCurrency: 'SYP',
  ...over,
});

const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  // قيمة حساب المخزون = مجموع قيم المواد
  const stockValue = Object.values(l.state.stock).reduce((s, x) => s + x.value, 0);
  expect(accountBalance(l.state, '1104').balance).toBe(stockValue);
};

describe('currencies', () => {
  it('lets the user add currencies with their own rate and cash box', () => {
    expect(DEFAULT_CURRENCIES.map((c) => c.code)).toEqual(['SYP', 'USD']);
    const l = company();
    expect(() => l.saveCurrency({ code: 'T', nameAr: 'تركي', symbol: '₺', decimals: 2 })).toThrow(/رمز العملة/);
    expect(() => l.saveCurrency({ code: 'TRY', nameAr: ' ', symbol: '₺', decimals: 2 })).toThrow(/اسم العملة/);
    expect(() => l.saveCurrency({ code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺', decimals: 7 })).toThrow(/المنازل/);
    l.saveCurrency({ code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺', decimals: 2 });
    const box = Object.values(l.state.accounts).find((a) => a.currency === 'TRY')!;
    expect(box).toMatchObject({ name: 'صندوق ليرة تركية', parentId: '11', isGroup: false });
    // التعديل ما بيعمل صندوق تاني، والمنازل العشرية ما بتتغير
    l.saveCurrency({ code: 'TRY', nameAr: 'ليرة تركية', symbol: 'TL', decimals: 2 });
    expect(Object.values(l.state.accounts).filter((a) => a.currency === 'TRY')).toHaveLength(1);
    expect(l.state.currencies['TRY']!.symbol).toBe('TL');
    expect(() => l.saveCurrency({ code: 'TRY', nameAr: 'ليرة تركية', symbol: 'TL', decimals: 0 })).toThrow(/المنازل/);
    expect(() => l.saveCurrency({ code: 'SYP', nameAr: 'ليرة', symbol: 'ل.س', decimals: 2, hidden: true })).toThrow(/الأساسية/);

    // البيع بالتركي: السعر بعملة الشركة، والقبض بصندوق التركي
    l.setRate({ date: '2026-01-01', currency: 'TRY', kind: 'market', rate: 3.5 });
    l.postVoucher({ kind: 'receipt', date: '2026-01-02', amount: 100_00, currency: 'TRY', accountId: '3101', memo: 'رأس مال' });
    expect(accountBalance(l.state, box.id).balance).toBe(350_00);
    expect(() =>
      new Ledger(() => {}).createCompany({ name: 'x', baseCurrency: 'EUR', fiscalYearStart: '01-01' }, [{ code: 'EUR', nameAr: '', symbol: '', decimals: 2 }]),
    ).toThrow(/اسم العملة/);
  });

  it('has a USD-only cash box', () => {
    const l = company();
    expect(l.state.accounts['1108']?.currency).toBe('USD');
    l.setRate({ date: '2026-01-01', currency: 'USD', kind: 'market', rate: 120 });
    l.postVoucher({ kind: 'receipt', date: '2026-01-02', amount: 100_00, currency: 'USD', accountId: '3101', memo: 'رأس مال' });
    expect(accountBalance(l.state, '1108').balance).toBe(12_000_00);
    expect(() => l.postVoucher({ kind: 'receipt', date: '2026-01-02', amount: 100, cashAccountId: '1108', accountId: '3101', memo: '' })).toThrow(/USD/);
  });
});

describe('users and permissions', () => {
  it('maps roles to permissions and protects the last owner', () => {
    const l = company();
    const cashier: User = { id: 'u2', username: 'kasher', displayName: 'كاشير', role: 'cashier', active: true };
    l.saveUser(cashier);
    expect(can(cashier, 'sales.create')).toBe(true);
    expect(can(cashier, 'costs.view')).toBe(false);
    expect(can(cashier, 'users.manage')).toBe(false);
    expect(can({ ...cashier, extra: ['costs.view'] }, 'costs.view')).toBe(true);
    expect(can({ ...owner, denied: ['sales.create'] }, 'sales.create')).toBe(true); // المالك لا تُسحب صلاحياته
    expect(can({ ...cashier, active: false }, 'sales.create')).toBe(false);
    expect(() => l.saveUser({ ...owner, role: 'manager' })).toThrow(/مالك/);
    expect(() => l.saveUser({ ...cashier, id: 'u3' })).toThrow(/مستخدم مسبقاً/);
  });

  it('decides the permission of each ledger method', () => {
    expect(permissionFor('postInvoice', [{ kind: 'sale' }])).toBe('sales.create');
    expect(permissionFor('postInvoice', [{ kind: 'purchase' }])).toBe('purchases.create');
    expect(permissionFor('postInvoice', [{ kind: 'sale_return' }])).toBe('returns.create');
    expect(permissionFor('closeYear', [])).toBe('period.close');
    expect(permissionFor('emit', [])).toBeNull(); // لا يمكن استدعاء الدوال الداخلية
  });

  it('records who created each document', () => {
    const l = company();
    l.actor = 'u1';
    l.saveItem(item());
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i1', qty: 5, unitCost: 500 }] });
    const inv = l.postInvoice({ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i1', qty: 1, price: 1000 }] });
    expect(inv.createdBy).toBe('u1');
    expect(l.state.entries.every((e) => e.createdBy === 'u1')).toBe(true);
  });
});

describe('period lock and year closing', () => {
  it('blocks postings in a locked period', () => {
    const l = company();
    l.postVoucher({ kind: 'receipt', date: '2026-01-10', amount: 1000, accountId: '3101', memo: '' });
    l.lockPeriod('2026-01-31');
    expect(() => l.postVoucher({ kind: 'receipt', date: '2026-01-20', amount: 1000, accountId: '3101', memo: '' })).toThrow(/مقفلة/);
    l.postVoucher({ kind: 'receipt', date: '2026-02-01', amount: 1000, accountId: '3101', memo: '' });
    expect(() => l.updateCompany({ lockedUntil: '2020-01-01' })).toThrow();
  });

  it('closes the year into retained earnings', () => {
    const l = company();
    l.saveItem(item());
    l.adjustStock({ kind: 'opening', date: '2025-01-01', lines: [{ itemId: 'i1', qty: 10, unitCost: 400 }] });
    l.postInvoice({ kind: 'sale', date: '2025-06-01', lines: [{ itemId: 'i1', qty: 2, price: 1000 }] });
    l.postVoucher({ kind: 'payment', date: '2025-07-01', amount: 300, accountId: '5202', memo: 'إيجار' });
    expect(incomeStatement(l.state, { from: '2025-01-01', to: '2025-12-31' }).netProfit).toBe(2000 - 800 - 300);
    l.closeYear('2025-12-31');
    expect(accountBalance(l.state, '4').balance).toBe(0);
    expect(accountBalance(l.state, '5').balance).toBe(0);
    expect(accountBalance(l.state, '3103').balance).toBe(-900);
    // قائمة الدخل للسنة المقفلة تبقى كما هي
    expect(incomeStatement(l.state, { from: '2025-01-01', to: '2025-12-31' }).netProfit).toBe(900);
    expect(l.state.info?.lockedUntil).toBe('2025-12-31');
    const bs = balanceSheet(l.state);
    expect(bs.assets).toBe(bs.liabilities + bs.equity);
    balanced(l);
  });
});

describe('opening balances and stock operations', () => {
  it('posts opening accounts, debts and stock against the opening balances account', () => {
    const l = company();
    l.saveItem(item());
    l.setRate({ date: '2026-01-01', currency: 'USD', kind: 'market', rate: 100 });
    l.postOpeningBalances({
      date: '2026-01-01',
      accounts: [{ accountId: '1101', debit: 50_000 }, { accountId: '1108', debit: 10_00, currency: 'USD' }],
      parties: [{ partyId: 'c', amount: 20_000 }, { partyId: 's', amount: -15_000 }],
      stock: [{ itemId: 'i1', qty: 10, unitCost: 600 }],
    });
    expect(partyBalance(l.state, 'c').base).toBe(20_000);
    expect(partyBalance(l.state, 's').base).toBe(-15_000);
    expect(accountBalance(l.state, '1108').balance).toBe(100_000);
    expect(l.state.stock['i1']).toMatchObject({ totalQty: 10, value: 6000, lastCost: 600 });
    expect(accountBalance(l.state, '3104').balance).toBe(-(50_000 + 100_000 + 20_000 - 15_000 + 6000));
    balanced(l);
  });

  it('records inventory count differences and damaged goods', () => {
    const l = company();
    l.saveItem(item());
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i1', qty: 10, unitCost: 500 }] });
    l.countStock({ date: '2026-01-05', lines: [{ itemId: 'i1', counted: 8 }] });
    expect(l.state.stock['i1']!.totalQty).toBe(8);
    expect(accountBalance(l.state, '5402').balance).toBe(1000);
    l.adjustStock({ kind: 'damage', date: '2026-01-06', lines: [{ itemId: 'i1', qty: 1 }] });
    expect(accountBalance(l.state, '5403').balance).toBe(500);
    expect(() => l.countStock({ date: '2026-01-07', lines: [{ itemId: 'i1', counted: 7 }] })).toThrow(/لا توجد فروقات/);
    balanced(l);
  });

  it('transfers between warehouses without changing value', () => {
    const l = company();
    l.saveWarehouse({ id: 'w2', name: 'مستودع 2' });
    l.saveItem(item());
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i1', qty: 10, unitCost: 500 }] });
    l.transferStock({ date: '2026-01-02', from: 'main', to: 'w2', lines: [{ itemId: 'i1', qty: 4 }] });
    expect(l.state.stock['i1']).toMatchObject({ totalQty: 10, value: 5000, qty: { main: 6, w2: 4 } });
    expect(() => l.transferStock({ date: '2026-01-02', from: 'w2', to: 'main', lines: [{ itemId: 'i1', qty: 5 }] })).toThrow(/المتوفرة/);
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-01-03', warehouseId: 'w2', lines: [{ itemId: 'i1', qty: 5, price: 1000 }] })).toThrow(/المتوفرة/);
    balanced(l);
  });

  it('sells in alternative units (carton = 12 pieces)', () => {
    const l = company();
    l.saveItem(item({ units: [{ name: 'كرتونة', factor: 12, price: 11_000, barcode: '999' }] }));
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i1', qty: 30, unitCost: 500 }] });
    const inv = l.postInvoice({ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i1', qty: 2, unit: 'كرتونة', price: 11_000 }] });
    expect(inv.total).toBe(22_000);
    expect(inv.lines[0]!.cost).toBe(12_000);
    expect(l.state.stock['i1']!.totalQty).toBe(6);
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i1', qty: 1, unit: 'باليت', price: 1 }] })).toThrow(/غير معرّفة/);
    balanced(l);
  });

  it('allows negative stock only when enabled', () => {
    const l = company();
    l.saveItem(item());
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i1', qty: 1, price: 1000 }] })).toThrow(/المتوفرة/);
    l.updateCompany({ allowNegativeStock: true });
    l.postInvoice({ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i1', qty: 1, price: 1000 }] });
    expect(l.state.stock['i1']!.totalQty).toBe(-1);
  });

  it('enforces customer credit limits', () => {
    const l = company();
    l.saveParty({ id: 'c', kind: 'customer', name: 'زبون', creditLimit: 1500 });
    l.saveItem(item());
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i1', qty: 10, unitCost: 500 }] });
    l.postInvoice({ kind: 'sale', date: '2026-01-02', partyId: 'c', lines: [{ itemId: 'i1', qty: 1, price: 1000 }] });
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-01-02', partyId: 'c', lines: [{ itemId: 'i1', qty: 1, price: 1000 }] })).toThrow(/حد الائتمان/);
    // الدفع نقداً لا يتأثر بالحد
    l.postInvoice({ kind: 'sale', date: '2026-01-02', partyId: 'c', lines: [{ itemId: 'i1', qty: 1, price: 1000 }], paid: 1000 });
  });
});

describe('reports', () => {
  it('computes profit per item, aging and cash movement', () => {
    const l = company();
    l.saveItem(item());
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i1', qty: 10, unitCost: 600 }] });
    l.postInvoice({ kind: 'sale', date: '2026-01-01', partyId: 'c', lines: [{ itemId: 'i1', qty: 3, price: 1000 }] });
    l.postInvoice({ kind: 'sale', date: '2026-03-15', partyId: 'c', lines: [{ itemId: 'i1', qty: 1, price: 1000 }], paid: 1000 });
    l.postVoucher({ kind: 'receipt', date: '2026-03-20', amount: 500, partyId: 'c', memo: 'دفعة' });
    const [row] = salesByItem(l.state);
    expect(row).toMatchObject({ qty: 4, revenue: 4000, cost: 2400, profit: 1600 });
    const [aging] = receivablesAging(l.state, '2026-04-01');
    expect(aging).toMatchObject({ balance: 2500, buckets: [0, 0, 2500, 0] });
    const cash = cashMovement(l.state, { from: '2026-03-01', to: '2026-03-31' }).find((c) => c.account.id === '1101')!;
    expect(cash.byCurrency['SYP']).toEqual({ opening: 0, inflow: 1500, outflow: 0, closing: 1500 });
  });
});

describe('activities', () => {
  it('provides 20 business profiles each with a valid chart', () => {
    expect(ACTIVITY_LIST).toHaveLength(20);
    for (const a of ACTIVITY_LIST) {
      const l = company(a.id);
      expect(Object.keys(l.state.accounts).length).toBeGreaterThan(40);
    }
  });
});
