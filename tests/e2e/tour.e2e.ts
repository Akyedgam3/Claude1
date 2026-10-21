import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

test('first-run tour: 10 steps, shown once, can be replayed from settings', async () => {
  const { page, close } = await launch();
  try {
    await page.evaluate(() => localStorage.removeItem('mizan.tour.off'));
    await activate(page);
    await createCompany(page, { name: 'محل الجولة', activity: 'تجارة عامة' });
    const card = page.locator('.tour-card');
    await expect(card).toContainText('أهلاً بك في وزن');
    await expect(card).toContainText('1 / 10');
    await page.screenshot({ path: 'test-results/screens/90-tour-start.png' });
    await card.getByRole('button', { name: 'لنبدأ' }).click();
    await expect(card).toContainText('البحث السريع');
    for (let n = 0; n < 7; n++) await card.getByRole('button', { name: 'التالي' }).click();
    await expect(card).toContainText('التقارير');
    // الإطار على زر التقارير نفسه
    await page.waitForTimeout(500);
    const spot = await page.locator('.tour-spot').boundingBox();
    const btn = await page.locator('[data-nav="reports"]').boundingBox();
    expect(Math.abs(spot!.y + 4 - btn!.y)).toBeLessThan(3);
    await page.screenshot({ path: 'test-results/screens/91-tour-step.png' });
    await card.getByRole('button', { name: 'التالي' }).click();
    await card.getByRole('button', { name: 'ابدأ العمل' }).click();
    await expect(page.locator('.tour')).toHaveCount(0);

    // ما بترجع تطلع بعد إعادة التحميل
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.locator('.tour')).toHaveCount(0);

    // بتنعاد من الإعدادات
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الجولة التعريفية' }).click();
    await expect(card).toContainText('أهلاً بك في وزن');
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour')).toHaveCount(0);
  } finally {
    await close();
  }
});
