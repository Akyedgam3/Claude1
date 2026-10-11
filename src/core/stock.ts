import type { BatchMove, CompanyState, Invoice, InvoiceKind, Item, Production, StockAdjustment, StockLevel, StockTransfer } from './types';

// كل حركات المخزون (فواتير، جرد، تحويل، إنتاج) تُختزل إلى "حركة" واحدة بهذا الشكل،
// فيبقى منطق الكميات والدفعات والأرقام التسلسلية في مكان واحد.
export interface StockMove {
  itemId: string;
  warehouseId: string;
  qty: number; // بالوحدة الأساسية: موجب = دخول، سالب = خروج
  value: number; // تغيّر القيمة بالعملة الأساسية (بنفس الإشارة)
  batches?: BatchMove[]; // كميات موجبة؛ الاتجاه من إشارة qty
  serials?: string[];
  lastCost?: boolean; // تحديث آخر تكلفة (عند الشراء)
}

function fail(message: string): never {
  throw new Error(message);
}

export function roundQty(q: number): number {
  return Math.round(q * 1000) / 1000;
}

export function emptyLevel(): StockLevel {
  return { qty: {}, totalQty: 0, value: 0, lastCost: 0 };
}

const batchKey = (warehouseId: string, batch: string) => `${warehouseId}|${batch}`;

export function applyMove(state: CompanyState, m: StockMove): void {
  const lvl = (state.stock[m.itemId] ??= emptyLevel());
  lvl.qty[m.warehouseId] = roundQty((lvl.qty[m.warehouseId] ?? 0) + m.qty);
  lvl.totalQty = roundQty(lvl.totalQty + m.qty);
  lvl.value += m.value;
  if (m.lastCost && m.qty > 0) lvl.lastCost = Math.round(m.value / m.qty);
  const sign = m.qty >= 0 ? 1 : -1;
  for (const b of m.batches ?? []) {
    const batches = (lvl.batches ??= {});
    const key = batchKey(m.warehouseId, b.batch);
    const cur = (batches[key] ??= { batch: b.batch, warehouseId: m.warehouseId, qty: 0, ...(b.expiry ? { expiry: b.expiry } : {}) });
    cur.qty = roundQty(cur.qty + sign * b.qty);
    if (b.expiry && !cur.expiry) cur.expiry = b.expiry;
    if (cur.qty === 0) delete batches[key];
  }
  for (const s of m.serials ?? []) {
    const serials = (lvl.serials ??= {});
    if (sign > 0) serials[s] = m.warehouseId;
    else delete serials[s];
  }
}

/** يتحقق أن حركات الإخراج ممكنة (كمية، دفعات، أرقام تسلسلية) قبل تطبيقها — مثلاً عند إلغاء فاتورة شراء بيعت بضاعتها. */
export function assertMovesPossible(state: CompanyState, moves: StockMove[]): void {
  if (state.info?.allowNegativeStock) return;
  const need = new Map<string, number>();
  const batchNeed = new Map<string, number>();
  for (const m of moves) {
    if (m.qty >= 0) continue;
    const k = `${m.itemId}|${m.warehouseId}`;
    need.set(k, roundQty((need.get(k) ?? 0) - m.qty));
    for (const b of m.batches ?? []) {
      if (!b.batch) continue;
      const bk = `${m.itemId}|${batchKey(m.warehouseId, b.batch)}`;
      batchNeed.set(bk, roundQty((batchNeed.get(bk) ?? 0) + b.qty));
    }
    for (const s of m.serials ?? []) {
      if (state.stock[m.itemId]?.serials?.[s] !== m.warehouseId) fail(`الرقم التسلسلي ${s} لم يعد في المخزون (بيع أو نُقل)`);
    }
  }
  for (const [k, q] of need) {
    const [itemId, wh] = k.split('|') as [string, string];
    const have = state.stock[itemId]?.qty[wh] ?? 0;
    if (have + 1e-9 < q) {
      const item = state.items[itemId];
      fail(`لا يمكن: الكمية المتوفرة من "${item?.name ?? itemId}" هي ${roundQty(Math.max(have, 0))} ${item?.unit ?? ''} فقط (بيع جزء منها)`);
    }
  }
  for (const [k, q] of batchNeed) {
    const [itemId, ...rest] = k.split('|');
    const have = state.stock[itemId!]?.batches?.[rest.join('|')]?.qty ?? 0;
    if (have + 1e-9 < q) fail(`الدفعة ${rest[1]} من "${state.items[itemId!]?.name ?? ''}" لم تعد كافية`);
  }
}

