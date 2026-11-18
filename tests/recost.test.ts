import { afterEach, describe, expect, it } from 'vitest';
import { ACTIVITIES, DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, dailyProfit, defaultTaxes, invoiceProfit, trialBalance } from '../src/core';
import { SYSTEM_ACCOUNTS } from '../src/core/chart-templates';
import { StockPlanner } from '../src/core/stock';

// التصحيح التلقائي للتكاليف: بيانات انسجّلت بالنسخ القديمة (البيع بالسالب بتكلفة صفر، والشراء بعده بتكلفة مضاعفة)
// بتتصحّح لحالها، وكل الإحصائيات بتطابق بعضها، والتصحيح ما بيتكرر.
const D1 = '2026-11-10';
const D2 = '2026-11-11';
const origIn = StockPlanner.prototype.in;
/** متل النسخ قبل 1.2.82: الشراء ما بيغطّي الرصيد السالب */
const oldVersion = () => {
  StockPlanner.prototype.in = function (this: StockPlanner, ...a: Parameters<typeof origIn>) {
    const [itemId, wh, qty, cost, opts] = a;
    return origIn.call(this, itemId, wh, qty, cost, { ...(opts ?? {}), fillShortage: false });
  } as typeof origIn;
};
afterEach(() => {
  StockPlanner.prototype.in = origIn;
});

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.updateCompany({ ...l.state.info!, allowNegativeStock: true });
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveParty({ id: 's', kind: 'supplier', name: 'مورد' });
  l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'USD' });
  return l;
}
const gross = (l: Ledger, d: string) => dailyProfit(l.state, d, d)[0]?.gross ?? 0;
const consistent = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  const stockValue = Object.values(l.state.stock).reduce((s, x) => s + x.value, 0);
  expect(accountBalance(l.state, SYSTEM_ACCOUNTS.inventory).balance).toBe(stockValue);
};

describe('automatic cost correction', () => {
  it('fixes data recorded by the old versions: profits per invoice and per day become right', () => {
    oldVersion();
    const l = shop();
    l.autoRecost = false; // منحاكي البيانات القديمة (قبل التصحيح التلقائي)
    const s1 = l.postInvoice({ kind: 'sale', date: D1, partyId: 'c', lines: [{ itemId: 'a', qty: 5, price: 1000 }] });
    l.postInvoice({ kind: 'purchase', date: D2, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    const s2 = l.postInvoice({ kind: 'sale', date: D2, partyId: 'c', lines: [{ itemId: 'a', qty: 5, price: 1000 }] });
    // الغلط القديم: الأولى ربح 100%، والتانية خسارة
    expect(invoiceProfit(l.state, s1).profit).toBe(5000);
    expect(invoiceProfit(l.state, s2).profit).toBe(-1000);
    StockPlanner.prototype.in = origIn;
    l.autoRecost = true;

    expect(l.recalculateCosts()).toBeGreaterThan(0);
    expect(invoiceProfit(l.state, l.state.invoices.find((i) => i.id === s1.id)!).profit).toBe(2000);
    expect(invoiceProfit(l.state, l.state.invoices.find((i) => i.id === s2.id)!).profit).toBe(2000);
    expect(gross(l, D1)).toBe(2000);
    expect(gross(l, D2)).toBe(2000);
    expect(l.state.stock['a']).toMatchObject({ totalQty: 0, value: 0 });
    consistent(l);
    // مرة تانية: ما في شي يتصحّح
    expect(l.recalculateCosts()).toBe(0);
  });

  it('moves the cost booked on the purchase day (new versions) back to the sale day', () => {
    const l = shop();
    const s1 = l.postInvoice({ kind: 'sale', date: D1, partyId: 'c', lines: [{ itemId: 'a', qty: 4, price: 1000 }] });
    l.postInvoice({ kind: 'purchase', date: D2, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 700 }] });
    // من 1.2.87 التصحيح بيصير فوراً مع الشراء، مش بس لما تنفتح الشركة
    expect(gross(l, D1)).toBe(4 * 300);
    expect(gross(l, D2)).toBe(0);
    expect(invoiceProfit(l.state, l.state.invoices.find((i) => i.id === s1.id)!).profit).toBe(1200);
    expect(l.state.stock['a']).toMatchObject({ totalQty: 6, value: 4200 });
    consistent(l);
    expect(l.recalculateCosts()).toBe(0);
  });

  it('a corrected invoice can still be deleted or edited, and everything stays balanced', () => {
    oldVersion();
    const l = shop();
    const s1 = l.postInvoice({ kind: 'sale', date: D1, partyId: 'c', lines: [{ itemId: 'a', qty: 5, price: 1000 }] });
    l.postInvoice({ kind: 'purchase', date: D2, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    StockPlanner.prototype.in = origIn;
    l.recalculateCosts();
    l.deleteInvoice(s1.id, D2);
    consistent(l);
    expect(gross(l, D1)).toBe(0);
    l.recalculateCosts();
    consistent(l);
    expect(l.state.stock['a']).toMatchObject({ totalQty: 10, value: 6000 });
    const s3 = l.postInvoice({ kind: 'sale', date: D2, partyId: 'c', lines: [{ itemId: 'a', qty: 2, price: 1000 }] });
    l.replaceInvoice(s3.id, { kind: 'sale', date: D2, partyId: 'c', lines: [{ itemId: 'a', qty: 3, price: 1000 }] } as never);
    expect(l.recalculateCosts()).toBe(0);
    consistent(l);
  });

  it('damage before buying and normal shops are left as they are', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D1, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    l.postInvoice({ kind: 'sale', date: D1, partyId: 'c', lines: [{ itemId: 'a', qty: 3, price: 1000 }] });
    l.adjustStock({ kind: 'damage', date: D2, lines: [{ itemId: 'a', qty: 1 }] });
    l.postInvoice({ kind: 'sale_return', date: D2, partyId: 'c', lines: [{ itemId: 'a', qty: 1, price: 1000 }] });
    expect(l.recalculateCosts()).toBe(0);
    consistent(l);
  });

  it('leaves correct data alone (demo company of every activity)', () => {
    for (const a of Object.keys(ACTIVITIES)) {
      const l = new Ledger(() => {});
      l.createCompany({ name: 'x', activity: a as never, baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor(a as never), defaultTaxes());
      l.loadDemoData();
      expect(l.recalculateCosts(), a).toBe(0);
    }
  });
});

describe('one-time repair of old data', () => {
  it('closes a gap between the inventory account and the real stock value (left by old versions)', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D1, partyId: 's', lines: [{ itemId: 'a', qty: 10, price: 600 }] });
    // نسخة قديمة كانت تخلّي حساب المخزون أعلى من قيمة البضاعة
    l.postEntry({ date: D1, memo: 'خطأ قديم', lines: [{ accountId: SYSTEM_ACCOUNTS.inventory, debit: 838 }, { accountId: SYSTEM_ACCOUNTS.cogs, credit: 838 }] });
    expect(l.repairInventoryGap(D2)).toBe(838);
    consistent(l);
    expect(l.repairInventoryGap(D2)).toBe(0);
  });
});
