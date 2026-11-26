import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick } from './helpers';

// زبون دخّل بضاعة المحل القديمة كفواتير شراء «مدفوعة من الصندوق» فصار صندوق الدولار -11,940.
// هلق: «من وين إجت المصاري؟» ← «البضاعة كانت عندي من قبل» بيسجّل الناقص رأس مال، والصندوق ما بيصير بالسالب.
// وزر «رصيد افتتاحي» بالصندوق: بتكتب قديش بالدرج هلق والبرنامج بيزيد الفرق رأس مال.
test('purchase paid from an empty box asks where the money came from; opening cash button', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const bal = (s: any, id: string) => s.entries.flatMap((e: any) => e.lines).filter((l: any) => l.accountId === id).reduce((t: number, l: any) => t + l.debit - l.credit, 0);
    await call('saveItem', { id: 's', code: 'S', name: 'سكر', kind: 'stock', unit: 'كيس', price: 100000, priceCurrency: 'SYP' });

    await nav(page, 'فاتورة شراء');
    const row = page.locator('table.lines tbody tr').first();
    await pick(page, row.locator('.with-button input').first(), 'سكر');
    await row.locator('input.num-input').nth(0).fill('10');
    await row.locator('input.num-input').nth(1).fill('800');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    const m = page.locator('.modal', { hasText: 'من وين إجت المصاري' });
    await expect(m).toBeVisible();
    await m.getByRole('button', { name: /البضاعة كانت عندي من قبل/ }).click();
    await expect.poll(async () => bal(await st(), '3101')).toBe(-800000);
    let s = await st();
    expect(bal(s, '1101')).toBe(0);
    expect(bal(s, '3101')).toBe(-800000);
    expect(s.invoices).toHaveLength(1);

    // «لسا ما دفعت للمورد»: الفاتورة بتتحوّل «دون دفع» وما بتنحفظ لحتى يختار المورد
    await nav(page, 'فاتورة شراء');
    const row2 = page.locator('table.lines tbody tr').first();
    await pick(page, row2.locator('.with-button input').first(), 'سكر');
    await row2.locator('input.num-input').nth(0).fill('1');
    await row2.locator('input.num-input').nth(1).fill('800');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await m.getByRole('button', { name: /لسا ما دفعت للمورد/ }).click();
    await expect(page.locator('.toast').last()).toContainText('اختار المورد');
    expect((await st()).invoices).toHaveLength(1);

    // رصيد افتتاحي: بالدرج 500 هلق والصندوق صفر ← بيفوت 500
    await nav(page, 'الصندوق');
    await page.getByRole('button', { name: /رصيد افتتاحي/ }).click();
    const o = page.locator('.modal', { hasText: 'رصيد افتتاحي' });
    await o.locator('.field', { hasText: 'قديش بالدرج هلق' }).locator('input').fill('500');
    await expect(o).toContainText('رح يفوت');
    await o.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(page.locator('.toast').last()).toContainText('كرأس مال');
    s = await st();
    expect(bal(s, '1101')).toBe(50000);
  } finally {
    await close();
  }
});
