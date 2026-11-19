import { SYSTEM_ACCOUNTS } from './chart-templates';
import { roundPrice } from './money';
import { COUNTER_ACCOUNT } from './operations';
import type { CompanyState, Invoice, StockAdjustment } from './types';

/**
 * تصحيح التكاليف التلقائي: بيعيد حساب تكلفة كل مادة من أول حركة لآخر حركة (وسطي مرجّح)، وبيقارن مع المسجّل.
 * - البيع وقت الرصيد صفر أو بالسالب بياخد تكلفة أول بضاعة بتدخل بعده (مش صفر).
 * - أي فرق بسطر بيع أو تالف بيتصحّح بقيد بتاريخ المستند نفسه، فبيتصلّح ربح الفاتورة والربح اليومي وقيمة المخزون مع بعض.
 * بيشتغل كل ما تنفتح الشركة (CompanyStore)، وإذا كل شي مزبوط ما بيعمل شي. المستندات بفترة مقفلة ما بتتغيّر.
 */

export interface CostLineFix {
  doc: 'invoice' | 'adjustment';
  id: string;
  line: number;
  component?: number; // مكوّن صنف مركّب
  cost: number; // التكلفة الصحيحة (موجبة، بالعملة الأساسية)
  clearShortfall?: boolean;
}

export interface CostDocFix {
  doc: 'invoice' | 'adjustment';
  id: string;
  date: string;
  /** موجب = تكلفة زيادة (مدين المصروف، دائن المخزون)، سالب = العكس */
  diff: number;
  account: string;
  memo: string;
}

export interface CostPlan {
  lines: CostLineFix[];
  docs: CostDocFix[];
  /** فرق قيمة المخزون لكل مادة (بنفس إشارة القيمة) */
  stock: { itemId: string; warehouseId: string; value: number }[];
}

interface Move {
  date: string;
  seq: number;
  itemId: string;
  qty: number; // موجب = دخول
  /** للدخول: القيمة اللي بتدخل (التكلفة الكاملة)؛ للخروج الثابت: التكلفة المسجّلة */
  value: number;
  /** خروج بيتصحّح (بيع، تالف...) */
  fix?: { doc: 'invoice' | 'adjustment'; id: string; line: number; component?: number; recorded: number; warehouseId: string };
  /** بيحدّث «آخر تكلفة» (شراء، رصيد افتتاحي، إنتاج) متل البيع العادي */
  last?: boolean;
  /** «تعديل سعر الشراء»: آخر تكلفة صارت هالسعر (والقيمة بتتغيّر بـ value بدون كمية) */
  setLast?: number;
  /** دخول سجّل «تغطية رصيد سالب» قديماً (shortfall) */
  shortfall?: { doc: 'invoice' | 'adjustment'; id: string; line: number; recorded: number; warehouseId: string };
}

const OUT_ADJ = new Set(['damage', 'consumption', 'count']);

