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
