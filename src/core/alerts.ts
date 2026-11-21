// «التنبيهات» (2.0.1): كل شي بدو انتباه اليوم بمكان واحد — نواقص، صلاحية، ديون وأقساط متأخرة، مصاريف ثابتة، بيع تحت الكلفة، سعر صرف قديم، مسودات.
// قراءة بس من الحالة. كل تنبيه إلو الصلاحية اللي لازم تكون مع المستخدم حتى يشوفه، والشاشة اللي بتنفتح منه.
import { installmentState } from './electronics';
import { displayDecimals } from './money';
import type { Permission } from './permissions';
import { recurringStatus } from './recurring';
import { partyBalance, stockReport } from './reports';
import { expiringBatches } from './stock';
import type { CompanyState } from './types';

export type AlertLevel = 'bad' | 'warn' | 'info';

export interface AppAlert {
  id: string;
  level: AlertLevel;
  title: string;
  /** أمثلة (أسماء مواد، زباين...) لحد 6 */
  lines: string[];
  more: number;
  /** الشاشة اللي بتنفتح من زر التنبيه */
  screen: string;
  action: string;
  perm: Permission;
}

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const take = <T,>(list: T[], f: (x: T) => string) => ({ lines: list.slice(0, 6).map(f), more: Math.max(0, list.length - 6) });
const qtyText = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('en');

