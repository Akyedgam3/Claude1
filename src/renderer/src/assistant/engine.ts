// المساعد الذكي (بدون إنترنت): بيفهم السؤال بأي صياغة (فصحى أو شامي، بأخطاء إملائية)
// وبيلاقي أقرب موضوع من دليل البرنامج. الفكرة: تطبيع الحروف، تقطيع الكلمات وشيل الزوائد (ال، و، ب، ـات...)،
// تحويل المرادفات واللهجة لكلمة وحدة، وبعدين مقارنة تقريبية (بداية الكلمة، حرف غلط) مع وزن للكلمات النادرة.

export interface Link {
  label: string;
  screen: string;
  param?: string;
}

export interface Topic {
  id: string;
  /** السؤال الأساسي (بيطلع كاقتراح). */
  q: string;
  /** كلمات وعبارات بيسأل فيها الناس عن هالموضوع. */
  keys: string[];
  /** أولوية بسيطة للمواضيع الأساسية (بيع، شراء...) وقت يكون السؤال عام. */
  prior?: number;
  /** الجواب (أسطر، والخطوات بـ «←»). */
  a: string;
  go?: Link[];
}

const STOP = new Set(
  (
    'كيف شلون كيفيه كيفاش شو ايش اي وش ليش لشو ليه وين فين منين بدي بدنا بدك بدو بدها بدهم ابغى ابي اريد نريد اريد حابب حاب ممكن لو سمحت سمحت عم رح راح ح انا انت انتي احنا نحن هو هي هم هاد هيدا هيدي هاي هالشي هذا هذه ذلك تلك هون هنيك هناك هنا ' +
    'من الى لـ عل على علي عن في فيه فيها مع يعني اذا ازا لما وقت شي شيء اشي كمان بس طيب يلا لحتى حتى لازم بقدر بقدرش فيني فيي فيه يمكن قدر اقدر نقدر بيصير يصير صار عمل اعمل نعمل سوي اسوي ساوي سويت ' +
    'او ام ثم قبل بعد كل كلو كلها الشي سجل بسجل نسجل اسجل هالـ يا ياخي اخي استاذ لو مرحبا هلا اهلا السلام عليكم شكرا مشكور الله يعطيك العافيه تكرم ' +
    'عندي عندك عنا عندنا معي معك لي الي الو الها الهم انو انه انها ان كان كانت يكون تكون رح ما مش مو مافي ما في لا نعم اي ايوا اه ولا ابدا بشي ببرنامج البرنامج برنامج التطبيق تطبيق وزن'
  ).split(/\s+/),
);

