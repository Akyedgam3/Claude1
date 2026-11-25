import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// الواتساب: تذكير بالدين بيفتح محادثة الزبون والرسالة جاهزة، زر واتساب بالفاتورة، والإرسال التلقائي بعد حفظ فاتورة المبيع
test('debt reminder and invoice sharing open WhatsApp with the customer and the message', async () => {
  const { app, page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الأمانة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await app.evaluate(({ shell }) => {
      (globalThis as any).__wa = [];
      shell.openExternal = (async (u: string) => void (globalThis as any).__wa.push(u)) as never;
    });
    const opened = async () => (await app.evaluate(() => (globalThis as any).__wa as string[])).map((u) => decodeURIComponent(u));
    await call('saveParty', { id: 'p', kind: 'customer', name: 'أبو خالد', phone: '0944 123 456' });
    await call('saveItem', { id: 'z', code: 'Z', name: 'زيت', kind: 'stock', unit: 'قطعة', price: 150000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'z', qty: 50, unitCost: 100000 }] });
    await call('postInvoice', { kind: 'sale', date: '2026-11-20', partyId: 'p', paid: 0, lines: [{ itemId: 'z', qty: 2, price: 150000 }] });

    // تذكير بالدين من بطاقة الزبون
    await nav(page, 'العملاء والموردون');
    await page.locator('table tbody tr', { hasText: 'أبو خالد' }).first().click();
    await page.getByRole('button', { name: 'تذكير بالدين' }).click();
    await expect.poll(async () => (await opened()).length).toBe(1);
    let u = (await opened())[0]!;
    expect(u).toContain('wa.me/963944123456');
    expect(u).toContain('أبو خالد');
    expect(u).toContain('3,000');

    // زر واتساب بالفاتورة
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    await page.getByRole('button', { name: 'واتساب', exact: true }).click();
    await expect.poll(async () => (await opened()).length).toBe(2);
    u = (await opened())[1]!;
    expect(u).toContain('wa.me/963944123456');
    expect(u).toContain('فاتورة مبيع رقم 1');

    // الإرسال التلقائي بعد الحفظ
    await call('updateCompany', { print: { autoWhatsApp: true } });
    await nav(page, 'فاتورة مبيع');
    const partyInput = page.locator('.field', { hasText: 'العميل' }).locator('.with-button input').first();
    await partyInput.click();
    await partyInput.fill('أبو خالد');
    await page.locator('.picker-list li').first().click();
    const row = page.locator('table.lines tbody tr').first();
    await row.locator('.with-button input').first().click();
    await row.locator('.with-button input').first().fill('زيت');
    await page.locator('.picker-list li').first().waitFor();
    await row.locator('.with-button input').first().press('Enter');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    await expect.poll(async () => (await opened()).length).toBe(3);
    u = (await opened())[2]!;
    expect(u).toContain('فاتورة مبيع رقم 2');
    expect(u).toMatch(/الحساب السابق|حساب سابق/);
  } finally {
    await close();
  }
});
