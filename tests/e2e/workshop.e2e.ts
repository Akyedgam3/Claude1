import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('workshop: receive numbered rolls, production order, cut, deliver with invoice', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'ورشة النور', activity: 'خياطة وتفصيل' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([m, a]) => (window as any).mizan.invoke('company:call', m, a), [method, args] as const);
    await call('saveParty', { id: 'f', kind: 'customer', name: 'معمل النور للألبسة' });
    const m = page.locator('.modal');

    // استلام أتواب: سطرين يدوي + لصق قائمة
    await nav(page, 'ورشة الإنتاج');
    await page.getByRole('button', { name: 'أتواب القماش' }).click();
    await page.getByRole('button', { name: /استلام أتواب/ }).click();
    await pick(page, m.locator('.field', { hasText: 'صاحب القماش' }).locator('.picker input'), 'النور');
    await m.locator('.field', { hasText: 'نوع القماش' }).locator('input').fill('قطن بوبلين');
    const row = m.locator('table.lines tbody tr');
    await row.nth(0).locator('input').nth(0).fill('A-101');
    await row.nth(0).locator('input').nth(1).fill('50');
    await row.nth(0).locator('input').nth(1).press('Enter');
    await expect(row.nth(1).locator('input').nth(0)).toHaveValue('A-102');
    await row.nth(1).locator('input').nth(1).fill('48.5');
    await m.locator('.paste-box summary').click();
    await m.locator('.paste-box textarea').fill('A-103  52\nA-104  49.75');
    await m.getByRole('button', { name: 'إضافة القائمة' }).click();
    await expect(m.locator('.kv')).toContainText('200.25');
    await m.getByRole('button', { name: /حفظ وطباعة السند/ }).click();
    await toast(page, /تم استلام 4 توب/);
    await expect(page.locator('table.table tbody tr')).toHaveCount(4);

    // طلبية بمقاسات
    await page.getByRole('button', { name: 'طلبيات الإنتاج' }).click();
    await page.getByRole('button', { name: /طلبية جديدة/ }).click();
    await pick(page, page.locator('.field', { hasText: 'الزبون' }).locator('.picker input'), 'النور');
    await page.locator('.field', { hasText: 'الموديل' }).first().locator('input').fill('قميص رجالي');
    await page.locator('.field', { hasText: 'أجرة القطعة' }).locator('input').fill('35');
    const plannedRow = page.locator('.size-matrix tbody tr').first();
    for (const [i, v] of ['20', '30', '30', '20', '10'].entries()) await plannedRow.locator('input').nth(i).fill(v);
    await page.locator('.page-header').getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, /تم حفظ الطلبية رقم 1/);

    // قصّة من توبين
    await page.getByRole('button', { name: /قصّة جديدة/ }).click();
    await m.locator('.roll-chip', { hasText: 'A-101' }).locator('input[type=checkbox]').check();
    await m.locator('.roll-chip', { hasText: 'A-102' }).locator('input[type=checkbox]').check();
    await m.locator('.roll-chip', { hasText: 'A-102' }).locator('.num-input').fill('20');
    const sizes = m.locator('.size-inputs input');
    for (const [i, v] of ['10', '15', '15', '10', '5'].entries()) await sizes.nth(i).fill(v);
    await expect(m.locator('.kv')).toContainText('70');
    await m.getByRole('button', { name: 'حفظ القصّة' }).click();
    await toast(page, /55 قطعة من 70 متر/);
    await expect(page.locator('.size-matrix')).toContainText('55');
    await shot(page, '40-workshop-order');

    // تسليم دفعة مع فاتورة
    await page.getByRole('button', { name: /تسليم دفعة/ }).click();
    await m.getByRole('button', { name: /كل الجاهز/ }).click();
    await m.locator('.field', { hasText: 'المقبوض الآن' }).locator('input').fill('1000');
    await m.getByRole('button', { name: /تسليم وطباعة الإشعار/ }).click();
    await toast(page, /تم التسليم وإصدار فاتورة/);
    await expect(page.locator('.card', { hasText: 'التسليمات' })).toContainText('فاتورة');

    // كشف أقمشة الزبون
    await nav(page, 'ورشة الإنتاج');
    await page.getByRole('button', { name: 'كشف أقمشة زبون' }).click();
    await pick(page, page.locator('.toolbar .picker input'), 'النور');
    await expect(page.locator('.stats')).toContainText('130.25'); // 200.25 - 70
    await shot(page, '41-workshop-statement');
  } finally {
    await close();
  }
});
