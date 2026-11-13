import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// الغذائيات: كل صنف إلو خيارات (الماركة، الحجم، الوزن، اللون، النكهة) ببطاقته، وبتتغيّر بالفاتورة، وبتنطبع تحت اسمه.
test('خيارات الصنف (الحجم واللون والوزن) بالفاتورة', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'سوبرماركت الخيارات', activity: 'سوبرماركت' });
    const m = page.locator('.modal');
    await nav(page, 'المواد');
    await page.locator('.page-header button.primary').first().click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('عصير برتقال');
    await m.locator('.field', { hasText: 'الحجم' }).locator('input').fill('وسط');
    await m.locator('.field', { hasText: 'الوزن' }).locator('input').fill('1 كغ');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(m).toHaveCount(0);
    await page.locator('tbody tr', { hasText: 'عصير برتقال' }).getByRole('button', { name: '+ كمية' }).click();
    await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('20');
    await m.locator('.field', { hasText: 'تكلفة' }).locator('input').fill('3000');
    await m.getByRole('button', { name: 'إضافة' }).click();
    await toast(page, 'تمت إضافة');

    await nav(page, 'فاتورة مبيع');
    const row = page.locator('table.lines tbody tr').first();
    await pick(page, row.locator('.with-button input').first(), 'عصير برتقال');
    const opts = row.locator('.line-attrs');
    await expect(opts.locator('label', { hasText: 'الحجم' }).locator('input')).toHaveValue('وسط');
    await expect(opts.locator('label', { hasText: 'الوزن' }).locator('input')).toHaveValue('1 كغ');
    // لهالبيعة: حجم كبير ولون أحمر
    await opts.locator('label', { hasText: 'الحجم' }).locator('input').fill('كبير');
    await opts.locator('label', { hasText: 'اللون' }).locator('input').fill('برتقالي');
    await row.locator('input.num-input').nth(1).fill('5000');
    await page.getByRole('button', { name: /قبض كامل/ }).click();
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-editor.png') });
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    const doc = page.locator('.invoice-doc');
    await expect(doc).toContainText('الحجم: كبير');
    await expect(doc).toContainText('الوزن: 1 كغ');
    await expect(doc).toContainText('اللون: برتقالي');
    // الإيصال الحراري كمان
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => (document.body.dataset['paper'] = '80mm'));
    await expect(page.locator('.thermal-doc')).toContainText('الحجم: كبير');
    if (process.env.SHOT) await page.locator('.thermal-doc').screenshot({ path: process.env.SHOT.replace('.png', '-receipt.png') });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => delete document.body.dataset['paper']);
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  } finally {
    await close();
  }
});
