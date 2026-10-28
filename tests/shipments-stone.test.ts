import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, incomeStatement, partyBalance, stoneBlockUsage, trialBalance, type Activity, type Item } from '../src/core';

function company(activity: Activity) {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'شركة', activity, baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor(activity), defaultTaxes());
  return l;
}
const balanced = (l: Ledger) => {
  const tb = trialBalance(l.state);
  expect(tb.totalDebit).toBe(tb.totalCredit);
};

describe('customs clearance and transport', () => {
  it('a shipment with driver, truck and charges becomes a sale invoice on the customer', () => {
    const l = company('customs');
    l.saveParty({ id: 'c', kind: 'customer', name: 'أحمد مداني' });
    const s = l.saveShipment({
      id: 's1',
      partyId: 'c',
      date: '2026-10-28',
      status: 'transit',
      driver: 'أحمد مداني بغار',
      driverPhone: '+963982359366',
      plate: '81/41923',
      destination: 'جدة',
      goods: 'تفاح',
      refrigerated: true,
      currency: 'SYP',
      charges: [{ description: 'أجار سيارة + تخليص', amount: 1_600_000 }],
      costs: [{ description: 'أجرة السائق', amount: 1_000_000 }],
    });
    expect(s.number).toBe(1);
    const inv = l.invoiceShipment('s1', { date: '2026-10-28', paid: 600_000 });
    expect(inv.total).toBe(1_600_000);
    expect(inv.notes).toContain('السائق: أحمد مداني بغار');
    expect(inv.notes).toContain('إلى جدة');
    expect(l.state.shipments!['s1']).toMatchObject({ status: 'invoiced', invoiceId: inv.id });
    expect(partyBalance(l.state, 'c').base).toBe(1_000_000);
    expect(incomeStatement(l.state).netProfit).toBe(1_600_000);
    expect(() => l.saveShipment({ ...l.state.shipments!['s1']!, status: 'delivered' })).toThrow(/مفوترة/);
    // إلغاء الفاتورة بيرجّع الشحنة للتعديل
    l.voidInvoice(inv.id, '2026-10-28');
    expect(l.state.shipments!['s1']!.status).toBe('delivered');
    expect(l.state.shipments!['s1']!.invoiceId).toBeUndefined();
    balanced(l);
  });
});

describe('stone saw', () => {
  it('buys a block by cubic metre, cuts it into slabs, and the block cost moves to the products', () => {
    const l = company('stone');
    l.saveParty({ id: 'q', kind: 'supplier', name: 'مقلع حلب' });
    const slab: Item = { id: 'slab3', code: 'S3', name: 'حجر حلبي 3 سم', kind: 'stock', unit: 'م²', price: 150_000, priceCurrency: 'SYP' };
    const border: Item = { id: 'kor', code: 'K', name: 'كورنيش حلبي', kind: 'stock', unit: 'م.ط', price: 60_000, priceCurrency: 'SYP' };
    l.saveItem(slab);
    l.saveItem(border);
    const b = l.addStoneBlock({ date: '2026-10-01', partyId: 'q', stone: 'حلبي', length: 2.5, width: 1.6, height: 1.5, pricePerM3: 1_000_000 });
    expect(b.volume).toBe(6);
    expect(l.state.stock['stone-blocks']!.totalQty).toBe(6);
    expect(partyBalance(l.state, 'q').base).toBe(-6_000_000);

    // أول قص: 2 م³ ← 50 م² ألواح 3 سم (حجم 1.5) + 40 م.ط كورنيش (حجم 0.3)، والتكلفة حسب الحجم
    l.cutStoneBlock(b.id, { date: '2026-10-05', volume: 2, outputs: [{ itemId: 'slab3', qty: 50, weight: 1.5 }, { itemId: 'kor', qty: 40, weight: 0.3 }] });
    expect(stoneBlockUsage(l.state.stoneBlocks![b.id]!)).toEqual({ used: 2, left: 4 });
    expect(l.state.stock['slab3']!.value).toBe(Math.round((2_000_000 * 1.5) / 1.8));
    expect(l.state.stock['stone-blocks']!.totalQty).toBe(4);

    // ما فيك تقص أكتر من الباقي
    expect(() => l.cutStoneBlock(b.id, { date: '2026-10-06', volume: 5, outputs: [{ itemId: 'slab3', qty: 1 }] })).toThrow(/الباقي/);

    // آخر قص مع «خلصت الكتلة»: الباقي كله بينصرف، والهدر بيتحمّله المنتج
    l.cutStoneBlock(b.id, { date: '2026-10-07', outputs: [{ itemId: 'slab3', qty: 100 }], close: true });
    const done = l.state.stoneBlocks![b.id]!;
    expect(done.closed).toBe(true);
    expect(stoneBlockUsage(done).left).toBe(0);
    expect(l.state.stock['stone-blocks']!.totalQty).toBe(0);
    expect(l.state.stock['slab3']!.value + l.state.stock['kor']!.value).toBe(6_000_000);
    expect(() => l.cutStoneBlock(b.id, { date: '2026-10-08', outputs: [{ itemId: 'slab3', qty: 1 }] })).toThrow(/خالصة/);

    // البيع بالمتر المربع
    l.postInvoice({ kind: 'sale', date: '2026-10-09', lines: [{ itemId: 'slab3', qty: 20, price: 150_000 }] });
    expect(accountBalance(l.state, '4101').balance).toBe(-3_000_000);
    balanced(l);
  });

  it('a cash block needs no supplier, and voiding its purchase cancels it', () => {
    const l = company('stone');
    const b = l.addStoneBlock({ date: '2026-10-01', stone: 'كركوكي', length: 0, width: 0, height: 0, volume: 3.2, pricePerM3: 500_000 });
    expect(b.volume).toBe(3.2);
    l.voidInvoice(b.purchaseInvoiceId!, '2026-10-01');
    expect(l.state.stoneBlocks![b.id]!.closed).toBe(true);
    expect(l.state.stock['stone-blocks']!.totalQty).toBe(0);
  });
});

describe('demo data for the new activities', () => {
  for (const a of ['customs', 'stone'] as const) {
    it(`${a} demo loads and balances`, () => {
      const l = company(a);
      l.loadDemoData();
      balanced(l);
      if (a === 'customs') expect(Object.keys(l.state.shipments!).length).toBe(3);
      else expect(Object.values(l.state.stoneBlocks!).filter((b) => !b.closed).length).toBe(2);
    });
  }
});

describe('shipment profit on the invoice', () => {
  it('counts the shipment costs', async () => {
    const { invoiceProfit } = await import('../src/core');
    const l = company('customs');
    l.saveParty({ id: 'c', kind: 'customer', name: 'زبون' });
    l.saveShipment({ id: 's', partyId: 'c', date: '2026-10-28', status: 'arrived', currency: 'SYP', charges: [{ description: 'أجار سيارة', amount: 500_000 }], costs: [{ description: 'السائق', amount: 300_000 }] });
    const inv = l.invoiceShipment('s', { date: '2026-10-28' });
    expect(invoiceProfit(l.state, inv)).toEqual({ revenue: 500_000, cost: 300_000, profit: 200_000 });
  });
});
