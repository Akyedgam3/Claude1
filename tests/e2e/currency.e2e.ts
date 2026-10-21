import { expect, test } from '@playwright/test';
import { activate, launch, nav, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('currency: sell in dollars at the POS and close a restaurant order in dollars', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'مطعم' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('مطعم العملات');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();

    // سعر الدولار اليوم 120
    await nav(page, 'العملات وسعر الصرف');
    await page.locator('.field', { hasText: 'سعر السوق' }).locator('input').fill('120');
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, 'تم حفظ السعر');

    // الطاولات: الطلب بالليرة، والحساب بالدولار
    await nav(page, 'الطاولات والطلبات');
    await page.locator('.table-card', { hasText: 'طاولة 6' }).click();
    await page.locator('.pos-item', { hasText: 'كولا' }).click();
    await page.locator('.pos-item', { hasText: 'كولا' }).click();
    const sw = page.locator('.cur-switch');
    await sw.getByRole('button', { name: 'دولار $' }).click();
    await expect(page.locator('.pos-totals')).toContainText('المطلوب بالدولار');
    await expect(sw).toContainText('1 $ = 120 ل.س');
    await shot(page, '70-restaurant-pay-usd');
    await page.locator('.kv input.num-input').last().fill('5');
    await page.getByRole('button', { name: 'الحساب وإغلاق الطلب' }).click();
    await toast(page, 'الباقي للزبون');

    await nav(page, 'سجل الفواتير');
    await expect(page.locator('table.table tbody tr').first()).toContainText('$');

    // نقطة البيع: نفس السلة بتتحوّل للدولار وبترجع لليرة
    await nav(page, 'نقطة البيع');
    await page.locator('.pos-item', { hasText: 'شيش طاووق' }).click();
    await expect(page.locator('.pos-totals .grand').last()).toContainText('650.00 ل.س');
    await page.locator('.cur-switch').getByRole('button', { name: 'دولار $' }).click();
    await expect(page.locator('.pos-totals')).toContainText('5.42 $');
    await expect(page.locator('.pos-totals')).toContainText('يعادل');
    await page.locator('.pos-item', { hasText: 'كولا' }).click();
    await expect(page.locator('.pos-totals')).toContainText('6.09 $');
    await shot(page, '71-pos-usd');
    await page.getByRole('button', { name: 'دفع نقداً' }).click();
    await toast(page, 'تم البيع');
    await expect(page.locator('.pos-footer')).toContainText('7.43 $');
  } finally {
    await close();
  }
});

test('currency: add a custom currency with its own rate and sell with it', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'سوبرماركت' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('ماركت الحدود');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();

    // عملة جديدة: ليرة تركية، 1 ₺ = 3.5 ل.س
    await nav(page, 'العملات وسعر الصرف');
    await page.getByRole('button', { name: 'إضافة عملة' }).click();
    const m = page.locator('.modal');
    await m.getByRole('button', { name: 'ليرة تركية' }).click();
    await expect(m.locator('.field', { hasText: 'الرمز الدولي' }).locator('input')).toHaveValue('TRY');
    await m.locator('.field', { hasText: 'كم ليرة سورية جديدة يساوي 1 ليرة تركية' }).locator('input').fill('3.5');
    await shot(page, '72-add-currency');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, 'تمت إضافة ليرة تركية');
    await expect(page.locator('.stat', { hasText: 'ليرة تركية' })).toContainText('1 ₺ = 3.5 ل.س');
    await expect(page.locator('.cur-tabs')).toContainText('دولار أمريكي');

    // نقطة البيع: زر للتركي، والسلة بتتحوّل
    await nav(page, 'نقطة البيع');
    const sw = page.locator('.cur-switch');
    await expect(sw.getByRole('button', { name: 'ليرة تركية ₺' })).toBeVisible();
    await page.locator('.pos-item').first().click();
    const sypTotal = await page.locator('.pos-totals .grand').last().innerText();
    await sw.getByRole('button', { name: 'ليرة تركية ₺' }).click();
    await expect(sw).toContainText('1 ₺ = 3.5 ل.س');
    await expect(page.locator('.pos-totals .grand').last()).toContainText('₺');
    await shot(page, '73-pos-try');
    await page.getByRole('button', { name: 'دفع نقداً' }).click();
    await toast(page, 'تم البيع');
    expect(sypTotal).toContain('ل.س');

    // الفاتورة انسجّلت بالتركي، والقبض بصندوق التركي
    await nav(page, 'سجل الفواتير');
    await expect(page.locator('table.table tbody tr').first()).toContainText('₺');
    await nav(page, 'دليل الحسابات');
    await expect(page.getByText('صندوق ليرة تركية')).toBeVisible();
  } finally {
    await close();
  }
});
