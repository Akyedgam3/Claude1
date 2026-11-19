// فحص صحة البيانات: نفس قواعد اختبار الضغط (tests/fuzz-consistency.test.ts) بس على بيانات الزبون الحقيقية.
// بيطلع بتقرير قصير بينبعت للدعم بدل «عنا خلل».
import { SYSTEM_ACCOUNTS } from './chart-templates';
import { costPlan } from './recost';
import { partyBalance, partyDebts, trialBalance } from './reports';
import type { CompanyState } from './types';

export interface HealthIssue {
  level: 'error' | 'warn' | 'info';
  text: string;
}

export interface HealthReport {
  ok: boolean;
  issues: HealthIssue[];
  stats: Record<string, number>;
}

export function healthCheck(state: CompanyState): HealthReport {
  const issues: HealthIssue[] = [];
  // 1) كل قيد متوازن، والمجموع متوازن
  let bad = 0;
  for (const e of state.entries) {
    const d = e.lines.reduce((s, l) => s + l.baseDebit, 0);
    const c = e.lines.reduce((s, l) => s + l.baseCredit, 0);
    if (d !== c) bad++;
  }
  if (bad) issues.push({ level: 'error', text: `${bad} قيد غير متوازن` });
  const tb = trialBalance(state);
  if (tb.totalDebit !== tb.totalCredit) issues.push({ level: 'error', text: 'ميزان المراجعة غير متوازن' });
  // 2) حساب المخزون = قيمة البضاعة
  let account = 0;
  for (const e of state.entries) for (const l of e.lines) if (l.accountId === SYSTEM_ACCOUNTS.inventory) account += l.baseDebit - l.baseCredit;
  const value = Object.values(state.stock).reduce((s, x) => s + x.value, 0);
  if (account !== value) issues.push({ level: 'error', text: `حساب المخزون (${account}) غير قيمة البضاعة (${value})` });
  // 3) الكمية بكل مستودع = المجموع
  let qtyBad = 0;
  for (const st of Object.values(state.stock)) {
    const sum = Object.values(st.qty).reduce((s, q) => s + q, 0);
    if (Math.abs(sum - st.totalQty) > 1e-6) qtyBad++;
  }
  if (qtyBad) issues.push({ level: 'error', text: `${qtyBad} مادة كميتها بالمستودعات غير مجموعها` });
  // 4) دين كل شخص = الباقي من حركاته المفتوحة
  let debtBad = 0;
  for (const pid of Object.keys(state.parties)) {
    const bal = partyBalance(state, pid);
    for (const d of partyDebts(state, pid)) {
      const open = d.open.reduce((s, m) => s + m.remaining, 0);
      if (open !== d.balance || d.balance !== (bal.byCurrency[d.currency] ?? 0)) debtBad++;
    }
  }
  if (debtBad) issues.push({ level: 'error', text: `${debtBad} حساب زبون/مورد الباقي من فواتيره غير رصيده` });
  // 5) كل فاتورة إلها قيد
  const entryIds = new Set(state.entries.map((e) => e.id));
  const orphan = state.invoices.filter((i) => !entryIds.has(i.entryId)).length;
  if (orphan) issues.push({ level: 'error', text: `${orphan} فاتورة بدون قيد` });
  // 6) التكاليف مصحّحة
  const plan = costPlan(state);
  if (plan.lines.length) issues.push({ level: 'warn', text: `${plan.lines.length} سطر تكلفته بدها تصحيح (بتتصحّح لحالها بأول فتحة للشركة)` });
  // معلومات (مش أخطاء)
  const negative = Object.entries(state.stock).filter(([id, s]) => s.totalQty < -1e-9 && !state.items[id]?.archived).length;
  if (negative) issues.push({ level: 'info', text: `${negative} مادة رصيدها بالسالب (انباعت قبل ما تنشرى)` });
  const drafts = Object.keys(state.drafts ?? {}).length;
  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    stats: {
      invoices: state.invoices.length,
      entries: state.entries.length,
      items: Object.keys(state.items).length,
      parties: Object.keys(state.parties).length,
      users: Object.keys(state.users).length,
      drafts,
    },
  };
}
