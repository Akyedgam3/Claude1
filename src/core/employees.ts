// الموظفين والرواتب: بطاقة لكل موظف (اسمه، رقمه، عمله، راتبه) وكل حركة عليه قيد محاسبي
// (مصدره employee) فبتطلع بدفتر اليومية والصندوق والتقارير متل أي حركة:
//   استحقاق راتب / مكافأة:   رواتب وأجور  ← رواتب مستحقة
//   خصم / عقوبة:              رواتب مستحقة ← رواتب وأجور
//   دفع راتب:                 رواتب مستحقة ← الصندوق
//   سلفة:                     سلف الموظفين ← الصندوق
//   خصم سلفة من الراتب:       رواتب مستحقة ← سلف الموظفين
import type { CompanyState, Employee, JournalEntry } from './types';

export type EmployeeMoveKind = 'accrual' | 'bonus' | 'deduction' | 'payment' | 'advance' | 'advance_deduct';

export const EMPLOYEE_MOVE_NAMES: Record<EmployeeMoveKind, string> = {
  accrual: 'استحقاق راتب',
  bonus: 'مكافأة',
  deduction: 'خصم',
  payment: 'دفع راتب',
  advance: 'سلفة',
  advance_deduct: 'خصم سلفة من الراتب',
};

export const PAY_PERIOD_NAMES: Record<Employee['payPeriod'], string> = { monthly: 'شهري', weekly: 'أسبوعي', daily: 'يومي' };

/** الحسابات: بتنعمل لحالها إذا مش موجودة بدليل الحسابات. */
export const EMPLOYEE_ACCOUNTS = {
  salaries: { id: '5201', name: 'رواتب وأجور', type: 'expense', parents: ['52', '5'] },
  payable: { id: '2105', name: 'رواتب مستحقة', type: 'liability', parents: ['21', '2'] },
  advances: { id: '1106', name: 'سلف الموظفين', type: 'asset', parents: ['11', '1'] },
} as const;

export interface EmployeeMove {
  entryId: string;
  employeeId: string;
  kind: EmployeeMoveKind;
  /** الشهر/الفترة اللي بيخصها الاستحقاق (2026-11) إذا في. */
  period?: string;
  date: string;
  amount: number; // بالعملة الأساسية
  memo: string;
  createdBy: string;
  voided: boolean;
}

/** معرّف مصدر القيد: employeeId|kind|uuid|period */
export const employeeSourceId = (employeeId: string, kind: EmployeeMoveKind, period?: string) => `${employeeId}|${kind}|${crypto.randomUUID()}${period ? `|${period}` : ''}`;

/** حركات الموظفين (من القيود)، الأقدم أولاً. */
export function employeeMoves(state: CompanyState, employeeId?: string): EmployeeMove[] {
  const voided = new Set(state.entries.filter((e) => e.voidOf).map((e) => e.voidOf!));
  const out: EmployeeMove[] = [];
  for (const e of state.entries) {
    if (e.source?.type !== 'employee' || e.voidOf) continue;
    const [eid, kind, , period] = e.source.id.split('|') as [string, EmployeeMoveKind, string, string | undefined];
    if (employeeId && eid !== employeeId) continue;
    out.push({ entryId: e.id, employeeId: eid, kind, ...(period ? { period } : {}), date: e.date, amount: moveAmount(e), memo: e.memo, createdBy: e.createdBy, voided: voided.has(e.id) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || 0);
}

const moveAmount = (e: JournalEntry) => e.lines.reduce((s, l) => s + l.baseDebit, 0);

export interface EmployeeBalance {
  /** كل اللي استحقلو (رواتب + مكافآت − خصومات). */
  earned: number;
  /** كل اللي انصرفلو (دفعات + سلف). */
  received: number;
  /** الراتب المستحق اللي لسا ما انصرف (بعد خصم السلف المخصومة). */
  salaryDue: number;
  /** السلف اللي لسا ما انخصمت. */
  advances: number;
  /** الصافي: موجب = إلو علينا، سالب = علي (سلف أكتر من مستحقه). */
  net: number;
}

export function employeeBalance(state: CompanyState, employeeId: string): EmployeeBalance {
  let accr = 0, ded = 0, paid = 0, adv = 0, advDed = 0;
  for (const m of employeeMoves(state, employeeId)) {
    if (m.voided) continue;
    if (m.kind === 'accrual' || m.kind === 'bonus') accr += m.amount;
    else if (m.kind === 'deduction') ded += m.amount;
    else if (m.kind === 'payment') paid += m.amount;
    else if (m.kind === 'advance') adv += m.amount;
    else if (m.kind === 'advance_deduct') advDed += m.amount;
  }
  const salaryDue = accr - ded - paid - advDed;
  const advances = adv - advDed;
  return { earned: accr - ded, received: paid + adv, salaryDue, advances, net: salaryDue - advances };
}

/** الشهر بصيغة 2026-11 من تاريخ. */
export const monthOf = (date: string) => date.slice(0, 7);

/** هل انسجّل استحقاق راتب لهالموظف عن هالفترة (وما انلغى)؟ */
export function accruedFor(state: CompanyState, employeeId: string, period: string): boolean {
  return employeeMoves(state, employeeId).some((m) => m.kind === 'accrual' && m.period === period && !m.voided);
}
