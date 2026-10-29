import type { InvoiceLineDraft } from './commerce';
import type { BookingStatus, CompanyState, HallBooking, HallPeriod } from './types';

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
