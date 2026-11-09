import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// محل بيستعمل البرنامج نقطة بيع بس: بيزيد المخزون بدون فواتير شراء
test('إضافة بضاعة بدون فاتورة شراء: من شاشة المخزون ومن زر «+ كمية»', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل نقطة بيع', activity: 'تجارة عامة' });

    // مادة جديدة برصيد صفر
    await nav(page, 'المواد');
    await page.locator('.page-header button.primary').first().click();
    const f = page.locator('.modal');
    await f.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('شامبو');
    await f.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(f).toHaveCount(0);
    const row = page.locator('tbody tr', { hasText: 'شامبو' });
    await expect(row).toBeVisible();

    // زر «+ كمية»
    await row.getByRole('button', { name: '+ كمية' }).click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('12');
    await m.locator('.field', { hasText: 'تكلفة الوحدة' }).locator('input').fill('5000');
    await m.getByRole('button', { name: 'إضافة' }).click();
    await toast(page, 'تمت إضافة 12');
    await expect(row).toContainText('12');

    // تبويب «إضافة بضاعة» بالمخزون (بدون تكلفة: بتاخد آخر تكلفة)
    await nav(page, 'الجرد وعمليات المخزون');
    await expect(page.getByRole('button', { name: 'إضافة بضاعة' })).toBeVisible();
    await page.getByRole('button', { name: 'إضافة بضاعة' }).click();
    await pick(page, page.locator('input[placeholder="+ أضف مادة"]'), 'شامبو');
    const line = page.locator('table.lines tbody tr').first();
    await line.locator('input.num-input').nth(0).fill('8');
    await line.locator('input.num-input').nth(1).fill('');
    await page.getByRole('button', { name: 'إضافة للمخزون' }).click();
    await toast(page, 'تمت إضافة 1 مادة');

    // عمود التكلفة: متوسط أو آخر سعر شراء (زيادة 4 قطع بـ 9000 فوق 20 بـ 5000)
    await page.getByRole('button', { name: 'إضافة بضاعة' }).click();
    await pick(page, page.locator('input[placeholder="+ أضف مادة"]'), 'شامبو');
    const l2 = page.locator('table.lines tbody tr').first();
    await l2.locator('input.num-input').nth(0).fill('4');
    await l2.locator('input.num-input').nth(1).fill('9000');
    await page.getByRole('button', { name: 'إضافة للمخزون' }).click();
    await toast(page, 'تمت إضافة 1 مادة');
    await nav(page, 'المواد');
    const sh = page.locator('tbody tr', { hasText: 'شامبو' });
    await expect(sh).toContainText('24');
    await expect(sh).toContainText('5,666.67');
    await page.getByRole('button', { name: /متوسط التكلفة/ }).click();
    await expect(sh).toContainText('9,000');
    await page.getByRole('button', { name: /آخر سعر شراء/ }).click();
    await expect(sh).toContainText('5,666.67');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  } finally {
    await close();
  }
});
