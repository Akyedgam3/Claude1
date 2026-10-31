import { allocate } from './commerce';
import { SYSTEM_ACCOUNTS } from './chart-templates';
import type { EntryDraft, LineDraft } from './ledger';
import { roundQty, StockPlanner } from './stock';
import type { AdjustmentKind, AdjustmentLine, BatchMove, CompanyState, JournalEntry, Production, StockAdjustment, StockTransfer } from './types';

function fail(message: string): never {
  throw new Error(message);
}

export interface OpsContext {
  state: CompanyState;
  baseCode: string;
  actor: string;
  buildEntry(draft: EntryDraft): JournalEntry;
}

export const ADJUSTMENT_NAMES: Record<AdjustmentKind, string> = {
  opening: 'رصيد افتتاحي',
  count: 'جرد',
  damage: 'تالف / منتهي الصلاحية',
  consumption: 'استهلاك داخلي',
};

const COUNTER_ACCOUNT: Record<AdjustmentKind, string> = {
  opening: SYSTEM_ACCOUNTS.openingBalances,
  count: SYSTEM_ACCOUNTS.countDifferences,
  damage: SYSTEM_ACCOUNTS.damaged,
  consumption: SYSTEM_ACCOUNTS.consumption,
};

function nextNumber(state: CompanyState, key: string): number {
  return (state.counters[key] ?? 0) + 1;
}

/** قيد يثبت فرق قيمة المخزون مقابل الحساب المناسب. */
function stockEntry(ctx: OpsContext, kind: AdjustmentKind, date: string, value: number, memo: string, id: string): JournalEntry | undefined {
  if (value === 0) return undefined;
  const base = { currency: ctx.baseCode, rate: 1 };
  const inv: LineDraft = { accountId: SYSTEM_ACCOUNTS.inventory, ...(value > 0 ? { debit: value } : { credit: -value }), ...base };
  const counter: LineDraft = { accountId: COUNTER_ACCOUNT[kind], ...(value > 0 ? { credit: value } : { debit: -value }), ...base };
  return ctx.buildEntry({ date, memo, lines: [inv, counter], source: { type: 'adjustment', id }, createdBy: ctx.actor });
}

export interface AdjustDraft {
  kind: Exclude<AdjustmentKind, 'count'>;
  date: string;
  warehouseId?: string;
  lines: { itemId: string; qty: number; unitCost?: number; batch?: string; expiry?: string; serials?: string[] }[];
  memo?: string;
}

/** رصيد افتتاحي (إدخال بكلفة معروفة) أو تالف/استهلاك (إخراج بالتكلفة الوسطية). */
export function buildAdjustment(ctx: OpsContext, d: AdjustDraft): { adjustment: StockAdjustment; entry?: JournalEntry } {
  const { state } = ctx;
  const warehouseId = d.warehouseId ?? Object.keys(state.warehouses)[0] ?? fail('لا يوجد مستودع');
  if (d.lines.length === 0) fail('أضف مادة واحدة على الأقل');
  const planner = new StockPlanner(state);
  const allowNegative = !!state.info?.allowNegativeStock;
  const lines: RawLine[] = d.lines.map((l, i) => {
    const item = state.items[l.itemId] ?? fail(`السطر ${i + 1}: مادة غير موجودة`);
    if (item.kind !== 'stock') fail(`"${item.name}" ليست مادة مخزنية`);
    if (!(l.qty > 0)) fail(`السطر ${i + 1}: الكمية يجب أن تكون أكبر من صفر`);
    const qty = roundQty(l.qty);
    if (d.kind === 'opening') {
      const unitCost = l.unitCost ?? fail(`السطر ${i + 1}: أدخل تكلفة الوحدة`);
      if (!(unitCost >= 0)) fail(`السطر ${i + 1}: تكلفة غير صالحة`);
      const cost = Math.round(unitCost * qty);
      const res = planner.in(item.id, warehouseId, qty, cost, {
        ...(l.batch ? { batch: l.batch } : {}),
        ...(l.expiry ? { expiry: l.expiry } : {}),
        ...(l.serials ? { serials: l.serials } : {}),
      });
      return { itemId: item.id, qty, cost, ...res };
    }
    const res = planner.out(item.id, warehouseId, qty, { ...(l.batch ? { batch: l.batch } : {}), ...(l.serials ? { serials: l.serials } : {}), allowNegative });
    return { itemId: item.id, qty: -qty, cost: -res.cost, ...(res.batches ? { batches: res.batches } : {}), ...(res.serials ? { serials: res.serials } : {}) };
  });
  return finishAdjustment(ctx, d.kind, d.date, warehouseId, expand(lines), d.memo);
}

