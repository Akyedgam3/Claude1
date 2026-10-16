// شرح الموبايلات والكمبيوتر: لقطات حقيقية بالبيانات التجريبية.
import fs from 'node:fs';
import path from 'node:path';
import { activate, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';
const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/elec/assets/shots';
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, Record<string, Box>> = {};
(async () => {
  const { page, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  type Loc = ReturnType<typeof page.locator>;
  const top = () => page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { if ((e as HTMLElement).scrollTop) (e as HTMLElement).scrollTop = 0; }); window.scrollTo(0, 0); });
  async function snap(name: string, t: Record<string, Loc> = {}, keepScroll = false) {
    if (!keepScroll) await top();
    await page.evaluate(() => { if (!document.getElementById('snapcss')) { const st = document.createElement('style'); st.id = 'snapcss'; st.textContent = '.toast{display:none!important} input,textarea{caret-color:transparent!important}'; document.head.appendChild(st); } });
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
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    const act = page.locator('.activity', { hasText: 'موبايلات' }).first();
    await act.click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('موبايلات النجمة');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await snap('new_company', { act });
    await page.locator('.demo-check input').check();
    await btn('إنشاء الشركة').click();
    await btn('حفظته، تابع').click();
    await page.locator('.sidebar').waitFor();
    await page.waitForTimeout(500);
    const group = page.locator('.sidebar nav button', { hasText: 'سجل الأجهزة' });
    await snap('dash', { side: page.locator('.sidebar nav'), g1: group, g2: page.locator('.sidebar nav button', { hasText: 'تجميعة كمبيوتر' }), stats: page.locator('.stats').first(), inst: page.locator('.stat', { hasText: 'أقساط متأخرة' }) });

    await nav(page, 'المواد');
    await snap('items', { table: page.locator('table.table').first(), add: btn(/صنف جديد/), sn: page.locator('table.table tbody tr', { hasText: 'Galaxy' }).first() });
    await step('new item', async () => {
      await btn(/صنف جديد/).click();
      await fld(m, 'الاسم').fill('Samsung Galaxy S24 256GB');
      const cat = fld(m, 'التصنيف');
      await cat.fill('موبايلات'); await cat.press('Tab').catch(() => {});
      await page.waitForTimeout(300);
      for (const [k, v] of [['الذاكرة', '256GB'], ['الرام', '8GB'], ['اللون', 'أسود'], ['الحالة', 'جديد'], ['البطارية', '100%']]) await fld(m, k).fill(v!).catch(() => console.log('  nofield', k));
      await snap('item_new', { modal: m, name: m.locator('.field', { hasText: 'الاسم' }), cat: m.locator('.field', { hasText: 'التصنيف' }), specs: m.locator('.field', { hasText: 'الذاكرة' }), spec2: m.locator('.field', { hasText: 'البطارية' }) });
      await cat.fill('لابتوب'); await cat.press('Tab').catch(() => {});
      await fld(m, 'الاسم').fill('Dell Latitude 5440');
      await page.waitForTimeout(300);
      for (const [k, v] of [['المعالج', 'Core i5-1335U'], ['الرام', '16GB'], ['التخزين', 'SSD 512GB'], ['كرت الشاشة', 'Intel Iris Xe']]) await fld(m, k).fill(v!).catch(() => console.log('  nofield', k));
      await snap('item_laptop', { modal: m, specs: m.locator('.field', { hasText: 'المعالج' }), gpu: m.locator('.field', { hasText: 'كرت الشاشة' }) });
      await cat.fill('موبايلات'); await cat.press('Tab').catch(() => {});
      await fld(m, 'الاسم').fill('Samsung Galaxy S24 256GB');
      await m.getByRole('button', { name: 'التتبع' }).click();
      await m.getByText('تتبع الأرقام التسلسلية').click();
      await fld(m, 'الكفالة').fill('12').catch(() => console.log('  nofield warranty'));
      await snap('item_track', { modal: m, track: m.getByText('تتبع الأرقام التسلسلية'), war: m.locator('.field', { hasText: 'الكفالة' }) });
      await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
      await fld(m, 'سعر المبيع').fill('900').catch(() => {});
      await m.getByRole('button', { name: 'حفظ' }).click();
      await page.waitForTimeout(400);
      await esc();
    });

    await nav(page, 'فاتورة شراء');
    await step('purchase', async () => {
      await pick(page, page.locator('.field', { hasText: 'المورد' }).locator('input').first(), 'الوكيل');
      await page.locator('.page select').filter({ has: page.locator('option[value="USD"]') }).first().selectOption('USD').catch(() => console.log('  nousd'));
      await page.locator('.scan-input').fill('A55');
      await page.locator('.scan-input').press('Enter');
      const row = page.locator('table.lines tbody tr').first();
      await row.locator('input.num-input').nth(0).fill('3');
      const ser = page.locator('textarea[placeholder*="IMEI"], input[placeholder*="IMEI"]').first();
      await ser.fill('356700000009011 356700000009028 356700000009035');
      await row.locator('input.num-input').nth(1).fill('325').catch(() => {});
      await snap('purchase', { lines: page.locator('table.lines').first(), ser, scan: page.locator('.scan-input'), party: page.locator('.field', { hasText: 'المورد' }) });
      await ser.fill('356700000009011 356700000009011 356700000009035');
      await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
      await page.waitForTimeout(250);
      await page.evaluate(() => document.getElementById('snapcss')?.remove());
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, 'purchase_err.png') });
      states['purchase_err'] = {};
      const t = page.locator('.toast').last();
      const b = await t.boundingBox().catch(() => null);
      if (b) states['purchase_err'].toast = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      console.log('snap purchase_err');
      await ser.fill('356700000009011 356700000009028 356700000009035');
      await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
      await page.waitForTimeout(500);
    });

    await nav(page, 'نقطة البيع');
    await step('pos', async () => {
      await page.locator('.scan-input').fill('356700000009011');
      await page.locator('.scan-input').press('Enter');
      await page.waitForTimeout(300);
      for (const n of ['كفر سيليكون', 'لزقة شاشة']) await page.locator('.pos-item', { hasText: n }).first().click().catch(() => console.log('  noitem', n));
      await snap('pos', { scan: page.locator('.scan-input'), cart: page.locator('.pos-cart').first(), imei: page.locator('.pos-cart input.mono').first(), pay: btn('دفع نقداً'), credit: btn('على الحساب', true) });
      await btn('دفع نقداً').click();
      await page.waitForTimeout(700);
    });
    await nav(page, 'سجل الفواتير');
    await step('invoice', async () => {
      await page.locator('table.table tbody tr').first().click();
      await page.waitForTimeout(500);
      const doc = page.locator('.invoice-doc').first();
      await snap('invoice', { doc, line: doc.locator('tbody tr').first(), war: doc.getByText(/كفالة/).first() });
    });

    await nav(page, 'سجل الأجهزة');
    await step('lookup', async () => {
      await page.locator('.imei-search input').fill('356700000009011');
      await snap('lookup_typed', { search: page.locator('.imei-search') });
      await page.locator('.imei-search input').press('Enter');
      await page.waitForTimeout(400);
      await snap('lookup', { search: page.locator('.imei-search'), card: page.locator('.device-card'), status: page.locator('.device-status'), events: page.locator('.device-card table, section.card table').first() });
      await page.locator('.imei-search input').fill('');
      await page.locator('.card', { hasText: 'الأجهزة الموجودة' }).scrollIntoViewIfNeeded();
      await snap('stock', { list: page.locator('.card', { hasText: 'الأجهزة الموجودة' }) }, true);
    });

    await nav(page, 'التقسيط');
    await snap('inst', { add: btn('خطة تقسيط'), stats: page.locator('.stats').first(), late: page.locator('.stat', { hasText: 'متأخر' }).first(), table: page.locator('table.table').first() });
    await step('inst new', async () => {
      await btn('خطة تقسيط').click();
      await pick(page, m.locator('.field', { hasText: 'الزبون' }).locator('.picker input'), 'رنا');
      await fld(m, 'المبلغ المقسّط').fill('60000');
      await fld(m, 'الكفيل').fill('خالد الحسن').catch(() => {});
      await fld(m, 'موبايل الكفيل').fill('0944 123 456').catch(() => {});
      await snap('inst_new', { modal: m, amount: m.locator('.field', { hasText: 'المبلغ المقسّط' }), markup: m.locator('.field', { hasText: 'زيادة' }), count: m.locator('.field', { hasText: 'عدد الأقساط' }), guar: m.locator('.field', { hasText: 'الكفيل' }), strip: m.locator('.plan-strip'), create: m.getByRole('button', { name: 'إنشاء الخطة' }) });
      await esc();
    });
    await step('inst plan', async () => {
      await page.locator('table.table tbody tr', { hasText: 'أبو علي' }).click();
      await page.waitForTimeout(400);
      await snap('inst_plan', { table: page.locator('.installments-table').first(), strip: page.locator('.plan-strip').first(), collect: page.locator('section.card').nth(1), wa: btn('نسخ تذكير واتساب'), print: btn('طباعة الجدول'), late: page.locator('.installments-table .tag.bad').first(), qbtn: btn('قبض', true) });
    });

    await nav(page, 'بيع مع استبدال');
    await step('trade', async () => {
      await pick(page, page.locator('.card .field', { hasText: 'الزبون' }).locator('.picker input'), 'رنا');
      await pick(page, page.locator('.trade-new .picker input'), 'Redmi');
      await page.locator('.trade-new select').selectOption({ index: 1 });
      await page.locator('.trade-old .field', { hasText: 'الموديل' }).locator('input').fill('Samsung A12 64GB');
      await page.locator('.trade-old .field', { hasText: 'IMEI' }).locator('input').fill('354111222333444');
      await page.locator('.trade-old .field', { hasText: 'البطارية' }).locator('input').fill('80');
      await page.locator('.trade-old .field', { hasText: 'الحالة' }).locator('input').fill('خدوش خفيفة').catch(() => {});
      await page.locator('.trade-old .field', { hasText: 'سعر الشراء' }).locator('input').fill('8000');
      await snap('trade', { neu: page.locator('.trade-new'), old: page.locator('.trade-old'), strip: page.locator('.plan-strip').first(), go: btn('تنفيذ الاستبدال') });
      await page.locator('.plan-strip').first().scrollIntoViewIfNeeded();
      await snap('trade_sum', { strip: page.locator('.plan-strip').first(), go: btn('تنفيذ الاستبدال') }, true);
    });

    await nav(page, 'تجميعة كمبيوتر');
    await step('build', async () => {
      const row = (label: string) => page.locator('.build-table tbody tr', { hasText: label });
      await page.locator('.field', { hasText: 'اسم' }).first().locator('input').fill('تجميعة جيمنج i5').catch(() => {});
      await pick(page, row('المعالج').locator('.picker input'), 'i5');
      await pick(page, row('المازربورد').locator('.picker input'), 'MSI');
      await pick(page, row('الرام').locator('.picker input'), '16GB');
      await row('الرام').locator('input.num-input').first().fill('2');
      await pick(page, row('التخزين').locator('.picker input'), 'SSD');
      await pick(page, row('كرت الشاشة').locator('.picker input'), 'RTX');
      await row('كرت الشاشة').locator('select').selectOption({ index: 1 });
      await pick(page, row('الباور').locator('.picker input'), 'باور');
      await pick(page, row('الشاشة').last().locator('.picker input'), 'شاشة').catch(() => {});
      await page.locator('.field', { hasText: 'أجور التجميع' }).locator('input').fill('1500');
      await snap('build', { table: page.locator('.build-table'), gpu: row('كرت الشاشة') });
      await page.locator('.field', { hasText: 'أجور التجميع' }).scrollIntoViewIfNeeded();
      await snap('build_sum', { fee: page.locator('.field', { hasText: 'أجور التجميع' }), strip: page.locator('.plan-strip').first(), quote: btn('حفظ كعرض سعر'), sell: btn('بيع التجميعة') }, true);
    });

    await nav(page, 'أوامر الصيانة');
    await snap('repairs', { add: btn(/أمر صيانة جديد/), table: page.locator('table.table').first() });
    await step('repair', async () => {
      await btn(/أمر صيانة جديد/).click();
      await page.waitForTimeout(300);
      await page.locator('.field', { hasText: 'الجهاز' }).first().locator('button.icon').click();
      await pick(page, m.locator('.picker input').first(), 'سامر');
      await fld(m, 'الماركة').fill('iPhone').catch(() => {});
      await fld(m, 'الطراز').fill('iPhone 12 Pro').catch(() => {});
      await fld(m, 'IMEI').fill('353222111000999').catch(() => {});
      await fld(m, 'اللون').fill('أزرق').catch(() => {});
      await snap('device_new', { modal: m });
      await m.getByRole('button', { name: 'حفظ' }).click();
      await page.waitForTimeout(400);
      await fld(page.locator('.page'), 'الفني').fill('أبو حسن').catch(() => {});
      await page.locator('.field', { hasText: 'شكوى الزبون' }).locator('textarea').fill('الشاشة مكسورة، وما عم يشحن');
      await snap('repair_new', { dev: page.locator('.field', { hasText: 'الجهاز' }).first(), tech: page.locator('.field', { hasText: 'الفني' }), comp: page.locator('.field', { hasText: 'شكوى الزبون' }) });
      await page.locator('.field', { hasText: 'التشخيص' }).locator('textarea').fill('تبديل شاشة أصلية + تنظيف منفذ الشحن').catch(() => {});
      await pick(page, page.locator('section', { hasText: 'القطع المستخدمة' }).locator('.picker input'), 'كبل').catch(() => console.log('  nopart'));
      await btn('+ أضف عملاً').click();
      const labor = page.locator('section', { hasText: 'أجور اليد' }).locator('tbody tr').first();
      await labor.locator('input').nth(0).fill('تبديل شاشة');
      await labor.locator('input').nth(1).fill('150000');
      await page.locator('.field', { hasText: 'الحالة' }).first().locator('select').selectOption({ label: 'جاهز للتسليم' }).catch(() => console.log('  nostatus'));
      await page.locator('section', { hasText: 'القطع المستخدمة' }).scrollIntoViewIfNeeded();
      await snap('repair_work', { diag: page.locator('.field', { hasText: 'التشخيص' }), parts: page.locator('section', { hasText: 'القطع المستخدمة' }).last(), labor: page.locator('section', { hasText: 'أجور اليد' }).last(), status: page.locator('.field', { hasText: 'الحالة' }).first() }, true);
      await page.locator('.page-header').getByRole('button', { name: 'حفظ' }).click();
      await page.waitForTimeout(500);
      await btn('تسليم وفوترة').click();
      await fld(m, 'المقبوض').fill('100000');
      await snap('repair_deliver', { modal: m, paid: m.locator('.field', { hasText: 'المقبوض' }), go: m.getByRole('button', { name: 'إصدار الفاتورة' }) });
      await esc();
      await nav(page, 'أوامر الصيانة');
      await page.waitForTimeout(300);
      await snap('repairs_list', { table: page.locator('table.table').first(), row: page.locator('table.table tbody tr').first() });
    });
    await nav(page, 'الرئيسية');
    await page.waitForTimeout(400);
    await snap('dash_end', { stats: page.locator('.stats').first(), inst: page.locator('.stat', { hasText: 'أقساط' }).first(), rep: page.locator('.stat', { hasText: 'الصيانة' }).first() });
  } catch (e) {
    console.error('FAILED', (e as Error).message.split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, 'error.png') });
  } finally {
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
    await close();
  }
})();
