import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, accountBalance, chartFor, defaultTaxes, employeeBalance, employeeMoves, incomeStatement } from '../src/core';

function shop() {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveEmployee({ id: 'sami', name: 'سامي', phone: '0999', jobTitle: 'بائع', salary: 30000, payPeriod: 'monthly' });
  l.saveEmployee({ id: 'rami', name: 'رامي', salary: 20000, payPeriod: 'monthly' });
  return l;
}

describe('employees & payroll', () => {
  it('accrue the month for everyone once, advance, deduct it, pay the rest', () => {
    const l = shop();
    expect(l.accrueSalaries({ period: '2026-11', date: '2026-11-30' })).toBe(2);
    expect(l.accrueSalaries({ period: '2026-11', date: '2026-11-30' })).toBe(0); // ما بيتكرر
    expect(() => l.employeeMove({ employeeId: 'sami', kind: 'accrual', amount: 30000, date: '2026-11-30', period: '2026-11' })).toThrow();
    expect(accountBalance(l.state, '2105').balance).toBe(-50000);
    expect(incomeStatement(l.state, { from: '2026-11-01', to: '2026-11-30' }).netProfit).toBe(-50000);

    l.employeeMove({ employeeId: 'sami', kind: 'advance', amount: 5000, date: '2026-11-10' });
    expect(employeeBalance(l.state, 'sami')).toMatchObject({ salaryDue: 30000, advances: 5000, net: 25000 });
    l.employeeMove({ employeeId: 'sami', kind: 'advance_deduct', amount: 5000, date: '2026-11-30' });
    l.employeeMove({ employeeId: 'sami', kind: 'bonus', amount: 2000, date: '2026-11-30' });
    l.employeeMove({ employeeId: 'sami', kind: 'deduction', amount: 1000, date: '2026-11-30' });
    expect(employeeBalance(l.state, 'sami')).toMatchObject({ salaryDue: 26000, advances: 0, net: 26000 });
    const pay = l.employeeMove({ employeeId: 'sami', kind: 'payment', amount: 26000, date: '2026-12-01' });
    expect(employeeBalance(l.state, 'sami').net).toBe(0);

    // إلغاء الدفعة بيرجّع المستحق، وبتضل بالسجل ملغاة
    l.voidEmployeeMove(pay.id, '2026-12-01');
    expect(employeeBalance(l.state, 'sami').net).toBe(26000);
    expect(employeeMoves(l.state, 'sami').find((m) => m.entryId === pay.id)?.voided).toBe(true);
    expect(employeeMoves(l.state, 'sami').filter((m) => m.kind === 'accrual')[0]?.period).toBe('2026-11');
  });

  it('voiding an accrual allows accruing that month again; inactive employees are skipped', () => {
    const l = shop();
    l.accrueSalaries({ period: '2026-11', date: '2026-11-30' });
    const acc = employeeMoves(l.state, 'rami').find((m) => m.kind === 'accrual')!;
    l.voidEmployeeMove(acc.entryId, '2026-11-30');
    l.saveEmployee({ ...l.state.employees!['sami']!, active: false });
    expect(l.accrueSalaries({ period: '2026-11', date: '2026-11-30' })).toBe(1);
    expect(() => l.saveEmployee({ id: 'x', name: '', salary: 1, payPeriod: 'monthly' })).toThrow();
  });
});
