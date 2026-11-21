import { expect, test } from '@playwright/test';
import { activate, launch, nav, companyWizard } from './helpers';

// لوحة الإدارة: بشركة فيها بيانات تجريبية، الأرقام والرسم والملاحظات بتطلع، وتغيير الفترة بيشتغل

test('management dashboard with demo data: kpis, chart, notes, period switch', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await companyWizard(page, { activity: 'سوبرماركت', name: 'ماركت الإدارة', owner: 'المالك', username: 'admin', demo: true });
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
