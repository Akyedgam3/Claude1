// التفقيط: كتابة المبلغ بالحروف العربية (يُطبع على الفواتير والسندات).

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
  'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

// [مفرد، مثنى، جمع (3-10)، تمييز (11+)]
const SCALES: [string, string, string, string][] = [
  ['', '', '', ''],
  ['ألف', 'ألفان', 'آلاف', 'ألفاً'],
  ['مليون', 'مليونان', 'ملايين', 'مليوناً'],
  ['مليار', 'ملياران', 'مليارات', 'ملياراً'],
  ['تريليون', 'تريليونان', 'تريليونات', 'تريليوناً'],
];

function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]!);
  if (r) {
    if (r < 20) parts.push(ONES[r]!);
    else {
      const o = r % 10;
      parts.push(o ? `${ONES[o]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]!);
    }
  }
  return parts.join(' و');
}

function group(n: number, scale: number): string {
  if (scale === 0) return below1000(n);
  const [one, two, few, many] = SCALES[scale]!;
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${below1000(n)} ${few}`;
  return `${below1000(n)} ${n % 100 >= 3 && n % 100 <= 10 ? few : n % 100 === 0 ? one : many}`;
}

/** عدد صحيح موجب بالحروف. */
export function numberToArabicWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'صفر';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0) {
    const g = n % 1000;
    if (g) groups.unshift(group(g, scale));
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' و');
}

const CURRENCY_WORDS: Record<string, { main: string; sub: string }> = {
  SYP: { main: 'ليرة سورية', sub: 'قرشاً' },
  USD: { main: 'دولار أمريكي', sub: 'سنتاً' },
};

/** مبلغ بأصغر وحدة إلى نص: "فقط ألف ومئتان وخمسون ليرة سورية لا غير". */
export function amountInWords(minor: number, currency: string, decimals = 2): string {
  const words = CURRENCY_WORDS[currency] ?? { main: currency, sub: '' };
  const scale = 10 ** decimals;
  const main = Math.floor(Math.abs(minor) / scale);
  const sub = Math.abs(minor) % scale;
  let text = `${numberToArabicWords(main)} ${words.main}`;
  if (sub) text += ` و${numberToArabicWords(sub)} ${words.sub}`;
  return `فقط ${text} لا غير`;
}