/** سطر تسوية قبل تقسيمه حسب الدفعات. */
interface RawLine {
  itemId: string;
  qty: number;
  cost: number;
  batches?: BatchMove[];
  serials?: string[];
}

/** السطر المسحوب من أكثر من دفعة يصبح سطراً لكل دفعة، مع توزيع التكلفة عليها. */
function expand(lines: RawLine[]): AdjustmentLine[] {
  return lines.flatMap((l) => {
    const base = { itemId: l.itemId, ...(l.serials ? { serials: l.serials } : {}) };
    if (!l.batches?.length) return [{ ...base, qty: l.qty, cost: l.cost }];
    const sign = l.qty < 0 ? -1 : 1;
    const costs = allocate(Math.abs(l.cost), l.batches.map((b) => b.qty));
    return l.batches.map((b, i) => ({
      ...base,
      qty: sign * b.qty,
      cost: sign * costs[i]!,
      batch: b.batch,
      ...(b.expiry ? { expiry: b.expiry } : {}),
    }));
  });
}

function finishAdjustment(
  ctx: OpsContext,
  kind: AdjustmentKind,
  date: string,
  warehouseId: string,
  lines: AdjustmentLine[],
  memo?: string,
): { adjustment: StockAdjustment; entry?: JournalEntry } {
  const id = crypto.randomUUID();
  const number = nextNumber(ctx.state, 'adjustment');
  const text = memo?.trim() || `${ADJUSTMENT_NAMES[kind]} رقم ${number}`;
  const value = lines.reduce((s, l) => s + l.cost, 0);
  const entry = stockEntry(ctx, kind, date, value, text, id);
  const adjustment: StockAdjustment = {
    id,
    number,
    kind,
    date,
    warehouseId,
    lines,
    memo: text,
    ...(entry ? { entryId: entry.id } : {}),
    createdBy: ctx.actor,
  };
  return { adjustment, ...(entry ? { entry } : {}) };
}

export interface CountDraft {
  date: string;
  warehouseId?: string;
  /** للمواد بالأرقام التسلسلية: serials = الأرقام اللي انلقت فعلاً عالرف (counted = عددها). */
  lines: { itemId: string; counted: number; batch?: string; expiry?: string; serials?: string[] }[];
  memo?: string;
}

