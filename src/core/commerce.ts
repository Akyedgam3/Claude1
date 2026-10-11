import { SYSTEM_ACCOUNTS } from './chart-templates';
import type { EntryDraft, LineDraft } from './ledger';
import { convertMinor } from './money';
import { computeTaxes } from './tax';
import type {
  CompanyEvent,
  CompanyState,
  Invoice,
  InvoiceKind,
  InvoiceLine,
  JournalEntry,
  RepairOrder,
  StockLevel,
} from './types';

function fail(message: string): never {
  throw new Error(message);
}

export const INVOICE_KIND_NAMES: Record<InvoiceKind, string> = {
  sale: 'فاتورة مبيع',
  purchase: 'فاتورة شراء',
  sale_return: 'مرتجع مبيع',
  purchase_return: 'مرتجع شراء',
};

// ───────────── التحقق ─────────────

export function validateCommerceEvent(state: CompanyState, event: CompanyEvent): void {
  switch (event.type) {
    case 'party.saved':
      if (!event.party.name.trim()) fail('الاسم مطلوب');
      return;
    case 'warehouse.saved':
      if (!event.warehouse.name.trim()) fail('اسم المستودع مطلوب');
      return;
    case 'item.saved': {
      const item = event.item;
      if (!item.name.trim()) fail('اسم المادة مطلوب');
      if (!item.code.trim()) fail('رمز المادة مطلوب');
      if (Object.values(state.items).some((i) => i.id !== item.id && i.code === item.code)) {
        fail(`الرمز ${item.code} مستخدم لمادة أخرى`);
      }
      if (item.barcode && Object.values(state.items).some((i) => i.id !== item.id && i.barcode === item.barcode)) {
        fail(`الباركود ${item.barcode} مستخدم لمادة أخرى`);
      }
      if (!state.currencies[item.priceCurrency]) fail('عملة السعر غير معرّفة');
      if (!Number.isSafeInteger(item.price) || item.price < 0) fail('سعر غير صالح');
      const existing = state.items[item.id];
      if (existing && existing.kind !== item.kind && (state.stock[item.id]?.totalQty ?? 0) !== 0) {
        fail('لا يمكن تغيير نوع مادة لها رصيد في المخزون');
      }
      return;
    }
    case 'vehicle.saved':
      if (!state.parties[event.vehicle.partyId]) fail('صاحب السيارة غير موجود');
      if (!event.vehicle.plate.trim()) fail('رقم اللوحة مطلوب');
      if (!event.vehicle.make.trim()) fail('نوع السيارة مطلوب');
      return;
    case 'repair.saved': {
      const r = event.repair;
      if (!state.vehicles[r.vehicleId]) fail('السيارة غير موجودة');
      if (!state.parties[r.partyId]) fail('الزبون غير موجود');
      if (!state.currencies[r.currency]) fail('عملة غير معرّفة');
      for (const p of r.parts) {
        if (!state.items[p.itemId]) fail('قطعة غير موجودة في أمر الإصلاح');
        if (!(p.qty > 0)) fail('كمية القطعة يجب أن تكون أكبر من صفر');
      }
      const existing = state.repairs[r.id];
      if (existing?.status === 'invoiced' && r.status !== 'invoiced') fail('أمر الإصلاح مفوتر ولا يمكن تعديل حالته');
      return;
    }
    case 'invoice.posted': {
      const inv = event.invoice;
      if (state.invoices.some((i) => i.id === inv.id)) fail('الفاتورة مسجّلة مسبقاً');
      if (!state.warehouses[inv.warehouseId]) fail('المستودع غير موجود');
      if (inv.partyId && !state.parties[inv.partyId]) fail('العميل/المورد غير موجود');
      for (const l of inv.lines) if (l.itemId && !state.items[l.itemId]) fail(`مادة غير موجودة: ${l.description}`);
      if (event.entry.source?.id !== inv.id) fail('القيد لا يخص هذه الفاتورة');
      return;
    }
    case 'invoice.voided': {
      const inv = state.invoices.find((i) => i.id === event.invoiceId) ?? fail('الفاتورة غير موجودة');
      if (inv.voidEntryId) fail('الفاتورة ملغاة مسبقاً');
      if (event.entry.voidOf !== inv.entryId) fail('القيد العكسي لا يخص هذه الفاتورة');
      return;
    }
  }
}