export function alertsFor(state: CompanyState, today: string): AppAlert[] {
  const out: AppAlert[] = [];
  const base = state.info?.baseCurrency ?? 'SYP';
  const fmt = (minor: number, cur = base) => {
    const dec = displayDecimals(state, cur);
    return `${(minor / 10 ** dec).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: dec })} ${state.currencies[cur]?.symbol ?? cur}`;
  };

  // ─── المخزون ───
  const stock = stockReport(state).filter((r) => !r.item.archived);
  const negative = stock.filter((r) => r.qty < -1e-9);
  if (negative.length)
    out.push({ id: 'stock-negative', level: 'bad', title: `${negative.length} مادة رصيدها بالسالب (انباعت أكتر من الموجود)`, ...take(negative, (r) => `${r.item.name}: ${qtyText(r.qty)} ${r.item.unit}`), screen: 'stock', action: 'الجرد', perm: 'reports.stock' });
  const out0 = stock.filter((r) => Math.abs(r.qty) <= 1e-9 && r.item.minStock !== undefined);
  const low = stock.filter((r) => r.low && r.qty > 1e-9);
  if (out0.length)
    out.push({ id: 'stock-out', level: 'bad', title: `${out0.length} مادة خلصت`, ...take(out0, (r) => r.item.name), screen: 'stock', action: 'الجرد والنواقص', perm: 'reports.stock' });
  if (low.length)
    out.push({ id: 'stock-low', level: 'warn', title: `${low.length} مادة قربت تخلص (تحت الحد الأدنى)`, ...take(low, (r) => `${r.item.name}: باقي ${qtyText(r.qty)} ${r.item.unit} (الحد ${qtyText(r.item.minStock ?? 0)})`), screen: 'stock', action: 'الجرد والنواقص', perm: 'reports.stock' });

  const exp = expiringBatches(state, today, 30).filter((b) => !b.item.archived);
  const expired = exp.filter((b) => b.expired);
  const soon = exp.filter((b) => !b.expired);
  if (expired.length)
    out.push({ id: 'expired', level: 'bad', title: `${expired.length} دفعة منتهية الصلاحية وما زالت بالمخزون`, ...take(expired, (b) => `${b.item.name} (${b.batch || 'بدون رقم'}): ${qtyText(b.qty)} ${b.item.unit}، انتهت ${b.expiry}`), screen: 'stock', action: 'سجّلها تالف', perm: 'reports.stock' });
  if (soon.length)
    out.push({ id: 'expiring', level: 'warn', title: `${soon.length} دفعة بتنتهي صلاحيتها خلال شهر`, ...take(soon, (b) => `${b.item.name}: ${qtyText(b.qty)} ${b.item.unit}، بتنتهي ${b.expiry}`), screen: 'stock', action: 'المخزون', perm: 'reports.stock' });

  // ─── الديون والأقساط ───
  const lateDebts = Object.values(state.parties)
    .filter((p) => !p.archived && p.debtDue && p.debtDue < today)
    .map((p) => ({ p, bal: partyBalance(state, p.id).base }))
    .filter((x) => x.bal > 0)
    .sort((a, b) => b.bal - a.bal);
  if (lateDebts.length)
    out.push({ id: 'debts-late', level: 'bad', title: `${lateDebts.length} زبون تأخّر عن موعد السداد`, ...take(lateDebts, (x) => `${x.p.name}: ${fmt(x.bal)} (الموعد ${x.p.debtDue})`), screen: 'debts', action: 'الديون', perm: 'balances.view' });
  const soonDebts = Object.values(state.parties)
    .filter((p) => !p.archived && p.debtDue && p.debtDue >= today && p.debtDue <= addDays(today, 3))
    .map((p) => ({ p, bal: partyBalance(state, p.id).base }))
    .filter((x) => x.bal > 0);
  if (soonDebts.length)
    out.push({ id: 'debts-soon', level: 'info', title: `${soonDebts.length} موعد سداد خلال 3 أيام`, ...take(soonDebts, (x) => `${x.p.name}: ${fmt(x.bal)} (${x.p.debtDue === today ? 'اليوم' : x.p.debtDue})`), screen: 'debts', action: 'الديون', perm: 'balances.view' });

  const lateInst = Object.values(state.installments ?? {})
    .filter((pl) => pl.status === 'active')
    .map((pl) => ({ pl, st: installmentState(state, pl, today) }))
    .filter((x) => x.st.overdueCount > 0);
  if (lateInst.length)
    out.push({ id: 'installments-late', level: 'bad', title: `${lateInst.length} تقسيط عليه أقساط متأخرة`, ...take(lateInst, (x) => `${state.parties[x.pl.partyId]?.name ?? '—'}: ${x.st.overdueCount} قسط (${fmt(x.st.overdueAmount, x.pl.currency)})`), screen: 'installments', action: 'التقسيط', perm: 'balances.view' });

  // ─── المصاريف الثابتة ───
  const month = today.slice(0, 7);
  const rec = recurringStatus(state, month, today);
  const recLate = rec.filter((r) => r.status === 'overdue');
  const recSoon = rec.filter((r) => r.status === 'due-soon');
  if (recLate.length)
    out.push({ id: 'recurring-late', level: 'warn', title: `${recLate.length} مصروف ثابت فات موعده وما انسجّل`, ...take(recLate, (r) => `${r.def.name}: ${fmt(r.def.amount, r.def.currency)} (يوم ${r.def.day})`), screen: 'recurring', action: 'المصاريف الثابتة', perm: 'vouchers.create' });
  if (recSoon.length)
    out.push({ id: 'recurring-soon', level: 'info', title: `${recSoon.length} مصروف ثابت مستحق قريباً`, ...take(recSoon, (r) => `${r.def.name}: ${fmt(r.def.amount, r.def.currency)} (يوم ${r.def.day})`), screen: 'recurring', action: 'المصاريف الثابتة', perm: 'vouchers.create' });

  // ─── البيع تحت الكلفة (آخر 7 أيام) ───
  const from = addDays(today, -7);
  const under: { name: string; inv: number }[] = [];
  for (const inv of state.invoices) {
    if (inv.kind !== 'sale' || inv.voidEntryId || inv.date < from || inv.date > today) continue;
    for (const l of inv.lines) {
      if (!l.itemId || !l.cost || !(l.qty > 0)) continue;
      const scale = inv.currency === base ? 1 : (inv.rate || 1) * 10 ** ((state.currencies[base]?.decimals ?? 2) - (state.currencies[inv.currency]?.decimals ?? 2));
      const revenueBase = Math.round((l.qty * l.price - (l.discount ?? 0)) * scale);
      if (revenueBase < l.cost - 1) under.push({ name: l.description, inv: inv.number });
    }
  }
  if (under.length)
    out.push({ id: 'under-cost', level: 'warn', title: `${under.length} سطر انباع بأقل من كلفته بآخر أسبوع`, ...take(under, (u) => `${u.name} (فاتورة ${u.inv})`), screen: 'itemwatch', action: 'مراقبة المواد', perm: 'costs.view' });

  // ─── سعر الصرف ───
  const usesForeign = Object.values(state.currencies).some((c) => c.code !== base && state.rates.some((r) => r.currency === c.code));
  if (usesForeign) {
    const last = state.rates.reduce((m, r) => (r.currency !== base && r.date > m ? r.date : m), '');
    const age = last ? Math.floor((Date.parse(today) - Date.parse(last)) / DAY) : 999;
    if (age >= 3)
      out.push({ id: 'rate-old', level: 'info', title: `آخر سعر صرف انسجّل من ${age} يوم`, lines: ['الفواتير بالدولار بتنحسب بآخر سعر. حدّثه إذا تغيّر.'], more: 0, screen: 'rates', action: 'العملات وسعر الصرف', perm: 'rates.manage' });
  }

  // ─── مسودات ───
  const drafts = Object.values(state.drafts ?? {}).filter((d) => d.updatedAt.slice(0, 10) < today);
  if (drafts.length)
    out.push({ id: 'drafts', level: 'info', title: `${drafts.length} فاتورة مسودة لسا ما اعتمدت`, ...take(drafts, (d) => `${d.title} (${d.date})`), screen: 'invoices', action: 'سجل الفواتير', perm: 'invoices.all' });

  const order: Record<AlertLevel, number> = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
