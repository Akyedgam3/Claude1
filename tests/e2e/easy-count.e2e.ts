import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// الجرد السهل: بالمسح (كل مسحة بتنعد)، زر «مطابق»، فلترة، والمسودة بتنحفظ لحالها
test('الجرد السهل: مسح الباركود بيعد، مطابق، والجرد بيكمّل بعد إعادة التحميل', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الجرد', activity: 'تجارة عامة' });

    await nav(page, 'المواد');
    for (const [name, bc] of [['عصير', '6290000000011'], ['بسكويت', '6290000000028']] as const) {
      await page.locator('.page-header button.primary').first().click();
      const f = page.locator('.modal');
      await f.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill(name);
      await f.locator('.field', { hasText: 'الباركود' }).first().locator('input').fill(bc);
      await f.getByRole('button', { name: 'حفظ', exact: true }).click();
      await expect(f).toHaveCount(0);
      const row = page.locator('tbody tr', { hasText: name });
      await row.getByRole('button', { name: '+ كمية' }).click();
      await page.locator('.modal .field', { hasText: 'الكمية المضافة' }).locator('input').fill('10');
      await page.locator('.modal').getByRole('button', { name: 'إضافة' }).click();
      await toast(page, 'تمت إضافة 10');
    }

    await nav(page, 'الجرد وعمليات المخزون');
    await page.getByRole('button', { name: 'الجرد', exact: true }).click();
    const scan = page.locator('.count-scan input.scan-input');
    for (let k = 0; k < 3; k++) {
      await scan.fill('6290000000011');
      await scan.press('Enter');
    }
    await expect(page.locator('.count-last')).toContainText('عصير');
    await expect(page.locator('.count-last')).toContainText('المعدود: 3');
    await expect(page.locator('.count-summary')).toContainText('انجرد: 1');

    // بعد إعادة التحميل الجرد بيرجع
    await page.reload();
    await page.waitForTimeout(500);
    if (await page.locator('.lock-screen, .login').count()) test.skip(true, 'شاشة قفل بعد إعادة التحميل');
    await nav(page, 'الجرد وعمليات المخزون');
    await page.getByRole('button', { name: 'الجرد', exact: true }).click();
    await expect(page.locator('.count-restored')).toBeVisible();

    // بسكويت مطابق
    await page.locator('tbody tr', { hasText: 'بسكويت' }).getByRole('button', { name: /مطابق/ }).click();
    await page.locator('select[aria-label="عرض"]').selectOption('diff');
    await expect(page.locator('.print-area tbody tr')).toHaveCount(1);
    await expect(page.locator('.print-area tbody tr')).toContainText('عصير');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    await page.getByRole('button', { name: /اعتماد الجرد \(2\)/ }).click();
    await toast(page, 'تم تسجيل الجرد');
    await expect(page.locator('.count-restored')).toHaveCount(0);

    await nav(page, 'المواد');
    await expect(page.locator('tbody tr', { hasText: 'عصير' })).toContainText('3');
    await expect(page.locator('tbody tr', { hasText: 'بسكويت' })).toContainText('10');
  } finally {
    await close();
  }
});
