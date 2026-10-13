// فيديو «شو الجديد»: لقطات حقيقية من البرنامج بالبيانات التجريبية (مطعم، ورشة خياطة، موبايلات وكمبيوتر).
import fs from 'node:fs';
import path from 'node:path';
import { activate, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';

const OUT = '/tmp/claude-0/-home-user-Claude1/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/wn/shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: { name: string; file: string; targets: Record<string, Box> }[] = [];

(async () => {
  const { page, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  type Loc = ReturnType<typeof page.locator>;
  const box = async (loc: Loc): Promise<Box> => {
    const b = await loc.first().boundingBox({ timeout: 3000 });
    if (!b) throw new Error('no box');
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  async function snap(name: string, targets: Record<string, Loc> = {}) {
    await page.addStyleTag({ content: `.toast{display:none!important} input,textarea{caret-color:transparent!important}` });
    await page.waitForTimeout(300);
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
  const light = () => page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));
  const m = page.locator('.modal');
  const btn = (name: string | RegExp, exact = false) => page.getByRole('button', { name, exact }).first();
  const navBtn = (label: string) => page.locator('.sidebar nav button', { hasText: label }).first();
  async function create(name: string, activity: string, shotForm = false) {
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: activity }).first().click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill(name);
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    if (shotForm) {
      await page.locator('.demo-check').scrollIntoViewIfNeeded();
      await snap('new_demo', { demo: page.locator('.demo-check'), create: btn('إنشاء الشركة') });
    }
    await btn('إنشاء الشركة').click();
    await btn('حفظته، تابع').click();
    await page.locator('.sidebar').waitFor();
    await light();
    await page.waitForTimeout(400);
  }
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
    await activate(page);
    await light();

    // ───── المطعم
    await create('مطعم الشام', 'مطعم', true);
    await snap('r_dash', { stats: page.locator('.stats').first() });
    await nav(page, 'الطاولات والطلبات');
    await snap('r_tables', {
      areas: page.locator('.pos-cats'),
      t2: page.locator('.table-card', { hasText: 'طاولة 2' }),
      ter1: page.locator('.table-card', { hasText: 'التراس 1' }),
      fam1: page.locator('.table-card', { hasText: 'عائلي 1' }),
      hall: page.locator('section', { hasText: 'الصالة' }).locator('.tables-grid').first(),
      stats: page.locator('.stats').first(),
    });
    await page.locator('.table-card', { hasText: 'طاولة 2' }).click();
    await page.locator('.pos-item', { hasText: 'فتوش' }).click();
    await page.locator('.quick-notes button', { hasText: 'حار' }).click();
    await page.locator('.quick-notes button', { hasText: 'بدون بصل' }).click();
    await snap('r_order', {
      info: page.locator('.order-info'),
      notes: page.locator('.quick-notes'),
      cart: page.locator('.pos-lines'),
      service: page.locator('.pos-totals input').first(),
      totals: page.locator('.pos-totals'),
      pay: page.locator('.pay-modes'),
      bill: btn(/طباعة الحساب/),
      move: btn('نقل', true),
      merge: btn('دمج', true),
      kitchen: btn(/إرسال للمطبخ/),
    });
    await btn(/إرسال للمطبخ/).click();
    await page.waitForTimeout(300);
    await btn(/رجوع/).click();
    await page.locator('.table-card', { hasText: 'توصيل' }).first().click();
    await snap('r_delivery', { info: page.locator('.order-info'), fee: page.locator('.pos-totals input').first(), totals: page.locator('.pos-totals') });
    await btn(/رجوع/).click();
    await page.locator('.table-card', { hasText: 'التراس 1' }).click();
    await btn('نقل', true).click();
    await snap('r_move', { modal: m });
    await page.keyboard.press('Escape');
    await m.waitFor({ state: 'detached' }).catch(() => {});
    await btn(/رجوع/).click();
    await nav(page, 'شاشة المطبخ');
    const tCard = page.locator('.kitchen-card', { hasText: 'طاولة 2' });
    await snap('r_kitchen', {
      cards: page.locator('.kitchen-grid').first(),
      ter: page.locator('.kitchen-card', { hasText: 'التراس 1' }),
      t2: tCard,
      done: tCard.getByRole('button', { name: /الطلب كله جاهز/ }),
      timer: page.locator('.kitchen-card .timer').first(),
    });
    await tCard.getByRole('button', { name: /الطلب كله جاهز/ }).click();
    await page.waitForTimeout(300);
    await nav(page, 'الطاولات والطلبات');
    await snap('r_tables2', { t2: page.locator('.table-card', { hasText: 'طاولة 2' }) });
    // إيصال حراري
    await page.locator('.table-card', { hasText: 'طاولة 2' }).click();
    await btn('الحساب وإغلاق الطلب').click();
    await page.waitForTimeout(500);
    await printShot('receipt.png', 302, '80mm');
    await page.locator('.close-company').click();
    await page.getByRole('button', { name: 'شركة جديدة' }).waitFor();

    // ───── ورشة الخياطة
    await create('ورشة النور', 'خياطة');
    await snap('t_dash', { side: page.locator('.sidebar nav') });
    await nav(page, 'ورشة الخياطة');
    await btn('أتواب القماش', true).click();
    await snap('t_rolls', { table: page.locator('table.table'), receive: btn(/استلام أتواب/), sidebar: navBtn('ورشة الخياطة') });
    await btn(/استلام أتواب/).click();
    await pick(page, m.locator('.field', { hasText: 'صاحب القماش' }).locator('.picker input'), 'النور');
    await m.locator('.field', { hasText: 'نوع القماش' }).locator('input').fill('جوخ صوف');
    const row = m.locator('table.lines tbody tr');
    await row.nth(0).locator('input').nth(0).fill('150');
    await row.nth(0).locator('input').nth(1).fill('110');
    await row.nth(0).locator('input').nth(1).press('Enter');
    await row.nth(1).locator('input').nth(1).fill('95.5');
    await row.nth(1).locator('input').nth(1).press('Enter');
    await row.nth(2).locator('input').nth(1).fill('120');
    await snap('t_receive', { modal: m, rows: m.locator('table.lines'), unit: m.locator('.field', { hasText: 'وحدة الطول' }), total: m.locator('.kv') });
    await page.keyboard.press('Escape');
    await m.waitFor({ state: 'detached' }).catch(() => {});
    await btn('الطلبيات', true).click();
    await page.locator('table.table tbody tr', { hasText: 'جلابية' }).click();
    await page.waitForTimeout(400);
    await snap('t_order', {
      model: page.locator('.field', { hasText: 'الموديل' }).first(),
      marker: page.locator('.field', { hasText: 'طول الرسمة' }),
      rate: page.locator('.field', { hasText: 'سعر خياطة القطعة' }),
      sizes: page.locator('.size-matrix'),
    });
    const strip = page.locator('.card', { hasText: 'النمر والكميات' }).locator('.plan-strip');
    await strip.scrollIntoViewIfNeeded();
    await page.locator('.content').evaluate((c) => c.scrollBy(0, 120));
    await snap('t_plan', { strip, sizes: page.locator('.size-matrix'), lays: strip.locator('div').nth(1), fabric: strip.locator('div').last() });
    await page.locator('.content').evaluate((c) => c.scrollTo(0, 0));
    await btn(/مدّ وقص/).click();
    const chip = (code: string) => m.locator('.roll-chip').filter({ has: page.locator('strong.mono', { hasText: new RegExp(`^${code}$`) }) });
    await chip('141').locator('input[type=checkbox]').check();
    await chip('142').locator('input[type=checkbox]').check();
    await snap('t_cut', { modal: m, r141: chip('141'), r142: chip('142'), pieces: m.locator('.size-inputs') });
    await page.keyboard.press('Escape');
    await m.waitFor({ state: 'detached' }).catch(() => {});
    await btn(/تسجيل مرحلة/).click();
    await m.getByRole('button', { name: 'الكل', exact: true }).click().catch(() => {});
    await snap('t_stage', { modal: m, seg: m.locator('.segmented').first(), pieces: m.locator('.size-inputs') });
    await page.keyboard.press('Escape');
    await m.waitFor({ state: 'detached' }).catch(() => {});
    const exp = page.locator('section.card', { hasText: 'المصاريف' }).first();
    await exp.scrollIntoViewIfNeeded();
    await snap('t_expenses', { exp, stages: page.locator('section.card', { hasText: 'المراحل' }).first() });
    await btn(/مصروف/).click();
    await m.locator('.field', { hasText: 'النوع' }).locator('input').fill('بطانة');
    await m.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('120');
    await snap('t_expense', { modal: m, bill: m.locator('.segmented') });
    await page.keyboard.press('Escape');
    await m.waitFor({ state: 'detached' }).catch(() => {});
    await page.locator('.content').evaluate((c) => c.scrollTo(0, 0));
    await btn(/ورقة الطلبية/).click();
    await page.waitForTimeout(300);
    await printShot('sheet.png', 794, 'a4');
    await nav(page, 'ورشة الخياطة');
    await btn('حساب صاحب الشغل', true).click();
    await btn('الأسبوع الماضي', true).click().catch(() => {});
    await page.locator('.toolbar input[type=date]').first().fill(new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
    await snap('t_account', { money: page.locator('.account-view .sheet-money'), grand: page.locator('.account-view .grand'), moves: page.locator('.account-view table').last(), pay: btn(/قبض دفعة/) });
    await page.locator('.close-company').click();
    await page.getByRole('button', { name: 'شركة جديدة' }).waitFor();

    // ───── موبايلات وكمبيوتر
    await create('النجمة للموبايلات والكمبيوتر', 'موبايلات');
    await snap('m_dash', { inst: page.locator('.stats', { hasText: 'أقساط' }).first(), side: page.locator('.sidebar nav') });
    await nav(page, 'نقطة البيع');
    const imei = await page.evaluate(async () => {
      const s = (await (window as any).mizan.invoke('company:state')) as any;
      const st = s.state ?? s;
      return Object.keys(st.stock['p-a55']?.serials ?? {})[0] as string;
    });
    await page.locator('.scan-input').fill(imei);
    await snap('m_pos0', { scan: page.locator('.scan-input') });
    await page.locator('.scan-input').press('Enter');
    await snap('m_pos', { scan: page.locator('.scan-input'), line: page.locator('.pos-lines').first(), serial: page.locator('.pos-cart input.mono').first() });
    await nav(page, 'سجل الأجهزة');
    const sold = await page.evaluate(async () => {
      const s = (await (window as any).mizan.invoke('company:state')) as any;
      const st = s.state ?? s;
      const inv = st.invoices.find((i: any) => i.kind === 'sale' && i.partyId === 'c-rana');
      return inv.lines[0].serials[0] as string;
    });
    await page.locator('.imei-search input').fill(sold);
    await page.locator('.imei-search input').press('Enter');
    await snap('m_device', { search: page.locator('.imei-search'), card: page.locator('.device-card'), status: page.locator('.device-status'), events: page.locator('.device-card table') });
    await page.locator('.card', { hasText: 'الأجهزة الموجودة' }).locator('input').fill('Dell');
    await page.locator('table.table tbody tr', { hasText: 'Dell' }).first().click();
    await snap('m_laptop', { card: page.locator('.device-card'), chips: page.locator('.device-card .chips-row') });
    await nav(page, 'التقسيط');
    await snap('m_inst_list', { stats: page.locator('.stats').first(), row: page.locator('table.table tbody tr').first() });
    await btn(/خطة تقسيط/).click();
    await snap('m_inst_new', { modal: m, strip: m.locator('.plan-strip') });
    await page.keyboard.press('Escape');
    await m.waitFor({ state: 'detached' }).catch(() => {});
    await page.locator('table.table tbody tr', { hasText: 'أبو علي' }).click();
    await snap('m_inst', { table: page.locator('.installments-table').first(), late: page.locator('.installments-table tr.late').first(), wa: btn(/نسخ تذكير/), strip: page.locator('.plan-strip').first(), collect: page.locator('section.card', { hasText: 'قبض قسط' }) });
    await nav(page, 'بيع مع استبدال');
    await pick(page, page.locator('.card .field', { hasText: 'الزبون' }).locator('.picker input'), 'رنا');
    await pick(page, page.locator('.trade-new .picker input'), 'Redmi');
    await page.locator('.trade-new select').selectOption({ index: 1 });
    await page.locator('.trade-old .field', { hasText: 'الموديل' }).locator('input').fill('Samsung A32 مستعمل');
    await page.locator('.trade-old .field', { hasText: 'IMEI' }).locator('input').fill('354111222333444');
    await page.locator('.trade-old .field', { hasText: 'البطارية' }).locator('input').fill('86');
    await page.locator('.trade-old .field', { hasText: 'سعر الشراء' }).locator('input').fill('9000');
    await snap('m_trade', { neu: page.locator('.trade-new'), old: page.locator('.trade-old'), battery: page.locator('.trade-old .field', { hasText: 'البطارية' }) });
    const tstrip = page.locator('.plan-strip').first();
    await tstrip.scrollIntoViewIfNeeded();
    await snap('m_trade2', { strip: tstrip, go: btn('تنفيذ الاستبدال') });
    await nav(page, 'تجميعة كمبيوتر');
    const r = (label: string) => page.locator('.build-table tbody tr', { hasText: label });
    await pick(page, r('المعالج').locator('.picker input'), 'i5');
    await pick(page, r('المازربورد').locator('.picker input'), 'B760');
    await pick(page, r('الرام').locator('.picker input'), '16GB');
    await r('الرام').locator('input.num-input').first().fill('2');
    await pick(page, r('التخزين').locator('.picker input'), 'NVMe');
    await pick(page, r('كرت الشاشة').locator('.picker input'), 'RTX');
    await r('كرت الشاشة').locator('select').selectOption({ index: 1 });
    await pick(page, r('الباور').locator('.picker input'), 'باور');
    await page.locator('.field', { hasText: 'أجور التجميع' }).locator('input').fill('1500');
    await page.locator('.field', { hasText: 'اسم التجميعة' }).locator('input').fill('تجميعة جيمنج i5');
    await snap('m_build', { table: page.locator('.build-table'), cpu: r('المعالج'), gpu: r('كرت الشاشة') });
    const bstrip = page.locator('.plan-strip').first();
    await bstrip.scrollIntoViewIfNeeded();
    await snap('m_build2', { strip: bstrip, fee: page.locator('.field', { hasText: 'أجور التجميع' }), sell: btn('بيع التجميعة'), quote: btn(/حفظ كعرض سعر/) });
    await nav(page, 'المواد');
    await page.locator('table.table tbody tr', { hasText: 'Dell Latitude' }).first().click();
    await page.waitForTimeout(300);
    const attrsTab = m.getByRole('button', { name: /الخصائص|المواصفات/ });
    if (await attrsTab.count()) await attrsTab.first().click();
    await snap('m_item', { modal: m, attrs: m.locator('.field', { hasText: 'المعالج' }).first() });
    console.log('MODAL TABS', await m.locator('.segmented button, .tabs button').allInnerTexts());

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
