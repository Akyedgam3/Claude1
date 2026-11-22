import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

// زبون: سجّل حساب مورد بالدولار، وبقائمة العملاء والموردين طلع بالليرة (محوّل). لازم يبيّن بالدولار متل ما انسجّل
test('customers and suppliers list shows each balance in its own currency', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'ملبوسات', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('setRate', { date: '2026-11-01', currency: 'USD', kind: 'market', rate: 151 });
    await call('saveParty', { id: 's1', name: 'محمد شوكت أبو عمر', kind: 'supplier' });
    await call('postDebt', { direction: 'owe', partyId: 's1', date: '2026-11-22', amount: 420700, currency: 'USD', reason: 'old' });
    await nav(page, 'العملاء والموردون');
    const row = page.locator('tr', { hasText: 'محمد شوكت أبو عمر' }).first();
    await expect(row).toContainText('4,207.00');
    await expect(row).toContainText('$');
    await expect(row).not.toContainText('ل.س');
  } finally {
    await close();
  }
});
