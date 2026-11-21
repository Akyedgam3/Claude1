import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// التكاليف الإضافية بفاتورة الشراء من الشاشة: شحن 100 من الصندوق موزّع حسب القيمة، بيدخل بتكلفة المواد

test('purchase invoice extra costs (shipping paid from the box) go into the item cost', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الاستيراد', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveParty', { id: 'sup', kind: 'supplier', name: 'المورد' });
    await call('saveItem', { id: 'f', code: 'F', name: 'براد', kind: 'stock', unit: 'قطعة', price: 500000, priceCurrency: 'SYP' });
    await call('saveItem', { id: 'w', code: 'W', name: 'غسالة', kind: 'stock', unit: 'قطعة', price: 300000, priceCurrency: 'SYP' });
    await nav(page, 'فاتورة شراء');
    await pick(page, page.locator('.field', { hasText: 'المورد' }).locator('.with-button input').first(), 'المورد');
    const add = async (n: number, name: string, qty: string, price: string) => {
      const row = page.locator('table.lines tbody tr').nth(n);
      await pick(page, row.locator('.with-button input').first(), name);
      await row.locator('.qty-cell input').first().fill(qty);
      await row.locator('td[data-label="السعر"] input').fill(price);
    };
    await add(0, 'براد', '2', '3000');
    await add(1, 'غسالة', '4', '1000');
    const box = page.locator('.extra-costs');
    await box.getByRole('button', { name: /تكلفة إضافية/ }).click();
    await box.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('1000');
    await box.locator('.field', { hasText: 'البيان' }).locator('input').fill('أجور شحن وجمركة');
    await expect(box.locator('.extra-sum')).toContainText('10');
    await box.locator('.field', { hasText: 'الدفع' }).locator('select').selectOption('party');
    if (process.env.SHOT) await box.screenshot({ path: process.env.SHOT });
    await box.locator('.field', { hasText: 'الدفع' }).locator('select').selectOption('cash');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const scale = 10 ** st.currencies['SYP'].decimals;
    expect(st.stock['f'].value / scale).toBe(6600);
    expect(st.stock['w'].value / scale).toBe(4400);
    const inv = st.invoices.at(-1);
    expect(inv.extras[0]).toMatchObject({ pay: 'cash', split: 'value', memo: 'أجور شحن وجمركة' });
    expect(inv.total / scale).toBe(10000); // على المورد البضاعة بس
  } finally {
    await close();
  }
});
