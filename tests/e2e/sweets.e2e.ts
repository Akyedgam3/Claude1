import { expect, test } from '@playwright/test';
import { activate, launch, nav, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('sweets and ice cream shop: cup sizes, flavours, weights, sell by amount, hold and resume', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'حلويات وبوظة' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('حلويات الشام');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();

    await nav(page, 'نقطة البيع');
    await page.getByLabel('طباعة الإيصال تلقائياً').uncheck();
    const ice = page.locator('.pos-tile', { hasText: 'بوظة عربية' });

    // كاسة وسط بطعمتين
    await ice.locator('.unit-chips button', { hasText: 'كاسة وسط' }).click();
    const line = page.locator('.pos-line-wrap').first();
    await expect(line).toContainText('كاسة وسط');
    await line.getByRole('button', { name: /طعمة/ }).click();
    await line.locator('.quick-notes button', { hasText: 'فستق حلبي' }).click();
    await line.locator('.quick-notes button', { hasText: 'قشطة' }).click();
    await expect(line.locator('.line-note')).toContainText('فستق حلبي، قشطة');
    await shot(page, '60-sweets-pos');

    // تعليق الفاتورة وخدمة زبون تاني
    await page.getByRole('button', { name: 'تعليق الفاتورة' }).click();
    await expect(page.locator('.pos-line-wrap')).toHaveCount(0);
    await expect(page.locator('.held-chip')).toHaveCount(1);

    // نص كيلو بقلاوة بكبسة، وبعدين مبرومة بـ 850 ليرة = نص كيلو
    await page.locator('.pos-tile', { hasText: 'بقلاوة بالفستق' }).locator('.pos-item').click();
    const kilo = page.locator('.pos-line-wrap', { hasText: 'بقلاوة' });
    await kilo.getByRole('button', { name: '½' }).click();
    await expect(kilo.locator('.qty-box input')).toHaveValue('0.5');
    await page.locator('.pos-tile', { hasText: 'مبرومة' }).locator('.pos-item').click();
    const byAmount = page.locator('.pos-line-wrap', { hasText: 'مبرومة' });
    await byAmount.getByRole('button', { name: 'بالمبلغ' }).click();
    await byAmount.locator('.amount-box input').fill('850');
    await byAmount.locator('.amount-box input').press('Enter');
    await expect(byAmount.locator('.qty-box input')).toHaveValue('0.5');
    // 900 + 850
    await expect(page.locator('.pos-totals .grand').last()).toContainText('1,750.00');
    await expect(page.locator('.cash-quick button', { hasText: '2,000.00' })).toBeVisible();
    await page.locator('.cash-quick button', { hasText: '2,000.00' }).click();
    await expect(page.locator('.pos-totals')).toContainText('250.00');
    await page.locator('.pos-totals input.big-input').press('Enter');
    await toast(page, /الباقي للزبون/);

    // رجّع الفاتورة المعلّقة وبيعها، والطعمة بتنحفظ عالفاتورة
    await page.locator('.held-chip').click();
    await expect(page.locator('.pos-line-wrap')).toContainText('فستق حلبي، قشطة');
    await page.getByRole('button', { name: 'دفع نقداً' }).click();
    await toast(page, /تم البيع/);
    await expect(page.locator('.held-chip')).toHaveCount(0);

    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    await expect(page.locator('.paper-preview')).toContainText('فستق حلبي، قشطة');
    await shot(page, '61-sweets-invoice');
  } finally {
    await close();
  }
});
