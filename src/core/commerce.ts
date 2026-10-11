import { SYSTEM_ACCOUNTS } from './chart-templates';
import type { EntryDraft, LineDraft } from './ledger';
import { convertMinor } from './money';
import { adjustmentMoves, applyMove, invoiceMoves, negate, productionMoves, roundQty, StockPlanner, transferMoves } from './stock';
import { computeTaxes } from './tax';
import type { CompanyEvent, CompanyState, Invoice, InvoiceKind, InvoiceLine, JournalEntry, RepairOrder, TailorOrder } from './types';

function fail(message: string): never {
  throw new Error(message);
}

export const INVOICE_KIND_NAMES: Record<InvoiceKind, string> = {
  sale: 'فاتورة مبيع',
  purchase: 'فاتورة شراء',
  sale_return: 'مرتجع مبيع',
  purchase_return: 'مرتجع شراء',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(state: CompanyState, date: string): void {
  if (!DATE_RE.test(date)) fail(`تاريخ غير صالح: ${date}`);
  const locked = state.info?.lockedUntil;
  if (locked && date <= locked) fail(`الفترة حتى ${locked} مقفلة، لا يمكن تسجيل حركات بتاريخ ${date}`);
}

function invoiceVoided(state: CompanyState, invoiceId: string | undefined): boolean {
  return !!invoiceId && !!state.invoices.find((i) => i.id === invoiceId)?.voidEntryId;
}

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
      const others = Object.values(state.items).filter((i) => i.id !== item.id);
      if (others.some((i) => i.code === item.code)) fail(`الرمز ${item.code} مستخدم لمادة أخرى`);
      const barcodes = [item.barcode, ...(item.units ?? []).map((u) => u.barcode)].filter(Boolean);
      for (const b of barcodes) {
        if (others.some((i) => i.barcode === b || i.units?.some((u) => u.barcode === b))) fail(`الباركود ${b} مستخدم لمادة أخرى`);
      }
      if (!state.currencies[item.priceCurrency]) fail('عملة السعر غير معرّفة');
      for (const p of [item.price, item.wholesalePrice, item.specialPrice, ...(item.units ?? []).map((u) => u.price)]) {
        if (p !== undefined && (!Number.isSafeInteger(p) || p < 0)) fail('سعر غير صالح');
      }
      for (const u of item.units ?? []) {
        if (!u.name.trim() || !(u.factor > 0)) fail('وحدة غير صالحة: يجب إدخال الاسم ومعامل التحويل');
        if (u.name === item.unit) fail('اسم الوحدة الإضافية يطابق الوحدة الأساسية');
      }
      if (item.kind === 'composite') {
        if (!item.recipe?.length) fail('الصنف المركّب يحتاج مكوّنات');
      }
      for (const r of item.recipe ?? []) {
        const c = state.items[r.itemId] ?? fail('مكوّن غير موجود');
        if (c.kind !== 'stock') fail(`المكوّن "${c.name}" يجب أن يكون مادة مخزنية`);
        if (r.itemId === item.id) fail('لا يمكن أن يكون الصنف مكوّناً لنفسه');
        if (!(r.qty > 0)) fail('كمية المكوّن يجب أن تكون أكبر من صفر');
      }
      const existing = state.items[item.id];
      const lvl = state.stock[item.id];
      if (existing && lvl && lvl.totalQty !== 0) {
        if (existing.kind !== item.kind) fail('لا يمكن تغيير نوع مادة لها رصيد في المخزون');
        if (!!existing.trackExpiry !== !!item.trackExpiry) fail('لا يمكن تغيير تتبّع الصلاحية لمادة لها رصيد');
        if (!!existing.trackSerial !== !!item.trackSerial) fail('لا يمكن تغيير تتبّع الأرقام التسلسلية لمادة لها رصيد');
      }
      return;
    }
    case 'vehicle.saved':
      if (!state.parties[event.vehicle.partyId]) fail('صاحب السيارة/الجهاز غير موجود');
      if ((event.vehicle.kind ?? 'vehicle') === 'vehicle' && !event.vehicle.plate.trim()) fail('رقم اللوحة مطلوب');
      if (!event.vehicle.make.trim()) fail('النوع / الماركة مطلوب');
      return;
    case 'repair.saved': {
      const r = event.repair;
      if (!state.vehicles[r.vehicleId]) fail('السيارة/الجهاز غير موجود');
      if (!state.parties[r.partyId]) fail('الزبون غير موجود');
      if (!state.currencies[r.currency]) fail('عملة غير معرّفة');
      for (const p of r.parts) {
        if (!state.items[p.itemId]) fail('قطعة غير موجودة في أمر الإصلاح');
        if (!(p.qty > 0)) fail('كمية القطعة يجب أن تكون أكبر من صفر');
      }
      const existing = state.repairs[r.id];
      if (existing?.status === 'invoiced' && r.status !== 'invoiced' && !invoiceVoided(state, existing.invoiceId)) {
        fail('أمر الإصلاح مفوتر ولا يمكن تعديل حالته');
      }
      return;
    }
    case 'table.saved':
      if (!event.table.name.trim()) fail('اسم الطاولة مطلوب');
      return;
    case 'order.saved': {
      const o = event.order;
      if (o.tableId && !state.tables[o.tableId]) fail('الطاولة غير موجودة');
      for (const l of o.lines) {
        if (!state.items[l.itemId]) fail('صنف غير موجود في الطلب');
        if (!(l.qty > 0)) fail('الكمية يجب أن تكون أكبر من صفر');
      }
      const existing = state.orders[o.id];
      if (existing && existing.status !== 'open') fail('الطلب مغلق ولا يمكن تعديله');
      if (o.status === 'open' && o.tableId) {
        const busy = Object.values(state.orders).find((x) => x.id !== o.id && x.status === 'open' && x.tableId === o.tableId);
        if (busy) fail(`الطاولة عليها طلب مفتوح رقم ${busy.number}`);
      }
      return;
    }
    case 'appointment.saved': {
      const a = event.appointment;
      if (!state.parties[a.partyId]) fail('المراجع غير موجود');
      if (!DATE_RE.test(a.date) || !/^\d{2}:\d{2}$/.test(a.time)) fail('تاريخ أو وقت غير صالح');
      if (a.itemId && !state.items[a.itemId]) fail('الخدمة غير موجودة');
      const prev = state.appointments[a.id];
      if (prev?.invoiceId && a.status !== 'done' && !invoiceVoided(state, prev.invoiceId)) fail('الموعد مفوتر');
      return;
    }
    case 'tailor.saved': {
      const o = event.order;
      if (!state.parties[o.partyId]) fail('الزبون غير موجود');
      if (!DATE_RE.test(o.date) || (o.dueDate && !DATE_RE.test(o.dueDate)) || (o.fittingDate && !DATE_RE.test(o.fittingDate))) fail('تاريخ غير صالح');
      if (!state.currencies[o.currency]) fail('عملة غير معروفة');
      for (const g of o.garments) {
        if (!g.description.trim()) fail('اكتب نوع القطعة');
        if (!(g.qty > 0) || !Number.isSafeInteger(g.price) || g.price < 0) fail(`كمية أو أجرة غير صالحة: ${g.description}`);
      }
      for (const f of o.fabrics) {
        const item = state.items[f.itemId] ?? fail('قماش غير موجود في المواد');
        if (item.kind === 'composite') fail(`لا يمكن استخدام ${item.name} كقماش`);
        if (!(f.qty > 0) || !Number.isSafeInteger(f.price) || f.price < 0) fail(`كمية أو سعر غير صالح: ${item.name}`);
      }
      const prev = state.tailorOrders[o.id];
      if (prev && prev.number !== o.number) fail('لا يمكن تغيير رقم الطلب');
      if (prev?.invoiceId && !invoiceVoided(state, prev.invoiceId) && (o.status !== 'delivered' || o.invoiceId !== prev.invoiceId)) fail('الطلب مسلّم ومفوتر؛ ألغِ الفاتورة أولاً لتعديله');
      return;
    }
    case 'invoice.posted': {
      const inv = event.invoice;
      checkDate(state, inv.date);
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
    case 'stock.adjusted': {
      const a = event.adjustment;
      checkDate(state, a.date);
      if (!state.warehouses[a.warehouseId]) fail('المستودع غير موجود');
      if (a.lines.length === 0) fail('لا توجد مواد');
      for (const l of a.lines) {
        const item = state.items[l.itemId] ?? fail('مادة غير موجودة');
        if (item.kind !== 'stock') fail(`"${item.name}" ليست مادة مخزنية`);
      }
      return;
    }
    case 'stock.transferred': {
      const t = event.transfer;
      checkDate(state, t.date);
      if (!state.warehouses[t.from] || !state.warehouses[t.to]) fail('المستودع غير موجود');
      if (t.from === t.to) fail('اختر مستودعين مختلفين');
      return;
    }
    case 'production.posted':
      checkDate(state, event.production.date);
      if (!state.warehouses[event.production.warehouseId]) fail('المستودع غير موجود');
      if (event.production.outputs.length === 0) fail('حدد المنتجات');
      return;
  }
}