export function negate(m: StockMove): StockMove {
  return { ...m, qty: -m.qty, value: -m.value, lastCost: false };
}

/** إشارة حركة المخزون: +1 دخول، -1 خروج. */
export const INVOICE_DIRECTION: Record<InvoiceKind, 1 | -1> = { sale: -1, sale_return: 1, purchase: 1, purchase_return: -1 };

export function invoiceMoves(state: CompanyState, inv: Invoice): StockMove[] {
  const dir = INVOICE_DIRECTION[inv.kind];
  const moves: StockMove[] = [];
  for (const line of inv.lines) {
    if (!line.itemId) continue;
    const item = state.items[line.itemId];
    if (item?.kind === 'stock') {
      moves.push({
        itemId: line.itemId,
        warehouseId: inv.warehouseId,
        qty: dir * roundQty(line.qty * (line.factor ?? 1)),
        value: dir * (line.cost ?? 0),
        ...(line.batches ? { batches: line.batches } : {}),
        ...(line.serials ? { serials: line.serials } : {}),
        ...(inv.kind === 'purchase' ? { lastCost: true } : {}),
      });
    }
    for (const c of line.components ?? []) {
      moves.push({ itemId: c.itemId, warehouseId: inv.warehouseId, qty: dir * c.qty, value: dir * c.cost, ...(c.batches ? { batches: c.batches } : {}) });
    }
  }
  return moves;
}

export function adjustmentMoves(a: StockAdjustment): StockMove[] {
  return a.lines.map((l) => ({
    itemId: l.itemId,
    warehouseId: a.warehouseId,
    qty: l.qty,
    value: l.cost,
    ...(l.batch ? { batches: [{ batch: l.batch, qty: Math.abs(l.qty), ...(l.expiry ? { expiry: l.expiry } : {}) }] } : {}),
    ...(l.serials ? { serials: l.serials } : {}),
    ...(a.kind === 'opening' ? { lastCost: true } : {}),
  }));
}

export function transferMoves(t: StockTransfer): StockMove[] {
  return t.lines.flatMap((l) => {
    // القيمة لا تتغير بالتحويل؛ ننقل الكمية والدفعات والأرقام فقط
    const common = { itemId: l.itemId, value: 0, ...(l.batches ? { batches: l.batches } : {}), ...(l.serials ? { serials: l.serials } : {}) };
    return [
      { ...common, warehouseId: t.from, qty: -l.qty },
      { ...common, warehouseId: t.to, qty: l.qty },
    ];
  });
}

export function productionMoves(p: Production): StockMove[] {
  return [
    ...p.inputs.map((i) => ({ itemId: i.itemId, warehouseId: p.warehouseId, qty: -i.qty, value: -i.cost, ...(i.batches ? { batches: i.batches } : {}) })),
    ...p.outputs.map((o) => ({
      itemId: o.itemId,
      warehouseId: p.warehouseId,
      qty: o.qty,
      value: o.cost,
      lastCost: true,
      ...(o.batch ? { batches: [{ batch: o.batch, qty: o.qty, ...(o.expiry ? { expiry: o.expiry } : {}) }] } : {}),
    })),
  ];
}

// ───────────── التخطيط قبل الترحيل ─────────────

interface Working {
  qty: Record<string, number>;
  totalQty: number;
  value: number;
  lastCost: number;
  batches: Record<string, { batch: string; expiry?: string; warehouseId: string; qty: number }>;
  serials: Record<string, string>;
}

/**
 * يحسب التكلفة والدفعات والأرقام التسلسلية لحركات مستند قبل ترحيله، على نسخة عمل من المخزون،
 * فيتحقق من توفر الكميات (حتى لو تكررت المادة في أكثر من سطر).
 */