// ───────────── التطبيق على الحالة ─────────────

function stockOf(state: CompanyState, itemId: string): StockLevel {
  return (state.stock[itemId] ??= { qty: {}, totalQty: 0, value: 0, lastCost: 0 });
}

/** إشارة حركة المخزون: +1 دخول، -1 خروج. */
const STOCK_DIRECTION: Record<InvoiceKind, 1 | -1> = { sale: -1, sale_return: 1, purchase: 1, purchase_return: -1 };

function roundQty(q: number): number {
  return Math.round(q * 1000) / 1000;
}

function moveStock(state: CompanyState, inv: Invoice, sign: 1 | -1): void {
  const dir = STOCK_DIRECTION[inv.kind] * sign;
  for (const line of inv.lines) {
    if (!line.itemId || state.items[line.itemId]?.kind !== 'stock') continue;
    const level = stockOf(state, line.itemId);
    level.qty[inv.warehouseId] = roundQty((level.qty[inv.warehouseId] ?? 0) + dir * line.qty);
    level.totalQty = roundQty(level.totalQty + dir * line.qty);
    level.value += dir * (line.cost ?? 0);
    if (inv.kind === 'purchase' && sign === 1 && line.qty > 0) level.lastCost = Math.round((line.cost ?? 0) / line.qty);
  }
}

function bump(state: CompanyState, key: string, n: number): void {
  state.counters[key] = Math.max(state.counters[key] ?? 0, n);
}

export function applyCommerceEvent(state: CompanyState, event: CompanyEvent): void {
  switch (event.type) {
    case 'party.saved':
      state.parties[event.party.id] = { ...event.party };
      return;
    case 'item.saved':
      state.items[event.item.id] = { ...event.item };
      return;
    case 'warehouse.saved':
      state.warehouses[event.warehouse.id] = { ...event.warehouse };
      return;
    case 'vehicle.saved':
      state.vehicles[event.vehicle.id] = { ...event.vehicle };
      return;
    case 'repair.saved':
      state.repairs[event.repair.id] = { ...event.repair };
      bump(state, 'repair', event.repair.number);
      return;
    case 'invoice.posted':
      state.invoices.push(event.invoice);
      state.entries.push(event.entry);
      bump(state, event.invoice.kind, event.invoice.number);
      moveStock(state, event.invoice, 1);
      return;
    case 'invoice.voided': {
      const inv = state.invoices.find((i) => i.id === event.invoiceId)!;
      inv.voidEntryId = event.entry.id;
      state.entries.push(event.entry);
      state.voided[inv.entryId] = event.entry.id;
      moveStock(state, inv, -1);
      return;
    }
  }
}

// ───────────── بناء الفاتورة وقيدها ─────────────

export interface InvoiceLineDraft {
  itemId?: string | null;
  description?: string;
  qty: number;
  price: number; // بأصغر وحدة من عملة الفاتورة
  discount?: number;
}

export interface InvoiceDraft {
  kind: InvoiceKind;
  date: string;
  partyId?: string | null;
  currency?: string;
  rate?: number;
  warehouseId?: string;
  lines: InvoiceLineDraft[];
  discount?: number;
  taxIds?: string[];
  paid?: number; // الافتراضي: كامل المبلغ للزبون النقدي، وصفر لغيره
  cashAccountId?: string;
  notes?: string;
  source?: { type: string; id: string };
  createdBy?: string;
}

export interface InvoiceContext {
  state: CompanyState;
  baseCode: string;
  resolveRate(currency: string, date: string): number | undefined;
  buildEntry(draft: EntryDraft): JournalEntry;
}

