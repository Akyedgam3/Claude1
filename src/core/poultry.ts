import { roundQty } from './stock';
import type { CompanyState, Invoice, Item, Weighing } from './types';

// توزيع الفروج والدواجن: وزنات على دفعات (قفص قفص)، تسعيرة يومية بتتغير كل يوم، وملخص اليوم بالكيلو.

/** القطعيات المعتادة عند موزع الفروج (متل الفاتورة المطبوعة عندهم). */
export const POULTRY_CUTS: { id: string; name: string; category: string }[] = [
  { id: 'pl-whole', name: 'فروج', category: 'فروج كامل' },
  { id: 'pl-wardeh', name: 'وردة', category: 'قطعيات' },
  { id: 'pl-wings', name: 'جناح', category: 'قطعيات' },
  { id: 'pl-fillet', name: 'شرحات', category: 'قطعيات' },
  { id: 'pl-drum', name: 'دبوس', category: 'قطعيات' },
  { id: 'pl-kasta', name: 'كستا', category: 'قطعيات' },
  { id: 'pl-shawarma', name: 'مجروم شاورما', category: 'قطعيات' },
  { id: 'pl-breast', name: 'صدر بجلدة', category: 'قطعيات' },
  { id: 'pl-thigh', name: 'فخاد نظامي', category: 'قطعيات' },
  { id: 'pl-thigh-neck', name: 'فخاد برقبة', category: 'قطعيات' },
  { id: 'pl-back', name: 'ظهورة', category: 'قطعيات' },
  { id: 'pl-liver', name: 'سودة', category: 'سودة وحواصل' },
  { id: 'pl-gizzard', name: 'حواصل', category: 'سودة وحواصل' },
  { id: 'pl-liver-free', name: 'سودة حرة', category: 'سودة وحواصل' },
  { id: 'pl-gizzard-free', name: 'حواصل حرة', category: 'سودة وحواصل' },
];

/** «99 + 110 114، 98.5» ← [99, 110, 114, 98.5]. بيقبل الأرقام العربية والفاصلة العشرية العربية. */
export function parseWeights(text: string): number[] {
  const western = text.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/٫/g, '.');
  return (western.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0);
}

export function weighingGross(w: Weighing): number {
  return roundQty(w.weights.reduce((s, x) => s + x, 0));
}

/** الوزن الصافي = مجموع الوزنات − وزن الأقفاص الفاضية. */
export function weighingNet(w: Weighing): number {
  return roundQty(weighingGross(w) - (w.tare ?? 0));
}

/** وسطي وزن الطير (الصافي على الطيور الحية). */
export function birdAverage(w: Weighing): number | undefined {
  const alive = (w.count ?? 0) - (w.dead ?? 0);
  return alive > 0 ? Math.round((weighingNet(w) / alive) * 1000) / 1000 : undefined;
}

const okNum = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n >= 0);

export function cleanWeighing(w: Weighing, lineNo: number): Weighing {
  const bad = (m: string): never => {
    throw new Error(`السطر ${lineNo}: ${m}`);
  };
  const weights = (w.weights ?? []).map(Number);
  if (weights.length === 0) bad('اكتب الوزنات');
  if (weights.length > 500) bad('الوزنات كتير');
  if (weights.some((x) => !(Number.isFinite(x) && x > 0 && x < 100000))) bad('وزنة غير صالحة');
  if (![w.tare, w.boxes, w.count, w.dead].every(okNum)) bad('عدد أو وزن غير صالح');
  if ((w.dead ?? 0) > (w.count ?? Infinity)) bad('النافق أكتر من عدد الطيور');
  const out: Weighing = { weights: weights.map(roundQty) };
  if (w.tare) out.tare = roundQty(w.tare);
  if (w.boxes) out.boxes = Math.round(w.boxes);
  if (w.count) out.count = Math.round(w.count);
  if (w.dead) out.dead = Math.round(w.dead);
  if (!(weighingNet(out) > 0)) bad('الوزن الصافي لازم يكون أكبر من صفر (وزن الفارغ أكبر من الوزنات)');
  return out;
}

const fmtKg = (n: number) => String(Math.round(n * 1000) / 1000);

/** «وزنات: 99 + 110 + 114 = 323 − فارغ 20 (10 أقفاص) = 303 كغ · 75 طير، نافق 2 · وسطي 4.15» */
export function weighingText(w: Weighing, unit = 'كغ'): string {
  const parts = [`وزنات: ${w.weights.map(fmtKg).join(' + ')}${w.weights.length > 1 ? ` = ${fmtKg(weighingGross(w))}` : ''}`];
  if (w.tare) parts[0] += ` − فارغ ${fmtKg(w.tare)}${w.boxes ? ` (${w.boxes} قفص)` : ''} = ${fmtKg(weighingNet(w))}`;
  parts[0] += ` ${unit}`;
  if (w.count) parts.push(`${w.count} طير${w.dead ? `، نافق ${w.dead}` : ''}`);
  const avg = birdAverage(w);
  if (avg) parts.push(`وسطي الطير ${fmtKg(avg)}`);
  return parts.join(' · ');
}

