import type { CompanyInfo, Item, Party } from './types';

// البيع والشراء على النشرات (كهربائيات): كل صنف إلو «سعر النشرة» من الشركة.
// الشراء = النشرة ناقص حسم الشراء (15% مثلاً)، المعلم = النشرة ناقص حسمه (10%)، الزبون العادي = النشرة أو أعلى (5%).

export interface ListPricing {
  buyDiscount: number; // حسم الشراء الافتراضي %
  masterDiscount: number; // حسم المعلمين %
  retailMarkup: number; // زيادة الزبون العادي على النشرة %
  brands?: Record<string, number>; // حسم الشراء لكل نشرة/شركة %
}

export const LIST_DEFAULTS: ListPricing = { buyDiscount: 15, masterDiscount: 10, retailMarkup: 5 };

export function listSettings(info: CompanyInfo | undefined): ListPricing {
  return { ...LIST_DEFAULTS, ...(info?.listPricing ?? {}) };
}

const pct = (v: number, p: number) => Math.round(v * (1 + p / 100));

/** حسم الشراء للصنف: الخاص فيه، وإلا تبع نشرته، وإلا الافتراضي. */
export function buyDiscountOf(info: CompanyInfo | undefined, item: Pick<Item, 'buyDiscount' | 'brand'>): number {
  const s = listSettings(info);
  return item.buyDiscount ?? (item.brand ? s.brands?.[item.brand] : undefined) ?? s.buyDiscount;
}

/** أسعار الصنف من نشرته (بعملة سعره، بأصغر وحدة): الكلفة المتوقعة وسعر المعلم وسعر الزبون. */
export function listPrices(info: CompanyInfo | undefined, item: Pick<Item, 'listPrice' | 'buyDiscount' | 'brand'>) {
  const list = item.listPrice ?? 0;
  const s = listSettings(info);
  return { list, cost: pct(list, -buyDiscountOf(info, item)), master: pct(list, -s.masterDiscount), retail: pct(list, s.retailMarkup) };
}

/** الصنف بعد تحديث أسعار البيع من النشرة (المفرق = الزبون، الجملة = المعلم). */
export function applyListPricing<T extends Item>(info: CompanyInfo | undefined, item: T): T {
  if (!item.listPrice) return item;
  const p = listPrices(info, item);
  return { ...item, price: p.retail, wholesalePrice: p.master };
}

/** سعر خاص لزبون إلو حسم محدد من النشرة (معلم مميز مثلاً). */
export function partyListPrice(item: Pick<Item, 'listPrice'>, party: Pick<Party, 'listDiscount'> | null | undefined): number | undefined {
  if (!item.listPrice || party?.listDiscount === undefined) return undefined;
  return pct(item.listPrice, -party.listDiscount);
}

export interface ListRow {
  code: string;
  name: string;
  pack: number;
  price: number; // بالعملة الكبيرة (دولار مثلاً)
}

/** تقسيم نص ملصوق (من Excel أو PDF) لأعمدة: تاب، أو مسافتين وأكتر. */
export function splitPasted(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.normalize('NFKC').replace(/[‎‏‪-‮]/g, '').trim())
    .filter(Boolean)
    .map((l) => (l.includes('\t') ? l.split('\t') : l.split(/\s{2,}/)).map((c) => c.trim()).filter((c, i, a) => c !== '' || i < a.length - 1));
}

export type ListColumn = 'skip' | 'code' | 'name' | 'pack' | 'price';

/** تخمين الأعمدة: السعر رقم بفاصلة أو صغير، التعبئة رقم صحيح، الكود رقم أو رمز، الصنف أطول نص عربي. */
export function guessColumns(rows: string[][]): ListColumn[] {
  const n = Math.max(0, ...rows.map((r) => r.length));
  const cols: ListColumn[] = Array(n).fill('skip');
  const isNum = (s: string) => /^\d+(\.\d+)?$/.test(s);
  const score = (i: number, f: (s: string) => boolean) => rows.filter((r) => r[i] !== undefined && f(r[i]!)).length;
  const textual = [...Array(n).keys()].map((i) => ({ i, s: score(i, (x) => /[؀-ۿ]/.test(x)) + rows.reduce((a, r) => a + (r[i]?.length ?? 0), 0) / 100 }));
  const name = textual.sort((a, b) => b.s - a.s)[0]?.i;
  if (name !== undefined) cols[name] = 'name';
  const dec = [...Array(n).keys()].filter((i) => cols[i] === 'skip').map((i) => ({ i, s: score(i, (x) => /^\d+\.\d+$/.test(x)) })).sort((a, b) => b.s - a.s)[0];
  if (dec && dec.s > 0) cols[dec.i] = 'price';
  const ints = [...Array(n).keys()].filter((i) => cols[i] === 'skip' && score(i, isNum) >= rows.length / 2);
  // الكود قريب من الاسم، والتعبئة بين الكود والسعر؛ رقم التسلسل (1، 2، 3...) منتجاهله
  const serial = ints.find((i) => rows.every((r, k) => k === 0 || !isNum(r[i] ?? '') || Number(r[i]) - Number(rows[k - 1]![i]) <= 2) && rows.length > 2);
  const rest = ints.filter((i) => i !== serial);
  if (rest.length >= 2) {
    const byDist = rest.sort((a, b) => Math.abs(a - (name ?? 0)) - Math.abs(b - (name ?? 0)));
    cols[byDist[0]!] = 'code';
    cols[byDist[1]!] = 'pack';
  } else if (rest.length === 1) cols[rest[0]!] = 'code';
  if (!cols.includes('price')) {
    const p = ints.find((i) => cols[i] === 'skip');
    if (p !== undefined) cols[p] = 'price';
  }
  return cols;
}

/** الصفوف الصالحة حسب الأعمدة المختارة (لازم اسم وسعر). */
export function readListRows(rows: string[][], cols: ListColumn[]): ListRow[] {
  const at = (r: string[], c: ListColumn) => { const i = cols.indexOf(c); return i >= 0 ? (r[i] ?? '').trim() : ''; };
  const out: ListRow[] = [];
  for (const r of rows) {
    const name = at(r, 'name');
    const price = Number(at(r, 'price').replace(/[,،$]/g, ''));
    if (!name || !(price > 0)) continue;
    out.push({ code: at(r, 'code'), name, pack: Math.max(0, Math.round(Number(at(r, 'pack')) || 0)), price });
  }
  return out;
}
