import { accountBalance, cashMovement, employeeBalance, incomeStatement, partyBalance, type CompanyState } from '../../../core';
import { Brain, normalizeText, tokens, type Link, type Topic } from './engine';
import { TOPICS } from './knowledge';

export interface Reply {
  text: string;
  links: Link[];
  /** اقتراحات أسئلة (لما ما نكون متأكدين، أو مواضيع قريبة). */
  suggest: string[];
  /** الجواب رقم من بيانات الشركة (مش شرح). */
  data?: boolean;
  /** السؤال الكامل اللي انفهم (بعد دمج السؤال التكميلي باللي قبله) — بيصير «السابق» للسؤال الجاي. */
  asked?: string;
}

export interface AskContext {
  state: CompanyState;
  can: (perm: string) => boolean;
  /** الشاشات اللي المستخدم بيقدر يفتحها (حسب الصلاحيات والميزات). */
  screens: Set<string>;
  today: string;
  fmt: (minor: number, currency?: string) => string;
}

let brain: Brain | null = null;
const getBrain = () => (brain ??= new Brain(TOPICS));

/** «شقد / كم / قديش...» = سؤال عن رقم. */
const HOW_MUCH = /(^| )(شقد|قديش|قدي|اديش|ادي|كم|كام|قداش|شو رصيد|رصيد|اجمالي|مجموع|حجم|باقي|بقي|ضل|موجود)( |$)/;

const HOW_TO = /(^| )(كيف|شلون|كيفيه|ازاي|وين|فين|اين|طريقه|خطوات|بدي اعرف كيف|علمني)( |$)/;