// ───────────── التطبيق على الحالة ─────────────

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
    case 'table.saved':
      state.tables[event.table.id] = { ...event.table };
      return;
    case 'order.saved':
      state.orders[event.order.id] = { ...event.order };
      bump(state, 'order', event.order.number);
      return;
    case 'appointment.saved':
      state.appointments[event.appointment.id] = { ...event.appointment };
      return;
    case 'tailor.saved':
      state.tailorOrders[event.order.id] = { ...event.order };
      bump(state, 'tailor', event.order.number);
      return;
    case 'invoice.posted':
      state.invoices.push(event.invoice);
      state.entries.push(event.entry);
      bump(state, event.invoice.kind, event.invoice.number);
      for (const m of invoiceMoves(state, event.invoice)) applyMove(state, m);
      return;
    case 'invoice.voided': {
      const inv = state.invoices.find((i) => i.id === event.invoiceId)!;
      inv.voidEntryId = event.entry.id;
      state.entries.push(event.entry);
      state.voided[inv.entryId] = event.entry.id;
      for (const m of invoiceMoves(state, inv)) applyMove(state, negate(m));
      return;
    }
    case 'stock.adjusted':
      state.adjustments.push(event.adjustment);
      if (event.entry) state.entries.push(event.entry);
      bump(state, 'adjustment', event.adjustment.number);
      for (const m of adjustmentMoves(event.adjustment)) applyMove(state, m);
      return;
    case 'stock.transferred':
      state.transfers.push(event.transfer);
      bump(state, 'transfer', event.transfer.number);
      for (const m of transferMoves(event.transfer)) applyMove(state, m);
      return;
    case 'production.posted':
      state.productions.push(event.production);
      bump(state, 'production', event.production.number);
      for (const m of productionMoves(event.production)) applyMove(state, m);
      return;
  }
}

