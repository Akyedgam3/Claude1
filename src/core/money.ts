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

/** يعرض المبلغ بصيغة مقروءة مع فواصل الآلاف: 1,250.75 */
export function formatMinor(minor: number, decimals: number): string {
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
