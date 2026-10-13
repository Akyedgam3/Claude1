import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCIES,
  Ledger,
  applyEvent,
  chartFor,
  convertLength,
  defaultTaxes,
  emptyState,
  laysFrom,
  partyBalance,
  permissionFor,
  rollRemaining,
  trialBalance,
  workOrderProgress,
  type CompanyEvent,
  type WorkOrderDraft,
} from '../src/core';

// مثال دفتر الخياط: رسمة 5 يارد، كل مدة قطعة من كل نمرة (38، 40، 42)
function workshop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'ورشة', activity: 'tailor', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('tailor'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'معمل النور للألبسة' });
  l.saveParty({ id: 'c2', kind: 'customer', name: 'زبون تاني' });
  const rolls = l.receiveRolls({
    partyId: 'c',
    date: '2026-03-01',
    unit: 'yd',
    rolls: [
      { code: '120', fabric: 'جوخ', length: 11000 },
      { code: '140', fabric: 'جوخ', length: 12000 },
      { code: '141', fabric: 'جوخ', length: 8500 },
    ],
  });
  return { l, rolls };
}

const order = (over: Partial<WorkOrderDraft> = {}): WorkOrderDraft => ({
  id: 'w1',
  partyId: 'c',
  date: '2026-03-02',
  model: 'جلابية رجالي',
  sizes: ['38', '40', '42'],
  planned: { '38': 46, '40': 46, '42': 46 },
  unit: 'yd',
  markerLength: 500,
  ratio: { '38': 1, '40': 1, '42': 1 },
  pieceRate: 4000,
  currency: 'SYP',
  status: 'open',
  ...over,
});

