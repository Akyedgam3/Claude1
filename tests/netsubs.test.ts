import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, applyEvent, emptyState, addMonthsIso, alertsFor, chartFor, defaultTaxes, healthCheck, netSubStatus, netSubsSummary, partyBalance, trialBalance } from '../src/core';

// «الاشتراكات» لمحلات الإنترنت: مشترك بباقة وسعر شهري، التجديد فاتورة بالأشهر وبيمدّد «مدفوع لحد»
function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل إنترنت', activity: 'mobile', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('mobile'), defaultTaxes());
  l.saveParty({ id: 'p', kind: 'customer', name: 'أبو أحمد', phone: '0944000000' });
  return l;
}
const ok = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(healthCheck(l.state).issues.filter((i) => i.level === 'error')).toEqual([]);
};

describe('internet subscriptions (الاشتراكات)', () => {
  it('month math keeps the day and clamps short months', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-11-25', 1)).toBe('2026-12-25');
    expect(addMonthsIso('2026-11-25', 3)).toBe('2027-02-25');
  });

  it('subscriber status, renew = sale invoice + extend, partial pay = debt, alerts', () => {
    const l = shop();
    const s = l.saveNetSub({ id: 's', partyId: 'p', plan: '4 ميغا', price: 2500000, currency: 'SYP', months: 1, start: '2026-10-20', paidUntil: '2026-11-20', username: 'ahmad1', ip: '10.0.0.5' });
    expect(s.number).toBe(1);
    expect(netSubStatus(s, '2026-11-25')).toEqual({ state: 'expired', days: -5 });
    expect(netSubStatus(s, '2026-11-18').state).toBe('soon');
    expect(netSubStatus(s, '2026-11-01').state).toBe('active');
    expect(alertsFor(l.state, '2026-11-25').map((a) => a.id)).toContain('netsubs-expired');

    // خلص من 5 أيام: التجديد بيبلّش من يوم الدفع
    const { sub, invoice } = l.renewNetSub('s', { date: '2026-11-25', months: 1, paid: 2500000 });
    expect(invoice.total).toBe(2500000);
    expect(invoice.lines[0]!.description).toContain('4 ميغا');
    expect(sub.paidUntil).toBe('2026-12-25');
    expect(netSubStatus(sub, '2026-11-25').state).toBe('active');
    expect(alertsFor(l.state, '2026-11-25').map((a) => a.id)).not.toContain('netsubs-expired');

    // لسا ما خلص: التجديد بيكمّل من آخر يوم مدفوع، 3 أشهر ودفع نصها = دين
    const r2 = l.renewNetSub('s', { date: '2026-12-20', months: 3, paid: 3750000 });
    expect(r2.sub.paidUntil).toBe('2027-03-25');
    expect(r2.invoice.total).toBe(7500000);
    expect(partyBalance(l.state, 'p').base).toBe(3750000);
    expect(l.state.netSubs!['s']!.renewals).toHaveLength(2);

    expect(netSubsSummary(l.state, '2026-12-20')).toMatchObject({ total: 1, expired: 0, monthly: { SYP: 2500000 } });
    // موقوف: ما بيدخل بالملخص ولا بالتنبيهات
    l.saveNetSub({ ...l.state.netSubs!['s']!, stopped: true });
    expect(netSubsSummary(l.state, '2028-01-01').total).toBe(0);
    expect(alertsFor(l.state, '2028-01-01').map((a) => a.id)).not.toContain('netsubs-expired');
    ok(l);

    // الحذف ما بيمس الفواتير
    l.deleteNetSub('s');
    expect(l.state.netSubs!['s']).toBeUndefined();
    expect(l.state.invoices).toHaveLength(2);
    ok(l);
  });

  it('rebuilds the same from events', () => {
    const events: unknown[] = [];
    const l = new Ledger((e) => events.push(e));
    l.createCompany({ name: 'محل', activity: 'mobile', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('mobile'), defaultTaxes());
    l.saveParty({ id: 'p', kind: 'customer', name: 'أبو أحمد' });
    l.setRate({ date: '2026-01-01', currency: 'USD', kind: 'market', rate: 120 });
    l.saveNetSub({ id: 's', partyId: 'p', plan: 'فضائي 10 ميغا', price: 100, currency: 'USD', months: 1, start: '2026-11-01' });
    l.renewNetSub('s', { date: '2026-11-01', paid: 100 });
    const replay = emptyState();
    for (const e of events) applyEvent(replay, structuredClone(e) as never);
    expect(replay.netSubs).toEqual(l.state.netSubs);
  });
});
