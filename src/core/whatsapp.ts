// رابط واتساب لرقم الزبون مع رسالة جاهزة. الرقم السوري المحلي (09...) بيتحوّل لـ 963.

/** الرقم بصيغة واتساب الدولية (أرقام بس)، أو null إذا مش رقم صالح. */
export function whatsappNumber(phone: string, countryCode = '963'): string | null {
  let d = phone.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = countryCode + d.slice(1);
  else if (d.length <= 9) d = countryCode + d;
  return /^\d{8,15}$/.test(d) ? d : null;
}

/** بدون رقم (phone فاضي) بيفتح الواتساب لتختار مين تبعتله. */
export function whatsappUrl(phone: string, text: string): string {
  const n = phone.trim() ? whatsappNumber(phone) : '';
  if (n === null) throw new Error('رقم الهاتف غير صالح للواتساب');
  if (text.length > 6000) throw new Error('الرسالة طويلة');
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