// ───────────── بناء الفاتورة وقيدها ─────────────

export interface InvoiceLineDraft {
  itemId?: string | null;
  description?: string;
  qty: number;
  unit?: string; // اسم وحدة إضافية (كرتونة مثلاً)
  price: number; // سعر الوحدة المختارة بأصغر وحدة من عملة الفاتورة
  discount?: number;
  batch?: string;
  expiry?: string;
  serials?: string[];
  note?: string;
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
  salesman?: string;
  notes?: string;
  source?: { type: string; id: string };
  createdBy?: string;
}

export interface InvoiceContext {
  state: CompanyState;
  baseCode: string;
  resolveRate(currency: string, date: string): number | undefined;
  buildEntry(draft: EntryDraft): JournalEntry;
  partyBalance(partyId: string): number;
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

export function lineAmount(l: Pick<InvoiceLine, 'qty' | 'price' | 'discount'>): number {
  return Math.round(l.qty * l.price) - l.discount;
}

export function buildInvoice(ctx: InvoiceContext, draft: InvoiceDraft): { invoice: Invoice; entry: JournalEntry } {
  const { state, baseCode } = ctx;
  const kind = draft.kind;
  checkDate(state, draft.date);
  const isSaleSide = kind === 'sale' || kind === 'sale_return';
  const currency = draft.currency ?? baseCode;
  if (!state.currencies[currency]) fail('عملة غير معرّفة');
  const rate =
    currency === baseCode ? 1 : (draft.rate ?? ctx.resolveRate(currency, draft.date) ?? fail(`لا يوجد سعر صرف لـ ${currency} بتاريخ ${draft.date}`));
  const warehouseId = draft.warehouseId ?? Object.keys(state.warehouses)[0] ?? fail('لا يوجد مستودع');
  if (!state.warehouses[warehouseId]) fail('المستودع غير موجود');
  const partyId = draft.partyId ?? null;
  const party = partyId ? (state.parties[partyId] ?? fail('العميل/المورد غير موجود')) : null;
  if (party) {
    if (isSaleSide && party.kind === 'supplier') fail(`${party.name} مسجّل كمورد فقط`);
    if (!isSaleSide && party.kind === 'customer') fail(`${party.name} مسجّل كعميل فقط`);
  }
  if (draft.lines.length === 0) fail('الفاتورة فارغة');
  const allowNegative = !!state.info?.allowNegativeStock;

  const lines: InvoiceLine[] = draft.lines.map((d, i) => {
    const n = i + 1;
    const item = d.itemId ? (state.items[d.itemId] ?? fail(`السطر ${n}: مادة غير موجودة`)) : null;
    if (!(d.qty > 0) || !Number.isFinite(d.qty)) fail(`السطر ${n}: الكمية يجب أن تكون أكبر من صفر`);
    if (!Number.isSafeInteger(d.price) || d.price < 0) fail(`السطر ${n}: سعر غير صالح`);
    const discount = d.discount ?? 0;
    if (!Number.isSafeInteger(discount) || discount < 0 || discount > Math.round(d.qty * d.price)) fail(`السطر ${n}: خصم غير صالح`);
    const description = d.description?.trim() || item?.name || fail(`السطر ${n}: البيان مطلوب`);
    let factor = 1;
    if (d.unit && item && d.unit !== item.unit) {
      const u = item.units?.find((x) => x.name === d.unit) ?? fail(`السطر ${n}: الوحدة "${d.unit}" غير معرّفة لـ"${item.name}"`);
      factor = u.factor;
    }
    if (item?.trackSerial && !Number.isInteger(d.qty * factor)) fail(`السطر ${n}: كمية المواد ذات الأرقام التسلسلية يجب أن تكون عدداً صحيحاً`);
    return {
      itemId: item?.id ?? null,
      description,
      qty: roundQty(d.qty),
      ...(factor !== 1 ? { unit: d.unit!, factor } : {}),
      price: d.price,
      discount,
      ...(d.note ? { note: d.note } : {}),
    };
  });

  const amounts = lines.map(lineAmount);
  const subtotal = amounts.reduce((s, a) => s + a, 0);
  const discount = draft.discount ?? 0;
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) fail('خصم الفاتورة غير صالح');
  const taxes = (draft.taxIds ?? []).map((id) => state.taxes[id] ?? fail('ضريبة غير معرّفة'));
  const taxResult = computeTaxes(subtotal - discount, taxes.map((t) => ({ ...t, active: true })));
  const taxTotal = taxResult.total - taxResult.net;
  const total = taxResult.total;
  const paid = draft.paid ?? (partyId ? 0 : total);
  if (!Number.isSafeInteger(paid) || paid < 0 || paid > total) fail('المبلغ المدفوع غير صالح');
  if (!partyId && paid !== total) fail('الفاتورة النقدية بدون اسم يجب أن تُدفع كاملة؛ اختر عميلاً/مورداً للبيع بالدين');
  const cashAccountId = draft.cashAccountId ?? (currency === 'USD' && state.accounts[SYSTEM_ACCOUNTS.usdCash] ? SYSTEM_ACCOUNTS.usdCash : SYSTEM_ACCOUNTS.cash);
  const cashAccount = state.accounts[cashAccountId] ?? fail('الصندوق غير موجود');
  if (cashAccount.currency && cashAccount.currency !== currency && paid > 0) fail(`الصندوق "${cashAccount.name}" يقبل ${cashAccount.currency} فقط`);
  const toBase = (minor: number) => convertMinor(minor, state.currencies[currency]!, state.currencies[baseCode]!, rate);

