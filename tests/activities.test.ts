import { describe, expect, it } from 'vitest';
import { ACTIVITIES, ACTIVITY_LIST, ALL_FEATURES, chartFor } from '../src/core';
import { GROUPS, POPULAR } from '../src/renderer/src/components/ActivityPicker';
import { ICON_NAMES } from '../src/renderer/src/components/icons';

// أنواع النشاط (أكتر من 50): كل نشاط كامل، بقسم واحد بس، وميزاته موجودة
describe('activities', () => {
  it('has more than 50 complete activities', () => {
    expect(ACTIVITY_LIST.length).toBeGreaterThan(50);
    for (const a of ACTIVITY_LIST) {
      expect(a.name && a.description && a.icon && a.color && a.itemLabel && a.itemsLabel, a.id).toBeTruthy();
      expect(a.units.length, a.id).toBeGreaterThan(0);
      expect(ICON_NAMES, `${a.id}: ${a.icon}`).toContain(a.icon);
      for (const f of a.features) expect(ALL_FEATURES, `${a.id}: ${f}`).toContain(f);
      expect(chartFor(a.id).length).toBeGreaterThan(10);
    }
  });
  it('every activity is in exactly one picker group', () => {
    const all = GROUPS.flatMap((g) => g.ids);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(ACTIVITY_LIST.map((a) => a.id).sort());
    for (const id of POPULAR) expect(ACTIVITIES[id]).toBeTruthy();
  });
});
