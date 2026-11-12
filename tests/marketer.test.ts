import { describe, expect, it } from 'vitest';
import { COMMISSION_ACCOUNT, DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, incomeStatement, partyBalance } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'ahmad', kind: 'supplier', name: 'أحمد (مسوّق)', marketerRate: 15 });
  l.saveParty({ id: 'mhmd', kind: 'customer', name: 'محمد' });
  return l;
}

describe('marketer commission', () => {
  it('15% of a sale through Ahmad becomes an expense owed to him, hidden from the customer side', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'sale', date: '2026-11-01', partyId: 'mhmd', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 20000 }], paid: 20000, marketerId: 'ahmad' });
    expect(inv.marketerId).toBe('ahmad');
    expect(accountBalance(l.state, COMMISSION_ACCOUNT).balance).toBe(3000);
    expect(-partyBalance(l.state, 'ahmad').base).toBe(3000); // إلو علينا
    expect(partyBalance(l.state, 'mhmd').base).toBe(0);
    expect(incomeStatement(l.state, { from: '2026-11-01', to: '2026-11-30' }).netProfit).toBe(17000);
    // تصفية حسابه بسند دفع
    l.postVoucher({ kind: 'payment', date: '2026-11-05', amount: 3000, partyId: 'ahmad', memo: 'تصفية عمولة' });
    expect(partyBalance(l.state, 'ahmad').base).toBe(0);
  });

  it('voiding or editing the invoice cancels / recalculates the commission', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'sale', date: '2026-11-01', partyId: 'mhmd', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 10000 }], paid: 0, marketerId: 'ahmad' });
    const edited = l.replaceInvoice(inv.id, { kind: 'sale', date: '2026-11-01', partyId: 'mhmd', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 2, price: 10000 }], paid: 0, marketerId: 'ahmad' });
    expect(-partyBalance(l.state, 'ahmad').base).toBe(3000);
    l.deleteInvoice(edited.id, '2026-11-02');
    expect(partyBalance(l.state, 'ahmad').base).toBe(0);
    expect(accountBalance(l.state, COMMISSION_ACCOUNT).balance).toBe(0);
  });
});

describe('marketer commission on profit', () => {
  function profitShop() {
    const l = shop();
    l.saveParty({ id: 'third', kind: 'supplier', name: 'الشريك', marketerRate: 33.33, marketerBasis: 'profit' });
    l.saveItem({ id: 'x', code: '1', name: 'بضاعة', kind: 'stock', unit: 'قطعة', price: 1500, priceCurrency: 'USD' });
    l.postInvoice({ kind: 'purchase', date: '2026-11-01', currency: 'USD', lines: [{ itemId: 'x', qty: 10, price: 1000 }] }); // التكلفة 10.00 بالقطعة
    return l;
  }

  it('one third of the profit: sale 15.00 on cost 10.00 per piece x2 gives profit 10.00 and commission 3.33', () => {
    const l = profitShop();
    l.postInvoice({ kind: 'sale', date: '2026-11-02', partyId: 'mhmd', currency: 'USD', lines: [{ itemId: 'x', qty: 2, price: 1500 }], paid: 3000, marketerId: 'third' });
    expect(accountBalance(l.state, COMMISSION_ACCOUNT).balance).toBe(333); // ثلث ربح 10.00
    expect(-partyBalance(l.state, 'third').base).toBe(333);
  });

  it('no profit, no commission; voiding the invoice cancels it', () => {
    const l = profitShop();
    l.postInvoice({ kind: 'sale', date: '2026-11-02', partyId: 'mhmd', currency: 'USD', lines: [{ itemId: 'x', qty: 1, price: 900 }], paid: 900, marketerId: 'third' });
    expect(partyBalance(l.state, 'third').base).toBe(0);
    const inv = l.postInvoice({ kind: 'sale', date: '2026-11-03', partyId: 'mhmd', currency: 'USD', lines: [{ itemId: 'x', qty: 1, price: 1900 }], paid: 1900, marketerId: 'third' });
    expect(-partyBalance(l.state, 'third').base).toBe(300); // ربح 9.00 × 33.33%
    l.deleteInvoice(inv.id, '2026-11-04');
    expect(partyBalance(l.state, 'third').base).toBe(0);
  });

  it('every marketer (even old ones without a basis) takes a share of the profit, not of the invoice', () => {
    const l = profitShop();
    l.postInvoice({ kind: 'sale', date: '2026-11-02', partyId: 'mhmd', currency: 'USD', lines: [{ itemId: 'x', qty: 2, price: 1500 }], paid: 3000, marketerId: 'ahmad' });
    expect(-partyBalance(l.state, 'ahmad').base).toBe(150); // 15% من ربح 10.00، مش من 30.00
  });
});

