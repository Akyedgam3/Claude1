import path from 'node:path';
import { expect, test } from '@playwright/test';
import { activate, launch, nav, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('restaurant: receipt designer, thermal receipt, customer display and live board', async () => {
  const { app, page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'مطعم' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('مطعم وينغز');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();

    // تصميم الإيصال: شعار كبير، جدول بخطوط، رقم للاستفسار ورسالة شكر — والمعاينة بتتغير مباشرة
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الإيصال وشاشة الزبون' }).click();
    await page.locator('.receipt-designer input[type=file]').setInputFiles(path.resolve('src/renderer/src/assets/logo.png'));
    await page.locator('.field', { hasText: 'حجم الشعار' }).locator('select').selectOption('banner');
    await page.getByText('جدول بخطوط').click();
    await page.locator('.field', { hasText: 'نص قبل رقم التواصل' }).locator('input').fill('للتوصيات والاستفسار');
    await page.getByRole('textbox', { name: 'رقم التواصل', exact: true }).fill('0933 123 456');
    await page.locator('.field', { hasText: 'رسالة الشكر' }).locator('input').fill('نشكر لكم زيارتكم');
    await page.locator('.field', { hasText: 'رسالة الترحيب' }).locator('input').fill('أهلاً فيكم بوينغز');
    const preview = page.locator('.thermal-preview .thermal-doc');
    await expect(preview).toContainText('للتوصيات والاستفسار');
    await expect(preview).toContainText('طاولة 13');
    await expect(preview.locator('.t-logo.banner img')).toBeVisible();
    await expect(preview).toHaveClass(/t-grid/);
    await page.getByText('اسم الكابتن').click(); // نخفي الكابتن
    await expect(preview).not.toContainText('أبو سمير');
    await shot(page, '60-receipt-designer');
    await page.getByRole('button', { name: 'حفظ التصميم' }).click();
    await toast(page, 'تم حفظ تصميم الإيصال');

    // شاشة الزبون: بتنفتح بنافذة تانية وبتعرض الطلب والمبلغ
    await nav(page, 'الطاولات والطلبات');
    await page.locator('.table-card', { hasText: 'طاولة 6' }).click();
    const [display] = await Promise.all([app.waitForEvent('window'), page.getByRole('button', { name: 'شاشة الزبون' }).click()]);
    await display.waitForLoadState();
    await expect(display.locator('.cd-welcome')).toContainText('أهلاً فيكم بوينغز');
    await page.locator('.pos-item', { hasText: 'شيش طاووق' }).click();
    await page.locator('.pos-item', { hasText: 'شيش طاووق' }).click();
    await page.locator('.pos-item', { hasText: 'كولا' }).click();
    await page.locator('.order-info label', { hasText: 'الكابتن' }).locator('input').fill('أبو سمير');
    await expect(display.locator('.cd-line')).toHaveCount(2);
    await expect(display.locator('.cd-line').first()).toContainText('شيش طاووق');
    await expect(display.locator('.cd-sum .grand')).toContainText('1,380.00');
    await display.setViewportSize({ width: 1280, height: 720 });
    await display.screenshot({ path: 'test-results/screens/61-customer-display.png' });

    // الدفع: شاشة الزبون بتقول شكراً، والإيصال الحراري فيه الطاولة والرقم والنص
    await page.locator('.kv input.num-input').last().fill('2000');
    await expect(display.locator('.cd-sum .change')).toContainText('620.00');
    await page.getByRole('button', { name: 'الحساب وإغلاق الطلب' }).click();
    await expect(display.locator('.cd-thanks')).toContainText('شكراً لزيارتكم');
    await display.screenshot({ path: 'test-results/screens/62-customer-thanks.png' });
    // الطلب تسكّر ورجعنا للطاولات؛ منفتح الفاتورة من السجل ومنفحص نسختها الحرارية
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    const receipt = page.locator('.paper-preview .thermal-doc').first();
    await expect(receipt).toContainText('طاولة 6');
    await expect(receipt).toContainText('للتوصيات والاستفسار');
    await expect(receipt).toContainText('0933 123 456');
    await expect(receipt).toContainText('نشكر لكم زيارتكم');
    await expect(receipt).not.toContainText('الكابتن');
    // نطبع على ورق حراري: الإيصال الحراري بيظهر والفاتورة الكاملة بتختفي
    await page.evaluate(() => (document.body.dataset['paper'] = '80mm'));
    await page.emulateMedia({ media: 'print' });
    await expect(receipt).toBeVisible();
    await expect(page.locator('.paper-preview .invoice-doc.has-thermal').first()).toBeHidden();
    await page.setViewportSize({ width: 302, height: 900 });
    await page.screenshot({ path: 'test-results/screens/63-thermal-receipt.png', fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => delete document.body.dataset['paper']);
    await page.setViewportSize({ width: 1366, height: 860 });

    // لوحة الإدارة المباشرة
    await nav(page, 'لوحة الإدارة المباشرة');
    await expect(page.locator('.live-kpis .kpi.big')).toContainText('فاتورة');
    await expect(page.locator('.live-top')).toContainText('شيش طاووق');
    await expect(page.locator('.live-people').first()).toContainText('الكابتن: أبو سمير');
    await shot(page, '64-live-board');
  } finally {
    await close();
  }
});
