import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes, partyBalance, solarDesign, solarLoads, solarTotals, solarWarranties, trialBalance, warrantyEnd } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'شمس الشام', activity: 'solar', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('solar'), defaultTaxes());
  l.saveParty({ id: 'c', kind: 'customer', name: 'أبو علي' });
  l.saveItem({ id: 'panel', code: 'P', name: 'لوح 550', kind: 'stock', unit: 'لوح', price: 900_000, priceCurrency: 'SYP' });
  l.saveItem({ id: 'inv', code: 'I', name: 'انفرتر 3.6', kind: 'stock', unit: 'قطعة', price: 3_600_000, priceCurrency: 'SYP' });
  l.adjustStock({ kind: 'opening', date: '2026-10-01', lines: [{ itemId: 'panel', qty: 10, unitCost: 700_000 }, { itemId: 'inv', qty: 2, unitCost: 2_900_000 }] });
  return l;
}
const loads = [
  { id: '1', name: 'براد', watts: 150, qty: 1, dayHours: 8, nightHours: 6 },
  { id: '2', name: 'ليدات', watts: 10, qty: 10, dayHours: 0, nightHours: 6 },
];

describe('solar', () => {
  it('calculates loads and suggests the system', () => {
    expect(solarLoads(loads)).toEqual({ peakW: 250, dayWh: 1200, nightWh: 1500, totalWh: 2700 });
    const d = solarDesign(loads, { sunHours: 5, panelWatts: 550, batteryKwh: 5.12 });
    expect(d.inverterKw).toBe(1); // 250 × 1.25 = 312 واط
    expect(d.panels).toBe(2); // 2700 / (550 × 5 × 0.75) = 1.3
    expect(d.storageKwh).toBe(1.67);
    expect(d.batteries).toBe(1);
    expect(solarDesign([{ ...loads[0]!, watts: 3000 }]).inverterKw).toBe(4);
  });

  it('quotes, takes a deposit, invoices from stock and tracks warranties', () => {
    const l = shop();
    const p = l.saveSolarProject({
      id: 'p', partyId: 'c', date: '2026-10-20', status: 'quote', currency: 'SYP', loads,
      lines: [
        { id: 'a', part: 'panel', itemId: 'panel', name: 'لوح 550', qty: 4, price: 900_000, warrantyMonths: 120 },
        { id: 'b', part: 'inverter', itemId: 'inv', name: 'انفرتر 3.6', qty: 1, price: 3_600_000, warrantyMonths: 24, serials: ['INV-1'] },
        { id: 'c', part: 'labor', name: 'تركيب', qty: 1, price: 1_500_000 },
      ],
      discount: 100_000,
    });
    expect(solarTotals(p).total).toBe(8_600_000);
    l.addSolarDeposit('p', { date: '2026-10-21', amount: 5_000_000 });
    expect(l.state.solarProjects!['p']!.status).toBe('accepted');
    expect(partyBalance(l.state, 'c').base).toBe(-5_000_000);
    const inv = l.invoiceSolarProject('p', { date: '2026-10-25' });
    expect(inv.total).toBe(8_600_000);
    expect(inv.paid).toBe(3_600_000);
    expect(inv.lines[1]!.note).toBe('S/N: INV-1');
    expect(inv.lines[2]!.itemId).toBeNull();
    expect(l.state.stock['panel']!.totalQty).toBe(6);
    expect(l.state.stock['inv']!.totalQty).toBe(1);
    expect(partyBalance(l.state, 'c').base).toBe(0);
    const w = solarWarranties(l.state);
    expect(w.map((x) => [x.line.name, x.end])).toEqual([['انفرتر 3.6', '2028-10-25'], ['لوح 550', '2036-10-25']]);
    expect(() => l.saveSolarProject({ ...p, status: 'installed' })).toThrow('مفوترة');
    l.voidInvoice(inv.id, '2026-10-25');
    expect(l.state.solarProjects!['p']!.status).toBe('installed');
    expect(l.state.stock['panel']!.totalQty).toBe(10);
    const tb = trialBalance(l.state);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('validates input and loads the demo', () => {
    const l = shop();
    expect(() => l.saveSolarProject({ id: 'x', partyId: 'c', date: '2026-10-20', status: 'quote', currency: 'SYP', loads: [{ ...loads[0]!, dayHours: 20, nightHours: 10 }], lines: [] })).toThrow('أرقام غير صالحة');
    expect(warrantyEnd('2026-01-31', 1)).toBe('2026-03-03');
    const d = new Ledger(() => {});
    d.createCompany({ name: 'تجريبي', activity: 'solar', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('solar'), defaultTaxes());
    d.loadDemoData();
    expect(Object.keys(d.state.solarProjects!).length).toBe(3);
    expect(solarWarranties(d.state).length).toBe(3);
  });
});
