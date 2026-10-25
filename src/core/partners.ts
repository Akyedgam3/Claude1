// الشركاء والمساهمين: رأس مال كل شريك ونسبته، ونصيبه من الأرباح، والسحوبات.
// كل حركة قيد محاسبي (مصدره partner) فبتطلع بدفتر اليومية والصندوق والميزانية متل أي حركة.
import { incomeStatement } from './reports';
import type { CompanyState, JournalEntry, Partner } from './types';

export type PartnerMoveKind = 'capital_in' | 'capital_out' | 'profit_out' | 'profit_share';

export const PARTNER_MOVE_NAMES: Record<PartnerMoveKind, string> = {
  capital_in: 'إيداع رأس مال',
  capital_out: 'سحب من رأس المال',
  profit_out: 'سحب من الأرباح',
  profit_share: 'توزيع أرباح',
};

export interface PartnerMove {
  entryId: string;
  partnerId: string;
  kind: PartnerMoveKind;
  date: string;
  amount: number; // بالعملة الأساسية
  memo: string;
  createdBy: string;
  voided: boolean;
}

/** معرّف مصدر القيد: partnerId|kind|uuid */
export const partnerSourceId = (partnerId: string, kind: PartnerMoveKind) => `${partnerId}|${kind}|${crypto.randomUUID()}`;

/** حركات الشركاء (من القيود)، الأقدم أولاً. */
export function partnerMoves(state: CompanyState, partnerId?: string): PartnerMove[] {
  const voided = new Set(state.entries.filter((e) => e.voidOf).map((e) => e.voidOf!));
  const out: PartnerMove[] = [];
  for (const e of state.entries) {
    if (e.source?.type !== 'partner' || e.voidOf) continue;
    const [pid, kind] = e.source.id.split('|') as [string, PartnerMoveKind];
    if (partnerId && pid !== partnerId) continue;
    out.push({ entryId: e.id, partnerId: pid, kind, date: e.date, amount: moveAmount(e), memo: e.memo, createdBy: e.createdBy, voided: voided.has(e.id) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const moveAmount = (e: JournalEntry) => e.lines.reduce((s, l) => s + l.baseDebit, 0);

export interface PartnerRow {
  partner: Partner;
  capital: number; // رأس ماله لحد نهاية الفترة
  capitalPct: number; // نسبته من رأس المال ٪
  profitPct: number; // نسبته من الأرباح ٪
  profitShare: number; // نصيبه من ربح الفترة
  withdrawnProfit: number; // سحوباته من الأرباح بالفترة
  distributed: number; // الأرباح الموزّعة إلو (كل الوقت)
  withdrawnTotal: number; // كل سحوباته من الأرباح
  current: number; // رصيده الجاري: الموزّع ناقص المسحوب
  due: number; // نصيبه من ربح الفترة ناقص اللي سحبه منه
}

export interface PartnersSummary {
  totalCapital: number;
  netProfit: number;
  rows: PartnerRow[];
}

/**
 * ملخص الشركاء لفترة: ربح الفترة من قائمة الدخل، ونسبة كل شريك بالأرباح
 * (المتفق عليها، أو الباقي بيتوزّع على اللي ما إلهم نسبة حسب رأس مالهم).
 */
export function partnersSummary(state: CompanyState, period: { from?: string; to?: string } = {}): PartnersSummary {
  const partners = Object.values(state.partners ?? {}).filter((p) => p.active);
  const moves = partnerMoves(state).filter((m) => !m.voided);
  const inPeriod = (d: string) => (!period.from || d >= period.from) && (!period.to || d <= period.to);
  const capitalOf = (id: string) =>
    moves.filter((m) => m.partnerId === id && (!period.to || m.date <= period.to)).reduce((s, m) => s + (m.kind === 'capital_in' ? m.amount : m.kind === 'capital_out' ? -m.amount : 0), 0);
  const caps = new Map(partners.map((p) => [p.id, capitalOf(p.id)]));
  const totalCapital = [...caps.values()].reduce((s, c) => s + Math.max(0, c), 0);
  const fixed = partners.filter((p) => p.profitPercent !== undefined);
  const rest = Math.max(0, 100 - fixed.reduce((s, p) => s + p.profitPercent!, 0));
  const floating = partners.filter((p) => p.profitPercent === undefined);
  const floatingCap = floating.reduce((s, p) => s + Math.max(0, caps.get(p.id)!), 0);
  const netProfit = incomeStatement(state, period).netProfit;
  const rows = partners.map((partner) => {
    const capital = caps.get(partner.id)!;
    const capitalPct = totalCapital > 0 ? (Math.max(0, capital) / totalCapital) * 100 : 0;
    const profitPct = partner.profitPercent ?? (floatingCap > 0 ? (rest * Math.max(0, capital)) / floatingCap : floating.length ? rest / floating.length : 0);
    const mine = moves.filter((m) => m.partnerId === partner.id);
    const sum = (k: PartnerMoveKind, f: (m: PartnerMove) => boolean = () => true) => mine.filter((m) => m.kind === k && f(m)).reduce((s, m) => s + m.amount, 0);
    const profitShare = Math.round((netProfit * profitPct) / 100);
    const withdrawnProfit = sum('profit_out', (m) => inPeriod(m.date));
    const distributed = sum('profit_share');
    const withdrawnTotal = sum('profit_out');
    return { partner, capital, capitalPct, profitPct, profitShare, withdrawnProfit, distributed, withdrawnTotal, current: distributed - withdrawnTotal, due: profitShare - withdrawnProfit };
  });
  return { totalCapital, netProfit, rows };
}
