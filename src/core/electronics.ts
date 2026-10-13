import { INVOICE_KIND_NAMES } from './commerce';
import type { CompanyState, InstallmentPlan, Item } from './types';

// ───────────── سجل الجهاز (IMEI / الرقم التسلسلي) ─────────────

export interface SerialEvent {
  date: string;
  kind: 'in' | 'out';
  label: string; // فاتورة شراء رقم 3، رصيد افتتاحي...
  partyId?: string | null;
  price?: number; // سعر السطر للقطعة الوحدة بعملة المستند
  currency?: string;
  invoiceId?: string;
  voided?: boolean;
}

export interface SerialHistory {
  serial: string;
  item: Item;
  inStock: boolean;
  warehouseId?: string;
  events: SerialEvent[];
  soldTo?: string | null; // آخر زبون اشترى الجهاز
  soldOn?: string;
  warrantyUntil?: string;
  warrantyActive?: boolean;
  repairs: string[]; // أوامر صيانة على نفس الرقم
}

const addMonths = (iso: string, months: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/** كل قصة الجهاز: من وين إجا، لمين راح، وكفالته. */
export function serialHistory(state: CompanyState, serial: string, today: string): SerialHistory | null {
  const s = serial.trim();
  if (!s) return null;
  let itemId: string | undefined;
  const events: SerialEvent[] = [];
  for (const inv of state.invoices) {
    for (const l of inv.lines) {
      if (!l.itemId || !l.serials?.includes(s)) continue;
      itemId = l.itemId;
      const inbound = inv.kind === 'purchase' || inv.kind === 'sale_return';
      events.push({
        date: inv.date,
        kind: inbound ? 'in' : 'out',
        label: `${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`,
        partyId: inv.partyId,
        price: l.qty ? Math.round((l.qty * l.price - l.discount) / l.qty) : l.price,
        currency: inv.currency,
        invoiceId: inv.id,
        voided: !!inv.voidEntryId,
      });
    }
  }
  for (const a of state.adjustments)
    for (const l of a.lines)
      if (l.serials?.includes(s)) {
        itemId = l.itemId;
        events.push({ date: a.date, kind: l.qty > 0 ? 'in' : 'out', label: l.qty > 0 ? (a.kind === 'opening' ? 'رصيد افتتاحي' : 'إدخال مخزون') : 'إخراج من المخزون (تالف/استهلاك)' });
      }
  for (const t of state.transfers)
    for (const l of t.lines)
      if (l.serials?.includes(s)) {
        itemId = l.itemId;
        events.push({ date: t.date, kind: 'in', label: `تحويل من ${state.warehouses[t.from]?.name ?? ''} إلى ${state.warehouses[t.to]?.name ?? ''}` });
      }
  // جهاز بالمخزون بدون حركات معروفة (نادر)
  if (!itemId) itemId = Object.keys(state.stock).find((id) => state.stock[id]?.serials?.[s]);
  const item = itemId ? state.items[itemId] : undefined;
  if (!item) return null;
  events.sort((a, b) => a.date.localeCompare(b.date));
  const warehouseId = state.stock[item.id]?.serials?.[s];
  const lastSale = [...events].reverse().find((e) => e.kind === 'out' && e.invoiceId && !e.voided);
  const returnedAfter = lastSale && events.some((e) => e.kind === 'in' && !e.voided && e.date >= lastSale.date && e.label.startsWith(INVOICE_KIND_NAMES.sale_return));
  const sold = !!lastSale && !warehouseId && !returnedAfter;
  const warrantyUntil = sold && item.warrantyMonths ? addMonths(lastSale!.date, item.warrantyMonths) : undefined;
  const repairs = Object.values(state.repairs)
    .filter((r) => state.vehicles[r.vehicleId]?.vin?.trim() === s)
    .map((r) => r.id);
  return {
    serial: s,
    item,
    inStock: !!warehouseId,
    ...(warehouseId ? { warehouseId } : {}),
    events,
    ...(sold ? { soldTo: lastSale!.partyId ?? null, soldOn: lastSale!.date } : {}),
    ...(warrantyUntil ? { warrantyUntil, warrantyActive: warrantyUntil >= today } : {}),
    repairs,
  };
}

/** كل الأجهزة الموجودة بالمخزون برقمها. */
export function serialsInStock(state: CompanyState): { serial: string; item: Item; warehouseId: string }[] {
  const out: { serial: string; item: Item; warehouseId: string }[] = [];
  for (const [itemId, lvl] of Object.entries(state.stock)) {
    const item = state.items[itemId];
    if (!item) continue;
    for (const [serial, warehouseId] of Object.entries(lvl.serials ?? {})) out.push({ serial, item, warehouseId });
  }
  return out.sort((a, b) => a.item.name.localeCompare(b.item.name, 'ar') || a.serial.localeCompare(b.serial));
}

// ───────────── التقسيط ─────────────

export interface InstallmentRow {
  due: string;
  amount: number;
  paid: number;
  remaining: number;
  overdue: boolean;
}

export interface InstallmentState {
  total: number;
  paid: number;
  remaining: number;
  rows: InstallmentRow[];
  overdueAmount: number;
  overdueCount: number;
  nextDue?: string;
  nextAmount?: number;
}

/** توزيع المقبوض على الأقساط بالترتيب، ومعرفة المتأخر. */
export function installmentState(state: CompanyState, plan: InstallmentPlan, today: string): InstallmentState {
  let pool = plan.payments.filter((p) => !state.voided[p.entryId]).reduce((t, p) => t + p.amount, 0);
  const paid = pool;
  const rows = plan.schedule.map((s) => {
    const take = Math.min(pool, s.amount);
    pool -= take;
    const remaining = s.amount - take;
    return { due: s.due, amount: s.amount, paid: take, remaining, overdue: remaining > 0 && s.due < today && plan.status === 'active' };
  });
  const total = plan.schedule.reduce((t, s) => t + s.amount, 0);
  const next = rows.find((r) => r.remaining > 0);
  return {
    total,
    paid,
    remaining: Math.max(0, total - paid),
    rows,
    overdueAmount: rows.filter((r) => r.overdue).reduce((t, r) => t + r.remaining, 0),
    overdueCount: rows.filter((r) => r.overdue).length,
    ...(next ? { nextDue: next.due, nextAmount: next.remaining } : {}),
  };
}

/** جدول أقساط متساوية (آخر قسط بياخد فرق التقريب). */
export function buildSchedule(total: number, count: number, firstDue: string, everyMonths = 1): { due: string; amount: number }[] {
  const n = Math.max(1, Math.floor(count));
  const each = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({ due: addMonths(firstDue, i * everyMonths), amount: i === n - 1 ? total - each * (n - 1) : each }));
}