describe('recalculating old commissions', () => {
  it('a commission recorded on the invoice value is corrected to a share of its profit, keeping what was paid', () => {
    const l = shop();
    l.saveParty({ id: 'third', kind: 'supplier', name: 'أبو طه', marketerRate: 33.33 });
    l.saveItem({ id: 'x', code: '1', name: 'بضاعة', kind: 'stock', unit: 'قطعة', price: 1500, priceCurrency: 'USD' });
    l.postInvoice({ kind: 'purchase', date: '2026-11-01', currency: 'USD', lines: [{ itemId: 'x', qty: 10, price: 1000 }] });
    const inv = l.postInvoice({ kind: 'sale', date: '2026-11-02', currency: 'USD', lines: [{ itemId: 'x', qty: 2, price: 1500 }], paid: 3000, marketerId: 'third' });
    // متل النسخ القديمة: العمولة من قيمة الفاتورة (30.00 × 33.33% = 10.00)
    const old = l.state.entries.find((e) => e.source?.type === 'commission' && e.source.id === inv.id)!;
    (l as unknown as { emit: (e: unknown) => void }).emit({ type: 'entry.posted', entry: (l as unknown as { reversal: (e: unknown, d: string) => unknown }).reversal(old, '2026-11-02') });
    l.postEntry({ date: '2026-11-02', memo: 'عمولة قديمة', lines: [{ accountId: COMMISSION_ACCOUNT, debit: 1000 }, { accountId: '2101', credit: 1000, partyId: 'third' }], source: { type: 'commission', id: inv.id } });
    expect(-partyBalance(l.state, 'third').base).toBe(1000);
    l.postVoucher({ kind: 'payment', date: '2026-11-03', amount: 500, partyId: 'third', memo: 'دفعة' });
    const r = l.recalcCommissions('third', '2026-11-05');
    expect(r).toEqual({ changed: 1, before: 1000, after: 333 });
    expect(accountBalance(l.state, COMMISSION_ACCOUNT).balance).toBe(333);
    expect(partyBalance(l.state, 'third').base).toBe(167); // أخد 5.00 وإلو 3.33: أخد زيادة 1.67
    expect(l.recalcCommissions('third', '2026-11-05').changed).toBe(0);
  });

  it('old commissions are fixed automatically once, when the company opens after the update', () => {
    const l = shop();
    l.saveParty({ id: 'third', kind: 'supplier', name: 'أبو طه', marketerRate: 33.33 });
    l.saveItem({ id: 'x', code: '1', name: 'بضاعة', kind: 'stock', unit: 'قطعة', price: 1500, priceCurrency: 'USD' });
    l.postInvoice({ kind: 'purchase', date: '2026-11-01', currency: 'USD', lines: [{ itemId: 'x', qty: 10, price: 1000 }] });
    for (let i = 0; i < 5; i++) {
      // ربح كل فاتورة 2.00 (12.00 على تكلفة 10.00)، والعمولة القديمة كانت من القيمة: 4.00
      const inv = l.postInvoice({ kind: 'sale', date: '2026-11-02', currency: 'USD', lines: [{ itemId: 'x', qty: 1, price: 1200 }], paid: 1200, marketerId: 'third' });
      const old = l.state.entries.find((e) => e.source?.type === 'commission' && e.source.id === inv.id)!;
      (l as unknown as { emit: (e: unknown) => void }).emit({ type: 'entry.posted', entry: (l as unknown as { reversal: (e: unknown, d: string) => unknown }).reversal(old, '2026-11-02') });
      l.postEntry({ date: '2026-11-02', memo: 'عمولة قديمة', lines: [{ accountId: COMMISSION_ACCOUNT, debit: 400 }, { accountId: '2101', credit: 400, partyId: 'third' }], source: { type: 'commission', id: inv.id } });
    }
    expect(-partyBalance(l.state, 'third').base).toBe(2000);
    expect(l.fixCommissionsOnce('2026-11-12')).toBe(5);
    expect(-partyBalance(l.state, 'third').base).toBe(335); // 5 × 0.67 (تلت 2.00)
    expect(l.state.info!.commissionsFromProfit).toBe(true);
    expect(l.fixCommissionsOnce('2026-11-12')).toBe(0);
  });
});

describe('archived system accounts', () => {
  it('a sale still posts when cost-of-goods-sold was archived by mistake, but a normal archived account stays blocked', () => {
    const l = shop();
    l.saveItem({ id: 'x', code: '1', name: 'بضاعة', kind: 'stock', unit: 'قطعة', price: 1500, priceCurrency: 'USD' });
    l.postInvoice({ kind: 'purchase', date: '2026-11-01', currency: 'USD', lines: [{ itemId: 'x', qty: 10, price: 1000 }] });
    l.saveAccount({ ...l.state.accounts['5101']!, archived: true });
    expect(() => l.postInvoice({ kind: 'sale', date: '2026-11-02', currency: 'USD', lines: [{ itemId: 'x', qty: 1, price: 1500 }], paid: 1500 })).not.toThrow();
    l.saveAccount({ id: '5999', name: 'مصروف قديم', type: 'expense', parentId: null, isGroup: false, currency: null, archived: true });
    expect(() => l.postEntry({ date: '2026-11-02', memo: 'x', lines: [{ accountId: '5999', debit: 100 }, { accountId: '1101', credit: 100 }] })).toThrow(/مؤرشف/);
  });
});

describe('purchase cost breakdown', () => {
  it('factory 6 + shipping 2 + tax 2 + customs 2 = cost 12 per piece', () => {
    const l = shop();
    l.saveItem({ id: 'x', code: '1', name: 'قطعة', kind: 'stock', unit: 'قطعة', price: 1500, priceCurrency: 'USD' });
    const inv = l.postInvoice({ kind: 'purchase', date: '2026-11-01', currency: 'USD', lines: [{ itemId: 'x', qty: 10, price: 1200, costParts: { factory: 600, shipping: 200, tax: 200, customs: 200 } }] });
    expect(inv.lines[0]!.costParts).toEqual({ factory: 600, shipping: 200, tax: 200, customs: 200 });
    expect(l.state.stock['x']!.value).toBe(12000);
    expect(() => l.postInvoice({ kind: 'purchase', date: '2026-11-01', currency: 'USD', lines: [{ itemId: 'x', qty: 1, price: 1200, costParts: { factory: -1, shipping: 0, tax: 0, customs: 0 } }] })).toThrow();
  });
});
