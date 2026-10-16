// شرح السوبرماركت: لقطات حقيقية (فاتح) بالبيانات التجريبية.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from '/home/user/Claude1/node_modules/exceljs';
import { activate, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';
const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/smt/assets/shots';
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, Record<string, Box>> = {};
const XL: (string | number)[][] = [
  ['الاسم', 'الباركود', 'التصنيف', 'الوحدة', 'سعر المبيع', 'الكمية', 'التكلفة'],
  ['شيبس بطاطا 50غ', '6210006000011', 'سكاكر', 'قطعة', 500, 120, 380],
  ['قهوة عربية 200غ', '6210006000028', 'مواد غذائية', 'قطعة', 9500, 30, 8200],
  ['معجون طماطم 400غ', '6210006000035', 'معلبات', 'قطعة', 1600, 60, 1350],
  ['شامبو 400مل', '6210006000042', 'منظفات', 'قطعة', 4200, 24, 3500],
  ['سائل جلي 1 لتر', '6210006000059', 'منظفات', 'قطعة', 2600, 36, 2150],
  ['عصير برتقال 1 لتر', '6210006000066', 'مشروبات', 'قطعة', 1800, 48, 1450],
  ['محارم ورقية', '6210006000073', 'منظفات', 'قطعة', 1300, 80, 1050],
  ['حلاوة طحينية 500غ', '6210006000080', 'مواد غذائية', 'قطعة', 4800, 20, 4000],
  ['مربى مشمش 400غ', '6210006000097', 'معلبات', 'قطعة', 3200, 25, 2700],
  ['بيض (صحن 30)', '6210006000103', 'ألبان وأجبان', 'صحن', 14000, 15, 12500],
];
(async () => {
  const { app, page, home, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  type Loc = ReturnType<typeof page.locator>;
  const top = () => page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { if ((e as HTMLElement).scrollTop) (e as HTMLElement).scrollTop = 0; }); window.scrollTo(0, 0); });
  const hideToast = (on: boolean) => page.evaluate((on) => { const el = document.getElementById('snapcss'); if (on && !el) { const st = document.createElement('style'); st.id = 'snapcss'; st.textContent = '.toast{display:none!important} input,textarea{caret-color:transparent!important}'; document.head.appendChild(st); } if (!on && el) el.remove(); }, on);
  async function snap(name: string, t: Record<string, Loc> = {}, keepScroll = false, toast = false) {
    if (!keepScroll) await top();
    await hideToast(!toast);
    await page.waitForTimeout(350);
    states[name] = {};
    for (const [k, l] of Object.entries(t)) {
      const b = await l.first().boundingBox({ timeout: 2500 }).catch(() => null);
      if (b) states[name][k] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      else console.log('  nobox', name, k);
    }
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('snap', name);
  }
  const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.log('STEP FAIL', label, (e as Error).message.split('\n')[0]); await page.keyboard.press('Escape').catch(() => {}); } };
  const m = page.locator('.modal');
  const btn = (name: string | RegExp, exact = false) => page.getByRole('button', { name, exact }).first();
  const esc = async () => { await page.keyboard.press('Escape'); await m.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {}); };
  const fld = (scope: Loc, label: string) => scope.locator('.field', { hasText: label }).first().locator('input, select, textarea').first();
  async function printShot(file: string, width: number, paper: string) {
    await page.evaluate((p) => (document.body.dataset['paper'] = p), paper);
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => delete document.body.dataset['paper']);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(300);
  }
  try {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('المواد'); XL.forEach((r) => ws.addRow(r));
    const xfile = path.join(home, 'بضاعة-المحل.xlsx'); await wb.xlsx.writeFile(xfile);
    fs.writeFileSync(path.join(OUT, 'excel.json'), JSON.stringify(XL));
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    const act = page.locator('.activity', { hasText: 'سوبرماركت' }).first();
    await act.click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('سوبرماركت الخير');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await snap('new_company', { act });
    await page.locator('.demo-check input').check();
    await btn('إنشاء الشركة').click();
    await btn('حفظته، تابع').click();
    await page.locator('.sidebar').waitFor();
    await page.waitForTimeout(500);
    await snap('dash', { side: page.locator('.sidebar nav'), stats: page.locator('.stats').first(), pos: page.locator('.sidebar nav button', { hasText: 'نقطة البيع' }), items: page.locator('.sidebar nav button', { hasText: /^المواد|الأصناف/ }) });
    await step('alerts', async () => {
      const low = page.locator('section', { hasText: 'نواقص' }).last();
      await low.scrollIntoViewIfNeeded();
      await snap('dash_alerts', { low, exp: page.locator('section', { hasText: 'صلاحيتها' }).last() }, true);
    });

    await nav(page, 'المواد');
    await snap('items', { table: page.locator('table.table').first(), add: btn(/صنف جديد/), imp: btn('استيراد من Excel'), cats: page.locator('.toolbar select, select').first() });
    await step('new item', async () => {
      await btn(/صنف جديد/).click();
      await fld(m, 'الاسم').fill('زيت دوار الشمس 1.8 لتر');
      const cat = fld(m, 'التصنيف'); await cat.fill('مواد غذائية');
      await fld(m, 'الباركود').fill('6210001000123');
      await snap('item_new', { modal: m, name: m.locator('.field', { hasText: 'الاسم' }), cat: m.locator('.field', { hasText: 'التصنيف' }), bc: m.locator('.field', { hasText: 'الباركود' }) });
      await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
      await fld(m, 'سعر المبيع (مفرق)').fill('3900');
      await fld(m, 'سعر الجملة').fill('3650').catch(() => console.log('  nowhole'));
      await m.getByRole('button', { name: '+ وحدة' }).click();
      const ur = m.locator('table tbody tr').last();
      await ur.locator('input').nth(0).fill('كرتونة');
      await ur.locator('input').nth(1).fill('12');
      await ur.locator('input').nth(2).fill('45000');
      await snap('item_units', { modal: m, base: m.locator('.field', { hasText: 'الوحدة الأساسية' }), retail: m.locator('.field', { hasText: 'سعر المبيع (مفرق)' }), whole: m.locator('.field', { hasText: 'سعر الجملة' }), units: m.locator('table').first(), carton: ur });
      await m.getByRole('button', { name: 'حفظ' }).click();
      await page.waitForTimeout(400); await esc();
    });
    await step('import', async () => {
      await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as never; }, xfile);
      await snap('items_imp', { imp: btn('استيراد من Excel') });
      await btn('استيراد من Excel').click();
      await hideToast(false); await page.locator('.toast').first().waitFor({ timeout: 8000 });
      await page.locator('input[placeholder^="ابحث بالاسم"]').fill('').catch(() => {});
      await snap('items_after', { toast: page.locator('.toast').last(), table: page.locator('table.table').first() }, false, true);
      await page.waitForTimeout(3500);
    });
    await nav(page, 'عمليات المخزون');
    await step('opening', async () => {
      await btn('الأرصدة الافتتاحية').click();
      await page.waitForTimeout(300);
      await snap('opening0', { all: btn(/أضف كل المواد للجدول/) });
      await btn(/أضف كل المواد للجدول/).click();
      await page.waitForTimeout(400);
      const rows = page.locator('table.lines tbody tr');
      const vals: [number, string, string][] = [[0, '40', '1650'], [1, '25', '1100'], [2, '12', '3500'], [4, '30', '590']];
      for (const [i, q, c] of vals) { await rows.nth(i).locator('input.num-input').nth(0).fill(q); await rows.nth(i).locator('input.num-input').nth(1).fill(c); }
      await snap('opening', { table: page.locator('table.lines').last(), all: btn(/أضف كل المواد للجدول/), row: rows.nth(3), save: btn('حفظ الأرصدة الافتتاحية') });
    });

    await nav(page, 'المواد');
    await step('weighed', async () => {
      await btn(/صنف جديد/).click();
      await fld(m, 'الاسم').fill('جبنة عكاوي');
      await fld(m, 'الرمز').fill('105');
      await fld(m, 'التصنيف').fill('ألبان وأجبان');
      await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
      await fld(m, 'الوحدة الأساسية').fill('كيلو');
      await fld(m, 'سعر المبيع (مفرق)').fill('62000');
      await m.getByRole('button', { name: 'التتبع' }).click();
      await m.getByText('يُباع بالوزن').click();
      await snap('item_weighed', { modal: m, w: m.locator('label.check', { hasText: 'بالوزن' }) });
      await m.getByText('تتبع الدفعات وتواريخ الصلاحية').click();
      await snap('item_expiry', { modal: m, exp: m.locator('label.check', { hasText: 'الصلاحية' }), w: m.locator('label.check', { hasText: 'بالوزن' }) });
      await m.getByRole('button', { name: 'حفظ' }).click();
      await page.waitForTimeout(400); await esc();
    });

    await nav(page, 'فاتورة شراء');
    await step('purchase', async () => {
      await pick(page, page.locator('.field', { hasText: 'المورد' }).locator('input').first(), 'النجمة');
      for (const code of ['6210002000016', '6210001000017', '6210003000015']) { await page.locator('.scan-input').fill(code); await page.locator('.scan-input').press('Enter'); await page.waitForTimeout(200); }
      const rows = page.locator('table.lines tbody tr');
      await rows.nth(0).locator('input.num-input').nth(0).fill('24');
      await rows.nth(0).locator('input.num-input').nth(1).fill('1350');
      await rows.nth(0).locator('input[placeholder="رقم الدفعة"]').fill('L-2611');
      const d = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      await rows.nth(0).locator('input[type=date]').fill(d);
      await rows.nth(1).locator('input.num-input').nth(0).fill('20');
      await rows.nth(1).locator('input.num-input').nth(1).fill('1650');
      await rows.nth(2).locator('input.num-input').nth(0).fill('48');
      await rows.nth(2).locator('input.num-input').nth(1).fill('350');
      await snap('purchase_batch', { batch: rows.nth(0).locator('input[placeholder="رقم الدفعة"]'), exp: rows.nth(0).locator('input[type=date]'), row: rows.nth(0) });
      const paid = page.locator('.kv').first().locator('input').nth(1);
      await paid.fill('50000').catch(() => console.log('  nopaid'));
      await page.waitForTimeout(250);
      await snap('purchase', { party: page.locator('.field', { hasText: 'المورد' }), scan: page.locator('.scan-input'), lines: page.locator('table.lines').first(), paid, totals: page.locator('.kv').first() });
      await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
      await page.waitForTimeout(500);
    });

    await nav(page, 'نقطة البيع');
    const bottom = () => page.evaluate(() => document.querySelectorAll('.pos-lines').forEach((e) => (e.scrollTop = e.scrollHeight)));
    const scan = async (code: string) => { await page.locator('.scan-input').fill(code); await page.locator('.scan-input').press('Enter'); await page.waitForTimeout(250); await bottom(); };
    await snap('pos_empty', { scan: page.locator('.scan-input'), tiles: page.locator('.pos-items, .pos-grid').first(), cart: page.locator('.pos-lines').first() });
    await step('pos', async () => {
      await scan('6210001000017'); await scan('6210002000016'); await scan('6210003000015');
      await snap('pos_scan', { scan: page.locator('.scan-input'), cart: page.locator('.pos-lines').first(), totals: page.locator('.pos-totals').first() });
      await page.locator('.scan-input').fill('2100101007507');
      await snap('pos_scale0', { scan: page.locator('.scan-input') });
      await page.locator('.scan-input').press('Enter'); await page.waitForTimeout(300); await bottom();
      await snap('pos_scale', { cart: page.locator('.pos-lines').first(), cheese: page.locator('.pos-line-wrap', { hasText: 'جبنة' }).first() }, true);
      const oil = page.locator('.pos-item', { hasText: 'زيت دوار الشمس 1 لتر' }).first().locator('xpath=..');
      await oil.locator('.unit-chips button', { hasText: 'كرتونة' }).click().catch(() => console.log('  nocarton'));
      await page.waitForTimeout(250); await bottom();
      await snap('pos_carton', { chip: oil.locator('.unit-chips'), tile: oil, carton: page.locator('.pos-line-wrap', { hasText: 'زيت' }).last(), cart: page.locator('.pos-lines').first() }, true);
      const rec = page.locator('.big-input').first();
      await rec.fill('100000');
      await snap('pos_pay', { rec, change: page.locator('.pos-totals strong.good, .pos-totals strong.bad').last(), pay: btn(/دفع نقداً/), totals: page.locator('.pos-totals').first(), hold: btn(/تعليق الفاتورة/), credit: btn('على الحساب', true) });
      await btn(/تعليق الفاتورة/).click();
      await page.waitForTimeout(400);
      await snap('pos_held', { held: page.locator('.held-bar'), cart: page.locator('.pos-lines').first() });
      await scan('6210004000014'); await scan('6210001000024');
      await pick(page, page.locator('.pos-cart .picker input, .pos .picker input').first(), 'أبو خالد').catch(() => console.log('  nocust'));
      await page.waitForTimeout(250);
      await snap('pos_credit', { cust: page.locator('.pos-cart .picker, .pos .picker').first(), credit: btn('على الحساب', true), cart: page.locator('.pos-lines').first() });
      await btn('على الحساب', true).click();
      await page.waitForTimeout(500);
      await printShot('receipt.png', 302, '80mm');
    });

    await nav(page, 'سندات القبض والدفع');
    await step('voucher', async () => {
      await btn('سند قبض').click().catch(() => {});
      await pick(page, page.locator('.field', { hasText: 'الاسم' }).locator('.picker input'), 'أبو خالد');
      await fld(page.locator('.page'), 'المبلغ').fill('25000');
      await fld(page.locator('.page'), 'البيان').fill('دفعة من الحساب');
      await snap('voucher', { form: page.locator('form').first(), from: page.locator('.field', { hasText: 'الاسم' }), amount: page.locator('.field', { hasText: 'المبلغ' }).first(), save: btn('حفظ السند') });
      await btn('حفظ السند').click();
      await page.waitForTimeout(600);
      await snap('voucher_print', { modal: m, doc: m.locator('.print-area, .invoice-doc').first() });
      await esc();
    });
    await esc();
    await nav(page, 'العملاء والموردون');
    await step('party', async () => {
      await page.locator('table.table tbody tr', { hasText: 'أبو خالد' }).first().click();
      await page.waitForTimeout(500);
      await snap('party', { table: page.locator('table.table').last(), card: page.locator('.stats, .kv').first() });
    });
    await nav(page, 'التقارير');
    await step('daily', async () => { await btn('إغلاق اليوم').click(); await page.waitForTimeout(500); await snap('daily', { main: page.locator('.content') }); });
    await step('income', async () => {
      await btn('الأرباح والخسائر').click();
      const td = await page.evaluate(() => new Date().toISOString().slice(0, 10));
      await page.locator('input[type=date]').first().fill(td);
      await page.locator('h1, .page-header h2').first().click().catch(() => {});
      await page.waitForTimeout(400);
      await snap('income', { main: page.locator('.content') });
    });
  } catch (e) {
    console.error('FAILED', (e as Error).message.split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, 'error.png') });
  } finally {
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
    await close();
  }
})();
