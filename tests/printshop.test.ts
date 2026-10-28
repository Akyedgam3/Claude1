import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, invoiceProfit, partyBalance, printJobDeposits, printJobTotals, printLineText, printLineUnits, trialBalance } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'مكتبة ومطبعة', activity: 'printshop', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('printshop'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'مطعم السلطان' });
  l.saveItem({ id: 'flex', code: 'F', name: 'رول فلكس', kind: 'stock', unit: 'م²', price: 0, priceCurrency: 'SYP' });
  l.adjustStock({ kind: 'opening', date: '2026-10-01', lines: [{ itemId: 'flex', qty: 20, unitCost: 45_000 }] });
  return l;
}
const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
};

describe('print shop jobs', () => {
  it('prices flex by square metre, copies by page and cards by piece', () => {
    expect(printLineUnits({ kind: 'area', width: 3, height: 1.5, qty: 2 })).toBe(9);
    expect(printLineUnits({ kind: 'pages', pages: 120, qty: 3 })).toBe(360);
    expect(printLineUnits({ kind: 'count', qty: 4 })).toBe(4);
    expect(printLineText({ id: 'x', kind: 'area', name: 'فلكس', width: 3, height: 1.5, qty: 2, price: 1 })).toBe('فلكس (3 × 1.5 م) × 2');
    expect(printLineText({ id: 'x', kind: 'pages', name: 'تصوير ملون', pages: 20, qty: 5, price: 1 })).toBe('تصوير ملون — 20 صفحة × 5 نسخ');
  });

  it('a flex job with deposit: invoice deducts the deposit and consumes the flex roll once', () => {
    const l = shop();
    const j = l.savePrintJob({
      id: 'j',
      partyId: 'c',
      date: '2026-10-20',
      due: '2026-10-23',
      title: 'آرمة',
      status: 'printing',
      currency: 'SYP',
      lines: [{ id: 'a', kind: 'area', name: 'فلكس', width: 4, height: 1.5, qty: 1, price: 120_000, material: { itemId: 'flex', qty: 6.4 } }],
      extras: [{ description: 'تصميم', amount: 200_000 }],
    });
    expect(j.number).toBe(1);
    expect(printJobTotals(j).total).toBe(6 * 120_000 + 200_000);
    l.addPrintDeposit('j', { date: '2026-10-20', amount: 500_000 });
    expect(printJobDeposits(l.state, l.state.printJobs!['j']!)).toBe(500_000);
    const inv = l.deliverPrintJob('j', { date: '2026-10-23' });
    expect(inv.total).toBe(920_000);
    expect(inv.paid).toBe(420_000);
    expect(inv.lines[0]!.description).toBe('فلكس (4 × 1.5 م)');
    expect(partyBalance(l.state, 'c').base).toBe(0);
    expect(l.state.stock['flex']!.totalQty).toBeCloseTo(13.6);
    expect(invoiceProfit(l.state, inv).cost).toBe(Math.round(6.4 * 45_000));
    expect(l.state.printJobs!['j']).toMatchObject({ status: 'invoiced', invoiceId: inv.id });
    expect(() => l.savePrintJob({ ...l.state.printJobs!['j']!, status: 'ready' })).toThrow(/مفوتر/);
    // إلغاء الفاتورة بيرجّع الطلب، والمواد ما بتنصرف مرة تانية
    l.voidInvoice(inv.id, '2026-10-23');
    expect(l.state.printJobs!['j']!.status).toBe('delivered');
    l.deliverPrintJob('j', { date: '2026-10-24' });
    expect(l.state.stock['flex']!.totalQty).toBeCloseTo(13.6);
    balanced(l);
  });

  it('refuses to invoice when the flex roll is not enough', () => {
    const l = shop();
    l.savePrintJob({ id: 'j', partyId: 'c', date: '2026-10-20', status: 'new', currency: 'SYP', lines: [{ id: 'a', kind: 'area', name: 'فلكس', width: 5, height: 5, qty: 1, price: 1000, material: { itemId: 'flex', qty: 26 } }], extras: [] });
    expect(() => l.deliverPrintJob('j', { date: '2026-10-21' })).toThrow(/ما بيكفي/);
    expect(l.state.invoices.length).toBe(0);
  });

  it('demo loads and balances, with school kit and photocopy services', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'مكتبة', activity: 'printshop', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('printshop'), defaultTaxes());
    l.loadDemoData();
    balanced(l);
    expect(Object.keys(l.state.printJobs!).length).toBe(3);
    expect(l.state.items['p-kit1']!.kind).toBe('composite');
  });
});