function period(norm: string, today: string): { from: string; to: string; label: string } {
  const d = new Date(`${today}T12:00:00`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  if (/(امبارح|البارحه|مبارح|امس)/.test(norm)) {
    const y = new Date(d);
    y.setDate(d.getDate() - 1);
    return { from: iso(y), to: iso(y), label: 'مبارح' };
  }
  if (/(الاسبوع|هالجمعه|الجمعه هي|اسبوع)/.test(norm)) {
    const s = new Date(d);
    s.setDate(d.getDate() - 6);
    return { from: iso(s), to: today, label: 'آخر 7 أيام' };
  }
  if (/(السنه|هالسنه|سنوي|العام)/.test(norm)) return { from: `${today.slice(0, 4)}-01-01`, to: today, label: 'هالسنة' };
  if (/(الشهر|هالشهر|شهري|شهر)/.test(norm)) return { from: `${today.slice(0, 8)}01`, to: today, label: 'هالشهر' };
  return { from: today, to: today, label: 'اليوم' };
}

/** أطول اسم (مادة/زبون/موظف) موجود بالسؤال. */
/** بدون «ال/بال/وال/لل» بأول كل كلمة: «الرز المصري» = «رز مصري». */
const bare = (text: string) =>
  text
    .split(' ')
    .map((w) => {
      const r = w.replace(/^(وبال|بال|وال|فال|كال|لل|ال)/, '');
      return r.length >= 2 ? r : w;
    })
    .join(' ');

function findName<T>(norm: string, list: T[], name: (x: T) => string): T | null {
  let best: T | null = null;
  let bestLen = 0;
  const padded = ` ${bare(norm)} `;
  for (const x of list) {
    const n = bare(normalizeText(name(x)));
    if (n.length < 3) continue;
    // الاسم كامل، أو أول كلمتين منه إذا طويل
    const short = n.split(' ').slice(0, 2).join(' ');
    const hit = padded.includes(` ${n} `) ? n.length : short.length >= 4 && padded.includes(` ${short} `) ? short.length : padded.includes(` ${n}`) && n.length >= 4 ? n.length : 0;
    if (hit > bestLen) {
      best = x;
      bestLen = hit;
    }
  }
  return best;
}

/** مواد أول كلمة من اسمها موجودة بالسؤال (مرتبة حسب كم كلمة من الاسم انذكرت). */
function looseItems<T extends { name: string }>(norm: string, list: T[]): T[] {
  const q = new Set(bare(norm).split(' '));
  const scored: { x: T; n: number }[] = [];
  for (const x of list) {
    const words = bare(normalizeText(x.name)).split(' ');
    if (!words[0] || words[0].length < 2 || !q.has(words[0])) continue;
    scored.push({ x, n: words.filter((w) => q.has(w)).length });
  }
  const top = Math.max(0, ...scored.map((s) => s.n));
  return scored.filter((s) => s.n === top).map((s) => s.x);
}

const allowedLinks = (links: Link[] | undefined, ctx: AskContext) => (links ?? []).filter((l) => ctx.screens.has(l.screen));

/** جواب من بيانات الشركة نفسها (مبيعات، ربح، صندوق، ديون، مادة، زبون، موظف). null إذا السؤال مش عن رقم. */
function fromData(question: string, ctx: AskContext, focus?: string): Reply | null {
  const { state, can, fmt } = ctx;
  const norm = normalizeText(question);
  const t = new Set(tokens(question));
  // «كيف / شلون / وين...» = سؤال عن طريقة، مش عن رقم
  const howTo = HOW_TO.test(norm);
  const asks = HOW_MUCH.test(norm) && !howTo;
  const fin = can('reports.financial');
  const p = period(norm, ctx.today);
  const reply = (text: string, links: Link[] = []): Reply => ({ text, links: allowedLinks(links, ctx), suggest: [], data: true });

  // موظف بالاسم
  // بسؤال تكميلي («ومحمد؟») الاسم الجديد أولى من اسم السؤال القديم
  const fNorm = focus ? normalizeText(focus) : norm;
  const focusHasName =
    !!focus &&
    (!!findName(fNorm, Object.values(state.employees ?? {}), (e) => e.name) ||
      !!findName(fNorm, Object.values(state.parties), (x) => x.name) ||
      !!findName(fNorm, Object.values(state.items), (i) => i.name));
  const pickAny = <T,>(list: T[], name: (x: T) => string) => (focusHasName ? findName(fNorm, list, name) : findName(norm, list, name));
  const emp = pickAny(Object.values(state.employees ?? {}), (e) => e.name);
  if (emp && can('employees.manage') && (asks || t.has('راتب') || t.has('سلفه') || t.has('موظف') || /(^| )(عليه|الو|اله|له|حسابه)( |$)/.test(norm))) {
    const b = employeeBalance(state, emp.id);
    return reply(
      `${emp.name}: راتبه ${fmt(emp.salary)}.\nراتب مستحق ما انصرف: ${fmt(b.salaryDue)} · سلف عليه: ${fmt(b.advances)}\n${b.net >= 0 ? 'الصافي إله' : 'الصافي عليه'}: ${fmt(Math.abs(b.net))}`,
      [{ label: 'الموظفين', screen: 'partners', param: 'employees' }],
    );
  }

  // زبون أو مورد بالاسم
  const party = pickAny(Object.values(state.parties), (x) => x.name);
  if (party && (asks || t.has('دين') || t.has('كشف') || t.has('حساب') || /(^| )(عليه|عليها|الو|الها|اله|له|لها|حسابه|حسابها|رصيده)( |$)/.test(norm))) {
    const b = partyBalance(state, party.id);
    const cur = Object.entries(b.byCurrency).filter(([, v]) => v !== 0);
    const lines = cur.length ? cur.map(([c, v]) => `${v > 0 ? 'عليه إلنا' : 'إله علينا'} ${fmt(Math.abs(v), c)}`) : ['حسابه مصفّى (ما عليه شي وما إله شي).'];
    return reply(`${party.name}:\n${lines.join('\n')}`, [
      { label: 'كشف حسابه', screen: 'parties', param: party.id },
      { label: 'الديون', screen: 'debts' },
    ]);
  }

  // مادة بالاسم (كامل أو أول كلمة منه: «الرز» بتلاقي «رز مصري 1 كغ»)
  const items = Object.values(state.items).filter((i) => !i.archived);
  const item = pickAny(items, (i) => i.name);
  const loose = item ? [] : looseItems(focusHasName ? fNorm : norm, items);
  if (!item && loose.length > 1 && (asks || t.has('سعر') || t.has('مخزون'))) {
    const rows = loose.slice(0, 6).map((i) => `• ${i.name}: ${i.kind === 'service' ? '' : `${(state.stock[i.id]?.totalQty ?? 0).toLocaleString('en')} ${i.unit} · `}${fmt(i.price, i.priceCurrency)}`);
    return reply(`لقيت ${loose.length} مواد:\n${rows.join('\n')}${loose.length > 6 ? '\n…' : ''}`, [{ label: 'المواد', screen: 'items', param: loose[0]!.name.split(' ')[0] }]);
  }
  const theItem = item ?? loose[0];
  if (theItem && (asks || t.has('سعر') || t.has('مخزون'))) {
    const item = theItem;
    const lvl = state.stock[item.id];
    const qty = lvl?.totalQty ?? 0;
    const parts = [`${item.name}:`];
    if (item.kind !== 'service') parts.push(`الموجود: ${qty.toLocaleString('en')} ${item.unit}`);
    parts.push(`سعر المبيع: ${fmt(item.price, item.priceCurrency)}`);
    if (can('costs.view') && lvl?.lastCost) parts.push(`آخر تكلفة: ${fmt(lvl.lastCost)}`);
    if (item.minStock !== undefined && qty <= item.minStock) parts.push('⚠ قربت تخلص، لازم تطلب.');
    return reply(parts.join('\n'), [{ label: 'افتح المادة', screen: 'items', param: item.name }]);
  }

  if (!asks) return null;

  if (t.has('ربح') || t.has('خساره')) {
    if (!fin || !can('costs.view')) return reply('الأرباح بتطلع بس لمين إله صلاحية التقارير المالية والتكاليف.');
    const inc = incomeStatement(state, { from: p.from, to: p.to });
    return reply(`صافي الربح ${p.label}: ${fmt(inc.netProfit)}\n(الإيرادات ${fmt(inc.revenue)} − المصاريف والتكلفة ${fmt(inc.expenses)})`, [
      { label: 'الأرباح والخسائر', screen: 'reports', param: 'income' },
      { label: 'أرباح المواد', screen: 'reports', param: 'items' },
    ]);
  }

  if (t.has('مصروف')) {
    if (!fin) return null;
    let total = 0;
    for (const a of Object.values(state.accounts)) if (a.type === 'expense' && !a.isGroup && a.id !== '5101') total += accountBalance(state, a.id, { from: p.from, to: p.to }).balance;
    return reply(`المصاريف ${p.label} (بدون تكلفة البضاعة): ${fmt(total)}`, [{ label: 'الأرباح والخسائر', screen: 'reports', param: 'income' }]);
  }

  if (t.has('بيع') && !t.has('شراء')) {
    if (!fin && !can('sales.create')) return null;
    const sales = -accountBalance(state, '4101', { from: p.from, to: p.to }).balance;
    const returns = state.accounts['4102'] ? accountBalance(state, '4102', { from: p.from, to: p.to }).balance : 0;
    const count = state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date >= p.from && i.date <= p.to).length;
    return reply(`المبيعات ${p.label}: ${fmt(sales)} (${count} فاتورة)${returns ? `\nالمرتجعات: ${fmt(returns)}` : ''}`, [
      { label: 'إغلاق اليوم', screen: 'reports', param: 'daily' },
      { label: 'سجل الفواتير', screen: 'invoices' },
    ]);
  }

  if (t.has('شراء')) {
    if (!fin) return null;
    const list = state.invoices.filter((i) => i.kind === 'purchase' && !i.voidEntryId && i.date >= p.from && i.date <= p.to);
    const byCur = new Map<string, number>();
    for (const i of list) byCur.set(i.currency, (byCur.get(i.currency) ?? 0) + i.total);
    return reply(`المشتريات ${p.label}: ${list.length} فاتورة${[...byCur].map(([c, v]) => `\n${fmt(v, c)}`).join('')}`, [{ label: 'سجل الفواتير', screen: 'invoices' }]);
  }

  if (t.has('صندوق') || t.has('نقد')) {
    if (!fin) return null;
    const rows = cashMovement(state, { to: ctx.today }).flatMap((r) =>
      Object.entries(r.byCurrency)
        .filter(([, v]) => v.closing !== 0)
        .map(([c, v]) => `${r.account.name}: ${fmt(v.closing, c)}`),
    );
    return reply(rows.join('\n') || 'ما في صناديق', [{ label: 'حركة الصناديق', screen: 'reports', param: 'cash' }]);
  }

  if (t.has('دين')) {
    if (!fin && !can('vouchers.create')) return null;
    const owed = state.accounts['1103'] ? accountBalance(state, '1103').balance : 0;
    const owe = state.accounts['2101'] ? -accountBalance(state, '2101').balance : 0;
    return reply(`لنا عند الزباين: ${fmt(owed)}\nعلينا للموردين: ${fmt(owe)}`, [{ label: 'الديون', screen: 'debts' }]);
  }

  if (t.has('موظف') || t.has('راتب')) {
    if (!can('employees.manage')) return null;
    const emps = Object.values(state.employees ?? {}).filter((e) => e.active);
    const due = emps.reduce((s, e) => s + Math.max(0, employeeBalance(state, e.id).salaryDue), 0);
    return reply(`عندك ${emps.length} موظف، رواتب مستحقة ما انصرفت: ${fmt(due)}`, [{ label: 'الموظفين', screen: 'partners', param: 'employees' }]);
  }

  return null;
}

