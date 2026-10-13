import type { CompanyState, Item, ScaleSettings } from './types';

export const DEFAULT_SCALE: ScaleSettings = { prefix: '21', itemDigits: 5, valueDigits: 5, valueType: 'weight', valueDecimals: 3 };

/** رقم التحقق لباركود EAN-13. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export interface ScanResult {
  item: Item;
  unit?: string; // إن طابق الباركود وحدة إضافية (كرتونة)
  qty?: number; // من باركود الميزان (وزن)
  price?: number; // من باركود الميزان (سعر)
  serial?: string; // إذا الممسوح رقم IMEI / تسلسلي لجهاز موجود بالمخزون
}

/**
 * يبحث عن مادة بالباركود أو الرمز أو رقم القطعة، ويفك باركود الميزان
 * (مثال 21 + 00123 + 01250 + تحقق = 1.250 كيلو من المادة 00123).
 */
export function resolveScan(state: CompanyState, code: string): ScanResult | null {
  const c = code.trim();
  if (!c) return null;
  const items = Object.values(state.items).filter((i) => !i.archived);
  for (const item of items) {
    if (item.barcode === c || item.code === c) return { item };
    const unit = item.units?.find((u) => u.barcode === c);
    if (unit) return { item, unit: unit.name };
  }
  const scale = state.info?.scale ?? DEFAULT_SCALE;
  if (/^\d{13}$/.test(c) && c.startsWith(scale.prefix) && ean13CheckDigit(c.slice(0, 12)) === Number(c[12])) {
    const start = scale.prefix.length;
    const itemCode = c.slice(start, start + scale.itemDigits);
    const raw = Number(c.slice(start + scale.itemDigits, start + scale.itemDigits + scale.valueDigits));
    const item = items.find((i) => i.weighed && (i.code === itemCode || i.code === String(Number(itemCode))));
    if (item) {
      const value = raw / 10 ** scale.valueDecimals;
      return scale.valueType === 'weight' ? { item, qty: value } : { item, price: Math.round(value * 10 ** (state.currencies[item.priceCurrency]?.decimals ?? 2)) };
    }
  }
  const byPart = items.find((i) => i.partNumber === c);
  if (byPart) return { item: byPart };
  // رقم IMEI أو تسلسلي لجهاز بالمخزون: بينزل الجهاز نفسه مع رقمه
  for (const item of items) if (item.trackSerial && state.stock[item.id]?.serials?.[c]) return { item, serial: c };
  return null;
}

/** يولّد مواد المقاسات والألوان لموديل ألبسة/أحذية. */
export function generateVariants(base: Omit<Item, 'id' | 'code' | 'attributes'>, codePrefix: string, sizes: string[], colors: string[]): Item[] {
  const out: Item[] = [];
  const s = sizes.length ? sizes : [''];
  const cs = colors.length ? colors : [''];
  let n = 1;
  for (const color of cs) {
    for (const size of s) {
      const attrs: Record<string, string> = {};
      if (size) attrs['المقاس'] = size;
      if (color) attrs['اللون'] = color;
      out.push({
        ...base,
        id: crypto.randomUUID(),
        code: `${codePrefix}-${String(n++).padStart(2, '0')}`,
        name: [base.name, color, size].filter(Boolean).join(' '),
        group: base.group ?? base.name,
        attributes: attrs,
      });
    }
  }
  return out;
}