  // حد الائتمان: لا نسمح بتجاوز دين العميل للحد المسموح
  if (kind === 'sale' && party?.creditLimit && total - paid > 0) {
    const after = ctx.partyBalance(party.id) + toBase(total - paid);
    if (after > party.creditLimit) fail(`تجاوز حد الائتمان للعميل ${party.name}`);
  }

  // التكلفة والدفعات والأرقام لكل سطر
  const planner = new StockPlanner(state);
  const shares = allocate(total, amounts);
  lines.forEach((l, i) => {
    if (!l.itemId) return;
    const item = state.items[l.itemId]!;
    const d = draft.lines[i]!;
    const baseQty = roundQty(l.qty * (l.factor ?? 1));
    const opts = {
      ...(d.batch ? { batch: d.batch } : {}),
      ...(d.expiry ? { expiry: d.expiry } : {}),
      ...(d.serials ? { serials: d.serials } : {}),
      allowNegative,
    };
    if (item.kind === 'stock') {
      if (kind === 'sale') Object.assign(l, planner.out(item.id, warehouseId, baseQty, opts));
      else if (kind === 'sale_return') {
        const cost = Math.round(planner.unitCost(item.id) * baseQty);
        Object.assign(l, { cost }, planner.in(item.id, warehouseId, baseQty, cost, opts));
      } else if (kind === 'purchase') {
        // تكلفة الشراء = حصة السطر من صافي الفاتورة شامل الخصم والضرائب
        const cost = toBase(shares[i]!);
        Object.assign(l, { cost }, planner.in(item.id, warehouseId, baseQty, cost, opts));
      } else {
        const out = planner.out(item.id, warehouseId, baseQty, opts);
        Object.assign(l, out, { cost: toBase(shares[i]!) });
      }
    } else if (item.kind === 'composite' && isSaleSide) {
      l.components = (item.recipe ?? []).map((r) => {
        const qty = roundQty(r.qty * baseQty);
        if (kind === 'sale') return { itemId: r.itemId, qty, cost: planner.out(r.itemId, warehouseId, qty, { allowNegative }).cost };
        const cost = Math.round(planner.unitCost(r.itemId) * qty);
        planner.in(r.itemId, warehouseId, qty, cost);
        return { itemId: r.itemId, qty, cost };
      });
      l.cost = l.components.reduce((s, c) => s + c.cost, 0);
    }
  });

