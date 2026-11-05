// أنواع الزباين وأسعارهم: كل مادة إلها سعر مفرق (الأساسي) وسعر جملة وجملة الجملة ووكيل.
// السعر الفاضي بياخد سعر الشريحة اللي قبله (الوكيل بلا سعر ← جملة الجملة ← الجملة ← المفرق).
import type { Item, PriceTier } from './types';

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