/** يقسم مبلغاً على أوزان بالتناسب مع ضمان أن المجموع يساوي المبلغ تماماً. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.round((total * w) / sum));
  const diff = total - parts.reduce((s, p) => s + p, 0);
  const last = parts.map((p, i) => [p, i] as const).filter(([, i]) => weights[i]! > 0).pop();
  if (last) parts[last[1]]! += diff;
  return parts;
}

export function buildInvoice(ctx: InvoiceContext, draft: InvoiceDraft): { invoice: Invoice; entry: JournalEntry } {
  const { state, baseCode } = ctx;
  const kind = draft.kind;
  const isSaleSide = kind === 'sale' || kind === 'sale_return';
  const currency = draft.currency ?? baseCode;
  if (!state.currencies[currency]) fail('عملة غير معرّفة');
  const rate =
    currency === baseCode ? 1 : (draft.rate ?? ctx.resolveRate(currency, draft.date) ?? fail(`لا يوجد سعر صرف لـ ${currency} بتاريخ ${draft.date}`));
  const warehouseId = draft.warehouseId ?? Object.keys(state.warehouses)[0] ?? fail('لا يوجد مستودع');
  const partyId = draft.partyId ?? null;
  if (partyId) {
    const party = state.parties[partyId] ?? fail('العميل/المورد غير موجود');
    if (isSaleSide && party.kind === 'supplier') fail(`${party.name} مسجّل كمورد فقط`);
    if (!isSaleSide && party.kind === 'customer') fail(`${party.name} مسجّل كعميل فقط`);
  }
  if (draft.lines.length === 0) fail('الفاتورة فارغة');

  const lines: InvoiceLine[] = draft.lines.map((d, i) => {
    const item = d.itemId ? (state.items[d.itemId] ?? fail(`السطر ${i + 1}: مادة غير موجودة`)) : null;
    if (!(d.qty > 0)) fail(`السطر ${i + 1}: الكمية يجب أن تكون أكبر من صفر`);
    if (!Number.isSafeInteger(d.price) || d.price < 0) fail(`السطر ${i + 1}: سعر غير صالح`);
    const discount = d.discount ?? 0;
    if (discount < 0 || discount > Math.round(d.qty * d.price)) fail(`السطر ${i + 1}: خصم غير صالح`);
    const description = d.description?.trim() || item?.name || fail(`السطر ${i + 1}: البيان مطلوب`);
    return { itemId: item?.id ?? null, description, qty: roundQty(d.qty), price: d.price, discount };
  });

  const amounts = lines.map((l) => Math.round(l.qty * l.price) - l.discount);
  const subtotal = amounts.reduce((s, a) => s + a, 0);
  const discount = draft.discount ?? 0;
  if (discount < 0 || discount > subtotal) fail('خصم الفاتورة غير صالح');
  const taxes = (draft.taxIds ?? []).map((id) => state.taxes[id] ?? fail('ضريبة غير معرّفة'));
  const taxResult = computeTaxes(subtotal - discount, taxes.map((t) => ({ ...t, active: true })));
  const taxTotal = taxResult.total - taxResult.net;
  const total = taxResult.total;
  const paid = draft.paid ?? (partyId ? 0 : total);
  if (paid < 0 || paid > total) fail('المبلغ المدفوع غير صالح');
  if (!partyId && paid !== total) fail('الفاتورة النقدية بدون اسم يجب أن تُدفع كاملة؛ اختر عميلاً/مورداً للبيع بالدين');
  const cashAccountId = draft.cashAccountId ?? SYSTEM_ACCOUNTS.cash;

  const isStock = (l: InvoiceLine) => !!l.itemId && state.items[l.itemId]!.kind === 'stock';
  const toBase = (minor: number) => convertMinor(minor, state.currencies[currency]!, state.currencies[baseCode]!, rate);

  // التكلفة بالعملة الأساسية لكل سطر مخزني
  if (kind === 'purchase' || kind === 'purchase_return') {
    // تكلفة الشراء = حصة السطر من صافي الفاتورة شامل الخصم والضرائب
    const shares = allocate(total, amounts);
    lines.forEach((l, i) => {
      if (isStock(l)) l.cost = toBase(shares[i]!);
    });
  } else {
    const working = new Map<string, { qty: number; value: number; lastCost: number }>();
    for (const l of lines) {
      if (!isStock(l)) continue;
      const lvl = working.get(l.itemId!) ?? { ...(state.stock[l.itemId!] ?? { totalQty: 0, value: 0, lastCost: 0 }), qty: state.stock[l.itemId!]?.totalQty ?? 0 };
      const unit = lvl.qty > 0 ? lvl.value / lvl.qty : lvl.lastCost;
      l.cost = Math.round(unit * l.qty);
      const dir = kind === 'sale' ? -1 : 1;
      lvl.qty += dir * l.qty;
      lvl.value += dir * l.cost;
      working.set(l.itemId!, lvl);
    }
  }

  const id = crypto.randomUUID();
  const number = (state.counters[kind] ?? 0) + 1;
  const partySide = isSaleSide ? SYSTEM_ACCOUNTS.customers : SYSTEM_ACCOUNTS.suppliers;
  // "in" = الجهة التي يدخل فيها المال للشركة (مدين في المبيع)
  const moneyIn = kind === 'sale' || kind === 'purchase_return';
  const dr = (amount: number): Pick<LineDraft, 'debit' | 'credit'> => ({ debit: amount });
  const cr = (amount: number): Pick<LineDraft, 'debit' | 'credit'> => ({ credit: amount });
  const money = moneyIn ? dr : cr;
  const against = moneyIn ? cr : dr;
  const fx = { currency, rate };
  const base = { currency: baseCode, rate: 1 };

  const entryLines: LineDraft[] = [];
  const push = (l: LineDraft) => {
    if ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0) entryLines.push(l);
  };
  push({ accountId: cashAccountId, ...money(paid), ...fx });
  if (partyId) push({ accountId: partySide, ...money(total - paid), ...fx, partyId });

  if (isSaleSide) {
    const goods = lines.reduce((s, l, i) => s + (isStock(l) ? amounts[i]! : 0), 0);
    const services = subtotal - goods;
    const revenue = kind === 'sale' ? SYSTEM_ACCOUNTS.sales : SYSTEM_ACCOUNTS.salesReturns;
    push({ accountId: revenue, ...against(goods), ...fx });
    push({ accountId: SYSTEM_ACCOUNTS.serviceRevenue, ...against(services), ...fx });
    push({ accountId: SYSTEM_ACCOUNTS.discountAllowed, ...money(discount), ...fx });
    taxResult.taxes.forEach((t) => push({ accountId: t.tax.accountId, ...against(t.amount), ...fx }));
    const cost = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
    // المبيع: من حـ/ تكلفة البضاعة إلى حـ/ المخزون، والمرتجع بالعكس
    const out = kind === 'sale';
    push({ accountId: SYSTEM_ACCOUNTS.cogs, ...(out ? dr(cost) : cr(cost)), ...base });
    push({ accountId: SYSTEM_ACCOUNTS.inventory, ...(out ? cr(cost) : dr(cost)), ...base });
  } else {
    const stockCost = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
    push({ accountId: SYSTEM_ACCOUNTS.inventory, ...against(stockCost), ...base });
    const shares = allocate(total, amounts);
    const other = lines.reduce((s, l, i) => s + (isStock(l) ? 0 : shares[i]!), 0);
    push({ accountId: SYSTEM_ACCOUNTS.miscExpenses, ...against(other), ...fx });
  }

  const entry = ctx.buildEntry({
    date: draft.date,
    memo: `${INVOICE_KIND_NAMES[kind]} رقم ${number}`,
    lines: entryLines,
    source: { type: 'invoice', id },
    ...(draft.createdBy ? { createdBy: draft.createdBy } : {}),
  });

  const invoice: Invoice = {
    id,
    kind,
    number,
    date: draft.date,
    partyId,
    currency,
    rate,
    warehouseId,
    lines,
    discount,
    taxIds: taxes.map((t) => t.id),
    taxLines: taxResult.taxes.map((t) => ({ taxId: t.tax.id, amount: t.amount })),
    subtotal,
    taxTotal,
    total,
    paid,
    cashAccountId,
    ...(draft.notes ? { notes: draft.notes } : {}),
    ...(draft.source ? { source: draft.source } : {}),
    entryId: entry.id,
    createdAt: entry.createdAt,
    createdBy: entry.createdBy,
  };
  return { invoice, entry };
}

/** يحوّل أمر إصلاح إلى بنود فاتورة مبيع: القطع كمواد، وأجور اليد كخدمات. */
export function repairToInvoiceLines(state: CompanyState, repair: RepairOrder): InvoiceLineDraft[] {
  return [
    ...repair.parts.map((p) => ({ itemId: p.itemId, description: state.items[p.itemId]?.name ?? '', qty: p.qty, price: p.price })),
    ...repair.labor.map((l) => ({ itemId: null, description: l.description, qty: 1, price: l.amount })),
  ];
}
