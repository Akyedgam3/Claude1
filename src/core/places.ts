import type { CompanyState, Item } from './types';

// أماكن المواد (رف / ركن) لكل مستودع: بتنحسب من المواد نفسها، المكان الجديد بينضاف أول ما تكتبه على مادة.

/** مكان المادة بالمستودع (القديم `location` بينعرض إذا ما انكتب مكان خاص بالمستودع). */
export function itemPlace(item: Pick<Item, 'location' | 'locations'>, warehouseId: string): string {
  return (item.locations?.[warehouseId] ?? item.location ?? '').trim();
}

/** كل الأماكن الموجودة بمستودع ← المواد اللي عليها. */
export function placesIn(state: CompanyState, warehouseId: string): Map<string, Item[]> {
  const out = new Map<string, Item[]>();
  for (const i of Object.values(state.items)) {
    if (i.archived || i.kind !== 'stock') continue;
    const p = itemPlace(i, warehouseId);
    if (!p) continue;
    const list = out.get(p) ?? [];
    list.push(i);
    out.set(p, list);
  }
  return out;
}

/** بيرجع نسخة من المادة بمكانها الجديد بالمستودع (فاضي = بيشيل المكان). */
export function withPlace(item: Item, warehouseId: string, place: string): Item {
  const locations = { ...(item.locations ?? {}) };
  const p = place.trim();
  if (p) locations[warehouseId] = p;
  else delete locations[warehouseId];
  const { locations: _old, ...rest } = item;
  return Object.keys(locations).length ? { ...rest, locations } : rest;
}

export interface PlaceCheck {
  state: 'empty' | 'new' | 'exists';
  /** المواد اللي عليه حالياً (بدون المادة نفسها). */
  items: Item[];
}

/** المكان المكتوب: جديد (بينضاف)، ولا موجود (ومين عليه). */
export function checkPlace(state: CompanyState, warehouseId: string, place: string, selfId?: string): PlaceCheck {
  const p = place.trim();
  if (!p) return { state: 'empty', items: [] };
  const items = (placesIn(state, warehouseId).get(p) ?? []).filter((i) => i.id !== selfId);
  return { state: placesIn(state, warehouseId).has(p) ? 'exists' : 'new', items };
}

/** نص أماكن المادة للجداول: بمستودع واحد المكان بس، وبأكتر من مستودع «المستودع: المكان». */
export function itemPlacesText(state: CompanyState, item: Pick<Item, 'location' | 'locations'>): string {
  const ws = Object.values(state.warehouses);
  if (ws.length <= 1) return itemPlace(item, ws[0]?.id ?? 'main');
  const parts = ws.map((w) => [w.name, itemPlace(item, w.id)] as const).filter(([, p]) => p);
  return parts.map(([n, p]) => `${n}: ${p}`).join(' · ');
}