/** مرادفات ولهجة ← كلمة وحدة. كل سطر: الكلمة الأساسية ثم المرادفات. */
const SYNONYMS = `
عميل زبون زباين زبائن زبونه عملاء مشتري مشترين كاستمر
مورد موردين موردون مورّد تاجر تجار شركه_مورده مزود
ماده مواد صنف اصناف بضاعه بضايع منتج منتجات سلعه سلع قطعه قطع ايتم اغراض غرض
فاتوره فواتير فاتورة فتوره فتورة بيل
بيع مبيع مبيعات بعت ابيع نبيع يبيع بيعه بايع بيعات مبعات مبيعه ينباع انباع بينباع مبيوع تبيع
شراء شري اشتري شتري بشتري اشتريت شريت مشتريات نشتري يشتري تشتري جبت جبنا بضاعه_جديده توريد ورد
مصروف مصاريف مصروفات نفقه نفقات مصرف صرفيات صرفت كهربا كهرباء ايجار اجار امبيرات مولده انترنت مازوت مي المي الميه المويه مياه ماء غاز نظافه ضيافه
دين ديون ذمه ذمم اجل آجل ديّن دينه مديون مديونيه مستحق باقي_عليه بالدين عالحساب بعدين لاحقا مكسور_عليه
قبض قبضت استلمت حصلت تحصيل اقبض نقبض دخل_مصاري سند_قبض وصل_قبض
دفع دفعت ادفع ندفع سددت تسديد سدد سداد خلصت_حساب صرفت_له
نقد مصاري فلوس مال نقود كاش نقدي سيوله مصرياتي
صندوق صناديق الدرج درج خزنه خزينه الكاسه
ربح ارباح مربح فايده فائده مكسب ربحت كسبت مرابح ارباحي
خساره خسائر خسرت
راتب رواتب معاش معاشات اجور اجره اجر يوميه يوميات اسبوعيه
موظف موظفين عامل عمال صانع صناع شغيل شغيله مستخدم_عندي اجير
سلفه سلف تسليف سلّف مسبق
شريك شركاء مساهم مساهمين شراكه حصه حصص
تقرير تقارير احصائيات احصاء ارقام ملخص
كشف كشوفات كشف_حساب كشفحساب
مخزون مستودع مستودعات ستوك المخزن مخزن رصيد_مواد كميه كميات موجود باقي_من
جرد جردت عد عدّ تعداد
تالف تلف خربان خربت خرب تخرب خربانه مكسور انكسر انكسرت كسر مكسوره منتهي اكسباير اكسبير صلاحيه منتهيه فاسد فسد عفن
مرتجع مرتجعات رجع ارجاع ارجع رجّع رجعت استرجاع رد ردّ مردود
خصم حسم تخفيض خصومات تنزيل نزلت_السعر عرض
سعر اسعار تسعير تسعيره ثمن حق كلفه_البيع
تكلفه تكاليف كلفه راسمال رأسمال رأس_المال كلفة
عمله عملات دولار دولارات صرف سعر_الصرف ليره ليرات يورو تركي
طباعه اطبع طبع نطبع برنت طابعه طابعات برنتر
ملصق ملصقات ستيكر ستيكرات ليبل ليبلات لصاقه
باركود بار_كود كود_المادة سكانر ماسح قارئ
شعار لوغو لوجو لوقو علامه
نسخ نسخه نسخ_احتياطي احتياطي احتياطيه باك_اب باكاب backup حفظ_البيانات حفظ احفظ بحفظ نحفظ فلاشه فلاشات usb هارد
مستخدم مستخدمين يوزر يوزرات حساب_دخول كاشير بائع_عندي
صلاحيه صلاحيات اذن اذونات سماحيه
كلمه_سر باسورد باسوورد رمز_الدخول كلمة_المرور كلمةالسر
واتس واتساب وتساب واتسب
تعديل عدل عدّل اعدل نعدل غيّر غير تغيير صلح صحح تصحيح
حذف احذف امسح مسح شيل شلت الغي الغاء لغي الغيت
جوال موبايل تلفون تليفون هاتف اندرويد ايفون
كمبيوتر لابتوب حاسوب لابتوب ويندوز
شبكه وايفاي واي_فاي راوتر نت_محلي
اتصال_عن_بعد عن_بعد من_البيت ريموت انترنت_بعيد
تحديث تحديثات نسخه_جديده اب_ديت
ترخيص تفعيل اشتراك مفتاح كود_التفعيل رخصه
قيد قيود يوميه_محاسبيه
حساب حسابات دليل_الحسابات شجره_الحسابات
مطبخ طباخ شيف
طاوله طاولات ترابيزه
طلب طلبات اوردر اوردرات
تقسيط اقساط قسط تقسيطه
صيانه تصليح صلّح فني ورشه_صيانه
موعد مواعيد حجز_موعد
عرض_سعر عروض_اسعار عرض_اسعار بروفورما
وصفه وصفات خلطه خلطات تركيبه
انتاج تصنيع صنّع نصنع ننتج
وحده وحدات كرتونه كرتون ظرف علبه دزينه
تصنيف تصنيفات فئه فئات قسم_مواد مجموعه
افتتاحي افتتاحيه اول_المده بدايه رصيد_اول
اغلاق_اليوم اقفال_اليوم اخر_الدوام تقرير_اليوم جرد_الصندوق
سنه سنوي السنه_الماليه
اكثر اكتر الاكثر الاكتر افضل احسن اقوى
نواقص ناقص ناقصني ناقصه نقص نقصان خلصت خلص قرب_يخلص مفقود
بحث دور دورلي ابحث فتش فتشلي لاقيلي اقلب
غياب غاب غايب تاخير تاخر تأخر
ميزان موازين وزن بالوزن الوزن
`;

const CANON = new Map<string, string>();
for (const line of SYNONYMS.trim().split('\n')) {
  const [head, ...rest] = line.trim().split(/\s+/);
  if (!head) continue;
  const h = baseNorm(head.replace(/_/g, ' ')).replace(/ /g, '');
  for (const w of [head, ...rest]) {
    const n = baseNorm(w.replace(/_/g, ' '));
    CANON.set(n.replace(/ /g, ''), h);
  }
}
/** عبارات من كلمتين بالمرادفات (رأس المال، سند قبض...) منلزقها قبل التقطيع. */
const MULTI = SYNONYMS.split(/\s+/)
  .filter((w) => w.includes('_'))
  .map((w) => baseNorm(w.replace(/_/g, ' ')))
  .sort((a, b) => b.length - a.length);

