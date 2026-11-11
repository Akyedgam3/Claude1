// كشف الحساب الكامل لزبون/مورد أو لأي حساب: رصيد أول المدة، كل حركة بنوعها ورقمها (فاتورة، سند، قيد)
// مع الرصيد بعدها، ومجموع المدين والدائن. كل عملة لحالها (كشف الدولار بالدولار والليرة بالليرة)،
// ومع خيار إخفاء الحركات الملغاة (الفاتورة الملغاة وقيد إلغائها بيلغوا بعض).
import type { CompanyState, Invoice } from './types';

export interface StatementTarget {
  kind: 'party' | 'account';
  id: string;
}

export interface FullStatementRow {
  entryId: string;
  date: string;
  number: number;
  type: string;
  memo: string;
  /** فاتورة: لفتحها */
  invoiceId?: string;
  debit: number;
  credit: number;
  running: number;
  voided?: boolean;
}

export interface FullStatement {
  /** العملات اللي إلها حركات بهالحساب (الأساسية أول شي) */
  currencies: string[];
  currency: string;
  opening: number;
  rows: FullStatementRow[];
  closing: number;
  totalDebit: number;
  totalCredit: number;
}

const INVOICE_NAMES: Record<string, string> = { sale: 'فاتورة مبيع', purchase: 'فاتورة شراء', sale_return: 'مرتجع مبيع', purchase_return: 'مرتجع شراء' };
const SOURCE_NAMES: Record<string, string> = {
  receipt: 'سند قبض',
  payment: 'سند دفع',
  opening: 'رصيد افتتاحي',
  commission: 'عمولة مسوّق',
  partner: 'حركة شريك',
  closing: 'إقفال سنة',
  boxtransfer: 'تحويل بين الصناديق',
  debt: 'دين',
  installment: 'قسط',
  employee: 'راتب / سلفة',
  adjustment: 'جرد / تالف',
};

function descendants(state: CompanyState, id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of Object.values(state.accounts)) if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) ids.add(a.id), (grew = true);
  }
  return ids;
}

export function fullStatement(state: CompanyState, target: StatementTarget, period: { from?: string; to?: string } = {}, opts: { currency?: string; hideVoided?: boolean } = {}): FullStatement {
  const base = state.info!.baseCurrency;
  const ids = target.kind === 'account' ? descendants(state, target.id) : null;
  const match = (l: { accountId: string; partyId?: string | null }) => (ids ? ids.has(l.accountId) : l.partyId === target.id);
  const byEntry = new Map<string, Invoice>();
  for (const inv of state.invoices) byEntry.set(inv.entryId, inv);
  const voidedIds = new Set<string>();
  for (const e of state.entries) if (e.voidOf) voidedIds.add(e.voidOf).add(e.id);

  // العملات المستعملة
  const used = new Set<string>();
  for (const e of state.entries) for (const l of e.lines) if (match(l)) used.add(l.currency);
  const currencies = [...used].sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const currency = opts.currency && used.has(opts.currency) ? opts.currency : (currencies.length === 1 ? currencies[0]! : base);
  const inBase = currency === base && currencies.length > 1 && !opts.currency;

  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  let opening = 0;
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: FullStatementRow[] = [];
  for (const e of sorted) {
    if (period.to && e.date > period.to) break;
    const isVoided = voidedIds.has(e.id);
    if (opts.hideVoided && isVoided) continue;
    let debit = 0;
    let credit = 0;
    for (const l of e.lines) {
      if (!match(l)) continue;
      if (inBase) {
        debit += l.baseDebit;
        credit += l.baseCredit;
      } else if (l.currency === currency) {
        debit += l.debit;
        credit += l.credit;
      }
    }
    if (debit === 0 && credit === 0) continue;
    if (period.from && e.date < period.from) {
      opening += debit - credit;
      running = opening;
      continue;
    }
    running += debit - credit;
    totalDebit += debit;
    totalCredit += credit;
    const inv = byEntry.get(e.id) ?? (e.voidOf ? byEntry.get(e.voidOf) : undefined);
    const type = e.voidOf ? 'إلغاء' : inv ? `${INVOICE_NAMES[inv.kind] ?? 'فاتورة'} #${inv.number}` : (SOURCE_NAMES[e.source?.type ?? ''] ?? 'قيد');
    rows.push({ entryId: e.id, date: e.date, number: e.number, type, memo: e.memo, ...(inv ? { invoiceId: inv.id } : {}), debit, credit, running, ...(isVoided ? { voided: true } : {}) });
  }
  return { currencies, currency: inBase ? base : currency, opening, rows, closing: rows.length ? running : opening, totalDebit, totalCredit };
}
