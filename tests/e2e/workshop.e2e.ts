import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

// مثال دفتر الخياط: رسمة 5 يارد، قطعة من كل نمرة بالمدة، توب 110 يارد = 22 مدة وتوب 120 يارد = 24 مدة
test('workshop: rolls in yards, lays per roll, stages, expenses, delivery and the weekly account', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'ورشة ياسين', activity: 'خياطة وتفصيل' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([m, a]) => (window as any).mizan.invoke('company:call', m, a), [method, args] as const);
    await call('saveParty', { id: 'f', kind: 'customer', name: 'معمل النور للألبسة' });
    const m = page.locator('.modal');

    // استلام أتواب باليارد: سطر يدوي + Enter + لصق قائمة
    await nav(page, 'ورشة الخياطة');
    await page.getByRole('button', { name: 'أتواب القماش' }).click();
    await page.getByRole('button', { name: /استلام أتواب/ }).click();
    await pick(page, m.locator('.field', { hasText: 'صاحب القماش' }).locator('.picker input'), 'النور');
    await m.locator('.field', { hasText: 'نوع القماش' }).locator('input').fill('جوخ صوف');
    const row = m.locator('table.lines tbody tr');
    await row.nth(0).locator('input').nth(0).fill('120');
    await row.nth(0).locator('input').nth(1).fill('110');
    await row.nth(0).locator('input').nth(1).press('Enter');
    await expect(row.nth(1).locator('input').nth(0)).toHaveValue('121');
    await row.nth(1).locator('input').nth(1).fill('120');
    await m.locator('.paste-box summary').click();
    await m.locator('.paste-box textarea').fill('140  95\n141  100');
    await m.getByRole('button', { name: 'إضافة القائمة' }).click();
    await expect(m.locator('.kv')).toContainText('425 يارد');
    await m.getByRole('button', { name: /حفظ وطباعة السند/ }).click();
    await toast(page, /تم استلام 4 توب/);

    // طلبية: 3 نمر × 46، رسمة 5 يارد
    await page.getByRole('button', { name: 'الطلبيات', exact: true }).click();
    await page.getByRole('button', { name: /طلبية جديدة/ }).click();
    await pick(page, page.locator('.field', { hasText: 'صاحب الشغل' }).locator('.picker input'), 'النور');
    await page.locator('.field', { hasText: 'الموديل' }).first().locator('input').fill('جلابية رجالي');
    await page.locator('.field', { hasText: 'طول الرسمة' }).locator('input').fill('5');
    await page.locator('.field', { hasText: 'سعر خياطة القطعة' }).locator('input').fill('40');
    const plannedRow = page.locator('.size-matrix tbody tr').first();
    for (let i = 0; i < 3; i++) await plannedRow.locator('input').nth(i).fill('46');
    await expect(page.locator('.plan-strip')).toContainText('46');
    await expect(page.locator('.plan-strip')).toContainText('230 يارد');
    await page.locator('.page-header').getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, /تم حفظ الطلبية رقم 1/);

    // المد: كل توب كم مدة أعطى (تلقائي من طوله)
    await page.getByRole('button', { name: /مدّ وقص/ }).click();
    const chip = (code: string) => m.locator('.roll-chip').filter({ has: page.locator('strong.mono', { hasText: new RegExp(`^${code}$`) }) });
    await chip('120').locator('input[type=checkbox]').check();
    await chip('121').locator('input[type=checkbox]').check();
    await expect(chip('120').locator('.roll-inputs input').first()).toHaveValue('22');
    await expect(chip('121').locator('.roll-inputs input').first()).toHaveValue('24');
    await expect(m.locator('.size-inputs input').first()).toHaveValue('46');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, /46 مدة و138 قطعة/);

    // المراحل: كلو دخل الخياطة، خلص 120، تالف 2
    await page.getByRole('button', { name: /تسجيل مرحلة/ }).click();
    await m.getByRole('button', { name: 'الكل', exact: true }).click();
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByRole('button', { name: /تسجيل مرحلة/ }).click();
    await m.getByRole('button', { name: /خلص/ }).click();
    const sizes = m.locator('.size-inputs input');
    for (const [i, v] of ['40', '42', '38'].entries()) await sizes.nth(i).fill(v);
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByRole('button', { name: /تسجيل مرحلة/ }).click();
    await m.getByRole('button', { name: 'تالف', exact: true }).click();
    await sizes.nth(2).fill('2');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(page.locator('.order-sheet .sheet-stats')).toContainText('120');

    // مصروف على الزبون
    await page.getByRole('button', { name: /مصروف/ }).click();
    await m.locator('.field', { hasText: 'النوع' }).locator('input').fill('استيك');
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('90');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, 'تم تسجيل المصروف');

    // تسليم كل المنجز مع فاتورة
    await page.getByRole('button', { name: /تسليم دفعة/ }).click();
    await m.getByRole('button', { name: /كل الجاهز \(120\)/ }).click();
    await m.getByRole('button', { name: /تسليم وطباعة الإشعار/ }).click();
    await toast(page, /تم التسليم وإصدار فاتورة/);
    await expect(page.locator('.order-sheet')).toContainText('230 يارد');
    await shot(page, '40-workshop-order-sheet');

    // حساب صاحب الشغل: 120 × 40 + 90 = 4,890 ثم دفعة 5,000 → صار علينا 110
    await nav(page, 'ورشة الخياطة');
    await page.getByRole('button', { name: 'حساب صاحب الشغل' }).click();
    await expect(page.locator('.account-view .grand')).toContainText('4,890.00');
    await page.getByRole('button', { name: /قبض دفعة/ }).click();
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('5000');
    await m.getByRole('button', { name: 'تسجيل' }).click();
    await expect(page.locator('.account-view .grand')).toContainText('صار علينا للزبون');
    await expect(page.locator('.account-view .grand')).toContainText('110.00');
    await shot(page, '41-workshop-account');
  } finally {
    await close();
  }
});
