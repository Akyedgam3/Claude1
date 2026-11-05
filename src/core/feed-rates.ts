// سعر الصرف التلقائي: لوحة الإدارة بتنشر سعر كل عملة بالليرة السورية الجديدة ضمن feed.txt الموقّع،
// والبرنامج بيسجّله لحالو بكل شركة (إلا إذا صاحبها طفّى «سعر الصرف التلقائي»).
// سعر يدوي انحط بنفس اليوم ما منكتب فوقه.
import type { CompanyState, ExchangeRate } from './types';

export interface FeedRates {
  /** وقت تحديد السعر (ISO). */
  date: string;
  /** كم ليرة سورية جديدة بتساوي وحدة وحدة من كل عملة (USD: 110). */
  values: Record<string, number>;
}

/** تنظيف أسعار جاية من الإنترنت (حتى لو موقّعة): أرقام موجبة ورموز عملات صحيحة بس. */
export function cleanFeedRates(raw: unknown): FeedRates | null {
  const r = raw as Partial<FeedRates> | null | undefined;
  if (!r || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(r.date) || !r.values || typeof r.values !== 'object') return null;
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.values)) if (/^[A-Z][A-Z0-9]{1,7}$/.test(k) && k !== 'SYP' && typeof v === 'number' && Number.isFinite(v) && v > 0) values[k] = v;
  return Object.keys(values).length ? { date: r.date, values } : null;
}

/** الأسعار اللي لازم تنسجّل بهالشركة (فاضية إذا ما في جديد). */
export function feedRatesFor(state: CompanyState, rates: FeedRates | null | undefined): ExchangeRate[] {
  if (!rates || !state.info || state.info.autoRates === false) return [];
  const price = (c: string) => (c === 'SYP' ? 1 : rates.values[c]);
  const base = state.info.baseCurrency;
  const pb = price(base);
  if (!pb) return [];
  const date = rates.date.slice(0, 10);
  const out: ExchangeRate[] = [];
  for (const c of Object.keys(state.currencies)) {
    if (c === base) continue;
    const pc = price(c);
    if (!pc) continue;
    const rate = Math.round((pc / pb) * 1e9) / 1e9;
    const same = state.rates.filter((r) => r.currency === c && r.kind === 'market');
    // سعر أحدث (يدوي) أو سعر يدوي بنفس اليوم: هو اللي بيمشي
    if (same.some((r) => r.date > date || (r.date === date && !r.auto))) continue;
    const today = same.find((r) => r.date === date);
    if (today && Math.abs(today.rate - rate) < 1e-9) continue;
    out.push({ date, currency: c, kind: 'market', rate, auto: true });
  }
  return out;
}
