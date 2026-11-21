import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCIES,
  Ledger,
  accountBalance,
  applyEvent,
  chartFor,
  dailyProfit,
  defaultTaxes,
  emptyState,
  incomeStatement,
  invoicePartyBalance,
  invoiceProfit,
  partyBalance,
  trialBalance,
  type CompanyEvent,
  type Invoice,
} from '../src/core';
import { isCashBox, partyDebts } from '../src/core/reports';
import { costPlan } from '../src/core/recost';
import { healthCheck } from '../src/core/health';

// اختبار ضغط: آلاف العمليات العشوائية (شراء، بيع نقدي وآجل، مرتجعات، سندات، ديون، تعديل وإلغاء فواتير،
// جرد وتالف، دولار وليرة، بيع بالسالب) وبعد كل خطوة منتأكد إنو كل الأرقام بتطابق بعضها.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];

function run(seed: number, steps: number) {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const events: CompanyEvent[] = [];
  const l = new Ledger((e) => void events.push(structuredClone(e)));
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  if (r() < 0.6) l.updateCompany({ ...l.state.info!, allowNegativeStock: true });
  l.setRate({ date: '2026-09-30', currency: 'USD', rate: 110, kind: 'market' });
  l.setRate({ date: '2026-10-04', currency: 'USD', rate: 120, kind: 'market' });
  const parties = ['c1', 'c2', 'c3', 's1', 's2'];
  for (const p of parties) l.saveParty({ id: p, kind: p.startsWith('c') ? 'customer' : 'supplier', name: p });
  const items = ['a', 'b', 'c', 'svc'];
  for (const i of items) l.saveItem({ id: i, code: i, name: i, kind: i === 'svc' ? 'service' : 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'USD', ...(i === 'a' ? { units: [{ name: 'كرتونة', factor: 12 }] } : {}) });
  l.saveItem({ id: 'mix', code: 'mix', name: 'منتج', kind: 'stock', unit: 'قطعة', price: 3000, priceCurrency: 'USD' });
  const mainWh = Object.keys(l.state.warehouses)[0]!;
  l.saveWarehouse({ id: 'w2', name: 'المستودع 2' });
  const SYP_DEC = 10 ** DEFAULT_CURRENCIES.find((c) => c.code === 'SYP')!.decimals;
  const ops: string[] = [];
  let lastGap = 0;

  const lines = (sale: boolean) =>
    Array.from({ length: int(1, 3) }, () => {
      const itemId = pick(items);
      const carton = itemId === 'a' && r() < 0.25;
      return { itemId, qty: int(1, 6), price: sale ? int(500, 2000) * (carton ? 12 : 1) : int(200, 900) * (carton ? 12 : 1), ...(carton ? { unit: 'كرتونة' } : {}) };
    });

  for (let k = 0; k < steps; k++) {
    const date = pick(DAYS);
    const cur = r() < 0.6 ? 'USD' : 'SYP';
    const conv = (n: number) => (cur === 'SYP' ? n * 110 * (SYP_DEC / 100) : n);
    const op = int(0, 24);
    const before = process.env.FUZZ_DEBUG ? structuredClone({ stock: l.state.stock, n: l.state.entries.length }) : null;
    try {
      switch (op) {
        case 0:
        case 1: {
          const partyId = r() < 0.8 ? pick(['c1', 'c2', 'c3']) : undefined;
          const ls = lines(true).map((x) => ({ ...x, price: conv(x.price) }));
          const total = ls.reduce((s, x) => s + x.qty * x.price, 0);
          const paid = partyId ? pick([0, total, Math.floor(total / 2), total + conv(300)]) : total;
          l.postInvoice({ kind: 'sale', date, currency: cur, ...(partyId ? { partyId } : {}), paid: partyId && paid > total ? total : paid, lines: ls });
          ops.push(`sale ${date} ${cur} ${partyId ?? 'cash'}`);
          break;
        }
        case 2:
        case 3: {
          const partyId = pick(['s1', 's2']);
          // تكاليف إضافية (نقل، شحن، جمركة) على بعض فواتير الشراء
          const pay = pick(['cash', 'supplier', 'party'] as const);
          const box = Object.values(l.state.accounts).find((a) => isCashBox(a) && (!a.currency || a.currency === cur));
          const extras = op === 3 && (pay !== 'cash' || box) ? [{ amount: conv(int(50, 400)), split: pick(['value', 'qty'] as const), pay, ...(pay === 'cash' ? { cashAccountId: box!.id } : {}), ...(pay === 'party' ? { partyId: partyId === 's1' ? 's2' : 's1' } : {}) }] : undefined;
          l.postInvoice({ kind: 'purchase', date, currency: cur, partyId, paid: r() < 0.5 ? 0 : undefined, lines: lines(false).map((x) => ({ ...x, price: conv(x.price) })), ...(extras ? { extras } : {}) });
          ops.push(`purchase ${date}${extras ? ' +extra ' + pay : ''}`);
          break;
        }
        case 4: {
          const sales = l.state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId);
          if (!sales.length) break;
          const inv = pick(sales);
          const ln = inv.lines.find((x) => x.itemId) ?? inv.lines[0]!;
          l.postInvoice({ kind: 'sale_return', date: inv.date > date ? inv.date : date, currency: inv.currency, ...(inv.partyId ? { partyId: inv.partyId } : {}), paid: inv.partyId ? 0 : undefined, lines: [{ itemId: ln.itemId!, qty: 1, price: ln.price }] });
          ops.push(`return ${inv.number}`);
          break;
        }
        case 5: {
          const partyId = pick(parties);
          l.postVoucher({ kind: partyId.startsWith('c') ? 'receipt' : 'payment', date, currency: cur, amount: conv(int(100, 3000)), partyId, memo: 'دفعة' });
          ops.push(`voucher ${partyId}`);
          break;
        }
        case 6: {
          const partyId = pick(parties);
          l.postDebt({ direction: partyId.startsWith('c') ? 'owed' : 'owe', partyId, date, currency: cur, amount: conv(int(100, 2000)), reason: pick(['old', 'cash', 'goods'] as const) });
          ops.push(`debt ${partyId}`);
          break;
        }
        case 7: {
          const live = l.state.invoices.filter((i) => !i.voidEntryId && (i.kind === 'sale' || i.kind === 'purchase') && !l.state.invoices.some((x) => x.replaces === i.id));
          if (!live.length) break;
          const inv = pick(live);
          l.replaceInvoice(inv.id, {
            kind: inv.kind,
            date: inv.date,
            currency: inv.currency,
            ...(inv.partyId ? { partyId: inv.partyId } : {}),
            paid: inv.partyId ? Math.min(inv.paid, 1) : undefined,
            lines: inv.lines.map((x) => ({ ...(x.itemId ? { itemId: x.itemId } : { description: x.description }), qty: x.qty + (r() < 0.5 ? 1 : 0), price: x.price })),
          } as never);
          ops.push(`edit ${inv.kind} ${inv.number}`);
          break;
        }
        case 8: {
          const live = l.state.invoices.filter((i) => !i.voidEntryId);
          if (!live.length) break;
          const inv = pick(live);
          l.voidInvoice(inv.id, inv.date > date ? inv.date : date);
          ops.push(`void ${inv.kind} ${inv.number}`);
          break;
        }
        case 9: {
          l.adjustStock({ kind: pick(['damage', 'opening'] as const), date, lines: [{ itemId: pick(['a', 'b', 'c']), qty: int(1, 4) * (r() < 0.5 ? -1 : 1), unitCost: int(200, 900) }] } as never);
          ops.push('adjust');
          break;
        }
        case 10: {
          // المصاري الزايدة مع الفاتورة بتنزل دفعة على الحساب
          const partyId = pick(['c1', 'c2', 'c3']);
          const ls = [{ itemId: 'svc', qty: 1, price: conv(1000) }];
          l.postInvoice({ kind: 'sale', date, currency: cur, partyId, paid: conv(1500), lines: ls });
          ops.push('sale overpay');
          break;
        }
        case 11: {
          l.recalculateCosts();
          ops.push('recost');
          break;
        }
        case 12: {
          l.transferStock({ date, from: r() < 0.7 ? mainWh : 'w2', to: r() < 0.7 ? 'w2' : mainWh, lines: [{ itemId: pick(['a', 'b', 'c']), qty: int(1, 3) }] });
          ops.push('transfer');
          break;
        }
        case 13: {
          const ts = l.state.transfers.filter((t) => !t.voided);
          if (!ts.length) break;
          const t = pick(ts);
          l.voidTransfer(t.id, t.date > date ? t.date : date);
          ops.push('void transfer');
          break;
        }
        case 14: {
          const ps = l.state.invoices.filter((i) => i.kind === 'purchase' && !i.voidEntryId);
          if (!ps.length) break;
          const inv = pick(ps);
          const ln = inv.lines.find((x) => x.itemId)!;
          l.postInvoice({ kind: 'purchase_return', date: inv.date > date ? inv.date : date, currency: inv.currency, partyId: inv.partyId!, paid: 0, lines: [{ itemId: ln.itemId!, qty: 1, price: Math.round(ln.price / (ln.factor ?? 1)) }] });
          ops.push('purchase return');
          break;
        }
        case 15: {
          if (r() < 0.5) l.postVoucher({ kind: 'payment', date, currency: cur, amount: conv(int(50, 500)), accountId: '5202', memo: 'مصروف' } as never);
          else {
            const partyId = pick(parties);
            l.settleDebt({ direction: partyId.startsWith('c') ? 'in' : 'out', partyId, date, currency: cur, amount: conv(int(50, 1500)) });
          }
          ops.push('expense/settle');
          break;
        }
        case 16: {
          l.countStock({ date, lines: [{ itemId: pick(['a', 'b', 'c']), counted: int(0, 10) }] });
          ops.push('count');
          break;
        }
        case 17: {
          const adj = l.state.adjustments.filter((a) => !a.voidOf && !l.state.adjustments.some((x) => x.voidOf === a.id));
          if (!adj.length) break;
          const a = pick(adj);
          l.voidAdjustment(a.id, a.date > date ? a.date : date);
          ops.push('void adjustment');
          break;
        }
        case 18: {
          l.postProduction({ date, inputs: [{ itemId: 'b', qty: int(1, 2) }, { itemId: 'c', qty: 1 }], outputs: [{ itemId: 'mix', qty: int(1, 3) }] });
          if (r() < 0.6) l.postInvoice({ kind: 'sale', date, currency: 'USD', paid: undefined, lines: [{ itemId: 'mix', qty: 1, price: 3000 }] });
          ops.push('production');
          break;
        }
        case 20: {
          l.revalueItem({ date, itemId: pick(['a', 'b', 'c']), unitCost: int(100, 1200), applyToStock: r() < 0.7 });
          ops.push('revalue');
          break;
        }
        case 21: {
          const id = pick(['a', 'b', 'c']);
          if (l.state.items[id]!.archived) l.restoreItem(id);
          else if (r() < 0.3) l.deleteItem(id);
          ops.push('delete/restore item');
          break;
        }
        case 22: {
          const vs = l.state.entries.filter((e) => (e.source?.type === 'receipt' || e.source?.type === 'payment') && !e.voidOf && !l.state.voided[e.id]);
          if (!vs.length) break;
          const e = pick(vs);
          const partyId = pick(parties);
          l.editVoucher(e.id, { kind: partyId.startsWith('c') ? 'receipt' : 'payment', date: e.date, currency: cur, amount: conv(int(100, 3000)), partyId, memo: 'تعديل' });
          ops.push('edit voucher');
          break;
        }
        case 23: {
          const ds = l.state.entries.filter((e) => e.source?.type === 'debt' && !e.voidOf && !l.state.voided[e.id]);
          if (!ds.length) break;
          const e = pick(ds);
          const partyId = pick(parties);
          l.editDebt(e.id, { direction: partyId.startsWith('c') ? 'owed' : 'owe', partyId, date: e.date, currency: cur, amount: conv(int(100, 2000)), reason: 'old' });
          ops.push('edit debt');
          break;
        }
        case 24: {
          const as = l.state.adjustments.filter((a) => (a.kind === 'opening' || a.kind === 'damage') && !a.voidOf && !l.state.adjustments.some((x) => x.voidOf === a.id));
          if (!as.length) break;
          const a = pick(as);
          l.editAdjustment(a.id, { kind: a.kind as 'opening' | 'damage', date: a.date, lines: [{ itemId: pick(['a', 'b', 'c']), qty: int(1, 5), unitCost: int(200, 900) }] });
          ops.push('edit adjustment');
          break;
        }
        case 19: {
          const live = l.state.invoices.filter((i) => !i.voidEntryId);
          if (!live.length) break;
          const inv = pick(live);
          l.deleteInvoice(inv.id, DAYS[DAYS.length - 1]!);
          ops.push(`delete ${inv.kind} ${inv.number}`);
          break;
        }
      }
    } catch (e) {
      // عملية مرفوضة (رصيد ناقص، تاريخ...) طبيعي: المهم ما يخرب شي. بس تصحيح التكاليف ما لازم يفشل أبداً
      if (op === 11) throw e;
    }
    if (process.env.FUZZ_TRACE) {
      const [it, upto] = process.env.FUZZ_TRACE.split(':');
      const a = before!.stock[it!];
      const b = l.state.stock[it!];
      if (k <= Number(upto) && b && (!a || a.totalQty !== b.totalQty || a.value !== b.value)) {
        const inv = l.state.invoices.at(-1);
        console.log('TR', k, ops.at(-1), JSON.stringify(a && [a.totalQty, a.value]), '->', JSON.stringify([b.totalQty, b.value]), inv ? JSON.stringify(inv.lines.filter((x) => x.itemId === it).map((x) => ({ q: x.qty, c: x.cost, sf: x.shortfall, p: x.price }))) : '');
      }
    }
    if (process.env.FUZZ_DEBUG) {
      const gap = accountBalance(l.state, '1104').balance - Object.values(l.state.stock).reduce((x, y) => x + y.value, 0);
      if (gap !== lastGap) {
        console.log('GAP', seed, k, ops.at(-1), gap - lastGap);
        if (process.env.FUZZ_DEBUG === String(seed) + ':' + k) {
          const newEntries = l.state.entries.slice(before!.n);
          for (const e of newEntries) console.log('ENTRY', e.memo, e.source?.type, JSON.stringify(e.lines.filter((x) => x.accountId === '1104' || x.accountId === '5101').map((x) => [x.accountId, x.baseDebit, x.baseCredit])));
          for (const id of Object.keys(l.state.stock)) console.log('STOCK', id, JSON.stringify(before!.stock[id] && { q: before!.stock[id]!.totalQty, v: before!.stock[id]!.value }), '->', JSON.stringify({ q: l.state.stock[id]!.totalQty, v: l.state.stock[id]!.value }));
          const inv = l.state.invoices.at(-1)!;
          console.log('INV', inv.kind, inv.number, JSON.stringify(inv.lines.map((x) => ({ i: x.itemId, q: x.qty, c: x.cost, sf: x.shortfall }))));
        }
      }
      lastGap = gap;
      continue;
    }
    check(l, events, `seed ${seed} step ${k} (${ops.slice(-3).join(' | ')})`);
  }
  (l as unknown as { __ops: string[] }).__ops = ops;
  return l;
}

