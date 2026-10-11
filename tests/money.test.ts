import { describe, expect, it } from 'vitest';
import { convertMinor, formatMinor, toMinor } from '../src/core';

const SYP = { code: 'SYP', nameAr: '', symbol: '', decimals: 2 };
const USD = { code: 'USD', nameAr: '', symbol: '', decimals: 2 };

describe('money', () => {
  it('parses decimal text without floating point errors', () => {
    expect(toMinor('0.1', 2) + toMinor('0.2', 2)).toBe(30);
    expect(toMinor('1,250.75', 2)).toBe(125075);
    expect(toMinor('-3', 2)).toBe(-300);
    expect(() => toMinor('1.234', 2)).toThrow();
    expect(() => toMinor('abc', 2)).toThrow();
  });

  it('formats with thousands separators', () => {
    expect(formatMinor(123456789, 2)).toBe('1,234,567.89');
    expect(formatMinor(-5, 2)).toBe('-0.05');
    expect(formatMinor(1000, 0)).toBe('1,000');
  });

  it('converts foreign currency to base', () => {
    expect(convertMinor(toMinor('100', 2), USD, SYP, 13000)).toBe(toMinor('1300000', 2));
    expect(() => convertMinor(100, USD, SYP, 0)).toThrow();
  });
});
