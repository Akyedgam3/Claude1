import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

// تقرير التجربة B3: خصم 200,000 على سلة 166,200 كان يصفّر الإجمالي بدون تحذير
test('POS refuses a discount bigger than the total', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'سوبرماركت', activity: 'سوبرماركت' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    await call('saveItem', { id: 'z', code: '1', name: 'زيت', kind: 'stock', unit: 'قطعة', price: 16620000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'z', qty: 10, unitCost: 10000000 }] });
    await nav(page, 'نقطة البيع');
    await page.locator('.pos-item', { hasText: 'زيت' }).first().click();
    const disc = page.locator('.pos-totals input.num-input').first();
    await disc.fill('200000');
    await expect(page.locator('.pos-disc-error')).toContainText('أكبر من المجموع');
    await page.getByRole('button', { name: /دفع نقد/ }).first().click();
    await expect(page.locator('.toast', { hasText: 'أكبر من المجموع' })).toBeVisible();
    expect((await st()).invoices).toHaveLength(0);
    await disc.fill('10%');
    await expect(page.locator('.pos-disc-error')).toHaveCount(0);
  } finally {
    await close();
  }
});
