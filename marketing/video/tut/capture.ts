// يشغّل البرنامج الحقيقي وينفّذ خطوات الشرح ويصوّر كل حالة مع مواقع الأزرار (لتحريك المؤشر في الفيديو).
import fs from 'node:fs';
import path from 'node:path';
import { activate, createCompany, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';

const OUT = '/tmp/claude-0/-home-user-Claude1/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/tut/shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: { name: string; file: string; targets: Record<string, Box> }[] = [];

(async () => {
  const { page, app, close } = await launch();
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
    for (const [k, loc] of Object.entries(targets)) t[k] = await box(loc);
    const file = `${String(states.length + 1).padStart(2, '0')}_${name}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    states.push({ name, file, targets: t });
    console.log('snap', file, Object.keys(t).join(','));
  }
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الخير للمواد الغذائية', activity: 'تجارة عامة', username: 'admin' });
    await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));
    // بيانات أولية: أصناف موجودة، مورد، وسعر دولار
    await call('setRate', { date: new Date().toISOString().slice(0, 10), currency: 'USD', rate: 121, kind: 'market' });
    await call('saveParty', { id: 'sup', kind: 'supplier', name: 'شركة النجمة للتوزيع', phone: '0944 222 333' });
    const items = [
      ['0001', 'رز مصري 1 كغ', 1800, 'مواد غذائية', 40, 10, '6290001000017'],
      ['0002', 'سكر 1 كغ', 1200, 'مواد غذائية', 55, 10, '6290001000024'],
      ['0003', 'شاي أسود 400غ', 3800, 'مواد غذائية', 4, 8, '6290001000031'],
      ['0004', 'حليب طويل الأجل 1 لتر', 1500, 'ألبان', 30, 12, '6290001000048'],
      ['0005', 'معكرونة 500غ', 900, 'مواد غذائية', 70, 15, '6290001000055'],
      ['0006', 'مسحوق غسيل 3 كغ', 6500, 'منظفات', 12, 5, '6290001000062'],
      ['0007', 'قهوة عربية 250غ', 4200, 'مواد غذائية', 3, 10, '6290001000079'],
      ['0008', 'زيت زيتون 1 لتر', 9500, 'مواد غذائية', 2, 6, '6290001000086'],
    ] as const;
    for (const [code, name, price, cat, qty, min, bc] of items) {
      await call('saveItem', { id: code, code, name, kind: 'stock', unit: 'قطعة', price: price * 100, priceCurrency: 'SYP', category: cat, minStock: min, barcode: bc });
    }
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: items.map(([code, , price, , qty]) => ({ itemId: code, qty, unitCost: Math.round(price * 100 * 0.75) })) });
    await nav(page, 'الإعدادات');
    await nav(page, 'الرئيسية');

    // 1) الرئيسية → المواد
    await snap('dash', { navItems: page.locator('.sidebar nav button', { hasText: 'المواد' }) });
    await nav(page, 'المواد');
    await snap('items', { btnNew: page.getByRole('button', { name: /مادة جديدة/ }) });
    await page.getByRole('button', { name: /مادة جديدة/ }).click();
    const m = page.locator('.modal');
    const nameIn = m.locator('.field', { hasText: 'الاسم' }).first().locator('input');
    const codeIn = m.locator('.field', { hasText: 'الرمز' }).first().locator('input');
    const bcIn = m.locator('.field', { hasText: 'الباركود' }).locator('input');
    const catIn = m.locator('.field', { hasText: 'التصنيف' }).locator('input');
    const tabPrices = m.getByRole('button', { name: 'الأسعار والوحدات' });
    await snap('form0', { name: nameIn, code: codeIn, barcode: bcIn, cat: catIn });
    await nameIn.fill('زيت دوار الشمس - تنكة 8 لتر');
    await snap('form_name', { name: nameIn, code: codeIn });
    await bcIn.fill('6291100088012');
    await snap('form_barcode', { barcode: bcIn });
    await catIn.fill('مواد غذائية');
    await page.keyboard.press('Tab');
    await snap('form_cat', { cat: catIn, tabPrices });
    await tabPrices.click();
    const unitIn = m.locator('.field', { hasText: 'الوحدة الأساسية' }).locator('input');
    const priceIn = m.locator('.field', { hasText: 'سعر المبيع' }).locator('input');
    const minIn = m.locator('.field', { hasText: 'الحد الأدنى للتنبيه' }).locator('input');
    const addUnit = m.getByRole('button', { name: '+ وحدة' });
    const saveBtn = m.getByRole('button', { name: 'حفظ', exact: true });
    await snap('prices0', { unit: unitIn, price: priceIn, min: minIn, addUnit, save: saveBtn });
    await unitIn.fill('قطعة');
    await snap('prices_unit', { unit: unitIn });
    await priceIn.fill('15500');
    await snap('prices_price', { price: priceIn });
    const wholeIn = m.locator('.field', { hasText: 'سعر الجملة' }).locator('input');
    const hasWhole = (await wholeIn.count()) > 0;
    if (hasWhole) {
      await wholeIn.fill('15000');
      await snap('prices_whole', { whole: wholeIn });
    }
    await addUnit.click();
    const unitRow = m.locator('.field.wide table tbody tr').first();
    await unitRow.locator('input').nth(0).fill('كرتونة');
    await unitRow.locator('input').nth(1).fill('6');
    await unitRow.locator('input').nth(2).fill('90000');
    await snap('prices_carton', { cartonRow: unitRow, addUnit });
    await minIn.fill('10');
    await snap('prices_min', { min: minIn, save: saveBtn });
    await saveBtn.click();
    await page.waitForTimeout(300);
    const newRow = page.locator('table.table tbody tr', { hasText: 'زيت دوار الشمس' });
    await snap('items_saved', { newRow, navStock: page.locator('.sidebar nav button', { hasText: 'عمليات المخزون' }) });

    // 2) الأرصدة الافتتاحية
    await nav(page, 'عمليات المخزون');
    await snap('stockops', { tabOpening: page.getByRole('button', { name: 'الأرصدة الافتتاحية' }) });
    await page.getByRole('button', { name: 'الأرصدة الافتتاحية' }).click();
    const goodsPicker = page.locator('.card .picker input').last();
    await goodsPicker.scrollIntoViewIfNeeded();
    await snap('opening0', { picker: goodsPicker });
    await pick(page, goodsPicker, 'دوار');
    const orow = page.locator('table.lines').last().locator('tbody tr').filter({ hasText: 'دوار' }).last();
    await snap('opening_item', { row: orow, qty: orow.locator('input.num-input').nth(0), cost: orow.locator('input.num-input').nth(1) });
    await orow.locator('input.num-input').nth(0).fill('24');
    await snap('opening_qty', { qty: orow.locator('input.num-input').nth(0), cost: orow.locator('input.num-input').nth(1) });
    await orow.locator('input.num-input').nth(1).fill('12000');
    const saveOpening = page.getByRole('button', { name: 'حفظ الأرصدة الافتتاحية' });
    await saveOpening.scrollIntoViewIfNeeded();
    await snap('opening_cost', { cost: orow.locator('input.num-input').nth(1), save: saveOpening });
    await saveOpening.click();
    await page.waitForTimeout(300);
    await snap('opening_saved', { navPurchase: page.locator('.sidebar nav button', { hasText: 'فاتورة شراء' }) }, true);

    // 3) فاتورة شراء
    await nav(page, 'فاتورة شراء');
    const supPicker = page.locator('.field', { hasText: 'المورد' }).locator('.picker input');
    const scan = page.locator('.scan-input');
    await snap('purchase0', { supplier: supPicker, scan });
    await pick(page, supPicker, 'النجمة');
    await snap('purchase_supplier', { supplier: supPicker, scan });
    for (const code of ['6291100088012', '6290001000031']) {
      await scan.fill(code);
      await scan.press('Enter');
      await page.waitForTimeout(150);
    }
    const prow1 = page.locator('table.lines tbody tr').filter({ hasText: 'دوار' }).first();
    const prow2 = page.locator('table.lines tbody tr').filter({ hasText: 'شاي' }).first();
    await snap('purchase_items', { row1: prow1, row2: prow2 });
    // الكمية والسعر
    const qtyOf = (r: typeof prow1) => r.locator('td').nth(2).locator('input');
    const priceOf = (r: typeof prow1) => r.locator('td').nth(3).locator('input');
    await qtyOf(prow1).fill('48');
    await priceOf(prow1).fill('12500');
    await qtyOf(prow2).fill('20');
    await priceOf(prow2).fill('2900');
    const paidIn = page.locator('.totals .kv input.num-input').last();
    await snap('purchase_qty', { row1: prow1, row2: prow2, qty1: qtyOf(prow1), price1: priceOf(prow1), paid: paidIn });
    await paidIn.fill('500000');
    const savePurchase = page.getByRole('button', { name: /حفظ الفاتورة/ });
    await snap('purchase_paid', { paid: paidIn, save: savePurchase, debt: page.locator('.totals .kv strong.bad') });
    await savePurchase.click();
    await page.waitForTimeout(400);
    await snap('purchase_saved', { doc: page.locator('.invoice-doc'), total: page.locator('.invoice-doc .doc-totals .grand') });

    // 4) التأكد: المواد ثم الرئيسية
    await nav(page, 'المواد');
    const oilRow = page.locator('table.table tbody tr', { hasText: 'زيت دوار الشمس' });
    await snap('items_after', { oilRow, navItems: page.locator('.sidebar nav button', { hasText: 'المواد' }), excel: page.getByRole('button', { name: 'استيراد من Excel' }) });
    await nav(page, 'الرئيسية');
    const lowCard = page.locator('section.card', { hasText: 'نواقص' });
    await snap('dash_low', { low: lowCard });
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
    console.log('DONE', states.length);
  } catch (e) {
    console.error('FAILED', (e as Error).message);
    await page.screenshot({ path: path.join(OUT, 'error.png') });
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  } finally {
    await close();
    void app;
  }
})();
