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

    await page.getByRole('button', { name: /تخصيص الشاشة/ }).click();
    const m = page.locator('.modal');
    // الأزرار السريعة: شيل «عرض سعر» وضيف «إضافة بضاعة» و«المواد»
    await m.locator('li', { hasText: 'عرض سعر' }).locator('input').uncheck();
    await m.locator('.dash-more summary').click();
    await m.locator('li', { hasText: 'إضافة بضاعة' }).locator('input').check();
    await m.locator('label.check').filter({ hasText: /^\s*المواد\s*$/ }).locator('input').check();
    await m.getByRole('button', { name: 'الإحصائيات' }).click();
    // إخفاء «سعر الدولار»، إضافة «مبيعات مبارح» و«قيمة البضاعة»، ونقل «مبيعات مبارح» لفوق
    await m.locator('li', { hasText: 'سعر الدولار' }).locator('input').uncheck();
    await m.locator('li', { hasText: 'مبيعات مبارح' }).locator('input').check();
    await m.locator('li', { hasText: 'قيمة البضاعة' }).locator('input').check();
    const up = m.locator('li', { hasText: 'مبيعات مبارح' }).getByRole('button', { name: 'لفوق' });
    while (await up.isEnabled()) await up.click();
    // إخفاء بطاقة «الأكثر مبيعاً»
    await m.getByRole('button', { name: 'البطاقات' }).click();
    await m.locator('li', { hasText: 'الأكثر مبيعاً هالشهر' }).locator('input').uncheck();
    await m.getByRole('button', { name: 'تم' }).click();

    await expect(stats.locator('.stat', { hasText: 'سعر الدولار' })).toHaveCount(0);
    await expect(stats.locator('.stat').first()).toContainText('مبيعات مبارح');
    await expect(stats.locator('.stat', { hasText: 'قيمة البضاعة بالمستودع' })).toBeVisible();
    await expect(page.locator('section.card', { hasText: 'الأكثر مبيعاً هالشهر' })).toHaveCount(0);
    const qa = page.locator('.quick-actions');
    await expect(qa.getByRole('button', { name: 'عرض سعر' })).toHaveCount(0);
    await expect(qa.getByRole('button', { name: 'المواد', exact: true })).toBeVisible();
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    await qa.getByRole('button', { name: 'إضافة بضاعة' }).click();
    await expect(page.getByRole('button', { name: 'إضافة للمخزون' })).toBeVisible();
    await page.locator('.sidebar nav button', { hasText: 'الرئيسية' }).first().click();

    // بعد إعادة التحميل التخصيص بيضل
    await page.reload();
    await page.waitForTimeout(500);
    if (await page.locator('.lock-screen, .login').count()) test.skip(true, 'شاشة قفل بعد إعادة التحميل');
    await expect(page.locator('.stats').first().locator('.stat').first()).toContainText('مبيعات مبارح', { timeout: 15000 });

    // رجّع الافتراضي
    await expect(page.locator('.quick-actions').getByRole('button', { name: 'إضافة بضاعة' })).toBeVisible();
    await page.getByRole('button', { name: /تخصيص الشاشة/ }).click();
    await page.locator('.modal').getByRole('button', { name: 'رجّع الافتراضي' }).click();
    await page.locator('.modal').getByRole('button', { name: 'تم' }).click();
    await expect(page.locator('.stats').first().locator('.stat', { hasText: 'سعر الدولار' })).toBeVisible();
    await expect(page.locator('section.card', { hasText: 'الأكثر مبيعاً هالشهر' })).toBeVisible();
    await expect(page.locator('.quick-actions').getByRole('button', { name: 'عرض سعر' })).toBeVisible();
  } finally {
    await close();
  }
});
