import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

// «بالملي»: ملصق الباركود لازم يعبّي ورقة الملصق بالضبط وبالنص (كان مزاح ~1.5 مم لجنب لأن النافذة كانت بالنص وعرضها صفر)،
// وختم «مدفوعة» ما بيغطّي جدول الفاتورة بأي تصميم.
test('barcode label fills the label page exactly, and the paid stamp never covers the invoice table', async () => {
  const { app, page, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مركز التقنية', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveItem', { id: 'hdd', code: '0001', barcode: '1111111111111', name: 'HDD 1 TB', kind: 'stock', unit: 'قطعة', price: 360000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'hdd', qty: 10, unitCost: 1000 }] });
    await call('postInvoice', { kind: 'sale', date: '2026-11-21', paid: 720000, lines: [{ itemId: 'hdd', qty: 2, price: 360000 }] });

    // الختم بكل التصاميم: فوق الجدول وما بيلمسه
    for (const template of ['modern', 'classic', 'minimal']) {
      await call('updateCompany', { address: 'الشارع الرئيسي', phone: '0911111111', print: { template } });
      await nav(page, 'الرئيسية');
      await nav(page, 'سجل الفواتير');
      await page.locator('table.table tbody tr').first().click();
      const gap = await page.evaluate(() => {
        const s = document.querySelector('.invoice-doc .doc-stamp')!.getBoundingClientRect();
        const t = document.querySelector('.invoice-doc .doc-lines thead')!.getBoundingClientRect();
        return t.top - s.bottom;
      });
      expect(gap, `stamp clear of the table (${template})`).toBeGreaterThanOrEqual(0);
    }

    // الطابعة: نفس الإعدادات اللي بتنبعت لويندوز ← PDF
    const out = path.join(home, 'labels.pdf');
    await app.evaluate(({ BrowserWindow }, file) => {
      for (const w of BrowserWindow.getAllWindows()) {
        const wc = w.webContents as any;
        wc.print = async (o: any, cb?: (ok: boolean) => void) => {
          const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: { width: o.pageSize.width / 25400, height: o.pageSize.height / 25400 }, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
          (process as any).getBuiltinModule('node:fs').writeFileSync(file, data);
          cb?.(true);
        };
      }
    }, out);
    await nav(page, 'المواد');
    await page.locator('tr', { hasText: 'HDD 1 TB' }).first().click();
    await page.locator('.modal').getByRole('button', { name: /ملصق|باركود/ }).first().click();
    // خلفية سودا للملصق بالطباعة بس: حتى نقيس حدوده على الورقة
    await page.addStyleTag({ content: '@media print { .label { background: #000 !important; } }' });
    await page.locator('.modal button.primary', { hasText: 'طباعة' }).last().click();
    await expect.poll(() => fs.existsSync(out)).toBe(true);
    let tool = true;
    try {
      execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    } catch {
      tool = false;
    }
    test.skip(!tool, 'pdftoppm مش منصّب');
    const info = execFileSync('pdfinfo', [out]).toString();
    expect(info).toMatch(/Pages:\s+1\b/);
    // 40×30 مم بـ 254 نقطة بالإنش = 10 نقاط بالملي: الأسود لازم يبدأ من 0 ويخلص بآخر الورقة
    execFileSync('pdftoppm', ['-r', '254', '-gray', '-singlefile', out, path.join(home, 'lab')]);
    const pgm = fs.readFileSync(path.join(home, 'lab.pgm'));
    const head = pgm.toString('latin1', 0, 40).split(/\s+/);
    const [w, h] = [Number(head[1]), Number(head[2])];
    const px = pgm.subarray(pgm.length - w * h);
    const row = Math.floor(h / 2);
    const dark = (x: number) => px[row * w + x]! < 100;
    let left = 0;
    while (left < w && !dark(left)) left++;
    let right = 0;
    while (right < w && !dark(w - 1 - right)) right++;
    expect(w).toBeGreaterThanOrEqual(399);
    expect(left, 'no gap on the left (in 0.1 mm)').toBeLessThanOrEqual(2);
    expect(right, 'no gap on the right (in 0.1 mm)').toBeLessThanOrEqual(2);
  } finally {
    await close();
  }
});
