import type { InvoiceLineDraft } from './commerce';
import type { CompanyState, PrintJob, PrintJobLine, PrintJobStatus, PrintLineKind } from './types';

// المكتبة والمطبعة: طلبات طباعة بالمتر المربع (فلكس) أو بالوجه (تصوير وطباعة) أو بالقطعة (كروت وتجليد).

export const PRINT_STATUS: PrintJobStatus[] = ['new', 'design', 'printing', 'ready', 'delivered', 'invoiced', 'cancelled'];
export const PRINT_STATUS_NAMES: Record<PrintJobStatus, string> = {
  new: 'جديد',
  design: 'تصميم',
  printing: 'عالطباعة',
  ready: 'جاهز للتسليم',
  delivered: 'تسلّم',
  invoiced: 'مفوتر',
  cancelled: 'ملغى',
};
export const PRINT_KIND_NAMES: Record<PrintLineKind, string> = { area: 'بالمتر المربع', pages: 'بالصفحة', count: 'بالقطعة' };

/** البنود الجاهزة بكبسة: الاسم وطريقة الحساب والقياس المعتاد. */
export const PRINT_PRESETS: { name: string; kind: PrintLineKind; width?: number; height?: number; pages?: number }[] = [
  { name: 'فلكس', kind: 'area', width: 3, height: 1 },
  { name: 'فلكس باك لايت', kind: 'area', width: 2, height: 1 },
  { name: 'ستيكر / فينيل', kind: 'area', width: 1, height: 1 },
  { name: 'ون واي فيجن', kind: 'area', width: 1, height: 1 },
  { name: 'رول أب', kind: 'count' },
  { name: 'كروت شخصية (1000)', kind: 'count' },
  { name: 'بروشور / فلاير', kind: 'count' },
  { name: 'تصوير أبيض وأسود', kind: 'pages', pages: 1 },
  { name: 'تصوير ملون', kind: 'pages', pages: 1 },
  { name: 'طباعة ليزر', kind: 'pages', pages: 1 },
  { name: 'طباعة A3', kind: 'pages', pages: 1 },
  { name: 'تجليد حلزوني', kind: 'count' },
  { name: 'تجليد حراري / كرتون', kind: 'count' },
  { name: 'تغليف حراري (لامينيشن)', kind: 'count' },
  { name: 'ختم', kind: 'count' },
];
export const PRINT_EXTRAS = ['تصميم', 'تركيب', 'عيون وتشطيب', 'توصيل', 'إطار / شاسيه'];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** مساحة القطعة الوحدة بالمتر المربع. */
export function printPieceArea(l: Pick<PrintJobLine, 'width' | 'height'>): number {
  return r2((l.width ?? 0) * (l.height ?? 0));
}

/** الكمية اللي بتنحسب: الأمتار المربعة كلها، أو الوجوه كلها، أو عدد القطع. */
export function printLineUnits(l: Pick<PrintJobLine, 'kind' | 'width' | 'height' | 'pages' | 'qty'>): number {
  if (l.kind === 'area') return r2(printPieceArea(l) * l.qty);
  if (l.kind === 'pages') return Math.round((l.pages ?? 1) * l.qty);
  return l.qty;
}

export function printLineAmount(l: PrintJobLine): number {
  return Math.round(printLineUnits(l) * l.price);
}

/** وصف البند متل ما بينطبع: «فلكس (3 × 1.5 م) × 2»، «تصوير ملون — 20 صفحة × 5 نسخ». */
export function printLineText(l: PrintJobLine): string {
  if (l.kind === 'area') return `${l.name} (${l.width} × ${l.height} م)${l.qty !== 1 ? ` × ${l.qty}` : ''}`;
  if (l.kind === 'pages') return `${l.name} — ${l.pages ?? 1} ${(l.pages ?? 1) === 1 ? 'وجه' : 'صفحة'} × ${l.qty} ${l.qty === 1 ? 'نسخة' : 'نسخ'}`;
  return l.name;
}

export function printUnitName(kind: PrintLineKind): string {
  return kind === 'area' ? 'م²' : kind === 'pages' ? 'وجه' : 'قطعة';
}

export function printJobTotals(job: Pick<PrintJob, 'lines' | 'extras' | 'discount'>) {
  const work = job.lines.reduce((s, l) => s + printLineAmount(l), 0);
  const extras = job.extras.reduce((s, x) => s + x.amount, 0);
  const discount = Math.min(job.discount ?? 0, work + extras);
  const meters = r2(job.lines.filter((l) => l.kind === 'area').reduce((s, l) => s + printLineUnits(l), 0));
  const pages = job.lines.filter((l) => l.kind === 'pages').reduce((s, l) => s + printLineUnits(l), 0);
  return { work, extras, discount, total: work + extras - discount, meters, pages };
}

export function printJobDeposits(state: CompanyState, job: PrintJob): number {
  return job.deposits.filter((d) => !state.voided[d.entryId]).reduce((s, d) => s + d.amount, 0);
}

/** تكلفة المواد التقديرية (بوسطي تكلفة المخزون الحالية) لحساب ربح الطلب. */
export function printJobMaterialCost(state: CompanyState, job: Pick<PrintJob, 'lines'>): number {
  let cost = 0;
  for (const l of job.lines) {
    if (!l.material) continue;
    const st = state.stock[l.material.itemId];
    if (st && st.totalQty > 0) cost += (st.value / st.totalQty) * l.material.qty;
  }
  return Math.round(cost);
}

export function printJobToInvoiceLines(job: PrintJob): InvoiceLineDraft[] {
  return [
    ...job.lines
      .filter((l) => printLineUnits(l) > 0)
      .map((l) => ({ itemId: null, description: printLineText(l), qty: printLineUnits(l), price: l.price, ...(l.note ? { note: l.note } : {}) })),
    ...job.extras.filter((x) => x.amount > 0).map((x) => ({ itemId: null, description: x.description, qty: 1, price: x.amount })),
  ];
}
