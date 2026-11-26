import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick } from './helpers';

// سند قبض انوزّع على فاتورة آجلة: الفاتورة المطبوعة وسجل الفواتير لازم يبيّنوا المقبوض كله والختم «مدفوعة جزئياً»
test('vouchers after a credit sale show on the printed invoice and the log', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveParty', { id: 'p', kind: 'customer', name: 'زبون سند القبض' });
    await call('saveItem', { id: 's', code: 'S', name: 'سكر', kind: 'stock', unit: 'كيس', price: 120000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 's', qty: 50, unitCost: 80000 }] });
    await call('postInvoice', { kind: 'sale', date: '2026-11-25', partyId: 'p', paid: 0, lines: [{ itemId: 's', qty: 2, price: 120000 }] });
    await call('postVoucher', { kind: 'receipt', date: '2026-11-25', partyId: 'p', amount: 100000, memo: 'دفعة' });
    await call('postVoucher', { kind: 'receipt', date: '2026-11-26', partyId: 'p', amount: 40000, memo: 'دفعة' });

    // سند جديد: بيبيّن رصيد الزبون وفاتورته المفتوحة
    await nav(page, 'سندات القبض والدفع');
    await pick(page, page.locator('.field', { hasText: 'الاسم' }).locator('input').first(), 'زبون سند');
    await expect(page.locator('.voucher-party-info')).toContainText('1,000');

    await nav(page, 'سجل الفواتير');
    const row = page.locator('table.table tbody tr').first();
    await expect(row).toContainText('1,400');
    await row.click();
    const doc = page.locator('.invoice-doc');
    await expect(doc.locator('.doc-stamp')).toHaveText('مدفوعة جزئياً');
    await expect(doc).toContainText('1,400');
    await expect(doc).toContainText('1,000');
  } finally {
    await close();
  }
});
