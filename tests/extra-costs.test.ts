import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, SYSTEM_ACCOUNTS, accountBalance, chartFor, defaultTaxes, healthCheck, invoiceProfit, partyBalance, trialBalance } from '../src/core';
import { costPlan } from '../src/core/recost';

// التكاليف الإضافية بفاتورة الشراء (نقل، شحن، جمركة): بتنوزّع على المواد وبتدخل بتكلفتها

const D = '2026-11-21';
function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 's', kind: 'supplier', name: 'المورد' });
  l.saveParty({ id: 'ship', kind: 'supplier', name: 'شركة الشحن' });
  l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
  l.saveItem({ id: 'a', code: 'A', name: 'براد', kind: 'stock', unit: 'قطعة', price: 50000, priceCurrency: 'USD' });
  l.saveItem({ id: 'b', code: 'B', name: 'غسالة', kind: 'stock', unit: 'قطعة', price: 30000, priceCurrency: 'USD' });
  l.saveItem({ id: 'svc', code: 'S', name: 'تركيب', kind: 'service', unit: 'خدمة', price: 1000, priceCurrency: 'USD' });
  return l;
}
const consistent = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(accountBalance(l.state, SYSTEM_ACCOUNTS.inventory).balance).toBe(Object.values(l.state.stock).reduce((s, x) => s + x.value, 0));
  expect(costPlan(l.state).lines).toHaveLength(0);
  expect(healthCheck(l.state).issues.filter((i) => i.level === 'error')).toEqual([]);
};

describe('extra costs on a purchase invoice', () => {
  it('split by value, paid from the cash box: item costs go up, supplier owes only the goods', () => {
    const l = shop();
    // براد 2 × 300 = 600، غسالة 4 × 100 = 400، والشحن 100 من الصندوق
    const inv = l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 2, price: 30000 }, { itemId: 'b', qty: 4, price: 10000 }], extras: [{ amount: 10000, split: 'value', pay: 'cash', cashAccountId: '1101', memo: 'شحن' }] });
    expect(inv.lines.map((x) => x.cost)).toEqual([66000, 44000]);
    expect(inv.lines.map((x) => x.extra)).toEqual([6000, 4000]);
    expect(l.state.stock['a']).toMatchObject({ totalQty: 2, value: 66000, lastCost: 33000 });
    expect(partyBalance(l.state, 's').base).toBe(-100000); // علينا للمورد البضاعة بس
    expect(accountBalance(l.state, '1101').balance).toBe(-10000);
    expect(inv.extras).toEqual([{ amount: 10000, split: 'value', pay: 'cash', cashAccountId: '1101', memo: 'شحن' }]);
    // البيع بعدها بالتكلفة الجديدة
    const sale = l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: [{ itemId: 'a', qty: 1, price: 50000 }] });
    expect(invoiceProfit(l.state, sale)).toMatchObject({ cost: 33000, profit: 17000 });
    consistent(l);
  });

  it('split by quantity, owed to a shipping company; services do not take a share', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 1, price: 30000 }, { itemId: 'b', qty: 3, price: 10000 }, { itemId: 'svc', qty: 1, price: 2000 }], extras: [{ amount: 8000, split: 'qty', pay: 'party', partyId: 'ship' }] });
    expect(inv.lines.map((x) => x.extra ?? 0)).toEqual([2000, 6000, 0]);
    expect(partyBalance(l.state, 'ship').base).toBe(-8000);
    expect(partyBalance(l.state, 's').base).toBe(-62000);
    consistent(l);
  });

  it('on the supplier himself: he is owed goods + extra', () => {
    const l = shop();
    l.postInvoice({ kind: 'purchase', date: D, partyId: 's', paid: 0, lines: [{ itemId: 'a', qty: 1, price: 30000 }], extras: [{ amount: 1500, split: 'value', pay: 'supplier' }] });
    expect(partyBalance(l.state, 's').base).toBe(-31500);
    expect(l.state.stock['a']!.value).toBe(31500);
    consistent(l);
  });

  it('void and edit undo the extra costs exactly', () => {
    const l = shop();
    const inv = l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 2, price: 30000 }], extras: [{ amount: 4000, split: 'value', pay: 'party', partyId: 'ship' }] });
    // تعديل السعر والتكلفة الإضافية (نفس البضاعة)
    const edited = l.replaceInvoice(inv.id, { kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'a', qty: 2, price: 31000 }], extras: [{ amount: 6000, split: 'value', pay: 'party', partyId: 'ship' }] });
    expect(l.state.stock['a']).toMatchObject({ totalQty: 2, value: 68000 });
    expect(partyBalance(l.state, 'ship').base).toBe(-6000);
    consistent(l);
    l.voidInvoice(edited.id, D);
    expect(l.state.stock['a']!.value).toBe(0);
    expect(partyBalance(l.state, 'ship').base).toBe(0);
    consistent(l);
  });

  it('rejects bad extra costs', () => {
    const l = shop();
    const line = [{ itemId: 'a', qty: 1, price: 30000 }];
    expect(() => l.postInvoice({ kind: 'sale', date: D, partyId: 'c', lines: line, extras: [{ amount: 100, split: 'value', pay: 'cash', cashAccountId: '1101' }] })).toThrow(/الشراء/);
    expect(() => l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: [{ itemId: 'svc', qty: 1, price: 100 }], extras: [{ amount: 100, split: 'value', pay: 'cash', cashAccountId: '1101' }] })).toThrow(/مادة/);
    expect(() => l.postInvoice({ kind: 'purchase', date: D, lines: line, extras: [{ amount: 100, split: 'value', pay: 'supplier' }] })).toThrow(/المورد/);
    expect(() => l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: line, extras: [{ amount: 100, split: 'value', pay: 'party' }] })).toThrow(/الجهة/);
    expect(() => l.postInvoice({ kind: 'purchase', date: D, partyId: 's', lines: line, extras: [{ amount: -5, split: 'value', pay: 'cash', cashAccountId: '1101' }] })).toThrow(/مبلغ/);
  });
});
