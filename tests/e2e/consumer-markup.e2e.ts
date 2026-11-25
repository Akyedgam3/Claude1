import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// «قوائم الأسعار ← أسعار المستهلك»: ربح المحل 15% على كل المواد = سعر الفاتورة + 15%، والمادة اللي إلها سعر مستهلك بتضل عليه
test('consumer price = invoice price + shop margin for all items', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مركز الجملة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveItem', { id: 'curry', code: '0001', name: 'كاري', kind: 'stock', unit: 'قطعة', price: 2200, consumerPrice: 2500, priceCurrency: 'SYP' });
    await call('saveItem', { id: 'cumin', code: '0002', name: 'كمون', kind: 'stock', unit: 'قطعة', price: 3000, priceCurrency: 'SYP', units: [{ name: 'كرتونة', factor: 12 }] });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'curry', qty: 50, unitCost: 1500 }, { itemId: 'cumin', qty: 50, unitCost: 2000 }] });
    await call('postInvoice', { kind: 'sale', date: '2026-11-21', lines: [{ itemId: 'curry', qty: 2, price: 2000 }, { itemId: 'cumin', qty: 1, price: 30000, unit: 'كرتونة' }] });

    await nav(page, 'قوائم الأسعار');
    const box = page.locator('.consumer-prices');
    await box.locator('input[type=checkbox]').check();
    await box.locator('input[inputmode=decimal]').fill('15');
    await box.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, /15%/);

    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    const doc = page.locator('.invoice-doc');
    await expect(doc.locator('tbody tr').nth(0).locator('.doc-consumer')).toContainText('25.00'); // من بطاقة المادة
    await expect(doc.locator('tbody tr').nth(1).locator('.doc-consumer')).toContainText('345.00'); // 300 + 15%
  } finally {
    await close();
  }
});
