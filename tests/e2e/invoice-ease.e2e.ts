import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// الفاتورة أسهل: آخر سعر للزبون، تكرار آخر فاتورة، نفس المادة بتزيد الكمية، والمؤشر بيروح عالكمية
test('الفاتورة: كرّر آخر فاتورة، آخر سعر للزبون، ونفس المادة بتزيد كميتها', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الفواتير', activity: 'تجارة عامة' });
    const m = page.locator('.modal');

    await nav(page, 'العملاء والموردون');
    await page.getByRole('button', { name: 'إضافة', exact: true }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('أبو خالد');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    await nav(page, 'المواد');
    await page.locator('.page-header button.primary').first().click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('صابون');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(m).toHaveCount(0);
    await page.locator('tbody tr', { hasText: 'صابون' }).getByRole('button', { name: '+ كمية' }).click();
    await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('20');
    await m.getByRole('button', { name: 'إضافة' }).click();
    await toast(page, 'تمت إضافة 20');

    const party = () => page.locator('.field', { hasText: 'العميل' }).locator('input').first();
    const lineItem = (i: number) => page.locator('table.lines tbody tr').nth(i).locator('.with-button input').first();

    // أول فاتورة: 2 بـ 1200
    await nav(page, 'فاتورة مبيع');
    await pick(page, party(), 'أبو خالد');
    await pick(page, lineItem(0), 'صابون');
    // المؤشر صار عالكمية
    await expect(page.locator('table.lines tbody tr').first().locator('.qty-cell input')).toBeFocused();
    await page.keyboard.type('2');
    await page.locator('table.lines tbody tr').first().locator('input.num-input').nth(1).fill('1200');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');

    // فاتورة جديدة لنفس الزبون: كرّر آخر فاتورة
    await nav(page, 'فاتورة مبيع');
    await pick(page, party(), 'أبو خالد');
    await page.getByRole('button', { name: /كرّر آخر فاتورة/ }).click();
    const first = page.locator('table.lines tbody tr').first();
    await expect(first).toContainText('صابون');
    await expect(first.locator('.qty-cell input')).toHaveValue('2');
    // نفس المادة بسطر جديد: بتزيد الكمية بدل سطر تاني
    await pick(page, lineItem(1), 'صابون');
    await toast(page, 'زادت كمية');
    await expect(first.locator('.qty-cell input')).toHaveValue('3');
    await expect(page.locator('table.lines tbody tr', { hasText: 'صابون' })).toHaveCount(1);
    // آخر سعر لهالزبون: 1200 بكبسة
    await first.locator('.last-price').click();
    await expect(first.locator('input.num-input').nth(1)).toHaveValue(/^1,?200/);
    // بعد ما تغيّر السعر: نفس المادة بتنضاف بسطر تاني (بسعرها العادي) بدل ما تنجمع
    await pick(page, lineItem(1), 'صابون');
    await expect(page.locator('table.lines tbody tr', { hasText: 'صابون' })).toHaveCount(2);
    await expect(first.locator('.qty-cell input')).toHaveValue('3');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  } finally {
    await close();
  }
});
