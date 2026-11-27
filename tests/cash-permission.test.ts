import { describe, expect, it } from 'vitest';
import { METHOD_PERMISSIONS, can, type User } from '../src/core';

// تقرير التجربة B1: الكاشير كان يسحب «للمالك» ويحوّل بين الصناديق. هلق بدها «إدارة الصناديق».
const user = (role: User['role'], extra: string[] = [], denied: string[] = []): User => ({ id: role, username: role, name: role, role, active: true, passwordHash: '', salt: '', extra, denied } as unknown as User);
const need = (m: string, ...args: unknown[]) => {
  const p = METHOD_PERMISSIONS[m]!;
  return typeof p === 'function' ? p(args) : p;
};

describe('cash box permissions', () => {
  it('cashier cannot withdraw, transfer or zero boxes; owner/manager/accountant can', () => {
    for (const m of ['drawFromBox', 'fillBox']) expect(need(m)).toBe('cash.manage');
    expect(need('transferBox', { from: '1101', to: '1102' })).toBe('cash.manage');
    expect(can(user('cashier'), 'cash.manage')).toBe(false);
    expect(can(user('cashier'), 'vouchers.create')).toBe(true);
    for (const r of ['owner', 'manager', 'accountant'] as const) expect(can(user(r), 'cash.manage'), r).toBe(true);
    // اللي معه دليل الحسابات بياخدها، إلا إذا انسحبت صراحة
    expect(can(user('cashier', ['accounts.manage']), 'cash.manage')).toBe(true);
    expect(can(user('accountant', [], ['cash.manage']), 'cash.manage')).toBe(false);
  });
  it('pharmacy dealer box settlement keeps working with vouchers permission', () => {
    expect(need('transferBox', { from: '11019', to: '1101' })).toBe('vouchers.create');
  });
  it('vouchers to the owner/partners accounts need cash.manage (cash journal too)', () => {
    expect(need('postVoucher', { kind: 'payment', accountId: '3102', amount: 1000 })).toBe('cash.manage');
    expect(need('postVoucher', { kind: 'payment', accountId: '5201', amount: 1000 })).toBe('vouchers.create');
    expect(need('postVouchers', [{ accountId: '5201' }, { accountId: '3102' }])).toBe('cash.manage');
    expect(need('postVouchers', [{ partyId: 'c' }])).toBe('vouchers.create');
    expect(need('editVoucher', 'x', { accountId: '3101' })).toBe('cash.manage');
  });
});
