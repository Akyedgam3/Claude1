import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// مراقبة المواد + كشف الحساب + الصندوق (مع التصفير)
test('مراقبة المواد وكشف الحساب والصندوق وتصفيره', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل المراقبة', activity: 'تجارة عامة' });

    // مادة برصيد 10 وتكلفة 5000
    await nav(page, 'المواد');
    await page.locator('.page-header button.primary').first().click();
    const f = page.locator('.modal');
    await f.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('زيت محرك');
    await f.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(f).toHaveCount(0);
    await page.locator('tbody tr', { hasText: 'زيت محرك' }).getByRole('button', { name: '+ كمية' }).click();
    await page.locator('.modal .field', { hasText: 'الكمية المضافة' }).locator('input').fill('10');
    await page.locator('.modal .field', { hasText: 'تكلفة الوحدة' }).locator('input').fill('5000');
    await page.locator('.modal').getByRole('button', { name: 'إضافة' }).click();
    await toast(page, 'تمت إضافة 10');

    // بيعة 2 بـ 8000 نقداً
    await nav(page, 'فاتورة مبيع');
    await pick(page, page.locator('table.lines tbody tr').first().locator('.with-button input').first(), 'زيت محرك');
    const line = page.locator('table.lines tbody tr').first();
    await line.locator('input.num-input').nth(0).fill('2');
    await line.locator('input.num-input').nth(1).fill('8000');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');

    // مراقبة المواد: الربح 2 × (8000 − 5000)
    await nav(page, 'مراقبة المواد');
    const row = page.locator('table.item-watch tbody tr', { hasText: 'زيت محرك' });
    await expect(row).toContainText('6,000');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-1.png') });
    await row.click();
    const moves = page.locator('.print-area tbody tr');
    await expect(moves.filter({ hasText: 'فاتورة مبيع' })).toContainText('8');
    await expect(page.locator('.print-area tfoot')).toContainText('8');

    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-2.png') });
    // كشف الحساب: حساب الصندوق فيه الفاتورة
    await nav(page, 'كشف الحساب');
    await page.getByRole('button', { name: /حساب \(صندوق/ }).click();
    await page.locator('.statement-target select').selectOption('1101');
    await expect(page.locator('table.statement')).toContainText('فاتورة مبيع #1');
    await expect(page.locator('table.statement tfoot')).toContainText('16,000');

    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-3.png') });
    // الصندوق: الرصيد 16,000 وتصفيره (سحب للمالك)
    await nav(page, 'الصندوق');
    await expect(page.locator('.cash-card').first()).toContainText('16,000');
    await page.getByRole('button', { name: /تصفير الصندوق/ }).click();
    const z = page.locator('.modal');
    await z.locator('.field', { hasText: 'لوين' }).waitFor();
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-4.png') });
    await expect(z).toContainText('16,000');
    await z.locator('.field', { hasText: 'لوين' }).locator('select').selectOption('owner');
    await z.getByRole('button', { name: 'تصفير', exact: true }).click();
    await toast(page, 'تم: طلع');
    await expect(page.locator('.cash-card').first().locator('.cash-line b').first()).toHaveText(/^0\.00/);
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  } finally {
    await close();
  }
});
