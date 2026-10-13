import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, installmentState, partyBalance, permissionFor, resolveScan, serialHistory, serialsInStock, trialBalance } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'موبايلات', activity: 'mobile', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('mobile'), defaultTaxes());
  l.saveParty({ id: 'sup', kind: 'supplier', name: 'وكيل سامسونج' });
  l.saveParty({ id: 'c', kind: 'customer', name: 'أبو علي', phone: '0933' });
  l.saveItem({ id: 'a54', code: 'A54', name: 'Samsung A54 128GB', kind: 'stock', unit: 'قطعة', price: 3_500_000, priceCurrency: 'SYP', trackSerial: true, warrantyMonths: 12, category: 'موبايلات' });
  l.saveItem({ id: 'used', code: 'USED', name: 'موبايل مستعمل', kind: 'stock', unit: 'قطعة', price: 0, priceCurrency: 'SYP', trackSerial: true, category: 'موبايلات مستعملة' });
  l.postInvoice({ kind: 'purchase', date: '2026-01-05', partyId: 'sup', lines: [{ itemId: 'a54', qty: 2, price: 3_000_000, serials: ['350000000000011', '350000000000029'] }], paid: 0 });
  return l;
}

describe('electronics: IMEI, warranty, installments and trade-in', () => {
  it('scanning an IMEI finds the exact device in stock', () => {
    const l = shop();
    const r = resolveScan(l.state, '350000000000011');
    expect(r?.item.id).toBe('a54');
    expect(r?.serial).toBe('350000000000011');
    expect(resolveScan(l.state, '999')).toBeNull();
    expect(serialsInStock(l.state)).toHaveLength(2);
  });

  it('tells the full story of a device and its warranty', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-02-01', partyId: 'c', lines: [{ itemId: 'a54', qty: 1, price: 3_500_000, serials: ['350000000000011'] }], paid: 3_500_000 });
    const h = serialHistory(l.state, '350000000000011', '2026-06-01')!;
    expect(h.inStock).toBe(false);
    expect(h.soldTo).toBe('c');
    expect(h.events.map((e) => e.kind)).toEqual(['in', 'out']);
    expect(h.events[0]!.partyId).toBe('sup');
    expect(h.warrantyUntil).toBe('2027-02-01');
    expect(h.warrantyActive).toBe(true);
    expect(serialHistory(l.state, '350000000000011', '2027-03-01')!.warrantyActive).toBe(false);
    const still = serialHistory(l.state, '350000000000029', '2026-06-01')!;
    expect(still.inStock).toBe(true);
    expect(still.soldTo).toBeUndefined();
  });

  it('installment plan with markup, collection in order, overdue and completion', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'sale', date: '2026-02-01', partyId: 'c', lines: [{ itemId: 'a54', qty: 1, price: 3_500_000, serials: ['350000000000011'] }], paid: 500_000 });
    expect(() => l.createInstallmentPlan({ partyId: 'c', date: '2026-02-01', invoiceId: inv.id, principal: 3_100_000, count: 6 })).toThrow('أكبر من الباقي');
    const plan = l.createInstallmentPlan({ partyId: 'c', date: '2026-02-01', invoiceId: inv.id, principal: 3_000_000, markupPercent: 10, count: 6, firstDue: '2026-03-01', guarantor: 'أبو محمد' });
    expect(plan.markup).toBe(300_000);
    expect(plan.schedule).toHaveLength(6);
    expect(plan.schedule.reduce((t, s) => t + s.amount, 0)).toBe(3_300_000);
    expect(plan.schedule[1]!.due).toBe('2026-04-01');
    expect(partyBalance(l.state, 'c').base).toBe(3_300_000);
    expect(() => l.createInstallmentPlan({ partyId: 'c', date: '2026-02-01', invoiceId: inv.id, principal: 1000, count: 1 })).toThrow('خطة أقساط مسبقاً');

    l.collectInstallment(plan.id, { date: '2026-03-02', amount: 550_000 });
    l.collectInstallment(plan.id, { date: '2026-04-20', amount: 300_000 });
    let st = installmentState(l.state, l.state.installments[plan.id]!, '2026-05-15');
    expect(st.paid).toBe(850_000);
    expect(st.rows[0]!.remaining).toBe(0);
    expect(st.rows[1]!.remaining).toBe(250_000);
    expect(st.overdueCount).toBe(2); // نيسان (باقي منه) وأيار
    expect(st.overdueAmount).toBe(250_000 + 550_000);
    expect(() => l.collectInstallment(plan.id, { date: '2026-05-15', amount: 9_999_999 })).toThrow('الباقي على الخطة');
    l.collectInstallment(plan.id, { date: '2026-05-15', amount: st.remaining });
    expect(l.state.installments[plan.id]!.status).toBe('done');
    expect(partyBalance(l.state, 'c').base).toBe(0);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('cancelling a plan with no payments reverses the markup', () => {
    const l = shop();
    const plan = l.createInstallmentPlan({ partyId: 'c', date: '2026-02-01', principal: 1_000_000, markup: 100_000, count: 2 });
    expect(partyBalance(l.state, 'c').base).toBe(100_000);
    l.cancelInstallmentPlan(plan.id, '2026-02-02');
    expect(partyBalance(l.state, 'c').base).toBe(0);
    expect(l.state.installments[plan.id]!.status).toBe('cancelled');
  });

  it('trade-in buys the old phone into stock and sells the new one, cash is the difference', () => {
    const l = shop();
    const { sale, purchase } = l.tradeIn({
      date: '2026-02-10',
      partyId: 'c',
      sale: [{ itemId: 'a54', qty: 1, price: 3_500_000, serials: ['350000000000029'] }],
      tradeIn: [{ itemId: 'used', description: 'iPhone 11 مستعمل', qty: 1, price: 1_800_000, serials: ['111111111111111'], note: 'بطارية 82%' }],
      received: 1_700_000,
    });
    expect(sale.total - purchase.total).toBe(1_700_000);
    expect(partyBalance(l.state, 'c').base).toBe(0);
    expect(l.state.stock['used']!.serials!['111111111111111']).toBeTruthy();
    const h = serialHistory(l.state, '111111111111111', '2026-02-10')!;
    expect(h.inStock).toBe(true);
    expect(h.events[0]!.partyId).toBe('c');
    expect(permissionFor('tradeIn', [])).toBe('sales.create');
    expect(permissionFor('collectInstallment', [])).toBe('vouchers.create');
  });
});