export class StockPlanner {
  private readonly work = new Map<string, Working>();

  constructor(private readonly state: CompanyState) {}

  private get(itemId: string): Working {
    let w = this.work.get(itemId);
    if (!w) {
      const s = this.state.stock[itemId] ?? emptyLevel();
      w = {
        qty: { ...s.qty },
        totalQty: s.totalQty,
        value: s.value,
        lastCost: s.lastCost,
        batches: Object.fromEntries(Object.entries(s.batches ?? {}).map(([k, b]) => [k, { ...b }])),
        serials: { ...(s.serials ?? {}) },
      };
      this.work.set(itemId, w);
    }
    return w;
  }

  private item(itemId: string): Item {
    return this.state.items[itemId] ?? fail('مادة غير موجودة');
  }

  available(itemId: string, warehouseId: string): number {
    return this.get(itemId).qty[warehouseId] ?? 0;
  }

  /** متوسط تكلفة الوحدة الأساسية حالياً. */
  unitCost(itemId: string): number {
    const w = this.get(itemId);
    return w.totalQty > 0 ? w.value / w.totalQty : w.lastCost;
  }

  /** إخراج كمية من المخزون: يعيد التكلفة والدفعات المسحوبة (الأقرب انتهاءً أولاً). */
  out(
    itemId: string,
    warehouseId: string,
    qty: number,
    opts: { batch?: string; serials?: string[]; allowNegative?: boolean } = {},
  ): { cost: number; batches?: BatchMove[]; serials?: string[] } {
    const item = this.item(itemId);
    const w = this.get(itemId);
    const have = w.qty[warehouseId] ?? 0;
    if (!opts.allowNegative && have + 1e-9 < qty) {
      fail(`الكمية المتوفرة من "${item.name}" هي ${roundQty(Math.max(have, 0))} ${item.unit} فقط`);
    }
    const cost = Math.round(this.unitCost(itemId) * qty);

    let batches: BatchMove[] | undefined;
    if (item.trackExpiry) {
      batches = [];
      let left = qty;
      const candidates = Object.values(w.batches)
        .filter((b) => b.warehouseId === warehouseId && b.qty > 0 && (!opts.batch || b.batch === opts.batch))
        .sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999'));
      for (const b of candidates) {
        if (left <= 0) break;
        const take = roundQty(Math.min(left, b.qty));
        batches.push({ batch: b.batch, qty: take, ...(b.expiry ? { expiry: b.expiry } : {}) });
        b.qty = roundQty(b.qty - take);
        left = roundQty(left - take);
      }
      if (left > 0) {
        if (opts.batch) fail(`الدفعة ${opts.batch} من "${item.name}" لا تكفي`);
        if (!opts.allowNegative) fail(`لا توجد دفعات كافية من "${item.name}"`);
        batches.push({ batch: '', qty: left });
      }
    }

    let serials: string[] | undefined;
    if (item.trackSerial) {
      serials = opts.serials ?? [];
      if (serials.length !== qty) fail(`أدخل ${qty} رقم تسلسلي لـ"${item.name}"`);
      for (const s of serials) {
        if (w.serials[s] !== warehouseId) fail(`الرقم التسلسلي ${s} غير موجود في المستودع`);
        delete w.serials[s];
      }
    }

    w.qty[warehouseId] = roundQty(have - qty);
    w.totalQty = roundQty(w.totalQty - qty);
    w.value -= cost;
    return { cost, ...(batches ? { batches } : {}), ...(serials ? { serials } : {}) };
  }

