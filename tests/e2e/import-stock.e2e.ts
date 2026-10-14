import path from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { activate, launch, nav, toast } from './helpers';

async function sheet(file: string, rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('المواد');
  for (const r of rows) ws.addRow(r);
  await wb.xlsx.writeFile(file);
}

test('big item list: import without quantities, then quantities from Excel, picker hint, add all to opening stock', async () => {
  const { app, page, home, close } = await launch();
  try {
    const plain = path.join(home, 'items.xlsx');
    const withQty = path.join(home, 'items-qty.xlsx');
    const items = Array.from({ length: 300 }, (_, i) => [`مادة رقم ${i + 1}`, String(i + 1), 'قطعة', 1000 + i]);
    await sheet(plain, [['الاسم', 'الرمز', 'الوحدة', 'سعر المبيع'], ...items]);
    // نفس الملف مع كمية وتكلفة لأول 120 مادة
    await sheet(withQty, [['الاسم', 'الرمز', 'الوحدة', 'سعر المبيع', 'الكمية', 'التكلفة'], ...items.map((r, i) => [...r, i < 120 ? 5 : '', i < 120 ? 700 : ''])]);
    const pickFile = (file: string) => app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as never;
    }, file);

    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'موبايلات' }).click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('محل الإكسسوارات');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();

    await nav(page, 'المواد');
    await pickFile(plain);
    await page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await toast(page, 'تم استيراد 300 مادة');

    // القائمة بتقول إنو في أكتر من 50
    await nav(page, 'عمليات المخزون');
    await page.getByRole('button', { name: 'الأرصدة الافتتاحية' }).click();
    await page.locator('input[placeholder="+ أضف مادة"]').click();
    await expect(page.locator('.picker-more')).toContainText('عم يظهر 50 من 300');
    await page.locator('input[placeholder="+ أضف مادة"]').fill('مادة رقم 299');
    await expect(page.locator('.picker-list li').first()).toContainText('مادة رقم 299');
    await page.keyboard.press('Escape');

    // كل المواد بالجدول، منعبّي وحدة بس، والباقي بيتجاهل
    await page.getByRole('button', { name: /أضف كل المواد للجدول/ }).click();
    const rows = page.locator('table.lines tbody tr', { hasText: 'مادة رقم' });
    await expect(rows).toHaveCount(300);
    const last = page.locator('table.lines tbody tr', { hasText: 'مادة رقم 300' });
    await last.locator('input.num-input').nth(0).fill('3');
    await last.locator('input.num-input').nth(1).fill('650');
    await page.getByRole('button', { name: 'حفظ الأرصدة الافتتاحية' }).click();
    await toast(page, 'تم تسجيل الأرصدة الافتتاحية');

    // إعادة الاستيراد بالكميات: بتنضاف للمواد اللي رصيدها صفر بس
    await nav(page, 'المواد');
    await pickFile(withQty);
    await page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await toast(page, /وتسجيل كميات 120 مادة/);
    const state = await page.evaluate(async () => {
      const s = (await (window as unknown as { mizan: { invoke: (c: string) => Promise<{ state: { stock: Record<string, { totalQty: number }>; items: Record<string, { code: string }> } }> } }).mizan.invoke('company:state'));
      const byCode = Object.fromEntries(Object.values(s.state.items).map((i) => [i.code, s.state.stock[(i as { id: string } & typeof i).id]?.totalQty ?? 0]));
      return { a: byCode['1'], b: byCode['120'], c: byCode['121'], d: byCode['300'] };
    });
    expect(state).toEqual({ a: 5, b: 5, c: 0, d: 3 });
    // مرة تانية ما بتتضاعف
    await page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await toast(page, /120 مادة إلها رصيد من قبل/);
  } finally {
    await close();
  }
});
