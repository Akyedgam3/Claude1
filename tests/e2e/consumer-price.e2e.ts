import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// اقتراح زبون (جملة): «سعر المستهلك» بالفاتورة حتى المحل يعرف بقديش يبيع القطعة
test('consumer price column on the sale invoice (A4 and thermal)', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مركز الجملة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    // كاري: سعر مستهلك محطوط (25)؛ كمون: بدون، فبياخد سعر المفرق (30)؛ والكرتونة 12 = 300
    await call('saveItem', { id: 'curry', code: '0001', name: 'كاري', kind: 'stock', unit: 'قطعة', price: 2200, wholesalePrice: 2000, consumerPrice: 2500, priceCurrency: 'SYP' });
    await call('saveItem', { id: 'cumin', code: '0002', name: 'كمون', kind: 'stock', unit: 'قطعة', price: 3000, priceCurrency: 'SYP', units: [{ name: 'كرتونة', factor: 12 }] });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'curry', qty: 50, unitCost: 1500 }, { itemId: 'cumin', qty: 50, unitCost: 2000 }] });
    await (call('postInvoice', { kind: 'sale', date: '2026-11-21', lines: [{ itemId: 'curry', qty: 2, price: 2000 }, { itemId: 'cumin', qty: 1, price: 30000, unit: 'كرتونة' }] }));

    // قبل التفعيل: ما في عمود
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    await expect(page.locator('.invoice-doc')).not.toContainText('سعر المستهلك');

    // التفعيل من الإعدادات ← الطباعة والفواتير
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الطباعة والفواتير' }).click();
    await page.locator('label.check', { hasText: 'سعر المستهلك' }).locator('input').check();
    await page.getByRole('button', { name: /^حفظ/ }).first().click();
    await toast(page, /تم/);
    await expect.poll(async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state.info.print?.showConsumerPrice).toBe(true);

    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    const doc = page.locator('.invoice-doc');
    await expect(doc.locator('thead')).toContainText('سعر المستهلك');
    await expect(doc.locator('tbody tr').nth(0).locator('.doc-consumer')).toContainText('25.00');
    await expect(doc.locator('tbody tr').nth(1).locator('.doc-consumer')).toContainText('360.00'); // 30 × 12
    // الإيصال الحراري: عمود «المستهلك» جنب السعر
    await expect(page.locator('.thermal-doc .t-lines thead')).toContainText('مستهلك');
    await expect(page.locator('.thermal-doc .t-lines tbody tr').first().locator('.t-cons-col')).toHaveText('25.00');
    // الزر السريع بالفاتورة نفسها: بيطفيه وبيرجّعه
    const toggle = page.locator('label.consumer-toggle input');
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(doc.locator('thead')).not.toContainText('سعر المستهلك');
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(doc.locator('thead')).toContainText('سعر المستهلك');
    // بطاقة المادة فيها الخانة
    await nav(page, 'المواد');
    await page.locator('tr', { hasText: 'كاري' }).first().click();
    await page.locator('.modal').getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await expect(page.locator('.modal .field', { hasText: 'سعر المستهلك' }).locator('input')).toHaveValue('25');
  } finally {
    await close();
  }
});
