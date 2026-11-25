// «الاشتراكات» (محلات الإنترنت والشبكات، 2.0.8): كل مشترك إلو باقة وسعر شهري و«مدفوع لحد» تاريخ.
// التجديد = فاتورة مبيع بعدد الأشهر (خدمة بدون مخزون) وبيمدّد التاريخ؛ القائمة بتبيّن مين خلص ومين قرّب.
import type { CompanyState, NetSub } from './types';

const DAY = 86_400_000;

/** تاريخ + أشهر (31/1 + شهر = 28 أو 29/2، متل ما بيحسبها الناس) */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export type NetSubState = 'active' | 'soon' | 'expired' | 'stopped';

export interface NetSubStatus {
  state: NetSubState;
  /** الأيام الباقية (سالب = من كم يوم خلص) */
  days: number;
}

/** «قرّب»: باقي 3 أيام أو أقل */
export const NETSUB_SOON_DAYS = 3;

export function netSubStatus(sub: NetSub, today: string): NetSubStatus {
  const days = Math.round((Date.parse(sub.paidUntil) - Date.parse(today)) / DAY);
  if (sub.stopped) return { state: 'stopped', days };
  if (days < 0) return { state: 'expired', days };
  if (days <= NETSUB_SOON_DAYS) return { state: 'soon', days };
  return { state: 'active', days };
}

export const NETSUB_STATE_NAMES: Record<NetSubState, string> = { active: 'فعّال', soon: 'قرّب يخلص', expired: 'خلص', stopped: 'موقوف' };

/** من وين بيبلّش التجديد: من آخر يوم مدفوع إذا لسا ما خلص، وإلا من تاريخ الدفع */
export function renewalStart(sub: NetSub, date: string): string {
  return sub.paidUntil >= date ? sub.paidUntil : date;
}

export function netSubList(state: CompanyState): NetSub[] {
  return Object.values(state.netSubs ?? {}).sort((a, b) => a.paidUntil.localeCompare(b.paidUntil) || a.number - b.number);
}

/** ملخص: عدد المشتركين الفعّالين، الخالصين، القرّبوا، والدخل الشهري المتوقّع لكل عملة */
export function netSubsSummary(state: CompanyState, today: string): { total: number; expired: number; soon: number; monthly: Record<string, number> } {
  const out = { total: 0, expired: 0, soon: 0, monthly: {} as Record<string, number> };
  for (const s of Object.values(state.netSubs ?? {})) {
    const st = netSubStatus(s, today).state;
    if (st === 'stopped') continue;
    out.total++;
    if (st === 'expired') out.expired++;
    if (st === 'soon') out.soon++;
    out.monthly[s.currency] = (out.monthly[s.currency] ?? 0) + s.price;
  }
  return out;
}