/** الجرد: يقارن الكمية الفعلية بالدفترية ويسجّل الفرق بالتكلفة الوسطية. */
export function buildCount(ctx: OpsContext, d: CountDraft): { adjustment: StockAdjustment; entry?: JournalEntry } {
  const { state } = ctx;
  const warehouseId = d.warehouseId ?? Object.keys(state.warehouses)[0] ?? fail('لا يوجد مستودع');
  const planner = new StockPlanner(state);
  const lines: RawLine[] = [];
  for (const l of d.lines) {
    const item = state.items[l.itemId] ?? fail('مادة غير موجودة');
    if (item.kind !== 'stock') continue;
    if (!(l.counted >= 0)) fail(`كمية غير صالحة لـ"${item.name}"`);
    if (item.trackSerial) {
      // جرد بالأرقام: الناقص بيطلع بأرقامه، والزايد (رقم مش بالمخزون) بيدخل بأرقامه
      const found = [...new Set((l.serials ?? []).map((x) => x.trim()).filter(Boolean))];
      const where = state.stock[item.id]?.serials ?? {};
      const book = Object.keys(where).filter((x) => where[x] === warehouseId);
      const missing = book.filter((x) => !found.includes(x));
      const extra = found.filter((x) => !where[x]);
      const elsewhere = found.find((x) => where[x] && where[x] !== warehouseId);
      if (elsewhere) fail(`الرقم ${elsewhere} مسجّل بمستودع «${state.warehouses[where[elsewhere]!]?.name ?? ''}». انقله بتحويل بين المستودعات`);
      if (missing.length) {
        const res = planner.out(item.id, warehouseId, missing.length, { serials: missing, allowNegative: true });
        lines.push({ itemId: item.id, qty: -missing.length, cost: -res.cost, ...(res.serials ? { serials: res.serials } : {}) });
      }
      if (extra.length) {
        const cost = Math.round(planner.unitCost(item.id) * extra.length);
        const res = planner.in(item.id, warehouseId, extra.length, cost, { serials: extra });
        lines.push({ itemId: item.id, qty: extra.length, cost, ...res });
      }
      continue;
    }
    let have: number;
    if (item.trackExpiry && l.batch) {
      have = Object.values(state.stock[item.id]?.batches ?? {}).find((b) => b.warehouseId === warehouseId && b.batch === l.batch)?.qty ?? 0;
    } else have = planner.available(item.id, warehouseId);
    const delta = roundQty(l.counted - have);
    if (delta === 0) continue;
    if (item.trackSerial) fail(`"${item.name}" لها أرقام تسلسلية؛ استخدم التالف أو الرصيد الافتتاحي بالأرقام`);
    if (delta > 0) {
      const cost = Math.round(planner.unitCost(item.id) * delta);
      const res = planner.in(item.id, warehouseId, delta, cost, {
        ...(item.trackExpiry ? { batch: l.batch || `جرد ${d.date}` } : {}),
        ...(l.expiry ? { expiry: l.expiry } : {}),
      });
      lines.push({ itemId: item.id, qty: delta, cost, ...res });
    } else {
      const res = planner.out(item.id, warehouseId, -delta, { ...(l.batch ? { batch: l.batch } : {}), allowNegative: true });
      lines.push({ itemId: item.id, qty: delta, cost: -res.cost, ...(res.batches ? { batches: res.batches } : {}) });
    }
  }
  if (lines.length === 0) fail('لا توجد فروقات في الجرد');
  return finishAdjustment(ctx, 'count', d.date, warehouseId, expand(lines), d.memo);
}

export interface TransferDraft {
  date: string;
  from: string;
  to: string;
  lines: { itemId: string; qty: number; batch?: string; serials?: string[] }[];
  memo?: string;
}

export function buildTransfer(ctx: OpsContext, d: TransferDraft): StockTransfer {
  const { state } = ctx;
  if (d.from === d.to) fail('اختر مستودعين مختلفين');
  if (d.lines.length === 0) fail('أضف مادة واحدة على الأقل');
  const planner = new StockPlanner(state);
  const lines = d.lines.map((l) => {
    const item = state.items[l.itemId] ?? fail('مادة غير موجودة');
    if (item.kind !== 'stock') fail(`"${item.name}" ليست مادة مخزنية`);
    if (!(l.qty > 0)) fail('الكمية يجب أن تكون أكبر من صفر');
    const qty = roundQty(l.qty);
    const res = planner.move(item.id, d.from, d.to, qty, { ...(l.batch ? { batch: l.batch } : {}), ...(l.serials ? { serials: l.serials } : {}) });
    return { itemId: item.id, qty, ...res };
  });
  const number = nextNumber(state, 'transfer');
  return {
    id: crypto.randomUUID(),
    number,
    date: d.date,
    from: d.from,
    to: d.to,
    lines,
    memo: d.memo?.trim() || `تحويل رقم ${number}`,
    createdBy: ctx.actor,
  };
}

