import { expect, test } from '@playwright/test';
import { activate, createCompany, launch } from './helpers';

test('الشاشة الرئيسية: المستخدم بيخصص الإحصائيات (إخفاء، إضافة، ترتيب) وبتنحفظ', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل التخصيص', activity: 'سوبرماركت' });
    const stats = page.locator('.stats').first();
    await expect(stats.locator('.stat', { hasText: 'مبيعات اليوم' })).toBeVisible();
    await expect(stats.locator('.stat', { hasText: 'سعر الدولار' })).toBeVisible();

    await page.getByRole('button', { name: /تخصيص الإحصائيات/ }).click();
    const m = page.locator('.modal');
    // إخفاء «سعر الدولار»، إضافة «مبيعات مبارح» و«قيمة البضاعة»، ونقل «مبيعات مبارح» لفوق
    await m.locator('li', { hasText: 'سعر الدولار' }).locator('input').uncheck();
    await m.locator('li', { hasText: 'مبيعات مبارح' }).locator('input').check();
    await m.locator('li', { hasText: 'قيمة البضاعة' }).locator('input').check();
    const up = m.locator('li', { hasText: 'مبيعات مبارح' }).getByRole('button', { name: 'لفوق' });
    while (await up.isEnabled()) await up.click();
    // إخفاء بطاقة «الأكثر مبيعاً»
    await m.locator('li', { hasText: 'الأكثر مبيعاً هالشهر' }).locator('input').uncheck();
    await m.getByRole('button', { name: 'تم' }).click();

    await expect(stats.locator('.stat', { hasText: 'سعر الدولار' })).toHaveCount(0);
    await expect(stats.locator('.stat').first()).toContainText('مبيعات مبارح');
    await expect(stats.locator('.stat', { hasText: 'قيمة البضاعة بالمستودع' })).toBeVisible();
    await expect(page.locator('section.card', { hasText: 'الأكثر مبيعاً هالشهر' })).toHaveCount(0);

    // بعد إعادة التحميل التخصيص بيضل
    await page.reload();
    await page.waitForTimeout(500);
    if (await page.locator('.lock-screen, .login').count()) test.skip(true, 'شاشة قفل بعد إعادة التحميل');
    await expect(page.locator('.stats').first().locator('.stat').first()).toContainText('مبيعات مبارح', { timeout: 15000 });

    // رجّع الافتراضي
    await page.getByRole('button', { name: /تخصيص الإحصائيات/ }).click();
    await page.locator('.modal').getByRole('button', { name: 'رجّع الافتراضي' }).click();
    await page.locator('.modal').getByRole('button', { name: 'تم' }).click();
    await expect(page.locator('.stats').first().locator('.stat', { hasText: 'سعر الدولار' })).toBeVisible();
    await expect(page.locator('section.card', { hasText: 'الأكثر مبيعاً هالشهر' })).toBeVisible();
  } finally {
    await close();
  }
});
