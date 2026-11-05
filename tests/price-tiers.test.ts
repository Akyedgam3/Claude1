import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, tierPrice } from '../src/core';

describe('customer types: retail / wholesale / bulk / agent', () => {
  const item = { price: 1000, wholesalePrice: 900, bulkPrice: 850, agentPrice: 800 };
  it('each type gets its own price', () => {
    expect(tierPrice(item, undefined)).toBe(1000);
    expect(tierPrice(item, 'retail')).toBe(1000);
    expect(tierPrice(item, 'wholesale')).toBe(900);
    expect(tierPrice(item, 'bulk')).toBe(850);
    expect(tierPrice(item, 'agent')).toBe(800);
  });
  it('an empty price falls back to the type before it', () => {
    expect(tierPrice({ price: 1000, wholesalePrice: 900 }, 'agent')).toBe(900);
    expect(tierPrice({ price: 1000 }, 'bulk')).toBe(1000);
    expect(tierPrice({ price: 1000, specialPrice: 700 }, 'special')).toBe(700);
  });
  it('items and customers save the new types', () => {
    const l = new Ledger(() => {});
    l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
    l.saveItem({ id: 'a', code: 'A', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, bulkPrice: 850, agentPrice: 800, priceCurrency: 'USD' } as never);
    expect(l.state.items['a']!.agentPrice).toBe(800);
    l.saveParty({ id: 'w', kind: 'customer', name: 'وكيل حلب', priceTier: 'agent' });
    expect(l.state.parties['w']!.priceTier).toBe('agent');
    expect(() => l.saveParty({ id: 'x', kind: 'customer', name: 'x', priceTier: 'vip' as never })).toThrow();
  });
});
