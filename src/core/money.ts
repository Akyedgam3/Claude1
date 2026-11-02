// المبالغ تُخزَّن كأعداد صحيحة بأصغر وحدة للعملة (مثلاً قرش/سنت)
// لتجنّب أخطاء الفاصلة العائمة في الحسابات المالية.

export interface Currency {
  code: string; // SYP، USD، أو رمز يختاره المستخدم (TRY، EUR...)
  nameAr: string;
  symbol: string;
  decimals: number; // عدد المنازل العشرية لأصغر وحدة
  /** السعر بيتكتب «1 عملة أساسية = كم من هالعملة» (متل الليرة بشركة عملتها دولار). */
  rateInverted?: boolean;
  /** مخفية من قوائم الاختيار (الحركات القديمة بتضل متل ما هي). */
  hidden?: boolean;
}

// العملات الافتراضية: الليرة السورية الجديدة (بعد حذف الصفرين) والدولار الأمريكي. المستخدم بيقدر يضيف غيرهن.
export const DEFAULT_CURRENCIES: Currency[] = [
  { code: 'SYP', nameAr: 'ليرة سورية جديدة', symbol: 'ل.س', decimals: 2 },
  { code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', decimals: 2 },
];

/** يتحقق من شكل العملة (رمز لاتيني، اسم، رمز مختصر، منازل عشرية). */
export function currencyProblem(c: Currency): string | null {
  if (!c || typeof c.code !== 'string' || !/^[A-Z][A-Z0-9]{1,7}$/.test(c.code)) return 'رمز العملة من 2 إلى 8 أحرف إنكليزية كبيرة (مثل TRY أو EUR)';
  if (typeof c.nameAr !== 'string' || !c.nameAr.trim() || c.nameAr.length > 40) return 'اسم العملة مطلوب (حتى 40 حرفاً)';
  if (typeof c.symbol !== 'string' || !c.symbol.trim() || c.symbol.length > 8) return 'رمز العرض مطلوب (حتى 8 أحرف)';
  if (!Number.isInteger(c.decimals) || c.decimals < 0 || c.decimals > 4) return 'عدد المنازل العشرية بين 0 و 4';
  return null;
}

function assertSafe(n: number): number {
  if (!Number.isSafeInteger(n)) throw new Error(`المبلغ خارج النطاق المسموح: ${n}`);
  return n;
}

/** يحوّل نصاً عشرياً مثل "1250.75" إلى أصغر وحدة (125075) دون المرور بالفاصلة العائمة. */
export function toMinor(amount: string | number, decimals: number): number {
  const text = typeof amount === 'number' ? amount.toFixed(decimals) : amount.trim().replace(/,/g, '');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`مبلغ غير صالح: ${amount}`);
  const [, sign, whole, frac = ''] = match;
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) {
    throw new Error(`عدد المنازل العشرية أكبر من المسموح (${decimals}): ${amount}`);
  }
  const minor = Number(whole + frac.padEnd(decimals, '0').slice(0, decimals));
  return assertSafe(sign ? -minor : minor);
}

/** كم منزلة زيادة عن العملة بيقبل سعر الوحدة (بالدولار لحد 8 أرقام بعد الفاصلة: 0.00000001$). */
export const PRICE_EXTRA = 6;
export const PRICE_SCALE = 10 ** PRICE_EXTRA;
/** بيقرّب سعر/تكلفة وحدة لدقة الأسعار (بيحفظ أجزاء السنت). */
export const roundPrice = (n: number): number => Math.round(n * PRICE_SCALE) / PRICE_SCALE;

/** سعر وحدة: بيقبل منازل زيادة عن العملة (قطع صغيرة رخيصة)، والنتيجة ممكن تكون كسر من أصغر وحدة. */
export function toUnitPrice(amount: string, decimals: number): number {
  const scaled = toMinor(amount, decimals + PRICE_EXTRA);
  return scaled / PRICE_SCALE;
}

/**
 * تكلفة وحدة للعرض (متوسط التكلفة): بالمنازل العادية للعملة، وإذا كانت أقل من وحدة كاملة
 * منعرض 4 أرقام مهمة (0.6534$ مش 0.65$، و0.00005$ مش 0.00$).
 */
export function niceUnitCost(minor: number, decimals: number): number {
  const major = Math.abs(minor) / 10 ** decimals;
  if (!(major > 0) || major >= 1) return Math.round(minor);
  const places = Math.min(decimals + PRICE_EXTRA, Math.max(decimals, Math.ceil(-Math.log10(major)) + 3));
  const k = 10 ** (places - decimals);
  return Math.round(minor * k) / k;
}

/** سعر وحدة صالح: موجب وما فيه منازل أكتر من المسموح. */
export function isUnitPrice(n: unknown): n is number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false;
  const scaled = Math.round(n * PRICE_SCALE);
  return Number.isSafeInteger(scaled) && Math.abs(n * PRICE_SCALE - scaled) < 1e-3;
}

/** يعرض المبلغ بصيغة مقروءة مع فواصل الآلاف: 1,250.75 */
export function formatMinor(minor: number, decimals: number): string {
  // سعر وحدة أدق من أصغر وحدة (مثلاً 0.076$): منعرض المنازل الزيادة بس إذا موجودة
  if (!Number.isInteger(minor)) {
    const extra = Math.round(minor * PRICE_SCALE);
    if (extra % PRICE_SCALE !== 0) return formatMinor(extra, decimals + PRICE_EXTRA).replace(/0+$/, '');
    minor = extra / PRICE_SCALE;
  }
  const negative = minor < 0;
  const digits = Math.abs(minor).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = decimals > 0 ? '.' + digits.slice(digits.length - decimals) : '';
  return (negative ? '-' : '') + whole + frac;
}

/**
 * يحوّل مبلغاً من عملة إلى العملة الأساسية.
 * rate = كم وحدة من العملة الأساسية تساوي وحدة واحدة من العملة الأجنبية.
 */
export function convertMinor(minor: number, from: Currency, base: Currency, rate: number): number {
  if (!(rate > 0)) throw new Error(`سعر صرف غير صالح: ${rate}`);
  const scale = 10 ** (base.decimals - from.decimals);
  return assertSafe(Math.round(minor * rate * scale));
}

/** يقسم نسبة مئوية من مبلغ مع التقريب لأقرب وحدة صغرى. */
export function percentOf(minor: number, percent: number): number {
  return assertSafe(Math.round((minor * percent) / 100));
}
