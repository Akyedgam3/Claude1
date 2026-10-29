import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, bookingConflicts, bookingTotals, chartFor, defaultTaxes, partyBalance, trialBalance } from '../src/core';

function hall() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'صالة الأمير', activity: 'weddinghall', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('weddinghall'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'أحمد' });
  l.saveParty({ id: 'd', kind: 'customer', name: 'سامر' });
  return l;
}
const base = { hall: 'الصالة الكبرى', eventType: 'عرس', currency: 'SYP', status: 'confirmed' as const };

describe('wedding hall bookings', () => {
  it('books with services per guest, takes a deposit, and invoices the rest', () => {
    const l = hall();
    const b = l.saveBooking({ ...base, id: 'b', partyId: 'c', date: '2026-11-20', period: 'evening', guests: 300, lines: [{ id: '1', name: 'أجار الصالة', qty: 1, price: 1_500_000 }, { id: '2', name: 'ضيافة', perGuest: true, qty: 300, price: 7_500 }] });
    expect(bookingTotals(b).total).toBe(3_750_000);
    l.addBookingDeposit('b', { date: '2026-10-29', amount: 1_000_000 });
    expect(partyBalance(l.state, 'c').base).toBe(-1_000_000);
    const inv = l.invoiceBooking('b', { date: '2026-11-20' });
    expect(inv.total).toBe(3_750_000);
    expect(inv.paid).toBe(2_750_000);
    expect(inv.lines[1]!.description).toBe('ضيافة — 300 شخص');
    expect(partyBalance(l.state, 'c').base).toBe(0);
    expect(l.state.bookings!['b']!.status).toBe('invoiced');
    l.voidInvoice(inv.id, '2026-11-20');
    expect(l.state.bookings!['b']!.status).toBe('done');
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('refuses a double booking of the same hall and period, allows another period or hall', () => {
    const l = hall();
    l.saveBooking({ ...base, id: 'a', partyId: 'c', date: '2026-11-20', period: 'evening', lines: [] });
    expect(() => l.saveBooking({ ...base, id: 'x', partyId: 'd', date: '2026-11-20', period: 'evening', lines: [] })).toThrow(/محجوزة/);
    expect(() => l.saveBooking({ ...base, id: 'x', partyId: 'd', date: '2026-11-20', period: 'full', lines: [] })).toThrow(/محجوزة/);
    l.saveBooking({ ...base, id: 'm', partyId: 'd', date: '2026-11-20', period: 'morning', lines: [] });
    l.saveBooking({ ...base, id: 'g', partyId: 'd', hall: 'صالة الحديقة', date: '2026-11-20', period: 'evening', lines: [] });
    // الحجز الملغى بيفضّي الصالة
    l.saveBooking({ ...base, id: 'a', partyId: 'c', date: '2026-11-20', period: 'evening', status: 'cancelled', lines: [] });
    expect(bookingConflicts(l.state, { id: 'new', hall: base.hall, date: '2026-11-20', period: 'evening', status: 'confirmed' })).toEqual([]);
  });

  it('demo loads and balances', () => {
    const fresh = new Ledger(() => {});
    fresh.createCompany({ name: 'صالة', activity: 'weddinghall', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('weddinghall'), defaultTaxes());
    fresh.loadDemoData();
    const tb = trialBalance(fresh.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(Object.keys(fresh.state.bookings!).length).toBe(4);
  });
});

describe('hall extras', () => {
  it('whatsapp numbers and booking message', async () => {
    const { whatsappNumber, whatsappUrl, bookingMessage } = await import('../src/core');
    expect(whatsappNumber('0944 512 300')).toBe('963944512300');
    expect(whatsappNumber('+963 980 072 891')).toBe('963980072891');
    expect(whatsappNumber('00971501234567')).toBe('971501234567');
    expect(whatsappNumber('12')).toBeNull();
    expect(whatsappUrl('0944512300', 'مرحبا')).toBe('https://wa.me/963944512300?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7');
    const l = hall();
    const b = l.saveBooking({ ...base, id: 'b', partyId: 'c', date: '2026-11-20', period: 'evening', guests: 200, lines: [{ id: '1', name: 'أجار', qty: 1, price: 1_000_000 }] });
    const far = bookingMessage(l.state, b, { today: '2026-10-29', fmt: (m) => String(m / 100) });
    expect(far).toContain('تم تأكيد حجز عرس بـالصالة الكبرى يوم الجمعة 20/11/2026 (مسائي)');
    expect(far).toContain('قيمة الحجز: 10000');
    const near = bookingMessage(l.state, b, { today: '2026-11-19', withPrices: false });
    expect(near).toContain('بكرا');
    expect(near).not.toContain('قيمة');
  });

  it('records monthly expenses and lists them by item', async () => {
    const { monthExpenses } = await import('../src/core');
    const l = hall();
    l.postVoucher({ kind: 'payment', date: '2026-10-05', amount: 500_000, accountId: '5204', memo: 'مازوت المولدة: 50 ليتر' });
    l.postVoucher({ kind: 'payment', date: '2026-10-07', amount: 80_000, accountId: '5209', memo: 'قهوة' });
    const e = l.postVoucher({ kind: 'payment', date: '2026-10-08', amount: 30_000, accountId: '5209', memo: 'سكر' });
    l.voidEntry(e.id, '2026-10-08');
    l.postVoucher({ kind: 'payment', date: '2026-11-01', amount: 1, accountId: '5209', memo: 'شهر تاني' });
    const rows = monthExpenses(l.state, '2026-10');
    expect(rows.map((r) => [r.name, r.note, r.amount])).toEqual([['قهوة', '', 80_000], ['مازوت المولدة', '50 ليتر', 500_000]]);
  });
});
