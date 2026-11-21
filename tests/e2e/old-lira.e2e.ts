import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// «بأي ليرة بتشتغل؟»: الليرة القديمة = نفس المبالغ المخزّنة بالأصفار (×100) وبدون كسور. التبديل عرض بس.
test('old lira display: amounts, typing, exchange rate, and back to the new lira', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الليرة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    // رز بـ 15 ليرة جديدة (1500 قرش) وسعر الدولار 121 جديدة
    await call('saveItem', { id: 'rice', code: '0001', name: 'رز', kind: 'service', unit: 'كيس', price: 1500, priceCurrency: 'SYP' });
    await call('setRate', { date: '2026-01-01', currency: 'USD', kind: 'market', rate: 121 });

    await nav(page, 'الإعدادات');
    await page.locator('.lira-options label', { hasText: 'الليرة القديمة' }).click();
    await toast(page, /الليرة القديمة/);
    expect((await st()).info.oldLira).toBe(true);

    // سعر الصرف بالأصفار
    await nav(page, 'العملات وسعر الصرف');
    await expect(page.locator('.page')).toContainText('12,100');

    // فاتورة: السعر بيطلع 1,500 (قديمة)، ومنكتب 2000 قديمة = 20 جديدة
    await nav(page, 'فاتورة مبيع');
    const row = page.locator('table.lines tbody tr').first();
    await pick(page, row.locator('.with-button input').first(), 'رز');
    const price = row.locator('td[data-label="السعر"] input');
    await expect(price).toHaveValue('1500');
    await price.fill('2000');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    const inv = (await st()).invoices.at(-1);
    expect(inv.total).toBe(2000); // 2000 قرش = 20 ليرة جديدة = 2000 قديمة
    await expect(page.locator('.invoice-doc')).toContainText('2,000 ل.س');
    await expect(page.locator('.invoice-doc')).not.toContainText('2,000.00');
    await expect(page.locator('.invoice-doc')).toContainText('ألفان');

    // فاتورة بالدولار: خانة سعر الصرف بالأصفار، والمكتوب بينقسم على 100 قبل ما ينحفظ
    await nav(page, 'فاتورة مبيع');
    await page.locator('.field', { hasText: 'العملة' }).locator('select').first().selectOption('USD');
    const rate = page.locator('.field', { hasText: 'سعر الصرف' }).locator('input');
    await expect(rate).toHaveAttribute('placeholder', '12100');
    await rate.fill('13000');
    const r2 = page.locator('table.lines tbody tr').first();
    await pick(page, r2.locator('.with-button input').first(), 'رز');
    await r2.locator('td[data-label="السعر"] input').fill('2');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    expect((await st()).invoices.at(-1)).toMatchObject({ currency: 'USD', rate: 130 });
    await expect(page.locator('.invoice-doc')).toContainText('13,000');

    // رجوع للجديدة: نفس الفاتورة بتطلع 20.00
    await nav(page, 'الإعدادات');
    await page.locator('.lira-options label', { hasText: 'الليرة الجديدة' }).click();
    await toast(page, /الليرة الجديدة/);
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr', { hasText: '20.00' }).first().click();
    await expect(page.locator('.invoice-doc')).toContainText('20.00 ل.س');
    expect((await st()).invoices[0].total).toBe(2000);
  } finally {
    await close();
  }
});

test('new-company wizard: choosing the old lira', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة', exact: true }).click();
    await page.locator('.act-choose').click();
    await page.locator('.act-card').first().click();
    await page.locator('.act-modal-foot .primary').click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('محل قديم');
    await page.locator('.field', { hasText: 'العملة الأساسية' }).locator('select').selectOption('SYP_OLD');
    await page.getByRole('button', { name: 'التالي' }).click();
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();
    await expect(page.locator('.sidebar')).toBeVisible();
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    expect(st.info).toMatchObject({ baseCurrency: 'SYP', oldLira: true });
  } finally {
    await close();
  }
});
