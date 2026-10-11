import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, partyBalance, trialBalance, incomeStatement, tradingChart } from '../src/core';
import { execute } from '../src/app/executor';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'x', activity: 'tailor', baseCurrency: 'SYP', fiscalYearStart: '01-01' } as any, DEFAULT_CURRENCIES, chartFor('tailor'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'c' } as any);
  l.saveParty({ id: 's', kind: 'supplier', name: 's' } as any);
  l.saveItem({ id: 'w', code: 'W1', name: 'w', kind: 'stock', unit: 'm', price: 300, priceCurrency: 'SYP' } as any);
  l.setRate({ date: '2026-01-01', currency: 'USD', rate: 130, kind: 'market' } as any);
  return l;
}
const inv = (l: Ledger) => accountBalance(l.state, '1104').balance;
const stockVal = (l: Ledger) => Object.values(l.state.stock).reduce((s, x) => s + x.value, 0);

describe('probe', () => {
  it('void purchase after sale -> negative stock', () => {
    const l = shop();
    const p = l.postInvoice({ kind: 'purchase', date: '2026-01-02', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 100 }] });
    l.postInvoice({ kind: 'sale', date: '2026-01-03', lines: [{ itemId: 'w', qty: 10, price: 150 }] });
    let err = '';
    try { l.voidInvoice(p.id, '2026-01-04'); } catch (e: any) { err = e.message; }
    console.log('A void purchase', err, l.state.stock['w'], l.state.info?.allowNegativeStock);
  });
  it('purchase return at different price', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: '2026-01-02', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 100 }] });
    l.postInvoice({ kind: 'purchase_return', date: '2026-01-03', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 150 }] });
    console.log('B pret', l.state.stock['w'], inv(l));
  });
  it('absorbRounding alters base line', () => {
    const l = shop();
    const e = l.postEntry({ date: '2026-01-05', memo: 'm', lines: [
      { accountId: '1108', debit: 100, currency: 'USD' },
      { accountId: '1101', credit: 12999 },
    ] });
    console.log('C absorb', JSON.stringify(e.lines.map(x => [x.accountId, x.debit, x.credit, x.baseDebit, x.baseCredit])));
  });
  it('closeYear after lockPeriod', () => {
    const l = shop();
    l.postInvoice({ kind: 'sale', date: '2026-02-01', lines: [{ itemId: null, description: 'svc', qty: 1, price: 1000 }] });
    l.postInvoice({ kind: 'sale', date: '2026-06-01', lines: [{ itemId: null, description: 'svc', qty: 1, price: 500 }] });
    l.lockPeriod('2026-03-31');
    l.closeYear('2026-12-31');
    console.log('D close', accountBalance(l.state, '4201').balance, accountBalance(l.state, '3103').balance);
  });
  it('tailor currency change after deposit', () => {
    const l = shop();
    const d: any = { id: 't1', partyId: 'c', date: '2026-02-01', status: 'received', currency: 'SYP', garments: [{ description: 'g', qty: 1, price: 100000 }], fabrics: [], measurements: {} };
    l.saveTailorOrder(d);
    l.addTailorDeposit('t1', { date: '2026-02-01', amount: 50000 });
    l.saveTailorOrder({ ...d, currency: 'USD', garments: [{ description: 'g', qty: 1, price: 1000 }] });
    const i = l.deliverTailorOrder('t1', { date: '2026-02-02' });
    console.log('E tailor', i.total, i.paid, partyBalance(l.state, 'c'));
  });
  it('composite with expiry component', () => {
    const l = shop();
    l.saveItem({ id: 'milk', code: 'M', name: 'milk', kind: 'stock', unit: 'l', price: 0, priceCurrency: 'SYP', trackExpiry: true } as any);
    l.saveItem({ id: 'cof', code: 'C', name: 'coffee', kind: 'composite', unit: 'cup', price: 100, priceCurrency: 'SYP', recipe: [{ itemId: 'milk', qty: 1 }] } as any);
    l.postInvoice({ kind: 'purchase', date: '2026-01-02', partyId: 's', lines: [{ itemId: 'milk', qty: 10, price: 10, expiry: '2026-03-01' }] });
    l.postInvoice({ kind: 'sale', date: '2026-01-03', lines: [{ itemId: 'cof', qty: 4, price: 100 }] });
    console.log('F comp', JSON.stringify(l.state.stock['milk']));
    let err=''; try { l.postInvoice({ kind: 'sale_return', date: '2026-01-04', lines: [{ itemId: 'cof', qty: 1, price: 100 }] }); } catch (e: any) { err = e.message; }
    console.log('F2 return composite', err);
  });
  it('production manual inputs negative / service', () => {
    const l = shop();
    l.saveItem({ id: 'sv', code: 'S', name: 'svc', kind: 'service', unit: 'x', price: 0, priceCurrency: 'SYP' } as any);
    l.postInvoice({ kind: 'purchase', date: '2026-01-02', partyId: 's', lines: [{ itemId: 'w', qty: 10, price: 100 }] });
    let err=''; try { l.postProduction({ date: '2026-01-03', outputs: [{ itemId: 'w', qty: 1 }], inputs: [{ itemId: 'w', qty: -5 }] }); } catch (e: any) { err = e.message; }
    console.log('G prod neg', err, JSON.stringify(l.state.stock['w']));
    err=''; try { l.postProduction({ date: '2026-01-03', outputs: [{ itemId: 'w', qty: 1 }], inputs: [{ itemId: 'sv', qty: 1 }] }); } catch (e: any) { err = e.message; }
    console.log('G2 prod svc', err, JSON.stringify(l.state.stock['sv']));
  });
  it('void opening balance stock + tailor deposit void after delivery', () => {
    const l = shop();
    const r = l.postOpeningBalances({ date: '2026-01-01', accounts: [{ accountId: '1101', debit: 5000 }] });
    console.log('H opening entry source', r.entry?.source);
  });
});