  const id = crypto.randomUUID();
  const number = (state.counters[kind] ?? 0) + 1;
  const partySide = isSaleSide ? SYSTEM_ACCOUNTS.customers : SYSTEM_ACCOUNTS.suppliers;
  // الجهة التي يدخل فيها المال للشركة (مدين في المبيع)
  const moneyIn = kind === 'sale' || kind === 'purchase_return';
  const dr = (amount: number): Pick<LineDraft, 'debit' | 'credit'> => ({ debit: amount });
  const cr = (amount: number): Pick<LineDraft, 'debit' | 'credit'> => ({ credit: amount });
  const money = moneyIn ? dr : cr;
  const against = moneyIn ? cr : dr;
  const fx = { currency, rate };
  const base = { currency: baseCode, rate: 1 };
  const isGoods = (l: InvoiceLine) => !!l.itemId && state.items[l.itemId]!.kind !== 'service';

  const entryLines: LineDraft[] = [];
  const push = (l: LineDraft) => {
    if ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0) entryLines.push(l);
  };
  push({ accountId: cashAccountId, ...money(paid), ...fx });
  if (partyId) push({ accountId: partySide, ...money(total - paid), ...fx, partyId });

  const cost = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
  if (isSaleSide) {
    const goods = lines.reduce((s, l, i) => s + (isGoods(l) ? amounts[i]! : 0), 0);
    const services = subtotal - goods;
    const revenue = kind === 'sale' ? SYSTEM_ACCOUNTS.sales : SYSTEM_ACCOUNTS.salesReturns;
    push({ accountId: revenue, ...against(goods), ...fx });
    push({ accountId: SYSTEM_ACCOUNTS.serviceRevenue, ...against(services), ...fx });
    push({ accountId: SYSTEM_ACCOUNTS.discountAllowed, ...money(discount), ...fx });
    taxResult.taxes.forEach((t) => push({ accountId: t.tax.accountId, ...against(t.amount), ...fx }));
    // المبيع: من حـ/ تكلفة البضاعة إلى حـ/ المخزون، والمرتجع بالعكس
    const out = kind === 'sale';
    push({ accountId: SYSTEM_ACCOUNTS.cogs, ...(out ? dr(cost) : cr(cost)), ...base });
    push({ accountId: SYSTEM_ACCOUNTS.inventory, ...(out ? cr(cost) : dr(cost)), ...base });
  } else {
    push({ accountId: SYSTEM_ACCOUNTS.inventory, ...against(cost), ...base });
    const other = lines.reduce((s, l, i) => s + (l.itemId && state.items[l.itemId]!.kind === 'stock' ? 0 : shares[i]!), 0);
    push({ accountId: SYSTEM_ACCOUNTS.miscExpenses, ...against(other), ...fx });
  }

  const entry = ctx.buildEntry({
    date: draft.date,
    memo: `${INVOICE_KIND_NAMES[kind]} رقم ${number}${party ? ` — ${party.name}` : ''}`,
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
    ...(draft.salesman ? { salesman: draft.salesman } : {}),
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

/** أسطر فاتورة التسليم: أجور الخياطة كخدمات + الأقمشة من المخزون. */
export function tailorToInvoiceLines(state: CompanyState, order: TailorOrder): InvoiceLineDraft[] {
  return [
    ...order.garments.map((g) => ({ itemId: null, description: `خياطة ${g.description}`, qty: g.qty, price: g.price, ...(g.notes ? { note: g.notes } : {}) })),
    ...order.fabrics.map((f) => ({ itemId: f.itemId, description: state.items[f.itemId]?.name ?? '', qty: f.qty, price: f.price })),
  ];
}

/** مجموع العربون الفعّال (السندات غير الملغاة). */
export function tailorDeposits(state: CompanyState, order: TailorOrder): number {
  return order.deposits.filter((d) => !state.voided[d.entryId]).reduce((s, d) => s + d.amount, 0);
}

/** مجموع الطلب قبل الخصم والضريبة. */
export function tailorSubtotal(order: Pick<TailorOrder, 'garments' | 'fabrics'>): number {
  return order.garments.reduce((s, g) => s + Math.round(g.qty * g.price), 0) + order.fabrics.reduce((s, f) => s + Math.round(f.qty * f.price), 0);
}
