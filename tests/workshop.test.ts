import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, partyBalance, permissionFor, rollRemainingCm, trialBalance, workOrderProgress, type WorkOrderDraft } from '../src/core';

function workshop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'ورشة', activity: 'tailor', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('tailor'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'معمل النور للألبسة' });
  l.saveParty({ id: 'c2', kind: 'customer', name: 'زبون تاني' });
  const rolls = l.receiveRolls({
    partyId: 'c',
    date: '2026-03-01',
    rolls: [
      { code: 'A-101', fabric: 'قطن بوبلين', color: 'أبيض', lengthCm: 5000 },
      { code: 'A-102', fabric: 'قطن بوبلين', color: 'أبيض', lengthCm: 4850 },
      { code: 'A-103', fabric: 'قطن بوبلين', color: 'سماوي', lengthCm: 5200 },
    ],
  });
  return { l, rolls };
}

const order = (over: Partial<WorkOrderDraft> = {}): WorkOrderDraft => ({
  id: 'w1',
  partyId: 'c',
  date: '2026-03-02',
  model: 'قميص رجالي كم طويل',
  modelCode: 'SH-22',
  sizes: ['M', 'L', 'XL'],
  planned: { M: 40, L: 50, XL: 30 },
  pieceRate: 250,
  currency: 'SYP',
  status: 'open',
  ...over,
});

