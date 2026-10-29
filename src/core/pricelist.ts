import type { CompanyState, Item } from './types';

// نشرة الأسعار: كل صنف بسعر المفرق والجملة، لوحدته الأساسية (كيلو، قطعة) ولكل وحدة كبيرة (كيس، شوال، كرتونة).

export interface PriceListRow {
  itemId: string;
  name: string;
  unit: string;
  retail: number;
  wholesale?: number;
  currency: string;
  /** وحدة إضافية (كيس 25 كغ...) تحت الصنف. */
  sub?: boolean;
}

export interface PriceListGroup {
  category: string;
  rows: PriceListRow[];
}

const factorText = (f: number, unit: string) => `${Number.isInteger(f) ? f : Math.round(f * 1000) / 1000} ${unit}`;

/** الأصناف مجمّعة بالتصنيف ومرتّبة بالاسم. الخدمات والمؤرشف ومواد الموردين المستقلين برّا النشرة. */
export function priceList(state: CompanyState, o: { categories?: string[]; query?: string } = {}): PriceListGroup[] {
  const q = o.query?.trim();
  const items = Object.values(state.items).filter(
    (i: Item) => !i.archived && !i.dealerId && i.kind !== 'service' && i.price > 0 && (!o.categories?.length || o.categories.includes(i.category ?? '')) && (!q || i.name.includes(q) || (i.category ?? '').includes(q)),
  );
  const groups = new Map<string, PriceListRow[]>();
  for (const i of items.sort((a, b) => a.name.localeCompare(b.name, 'ar'))) {
    const rows = groups.get(i.category || 'أخرى') ?? groups.set(i.category || 'أخرى', []).get(i.category || 'أخرى')!;
    rows.push({ itemId: i.id, name: i.name, unit: i.unit, retail: i.price, ...(i.wholesalePrice ? { wholesale: i.wholesalePrice } : {}), currency: i.priceCurrency });
    for (const u of i.units ?? []) {
      rows.push({
        itemId: i.id,
        name: `${u.name} (${factorText(u.factor, i.unit)})`,
        unit: u.name,
        retail: u.price ?? Math.round(i.price * u.factor),
        ...(i.wholesalePrice ? { wholesale: Math.round(i.wholesalePrice * u.factor) } : {}),
        currency: i.priceCurrency,
        sub: true,
      });
    }
  }
  return [...groups].map(([category, rows]) => ({ category, rows })).sort((a, b) => a.category.localeCompare(b.category, 'ar'));
}
