import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick } from './helpers';

// زبون: «بالفاتورة 26 بند يساع ماكسيموم»: فاتورة فيها بنود كتير بتطلع مضغوطة لحالها وبصفحة A4 وحدة،
// وسعر المبيع تحت الكلفة بيحمرّ وقت الكتابة.
test('a 26-line invoice prints compact on one A4 page; a price below cost turns red', async () => {
  const { app, page, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الجملة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveParty', { id: 'p', kind: 'customer', name: 'أبو خالد', phone: '0933111222', address: 'دمشق' });
    const lines = [];
    for (let i = 1; i <= 26; i++) {
      await call('saveItem', { id: `i${i}`, code: `C${i}`, name: `مادة رقم ${i} بعلبة كبيرة`, kind: 'stock', unit: 'قطعة', price: 150000, priceCurrency: 'SYP', attributes: { 'الماركة': 'ممتازة' } });
      lines.push({ itemId: `i${i}`, qty: 2, price: 150000 });
    }
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: lines.map((l) => ({ itemId: l.itemId, qty: 50, unitCost: 100000 })) });
    await call('postInvoice', { kind: 'sale', date: '2026-11-27', partyId: 'p', paid: 0, lines });
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').first().click();
    await expect(page.locator('.invoice-doc.doc-compact')).toHaveCount(1);
    // PDF A4: صفحة وحدة
    const out = path.join(home, 'inv.pdf');
    await app.evaluate(({ dialog }, f) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: f }); }, out);
    await page.locator('.page-header select.paper-select').first().selectOption('a4');
    await page.getByRole('button', { name: 'PDF', exact: true }).first().click();
    await expect.poll(() => fs.existsSync(out), { timeout: 20000 }).toBe(true);
    await page.waitForTimeout(500);
    if (process.env.SAVE_PDF) fs.copyFileSync(out, process.env.SAVE_PDF);
    const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [out]).toString())![1]);
    expect(pages).toBe(1);

    // تحت الكلفة: الكلفة 1,000، السعر 800 ← أحمر
    await nav(page, 'فاتورة مبيع');
    const row = page.locator('table.lines tbody tr').first();
    await pick(page, row.locator('.with-button input').first(), 'مادة رقم 3');
    const price = row.locator('input.num-input').nth(1);
    await price.fill('800');
    await expect(price).toHaveClass(/invalid/);
    await price.fill('1600');
    await expect(price).not.toHaveClass(/invalid/);
  } finally {
    await close();
  }
});
