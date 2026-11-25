import path from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

// سعر المستهلك لكل المواد مرة وحدة: ملف Excel فيه كود المادة و«سعر المستهلك» ← «استيراد من Excel»
test('consumer prices imported from Excel for existing items', async () => {
  const { page, app, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'جملة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveItem', { id: 'a', code: '0001', name: 'رز', kind: 'stock', unit: 'كيس', price: 500000, priceCurrency: 'SYP' });
    await call('saveItem', { id: 'b', code: '0002', name: 'سكر', kind: 'stock', unit: 'كيس', price: 300000, priceCurrency: 'SYP' });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('مواد');
    ws.addRow(['الكود', 'الاسم', 'سعر المستهلك']);
    ws.addRow(['0001', 'رز', 6000]);
    ws.addRow(['0002', 'سكر', 3500]);
    const file = path.join(path.dirname(home), 'consumer.xlsx');
    await wb.xlsx.writeFile(file);
    await app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as never;
    }, file);
    await nav(page, 'المواد');
    await page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await page.locator('.modal button.primary').first().click({ timeout: 5000 }).catch(() => undefined);
    await expect
      .poll(async () => {
        const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
        return [st.items.a?.consumerPrice, st.items.b?.consumerPrice, st.items.a?.price];
      }, { timeout: 8000 })
      .toEqual([600000, 350000, 500000]);
  } finally {
    await close();
  }
});
