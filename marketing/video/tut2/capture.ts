// الشرح الثاني: البيع والطباعة — يصوّر البرنامج الحقيقي مع مواقع الأزرار.
import fs from 'node:fs';
import path from 'node:path';
import { activate, createCompany, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';

const OUT = '/tmp/claude-0/-home-user-Claude1/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/tut2/shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: { name: string; file: string; targets: Record<string, Box> }[] = [];

(async () => {
  const { page, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const call = (method: string, ...args: unknown[]) => page.evaluate(([m, a]) => (window as any).mizan.invoke('company:call', m, a), [method, args] as const);
  const box = async (loc: ReturnType<typeof page.locator>): Promise<Box> => {
    const b = await loc.first().boundingBox();
    if (!b) throw new Error('no box');
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  async function snap(name: string, targets: Record<string, ReturnType<typeof page.locator>> = {}, keepToast = false) {
    await page.addStyleTag({ content: `.toast{display:${keepToast ? 'block' : 'none'}!important} input,textarea{caret-color:transparent!important}` });
    await page.waitForTimeout(250);
    const t: Record<string, Box> = {};
    for (const [k, loc] of Object.entries(targets)) {
      try {
        t[k] = await box(loc);
      } catch {
        console.log('  (no box)', name, k);
      }
    }
    const file = `${String(states.length + 1).padStart(2, '0')}_${name}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    states.push({ name, file, targets: t });
    console.log('snap', file, Object.keys(t).join(','));
  }
  const navBtn = (label: string) => page.locator('.sidebar nav button', { hasText: label }).first();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الخير للمواد الغذائية', activity: 'تجارة عامة', username: 'admin' });
    await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));
    const today = new Date().toISOString().slice(0, 10);
    await call('setRate', { date: today, currency: 'USD', rate: 121, kind: 'market' });
    await call('saveTax', { id: 'consumption', name: 'ضريبة الإنفاق الاستهلاكي', percent: 5, accountId: '2103', active: false });
    await call('saveParty', { id: 'c1', kind: 'customer', name: 'أبو خالد', phone: '0933 111 222' });
    await call('saveParty', { id: 'c2', kind: 'customer', name: 'ميني ماركت الريان', phone: '0944 555 666', priceTier: 'wholesale' });
    const items = [
      ['0001', 'حليب طويل الأجل 1 لتر', 1500, 1350, 'ألبان', '6290001000048'],
      ['0002', 'رز مصري 1 كغ', 1800, 1650, 'مواد غذائية', '6290001000017'],
      ['0003', 'سكر 1 كغ', 1200, 1100, 'مواد غذائية', '6290001000024'],
      ['0004', 'شاي أسود 400غ', 3800, 3500, 'مواد غذائية', '6290001000031'],
      ['0005', 'معكرونة 500غ', 900, 800, 'مواد غذائية', '6290001000055'],
      ['0006', 'زيت دوار الشمس - تنكة 8 لتر', 15500, 15000, 'مواد غذائية', '6291100088012'],
      ['0007', 'مسحوق غسيل 3 كغ', 6500, 6000, 'منظفات', '6290001000062'],
      ['0008', 'قهوة عربية 250غ', 4200, 3900, 'مواد غذائية', '6290001000079'],
      ['0009', 'بسكويت شوكولا', 600, 520, 'حلويات', '6290001000093'],
    ] as const;
    for (const [code, name, price, whole, cat, bc] of items) {
      await call('saveItem', { id: code, code, name, kind: 'stock', unit: 'قطعة', price: price * 100, wholesalePrice: whole * 100, priceCurrency: 'SYP', category: cat, minStock: 5, barcode: bc });
    }
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: items.map(([code, , price]) => ({ itemId: code, qty: 60, unitCost: Math.round(price * 100 * 0.75) })) });
    await call('updateCompany', { phone: '0944 123 456', address: 'دمشق — الميدان', print: { showAmountInWords: true, footer: 'شكراً لزيارتكم — البضاعة المباعة لا ترد بعد 7 أيام', color: '#0f6e5c', template: 'modern', showSignatures: false } });
    await nav(page, 'الإعدادات');
    await nav(page, 'الرئيسية');

    // ── نقطة البيع
    await snap('dash', { navPos: navBtn('نقطة البيع'), navSale: navBtn('فاتورة مبيع') });
    await nav(page, 'نقطة البيع');
    await page.getByLabel('طباعة الإيصال تلقائياً').uncheck();
    const scan = page.locator('.scan-input');
    const tile = (n: string) => page.locator('.pos-item', { hasText: n }).first();
    const received = page.locator('.pos-totals input.big-input');
    const payCash = page.getByRole('button', { name: 'دفع نقداً' });
    const payCredit = page.getByRole('button', { name: 'على الحساب' });
    const search = page.locator('input[placeholder="بحث بالاسم..."]');
    const party = page.locator('.pos-cart .picker input');
    const auto = page.locator('label', { hasText: 'طباعة الإيصال تلقائياً' });
    await snap('pos0', { scan, tileMilk: tile('حليب'), search, received, payCash, payCredit, party, auto, total: page.locator('.pos-totals') });
    await scan.fill('6290001000048');
    await scan.press('Enter');
    await snap('pos_scan1', { line1: page.locator('.pos-line').first(), scan });
    await scan.fill('6290001000048');
    await scan.press('Enter');
    await snap('pos_scan2', { qty: page.locator('.pos-line').first().locator('.qty-box') });
    await tile('رز').click();
    await snap('pos_tile', { tileRice: tile('رز'), line2: page.locator('.pos-line').nth(1) });
    await search.fill('قهوة');
    await snap('pos_search', { search, tileCoffee: tile('قهوة') });
    await tile('قهوة').click();
    await search.fill('');
    await snap('pos_cart', { total: page.locator('.pos-totals'), grand: page.locator('.pos-totals .grand').last() });
    await received.fill('20000');
    await snap('pos_received', { received, change: page.locator('.pos-totals').getByText('الباقي للزبون').locator('..'), payCash });
    await payCash.click();
    await page.waitForTimeout(300);
    await snap('pos_paid', { payCash, auto }, true);
    // دين على الحساب
    await scan.fill('6290001000031');
    await scan.press('Enter');
    await scan.fill('6290001000031');
    await scan.press('Enter');
    await pick(page, party, 'أبو خالد');
    await snap('pos_party', { party, payCredit });
    await payCredit.click();
    await page.waitForTimeout(300);
    await snap('pos_credit', { payCredit, auto }, true);

    // إيصال حراري لآخر فاتورة نقدية
    await nav(page, 'سجل الفواتير');
    await page.locator('table.table tbody tr').last().click();
    await page.waitForTimeout(300);
    await page.evaluate(() => (document.body.dataset['paper'] = '80mm'));
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 302, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'receipt.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => delete document.body.dataset['paper']);
    await page.setViewportSize({ width: 1600, height: 1000 });

    // ── فاتورة مبيع
    await nav(page, 'فاتورة مبيع');
    const custPicker = page.locator('.field', { hasText: 'العميل' }).locator('.picker input');
    const plusParty = page.locator('.field', { hasText: 'العميل' }).locator('button[title="إضافة جديد"]');
    const scan2 = page.locator('.scan-input');
    await snap('sale0', { navSale: navBtn('فاتورة مبيع'), cust: custPicker, plus: plusParty, scan: scan2 });
    await pick(page, custPicker, 'الريان');
    await snap('sale_cust', { cust: custPicker, tier: page.locator('.field', { hasText: 'العميل' }).locator('small') });
    for (const code of ['6291100088012', '6290001000017', '6290001000031']) {
      await scan2.fill(code);
      await scan2.press('Enter');
      await page.waitForTimeout(120);
    }
    const lineRow = (n: string) => page.locator('table.lines tbody tr').filter({ hasText: n }).first();
    const qtyIn = (n: string) => lineRow(n).locator('td').nth(2).locator('input');
    await qtyIn('دوار').fill('10');
    await qtyIn('رز').fill('20');
    await qtyIn('شاي').fill('12');
    await snap('sale_items', { scan: scan2, rows: page.locator('table.lines tbody'), price1: lineRow('دوار').locator('td').nth(3).locator('input') });
    const discLine = lineRow('دوار').locator('td').nth(4).locator('input');
    await discLine.fill('5000');
    const discInv = page.locator('.totals .kv input.num-input').first();
    await discInv.fill('2000');
    const taxBox = page.locator('label', { hasText: 'ضريبة الإنفاق' }).first();
    await snap('sale_disc', { discLine, discInv, tax: taxBox });
    const paidIn = page.locator('.totals .kv input.num-input').last();
    await paidIn.fill('150000');
    const currency = page.locator('.field', { hasText: 'العملة' }).locator('select');
    const saveBtn = page.getByRole('button', { name: /حفظ الفاتورة/ });
    await snap('sale_paid', { paid: paidIn, debt: page.locator('.totals .kv strong.bad'), currency, save: saveBtn, totals: page.locator('.totals') });
    await saveBtn.click();
    await page.waitForTimeout(500);
    const paper = page.locator('.paper-select').first();
    await snap('invoice', {
      paper,
      print: page.getByRole('button', { name: 'طباعة' }).first(),
      pdf: page.getByRole('button', { name: 'PDF' }).first(),
      copy: page.getByRole('button', { name: 'نسخ كنص' }),
      stamp: page.locator('.invoice-doc .doc-stamp'),
      qr: page.locator('.invoice-doc .doc-qr'),
      head: page.locator('.invoice-doc .doc-head'),
      doc: page.locator('.invoice-doc'),
    });
    await page.locator('.content').evaluate((el) => el.scrollTo(0, 400));
    await snap('invoice_bottom', { qr: page.locator('.invoice-doc .doc-qr'), totals: page.locator('.invoice-doc .doc-totals') });
    await page.locator('.content').evaluate((el) => el.scrollTo(0, 0));
    // إيصال حراري للفاتورة
    await page.evaluate(() => (document.body.dataset['paper'] = '80mm'));
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 302, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'invoice80.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => delete document.body.dataset['paper']);
    await page.setViewportSize({ width: 1600, height: 1000 });

    // ── تصميم الفاتورة
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الطباعة والفواتير' }).click();
    const card = (n: string) => page.locator('.template-card', { hasText: n });
    await snap('design_modern', { navSettings: navBtn('الإعدادات'), tabPrint: page.getByRole('button', { name: 'الطباعة والفواتير' }), modern: card('عصري'), classic: card('كلاسيكي'), minimal: card('بسيط'), swatches: page.locator('.swatches'), preview: page.locator('.designer-preview') });
    await card('كلاسيكي').click();
    await snap('design_classic', { classic: card('كلاسيكي') });
    await card('بسيط').click();
    await snap('design_minimal', { minimal: card('بسيط') });
    await card('عصري').click();
    await page.locator('.swatch').nth(1).click();
    await snap('design_blue', { swatches: page.locator('.swatches') });
    await page.locator('.swatch').nth(2).click();
    await snap('design_purple', { swatches: page.locator('.swatches') });
    await page.locator('.swatch').nth(0).click();

    // ── إغلاق اليوم
    await nav(page, 'التقارير');
    await snap('reports', { navReports: navBtn('التقارير'), tabDaily: page.getByRole('button', { name: 'إغلاق اليوم' }) });
    await page.getByRole('button', { name: 'إغلاق اليوم' }).click();
    await snap('daily', { card: page.locator('.daily-card').first(), stats: page.locator('.stats').first() });
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
    console.log('DONE', states.length);
  } catch (e) {
    console.error('FAILED', (e as Error).message);
    await page.screenshot({ path: path.join(OUT, 'error.png') });
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  } finally {
    await close();
  }
})();
