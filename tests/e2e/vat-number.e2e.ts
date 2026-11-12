import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// الرقم الضريبي للمحل (من الإعدادات) وللزبون (من بطاقته): بينطبعوا على الفاتورة
test('الرقم الضريبي للمحل وللزبون على الفاتورة', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الضريبة', activity: 'تجارة عامة' });
    await nav(page, 'الإعدادات');
    await page.locator('.field', { hasText: 'الرقم الضريبي' }).locator('input').fill('300123456700003');
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, 'تم الحفظ');
    const m = page.locator('.modal');
    await nav(page, 'العملاء والموردون');
    await page.getByRole('button', { name: 'إضافة', exact: true }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('شركة النور');
    await m.locator('.field', { hasText: 'الرقم الضريبي' }).locator('input').fill('311999888');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');
    await nav(page, 'المواد');
    await page.locator('.page-header button.primary').first().click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('صابون غار');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(m).toHaveCount(0);
    await page.locator('tbody tr', { hasText: 'صابون غار' }).getByRole('button', { name: '+ كمية' }).click();
    await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('10');
    await m.locator('.field', { hasText: 'تكلفة' }).locator('input').fill('3000');
    await m.getByRole('button', { name: 'إضافة' }).click();
    await toast(page, 'تمت إضافة');
    await nav(page, 'فاتورة مبيع');
    await pick(page, page.locator('.field', { hasText: 'العميل' }).locator('input').first(), 'شركة النور');
    const row = page.locator('table.lines tbody tr').first();
    await pick(page, row.locator('.with-button input').first(), 'صابون غار');
    await row.locator('input.num-input').nth(1).fill('5000');
    await page.getByRole('button', { name: 'دون قبض' }).click().catch(() => {});
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    const doc = page.locator('.invoice-doc');
    await expect(doc).toContainText('الرقم الضريبي: 300123456700003');
    await expect(doc.locator('.doc-card.party')).toContainText('311999888');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  } finally {
    await close();
  }
});
