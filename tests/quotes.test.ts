import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, dailySummary, defaultTaxes, quoteTotals, trialBalance, type QuoteDraft } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.actor = 'u1';
  l.createCompany({ name: 'x', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  l.saveItem({ id: 'w', code: 'W', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 300, priceCurrency: 'SYP' });
  l.postInvoice({ kind: 'purchase', date: '2026-03-01', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 100 }], paid: 1000 });
  return l;
}

const q = (over: Partial<QuoteDraft> = {}): QuoteDraft => ({
  id: 'q1',
  date: '2026-03-02',
  validUntil: '2026-03-16',
  partyId: 'c',
  currency: 'SYP',
  lines: [
    { itemId: 'w', description: 'مادة', qty: 4, price: 300 },
    { description: 'تركيب', qty: 1, price: 500 },
  ],
  discount: 100,
  taxIds: [],
  status: 'open',
  ...over,
});

describe('price quotes', () => {
  it('does not touch stock or accounts until converted', () => {
    const l = shop();
    const before = l.state.entries.length;
    const quote = l.saveQuote(q());
    expect(quote.number).toBe(1);
    expect(l.state.entries.length).toBe(before);
    expect(l.state.stock['w']!.totalQty).toBe(10);
    expect(quoteTotals(l.state, quote).total).toBe(4 * 300 + 500 - 100);
  });

  it('converts to a sale invoice, then locks; voiding reopens it', () => {
    const l = shop();
    l.saveQuote(q());
    const inv = l.convertQuote('q1', { date: '2026-03-05', paid: 1600 });
    expect(inv.total).toBe(1600);
    expect(inv.source).toEqual({ type: 'quote', id: 'q1' });
    expect(l.state.quotes['q1']!.status).toBe('converted');
    expect(l.state.stock['w']!.totalQty).toBe(6);
    expect(() => l.saveQuote(q())).toThrow(/فاتورة/);
    expect(() => l.convertQuote('q1', { date: '2026-03-05' })).toThrow(/مسبقاً/);
    l.voidInvoice(inv.id, '2026-03-06');
    expect(l.state.quotes['q1']!.status).toBe('accepted');
    expect(l.state.stock['w']!.totalQty).toBe(10);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('validates quotes', () => {
    const l = shop();
    expect(() => l.saveQuote(q({ lines: [] }))).toThrow(/سطراً/);
    expect(() => l.saveQuote(q({ partyId: 'nope' }))).toThrow(/الزبون/);
    expect(() => l.saveQuote(q({ lines: [{ description: 'x', qty: 0, price: 1 }] }))).toThrow(/كمية/);
    l.saveQuote(q({ status: 'rejected' }));
    expect(() => l.convertQuote('q1', { date: '2026-03-05' })).toThrow(/مرفوض/);
  });
});

describe('daily closing report', () => {
  it('summarises sales, cash, credit, returns and vouchers for a day and user', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-03-10', lines: [{ itemId: 'w', qty: 2, price: 300 }] });
    l.postInvoice({ kind: 'sale', date: '2026-03-10', partyId: 'c', lines: [{ itemId: 'w', qty: 1, price: 300 }], paid: 100 });
    l.postInvoice({ kind: 'sale_return', date: '2026-03-10', lines: [{ itemId: 'w', qty: 1, price: 300 }] });
    l.postVoucher({ kind: 'receipt', date: '2026-03-10', amount: 150, partyId: 'c', memo: 'دفعة' });
    l.postVoucher({ kind: 'payment', date: '2026-03-10', amount: 50, accountId: '5209', memo: 'مصروف' });
    const v = l.postInvoice({ kind: 'sale', date: '2026-03-10', lines: [{ itemId: 'w', qty: 1, price: 300 }] });
    l.voidInvoice(v.id, '2026-03-10');
    l.actor = 'u2';
    l.postInvoice({ kind: 'sale', date: '2026-03-10', lines: [{ itemId: 'w', qty: 1, price: 999 }] });

    const all = dailySummary(l.state, '2026-03-10');
    const syp = all.rows.find((r) => r.currency === 'SYP')!;
    expect(all.invoices).toBe(3);
    expect(all.voided).toBe(1);
    expect(syp.sales).toBe(600 + 300 + 999);
    expect(syp.salesCash).toBe(600 + 100 + 999);
    expect(syp.salesCredit).toBe(200);
    expect(syp.returns).toBe(300);
    expect(syp.receipts).toBe(150);
    expect(syp.payments).toBe(50);
    expect(syp.cashIn).toBe(600 + 100 + 999 - 300 + 150 - 50);
    expect(accountBalance(l.state, '1101').balance).toBe(-1000 + syp.cashIn);

    const mine = dailySummary(l.state, '2026-03-10', 'u2');
    expect(mine.invoices).toBe(1);
    expect(mine.rows[0]!.sales).toBe(999);
    expect(mine.topItems[0]).toMatchObject({ itemId: 'w', qty: 1 });
  });
});