const GREET = /^(مرحبا|مرحبتين|هلا|اهلين|اهلا|السلام عليكم|سلام|صباح الخير|مسا الخير|مساء الخير|هاي|hi|hello)/;

export const STARTERS = ['كيف بعمل فاتورة مبيع؟', 'شقد بعت اليوم؟', 'كيف بسجل مصروف؟', 'كيف بضيف موظف وراتبه؟', 'وين بشوف الديون؟', 'كيف باخد نسخة احتياطية؟'];

const TIME_WORDS = /(^| )(اليوم|هاليوم|امبارح|البارحه|مبارح|امس|الاسبوع|هالاسبوع|اسبوع|الشهر|هالشهر|شهر|شهري|السنه|هالسنه|سنوي|العام)(?= |$)/g;

/**
 * سؤال تكميلي («وهالشهر؟»، «والربح؟»، «وأحمد؟») بيتفهم مع السؤال اللي قبله.
 * إذا السؤال الجديد فيه وقت، منشيل الوقت القديم حتى ما يتلخبطوا.
 */
export function withContext(question: string, previous: string | undefined): string | null {
  if (!previous) return null;
  const norm = normalizeText(question);
  const words = norm.split(' ').filter(Boolean);
  const followUp = /^و/.test(words[0] ?? '') || tokens(question).length <= 1 || /^(طيب|اوكي|وكمان|كمان|بس)( |$)/.test(norm);
  if (!followUp) return null;
  let prev = normalizeText(previous);
  const cleaned = words.map((w, i) => (i === 0 && /^و../.test(w) ? w.slice(1) : w)).join(' ');
  if (cleaned.match(TIME_WORDS)) prev = prev.replace(TIME_WORDS, ' ');
  return `${prev} ${cleaned}`.replace(/\s+/g, ' ').trim();
}

