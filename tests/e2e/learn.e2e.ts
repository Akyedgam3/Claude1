import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// «تعلّم وزن»: خطوات البداية بتتعلّم لحالها، الدليل فيه بحث وبيفتح الأقسام، وملاحظة على سطر الفاتورة بتنحفظ

test('learn wazn: start steps, guide search, and a note on an invoice line', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل التعلّم', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    // بطاقة البداية بالرئيسية
    await expect(page.locator('.learn-banner')).toBeVisible();
    await page.locator('.learn-banner').getByRole('button', { name: 'تعلّم وزن' }).click();
    await expect(page.locator('.learn-steps li.ok')).toHaveCount(0);
    await call('saveItem', { id: 'net', code: 'N1', name: 'اشتراك 1 ميغا', kind: 'service', unit: 'شهر', price: 500000, priceCurrency: 'SYP' });
    await expect(page.locator('.learn-steps li.ok')).toHaveCount(1);
    // الدليل: بحث وفتح موضوع
    await page.locator('.learn-search').fill('ملاحظة على');
    await expect(page.locator('.learn-topics details').first()).toContainText('ملاحظة');
    await page.locator('.learn-topics details[open]').getByRole('button', { name: /فاتورة مبيع/ }).click();
    // ملاحظة على السطر
    const row = page.locator('table.lines tbody tr').first();
    await row.locator('.with-button input').first().click();
    await row.locator('.with-button input').first().fill('اشتراك');
    await page.locator('.picker-list li').first().waitFor();
    await row.locator('.with-button input').first().press('Enter');
    await row.getByRole('button', { name: '+ ملاحظة' }).click();
    await row.locator('.line-note').fill('رقم الاشتراك 156561161166');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    expect(st.invoices.at(-1).lines[0].note).toBe('رقم الاشتراك 156561161166');
  } finally {
    await close();
  }
});