  /** إدخال كمية بتكلفة معروفة. */
  in(
    itemId: string,
    warehouseId: string,
    qty: number,
    cost: number,
    opts: { batch?: string; expiry?: string; serials?: string[] } = {},
  ): { batches?: BatchMove[]; serials?: string[] } {
    const item = this.item(itemId);
    const w = this.get(itemId);
    let batches: BatchMove[] | undefined;
    if (item.trackExpiry) {
      const batch = opts.batch?.trim() ?? '';
      if (!batch && !opts.expiry) fail(`أدخل رقم الدفعة أو تاريخ الصلاحية لـ"${item.name}"`);
      const name = batch || opts.expiry!;
      batches = [{ batch: name, qty, ...(opts.expiry ? { expiry: opts.expiry } : {}) }];
      const key = batchKey(warehouseId, name);
      const cur = (w.batches[key] ??= { batch: name, warehouseId, qty: 0, ...(opts.expiry ? { expiry: opts.expiry } : {}) });
      cur.qty = roundQty(cur.qty + qty);
    }
    let serials: string[] | undefined;
    if (item.trackSerial) {
      serials = (opts.serials ?? []).map((s) => s.trim()).filter(Boolean);
      if (serials.length !== qty) fail(`أدخل ${qty} رقم تسلسلي لـ"${item.name}"`);
      if (new Set(serials).size !== serials.length) fail('يوجد رقم تسلسلي مكرر');
      for (const s of serials) {
        if (w.serials[s]) fail(`الرقم التسلسلي ${s} موجود مسبقاً في المخزون`);
        w.serials[s] = warehouseId;
      }
    }
    w.qty[warehouseId] = roundQty((w.qty[warehouseId] ?? 0) + qty);
    w.totalQty = roundQty(w.totalQty + qty);
    w.value += cost;
    if (qty > 0) w.lastCost = Math.round(cost / qty);
    return { ...(batches ? { batches } : {}), ...(serials ? { serials } : {}) };
  }

  /** نقل بين مستودعين (بدون تغيير القيمة). */
  move(itemId: string, from: string, to: string, qty: number, opts: { batch?: string; serials?: string[]; allowNegative?: boolean } = {}) {
    const out = this.out(itemId, from, qty, opts);
    const w = this.get(itemId);
    // إعادة القيمة والكمية الإجمالية لأن النقل لا يغيّرهما
    w.value += out.cost;
    w.totalQty = roundQty(w.totalQty + qty);
    w.qty[to] = roundQty((w.qty[to] ?? 0) + qty);
    for (const b of out.batches ?? []) {
      const key = batchKey(to, b.batch);
      const cur = (w.batches[key] ??= { batch: b.batch, warehouseId: to, qty: 0, ...(b.expiry ? { expiry: b.expiry } : {}) });
      cur.qty = roundQty(cur.qty + b.qty);
    }
    for (const s of out.serials ?? []) w.serials[s] = to;
    return { ...(out.batches ? { batches: out.batches } : {}), ...(out.serials ? { serials: out.serials } : {}) };
  }
}

/** الدفعات القريبة من انتهاء الصلاحية (أو المنتهية) خلال عدد أيام. */
export function expiringBatches(state: CompanyState, today: string, withinDays: number) {
  const limit = new Date(new Date(today).getTime() + withinDays * 86_400_000).toISOString().slice(0, 10);
  const rows: { item: Item; batch: string; expiry: string; qty: number; warehouseId: string; expired: boolean }[] = [];
  for (const [itemId, lvl] of Object.entries(state.stock)) {
    const item = state.items[itemId];
    if (!item) continue;
    for (const b of Object.values(lvl.batches ?? {})) {
      if (b.expiry && b.qty > 0 && b.expiry <= limit) {
        rows.push({ item, batch: b.batch, expiry: b.expiry, qty: b.qty, warehouseId: b.warehouseId, expired: b.expiry < today });
      }
    }
  }
  return rows.sort((a, b) => a.expiry.localeCompare(b.expiry));
}

/** البحث عن رقم تسلسلي: أين هو الآن، ومن اشتراه أو باعه (للكفالة). */
export function traceSerial(state: CompanyState, serial: string) {
  const s = serial.trim();
  const history = state.invoices
    .filter((inv) => inv.lines.some((l) => l.serials?.includes(s)))
    .map((inv) => ({ invoice: inv, line: inv.lines.find((l) => l.serials?.includes(s))! }));
  let inStock: { itemId: string; warehouseId: string } | null = null;
  for (const [itemId, lvl] of Object.entries(state.stock)) {
    const wh = lvl.serials?.[s];
    if (wh) inStock = { itemId, warehouseId: wh };
  }
  return { inStock, history };
}
