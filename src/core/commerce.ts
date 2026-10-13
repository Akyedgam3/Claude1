import { SYSTEM_ACCOUNTS } from './chart-templates';
import type { EntryDraft, LineDraft } from './ledger';
import { convertMinor } from './money';
import { adjustmentMoves, applyMove, assertMovesPossible, invoiceMoves, negate, productionMoves, roundQty, StockPlanner, transferMoves } from './stock';
import { computeTaxes } from './tax';
import type { CompanyEvent, CompanyState, FabricRoll, Invoice, InvoiceKind, InvoiceLine, JournalEntry, LengthUnit, Order, Quote, RepairOrder, TailorOrder, WorkOrder, WorkStage } from './types';

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
      if (o.discount !== undefined && (!Number.isSafeInteger(o.discount) || o.discount < 0)) fail('خصم غير صالح');
      if (o.deliveryFee !== undefined && (!Number.isSafeInteger(o.deliveryFee) || o.deliveryFee < 0)) fail('أجور توصيل غير صالحة');
      if (o.servicePercent !== undefined && !(o.servicePercent >= 0 && o.servicePercent <= 50)) fail('نسبة الخدمة بين 0 و 50');
      if (o.partyId && !state.parties[o.partyId]) fail('الزبون غير موجود');
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
    case 'quote.saved': {
      const q = event.quote;
      if (!DATE_RE.test(q.date) || (q.validUntil && !DATE_RE.test(q.validUntil))) fail('تاريخ غير صالح');
      if (q.partyId && !state.parties[q.partyId]) fail('الزبون غير موجود');
      if (!state.currencies[q.currency]) fail('عملة غير معروفة');
      for (const l of q.lines) {
        if (l.itemId && !state.items[l.itemId]) fail(`مادة غير موجودة: ${l.description}`);
        if (!(l.qty > 0) || !Number.isSafeInteger(l.price) || l.price < 0) fail(`كمية أو سعر غير صالح: ${l.description}`);
        if (l.discount !== undefined && (!Number.isSafeInteger(l.discount) || l.discount < 0)) fail('خصم غير صالح');
      }
      for (const t of q.taxIds) if (!state.taxes[t]) fail('ضريبة غير معروفة');
      const prev = state.quotes[q.id];
      if (prev && prev.number !== q.number) fail('لا يمكن تغيير رقم العرض');
      if (prev?.invoiceId && !invoiceVoided(state, prev.invoiceId) && (q.status !== 'converted' || q.invoiceId !== prev.invoiceId)) fail('العرض تحوّل إلى فاتورة');
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
    case 'rolls.saved': {
      const rolls = event.rolls.map(normalizeRoll);
      if (rolls.length === 0) fail('أضف توب قماش واحد على الأقل');
      const codes = new Set<string>();
      for (const r of rolls) {
        if (!state.parties[r.partyId]) fail('صاحب القماش غير موجود');
        if (!DATE_RE.test(r.date)) fail('تاريخ غير صالح');
        if (!r.code.trim()) fail('اكتب رقم التوب');
        if (!r.fabric.trim()) fail('اكتب نوع القماش');
        if (r.unit !== 'yd' && r.unit !== 'm') fail('وحدة الطول غير صالحة');
        if (!Number.isSafeInteger(r.length) || r.length <= 0) fail(`طول غير صالح للتوب ${r.code}`);
        if (r.widthCm !== undefined && (!Number.isSafeInteger(r.widthCm) || r.widthCm <= 0)) fail(`عرض غير صالح للتوب ${r.code}`);
        for (const x of r.returns) if (!DATE_RE.test(x.date) || !Number.isSafeInteger(x.length) || x.length <= 0) fail(`مرتجع غير صالح للتوب ${r.code}`);
        const key = `${r.partyId}|${r.code.trim()}`;
        if (codes.has(key)) fail(`رقم التوب ${r.code} مكرر`);
        codes.add(key);
        const dup = Object.values(state.rolls).find((x) => x.id !== r.id && x.partyId === r.partyId && x.code.trim() === r.code.trim());
        if (dup) fail(`التوب رقم ${r.code} مسجّل مسبقاً لنفس الزبون`);
        const prev = state.rolls[r.id];
        const used = rollUsed(state, r.id);
        if (prev && used > 0 && (prev.partyId !== r.partyId || prev.unit !== r.unit)) fail(`التوب ${r.code} مستعمل؛ لا يمكن تغيير صاحبه أو وحدته`);
        if (used + rollReturned(r) > r.length) fail(`المستعمل والمرتجع من التوب ${r.code} أكثر من طوله`);
      }
      return;
    }
    case 'workorder.saved': {
      const o = normalizeWorkOrder(event.order);
      if (!state.parties[o.partyId]) fail('الزبون غير موجود');
      if (!DATE_RE.test(o.date) || (o.dueDate && !DATE_RE.test(o.dueDate))) fail('تاريخ غير صالح');
      if (!o.model.trim()) fail('اكتب اسم الموديل');
      if (!state.currencies[o.currency]) fail('عملة غير معروفة');
      if (!Number.isSafeInteger(o.pieceRate) || o.pieceRate < 0) fail('أجرة القطعة غير صالحة');
      if (o.sizes.length === 0 || new Set(o.sizes).size !== o.sizes.length || o.sizes.some((z) => !z.trim())) fail('حدد النمر بدون تكرار');
      if (o.unit && o.unit !== 'yd' && o.unit !== 'm') fail('وحدة الطول غير صالحة');
      if (o.markerLength !== undefined && (!Number.isSafeInteger(o.markerLength) || o.markerLength <= 0)) fail('طول الرسمة غير صالح');
      const sizeOk = (rec: Record<string, number>) => Object.entries(rec).every(([k, v]) => o.sizes.includes(k) && Number.isSafeInteger(v) && v >= 0);
      if (!sizeOk(o.planned)) fail('كميات النمر غير صالحة');
      if (o.ratio && !sizeOk(o.ratio)) fail('توزيع الرسمة غير صالح');
      const prev = state.workOrders[o.id] ? normalizeWorkOrder(state.workOrders[o.id]!) : undefined;
      if (prev && prev.number !== o.number) fail('لا يمكن تغيير رقم الطلبية');
      if (prev && prev.partyId !== o.partyId && (prev.cuts.length || prev.deliveries.length || prev.expenses.length)) fail('على الطلبية حركات؛ لا يمكن تغيير الزبون');
      // استهلاك كل توب من كل الطلبيات (مع هذه النسخة الجديدة) لازم ما يتجاوز المتاح
      const other = new Map<string, number>();
      for (const w of Object.values(state.workOrders)) {
        if (w.id === o.id) continue;
        for (const c of w.cuts) for (const r of c.rolls) other.set(r.rollId, (other.get(r.rollId) ?? 0) + cutUsed(r));
      }
      const mine = new Map<string, number>();
      for (const c of o.cuts) {
        if (!DATE_RE.test(c.date)) fail('تاريخ المدّ غير صالح');
        if (!sizeOk(c.pieces)) fail('عدد القطع غير صالح');
        for (const r of c.rolls) {
          const roll = state.rolls[r.rollId] ?? fail('توب غير موجود');
          if (roll.partyId !== o.partyId) fail(`التوب ${roll.code} مو لنفس الزبون`);
          if (!Number.isSafeInteger(r.used) || r.used <= 0) fail(`طول غير صالح من التوب ${roll.code}`);
          if (r.lays !== undefined && (!Number.isSafeInteger(r.lays) || r.lays < 0)) fail(`عدد مدات غير صالح للتوب ${roll.code}`);
          mine.set(r.rollId, (mine.get(r.rollId) ?? 0) + r.used);
        }
      }
      for (const [rollId, used] of mine) {
        const roll = normalizeRoll(state.rolls[rollId]!);
        const free = roll.length - rollReturned(roll) - (other.get(rollId) ?? 0);
        if (used > free) fail(`التوب ${roll.code} ما فيه كفاية: المتاح ${(free / 100).toLocaleString('en')} ${UNIT_NAMES[roll.unit]}`);
      }
      for (const st of o.stages) if (!DATE_RE.test(st.date) || !sizeOk(st.pieces) || !['sewing', 'done', 'damaged'].includes(st.stage)) fail('حركة مرحلة غير صالحة');
      for (const e of o.expenses) if (!DATE_RE.test(e.date) || !Number.isSafeInteger(e.amount) || e.amount <= 0 || !e.kind.trim()) fail('مصروف غير صالح');
      for (const d of o.deliveries) {
        if (!DATE_RE.test(d.date) || !sizeOk(d.pieces)) fail('دفعة تسليم غير صالحة');
        if (d.invoiceId && !state.invoices.some((i) => i.id === d.invoiceId)) fail('فاتورة التسليم غير موجودة');
      }
      const p = workOrderProgress(state, o);
      for (const z of o.sizes) {
        // التالف ممكن يصير بأي مرحلة (قص أو خياطة)
        const cutZ = p.cutBySize[z] ?? 0;
        const good = cutZ - (p.damagedBySize[z] ?? 0);
        if (good < 0) fail(`التالف من نمرة ${z} أكثر من المقصوص`);
        if ((p.sewingBySize[z] ?? 0) > cutZ) fail(`الداخل للخياطة من نمرة ${z} أكثر من المقصوص`);
        if ((p.doneBySize[z] ?? 0) > good) fail(`المنجز من نمرة ${z} أكثر من المقصوص السليم`);
        if (p.usesSewing && (p.doneBySize[z] ?? 0) > (p.sewingBySize[z] ?? 0)) fail(`المنجز من نمرة ${z} أكثر من الداخل للخياطة`);
        if ((p.deliveredBySize[z] ?? 0) > (p.usesDone ? (p.doneBySize[z] ?? 0) : good)) fail(`المسلّم من نمرة ${z} أكثر من ${p.usesDone ? 'المنجز' : 'المقصوص'}`);
      }
      if (prev) {
        // فواتير التسليمات ما بتنمحى ولا بتتغير من هون
        for (const d of prev.deliveries) {
          if (!d.invoiceId || invoiceVoided(state, d.invoiceId)) continue;
          const now = o.deliveries.find((x) => x.id === d.id);
          if (!now || now.invoiceId !== d.invoiceId || JSON.stringify(now.pieces) !== JSON.stringify(d.pieces)) fail('دفعة مفوترة؛ ألغِ فاتورتها أولاً');
        }
      }
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
      assertMovesPossible(state, invoiceMoves(state, inv).map(negate));
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
    case 'quote.saved':
      state.quotes[event.quote.id] = { ...event.quote };
      bump(state, 'quote', event.quote.number);
      return;
    case 'tailor.saved':
      state.tailorOrders[event.order.id] = { ...event.order };
      bump(state, 'tailor', event.order.number);
      return;
    case 'rolls.saved':
      for (const r of event.rolls) state.rolls[r.id] = normalizeRoll(r);
      bump(state, 'rollReceipt', Math.max(...event.rolls.map((r) => r.receiptNo)));
      return;
    case 'workorder.saved':
      state.workOrders[event.order.id] = normalizeWorkOrder(event.order);
      bump(state, 'workorder', event.order.number);
      bump(state, 'workDelivery', Math.max(0, ...event.order.deliveries.map((d) => d.number)));
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
  let returnVariance = 0;
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
        // مرتجع الشراء يخرج من المخزون بمتوسط التكلفة؛ فرق سعر الإرجاع يذهب لحساب الفروقات
        const out = planner.out(item.id, warehouseId, baseQty, opts);
        Object.assign(l, out);
        returnVariance += toBase(shares[i]!) - out.cost;
      }
    } else if (item.kind === 'composite' && isSaleSide) {
      l.components = (item.recipe ?? []).map((r) => {
        const qty = roundQty(r.qty * baseQty);
        if (kind === 'sale') {
          const o = planner.out(r.itemId, warehouseId, qty, { allowNegative });
          return { itemId: r.itemId, qty, cost: o.cost, ...(o.batches ? { batches: o.batches } : {}) };
        }
        const cost = Math.round(planner.unitCost(r.itemId) * qty);
        // المكوّن ذو الصلاحية يعود في دفعة "مرتجع" لأن دفعته الأصلية غير معروفة
        const back = planner.in(r.itemId, warehouseId, qty, cost, state.items[r.itemId]?.trackExpiry ? { batch: 'مرتجع' } : {});
        return { itemId: r.itemId, qty, cost, ...(back.batches ? { batches: back.batches } : {}) };
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
    // ربح (موجب) أو خسارة (سالب) فرق سعر مرتجع الشراء عن التكلفة
    if (returnVariance > 0) push({ accountId: SYSTEM_ACCOUNTS.countDifferences, credit: returnVariance, ...base });
    if (returnVariance < 0) push({ accountId: SYSTEM_ACCOUNTS.countDifferences, debit: -returnVariance, ...base });
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

/** مجاميع عرض السعر (للعرض والطباعة). */
export function quoteTotals(state: CompanyState, q: Pick<Quote, 'lines' | 'discount' | 'taxIds'>) {
  const subtotal = q.lines.reduce((s, l) => s + Math.round(l.qty * l.price) - (l.discount ?? 0), 0);
  const taxes = computeTaxes(subtotal - q.discount, q.taxIds.filter((id) => state.taxes[id]).map((id) => ({ ...state.taxes[id]!, active: true })));
  return { subtotal, discount: q.discount, taxes: taxes.taxes, total: taxes.total };
}

// ───────────── ورشة الإنتاج ─────────────

export const UNIT_NAMES: Record<LengthUnit, string> = { yd: 'يارد', m: 'متر' };
const YARD_M = 0.9144;

/** تحويل طول (× 100) بين الياردة والمتر. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  return Math.round(from === 'yd' ? value * YARD_M : value / YARD_M);
}

// أحداث الإصدار الأول كانت بالسنتيمتر (lengthCm / cm): منحوّلها لأمتار × 100 وهي نفس القيمة
type LegacyRoll = Omit<FabricRoll, 'returns' | 'length' | 'unit'> & { unit?: LengthUnit; length?: number; lengthCm?: number; returns: { date: string; length?: number; cm?: number; note?: string }[] };
export function normalizeRoll(r: FabricRoll): FabricRoll {
  const x = r as unknown as LegacyRoll;
  if (x.length !== undefined && x.unit && x.returns.every((y) => y.length !== undefined)) return r;
  const { lengthCm, ...rest } = x;
  return {
    ...rest,
    unit: x.unit ?? 'm',
    length: x.length ?? lengthCm ?? 0,
    returns: x.returns.map(({ cm, ...y }) => ({ ...y, length: y.length ?? cm ?? 0 })),
  };
}
type LegacyCutRoll = { rollId: string; lays?: number; used?: number; cm?: number };
const cutUsed = (r: LegacyCutRoll): number => r.used ?? r.cm ?? 0;
export function normalizeWorkOrder(o: WorkOrder): WorkOrder {
  if (o.stages && o.expenses && o.cuts.every((c) => c.rolls.every((r) => r.used !== undefined))) return o;
  return {
    ...o,
    stages: o.stages ?? [],
    expenses: o.expenses ?? [],
    cuts: o.cuts.map((c) => ({ ...c, rolls: c.rolls.map((r) => ({ rollId: r.rollId, ...(r.lays !== undefined ? { lays: r.lays } : {}), used: cutUsed(r as LegacyCutRoll) })) })),
  };
}

export function sumPieces(list: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rec of list) for (const [k, v] of Object.entries(rec)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function piecesTotal(rec: Record<string, number>): number {
  return Object.values(rec).reduce((t, v) => t + v, 0);
}

/** كم انقص من التوب بكل المدات (بوحدة التوب × 100). */
export function rollUsed(state: CompanyState, rollId: string): number {
  let t = 0;
  for (const w of Object.values(state.workOrders)) for (const c of w.cuts) for (const r of c.rolls) if (r.rollId === rollId) t += cutUsed(r);
  return t;
}

export function rollReturned(roll: FabricRoll): number {
  return normalizeRoll(roll).returns.reduce((t, x) => t + x.length, 0);
}

export function rollRemaining(state: CompanyState, roll: FabricRoll): number {
  return normalizeRoll(roll).length - rollUsed(state, roll.id) - rollReturned(roll);
}

/** كم مدة بيعطي طول معيّن (بوحدة التوب) لرسمة طولها markerLength (بوحدة الطلبية). */
export function laysFrom(length: number, rollUnit: LengthUnit, markerLength: number, orderUnit: LengthUnit): number {
  const marker = convertLength(markerLength, orderUnit, rollUnit);
  return marker > 0 ? Math.floor(length / marker) : 0;
}

export interface WorkOrderProgress {
  planned: number;
  piecesPerLay: number;
  lays: number; // المدات المنفذة
  laysNeeded: number | null; // المدات المطلوبة حسب الرسمة
  lengthNeeded: number | null; // الطول المطلوب (بوحدة الطلبية × 100)
  cut: number;
  sewing: number;
  done: number;
  damaged: number;
  delivered: number;
  cutBySize: Record<string, number>;
  sewingBySize: Record<string, number>;
  doneBySize: Record<string, number>;
  damagedBySize: Record<string, number>;
  deliveredBySize: Record<string, number>;
  readyBySize: Record<string, number>; // جاهز للتسليم
  usesSewing: boolean;
  usesDone: boolean;
  used: number; // الطول المستهلك (بوحدة الطلبية × 100)
  perPiece: number | null; // متوسط الطول للقطعة (× 100)
  shortage: number; // نقص القطع عن المطلوب بعد القص (المطلوب - المقصوص السليم)
  invoiced: number;
  earned: number; // قيمة القطع المسلّمة (أجرة × عدد)
  expensesCustomer: number;
  expensesWorkshop: number;
}

export function workOrderProgress(state: CompanyState, order: WorkOrder): WorkOrderProgress {
  const o = normalizeWorkOrder(order);
  const unit = o.unit ?? 'm';
  const byStage = (k: WorkStage['stage']) => sumPieces(o.stages.filter((s) => s.stage === k).map((s) => s.pieces));
  const cutBySize = sumPieces(o.cuts.map((c) => c.pieces));
  const sewingBySize = byStage('sewing');
  const doneBySize = byStage('done');
  const damagedBySize = byStage('damaged');
  const deliveredBySize = sumPieces(o.deliveries.map((d) => d.pieces));
  const usesSewing = o.stages.some((s) => s.stage === 'sewing');
  const usesDone = o.stages.some((s) => s.stage === 'done');
  const readyBySize: Record<string, number> = {};
  for (const z of o.sizes) {
    const good = (cutBySize[z] ?? 0) - (damagedBySize[z] ?? 0);
    readyBySize[z] = (usesDone ? (doneBySize[z] ?? 0) : good) - (deliveredBySize[z] ?? 0);
  }
  let used = 0;
  for (const c of o.cuts)
    for (const r of c.rolls) {
      const roll = state.rolls[r.rollId];
      used += roll ? convertLength(r.used, normalizeRoll(roll).unit, unit) : r.used;
    }
  const lays = o.cuts.reduce((t, c) => t + c.rolls.reduce((s, r) => s + (r.lays ?? 0), 0), 0);
  const ratio = o.ratio ?? {};
  const piecesPerLay = piecesTotal(ratio);
  let laysNeeded: number | null = null;
  if (piecesPerLay > 0) {
    laysNeeded = 0;
    for (const z of o.sizes) if ((ratio[z] ?? 0) > 0) laysNeeded = Math.max(laysNeeded, Math.ceil((o.planned[z] ?? 0) / ratio[z]!));
  }
  const cut = piecesTotal(cutBySize);
  const damaged = piecesTotal(damagedBySize);
  const delivered = piecesTotal(deliveredBySize);
  const planned = piecesTotal(o.planned);
  return {
    planned,
    piecesPerLay,
    lays,
    laysNeeded,
    lengthNeeded: laysNeeded !== null && o.markerLength ? laysNeeded * o.markerLength : null,
    cut,
    sewing: piecesTotal(sewingBySize),
    done: piecesTotal(doneBySize),
    damaged,
    delivered,
    cutBySize,
    sewingBySize,
    doneBySize,
    damagedBySize,
    deliveredBySize,
    readyBySize,
    usesSewing,
    usesDone,
    used,
    perPiece: cut > 0 ? used / cut : null,
    shortage: Math.max(0, planned - (cut - damaged)),
    invoiced: o.deliveries.filter((d) => d.invoiceId && !invoiceVoided(state, d.invoiceId)).reduce((t, d) => t + piecesTotal(d.pieces), 0),
    earned: delivered * o.pieceRate,
    expensesCustomer: o.expenses.filter((e) => e.billTo === 'customer' && !state.voided[e.entryId]).reduce((t, e) => t + e.amount, 0),
    expensesWorkshop: o.expenses.filter((e) => e.billTo === 'workshop' && !state.voided[e.entryId]).reduce((t, e) => t + e.amount, 0),
  };
}

// ───────────── المطاعم ─────────────

export interface OrderTotals {
  items: number;
  service: number;
  delivery: number;
  discount: number;
  total: number; // قبل الضريبة
}

/** مجموع الطلب: الأصناف + الخدمة + التوصيل - الخصم. */
export function orderTotals(order: Pick<Order, 'lines' | 'servicePercent' | 'deliveryFee' | 'discount'>): OrderTotals {
  const items = order.lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);
  const service = order.servicePercent ? Math.round((items * order.servicePercent) / 100) : 0;
  const delivery = order.deliveryFee ?? 0;
  const discount = Math.min(order.discount ?? 0, items + service + delivery);
  return { items, service, delivery, discount, total: items + service + delivery - discount };
}
