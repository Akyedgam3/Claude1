// قياس الحجر بالفاتورة (طلب منشرة): طول × عرض × سماكة × عدد بالسنتيمتر.
// السماكة لحد الحد (10 سم افتراضياً) = متر مربع (ألواح وبلاط)، وأكتر = متر مكعب (كتل وحجر سميك).
export interface StoneDims {
  length: number; // سم
  width: number; // سم
  thick: number; // سم
  count: number;
}

export const STONE_THICK_LIMIT = 10;

export function stoneMeasure(d: StoneDims, opts: { limit?: number; force?: 'm2' | 'm3' } = {}): { qty: number; unit: 'م²' | 'م³'; text: string } | null {
  const { length, width, thick, count } = d;
  if (!(length > 0 && width > 0 && count > 0)) return null;
  const cubic = opts.force ? opts.force === 'm3' : thick > (opts.limit ?? STONE_THICK_LIMIT);
  if (cubic && !(thick > 0)) return null;
  const raw = cubic ? (length * width * thick * count) / 1_000_000 : (length * width * count) / 10_000;
  const qty = Math.round(raw * 1000) / 1000;
  const unit = cubic ? 'م³' : 'م²';
  const n = (x: number) => String(Math.round(x * 100) / 100);
  const size = thick > 0 ? `${n(length)}×${n(width)}×${n(thick)}` : `${n(length)}×${n(width)}`;
  return { qty, unit, text: `${size} سم × ${n(count)} = ${n(qty)} ${unit}` };
}
