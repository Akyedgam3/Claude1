import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, alertsFor, applyEvent, chartFor, defaultTaxes, emptyState, fxDaySummary, fxQuote, healthCheck, partyBalance, trialBalance } from '../src/core';

// صرافة وحوالات: العملة الأساسية ليرة (خانتين)، الدولار شراء 130 ومبيع 132 (بالليرة الجديدة)
const T = '2026-11-25';
function shop(events?: unknown[]) {
  const l = new Ledger((e) => events?.push(e));
  l.createCompany({ name: 'صرافة الأمانة', activity: 'exchange', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, [...DEFAULT_CURRENCIES, { code: 'EUR', nameAr: 'يورو', symbol: '€', decimals: 2 }], chartFor('exchange'), defaultTaxes());
  l.saveFxBoard([{ currency: 'USD', buy: 130, sell: 132 }, { currency: 'EUR', buy: 140, sell: 143 }], T);
  return l;
}
const ok = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(healthCheck(l.state).issues.filter((i) => i.level === 'error')).toEqual([]);
};

describe('exchange desk (الصرافة)', () => {
  it('board sets the mid rate, quotes buy/sell/cross', () => {
    const l = shop();
    expect(l.rateFor('USD', T)).toBe(131);
    expect(fxQuote(l.state, 'USD', 'SYP', 100)).toEqual({ amount: 13000, rate: 130 }); // الزبون بيبيعنا 100$
    expect(fxQuote(l.state, 'SYP', 'USD', 13200)!.amount).toBeCloseTo(100); // الزبون بيشتري 100$
    expect(fxQuote(l.state, 'EUR', 'USD', 100)!.amount).toBeCloseTo((100 * 140) / 132); // يورو بدولار
    expect(() => l.saveFxBoard([{ currency: 'USD', buy: 133, sell: 132 }], T)).toThrow(/أعلى من المبيع/);
  });

  it('buy and sell dollars: boxes move, spread is profit, void returns everything', () => {
    const l = shop();
    // راس مال: ليرة ودولار بالصناديق
    l.fillBox({ date: T, to: '1101', amount: 5_000_000 });
    l.fillBox({ date: T, to: l.currencyBox('USD'), amount: 100_00, currency: 'USD' });
    // الزبون باعنا 100$ بـ 13,000 ل.س (الوسط 13,100 ← ربح 100)
    const buy = l.postFx({ date: T, give: { currency: 'USD', amount: 100_00 }, take: { currency: 'SYP', amount: 13_000_00 }, customer: 'أبو محمد' });
    expect(buy.side).toBe('buy');
    expect(buy.profit).toBe(100_00);
    // زبون اشترى 50$ بـ 6,600 ل.س (الوسط 6,550 ← ربح 50)
    const sell = l.postFx({ date: T, give: { currency: 'SYP', amount: 6_600_00 }, take: { currency: 'USD', amount: 50_00 } });
    expect(sell.side).toBe('sell');
    expect(sell.profit).toBe(50_00);
    expect(accountBalance(l.state, l.currencyBox('USD')).balance).toBe(150_00 * 131); // بالليرة
    expect(accountBalance(l.state, '4301').balance).toBe(-150_00); // إيراد دائن
    expect(fxDaySummary(l.state, T)).toMatchObject({ deals: 2, profit: 150_00, bought: { USD: 100_00, SYP: 6_600_00 }, sold: { SYP: 13_000_00, USD: 50_00 } });
    // يورو بدولار: صندوق اليورو بينعمل لحالو
    l.postFx({ date: T, give: { currency: 'EUR', amount: 100_00 }, take: { currency: 'USD', amount: 106_00 } });
    expect(l.state.accounts[l.currencyBox('EUR')]!.name).toBe('صندوق يورو');
    ok(l);
    l.voidFx(buy.id, T);
    expect(l.state.fxDeals![buy.id]!.voided).toBe(true);
    expect(fxDaySummary(l.state, T).deals).toBe(2);
    expect(() => l.voidFx(buy.id, T)).toThrow(/ملغاة/);
    ok(l);
    expect(alertsFor(l.state, '2026-11-26').map((a) => a.id)).toContain('fxboard-old');
  });

  it('remittances: outgoing owes the office, incoming pays out, fees are revenue, cancel refunds', () => {
    const l = shop();
    l.saveParty({ id: 'office', kind: 'both', name: 'مكتب الهرم - حلب' });
    l.fillBox({ date: T, to: '1101', amount: 5_000_000 });
    const out = l.saveRemittance({ direction: 'out', date: T, sender: 'أحمد', receiver: 'خالد', receiverPhone: '0944', destination: 'حلب', correspondentId: 'office', amount: 1_000_000, currency: 'SYP', fee: 10_000 });
    expect(out.status).toBe('pending');
    expect(out.code).toMatch(/^\d{6}$/);
    expect(accountBalance(l.state, '4201').balance).toBe(-10_000);
    // المكتب إلو علينا المبلغ
    expect(partyBalance(l.state, 'office').base).toBe(-1_000_000);
    l.deliverRemittance(out.id, T);
    expect(l.state.remittances![out.id]!.status).toBe('delivered');
    expect(() => l.cancelRemittance(out.id, T)).toThrow(/المعلّقة/);

    // واردة: معلّقة بلا حركة، وبالتسليم بتطلع من الصندوق على حساب المكتب + عمولتنا منه
    const inc = l.saveRemittance({ direction: 'in', date: T, sender: 'سامر (ألمانيا)', receiver: 'أم سامر', correspondentId: 'office', amount: 200_00, currency: 'USD', fee: 2_00 });
    expect(inc.entryId).toBeUndefined();
    expect(alertsFor(l.state, T).map((a) => a.id)).toContain('remits-waiting');
    l.fillBox({ date: T, to: l.currencyBox('USD'), amount: 500_00, currency: 'USD' });
    l.deliverRemittance(inc.id, T);
    expect(accountBalance(l.state, l.currencyBox('USD')).balance).toBe(300_00 * 131);
    ok(l);

    // إلغاء صادرة معلّقة: المصاري بترجع
    const o2 = l.saveRemittance({ direction: 'out', date: T, sender: 'أحمد', receiver: 'رامي', correspondentId: 'office', amount: 500_000, currency: 'SYP', fee: 5_000 });
    l.cancelRemittance(o2.id, T);
    expect(l.state.remittances![o2.id]!.status).toBe('cancelled');
    expect(accountBalance(l.state, '4201').balance).toBe(-(10_000 + 2_00 * 131));
    ok(l);
  });

  it('rebuilds the same from events', () => {
    const events: unknown[] = [];
    const l = shop(events);
    l.saveParty({ id: 'office', kind: 'both', name: 'مكتب' });
    l.postFx({ date: T, give: { currency: 'USD', amount: 100_00 }, take: { currency: 'SYP', amount: 13_000_00 } });
    l.saveRemittance({ direction: 'in', date: T, sender: 'أ', receiver: 'ب', correspondentId: 'office', amount: 100, currency: 'SYP', fee: 0, code: 'ABC123' });
    const replay = emptyState();
    for (const e of events) applyEvent(replay, structuredClone(e) as never);
    expect(replay.fxDeals).toEqual(l.state.fxDeals);
    expect(replay.remittances).toEqual(l.state.remittances);
    expect(replay.fxBoard).toEqual(l.state.fxBoard);
  });
});
