import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, hasFeature, incomeStatement, partyBalance, permissionFor, trialBalance, type TailorOrderDraft } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'خياطة', activity: 'tailor', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('tailor'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'أبو سامر', measurements: { الكتف: '46', الصدر: '104' } });
  l.saveParty({ id: 's', kind: 'supplier', name: 'تاجر أقمشة' });
  l.saveItem({ id: 'wool', code: 'W1', name: 'جوخ إنكليزي', kind: 'stock', unit: 'متر', price: 300, priceCurrency: 'SYP' });
  l.postInvoice({ kind: 'purchase', date: '2026-01-01', partyId: 's', lines: [{ itemId: 'wool', qty: 20, price: 200 }], paid: 4000 });
  return l;
}

const draft = (over: Partial<TailorOrderDraft> = {}): TailorOrderDraft => ({
  id: 't1',
  partyId: 'c',
  date: '2026-02-01',
  dueDate: '2026-02-15',
  status: 'received',
  currency: 'SYP',
  garments: [{ description: 'بدلة رجالية', qty: 1, price: 1500 }],
  fabrics: [{ itemId: 'wool', qty: 3.5, price: 300 }],
  measurements: { الكتف: '46', الصدر: '104' },
  ...over,
});

const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(accountBalance(l.state, '1104').balance).toBe(Object.values(l.state.stock).reduce((s, x) => s + x.value, 0));
};

describe('tailoring', () => {
  it('has its own activity profile and permissions', () => {
    expect(hasFeature('tailor', 'tailoring')).toBe(true);
    expect(hasFeature('auto', 'tailoring')).toBe(false);
    expect(permissionFor('saveTailorOrder', [])).toBe('tailoring.manage');
    expect(permissionFor('deliverTailorOrder', [])).toBe('sales.create');
    expect(permissionFor('addTailorDeposit', [])).toBe('vouchers.create');
  });

  it('takes an order with deposit, then delivers it against the remaining balance', () => {
    const l = shop();
    const o = l.saveTailorOrder(draft());
    expect(o.number).toBe(1);
    l.addTailorDeposit('t1', { date: '2026-02-01', amount: 1000 });
    expect(partyBalance(l.state, 'c').base).toBe(-1000); // العربون دين للزبون عندنا حتى التسليم
    l.saveTailorOrder({ ...draft(), status: 'fitting', fittingDate: '2026-02-10' });
    expect(l.state.tailorOrders['t1']!.deposits).toHaveLength(1); // التعديل لا يمسح العربون

    const inv = l.deliverTailorOrder('t1', { date: '2026-02-14' });
    expect(inv.total).toBe(1500 + 1050);
    expect(inv.paid).toBe(2550 - 1000);
    expect(inv.lines.map((x) => x.description)).toEqual(['خياطة بدلة رجالية', 'جوخ إنكليزي']);
    expect(l.state.tailorOrders['t1']!.status).toBe('delivered');
    expect(partyBalance(l.state, 'c').base).toBe(0);
    expect(l.state.stock['wool']!.totalQty).toBe(16.5);
    expect(accountBalance(l.state, '4201').balance).toBe(-1500); // أجور الخياطة إيراد خدمات
    expect(incomeStatement(l.state).netProfit).toBe(2550 - 700);
    balanced(l);

    expect(() => l.saveTailorOrder(draft())).toThrow(/مفوتر/);
    expect(() => l.deliverTailorOrder('t1', { date: '2026-02-14' })).toThrow(/مسبقاً/);

    // إلغاء الفاتورة يعيد الطلب "جاهز" والقماش للمخزون، والعربون يبقى
    l.voidInvoice(inv.id, '2026-02-15');
    expect(l.state.tailorOrders['t1']!.status).toBe('ready');
    expect(l.state.tailorOrders['t1']!.invoiceId).toBeUndefined();
    expect(l.state.stock['wool']!.totalQty).toBe(20);
    expect(partyBalance(l.state, 'c').base).toBe(-1000);
    balanced(l);
  });

  it('protects order rules', () => {
    const l = shop();
    expect(() => l.saveTailorOrder(draft({ garments: [], fabrics: [] }))).toThrow(/قطعة/);
    expect(() => l.saveTailorOrder(draft({ status: 'delivered' }))).toThrow(/تسليم/);
    expect(() => l.saveTailorOrder(draft({ partyId: 'x' }))).toThrow(/الزبون/);
    expect(() => l.saveTailorOrder(draft({ fabrics: [{ itemId: 'nope', qty: 1, price: 1 }] }))).toThrow(/قماش/);
    expect(() => l.saveTailorOrder(draft({ dueDate: '15/02/2026' }))).toThrow(/تاريخ/);
    l.saveTailorOrder(draft());
    l.addTailorDeposit('t1', { date: '2026-02-01', amount: 500 });
    expect(() => l.saveTailorOrder({ ...draft(), status: 'cancelled' })).toThrow(/عربون/);
    // بعد إرجاع العربون (إلغاء السند) يمكن إلغاء الطلب
    l.voidEntry(l.state.tailorOrders['t1']!.deposits[0]!.entryId, '2026-02-02');
    l.saveTailorOrder({ ...draft(), status: 'cancelled' });
    expect(() => l.deliverTailorOrder('t1', { date: '2026-02-14' })).toThrow(/ملغى/);
    expect(() => l.addTailorDeposit('t1', { date: '2026-02-03', amount: 100 })).toThrow(/ملغى/);
    // الطلب الثاني يأخذ الرقم التالي
    expect(l.saveTailorOrder(draft({ id: 't2' })).number).toBe(2);
  });

  it('a deposit larger than the bill leaves credit for the customer', () => {
    const l = shop();
    l.saveTailorOrder(draft({ fabrics: [] }));
    l.addTailorDeposit('t1', { date: '2026-02-01', amount: 2000 });
    const inv = l.deliverTailorOrder('t1', { date: '2026-02-14' });
    expect(inv.paid).toBe(0);
    expect(partyBalance(l.state, 'c').base).toBe(-500);
    balanced(l);
  });
});
