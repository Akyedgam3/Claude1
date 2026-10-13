import { expect, test } from '@playwright/test';
import { activate, launch, nav, pick, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('phone shop: IMEI scan in POS, device history, installments and trade-in', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'موبايلات' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('موبايلات النجمة');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();
    const m = page.locator('.modal');

    // الرئيسية فيها عدادات التقسيط
    await expect(page.locator('.stat', { hasText: 'أقساط متأخرة' })).toBeVisible();

    // سجل الأجهزة: نلاقي جهاز بالمخزون ونفتح قصته
    await nav(page, 'سجل الأجهزة');
    const first = page.locator('table.table tbody tr', { hasText: 'Galaxy A15' }).first();
    const imei = (await first.locator('td').first().innerText()).trim();
    await first.click();
    await expect(page.locator('.device-card')).toContainText('بالمخزون');
    await expect(page.locator('.device-card')).toContainText('الوكيل الدولي');
    await shot(page, '50-device-history');

    // البيع بمسح الـ IMEI بنقطة البيع
    await nav(page, 'نقطة البيع');
    await page.locator('.scan-input').fill(imei);
    await page.locator('.scan-input').press('Enter');
    await expect(page.locator('.pos-cart input.mono').first()).toHaveValue(imei);
    await page.getByRole('button', { name: 'دفع نقداً' }).click();
    await toast(page, /تم/);
    await nav(page, 'سجل الأجهزة');
    await page.locator('.imei-search input').fill(imei);
    await page.locator('.imei-search input').press('Enter');
    await expect(page.locator('.device-card')).toContainText('بالكفالة');

    // التقسيط: الخطة التجريبية فيها قسط متأخر، منقبض قسط
    await nav(page, 'التقسيط');
    await page.locator('table.table tbody tr', { hasText: 'أبو علي' }).click();
    await expect(page.locator('.installments-table').first()).toContainText('متأخر');
    await shot(page, '51-installments');
    await page.getByRole('button', { name: 'قبض', exact: true }).click();
    await toast(page, 'تم قبض القسط');

    // بيع مع استبدال
    await nav(page, 'بيع مع استبدال');
    await pick(page, page.locator('.card .field', { hasText: 'الزبون' }).locator('.picker input'), 'رنا');
    await pick(page, page.locator('.trade-new .picker input'), 'Redmi');
    await page.locator('.trade-new select').selectOption({ index: 1 });
    await page.locator('.trade-old .field', { hasText: 'الموديل' }).locator('input').fill('Samsung A12 مستعمل');
    await page.locator('.trade-old .field', { hasText: 'IMEI' }).locator('input').fill('354111222333444');
    await page.locator('.trade-old .field', { hasText: 'البطارية' }).locator('input').fill('80');
    await page.locator('.trade-old .field', { hasText: 'سعر الشراء' }).locator('input').fill('8000');
    await shot(page, '52-trade-in');
    await page.getByRole('button', { name: 'تنفيذ الاستبدال' }).click();
    await toast(page, /فاتورة مبيع .* وفاتورة شراء/);
    await expect(page.locator('.invoice-doc').first()).toContainText('Redmi');

    // الجهاز المستعمل صار بالمخزون
    await nav(page, 'سجل الأجهزة');
    await page.locator('.imei-search input').fill('354111222333444');
    await page.locator('.imei-search input').press('Enter');
    await expect(page.locator('.device-card')).toContainText('بالمخزون');
    void m;
  } finally {
    await close();
  }
});
