import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, invoicePartyBalance, partyDebts } from '../src/core';

// دين الزبون على الفاتورة: فاتورتين آجل لازم يطلع عليه المجموع، حتى لو العملات مختلفة

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'x', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveItem({ id: 'w', code: 'W', name: 'مادة', kind: 'service', unit: 'قطعة', price: 10000, priceCurrency: 'USD' });
  l.setRate({ date: '2026-01-01', currency: 'USD', rate: 110, kind: 'market' });
  return l;
}
const syp = (n: number) => n * 10 ** DEFAULT_CURRENCIES.find((c) => c.code === 'SYP')!.decimals;

describe('party balance on invoices', () => {
  it('two $100 credit invoices: the second shows 100 before and 200 after', () => {
    const l = shop();
    const a = l.postInvoice({ kind: 'sale', date: '2026-01-02', currency: 'USD', partyId: 'c', paid: 0, lines: [{ itemId: 'w', qty: 1, price: 10000 }] });
    const b = l.postInvoice({ kind: 'sale', date: '2026-01-03', currency: 'USD', partyId: 'c', paid: 0, lines: [{ itemId: 'w', qty: 1, price: 10000 }] });
    expect(invoicePartyBalance(l.state, a)).toMatchObject({ previous: 0, after: 10000 });
    expect(invoicePartyBalance(l.state, b)).toMatchObject({ previous: 10000, after: 20000, others: [] });
    expect(partyDebts(l.state, 'c')[0]!.balance).toBe(20000);
  });

  it('old debt in dollars + new invoice in lira: the old one is counted, converted at the day rate', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-01-02', currency: 'USD', partyId: 'c', paid: 0, lines: [{ itemId: 'w', qty: 1, price: 10000 }] });
    const b = l.postInvoice({ kind: 'sale', date: '2026-01-03', currency: 'SYP', partyId: 'c', paid: 0, lines: [{ description: 'خدمة', qty: 1, price: syp(11000) }] });
    const bal = invoicePartyBalance(l.state, b)!;
    expect(bal.previous).toBe(syp(11000)); // 100$ × 110
    expect(bal.after).toBe(syp(22000));
    expect(bal.others).toEqual([{ currency: 'USD', amount: 10000 }]);
  });
});
