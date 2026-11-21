import { expect, test } from '@playwright/test';
import { activate, launch, nav, toast, companyWizard } from './helpers';

test('owner resets a trial company: sales gone, items kept, password required', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await companyWizard(page, { activity: 'سوبرماركت', name: 'سوبرماركت التجربة', owner: 'المالك', demo: true });
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();

    await nav(page, 'سجل الفواتير');
    await expect(page.locator('table.table tbody tr').first()).toBeVisible();

    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'تصفير الشركة' }).click();
    await page.locator('.field', { hasText: 'كلمة السر (للتأكيد)' }).locator('input').fill('wrongpass');
    await page.locator('.field', { hasText: 'للتأكيد' }).last().locator('input').fill('تصفير');
    await page.getByRole('button', { name: 'تصفير الحركات' }).last().click();
    await toast(page, 'كلمة السر غير صحيحة');

    await page.locator('.field', { hasText: 'كلمة السر (للتأكيد)' }).locator('input').fill('secret123');
    await page.getByRole('button', { name: 'تصفير الحركات' }).last().click();
    await toast(page, /تم التصفير/);
    await page.screenshot({ path: 'test-results/screens/70-reset.png' });

    await nav(page, 'سجل الفواتير');
    await expect(page.locator('table.table tbody tr')).toHaveCount(0);
    await nav(page, 'المواد');
    await expect(page.locator('table.table tbody tr', { hasText: 'رز مصري' })).toBeVisible();

  } finally {
    await close();
  }
});
