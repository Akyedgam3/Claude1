import type { InvoiceLineDraft } from './commerce';
import type { BookingStatus, CompanyState, HallBooking, HallPeriod, JournalEntry } from './types';

// صالات الأفراح: حجز بالتاريخ والفترة، خدمات بالراس أو مقطوعة، عربون، ومنع الحجز المزدوج.

export const HALL_PERIODS: Record<HallPeriod, string> = { morning: 'صباحي', evening: 'مسائي', full: 'يوم كامل' };
export const BOOKING_STATUS_NAMES: Record<BookingStatus, string> = { tentative: 'حجز مبدئي', confirmed: 'مؤكد', done: 'انتهت المناسبة', invoiced: 'مفوتر', cancelled: 'ملغى' };
export const EVENT_TYPES = ['عرس', 'خطوبة', 'كتب كتاب', 'حنّة', 'تخرج', 'عيد ميلاد', 'عقيقة', 'مولد', 'عزاء', 'حفلة شركة', 'مناسبة أخرى'];
export const DEFAULT_HALLS = ['الصالة الرئيسية'];
/** الخدمات الجاهزة بكبسة. */
export const HALL_SERVICES: { name: string; perGuest?: boolean }[] = [
  { name: 'أجار الصالة' },
  { name: 'ضيافة (بالراس)', perGuest: true },
  { name: 'عشاء (بالراس)', perGuest: true },
  { name: 'كيك' },
  { name: 'كوشة وتزيين' },
  { name: 'DJ وصوت' },
  { name: 'فرقة / زفة' },
  { name: 'تصوير فوتو وفيديو' },
  { name: 'إضاءة وليزر' },
  { name: 'ورد طبيعي' },
  { name: 'سيارة العرس' },
];

export const isOpenBooking = (b: HallBooking) => b.status !== 'cancelled';
const overlaps = (a: HallPeriod, b: HallPeriod) => a === 'full' || b === 'full' || a === b;

/** الحجوزات اللي بتتعارض مع هالحجز (نفس الصالة ونفس اليوم والفترة متداخلة). */
export function bookingConflicts(state: CompanyState, b: Pick<HallBooking, 'id' | 'hall' | 'date' | 'period' | 'status'>): HallBooking[] {
  if (b.status === 'cancelled') return [];
  return Object.values(state.bookings ?? {}).filter((x) => x.id !== b.id && isOpenBooking(x) && x.hall === b.hall && x.date === b.date && overlaps(x.period, b.period));
}

export function bookingLineAmount(l: HallBooking['lines'][number]): number {
  return Math.round(l.qty * l.price);
}

export function bookingTotals(b: Pick<HallBooking, 'lines' | 'discount'>) {
  const gross = b.lines.reduce((s, l) => s + bookingLineAmount(l), 0);
  const discount = Math.min(b.discount ?? 0, gross);
  return { gross, discount, total: gross - discount };
}

export function bookingDeposits(state: CompanyState, b: HallBooking): number {
  return b.deposits.filter((d) => !state.voided[d.entryId]).reduce((s, d) => s + d.amount, 0);
}

export function bookingToInvoiceLines(b: HallBooking): InvoiceLineDraft[] {
  return b.lines.filter((l) => l.qty > 0 && l.price >= 0).map((l) => ({ itemId: null, description: l.perGuest ? `${l.name} — ${l.qty} شخص` : l.name, qty: l.qty, price: l.price }));
}

export function hallNames(state: CompanyState): string[] {
  const set = new Set([...(state.info?.halls?.length ? state.info.halls : DEFAULT_HALLS), ...Object.values(state.bookings ?? {}).map((b) => b.hall)]);
  return [...set];
}

/** مصاريف الصالة الجاهزة: الاسم وحساب المصروف. */
export const HALL_EXPENSES: { name: string; accountId: string }[] = [
  { name: 'مازوت المولدة', accountId: '5204' },
  { name: 'كهرباء ومي', accountId: '5203' },
  { name: 'رواتب العمال', accountId: '5201' },
  { name: 'أجار', accountId: '5202' },
  { name: 'قهوة', accountId: '5209' },
  { name: 'سكر', accountId: '5209' },
  { name: 'شاي', accountId: '5209' },
  { name: 'مي شرب', accountId: '5209' },
  { name: 'غاز', accountId: '5209' },
  { name: 'منظفات ومحارم', accountId: '5209' },
  { name: 'صيانة', accountId: '5207' },
];

/** المصاريف المدفوعة بالشهر (سندات دفع على حسابات المصاريف 5xxx)، مع اسم البند من أول البيان. */
export function monthExpenses(state: CompanyState, ym: string): { entry: JournalEntry; name: string; note: string; amount: number }[] {
  const out: { entry: JournalEntry; name: string; note: string; amount: number }[] = [];
  for (const e of state.entries) {
    if (!e.date.startsWith(ym) || e.voidOf || state.voided[e.id] || e.source?.type !== 'payment') continue;
    const amount = e.lines.filter((l) => l.accountId.startsWith('5') && !l.partyId).reduce((s, l) => s + l.baseDebit, 0);
    if (!amount) continue;
    const [name, ...rest] = e.memo.replace(/^سند (?:دفع|قبض) رقم \d+:\s*/, '').split(':');
    out.push({ entry: e, name: (name ?? '').trim() || 'مصروف', note: rest.join(':').trim(), amount });
  }
  return out.sort((a, b) => b.entry.date.localeCompare(a.entry.date));
}

