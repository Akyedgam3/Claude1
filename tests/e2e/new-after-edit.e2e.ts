import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// تقرير التجربة B2: بعد تعديل فاتورة، «+ جديدة» كانت تفتح نسخة منها (نفس الزبون والبنود والدفعة)
test('new invoice after editing one opens empty', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveParty', { id: 'p', kind: 'customer', name: 'أبو خالد' });
    await call('saveItem', { id: 's', code: 'S', name: 'سكر', kind: 'stock', unit: 'كيس', price: 100000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 's', qty: 50, unitCost: 80000 }] });
    await call('postInvoice', { kind: 'sale', date: '2026-11-25', partyId: 'p', paid: 100000, lines: [{ itemId: 's', qty: 3, price: 100000 }] });

    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    await page.getByRole('button', { name: 'تعديل', exact: true }).click();
    await expect(page.locator('table.lines tbody tr').first()).toContainText('سكر');
    await page.getByRole('button', { name: /حفظ الفاتورة|حفظ التعديل/ }).click();
    await toast(page, /تم تعديل/);
    await page.getByRole('button', { name: '+ جديدة' }).click();
    // فاضية: بدون زبون ولا مواد
    await expect(page.locator('table.lines tbody tr').first().locator('.with-button input').first()).toHaveValue('');
    await expect(page.locator('.field', { hasText: 'العميل' }).locator('.with-button input').first()).toHaveValue('');
  } finally {
    await close();
  }
});
