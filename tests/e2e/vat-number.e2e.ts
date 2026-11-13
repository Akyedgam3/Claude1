import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// الرقم الضريبي تبع المحل (من الإعدادات): ثابت على فاتورة المبيع والشراء، وعلى الإيصال الحراري.
// والإيصال الحراري 80mm ما بينقص منه شي من الطرف حتى مع أسعار بالآلاف.
test('الرقم الضريبي للمحل على الفواتير، والإيصال الحراري كامل', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مركز أبو أمير', activity: 'تجارة عامة' });
    await nav(page, 'الإعدادات');
    await page.locator('.field', { hasText: 'الرقم الضريبي' }).locator('input').fill('03310090718');
    await page.locator('.field', { hasText: 'السجل التجاري' }).locator('input').fill('55667');
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, 'تم الحفظ');
    const m = page.locator('.modal');
    await nav(page, 'المواد');
    const items = ['بسكوت 1000 ق12', 'طحينة 400غ هشام', 'شاي 25 ظرف هشام', 'كابتشينو'];
    for (const n of items) {
      await page.locator('.page-header button.primary').first().click();
      await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill(n);
      await m.getByRole('button', { name: 'حفظ', exact: true }).click();
      await expect(m).toHaveCount(0);
      await page.locator('tbody tr', { hasText: n }).getByRole('button', { name: '+ كمية' }).click();
      await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('100');
      await m.locator('.field', { hasText: 'تكلفة' }).locator('input').fill('300');
      await m.getByRole('button', { name: 'إضافة' }).click();
      await toast(page, 'تمت إضافة');
    }
    // فاتورة المبيع: الرقم الضريبي ثابت بخانة للعرض بس
    await nav(page, 'فاتورة مبيع');
    await expect(page.locator('.field', { hasText: 'الرقم الضريبي' }).locator('input')).toHaveValue('03310090718');
    const rows = page.locator('table.lines tbody tr');
    for (const [i, [n, q, p]] of ([[items[0], '16', '600'], [items[1], '13', '1277'], [items[2], '15', '108'], [items[3], '1', '500']] as const).entries()) {
      await pick(page, rows.nth(i).locator('.with-button input').first(), n!);
      await rows.nth(i).locator('.qty-cell input').fill(q);
      await rows.nth(i).locator('input.num-input').nth(1).fill(p);
    }
    await page.getByRole('button', { name: /قبض كامل/ }).click();
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    await expect(page.locator('.invoice-doc')).toContainText('الرقم الضريبي: 03310090718');
    await expect(page.locator('.invoice-doc')).toContainText('السجل التجاري: 55667');
    // الإيصال الحراري كأنه عم ينطبع على 80mm
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => (document.body.dataset['paper'] = '80mm'));
    const t = page.locator('.thermal-doc');
    await expect(t).toContainText('الرقم الضريبي: 03310090718');
    await expect(t).toContainText('السجل التجاري: 55667'); // أي رقم انكتب بالإعدادات بينطبع عالإيصال
    const fit = await t.evaluate((doc) => {
      const box = doc.getBoundingClientRect();
      const mm = box.width / (96 / 25.4);
      const cut = [...doc.querySelectorAll('td, th, .t-totals strong')].filter((el) => el.scrollWidth > (el as HTMLElement).clientWidth + 1 || el.getBoundingClientRect().left < box.left - 0.5);
      return { mm, cut: cut.map((c) => c.textContent) };
    });
    expect(fit.mm).toBeLessThanOrEqual(72.5);
    expect(fit.cut).toEqual([]);
    if (process.env.SHOT) await t.screenshot({ path: process.env.SHOT });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => delete document.body.dataset['paper']);
    // فاتورة الشراء كمان عليها رقم المحل
    await nav(page, 'فاتورة شراء');
    await expect(page.locator('.field', { hasText: 'الرقم الضريبي' }).locator('input')).toHaveValue('03310090718');
  } finally {
    await close();
  }
});