/** رسالة واتساب للزبون: تأكيد الحجز، أو تذكير إذا المناسبة قريبة. */
const PERIOD_RANK: Record<string, number> = { morning: 0, full: 1, evening: 2 };
/** ترتيب الحجوزات بالجدول: بالتاريخ، وبنفس اليوم بالساعة ثم الفترة (صباحي قبل المسائي) ثم الصالة. */
export function compareBookings(a: HallBooking, b: HallBooking): number {
  return a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99') || (PERIOD_RANK[a.period] ?? 9) - (PERIOD_RANK[b.period] ?? 9) || a.hall.localeCompare(b.hall);
}

/** ساعات الحفل كنص: «20:00 – 23:30» أو «من 20:00» أو فاضي. */
export function bookingHours(b: Pick<HallBooking, 'startTime' | 'endTime'>): string {
  if (b.startTime && b.endTime) return `${b.startTime} – ${b.endTime}`;
  if (b.startTime) return `من ${b.startTime}`;
  if (b.endTime) return `لـ ${b.endTime}`;
  return '';
}

/** رسالة الحجز. greet: اسم اللي منبعتله (افتراضياً اسم الزبون). */
export function bookingMessage(state: CompanyState, b: HallBooking, opts: { today: string; withPrices?: boolean; fmt?: (minor: number) => string; greet?: string }): string {
  const days = Math.round((Date.parse(b.date) - Date.parse(opts.today)) / 864e5);
  const party = state.parties[b.partyId];
  const [y, m, d] = b.date.split('-');
  const dayName = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(b.date + 'T12:00:00Z').getUTCDay()];
  const hours = bookingHours(b);
  const when = `${dayName} ${d}/${m}/${y} (${HALL_PERIODS[b.period]}${hours ? `، ${hours}` : ''})`;
  const what = `${b.eventType}${b.title ? ` — ${b.title}` : ''}`;
  const name = opts.greet ?? party?.name ?? '';
  const lines = [`مرحباً ${name ? `${name} ` : ''}🌹`];
  if (days >= 0 && days <= 3) lines.push(`تذكير بموعد ${what} ${days === 0 ? 'اليوم' : days === 1 ? 'بكرا' : `بعد ${days} أيام`}، ${when} بـ${b.hall}.`);
  else lines.push(`تم تأكيد حجز ${what} بـ${b.hall} يوم ${when}.`);
  if (b.extras) lines.push(`الإضافات: ${b.extras}`);
  if (b.guests) lines.push(`عدد الضيوف: ${b.guests}`);
  if (opts.withPrices !== false && opts.fmt) {
    const t = bookingTotals(b).total, dep = bookingDeposits(state, b);
    lines.push(`قيمة الحجز: ${opts.fmt(t)}`);
    if (dep) lines.push(`العربون المقبوض: ${opts.fmt(dep)}`, `الباقي: ${opts.fmt(Math.max(0, t - dep))}`);
  }
  lines.push('', `${state.info?.name ?? ''}${state.info?.phone ? ` · ${state.info.phone}` : ''}`, 'نتمنى لكم مناسبة سعيدة 🎉');
  return lines.join('\n');
}

/** جدول الحجوزات كرسالة واتساب: سطر لكل حجز (التاريخ، الفترة والساعات، الصالة، المناسبة، الزبون، الضيوف). */
export function bookingsTableText(state: CompanyState, rows: HallBooking[], opts: { title: string; withPrices?: boolean; fmt?: (b: HallBooking, minor: number) => string }): string {
  const out = [`📋 ${opts.title}`, `${state.info?.name ?? ''}`, ''];
  for (const b of rows) {
    const [y, m, d] = b.date.split('-');
    const dayName = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(b.date + 'T12:00:00Z').getUTCDay()];
    const hours = bookingHours(b);
    out.push(`📅 ${dayName} ${d}/${m}/${y} · ${HALL_PERIODS[b.period]}${hours ? ` (${hours})` : ''}`);
    out.push(`${b.eventType}${b.title ? ` — ${b.title}` : ''}${hallNames(state).length > 1 ? ` · ${b.hall}` : ''}`);
    const who = [state.parties[b.partyId]?.name, b.extras ?? '', b.guests ? `${b.guests} ضيف` : '', b.status === 'cancelled' || b.status === 'tentative' ? BOOKING_STATUS_NAMES[b.status] : ''].filter(Boolean);
    if (who.length) out.push(who.join(' · '));
    if (opts.withPrices && opts.fmt) {
      const t = bookingTotals(b).total, dep = bookingDeposits(state, b);
      out.push(`القيمة ${opts.fmt(b, t)} · العربون ${opts.fmt(b, dep)} · الباقي ${opts.fmt(b, Math.max(0, t - dep))}`);
    }
    out.push('');
  }
  out.push(`المجموع: ${rows.length} حجز`);
  return out.join('\n');
}
