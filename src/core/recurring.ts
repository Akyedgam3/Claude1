// المصاريف الثابتة (إيجار، كهربا، رواتب...): شو مدفوع وشو باقي بكل شهر. السند مربوط بشهره من معرّف مصدره `rec:<id>:<YYYY-MM>:…`.
import type { CompanyState, JournalEntry, RecurringExpense } from './types';

/** سندات الدفع (غير الملغاة) لمصروف ثابت عن شهر معيّن */
export function recurringPayments(state: CompanyState, id: string, month: string): JournalEntry[] {
  const prefix = `rec:${id}:${month}:`;
  return state.entries.filter((e) => e.source?.type === 'payment' && e.source.id.startsWith(prefix) && !e.voidOf && !state.voided[e.id]);
}

export interface RecurringRow {
  def: RecurringExpense;
  /** تاريخ الاستحقاق بهالشهر */
  due: string;
  paid: JournalEntry | null;
  /** المبلغ المدفوع فعلاً (بعملة المصروف) */
  paidAmount: number;
  status: 'paid' | 'overdue' | 'due-soon' | 'upcoming';
}

/** حالة كل المصاريف الثابتة بشهر (today = تاريخ اليوم YYYY-MM-DD) */
export function recurringStatus(state: CompanyState, month: string, today: string): RecurringRow[] {
  return (state.info?.recurring ?? [])
    .filter((r) => !r.archived)
    .map((def) => {
      const due = `${month}-${String(def.day).padStart(2, '0')}`;
      const paid = recurringPayments(state, def.id, month)[0] ?? null;
      const paidAmount = paid ? paid.lines.filter((l) => l.accountId === def.accountId).reduce((t, l) => t + l.debit - l.credit, 0) : 0;
      const days = (Date.parse(due) - Date.parse(today)) / 86_400_000;
      const status: RecurringRow['status'] = paid ? 'paid' : days < 0 ? 'overdue' : days <= 5 ? 'due-soon' : 'upcoming';
      return { def, due, paid, paidAmount, status };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.def.name.localeCompare(b.def.name));
}
