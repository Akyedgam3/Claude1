// عناوين "قائمة حالة التراخيص" الموقّعة. البرنامج يجرّبها بالترتيب حتى ينجح أحدها.
// ضع هنا رابط ملف feed.txt بعد رفعه (GitHub Pages، Cloudflare Pages، أو موقعك الخاص).
// يمكن وضع أكثر من رابط احتياطاً لحجب أحدها.
// إن تُركت فارغة يعمل البرنامج بالمفتاح فقط دون إمكانية الإيقاف عن بعد.
export const LICENSE_FEED_URLS: string[] = [
  'https://raw.githubusercontent.com/Akyedgam3/mizan-updates/main/feed.txt',
  // نفس الملف على الموقع (GitHub Pages بالدومين): بيتحدّث خلال دقائق، ومفيد إذا raw.githubusercontent محجوب
  'https://waznsy.com/feed.txt',
  // نسخة احتياطية عبر jsDelivr إذا انحجب الرابط الأول
  'https://cdn.jsdelivr.net/gh/Akyedgam3/mizan-updates@main/feed.txt',
];

/** كل كم ساعة يعيد البرنامج التحقق أثناء التشغيل. */
export const FEED_CHECK_HOURS = 1;
