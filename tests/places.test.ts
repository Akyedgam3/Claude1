import { describe, expect, it } from 'vitest';
import { checkPlace, itemPlace, itemPlacesText, placesIn, withPlace } from '../src/core';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes } from '../src/core';

function newLedger() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'م', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  return l;
}

describe('أماكن المواد لكل مستودع', () => {
  it('المكان جديد/موجود ومين عليه، وبيتخزن لكل مستودع', () => {
    const l = newLedger();
    l.saveItem({ id: 'a', code: '1', name: 'A', kind: 'stock', unit: 'قطعة', price: 1, priceCurrency: 'SYP' });
    l.saveItem({ id: 'b', code: '2', name: 'B', kind: 'stock', unit: 'قطعة', price: 1, priceCurrency: 'SYP' });
    const wid = Object.keys(l.state.warehouses)[0]!;
    expect(checkPlace(l.state, wid, 'رف 1').state).toBe('new');
    l.saveItem(withPlace(l.state.items.a!, wid, 'رف 1'));
    expect(itemPlace(l.state.items.a!, wid)).toBe('رف 1');
    expect(checkPlace(l.state, wid, 'رف 1', 'b')).toMatchObject({ state: 'exists' });
    expect(checkPlace(l.state, wid, 'رف 1', 'b').items.map((i) => i.id)).toEqual(['a']);
    expect(placesIn(l.state, wid).has('رف 1')).toBe(true);
    expect(itemPlacesText(l.state, l.state.items.a!)).toBe('رف 1');
    l.saveItem(withPlace(l.state.items.a!, wid, ''));
    expect(itemPlace(l.state.items.a!, wid)).toBe('');
  });
  it('المكان القديم بيظهر بكل المستودعات', () => {
    expect(itemPlace({ location: 'رف 5' }, 'x')).toBe('رف 5');
    expect(itemPlace({ location: 'رف 5', locations: { x: 'ركن' } }, 'x')).toBe('ركن');
  });
});
