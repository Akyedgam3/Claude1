import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';
test('شريط الفاتورة: الحالة والباقي وقبض دفعة من الفاتورة', async () => {
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
    for (const n of ['صابون غار', 'زيت زيتون 1 لتر', 'شامبو']) {
      await page.locator('.page-header button.primary').first().click();
      await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill(n);
      await m.getByRole('button', { name: 'حفظ', exact: true }).click();
      await expect(m).toHaveCount(0);
      await page.locator('tbody tr', { hasText: n }).getByRole('button', { name: '+ كمية' }).click();
      await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('20');
      await m.locator('.field', { hasText: 'تكلفة' }).locator('input').fill('3000');
      await m.getByRole('button', { name: 'إضافة' }).click();
      await toast(page, 'تمت إضافة');
    }
    await nav(page, 'فاتورة مبيع');
    await pick(page, page.locator('.field', { hasText: 'العميل' }).locator('input').first(), 'أبو خالد');
    const rows = page.locator('table.lines tbody tr');
    for (const [i, [n, q, p]] of ([['صابون غار', '3', '4500'], ['زيت زيتون', '2', '12000'], ['شامبو', '1', '8000']] as const).entries()) {
      await pick(page, rows.nth(i).locator('.with-button input').first(), n);
      await rows.nth(i).locator('.qty-cell input').fill(q);
      await rows.nth(i).locator('input.num-input').nth(1).fill(p);
    }
    await page.getByRole('button', { name: 'دون قبض' }).click().catch(() => {});
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    const bar = page.locator('.invoice-info');
    await expect(bar.locator('.inv-status')).toHaveText(/آجل/);
    await expect(bar).toContainText('45,500');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
    // قبض دفعة من الفاتورة نفسها
    await bar.getByRole('button', { name: 'قبض دفعة' }).click();
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('20000');
    await m.getByRole('button', { name: /تسجيل|قبض|حفظ/ }).last().click();
    await expect(bar.locator('.inv-status')).toHaveText(/جزء/);
    await expect(bar).toContainText('25,500');
    // قبض الباقي: الحالة «مدفوعة بالكامل» وختم الفاتورة المطبوعة بيتغيّر
    await bar.getByRole('button', { name: 'قبض دفعة' }).click();
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('25500');
    await m.getByRole('button', { name: /تسجيل|قبض|حفظ/ }).last().click();
    await expect(bar.locator('.inv-status')).toHaveText(/مدفوعة بالكامل/);
    await expect(bar.getByRole('button', { name: 'قبض دفعة' })).toHaveCount(0);
    // السابقة/التالية (فاتورة وحدة: الاتنين معطّلين)
    await expect(bar.getByRole('button', { name: /السابقة/ })).toBeDisabled();
  } finally {
    await close();
  }
});
