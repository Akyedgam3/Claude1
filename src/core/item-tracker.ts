// مراقبة المواد: لكل مادة كل حركاتها (فواتير، جرد، تالف، إنتاج) بالتاريخ مع الرصيد بعد كل حركة،
// وكم انباع منها وكم ربحت أو خسرت فيها (البيع بعد الخصومات ناقص تكلفة البضاعة)، بفترة.
import { ADJUSTMENT_NAMES } from './operations';
import type { CompanyState, Invoice, InvoiceKind, Item } from './types';

export interface Period {
  from?: string;
  to?: string;
}

const INVOICE_LABEL: Record<InvoiceKind, string> = { sale: 'فاتورة مبيع', purchase: 'فاتورة شراء', sale_return: 'مرتجع مبيع', purchase_return: 'مرتجع شراء' };
const DIR: Record<InvoiceKind, 1 | -1> = { sale: -1, sale_return: 1, purchase: 1, purchase_return: -1 };

export interface ItemMove {
  date: string;
  /** للترتيب بنفس اليوم: وقت التسجيل، وبعده ترتيب الإدخال */
  at: string;
  order: number;
  type: string;
  kind: InvoiceKind | 'adjust' | 'production';
  /** فاتورة: معرّفها لفتحها */
  invoiceId?: string;
  ref: string;
  party: string;
  /** بالوحدة الأساسية: موجب داخل، سالب خارج (للمخزون) */
  qty: number;
  /** الكمية المبيوعة بهالسطر (موجب للمبيع، سالب للمرتجع)، حتى للخدمات */
  sold: number;
  /** سعر الوحدة الأساسية بالعملة الأساسية (بيع أو شراء) */
  unitPrice: number;
  /** صافي المبيع بالعملة الأساسية (بعد خصم السطر وخصم الفاتورة)؛ للمرتجع سالب */
  revenue: number;
  /** تكلفة البضاعة بالعملة الأساسية (للبيع والمرتجع والتالف والجرد) */
  cost: number;
  /** ربح البيع (revenue - cost)؛ صفر لغير المبيعات */
  profit: number;
  balance: number;
}

