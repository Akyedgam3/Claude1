import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('debts section, cash-deduct switch, journal amounts and a clickable dashboard', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الديون', activity: 'تجارة عامة' });

    // دين قديم إلي على شخص جديد، مع موعد سداد فات
    await nav(page, 'الديون');
    await page.getByRole('button', { name: 'تسجيل دين لنا' }).click();
    const m = page.locator('.modal');
    await m.getByRole('button', { name: 'شخص جديد' }).click();
    await m.getByPlaceholder('الاسم').fill('أبو أحمد');
    await m.getByPlaceholder('رقم الهاتف (اختياري)').fill('0933 111 222');
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('50000');
    await m.locator('.field', { hasText: 'موعد السداد' }).locator('input').fill('2026-01-01');
    await m.getByRole('button', { name: 'تسجيل الدين', exact: true }).click();
    await toast(page, 'تم تسجيل الدين لك');

    // دين علي: استدنت مصاري من الحج محمود
    await page.getByRole('button', { name: 'تسجيل دين علينا' }).click();
    await m.getByRole('button', { name: 'شخص جديد' }).click();
    await m.getByPlaceholder('الاسم').fill('الحج محمود');
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('20000');
    await m.getByRole('button', { name: /قرض نقدي/ }).click();
    await m.getByRole('button', { name: 'تسجيل الدين', exact: true }).click();
    await toast(page, 'تم تسجيل الدين عليك');

    await expect(page.locator('.debt-stats')).toContainText('50,000.00');
    await expect(page.locator('.debt-stats')).toContainText('20,000.00');
    await expect(page.locator('.debt-stats')).toContainText('1 متأخر');
    const row = page.locator('.debt-table tr', { hasText: 'أبو أحمد' });
    await expect(row).toContainText('متأخر');
    await shot(page, '80-debts');

    // قبضت جزء: بيضل الباقي
    await row.getByRole('button', { name: 'تسجيل قبض' }).click();
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('30000');
    await expect(m).toContainText('يتبقى 20,000.00');
    await m.getByRole('button', { name: 'تسجيل القبض' }).click();
    await toast(page, 'تم قبض');
    await expect(row).toContainText('20,000.00');

    // فاتورة شراء «ما ينخصم من الصندوق» بتصير دين للمورد
    await nav(page, 'فاتورة شراء');
    await page.getByRole('button', { name: 'دون خصم (دين له)' }).click();
    await expect(page.getByText('اختر المورد في الأعلى')).toBeVisible();
    await pick(page, page.locator('.field', { hasText: 'المورد' }).locator('input').first(), 'الحج محمود');
    const line = page.locator('table.lines tbody tr').first();
    await line.locator('input.line-desc').fill('أجور نقل');
    await line.locator('input.num-input').nth(0).fill('1');
    await line.locator('input.num-input').nth(1).fill('5000');
    await shot(page, '81-purchase-credit');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    await nav(page, 'الديون');
    await page.locator('.debt-stats .stat', { hasText: 'ديون علينا للآخرين' }).click();
    await expect(page.locator('.debt-table tr', { hasText: 'الحج محمود' })).toContainText('25,000.00');
    // فاتورة الشراء الآجلة بتطلع بتفاصيل الشخص مع القرض وكشف الحساب
    const hajj = page.locator('.debt-table tr', { hasText: 'الحج محمود' });
    await expect(hajj).toContainText('1 فاتورة');
    await hajj.getByRole('button', { name: 'التفاصيل' }).click();
    const detail = page.locator('.debt-detail');
    await expect(detail).toContainText('له علينا 25,000.00');
    await expect(detail).toContainText('فاتورة شراء رقم 1');
    await expect(detail).toContainText('قرض نقدي');
    await expect(detail.locator('tfoot')).toContainText('25,000.00');
    await shot(page, '82-debt-detail');
    await page.keyboard.press('Escape');

    // الرئيسية: البطاقات بتفتح التفاصيل
    await nav(page, 'الرئيسية');
    await expect(page.locator('.week-bars')).toBeVisible();
    await page.locator('.stat', { hasText: 'ديون لنا على الناس' }).click();
    await expect(page.locator('.debt-stats')).toBeVisible();
    await nav(page, 'الرئيسية');
    await page.locator('.stat', { hasText: 'ربح الشهر' }).click();
    await expect(page.getByRole('heading', { name: 'التقارير' })).toBeVisible();
  } finally {
    await close();
  }
});
