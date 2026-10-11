import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('tailor: measurements, order with deposit, delivery invoice, and free customization', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'خياطة الأناقة', activity: 'خياطة وتفصيل' });
    await expect(page.locator('.sidebar nav')).toContainText('طلبات التفصيل');
    await shot(page, '20-dashboard-tailor');
    const m = page.locator('.modal');

    // زبون مع قياساته
    await nav(page, 'العملاء والموردون');
    await page.getByRole('button', { name: 'إضافة' }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('أبو سامر');
    await m.locator('.measure', { hasText: 'الكتف' }).locator('input').fill('46');
    await m.locator('.measure', { hasText: 'الصدر' }).locator('input').fill('104');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    // طلب تفصيل: القياسات تُنسخ من ملف الزبون
    await nav(page, 'طلبات التفصيل');
    await page.getByRole('button', { name: 'طلب تفصيل جديد' }).click();
    await pick(page, page.locator('.field', { hasText: 'الزبون' }).locator('.picker input'), 'سامر');
    await expect(page.locator('.measure', { hasText: 'الكتف' }).locator('input')).toHaveValue('46');
    const g = page.locator('table.lines').first().locator('tbody tr').first();
    await g.locator('input').nth(0).fill('بدلة رجالية');
    await g.locator('input').nth(2).fill('500000');
    await page.locator('.page-header').getByRole('button', { name: 'حفظ' }).click();
    await toast(page, /تم حفظ الطلب رقم 1/);

    // عربون ثم تسليم
    await page.getByRole('button', { name: 'قبض عربون' }).click();
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('200000');
    await m.getByRole('button', { name: 'قبض', exact: true }).click();
    await toast(page, 'تم قبض العربون');
    await expect(page.locator('.totals-bar')).toContainText('300,000.00');
    await shot(page, '21-tailor-order');

    await page.getByRole('button', { name: 'تسليم وفوترة' }).click();
    await m.getByRole('button', { name: 'تسليم وإصدار الفاتورة' }).click();
    await toast(page, /تم التسليم/);
    await expect(page.locator('.invoice-doc').first()).toContainText('خياطة بدلة رجالية');

    // رصيد الزبون صفر بعد احتساب العربون
    await nav(page, 'العملاء والموردون');
    await page.getByRole('cell', { name: 'أبو سامر' }).click();
    await expect(page.locator('.panel .kv')).toContainText('0');
    await expect(page.locator('.panel')).toContainText('طلب 1 · مسلّم');

    // الحرية: تشغيل المواعيد لمحل الخياطة وإضافة تصنيف خاص
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'تخصيص النشاط' }).click();
    await page.locator('.feature-toggle', { hasText: 'المواعيد' }).click();
    await page.locator('.card', { hasText: 'تصنيفات المواد' }).locator('input').fill('عبايات خليجية');
    await page.locator('.card', { hasText: 'تصنيفات المواد' }).locator('input').press('Enter');
    await shot(page, '22-customize');
    await page.getByRole('button', { name: 'حفظ التخصيص' }).click();
    await toast(page, 'تم حفظ التخصيص');
    await expect(page.locator('.sidebar nav')).toContainText('المواعيد');
  } finally {
    await close();
  }
});
