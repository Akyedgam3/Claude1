// أنواع الزباين وأسعارهم: كل مادة إلها سعر مفرق (الأساسي) وسعر جملة وجملة الجملة ووكيل.
// السعر الفاضي بياخد سعر الشريحة اللي قبله (الوكيل بلا سعر ← جملة الجملة ← الجملة ← المفرق).
import { roundPrice } from './money';
import type { CompanyInfo, CompanyState, Item, Party, PriceBasis, PriceListDef, PriceTier } from './types';

export const PRICE_TIERS: { id: Exclude<PriceTier, 'special'>; name: string; short: string }[] = [
  { id: 'retail', name: 'زبون مفرق', short: 'مفرق' },
  { id: 'wholesale', name: 'زبون جملة', short: 'جملة' },
  { id: 'bulk', name: 'زبون جملة الجملة', short: 'جملة الجملة' },
  { id: 'agent', name: 'وكيل', short: 'وكيل' },
];

export const PRICE_TIER_NAMES: Record<PriceTier, string> = {
  retail: 'مفرق',
  wholesale: 'جملة',
  bulk: 'جملة الجملة',
  agent: 'وكيل',
  special: 'سعر خاص',
};

/** سعر المادة (بالوحدة الأساسية) لنوع الزبون. */
export function tierPrice(item: Pick<Item, 'price' | 'wholesalePrice' | 'bulkPrice' | 'agentPrice' | 'specialPrice'>, tier: PriceTier | undefined): number {
  const w = item.wholesalePrice ?? item.price;
  switch (tier) {
    case 'wholesale':
      return w;
    case 'bulk':
      return item.bulkPrice ?? w;
    case 'agent':
      return item.agentPrice ?? item.bulkPrice ?? w;
    case 'special':
      return item.specialPrice ?? w;
    default:
      return item.price;
  }
}

// ───────────── قوائم الأسعار (من 1.2.94) ─────────────
// القائمة = مفتاح: شرائح المادة (retail/wholesale/bulk/agent)، «cost» = سعر الكلفة (آخر سعر شراء)،
// أو معرّف قائمة من قوائم المحل (سعر الشراء أو أحد أسعار المادة ± نسبة، باسم بيختاره المحل).

export const COST_LIST = 'cost';
const TIER_KEYS = ['retail', 'wholesale', 'bulk', 'agent', 'special'];

export const PRICE_BASIS_NAMES: Record<PriceBasis, string> = {
  cost: 'سعر الشراء',
  retail: 'سعر المفرق',
  wholesale: 'سعر الجملة',
  bulk: 'سعر جملة الجملة',
  agent: 'سعر الوكيل',
};

/** قوائم المحل (غير المحذوفة) */
export function customPriceLists(info: CompanyInfo | null | undefined, withArchived = false): PriceListDef[] {
  return (info?.priceLists ?? []).filter((l) => withArchived || !l.archived);
}

/** القائمة الافتراضية للزبون */
export function partyPriceList(party: Party | null | undefined): string {
  return party?.priceList || party?.priceTier || 'retail';
}

export function isBuiltinList(key: string): boolean {
  return key === COST_LIST || TIER_KEYS.includes(key);
}

/** اسم القائمة للعرض */
export function priceListName(info: CompanyInfo | null | undefined, key: string | undefined): string {
  if (!key) return PRICE_TIER_NAMES.retail;
  if (key === COST_LIST) return 'سعر الكلفة';
  if (key in PRICE_TIER_NAMES) return PRICE_TIER_NAMES[key as PriceTier];
  return info?.priceLists?.find((l) => l.id === key)?.name ?? 'قائمة محذوفة';
}

/** وصف القائمة: «سعر الشراء + 15%» */
export function priceListRule(def: Pick<PriceListDef, 'basis' | 'percent'>): string {
  const base = PRICE_BASIS_NAMES[def.basis];
  if (!def.percent) return base;
  return `${base} ${def.percent > 0 ? '+' : '−'} ${Math.abs(def.percent)}%`;
}

/** سعر الكلفة للوحدة الأساسية (بالعملة الأساسية): آخر سعر شراء، وإذا ما في فالوسطي. */
export function itemCost(state: CompanyState, itemId: string): number {
  const s = state.stock[itemId];
  if (!s) return 0;
  if (s.lastCost > 0) return s.lastCost;
  return s.totalQty > 0 && s.value > 0 ? roundPrice(s.value / s.totalQty) : 0;
}

/**
 * سعر المادة (للوحدة الأساسية) بقائمة أسعار، مع عملته.
 * null = القائمة شريحة عادية (retail/wholesale/...) فبيتسعّر بالطريقة القديمة، أو ما في سعر كلفة.
 */
export function priceListPrice(state: CompanyState, item: Item, key: string): { price: number; currency: string } | null {
  if (key === COST_LIST) {
    const cost = itemCost(state, item.id);
    return cost > 0 ? { price: cost, currency: state.info!.baseCurrency } : null;
  }
  const def = state.info?.priceLists?.find((l) => l.id === key);
  if (!def) return null;
  const factor = 1 + (def.percent || 0) / 100;
  if (def.basis === 'cost') {
    const cost = itemCost(state, item.id);
    return cost > 0 ? { price: roundPrice(cost * factor), currency: state.info!.baseCurrency } : null;
  }
  return { price: roundPrice(tierPrice(item, def.basis) * factor), currency: item.priceCurrency };
}