describe('workshop: customer fabric rolls and piece work', () => {
  it('receives numbered rolls under one receipt and rejects duplicates', () => {
    const { l, rolls } = workshop();
    expect(rolls).toHaveLength(3);
    expect(new Set(rolls.map((r) => r.receiptNo))).toEqual(new Set([1]));
    expect(() => l.receiveRolls({ partyId: 'c', date: '2026-03-03', rolls: [{ code: 'A-101', fabric: 'قطن', lengthCm: 100 }] })).toThrow('مسجّل مسبقاً');
    // نفس الرقم لزبون تاني مسموح
    const other = l.receiveRolls({ partyId: 'c2', date: '2026-03-03', rolls: [{ code: 'A-101', fabric: 'جينز', lengthCm: 3000 }] });
    expect(other[0]!.receiptNo).toBe(2);
    expect(() => l.receiveRolls({ partyId: 'c', date: '2026-03-03', rolls: [{ code: 'X', fabric: 'قطن', lengthCm: 0 }] })).toThrow('طول غير صالح');
  });

  it('cuts consume meters from rolls and track pieces per size', () => {
    const { l, rolls } = workshop();
    l.saveWorkOrder(order());
    l.addCut('w1', { date: '2026-03-04', rolls: [{ rollId: rolls[0]!.id, cm: 5000 }, { rollId: rolls[1]!.id, cm: 2000 }], pieces: { M: 20, L: 25, XL: 15 } });
    const o = l.state.workOrders['w1']!;
    const p = workOrderProgress(l.state, o);
    expect(p.cut).toBe(60);
    expect(p.usedCm).toBe(7000);
    expect(Math.round(p.cmPerPiece!)).toBe(117);
    expect(rollRemainingCm(l.state, l.state.rolls[rolls[0]!.id]!)).toBe(0);
    expect(rollRemainingCm(l.state, l.state.rolls[rolls[1]!.id]!)).toBe(2850);
    // التوب الأول خلص
    expect(() => l.addCut('w1', { date: '2026-03-05', rolls: [{ rollId: rolls[0]!.id, cm: 10 }], pieces: { M: 1 } })).toThrow('ما فيه كفاية');
    // توب زبون تاني ما بينقص لهالطلبية
    const foreign = l.receiveRolls({ partyId: 'c2', date: '2026-03-03', rolls: [{ code: 'Z', fabric: 'جينز', lengthCm: 3000 }] });
    expect(() => l.addCut('w1', { date: '2026-03-05', rolls: [{ rollId: foreign[0]!.id, cm: 100 }], pieces: { M: 1 } })).toThrow('مو لنفس الزبون');
    expect(() => l.addCut('w1', { date: '2026-03-05', rolls: [{ rollId: rolls[2]!.id, cm: 100 }], pieces: { XXL: 1 } })).toThrow('غير صالح');
  });

  it('delivers in batches with piece-rate invoices; voiding returns pieces to ready', () => {
    const { l, rolls } = workshop();
    l.saveWorkOrder(order());
    l.addCut('w1', { date: '2026-03-04', rolls: [{ rollId: rolls[0]!.id, cm: 5000 }], pieces: { M: 20, L: 20, XL: 10 } });
    expect(() => l.deliverWork('w1', { date: '2026-03-06', pieces: { M: 21 } })).toThrow('أكثر من المقصوص');
    const { invoice } = l.deliverWork('w1', { date: '2026-03-06', pieces: { M: 20, L: 10 }, invoice: true, paid: 2500 });
    expect(invoice!.total).toBe(30 * 250);
    expect(invoice!.lines[0]!.description).toContain('M: 20');
    expect(partyBalance(l.state, 'c').base).toBe(30 * 250 - 2500);
    let p = workOrderProgress(l.state, l.state.workOrders['w1']!);
    expect(p.delivered).toBe(30);
    expect(p.readyBySize).toEqual({ M: 0, L: 10, XL: 10 });
    expect(p.invoiced).toBe(30);

    // دفعة بدون فاتورة ثم فوترتها
    const { order: o2 } = l.deliverWork('w1', { date: '2026-03-07', pieces: { L: 10 } });
    const d2 = o2.deliveries[1]!;
    expect(d2.number).toBe(2);
    const inv2 = l.invoiceDelivery('w1', d2.id, { date: '2026-03-08' });
    expect(inv2.total).toBe(2500);
    expect(() => l.invoiceDelivery('w1', d2.id, { date: '2026-03-08' })).toThrow('مفوترة مسبقاً');

    // ما فيك تشيل قصّة عليها تسليمات
    expect(() => l.removeCut('w1', l.state.workOrders['w1']!.cuts[0]!.id)).toThrow('أكثر من المقصوص');

    l.voidInvoice(invoice!.id, '2026-03-09');
    p = workOrderProgress(l.state, l.state.workOrders['w1']!);
    expect(p.delivered).toBe(10);
    expect(l.state.workOrders['w1']!.deliveries).toHaveLength(1);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('returns remnants, closes when fully delivered, and guards sizes', () => {
    const { l, rolls } = workshop();
    l.saveWorkOrder(order({ planned: { M: 2, L: 0, XL: 0 } }));
    l.addCut('w1', { date: '2026-03-04', rolls: [{ rollId: rolls[2]!.id, cm: 300 }], pieces: { M: 2 } });
    l.returnRoll(rolls[2]!.id, { date: '2026-03-05' });
    expect(rollRemainingCm(l.state, l.state.rolls[rolls[2]!.id]!)).toBe(0);
    expect(() => l.returnRoll(rolls[2]!.id, { date: '2026-03-05' })).toThrow('ما في باقي');
    expect(() => l.saveWorkOrder(order({ sizes: ['L', 'XL'], planned: { L: 0, XL: 0 } }))).toThrow('عليه قصّات');
    l.deliverWork('w1', { date: '2026-03-06', pieces: { M: 2 } });
    expect(l.state.workOrders['w1']!.status).toBe('done');
  });

  it('maps permissions', () => {
    expect(permissionFor('receiveRolls', [])).toBe('tailoring.manage');
    expect(permissionFor('deliverWork', ['w1', { invoice: true }])).toBe('sales.create');
    expect(permissionFor('deliverWork', ['w1', { invoice: false }])).toBe('tailoring.manage');
    expect(permissionFor('invoiceDelivery', [])).toBe('sales.create');
  });
});
