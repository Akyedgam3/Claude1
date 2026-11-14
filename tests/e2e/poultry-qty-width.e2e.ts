import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// الدواجن: خانة الكمية (جنب زر الميزان) ما لازم تنضغط لما يطلع «آخر مرة» تحت السعر
test('الدواجن: خانة الكمية بتضل مقروءة جنب زر الميزان و«آخر مرة»', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مدجنة الاختبار', activity: 'توزيع فروج' });
    const m = page.locator('.modal');
    await nav(page, 'العملاء والموردون');
    await page.getByRole('button', { name: 'إضافة', exact: true }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('أبو سمير');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');
    await nav(page, 'المواد');
    const ITEMS = ['فروج حي', 'فروج مذبوح'];
    for (const n of ITEMS) {
      await page.locator('.page-header button.primary').first().click();
      await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill(n);
      await m.getByRole('button', { name: 'حفظ', exact: true }).click();
      await expect(m).toHaveCount(0);
      await page.locator('tbody tr', { hasText: n }).getByRole('button', { name: '+ كمية' }).click();
      await m.locator('.field', { hasText: 'الكمية المضافة' }).locator('input').fill('5000');
      await m.locator('.field', { hasText: 'تكلفة' }).locator('input').fill('150');
      await m.getByRole('button', { name: 'إضافة' }).click();
      await toast(page, 'تمت إضافة');
    }

    const sell = async (price: string, save: boolean) => {
      await nav(page, 'فاتورة مبيع');
      await pick(page, page.locator('.field', { hasText: 'العميل' }).locator('input').first(), 'أبو سمير');
      const rows = page.locator('table.lines tbody tr');
      for (const i of [0, 1]) {
        await pick(page, rows.nth(i).locator('.with-button input').first(), ITEMS[i]!);
        await rows.nth(i).locator('.qty-cell input').fill(i ? '1250.5' : '3');
        await rows.nth(i).locator('input.num-input').nth(1).fill(price);
      }
      if (!save) return rows;
      await page.getByRole('button', { name: 'دون قبض' }).click().catch(() => {});
      await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
      await toast(page, 'تم حفظ');
      return rows;
    };
    await sell('200', true);
    // لابتوب 1366 مع تكبير ويندوز 125% ≈ 1093 بكسل عرض
    await page.setViewportSize({ width: 1093, height: 700 });
    const rows = await sell('170', false);
    await expect(rows.first().locator('.last-price')).toContainText('آخر مرة');
    for (const i of [0, 1]) {
      const w = (await rows.nth(i).locator('.qty-cell input').boundingBox())!.width;
      expect(w, `عرض خانة الكمية بالسطر ${i + 1}`).toBeGreaterThanOrEqual(70);
      const d = (await rows.nth(i).locator('td[data-label="الخصم"] input').boundingBox())!.width;
      expect(d, `عرض خانة الخصم بالسطر ${i + 1}`).toBeGreaterThanOrEqual(60);
    }
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  } finally {
    await close();
  }
});
