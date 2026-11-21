import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, healthCheck, partyBalance, trialBalance } from '../src/core';

// عمولة المسوّق «من الربح» بتلحق تصحيح التكلفة (كانت تضل على تكلفة وقت الحفظ: صفر أو زيادة)
const D1 = '2026-11-10';
const D2 = '2026-11-20';
function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.updateCompany({ allowNegativeStock: true });
  l.saveParty({ id: 's', kind: 'supplier', name: 'المورد' });
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 'm', kind: 'supplier', name: 'مسوّق', marketerRate: 10 });
  l.saveParty({ id: 't', kind: 'supplier', name: 'مسوّق إجمالي', marketerRate: 5, commissionMode: 'total' });
  l.saveItem({ id: 'a', code: 'A', name: 'براد', kind: 'stock', unit: 'قطعة', price: 50000, priceCurrency: 'SYP' });
  return l;
}
const commission = (l: Ledger, invoiceId: string, marketer = 'm') =>
  l.state.entries
    .filter((e) => e.source?.type === 'commission' && e.source.id === invoiceId && !l.state.voided[e.id] && !e.voidOf)
    .reduce((t, e) => t + e.lines.filter((x) => x.partyId === marketer).reduce((s, x) => s + x.credit - x.debit, 0), 0);
const consistent = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(healthCheck(l.state).issues.filter((i) => i.level === 'error')).toEqual([]);
};

describe('marketer commission follows the corrected cost', () => {
  it('sold before the purchase was entered: commission drops from the full price to the real profit', () => {
    const l = shop();
    const sale = l.postInvoice({ kind: 'sale', date: D2, partyId: 'c', marketerId: 'm', lines: [{ itemId: 'a', qty: 1, price: 50000 }] });
    expect(commission(l, sale.id)).toBe(5000); // التكلفة لسا صفر
    l.postInvoice({ kind: 'purchase', date: D2, partyId: 's', lines: [{ itemId: 'a', qty: 5, price: 30000 }] });
    expect(commission(l, sale.id)).toBe(2000); // (50000 − 30000) × 10%
    expect(partyBalance(l.state, 'm').base).toBe(-2000);
    consistent(l);
  });

  it('a cost that was too high (commission 0) is corrected when the purchase is fixed', () => {
    const l = shop();
    const p = l.postInvoice({ kind: 'purchase', date: D1, partyId: 's', lines: [{ itemId: 'a', qty: 2, price: 60000 }] }); // سعر غلط
    const sale = l.postInvoice({ kind: 'sale', date: D2, partyId: 'c', marketerId: 'm', lines: [{ itemId: 'a', qty: 1, price: 50000 }] });
    expect(commission(l, sale.id)).toBe(0);
    l.replaceInvoice(p.id, { kind: 'purchase', date: D1, partyId: 's', lines: [{ itemId: 'a', qty: 2, price: 35000 }] });
    expect(commission(l, sale.id)).toBe(1500);
    consistent(l);
  });

  it('commission on the invoice total and locked periods are not touched', () => {
    const l = shop();
    const sale = l.postInvoice({ kind: 'sale', date: D1, partyId: 'c', marketerId: 't', lines: [{ itemId: 'a', qty: 1, price: 50000 }] });
    const locked = l.postInvoice({ kind: 'sale', date: D1, partyId: 'c', marketerId: 'm', lines: [{ itemId: 'a', qty: 1, price: 50000 }] });
    l.lockPeriod(D1);
    l.postInvoice({ kind: 'purchase', date: D2, partyId: 's', lines: [{ itemId: 'a', qty: 5, price: 30000 }] });
    expect(commission(l, sale.id, 't')).toBe(2500);
    expect(commission(l, locked.id)).toBe(5000);
    consistent(l);
  });

  it('one-time fix for companies whose commissions went stale before this version', () => {
    const l = shop();
    // متل النسخ القديمة: التكلفة بتتصحّح بدون ما تلحقها العمولة
    const real = l.syncCommissions.bind(l);
    l.syncCommissions = () => 0;
    const sale = l.postInvoice({ kind: 'sale', date: D2, partyId: 'c', marketerId: 'm', lines: [{ itemId: 'a', qty: 1, price: 50000 }] });
    l.postInvoice({ kind: 'purchase', date: D2, partyId: 's', lines: [{ itemId: 'a', qty: 5, price: 30000 }] });
    expect(commission(l, sale.id)).toBe(5000);
    l.syncCommissions = real;
    expect(l.syncCommissionsOnce()).toBe(1);
    expect(commission(l, sale.id)).toBe(2000);
    expect(l.syncCommissionsOnce()).toBe(0);
    expect(l.state.info!.commissionsCostSynced).toBe(true);
    consistent(l);
  });
});
