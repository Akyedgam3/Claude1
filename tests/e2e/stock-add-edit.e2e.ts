import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// «ضاف مخزون لمادة بالغلط»: من «+ كمية» أو بطاقة المادة بيعدّل الكمية أو بيحذف الإضافة، والرصيد والحسابات بيتصلّحوا
test('a mistaken stock addition can be edited or deleted from the item', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    await call('saveItem', { id: 'z', code: '0001', name: 'زيت', kind: 'stock', unit: 'قطعة', price: 150000, priceCurrency: 'SYP' });

    await nav(page, 'المواد');
    const row = page.locator('table tbody tr', { hasText: 'زيت' }).first();
    await row.getByRole('button', { name: '+ كمية' }).click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('500'); // غلط: بدها 50
    await m.locator('.field', { hasText: 'تكلفة الوحدة' }).locator('input').fill('1000');
    await m.getByRole('button', { name: 'إضافة' }).click();
    await toast(page, 'تمت إضافة');
    await expect.poll(async () => (await st()).stock['z'].totalQty).toBe(500);

    // تعديل من «+ كمية» نفسها
    await row.getByRole('button', { name: '+ كمية' }).click();
    const add = page.locator('.modal .item-stock-add').first();
    await expect(add).toContainText('+500');
    await add.getByRole('button', { name: 'تعديل' }).click();
    await add.locator('input[aria-label="الكمية"]').fill('50');
    await add.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'انعدّلت الإضافة');
    await expect.poll(async () => (await st()).stock['z'].totalQty).toBe(50);
    let s = await st();
    expect(s.stock['z'].value).toBe(50 * 100000);
    await page.keyboard.press('Escape');

    // حذف من بطاقة المادة
    await row.click();
    const card = page.locator('.modal .item-stock-add').first();
    await expect(card).toContainText('+50');
    await card.getByRole('button', { name: 'حذف' }).click();
    await page.locator('.modal').last().getByRole('button', { name: /تأكيد|نعم|موافق|متأكد/ }).first().click();
    await toast(page, 'انحذفت الإضافة');
    await expect.poll(async () => (await st()).stock['z'].totalQty).toBe(0);
    s = await st();
    expect(s.stock['z'].value).toBe(0);
  } finally {
    await close();
  }
});
