import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, fullStatement } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'c1', kind: 'customer', name: 'أبو أحمد' });
  return l;
}

describe('full statement', () => {
  it('party statement: opening, typed rows linked to invoices, running balance and totals', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-01-10', partyId: 'c1', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 10000 }], paid: 0 });
    l.postInvoice({ kind: 'sale', date: '2026-02-10', partyId: 'c1', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 5000 }], paid: 0 });
    l.postVoucher({ kind: 'receipt', date: '2026-02-15', amount: 8000, partyId: 'c1', memo: 'دفعة' });
    const feb = fullStatement(l.state, { kind: 'party', id: 'c1' }, { from: '2026-02-01', to: '2026-02-28' });
    expect(feb.opening).toBe(10000);
    expect(feb.rows.map((r) => r.type)).toEqual(['فاتورة مبيع #2', 'سند قبض']);
    expect(feb.rows[0]!.invoiceId).toBeTruthy();
    expect(feb.rows.map((r) => r.running)).toEqual([15000, 7000]);
    expect(feb).toMatchObject({ totalDebit: 5000, totalCredit: 8000, closing: 7000 });
  });

  it('hides a deleted invoice and its reversal, and keeps each currency apart', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'sale', date: '2026-01-10', partyId: 'c1', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 10000 }], paid: 0 });
    l.deleteInvoice(inv.id, '2026-01-11');
    expect(fullStatement(l.state, { kind: 'party', id: 'c1' }, {}, { hideVoided: true }).rows).toHaveLength(0);
    expect(fullStatement(l.state, { kind: 'party', id: 'c1' }).rows).toHaveLength(2);
    // محل بالليرة وزبون عليه فاتورة بالدولار: كشف الدولار بالدولار
    const k = new Ledger(() => {});
    k.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
    k.saveParty({ id: 'c1', kind: 'customer', name: 'أبو أحمد' });
    k.setRate({ date: '2026-01-01', currency: 'USD', kind: 'market', rate: 120 });
    k.postInvoice({ kind: 'sale', date: '2026-01-12', partyId: 'c1', currency: 'USD', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 1000 }], paid: 0 });
    k.postInvoice({ kind: 'sale', date: '2026-01-13', partyId: 'c1', currency: 'SYP', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 50000 }], paid: 0 });
    const usd = fullStatement(k.state, { kind: 'party', id: 'c1' }, {}, { currency: 'USD' });
    expect(usd.currencies).toEqual(['SYP', 'USD']);
    expect(usd.closing).toBe(1000);
    expect(fullStatement(k.state, { kind: 'party', id: 'c1' }, {}, { currency: 'SYP' }).closing).toBe(50000);
    // الكل: بالعملة الأساسية (الدولار محوّل)
    expect(fullStatement(k.state, { kind: 'party', id: 'c1' }).closing).toBe(50000 + 120000);
  });
});
