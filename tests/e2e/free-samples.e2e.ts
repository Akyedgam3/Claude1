import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// زبون «عينات مجانية»: لما ينختار بالفاتورة كل المواد بتنحط بسعر صفر، والبضاعة بتطلع من المخزون
test('free samples customer: every item at zero price, stock still goes out', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مركز الجملة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    await call('saveItem', { id: 'z', code: 'Z', name: 'زيت', kind: 'stock', unit: 'قطعة', price: 150000, wholesalePrice: 130000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'z', qty: 20, unitCost: 100000 }] });
    await call('updateCompany', { customize: { featuresOn: ['priceTiers'] } });

    // الزبون من الشاشة: «عينات مجانية» بقائمة الأسعار
    await nav(page, 'العملاء والموردون');
    await page.getByRole('button', { name: 'إضافة' }).first().click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('عينات المندوب');
    await m.locator('.tier-pick').getByRole('button', { name: 'عينات مجانية', exact: true }).click();
    await m.getByRole('button', { name: 'حفظ' }).click();
    await expect.poll(async () => (Object.values((await st()).parties as Record<string, any>).find((p) => p.name === 'عينات المندوب') ?? {}).priceList).toBe('free');

    await nav(page, 'فاتورة مبيع');
    const partyInput = page.locator('.field', { hasText: 'العميل' }).locator('.with-button input').first();
    await partyInput.click();
    await partyInput.fill('عينات');
    await page.locator('.picker-list li').first().click();
    const row = page.locator('table.lines tbody tr').first();
    await row.locator('.with-button input').first().click();
    await row.locator('.with-button input').first().fill('زيت');
    await page.locator('.picker-list li').first().waitFor();
    await row.locator('.with-button input').first().press('Enter');
    await expect(row.locator('td[data-label="السعر"] input')).toHaveValue(/^0(\.0+)?$/);
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    const s = await st();
    expect(s.invoices.at(-1).total).toBe(0);
    expect(s.stock['z'].totalQty).toBe(19);
  } finally {
    await close();
  }
});