export function costPlan(state: CompanyState, only?: Set<string>): CostPlan {
  const locked = state.info?.lockedUntil ?? '';
  const entryNo = new Map(state.entries.map((e) => [e.id, e.number]));
  const voidedAdj = new Set(state.adjustments.filter((a) => a.voidOf).map((a) => a.voidOf!));
  const moves: Move[] = [];
  // only: مواد معيّنة بس (بعد عملية عليها) — أسرع بكتير من كل المحل
  const stockItem = (id: string | undefined) => !!id && state.items[id]?.kind === 'stock' && (!only || only.has(id));

  const invSeq = (inv: Invoice) => entryNo.get(inv.entryId) ?? 0;
  for (const inv of state.invoices) {
    if (inv.voidEntryId) continue;
    const seq = invSeq(inv);
    const open = inv.date > locked;
    inv.lines.forEach((l, i) => {
      const qty = Math.round(l.qty * (l.factor ?? 1) * 1000) / 1000;
      if (stockItem(l.itemId ?? undefined)) {
        const base = { date: inv.date, seq, itemId: l.itemId! };
        if (inv.kind === 'sale') moves.push({ ...base, qty: -qty, value: l.cost ?? 0, ...(open ? { fix: { doc: 'invoice', id: inv.id, line: i, recorded: l.cost ?? 0, warehouseId: inv.warehouseId } } : {}) });
        else if (inv.kind === 'purchase')
          moves.push({ ...base, qty, value: l.cost ?? 0, last: true, ...(open && l.shortfall ? { shortfall: { doc: 'invoice', id: inv.id, line: i, recorded: l.shortfall, warehouseId: inv.warehouseId } } : {}), ...(!open && l.shortfall ? { value: (l.cost ?? 0) - l.shortfall } : {}) });
        else if (inv.kind === 'sale_return') moves.push({ ...base, qty, value: l.cost ?? 0 });
        else moves.push({ ...base, qty: -qty, value: l.cost ?? 0 }); // مرتجع شراء: بتكلفته المسجّلة
      }
      (l.components ?? []).forEach((c, k) => {
        if (!stockItem(c.itemId)) return;
        const base = { date: inv.date, seq, itemId: c.itemId };
        if (inv.kind === 'sale') moves.push({ ...base, qty: -c.qty, value: c.cost, ...(open ? { fix: { doc: 'invoice', id: inv.id, line: i, component: k, recorded: c.cost, warehouseId: inv.warehouseId } } : {}) });
        else if (inv.kind === 'sale_return') moves.push({ ...base, qty: c.qty, value: c.cost });
      });
    });
  }
  const adjSeq = (a: StockAdjustment) => (a.entryId ? (entryNo.get(a.entryId) ?? 0) : (a.seq ?? 0));
  for (const a of state.adjustments) {
    if (a.voidOf || voidedAdj.has(a.id)) continue;
    const open = a.date > locked;
    a.lines.forEach((l, i) => {
      if (!stockItem(l.itemId)) return;
      const base = { date: a.date, seq: adjSeq(a), itemId: l.itemId };
      if (a.kind === 'revalue') {
        moves.push({ ...base, qty: 0, value: l.cost, ...(l.unitCost !== undefined ? { setLast: l.unitCost } : {}) });
        return;
      }
      if (l.qty < 0 && OUT_ADJ.has(a.kind)) moves.push({ ...base, qty: l.qty, value: -l.cost, ...(open ? { fix: { doc: 'adjustment', id: a.id, line: i, recorded: -l.cost, warehouseId: a.warehouseId } } : {}) });
      else if (l.qty > 0)
        moves.push({ ...base, qty: l.qty, value: l.cost, ...(a.kind === 'opening' ? { last: true } : {}), ...(open && l.shortfall ? { shortfall: { doc: 'adjustment', id: a.id, line: i, recorded: l.shortfall, warehouseId: a.warehouseId } } : {}), ...(!open && l.shortfall ? { value: l.cost - l.shortfall } : {}) });
      else moves.push({ ...base, qty: l.qty, value: -l.cost });
    });
  }
  // الإنتاج ما إلو قيد: ترتيبه محفوظ وقت ما انعمل (والقديم: حسب وقت إنشائه بين القيود)
  const entryTimes = state.entries.map((e) => (e as { createdAt?: string }).createdAt ?? '');
  for (const p of state.productions) {
    const seq = p.seq ?? (p.createdAt ? entryTimes.filter((t) => t && t <= p.createdAt!).length + 0.5 : 0);
    for (const i of p.inputs) if (stockItem(i.itemId)) moves.push({ date: p.date, seq, itemId: i.itemId, qty: -i.qty, value: i.cost });
    for (const o of p.outputs) if (stockItem(o.itemId)) moves.push({ date: p.date, seq, itemId: o.itemId, qty: o.qty, value: o.cost, last: true });
  }
  moves.sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);

  // إعادة الحساب مادة مادة
  const correct = new Map<Move, number>();
  const kept = new Set<Move>();
  const byItem = new Map<string, Move[]>();
  for (const m of moves) {
    const list = byItem.get(m.itemId) ?? [];
    list.push(m);
    byItem.set(m.itemId, list);
  }
  for (const list of byItem.values()) {
    let qty = 0;
    let value = 0;
    let lastCost = 0;
    const pending: { m: Move; qty: number; unit: number; whole: number; q: number }[] = []; // قطع انباعت قبل ما تدخل بضاعتها
    for (const m of list) {
      if (m.qty < 0) {
        const q = -m.qty;
        if (!m.fix) {
          // خروج بتكلفته المسجّلة (مرتجع شراء، إنتاج)
          qty -= q;
          value -= m.value;
          continue;
        }
        const have = Math.max(qty, 0);
        const take = Math.min(have, q);
        // قيمة سالبة مع كمية موجبة (مرتجع شراء بتكلفة أعلى من الوسطي مثلاً): منرجع لآخر تكلفة، ما في تكلفة سالبة
        const avg = qty > 0 && value >= 0 ? value / qty : lastCost;
        const cost = take > 0 ? Math.max(0, Math.round(avg * take)) : 0;
        qty -= q;
        value -= cost;
        correct.set(m, cost);
        if (q > take) pending.push({ m, qty: q - take, unit: Math.max(0, avg), whole: q - take, q });
      } else if (m.qty === 0) {
        // تعديل سعر الشراء: القيمة بتتغيّر والكمية لأ
        value += m.value;
        if (m.setLast !== undefined) lastCost = m.setLast;
        continue;
      } else if (m.qty > 0) {
        // شراء قديم سجّل «تغطية رصيد سالب» وما في بيع مفتوح ينتظر: منخلّيه متل ما هو
        if (m.shortfall && !pending.length) {
          kept.add(m);
          qty += m.qty;
          value += m.value - m.shortfall.recorded;
          if (m.last) lastCost = roundPrice(m.value / m.qty);
          continue;
        }
        let v = m.value;
        const unit = Math.max(0, v / m.qty);
        let room = m.qty;
        // البضاعة الجديدة بتغطي القطع اللي انباعت قبلها، بسعرها
        while (room > 0 && pending.length) {
          const p = pending[0]!;
          const t = Math.min(room, p.qty);
          const c = Math.round(unit * t);
          correct.set(p.m, (correct.get(p.m) ?? 0) + c);
          v -= c;
          room -= t;
          p.qty -= t;
          if (p.qty <= 1e-9) pending.shift();
        }
        qty += m.qty;
        value += v;
        if (m.last) lastCost = roundPrice(m.value / m.qty);
        // رصيد سالب ما في قطع منتظرة بتغطيه (خروج بتكلفة مسجّلة): القيمة بتصير الكمية × السعر
        if (qty <= 0) value = Math.round(qty * unit);
      }
    }
    // ما إجت بضاعة تغطي اللي انباع بالسالب: بيضل بالتكلفة المعروفة وقتها (الوسطي أو آخر تكلفة)، متل البيع العادي
    // (ما انغطّى منه شي: نفس تقريب البيع العادي = الوسطي × كل الكمية)
    // وما في أي تكلفة معروفة للمادة (ولا شراء ولا رصيد): منترك التكلفة المسجّلة متل ما هي
    for (const p of pending) {
      if (p.qty === p.whole && p.unit === 0 && p.q === p.whole) correct.set(p.m, p.m.fix?.recorded ?? 0);
      else correct.set(p.m, p.qty === p.whole ? Math.round(p.unit * p.q) : (correct.get(p.m) ?? 0) + Math.round(p.unit * p.qty));
    }
  }

  const lines: CostLineFix[] = [];
  const docDiff = new Map<string, CostDocFix>();
  const stock = new Map<string, number>();
  const addDoc = (doc: 'invoice' | 'adjustment', id: string, diff: number, wh: string, itemId: string, account: string, date: string, memo: string) => {
    if (!diff) return;
    const k = `${doc}|${id}|${account}`;
    const d = docDiff.get(k) ?? { doc, id, date, diff: 0, account, memo };
    d.diff += diff;
    docDiff.set(k, d);
    stock.set(`${itemId}|${wh}`, (stock.get(`${itemId}|${wh}`) ?? 0) - diff);
  };
  const invById = new Map(state.invoices.map((i) => [i.id, i]));
  const adjById = new Map(state.adjustments.map((a) => [a.id, a]));
  const memoOf = (doc: 'invoice' | 'adjustment', id: string) => {
    if (doc === 'invoice') {
      const inv = invById.get(id)!;
      return `تصحيح تكلفة — فاتورة رقم ${inv.number}`;
    }
    return `تصحيح تكلفة — عملية مخزون رقم ${adjById.get(id)!.number}`;
  };
  for (const m of moves) {
    if (m.fix) {
      const c = correct.get(m) ?? 0;
      if (c === m.fix.recorded) continue;
      lines.push({ doc: m.fix.doc, id: m.fix.id, line: m.fix.line, ...(m.fix.component !== undefined ? { component: m.fix.component } : {}), cost: c });
      const account = m.fix.doc === 'invoice' ? SYSTEM_ACCOUNTS.cogs : COUNTER_ACCOUNT[adjById.get(m.fix.id)!.kind];
      addDoc(m.fix.doc, m.fix.id, c - m.fix.recorded, m.fix.warehouseId, m.itemId, account, m.date, memoOf(m.fix.doc, m.fix.id));
    }
    if (m.shortfall && !kept.has(m)) {
      // التغطية صارت على سطور البيع نفسها، فمنرجّع اللي انسجّل على الشراء
      lines.push({ doc: m.shortfall.doc, id: m.shortfall.id, line: m.shortfall.line, cost: m.value, clearShortfall: true });
      addDoc(m.shortfall.doc, m.shortfall.id, -m.shortfall.recorded, m.shortfall.warehouseId, m.itemId, SYSTEM_ACCOUNTS.cogs, m.date, memoOf(m.shortfall.doc, m.shortfall.id));
    }
  }
  return {
    lines,
    docs: [...docDiff.values()].filter((d) => d.diff !== 0),
    stock: [...stock].filter(([, v]) => v !== 0).map(([k, value]) => {
      const [itemId, warehouseId] = k.split('|');
      return { itemId: itemId!, warehouseId: warehouseId!, value };
    }),
  };
}
