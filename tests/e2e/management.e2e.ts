import { expect, test } from '@playwright/test';
import { activate, launch, nav } from './helpers';

// لوحة الإدارة: بشركة فيها بيانات تجريبية، الأرقام والرسم والملاحظات بتطلع، وتغيير الفترة بيشتغل

test('management dashboard with demo data: kpis, chart, notes, period switch', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'سوبرماركت' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('ماركت الإدارة');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'اسم الدخول' }).locator('input').fill('admin');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();
    await nav(page, 'لوحة الإدارة');
    await expect(page.locator('.mgmt-kpi').first()).toContainText('صافي المبيعات');
    await expect(page.locator('.mgmt-kpi')).toHaveCount(13);
    await page.locator('.mgmt-presets button', { hasText: '90 يوم' }).click();
    await expect(page.locator('.mgmt-chart svg')).toBeVisible();
    expect(await page.locator('.mgmt-chart svg rect.bar-rev').count()).toBe(90);
    await expect(page.locator('.mgmt-notes li').first()).toBeVisible();
    if (process.env.SHOT) {
      for (let i = 0; i < 4; i++) {
        await page.evaluate((y) => document.querySelector('.page.mgmt')?.closest('main, .content, .main')?.scrollTo(0, y), i * 780);
        await page.waitForTimeout(200);
        await page.screenshot({ path: process.env.SHOT.replace('.png', i + '.png') });
      }
    }
    await page.locator('.mgmt-presets button', { hasText: 'اليوم' }).first().click();
    await expect(page.locator('.mgmt-range .muted')).toContainText('1 يوم');
  } finally {
    await close();
  }
});
