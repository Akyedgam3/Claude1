import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, waitForFile } from './helpers';

// نقل المواد مع المخزون وسعر الشراء من شركة لشركة: «Excel» من المواد بالقديمة ← «استيراد من Excel» بالجديدة (بدون تعديل الملف)
test('items move to a new company with their stock and purchase cost', async () => {
  const old = await launch();
  let file = '';
  try {
    await activate(old.page);
    await createCompany(old.page, { name: 'الشركة القديمة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => old.page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveItem', { id: 'a', code: '0001', name: 'رز', kind: 'stock', unit: 'كيس', price: 500000, priceCurrency: 'SYP' });
    await call('saveItem', { id: 'b', code: '0002', name: 'سكر', kind: 'stock', unit: 'كيس', price: 300000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'a', qty: 12, unitCost: 420000 }, { itemId: 'b', qty: 7, unitCost: 250050 }] });
    await nav(old.page, 'المواد');
    await old.page.getByRole('button', { name: 'Excel', exact: true }).click();
    file = await waitForFile(old.home, '.xlsx');
    file = fs.copyFileSync(file, path.join(path.dirname(old.home), 'moved-items.xlsx')) ?? path.join(path.dirname(old.home), 'moved-items.xlsx');
  } finally {
    await old.close();
  }

  const neu = await launch();
  try {
    await activate(neu.page);
    await createCompany(neu.page, { name: 'الشركة الجديدة', activity: 'تجارة عامة' });
    await neu.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as never;
    }, file);
    await nav(neu.page, 'المواد');
    await neu.page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await neu.page.locator('.modal button.primary').first().click({ timeout: 5000 }).catch(() => undefined);
    await expect
      .poll(async () => {
        const st = (await neu.page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
        const it = Object.values(st.items as Record<string, { id: string; name: string }>);
        const rice = it.find((i) => i.name === 'رز');
        const sugar = it.find((i) => i.name === 'سكر');
        return rice && sugar ? [st.stock[rice.id]?.totalQty, st.stock[rice.id]?.value, st.stock[sugar.id]?.totalQty, st.stock[sugar.id]?.value] : null;
      }, { timeout: 8000 })
      .toEqual([12, 12 * 420000, 7, 7 * 250050]);
  } finally {
    await neu.close();
  }
});
