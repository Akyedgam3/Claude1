import { describe, expect, it } from 'vitest';
import { stoneMeasure } from '../src/core';

// منشرة: سماكة لحد 10 سم = متر مربع، ومن 11 وفوق = متر مكعب
describe('stone measure', () => {
  it('thin slabs are square meters', () => {
    expect(stoneMeasure({ length: 120, width: 60, thick: 3, count: 10 })).toEqual({ qty: 7.2, unit: 'م²', text: '120×60×3 سم × 10 = 7.2 م²' });
    expect(stoneMeasure({ length: 100, width: 100, thick: 10, count: 1 })!.unit).toBe('م²');
  });
  it('thick stone is cubic meters', () => {
    expect(stoneMeasure({ length: 200, width: 100, thick: 11, count: 2 })).toMatchObject({ qty: 0.44, unit: 'م³' });
    expect(stoneMeasure({ length: 300, width: 150, thick: 120, count: 1 })).toMatchObject({ qty: 5.4, unit: 'م³' });
  });
  it('manual override and bad input', () => {
    expect(stoneMeasure({ length: 120, width: 60, thick: 3, count: 10 }, { force: 'm3' })!.qty).toBeCloseTo(0.216);
    expect(stoneMeasure({ length: 0, width: 60, thick: 3, count: 1 })).toBeNull();
  });
});