function check(l: Ledger, events: CompanyEvent[], where: string) {
  const s = l.state;
  // 1) القيود متوازنة
  const tb = trialBalance(s);
  expect(tb.totalDebit, where).toBe(tb.totalCredit);
  for (const e of s.entries) {
    const d = e.lines.reduce((x, y) => x + y.baseDebit, 0);
    const c = e.lines.reduce((x, y) => x + y.baseCredit, 0);
    expect(d, `${where} entry ${e.number}`).toBe(c);
  }
  // 2) حساب المخزون = قيمة البضاعة
  const stockValue = Object.values(s.stock).reduce((x, y) => x + y.value, 0);
  expect(accountBalance(s, '1104').balance, `${where} inventory`).toBe(stockValue);
  // 3) الكميات بالمستودعات = المجموع
  for (const [id, st] of Object.entries(s.stock)) {
    const sum = Object.values(st.qty).reduce((x, y) => x + y, 0);
    expect(Math.round(sum * 1000), `${where} wh ${id}`).toBe(Math.round(st.totalQty * 1000));
  }
  // 4) دين كل شخص = مجموع الباقي من حركاته المفتوحة، بكل عملة
  for (const pid of Object.keys(s.parties)) {
    const bal = partyBalance(s, pid);
    for (const d of partyDebts(s, pid)) {
      expect(d.balance, `${where} ${pid} ${d.currency}`).toBe(bal.byCurrency[d.currency] ?? 0);
      const openSum = d.open.reduce((x, m) => x + m.remaining, 0);
      expect(openSum, `${where} ${pid} open ${d.currency}`).toBe(d.balance);
    }
  }
  // 5) الحساب السابق + الفاتورة = الباقي بعدها (بنفس العملة)
  for (const inv of s.invoices) {
    if (!inv.partyId || inv.voidEntryId) continue;
    const b = invoicePartyBalance(s, inv);
    if (b && !b.others.length) expect(b.after - b.previous, `${where} inv ${inv.number}`).toBe(ownEffect(l, inv));
  }
  // 6) ربح الفواتير = الربح اليومي = قائمة الدخل (لما ما في غير فواتير وتصحيحاتها)
  const income = incomeStatement(s, {});
  const daily = dailyProfit(s, '2000-01-01', '2100-01-01').reduce((x, d) => x + d.net, 0);
  expect(daily, `${where} daily vs income`).toBe(income.netProfit);
  // 8) التكاليف دايماً مصحّحة (التصحيح التلقائي بعد كل إلغاء/تعديل/عملية بتاريخ قديم)
  const plan = costPlan(s);
  if (plan.lines.length && process.env.FUZZ_PLAN) {
    for (const f of plan.lines) {
      const inv = s.invoices.find((i) => i.id === f.id);
      const ln = inv ? inv.lines[f.line] : s.adjustments.find((a) => a.id === f.id)?.lines[f.line];
      console.log('PLAN', where, f.doc, inv?.kind, inv?.date, inv?.number, 'item', ln?.itemId, 'qty', ln?.qty, (ln as { factor?: number })?.factor, 'recorded', ln?.cost, 'correct', f.cost, 'sf', (ln as { shortfall?: number })?.shortfall);
    }
    const it = s.invoices.find((i) => i.id === plan.lines[0]!.id)?.lines[plan.lines[0]!.line]?.itemId;
    if (it) for (const i of s.invoices.filter((x) => !x.voidEntryId && x.lines.some((y) => y.itemId === it)).sort((a, b) => a.date.localeCompare(b.date))) console.log('  MOVE', i.date, i.kind, i.number, JSON.stringify(i.lines.filter((y) => y.itemId === it).map((y) => [y.qty, y.factor, y.cost, y.shortfall])));
    if (it) for (const a of s.adjustments.filter((x) => x.lines.some((y) => y.itemId === it))) console.log('  ADJ', a.date, a.kind, JSON.stringify(a.lines.filter((y) => y.itemId === it).map((y) => [y.qty, y.cost, y.shortfall])), a.voidOf ? 'voidOf' : '');
    if (it) console.log('  STOCK', JSON.stringify(s.stock[it]));
  }
  expect(plan.lines.length + plan.docs.length, `${where} costs not corrected: ${JSON.stringify(plan.docs.slice(0, 3))}`).toBe(0);
  // 9) فحص البيانات (اللي بالإعدادات) بيقول سليم
  if (process.env.FUZZ_HEALTH !== '0') {
    const h = healthCheck(s);
    expect(h.issues.filter((i) => i.level !== 'info'), `${where} health`).toEqual([]);
  }
  // 7) إعادة بناء الحالة من الأحداث بتعطي نفس النتيجة (الأحداث هي المصدر)
  const replay = emptyState();
  for (const e of events) applyEvent(replay, structuredClone(e));
  expect(trialBalance(replay).totalDebit, `${where} replay`).toBe(tb.totalDebit);
  expect(Object.values(replay.stock).reduce((x, y) => x + y.value, 0), `${where} replay stock`).toBe(stockValue);
  expect(replay.invoices.length, `${where} replay invoices`).toBe(s.invoices.length);
}

/** أثر الفاتورة (وسند الزيادة المرافق) على حساب صاحبها بعملتها. */
function ownEffect(l: Ledger, inv: Invoice): number {
  const b = invoicePartyBalance(l.state, inv)!;
  return b.after - b.previous;
}

describe('stress: random operations keep every number consistent', () => {
  const seeds = Number(process.env.FUZZ_SEEDS ?? 12);
  const steps = Number(process.env.FUZZ_STEPS ?? 220);
  for (let seed = 1; seed <= seeds; seed++) {
    it(`seed ${seed}`, () => {
      const l = run(seed, steps);
      if (process.env.FUZZ_STATS) console.log('STATS', JSON.stringify((l as unknown as { __ops: string[] }).__ops.reduce((m: Record<string, number>, o) => ((m[o.split(' ')[0]!] = (m[o.split(' ')[0]!] ?? 0) + 1), m), {})));
      // تصحيح التكاليف ما بيلاقي شي بعد ما يشتغل مرة (ثابت)
      l.recalculateCosts();
      expect(l.recalculateCosts()).toBe(0);
      expect(invoiceProfit).toBeTypeOf('function');
    });
  }
});
