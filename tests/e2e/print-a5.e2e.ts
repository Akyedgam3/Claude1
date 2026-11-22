import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

// فاتورة A5 كانت تطلع مقصوصة من اليسار (حتى بالـPDF): التصغير لصفحة وحدة كان بخيار scale تبع الطباعة،
// واللي بيزيح الصفحة العربية لبرّا الورقة. هلق التصغير بـ zoom عالمحتوى: صفحة وحدة وبالنص بكل التصاميم.
test('A5 invoice fits one page, centred, in every design', async () => {
  const { app, page, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مركز التقنية', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const names = ['كاميرا wifi RSD-SMV24', 'كاميرا wifi RSD-SY38', 'كاميرا wifi RSD-SMQ13', 'بور سبلاي 5 أمبير', 'سويتش cudy 8port 1G GS108D', 'سويتش متفال جيجا', 'بور سبلاي 10A'];
    for (let i = 0; i < names.length; i++) await call('saveItem', { id: 'i' + i, code: '00' + i, name: names[i], kind: 'stock', unit: 'قطعة', price: 250000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: names.map((_, i) => ({ itemId: 'i' + i, qty: 50, unitCost: 100 })) });
    await call('saveParty', { id: 'p', name: 'محمد زمار', kind: 'customer' });
    await call('postInvoice', { kind: 'sale', date: '2026-11-21', partyId: 'p', lines: names.map((_, i) => ({ itemId: 'i' + i, qty: 2, price: 250000 })) });
    await app.evaluate(({ BrowserWindow }, dir) => {
      let n = 0;
      for (const w of BrowserWindow.getAllWindows()) {
        const wc = w.webContents as any;
        wc.print = async (o: any, cb?: (ok: boolean) => void) => {
          const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: o.pageSize, ...(o.scaleFactor ? { scale: o.scaleFactor / 100 } : {}) });
          (process as any).getBuiltinModule('node:fs').writeFileSync(`${dir}/a5-${++n}.pdf`, data);
          cb?.(true);
        };
      }
    }, home);
    let tool = true;
    try {
      execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    } catch {
      tool = false;
    }
    const templates = ['modern', 'classic', 'minimal'];
    for (const template of templates) {
      await call('updateCompany', { address: 'الدانا - الشارع الرئيسي شمال جامع الفاروق ب 100 متر', phone: '0954518116', print: { template, qrLink: 'https://wa.me/1' } });
      await nav(page, 'الرئيسية');
      await nav(page, 'سجل الفواتير');
      await page.locator('table.table tbody tr').first().click();
      await page.locator('.invoice-doc').waitFor();
      await page.locator('select.paper-select').first().selectOption('a5');
      await page.getByRole('button', { name: 'طباعة' }).first().click();
      const n = templates.indexOf(template) + 1;
      const file = path.join(home, `a5-${n}.pdf`);
      await expect.poll(() => fs.existsSync(file), { timeout: 15000 }).toBe(true);
      await page.waitForTimeout(500);
      if (!tool) continue;
      expect(execFileSync('pdfinfo', [file]).toString(), template).toMatch(/Pages:\s+1\b/);
      execFileSync('pdftoppm', ['-r', '50', '-gray', '-singlefile', file, path.join(home, `a5-${n}`)]);
      const pgm = fs.readFileSync(path.join(home, `a5-${n}.pgm`));
      const head = pgm.toString('latin1', 0, 40).split(/\s+/);
      const [w, h] = [Number(head[1]), Number(head[2])];
      const px = pgm.subarray(pgm.length - w * h);
      let left = w;
      let right = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * w + x]! < 235) { left = Math.min(left, x); right = Math.max(right, x); }
      // هامش يمين ويسار متساوي (بحدود نقطتين) ومش صفر (ما في شي مقصوص)
      expect(left, `${template} left margin`).toBeGreaterThan(5);
      expect(Math.abs(left - (w - 1 - right)), `${template} centred`).toBeLessThanOrEqual(2);
    }
  } finally {
    await close();
  }
});