export interface ItemSummary {
  item: Item;
  opening: number;
  closing: number;
  inQty: number;
  outQty: number;
  soldQty: number;
  revenue: number;
  cost: number;
  profit: number;
  purchasedQty: number;
  purchaseValue: number;
  /** فواتير مبيع بالفترة فيها هالمادة */
  invoices: number;
  /** في مبيعات بدون تكلفة (التكلفة صفر) فالربح مش دقيق */
  noCost: boolean;
  /** آخر سعر مبيع للوحدة الأساسية */
  lastSale: number;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** صافي السطر بالعملة الأساسية بعد خصمه وحصته من خصم الفاتورة. */
function lineNetBase(state: CompanyState, inv: Invoice, gross: number): number {
  const base = state.currencies[state.info!.baseCurrency]!;
  const cur = state.currencies[inv.currency] ?? base;
  const share = inv.subtotal > 0 ? 1 - inv.discount / inv.subtotal : 1;
  return Math.round(gross * share * inv.rate * 10 ** (base.decimals - cur.decimals));
}

type Raw = Omit<ItemMove, 'balance'>;

/**
 * كل الحركات اللي بتأثر على كميات المواد (بدون الملغى)، مجمّعة لكل مادة ومرتّبة.
 * مرور واحد على الفواتير والعمليات لكل المواد (أو لمادة وحدة إذا انطلبت)، فبتضل سريعة مع آلاف المواد.
 */
function collectMoves(state: CompanyState, only?: string): Map<string, Raw[]> {
  const map = new Map<string, Raw[]>();
  let n = 0;
  // وقت تسجيل المستندات اللي ما فيها وقت (القديمة): من قيدها إذا إلها قيد
  const entryAt = new Map<string, string>();
  for (const e of state.entries) entryAt.set(e.id, e.createdAt);
  const push = (id: string, m: Omit<Raw, 'order' | 'at'> & { at?: string }) => {
    if (only && id !== only) return;
    let list = map.get(id);
    if (!list) map.set(id, (list = []));
    list.push({ ...m, at: m.at ?? '', order: n++ });
  };
  const partyName = (id?: string | null) => (id ? (state.parties[id]?.name ?? '') : '');
  for (const inv of state.invoices) {
    if (inv.voidEntryId) continue;
    const dir = DIR[inv.kind];
    const isSale = inv.kind === 'sale' || inv.kind === 'sale_return';
    const isBuy = !isSale;
    const party = partyName(inv.partyId) || (isSale ? 'زبون نقدي' : '');
    for (const l of inv.lines) {
      if (l.itemId && (!only || l.itemId === only)) {
        const qty = l.qty * (l.factor ?? 1);
        const net = lineNetBase(state, inv, Math.round(l.qty * l.price) - l.discount);
        // المركّب: تكلفته من مكوّناته
        const cost = (l.cost ?? 0) + (l.components ?? []).reduce((t, c) => t + c.cost, 0);
        push(l.itemId, {
          date: inv.date,
          at: inv.createdAt,
          type: INVOICE_LABEL[inv.kind],
          kind: inv.kind,
          invoiceId: inv.id,
          ref: `#${inv.number}`,
          party,
          qty: state.items[l.itemId]?.kind === 'stock' ? dir * qty : 0,
          sold: isSale ? round3(-dir * qty) : 0,
          unitPrice: qty ? Math.round(net / qty) : 0,
          revenue: isSale ? -dir * net : 0,
          cost: isBuy ? dir * (l.cost ?? net) : -dir * cost,
          profit: isSale ? -dir * (net - cost) : 0,
        });
      }
      // المادة مكوّن بصنف مركّب (وجبة مثلاً): بتطلع من المخزون بدون مبيع مباشر
      for (const c of l.components ?? []) {
        push(c.itemId, { date: inv.date, at: inv.createdAt, type: `مكوّن بـ ${state.items[l.itemId ?? '']?.name ?? 'صنف'}`, kind: inv.kind, invoiceId: inv.id, ref: `#${inv.number}`, party, qty: dir * c.qty, sold: 0, unitPrice: 0, revenue: 0, cost: -dir * c.cost, profit: 0 });
      }
    }
  }
  for (const a of state.adjustments) {
    const at = a.createdAt ?? (a.entryId ? entryAt.get(a.entryId) : undefined);
    for (const l of a.lines) push(l.itemId, { date: a.date, ...(at ? { at } : {}), type: ADJUSTMENT_NAMES[a.kind] ?? 'تعديل مخزون', kind: 'adjust', ref: `#${a.number}`, party: a.memo ?? '', qty: l.qty, sold: 0, unitPrice: l.qty ? Math.round(l.cost / l.qty) : 0, revenue: 0, cost: l.cost, profit: 0 });
  }
  for (const p of state.productions ?? []) {
    for (const i of p.inputs) push(i.itemId, { date: p.date, ...(p.createdAt ? { at: p.createdAt } : {}), type: 'إنتاج (مادة خام)', kind: 'production', ref: `#${p.number}`, party: p.memo ?? '', qty: -i.qty, sold: 0, unitPrice: 0, revenue: 0, cost: -i.cost, profit: 0 });
    for (const o of p.outputs) push(o.itemId, { date: p.date, ...(p.createdAt ? { at: p.createdAt } : {}), type: 'إنتاج', kind: 'production', ref: `#${p.number}`, party: p.memo ?? '', qty: o.qty, sold: 0, unitPrice: o.qty ? Math.round(o.cost / o.qty) : 0, revenue: 0, cost: o.cost, profit: 0 });
  }
  // بنفس اليوم: حسب وقت التسجيل إذا معروف للتنين، وإلا الداخل قبل الخارج (حتى ما يطلع الرصيد سالب بالغلط)
  for (const list of map.values()) list.sort((x, y) => x.date.localeCompare(y.date) || (x.at && y.at ? x.at.localeCompare(y.at) : y.qty - x.qty) || x.order - y.order);
  return map;
}

function withBalance(raw: Raw[], period: Period): { opening: number; moves: ItemMove[]; closing: number } {
  let balance = 0;
  let opening = 0;
  const moves: ItemMove[] = [];
  for (const m of raw) {
    if (period.to && m.date > period.to) break;
    balance = round3(balance + m.qty);
    if (period.from && m.date < period.from) {
      opening = balance;
      continue;
    }
    moves.push({ ...m, balance });
  }
  return { opening, moves, closing: balance };
}

/** حركة مادة وحدة بالفترة: رصيد أول المدة، كل حركة مع الرصيد بعدها، ورصيد آخر المدة. */
export function itemMovements(state: CompanyState, itemId: string, period: Period = {}): { opening: number; moves: ItemMove[]; closing: number } {
  return withBalance(collectMoves(state, itemId).get(itemId) ?? [], period);
}

/** ملخص كل المواد بالفترة: المبيع والربح والكميات، للقائمة الرئيسية بمراقبة المواد. */
export function itemsSummary(state: CompanyState, period: Period = {}): ItemSummary[] {
  const all = collectMoves(state);
  return Object.values(state.items)
    .filter((i) => !i.archived)
    .map((item) => {
      const { opening, moves, closing } = withBalance(all.get(item.id) ?? [], period);
      const s: ItemSummary = { item, opening, closing, inQty: 0, outQty: 0, soldQty: 0, revenue: 0, cost: 0, profit: 0, purchasedQty: 0, purchaseValue: 0, invoices: 0, noCost: false, lastSale: 0 };
      const invs = new Set<string>();
      for (const m of moves) {
        if (m.qty > 0) s.inQty += m.qty;
        else s.outQty -= m.qty;
        if ((m.kind === 'sale' || m.kind === 'sale_return') && m.sold !== 0) {
          s.soldQty += m.sold;
          s.revenue += m.revenue;
          s.cost += m.cost;
          s.profit += m.profit;
          if (m.kind === 'sale') {
            if (m.invoiceId) invs.add(m.invoiceId);
            if (m.cost === 0 && m.revenue > 0 && item.kind !== 'service') s.noCost = true;
            s.lastSale = m.unitPrice;
          }
        } else if (m.kind === 'purchase' || m.kind === 'purchase_return') {
          s.purchasedQty += m.qty;
          s.purchaseValue += m.cost;
        }
      }
      s.soldQty = round3(s.soldQty);
      s.inQty = round3(s.inQty);
      s.outQty = round3(s.outQty);
      s.invoices = invs.size;
      return s;
    })
    .filter((s) => s.opening !== 0 || s.closing !== 0 || s.inQty || s.outQty || s.revenue || s.invoices);
}