export interface ProductionDraft {
  date: string;
  warehouseId?: string;
  /** weight: حصة المنتج من التكلفة (مثلاً حجمه بالمتر المكعب بالمنشرة)؛ إذا ما انحطّت بتتوزع حسب الكمية. */
  outputs: { itemId: string; qty: number; batch?: string; expiry?: string; weight?: number }[];
  /** مواد أولية محددة يدوياً؛ إن لم تُحدد تُحسب من وصفة كل منتج. */
  inputs?: { itemId: string; qty: number }[];
  memo?: string;
}

/** الإنتاج: يُخرج المواد الأولية بتكلفتها ويُدخل المنتجات بنفس القيمة (موزعة حسب الكمية). */
export function buildProduction(ctx: OpsContext, d: ProductionDraft): Production {
  const { state } = ctx;
  const warehouseId = d.warehouseId ?? Object.keys(state.warehouses)[0] ?? fail('لا يوجد مستودع');
  if (d.outputs.length === 0) fail('حدد المنتجات');
  const needs = new Map<string, number>();
  if (d.inputs?.length) {
    for (const i of d.inputs) {
      const item = state.items[i.itemId] ?? fail('مادة أولية غير موجودة');
      if (item.kind !== 'stock') fail(`"${item.name}" يجب أن تكون مادة مخزنية`);
      if (!(i.qty > 0)) fail('كمية المادة الأولية يجب أن تكون أكبر من صفر');
      needs.set(i.itemId, roundQty((needs.get(i.itemId) ?? 0) + i.qty));
    }
  } else {
    for (const o of d.outputs) {
      const item = state.items[o.itemId] ?? fail('منتج غير موجود');
      if (!item.recipe?.length) fail(`"${item.name}" ليس له وصفة؛ حدد المواد الأولية يدوياً`);
      for (const r of item.recipe) needs.set(r.itemId, roundQty((needs.get(r.itemId) ?? 0) + r.qty * o.qty));
    }
  }
  const planner = new StockPlanner(state);
  const allowNegative = !!state.info?.allowNegativeStock;
  const inputs = [...needs].map(([itemId, qty]) => {
    const res = planner.out(itemId, warehouseId, qty, { allowNegative });
    return { itemId, qty, cost: res.cost, ...(res.batches ? { batches: res.batches } : {}) };
  });
  const totalCost = inputs.reduce((s, i) => s + i.cost, 0);
  const weighted = d.outputs.every((o) => (o.weight ?? 0) > 0);
  const costs = allocate(totalCost, d.outputs.map((o) => (weighted ? o.weight! : o.qty)));
  const outputs = d.outputs.map((o, i) => {
    const item = state.items[o.itemId] ?? fail('منتج غير موجود');
    if (item.kind !== 'stock') fail(`"${item.name}" يجب أن يكون مادة مخزنية`);
    if (!(o.qty > 0)) fail('كمية المنتج يجب أن تكون أكبر من صفر');
    const batch = item.trackExpiry ? o.batch || `إنتاج ${d.date}` : undefined;
    planner.in(item.id, warehouseId, o.qty, costs[i]!, { ...(batch ? { batch } : {}), ...(o.expiry ? { expiry: o.expiry } : {}) });
    return { itemId: item.id, qty: roundQty(o.qty), cost: costs[i]!, ...(batch ? { batch } : {}), ...(o.expiry ? { expiry: o.expiry } : {}) };
  });
  const number = nextNumber(state, 'production');
  return {
    id: crypto.randomUUID(),
    number,
    date: d.date,
    warehouseId,
    outputs,
    inputs,
    memo: d.memo?.trim() || `إنتاج رقم ${number}`,
    createdBy: ctx.actor,
  };
}
