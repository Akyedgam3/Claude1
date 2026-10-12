import { expect, test } from '@playwright/test';
import { activate, launch, nav, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('restaurant: demo data, order with notes and service, kitchen screen, close bill', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'مطعم' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('مطعم الشام');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();

    await nav(page, 'الطاولات والطلبات');
    await expect(page.locator('.table-card')).toHaveCount(16); // 15 طاولة + طلب توصيل
    await shot(page, '30-restaurant-tables');

    // طاولة فاضية: طلب جديد مع ملاحظة وخدمة
    await page.locator('.table-card', { hasText: 'طاولة 6' }).click();
    await page.locator('.pos-item', { hasText: 'شيش طاووق' }).click();
    await page.locator('.pos-item', { hasText: 'شيش طاووق' }).click();
    await page.locator('.quick-notes button', { hasText: 'حار' }).click();
    await page.locator('.pos-item', { hasText: 'كولا' }).click();
    await page.locator('.pos-totals input').first().fill('10');
    await expect(page.locator('.pos-totals .grand').last()).toContainText('1,518.00'); // (1300 + 80) + 10%
    await page.getByRole('button', { name: /إرسال للمطبخ/ }).click();
    await toast(page, 'تم الإرسال للمطبخ');
    await page.getByRole('button', { name: /رجوع/ }).click();

    // شاشة المطبخ: الطلب ظاهر، ونعلّمه جاهز
    await nav(page, 'شاشة المطبخ');
    const card = page.locator('.kitchen-card', { hasText: 'طاولة 6' });
    await expect(card).toContainText('حار');
    await shot(page, '31-kitchen');
    await card.getByRole('button', { name: /الطلب كله جاهز/ }).click();
    await expect(page.locator('.kitchen-card.ready', { hasText: 'طاولة 6' })).toBeVisible();

    // الحساب
    await nav(page, 'الطاولات والطلبات');
    const t6 = page.locator('.table-card', { hasText: 'طاولة 6' });
    await expect(t6).toContainText('جاهز للتقديم');
    await t6.click();
    await page.getByRole('button', { name: 'الحساب وإغلاق الطلب' }).click();
    await expect(page.locator('.table-card', { hasText: 'طاولة 6' })).toContainText('فاضية');

    // نقل طلب لطاولة تانية
    await page.locator('.table-card', { hasText: 'طاولة 2' }).click();
    await page.getByRole('button', { name: 'نقل' }).click();
    await page.locator('.modal .table-card', { hasText: 'طاولة 7' }).click();
    await toast(page, 'انتقل الطلب إلى طاولة 7');
  } finally {
    await close();
  }
});
