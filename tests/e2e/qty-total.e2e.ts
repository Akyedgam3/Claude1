import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

test('مجموع الكمية بفاتورة المبيع والشراء (وقت الكتابة وبالفاتورة المطبوعة)', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الكميات', activity: 'تجارة عامة' });
    for (const kind of ['فاتورة مبيع', 'فاتورة شراء']) {
      await nav(page, kind);
      if (kind === 'فاتورة شراء') await page.getByRole('button', { name: /نقدي|مدفوعة/ }).first().click().catch(() => {});
      const rows = page.locator('table.lines tbody tr');
      await rows.nth(0).locator('input.line-desc').fill('بند أول');
      await rows.nth(0).locator('input.num-input').nth(0).fill('3');
      await rows.nth(0).locator('input.num-input').nth(1).fill('1000');
      await rows.nth(1).locator('input.line-desc').fill('بند تاني');
      await rows.nth(1).locator('input.num-input').nth(0).fill('2.5');
      await rows.nth(1).locator('input.num-input').nth(1).fill('400');
      await expect(page.locator('.totals .qty-total')).toHaveText('5.5');
      await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
      await toast(page, 'تم حفظ');
      await nav(page, 'سجل الفواتير');
      await page.locator('table tbody tr').first().click();
      await expect(page.locator('.doc-totals')).toContainText('مجموع الكمية');
      await expect(page.locator('.doc-totals')).toContainText('5.5');
    }
  } finally {
    await close();
  }
});