describe('workshop: lays, stages, expenses and the customer account', () => {
  it('computes lays per roll and the lays/yards an order needs (the notebook example)', () => {
    const { l, rolls } = workshop();
    l.saveWorkOrder(order());
    expect(laysFrom(11000, 'yd', 500, 'yd')).toBe(22);
    expect(laysFrom(12000, 'yd', 500, 'yd')).toBe(24);
    let p = workOrderProgress(l.state, l.state.workOrders['w1']!);
    expect(p.piecesPerLay).toBe(3);
    expect(p.planned).toBe(138);
    expect(p.laysNeeded).toBe(46);
    expect(p.lengthNeeded).toBe(23000); // 230 يارد

    l.addCut('w1', {
      date: '2026-03-04',
      rolls: [
        { rollId: rolls[0]!.id, lays: 22, used: 11000 },
        { rollId: rolls[1]!.id, lays: 24, used: 12000 },
      ],
      pieces: { '38': 46, '40': 46, '42': 46 },
    });
    p = workOrderProgress(l.state, l.state.workOrders['w1']!);
    expect(p.lays).toBe(46);
    expect(p.used).toBe(23000);
    expect(p.cut).toBe(138);
    expect(p.perPiece).toBeCloseTo(23000 / 138);
    expect(rollRemaining(l.state, l.state.rolls[rolls[0]!.id]!)).toBe(0);
    expect(() => l.addCut('w1', { date: '2026-03-05', rolls: [{ rollId: rolls[0]!.id, lays: 1, used: 500 }], pieces: { '38': 1 } })).toThrow('ما فيه كفاية');
    const foreign = l.receiveRolls({ partyId: 'c2', date: '2026-03-03', rolls: [{ code: 'Z', fabric: 'جينز', length: 3000 }] });
    expect(foreign[0]!.unit).toBe('m');
    expect(() => l.addCut('w1', { date: '2026-03-05', rolls: [{ rollId: foreign[0]!.id, used: 100 }], pieces: { '38': 1 } })).toThrow('مو لنفس الزبون');
  });

  it('tracks sewing, done and damaged pieces, and only delivers what is done', () => {
    const { l, rolls } = workshop();
    l.saveWorkOrder(order());
    l.addCut('w1', { date: '2026-03-04', rolls: [{ rollId: rolls[0]!.id, lays: 22, used: 11000 }], pieces: { '38': 22, '40': 22, '42': 22 } });
    expect(() => l.addStage('w1', { date: '2026-03-05', stage: 'sewing', pieces: { '38': 23 } })).toThrow('أكثر من المقصوص');
    l.addStage('w1', { date: '2026-03-05', stage: 'sewing', pieces: { '38': 22, '40': 22, '42': 22 } });
    l.addStage('w1', { date: '2026-03-05', stage: 'damaged', pieces: { '42': 2 } });
    expect(() => l.addStage('w1', { date: '2026-03-06', stage: 'done', pieces: { '42': 21 } })).toThrow('أكثر من المقصوص السليم');
    expect(() => l.addStage('w1', { date: '2026-03-06', stage: 'done', pieces: { '40': 23 } })).toThrow('أكثر من المقصوص السليم');
    l.addStage('w1', { date: '2026-03-06', stage: 'done', pieces: { '38': 20, '40': 15 } });
    const p = workOrderProgress(l.state, l.state.workOrders['w1']!);
    expect(p.readyBySize).toEqual({ '38': 20, '40': 15, '42': 0 });
    expect(p.shortage).toBe(138 - 64);
    expect(() => l.deliverWork('w1', { date: '2026-03-07', pieces: { '38': 21 } })).toThrow('أكثر من المنجز');
    const { invoice } = l.deliverWork('w1', { date: '2026-03-07', pieces: { '38': 20, '40': 15 }, invoice: true });
    expect(invoice!.total).toBe(35 * 4000);
  });

  it('expenses on the customer raise what they owe; workshop expenses do not', () => {
    const { l } = workshop();
    l.saveWorkOrder(order());
    l.addWorkExpense('w1', { date: '2026-03-05', kind: 'استيك', amount: 9000, billTo: 'customer' });
    l.addWorkExpense('w1', { date: '2026-03-05', kind: 'نقل', amount: 4000, billTo: 'workshop' });
    expect(partyBalance(l.state, 'c').base).toBe(9000);
    let p = workOrderProgress(l.state, l.state.workOrders['w1']!);
    expect(p.expensesCustomer).toBe(9000);
    expect(p.expensesWorkshop).toBe(4000);
    const e = l.state.workOrders['w1']!.expenses[0]!;
    l.removeWorkExpense('w1', e.id, '2026-03-06');
    p = workOrderProgress(l.state, l.state.workOrders['w1']!);
    expect(p.expensesCustomer).toBe(0);
    expect(partyBalance(l.state, 'c').base).toBe(0);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('settles with the customer: earned, adjustments, payments, and an overpaid balance', () => {
    const { l, rolls } = workshop();
    l.saveWorkOrder(order());
    l.addCut('w1', { date: '2026-03-04', rolls: [{ rollId: rolls[0]!.id, lays: 22, used: 11000 }], pieces: { '38': 22, '40': 22, '42': 22 } });
    l.deliverWork('w1', { date: '2026-03-07', pieces: { '38': 10 }, invoice: true }); // 40,000
    l.addWorkAdjustment('c', { date: '2026-03-07', amount: 5000, direction: 'add', note: 'تطريز إضافي' });
    l.addWorkAdjustment('c', { date: '2026-03-07', amount: 2000, direction: 'deduct', note: 'تأخير' });
    expect(partyBalance(l.state, 'c').base).toBe(43000);
    // استلم أكثر من المستحق: صار الرصيد علينا للزبون
    l.postVoucher({ kind: 'receipt', date: '2026-03-08', amount: 50000, partyId: 'c', memo: 'دفعة' });
    expect(partyBalance(l.state, 'c').base).toBe(-7000);
    expect(() => l.addWorkAdjustment('c', { date: '2026-03-07', amount: 100, direction: 'add', note: ' ' })).toThrow('اكتب سبب');
  });

  it('converts yards and meters, and upgrades the first version of saved events', () => {
    expect(convertLength(10000, 'yd', 'm')).toBe(9144);
    expect(laysFrom(10000, 'm', 500, 'yd')).toBe(21); // 100 م ÷ 4.572 م
    const l = workshop().l;
    const state = emptyState();
    const legacy: CompanyEvent[] = [
      { type: 'company.created', info: l.state.info!, currencies: DEFAULT_CURRENCIES },
      { type: 'party.saved', party: { id: 'c', kind: 'customer', name: 'x' } },
      { type: 'rolls.saved', rolls: [{ id: 'r', code: '1', partyId: 'c', receiptNo: 1, date: '2026-01-01', fabric: 'قطن', lengthCm: 5000, returns: [{ date: '2026-01-02', cm: 100 }] } as never] },
      { type: 'workorder.saved', order: { id: 'w', number: 1, partyId: 'c', date: '2026-01-01', model: 'م', sizes: ['M'], planned: { M: 10 }, pieceRate: 0, currency: 'SYP', status: 'open', cuts: [{ id: 'k', date: '2026-01-02', rolls: [{ rollId: 'r', cm: 1000 }], pieces: { M: 5 } }], deliveries: [] } as never },
    ];
    for (const e of legacy) applyEvent(state, e);
    expect(state.rolls['r']!.unit).toBe('m');
    expect(rollRemaining(state, state.rolls['r']!)).toBe(5000 - 1000 - 100);
    expect(state.workOrders['w']!.stages).toEqual([]);
  });

  it('maps permissions', () => {
    expect(permissionFor('receiveRolls', [])).toBe('tailoring.manage');
    expect(permissionFor('addStage', [])).toBe('tailoring.manage');
    expect(permissionFor('addWorkExpense', [])).toBe('vouchers.create');
    expect(permissionFor('deliverWork', ['w1', { invoice: true }])).toBe('sales.create');
    expect(permissionFor('deliverWork', ['w1', { invoice: false }])).toBe('tailoring.manage');
  });
});