/** الجواب مع تذكّر السؤال اللي قبله (للأسئلة التكميلية). */
export function askInContext(question: string, ctx: AskContext, previous?: string): Reply {
  const alone = { ...ask(question, ctx), asked: question };
  const combined = withContext(question, previous);
  if (!combined) return alone;
  const merged = { ...ask(combined, ctx, question.trim().replace(/^و(?=\S\S)/, '')), asked: combined };
  // منفضّل الجواب المدموج إذا السؤال لحالو ما انفهم، أو إذا المدموج طلع رقم من البيانات
  const aloneWeak = alone.text.startsWith('ما فهمت') || alone.text.startsWith('اكتبلي');
  if (aloneWeak && !merged.text.startsWith('ما فهمت')) return merged;
  if (merged.data && !alone.data) return merged;
  return alone;
}

/** الجواب على أي سؤال: أول شي من البيانات، وبعدين من دليل البرنامج. */
export function ask(question: string, ctx: AskContext, focus?: string): Reply {
  const q = question.trim();
  const norm = normalizeText(q);
  if (!norm) return { text: 'اكتبلي سؤالك 🙂', links: [], suggest: STARTERS };
  if (GREET.test(norm) && norm.split(' ').length <= 3) return { text: 'أهلين! أنا مساعد وزن. اسألني عن أي شي بالبرنامج: كيف بتعمل شي، وين بتلاقي شي، أو أرقامك (مبيعات، ربح، صندوق، دين زبون، كمية مادة).', links: [], suggest: STARTERS };
  if (/^(شكرا|مشكور|يسلمو|تسلم|يعطيك العافيه|ممتاز|تمام)/.test(norm)) return { text: 'تكرم 🌷 أي سؤال تاني أنا هون.', links: [], suggest: [] };

  const data = fromData(q, ctx, focus);
  const found = getBrain().search(q, 4);
  const top = found[0];
  const sure = top && top.score >= 2.2 && (found.length < 2 || top.score >= found[1]!.score * 1.15);

  if (data) {
    // سؤال عن رقم: الرقم أول، ومعه أقرب شرح كاقتراح
    return { ...data, suggest: found.slice(0, 2).map((f) => f.topic.q) };
  }
  if (!top || top.score < 1.2) {
    return {
      text: 'ما فهمت عليك منيح 😅 جرّب تكتبها بكلمات تانية (مثلاً «كيف بسجل مصروف» أو «وين الديون»)، أو اختار من هدول:',
      links: [],
      suggest: found.length ? found.map((f) => f.topic.q) : STARTERS,
    };
  }
  const best = top.topic;
  const links = allowedLinks(best.go, ctx);
  const hidden = (best.go ?? []).length > 0 && links.length === 0;
  return {
    text: best.a + (hidden ? '\n\n(هالقسم مش ظاهر عندك: يا إما مش مفعّل من الإعدادات ← تخصيص النشاط، يا إما ما عندك صلاحية عليه.)' : ''),
    links,
    suggest: (sure ? found.slice(1, 3) : found.slice(1, 4)).map((f) => f.topic.q),
  };
}

export function topicCount(): number {
  return TOPICS.length;
}

export type { Topic };
