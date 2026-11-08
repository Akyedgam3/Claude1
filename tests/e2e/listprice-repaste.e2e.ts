import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// زبون استورد المواد بسعر مبيع، وبعدين لصق النشرة (رمز ML-…، اسم، تعبئة، سعر): كل صنف لازم ياخد سعره هو
test('لصق نشرة فوق مواد مستوردة: كل صنف بيتحدّث سعره (الرمز ML مش التعبئة)', async () => {
  const { app, page, home, close } = await launch();
  try {
    const names = Array.from({ length: 30 }, (_, i) => `لمبة ماكس لايت ${i + 5} وات ضوء ${i % 2 ? 'شمسي' : 'أبيض'}`);
    const packs = names.map((_, i) => [100, 60, 20, 100, 10][i % 5]!);
    const prices = names.map((_, i) => (0.5 + i * 0.25).toFixed(2));
    const codes = names.map((_, i) => `ML-${String(i + 1).padStart(3, '0')}`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('المواد');
    ws.addRow(['الرمز', 'الاسم', 'الوحدة', 'الماركة', 'سعر المبيع', 'العملة']);
    names.forEach((n, i) => ws.addRow([codes[i], n, 'قطعة', 'ماكس لايت', Number(prices[i]), 'دولار']));
    const file = path.join(home, 'old.xlsx');
    await wb.xlsx.writeFile(file);

    await activate(page);
    await createCompany(page, { name: 'محل الإنارة', activity: 'كهربائيات' });
    await nav(page, 'المواد');
    await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as never; }, file);
    await page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await toast(page, 'تم استيراد 30 مادة');

    await nav(page, 'النشرات والحسومات');
    await page.getByRole('button', { name: /استيراد نشرة/ }).click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'اسم النشرة' }).locator('input').fill('ماكس لايت');
    const text = ['الرمز\tالاسم\tالتعبئة\tسعر النشرة', ...names.map((n, i) => `${codes[i]}\t${n}\t${packs[i]}\t${prices[i]}`)].join('\n');
    await m.locator('textarea').fill(text);
    await m.getByRole('button', { name: /^استيراد/ }).last().click();
    await toast(page, 'نشرة ماكس لايت: 0 صنف جديد و30 تحدّث سعره');
    // كل صنف سعر نشرته صح
    for (const i of [0, 3, 9, 19, 29]) {
      const row = page.locator('tr', { hasText: names[i]! }).first();
      await expect(row.locator('input').first()).toHaveValue(prices[i]!);
    }
  } finally {
    await close();
  }
});
