import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// منشرة: «قياس» بسطر الفاتورة: 120×60×3 × 10 = 7.2 م²، وبينطبع القياس كملاحظة
test('stone measure on the invoice line: square meters up to 10 cm thick', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'منشرة كلجبرين', activity: 'منشرة حجر ورخام' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    await call('saveItem', { id: 'b', code: 'B1', name: 'بلاط حلبي 3 سم', kind: 'stock', unit: 'م²', price: 500000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'b', qty: 100, unitCost: 300000 }] });

    await nav(page, 'فاتورة مبيع');
    const row = page.locator('table.lines tbody tr').first();
    await row.locator('.with-button input').first().click();
    await row.locator('.with-button input').first().fill('بلاط');
    await page.locator('.picker-list li').first().waitFor();
    await row.locator('.with-button input').first().press('Enter');
    await row.locator('button[title^="قياس"]').click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'الطول' }).locator('input').fill('120');
    await m.locator('.field', { hasText: 'العرض' }).locator('input').fill('60');
    await m.locator('.field', { hasText: 'السماكة' }).locator('input').fill('3');
    await m.locator('.field', { hasText: 'العدد' }).locator('input').fill('10');
    await expect(m.locator('.stone-result')).toContainText('7.2 م²');
    await m.locator('.field', { hasText: 'السماكة' }).locator('input').fill('12');
    await expect(m.locator('.stone-result')).toContainText('م³');
    await m.locator('.field', { hasText: 'السماكة' }).locator('input').fill('3');
    await m.getByRole('button', { name: 'حط الكمية' }).click();
    await expect(row.locator('td[data-label="الكمية"] input')).toHaveValue('7.2');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    const s = await st();
    const line = s.invoices.at(-1).lines[0];
    expect(line.qty).toBe(7.2);
    expect(line.note).toContain('120×60×3 سم × 10 = 7.2 م²');
  } finally {
    await close();
  }
});
