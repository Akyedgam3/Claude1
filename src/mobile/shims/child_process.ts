// ما في أوامر نظام على الموبايل؛ بصمة الجهاز بتنحسب من معرّف أندرويد (src/mobile/host.ts)
export function execFileSync(): never {
  throw new Error('غير متاح على الموبايل');
}
export default { execFileSync };
