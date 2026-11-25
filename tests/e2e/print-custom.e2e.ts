import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB5fY51AAAD8ElEQVR4nO3UMQ0AIADAMJQgDCW4Bwt8ZEmP/rs25l4HoGD8DgB4ZVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZF6aC7zpkJUB2AAAAAElFTkSuQmCC';
const TERMS = Array.from({ length: 9 }, (_, i) => `${i + 1}. البضاعة المباعة لا ترد ولا تستبدل بعد مرور ثلاثة أيام من تاريخ الفاتورة، ويجب الاحتفاظ بالفاتورة والكرتونة الأصلية لأي مراجعة أو كفالة.`).join('\n');
// شكوى: فاتورة فيها إضافات (سطر تحت الاسم، 3 رموز QR، شروط طويلة، توقيعات، سعر المستهلك) كانت تنطبع على 3-4 ورقات A5
// وعلى ورقتين بس مشان الشروط. هلق كل التصاميم وكل الورق بورقة وحدة.
test('customized invoice prints on one page in every design and paper', async () => {
  test.setTimeout(240000);
  const { app, page, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مركز الجملة للمواد الغذائية', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const names = ['كاري الطيبات 100غ', 'كمون ناعم 250غ', 'رز بسمتي 5كغ', 'سكر 1كغ', 'زيت دوار الشمس 1.8ل', 'شاي الغزالين 500غ', 'معكرونة درة', 'حمص حب 1كغ', 'عدس أحمر', 'سمنة نباتية 2كغ'];
    for (let i = 0; i < names.length; i++) await call('saveItem', { id: 'i' + i, code: '00' + i, name: names[i], kind: 'stock', unit: 'قطعة', price: 250000 + i * 1000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: names.map((_, i) => ({ itemId: 'i' + i, qty: 50, unitCost: 100 })) });
    await call('saveParty', { id: 'p', name: 'محمد زمار', kind: 'customer', phone: '0944000000' });
    await call('postInvoice', { kind: 'sale', date: '2026-11-21', partyId: 'p', paid: 0, lines: names.slice(0, 3).map((_, i) => ({ itemId: 'i' + i, qty: 1, price: 250000 })) });
    await call('postInvoice', { kind: 'sale', date: '2026-11-22', partyId: 'p', notes: 'التسليم يوم الخميس', lines: names.map((_, i) => ({ itemId: 'i' + i, qty: 2, price: 250000 })) });
    await app.evaluate(({ BrowserWindow }, dir) => {
      let n = 0;
      for (const w of BrowserWindow.getAllWindows()) {
        const wc = w.webContents as any;
        wc.print = async (o: any, cb?: (ok: boolean) => void) => {
          const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: typeof o.pageSize === 'object' ? { width: o.pageSize.width / 25400, height: o.pageSize.height / 25400 } : o.pageSize, ...(typeof o.pageSize === 'object' ? { margins: { top: 0, bottom: 0, left: 0, right: 0 } } : {}), ...(o.scaleFactor ? { scale: o.scaleFactor / 100 } : {}) });
          (process as any).getBuiltinModule('node:fs').writeFileSync(`${dir}/p-${++n}.pdf`, data);
          cb?.(true);
        };
      }
    }, home);
    let n = 0;
    for (const template of (process.env.TPL ?? 'modern,classic,minimal').split(',')) {
      await call('updateCompany', {
        address: 'دمشق - الحريقة - جانب البنك التجاري', phone: '0954518116',
        print: { template, logo: LOGO, receipt: { logo: 'banner' }, header: 'وكيل معتمد لمنتجات الطيبات والغزالين', footer: 'شكراً لتعاملكم معنا - نتمنى لكم يوماً سعيداً', qrLink: 'https://wa.me/963954518116', qrCaption: 'واتساب',
          extraQrs: [{ label: 'شام كاش', value: 'shamcash:123456789', kind: 'text' }, { label: 'فيسبوك', value: 'https://facebook.com/zenix', kind: 'link' }],
          terms: TERMS, showConsumerPrice: true, consumerMarkup: 15, showSignatures: true, showAmountInWords: true, showUsdEquivalent: true },
      });
      for (const paper of (process.env.PAPERS ?? 'a4,a5,80mm,58mm').split(',')) {
        await nav(page, 'الرئيسية');
        await nav(page, 'سجل الفواتير');
        await page.locator('table.table tbody tr').first().click();
        await page.locator('.invoice-doc').waitFor();
        await page.locator('select.paper-select').first().selectOption(paper);
        await page.getByRole('button', { name: 'طباعة' }).first().click();
        n++;
        const file = path.join(home, `p-${n}.pdf`);
        await expect.poll(() => fs.existsSync(file), { timeout: 15000 }).toBe(true);
        await page.waitForTimeout(400);
        let info = '';
        try {
          info = execFileSync('pdfinfo', [file]).toString();
        } catch {
          continue; // ما في pdfinfo
        }
        expect(/Pages:\s+(\d+)/.exec(info)![1], `${template} ${paper}`).toBe('1');
      }
    }
  } finally {
    await close();
  }
});