function baseNorm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[ً-ْٰـ]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PREFIXES = ['وبال', 'وال', 'بال', 'كال', 'فال', 'لال', 'وب', 'ال', 'لل', 'عال', 'عل', 'هال', 'و', 'ب', 'ل', 'ف', 'ع', 'ه'];
const SUFFIXES = ['اتها', 'اتهم', 'ات', 'ين', 'ون', 'يه', 'يات', 'هم', 'ها', 'كم', 'نا', 'تي', 'ته', 'ه', 'ي', 'ك', 'و', 'ا'];

/** أشكال الكلمة: نفسها، وبدون السوابق واللواحق (بحذر حتى ما نخرب كلمات قصيرة). */
function variants(w: string): string[] {
  const out = new Set([w]);
  for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 3) out.add(w.slice(p.length));
  for (const v of [...out]) for (const s of SUFFIXES) if (v.endsWith(s) && v.length - s.length >= 3) out.add(v.slice(0, -s.length));
  return [...out];
}

function canon(w: string): string | null {
  for (const v of variants(w)) {
    const c = CANON.get(v);
    if (c) return c;
  }
  return null;
}

/** كلمات السؤال بعد التطبيع: كل كلمة (أو عبارة معروفة) بشكلها الأساسي. */
export function tokens(text: string): string[] {
  let t = ` ${baseNorm(text)} `;
  for (const m of MULTI) if (t.includes(` ${m} `)) t = t.split(` ${m} `).join(` ${m.replace(/ /g, '')} `);
  const out: string[] = [];
  for (const w of t.trim().split(' ')) {
    if (!w || STOP.has(w) || /^\d+$/.test(w)) continue;
    const c = canon(w);
    if (c) out.push(c);
    else {
      const vs = variants(w);
      if (vs.some((v) => STOP.has(v))) continue;
      // الشكل الأقصر (بدون ال/و/ب/ـات...): نفس الشي بينعمل لكلمات الدليل فبيتطابقوا
      out.push(vs.sort((a, b) => a.length - b.length)[0]!);
    }
  }
  return out;
}

function editDistance1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/** قديش كلمتين متشابهين (0..1). */
function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.75;
  if (a.length >= 5 && b.length >= 5 && editDistance1(a, b)) return 0.65;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 3) return 0.45;
  return 0;
}

interface Indexed {
  topic: Topic;
  words: Map<string, number>; // كلمة ← وزن
  phrases: string[];
}

export class Brain {
  private idx: Indexed[];
  private idf = new Map<string, number>();

  constructor(topics: Topic[]) {
    this.idx = topics.map((topic) => {
      const words = new Map<string, number>();
      const add = (text: string, w: number) => {
        for (const t of tokens(text)) words.set(t, Math.max(words.get(t) ?? 0, w));
      };
      add(topic.q, 1.3);
      for (const k of topic.keys) add(k, 1);
      return { topic, words, phrases: [topic.q, ...topic.keys].map((k) => baseNorm(k)).filter((p) => p.split(' ').length >= 2) };
    });
    const df = new Map<string, number>();
    for (const t of this.idx) for (const w of t.words.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    const n = this.idx.length;
    for (const [w, c] of df) this.idf.set(w, Math.log(1 + n / c));
  }

  /** أقرب المواضيع للسؤال مع درجتها. */
  search(question: string, limit = 3): { topic: Topic; score: number }[] {
    const q = tokens(question);
    if (q.length === 0) return [];
    const norm = ` ${baseNorm(question)} `;
    const scored = this.idx.map((t) => {
      let s = 0;
      let hits = 0;
      const used = new Set<string>();
      for (const w of q) {
        let best = 0;
        let bw = '';
        for (const [k, weight] of t.words) {
          const sim = wordSim(w, k) * weight;
          if (sim > best) {
            best = sim;
            bw = k;
          }
        }
        if (best > 0) {
          hits++;
          used.add(bw);
          s += best * (this.idf.get(bw) ?? 1);
        }
      }
      for (const p of t.phrases) if (norm.includes(` ${p} `)) s += 2.5;
      // تغطية: سؤال كل كلماته لاقت مكانها أقوى من سؤال بكلمة وحدة صدفة
      const coverage = hits / q.length;
      // وقت التعادل: الموضوع اللي انطابق منه أكتر (نسبةً لحجمه) هو الأقرب
      const focus = used.size / Math.sqrt(t.words.size);
      return { topic: t.topic, score: s * (0.5 + coverage) * (1 + 0.35 * focus) * (1 + (t.topic.prior ?? 0)) };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

/** للاختبارات والمطابقة مع أسماء المواد والزباين. */
export const normalizeText = baseNorm;