const isLive = (inv: Invoice) => !inv.voidEntryId && !inv.deleted;

export interface PoultryDay {
  date: string;
  bought: { kg: number; cost: number; birds: number; dead: number; invoices: number };
  sold: { kg: number; revenue: number; cost: number; profit: number; invoices: number; credit: number };
  /** حسب الصنف: المشترى والمباع بالكيلو والإيراد والربح، والباقي بالمخزون. */
  items: { itemId: string; name: string; boughtKg: number; soldKg: number; revenue: number; profit: number; stock: number }[];
  avgBuy: number; // وسطي سعر كيلو الشراء (بالعملة الأساسية)
  avgSell: number;
  profitPerKg: number;
}

/** ملخص يوم موزع الفروج: كم كيلو اشترينا وبعنا، الربح، ربح الكيلو، والباقي. المبالغ بالعملة الأساسية. */
export function poultryDay(state: CompanyState, date: string, itemIds?: string[]): PoultryDay {
  const only = itemIds ? new Set(itemIds) : undefined;
  const rows = new Map<string, PoultryDay['items'][number]>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { itemId: id, name: state.items[id]?.name ?? id, boughtKg: 0, soldKg: 0, revenue: 0, profit: 0, stock: state.stock[id]?.totalQty ?? 0 }));
    return r;
  };
  const bought = { kg: 0, cost: 0, birds: 0, dead: 0, invoices: 0 };
  const sold = { kg: 0, revenue: 0, cost: 0, profit: 0, invoices: 0, credit: 0 };
  for (const inv of state.invoices) {
    if (inv.date !== date || !isLive(inv)) continue;
    const sign = inv.kind === 'sale' || inv.kind === 'purchase' ? 1 : inv.kind === 'sale_return' || inv.kind === 'purchase_return' ? -1 : 0;
    if (!sign) continue;
    const isSale = inv.kind === 'sale' || inv.kind === 'sale_return';
    // الخصم على الفاتورة بيتوزع على السطور حسب قيمتها
    const sub = inv.subtotal || 1;
    let any = false;
    for (const l of inv.lines) {
      if (!l.itemId || (only && !only.has(l.itemId))) continue;
      any = true;
      const kg = roundQty(l.qty * (l.factor ?? 1)) * sign;
      const gross = Math.round(l.qty * l.price) - l.discount;
      const amount = Math.round((gross - (inv.discount * gross) / sub) * inv.rate) * sign;
      const r = row(l.itemId);
      if (isSale) {
        const cost = (l.cost ?? 0) * sign;
        r.soldKg += kg;
        r.revenue += amount;
        r.profit += amount - cost;
        sold.kg += kg;
        sold.revenue += amount;
        sold.cost += cost;
      } else {
        r.boughtKg += kg;
        bought.kg += kg;
        bought.cost += amount;
        bought.birds += (l.weighing?.count ?? 0) * sign;
        bought.dead += (l.weighing?.dead ?? 0) * sign;
      }
    }
    if (!any || sign < 0) continue;
    if (isSale) {
      sold.invoices++;
      if (inv.paid < inv.total) sold.credit += Math.round((inv.total - inv.paid) * inv.rate);
    } else bought.invoices++;
  }
  sold.profit = sold.revenue - sold.cost;
  bought.kg = roundQty(bought.kg);
  sold.kg = roundQty(sold.kg);
  for (const id of itemIds ?? []) row(id);
  const per = (amount: number, kg: number) => (kg > 0 ? Math.round(amount / kg) : 0);
  return {
    date,
    bought,
    sold,
    items: [...rows.values()].map((r) => ({ ...r, boughtKg: roundQty(r.boughtKg), soldKg: roundQty(r.soldKg) })),
    avgBuy: per(bought.cost, bought.kg),
    avgSell: per(sold.revenue, sold.kg),
    profitPerKg: per(sold.profit, sold.kg),
  };
}

/** آخر تسعيرة محفوظة قبل (أو بـ) هالتاريخ. */
export function lastPriceBoard(state: CompanyState, before: string) {
  const dates = Object.keys(state.priceBoards ?? {})
    .filter((d) => d <= before)
    .sort();
  return dates.length ? state.priceBoards![dates[dates.length - 1]!]! : undefined;
}

/** نص التسعيرة للواتساب: «تسعيرة اليوم ... فروج: 285 جملة / 300 مستهلك». */
export function priceBoardText(opts: { company: string; date: string; items: Pick<Item, 'name' | 'unit'>[]; prices: { price: number; wholesale?: number }[]; fmt: (minor: number) => string; phone?: string }): string {
  const lines = [`*${opts.company}*`, `تسعيرة يوم ${opts.date}`, ''];
  opts.items.forEach((it, i) => {
    const p = opts.prices[i]!;
    const parts = [p.wholesale ? `جملة ${opts.fmt(p.wholesale)}` : '', p.price ? `مستهلك ${opts.fmt(p.price)}` : ''].filter(Boolean);
    if (parts.length) lines.push(`• ${it.name} (${it.unit}): ${parts.join(' — ')}`);
  });
  if (opts.phone) lines.push('', `للطلب: ${opts.phone}`);
  return lines.join('\n');
}
