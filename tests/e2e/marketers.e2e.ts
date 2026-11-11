import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// قسم المسوّقين: أحمد ومحمد، كل واحد بيشوف فواتيره اللي جابها وعمولته، والمالك بيدفعله
test('المسوّقين: فواتير كل مسوّق وعمولته ودفعها', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل التسويق', activity: 'تجارة عامة' });

    await nav(page, 'المسوّقين');
    await expect(page.getByText('ما في مسوّقين لسا')).toBeVisible();
    for (const [name, rate] of [['أحمد', '5'], ['محمد', '10']] as const) {
      await page.getByRole('button', { name: /مسوّق جديد/ }).click();
      const m = page.locator('.modal');
      await m.locator('.field', { hasText: 'الاسم' }).locator('input').fill(name);
      await m.locator('.field', { hasText: 'نسبته' }).locator('input').fill(rate);
      await m.getByRole('button', { name: 'حفظ' }).click();
      await toast(page, `تمت إضافة ${name} كمسوّق`);
    }

    // فواتير: 2 لأحمد (100,000 و 40,000) و 1 لمحمد (50,000)
    const sale = async (who: string, amount: string) => {
      await nav(page, 'فاتورة مبيع');
      const sel = page.locator('.field', { hasText: 'عن طريق مسوّق' }).locator('select');
      const value = await sel.locator('option', { hasText: who }).getAttribute('value');
      await sel.selectOption(value!);
      const line = page.locator('table.lines tbody tr').first();
      await line.locator('input.line-desc').fill('بضاعة');
      await line.locator('input.num-input').nth(0).fill('1');
      await line.locator('input.num-input').nth(1).fill(amount);
      await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
      await toast(page, 'تم حفظ');
    };
    await sale('أحمد', '100000');
    await sale('أحمد', '40000');
    await sale('محمد', '50000');

    await nav(page, 'المسوّقين');
    const ahmad = page.locator('.marketer-card', { hasText: 'أحمد' });
    const mohd = page.locator('.marketer-card', { hasText: 'محمد' });
    await expect(ahmad.locator('.marketer-nums')).toContainText('140,000');
    await expect(ahmad.locator('.marketer-nums')).toContainText('7,000'); // 5% من 140,000
    await expect(mohd.locator('.marketer-nums')).toContainText('5,000'); // 10% من 50,000
    // فواتير أحمد بس
    await ahmad.getByRole('button', { name: /فواتيره/ }).click();
    await expect(ahmad.locator('tbody tr')).toHaveCount(2);
    await expect(ahmad.locator('tbody')).toContainText('5,000');
    await expect(ahmad.locator('tbody')).toContainText('2,000');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

    // فاتورة الزبون (العرض والطباعة) ما فيها أي أثر للمسوّق أو العمولة
    await ahmad.locator('tbody tr').first().click();
    await expect(page.locator('.page')).toContainText('40,000');
    for (const hidden of ['أحمد', 'مسوّق', 'عمولة', '2,000']) await expect(page.locator('.page')).not.toContainText(hidden);
    const doc = page.locator('.commercial-doc, .print-doc, .invoice-doc').first();
    if (await doc.count()) for (const hidden of ['أحمد', 'عمولة']) await expect(doc).not.toContainText(hidden);
    await nav(page, 'المسوّقين');

    // دفع عمولة أحمد كاملة
    await ahmad.getByRole('button', { name: 'دفع العمولة' }).click();
    const pm = page.locator('.modal');
    await expect(pm).toContainText('7,000');
    await pm.getByRole('button', { name: /تسجيل الدفع|دفع/ }).last().click();
    await toast(page, 'تم دفع');
    await expect(ahmad.locator('.marketer-nums b.good')).toContainText('0');
    await expect(ahmad.getByRole('button', { name: 'دفع العمولة' })).toHaveCount(0);
    await expect(mohd.getByRole('button', { name: 'دفع العمولة' })).toBeVisible();

    // مسوّق بعمولة «ثلث الربح»
    await page.getByRole('button', { name: /مسوّق جديد/ }).click();
    const pf = page.locator('.modal');
    await pf.locator('.field', { hasText: 'الاسم' }).locator('input').fill('الشريك');
    await pf.locator('.field', { hasText: 'نسبته' }).locator('input').fill('33.33');
    await pf.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تمت إضافة الشريك كمسوّق');
    await expect(page.locator('.marketer-card', { hasText: 'الشريك' })).toContainText('من الربح');
  } finally {
    await close();
  }
});
