import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, hasFeature, partyBalance, permissionFor, siteJobRooms, siteJobTotals, siteLineMeters, trialBalance, type SiteJobDraft } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'ورشة جبسين', activity: 'gypsum', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('gypsum'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'أبو حسن', phone: '0944 210 330' });
  return l;
}

const L = (room: string, name: string, kind: 'area' | 'length' | 'count', length: number, width?: number, factor = 1) => ({ id: `${room}${name}${length}`, room, name, kind, length, ...(width ? { width } : {}), factor });
// الكشف الورقي تبع الصالون: 5.50×3.94 + 6.2×3.99 + مرد جالس 68÷2 + مرد لف 29
const draft = (over: Partial<SiteJobDraft> = {}): SiteJobDraft => ({
  id: 'j1',
  partyId: 'c',
  date: '2026-02-01',
  title: 'بيت أبو حسن',
  status: 'survey',
  currency: 'SYP',
  rate: 50000, // 500.00 ل.س للمتر
  lines: [L('صالون', 'سقف', 'area', 5.5, 3.94), L('صالون', 'سقف', 'area', 6.2, 3.99), L('صالون', 'مرد جالس', 'length', 68, undefined, 0.5), L('صالون', 'مرد لف', 'length', 29), L('مطبخ', 'سقف', 'area', 5.32, 3.73)],
  extras: [{ description: 'إنارة مخفية', amount: 200000 }],
  ...over,
});

describe('site jobs (gypsum)', () => {
  it('has its own activity, feature and permissions', () => {
    expect(hasFeature('gypsum', 'sitejobs')).toBe(true);
    expect(hasFeature('tailor', 'sitejobs')).toBe(false);
    expect(permissionFor('saveSiteJob', [])).toBe('sitejobs.manage');
    expect(permissionFor('addSiteJobDeposit', [])).toBe('vouchers.create');
    expect(permissionFor('deliverSiteJob', [])).toBe('sales.create');
  });

  it('measures rooms exactly like the paper sheet', () => {
    expect(siteLineMeters(L('صالون', 'سقف', 'area', 5.5, 3.94))).toBe(21.67);
    expect(siteLineMeters(L('صالون', 'مرد جالس', 'length', 68, undefined, 0.5))).toBe(34);
    const rooms = siteJobRooms(draft());
    expect(rooms.map((r) => r.room)).toEqual(['صالون', 'مطبخ']);
    expect(rooms[0]!.meters).toBe(21.67 + 24.74 + 34 + 29);
    expect(rooms[1]!.meters).toBe(19.84);
    const t = siteJobTotals({ ...draft(), costs: [{ description: 'مواد', amount: 1000000 }] });
    expect(t.meters).toBe(129.25);
    expect(t.total).toBe(Math.round(129.25 * 50000) + 200000);
    expect(t.profit).toBe(t.total - 1000000);
  });

  it('takes deposits, invoices against the rest, and the customer history keeps it', () => {
    const l = shop();
    const j = l.saveSiteJob(draft());
    expect(j.number).toBe(1);
    l.addSiteJobDeposit('j1', { date: '2026-02-02', amount: 3000000 });
    expect(partyBalance(l.state, 'c').base).toBe(-3000000);
    const inv = l.deliverSiteJob('j1', { date: '2026-02-20' });
    const total = siteJobTotals(l.state.siteJobs['j1']!).total;
    expect(inv.total).toBe(total);
    expect(inv.lines).toHaveLength(6);
    expect(inv.lines[2]!.description).toContain('مرد جالس');
    expect(inv.lines[2]!.qty).toBe(34);
    // دفع الباقي كله: ما ضل على الزبون شي
    expect(partyBalance(l.state, 'c').base).toBe(0);
    expect(l.state.siteJobs['j1']!.status).toBe('invoiced');
    expect(() => l.saveSiteJob(draft({ status: 'done' }))).toThrow(/مفوتر/);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(accountBalance(l.state, '1101').balance).toBe(total);
    // إلغاء الفاتورة بيرجّع المشروع منجز لتعديله
    l.voidInvoice(inv.id, '2026-02-21');
    expect(l.state.siteJobs['j1']!.status).toBe('done');
    expect(l.state.siteJobs['j1']!.invoiceId).toBeUndefined();
  });

  it('rejects bad measurements and protects deposits', () => {
    const l = shop();
    expect(() => l.saveSiteJob(draft({ lines: [L('صالون', 'سقف', 'area', 5, undefined)] }))).toThrow(/العرض/);
    expect(() => l.saveSiteJob(draft({ lines: [L('', 'سقف', 'length', 5)] }))).toThrow(/الغرفة/);
    l.saveSiteJob(draft());
    l.addSiteJobDeposit('j1', { date: '2026-02-02', amount: 100000 });
    expect(() => l.saveSiteJob(draft({ status: 'cancelled' }))).toThrow(/دفعات/);
    expect(() => l.saveSiteJob(draft({ currency: 'USD' }))).toThrow(/دفعات/);
  });

  it('loads demo data with the paper job already invoiced', () => {
    const l = shop();
    l.state.parties = {};
    l.loadDemoData();
    const jobs = Object.values(l.state.siteJobs);
    expect(jobs).toHaveLength(3);
    expect(jobs.find((j) => j.id === 'sj-1')!.status).toBe('invoiced');
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });
});

describe('editing invoices', () => {
  it('replaces an invoice under the same number, atomically', () => {
    const l = shop();
    l.saveItem({ id: 'b', code: 'B1', name: 'لوح جبس', kind: 'stock', unit: 'لوح', price: 1000, priceCurrency: 'SYP' });
    l.adjustStock({ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'b', qty: 10, unitCost: 600 }] });
    const inv = l.postInvoice({ kind: 'sale', date: '2026-02-01', partyId: 'c', lines: [{ itemId: 'b', description: 'لوح جبس', qty: 2, price: 1000 }], paid: 0 });
    expect(l.state.stock['b']!.totalQty).toBe(8);
    const fixed = l.replaceInvoice(inv.id, { kind: 'sale', date: '2026-02-01', partyId: 'c', lines: [{ itemId: 'b', description: 'لوح جبس', qty: 3, price: 1000 }], paid: 0 });
    expect(fixed.number).toBe(inv.number);
    expect(fixed.replaces).toBe(inv.id);
    expect(l.state.invoices.find((i) => i.id === inv.id)!.voidEntryId).toBeTruthy();
    expect(l.state.stock['b']!.totalQty).toBe(7);
    expect(partyBalance(l.state, 'c').base).toBe(3000);
    // تعديل بيفشل (كمية أكتر من الموجود): ولا شي بيتغيّر
    const before = l.state.invoices.length;
    expect(() => l.replaceInvoice(fixed.id, { kind: 'sale', date: '2026-02-01', partyId: 'c', lines: [{ itemId: 'b', description: 'لوح جبس', qty: 50, price: 1000 }], paid: 0 })).toThrow();
    expect(l.state.invoices.length).toBe(before);
    expect(l.state.invoices.find((i) => i.id === fixed.id)!.voidEntryId).toBeUndefined();
    expect(l.state.stock['b']!.totalQty).toBe(7);
    // الفاتورة الملغاة ما بتتعدّل، والجديدة بتاخد الرقم الجاي
    expect(() => l.replaceInvoice(inv.id, { kind: 'sale', date: '2026-02-01', lines: [] })).toThrow(/ملغاة/);
    expect(l.postInvoice({ kind: 'sale', date: '2026-02-02', lines: [{ itemId: null, description: 'خدمة', qty: 1, price: 500 }] }).number).toBe(inv.number + 1);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });
});
