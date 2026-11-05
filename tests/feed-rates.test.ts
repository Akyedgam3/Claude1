import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, cleanFeedRates, defaultTaxes, findRate } from '../src/core';

function company(base: 'SYP' | 'USD') {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: base, fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  return l;
}
const feed = { date: '2026-11-05T09:00:00Z', values: { USD: 110, EUR: 120 } };

describe('automatic exchange rate from the admin panel', () => {
  it('records the dollar rate in a lira company, once', () => {
    const l = company('SYP');
    expect(l.applyFeedRates(feed)).toBe(1); // EUR مش معرّفة بالشركة
    expect(findRate(l.state, 'USD', '2026-11-05')).toBe(110);
    expect(l.applyFeedRates(feed)).toBe(0);
    expect(l.applyFeedRates({ ...feed, values: { USD: 112 } })).toBe(1);
    expect(findRate(l.state, 'USD', '2026-11-05')).toBe(112);
  });

  it('inverts for a dollar company', () => {
    const l = company('USD');
    l.applyFeedRates(feed);
    expect(findRate(l.state, 'SYP', '2026-11-05')).toBeCloseTo(1 / 110, 6);
  });

  it('a manual rate the same day wins, and the company can turn it off', () => {
    const l = company('SYP');
    l.setRate({ date: '2026-11-05', currency: 'USD', kind: 'market', rate: 115 });
    expect(l.applyFeedRates(feed)).toBe(0);
    expect(findRate(l.state, 'USD', '2026-11-05')).toBe(115);
    const m = company('SYP');
    m.updateCompany({ autoRates: false });
    expect(m.applyFeedRates(feed)).toBe(0);
  });

  it('cleans bad values', () => {
    expect(cleanFeedRates({ date: '2026-11-05', values: { USD: -1, eur: 3, SYP: 1 } })).toBeNull();
    expect(cleanFeedRates({ date: 'x', values: { USD: 1 } })).toBeNull();
    expect(cleanFeedRates({ date: '2026-11-05', values: { USD: 110, TRY: 3.2 } })?.values).toEqual({ USD: 110, TRY: 3.2 });
  });
});

import fs from 'node:fs';
import { RegistryCore } from '../admin/registry-core';
import { parseFeed } from '../src/license/license';
import { publicKeyFromPrivate } from '../src/license/format';

describe('admin panel publishes the rate inside the signed feed', () => {
  it('setRates → buildFeed → parseFeed → applyFeedRates', () => {
    const key = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
    const reg = new RegistryCore({ customers: [] }, key);
    expect(() => reg.setRates({ USD: '-3' })).toThrow();
    expect(() => reg.setRates({})).toThrow();
    reg.setRates({ USD: '11,000', EUR: '', TRY: 3.1 });
    expect(reg.rates?.values).toEqual({ USD: 11000, TRY: 3.1 });
    const feed = parseFeed(reg.buildFeed().text, publicKeyFromPrivate(key))!;
    expect(feed.rates?.values.USD).toBe(11000);
    const l = company('SYP');
    expect(l.applyFeedRates(cleanFeedRates(feed.rates))).toBe(1);
    expect(findRate(l.state, 'USD', feed.rates!.date.slice(0, 10))).toBe(11000);
    reg.setRates(null);
    expect(parseFeed(reg.buildFeed().text, publicKeyFromPrivate(key))!.rates).toBeUndefined();
  });
});
