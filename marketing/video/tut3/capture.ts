// الشرح الثالث: محل الخياطة من التفعيل حتى الفاتورة — يصوّر البرنامج الحقيقي مع مواقع الأزرار.
import fs from 'node:fs';
import path from 'node:path';
import { createCompany as _unused, launch, licenseFor, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';
void _unused;

const OUT = '/tmp/claude-0/-home-user-Claude1/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/tut3/shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: { name: string; file: string; targets: Record<string, Box> }[] = [];

(async () => {
  const { page, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const call = (method: string, ...args: unknown[]) => page.evaluate(([m, a]) => (window as any).mizan.invoke('company:call', m, a), [method, args] as const);
  type Loc = ReturnType<typeof page.locator>;
  const box = async (loc: Loc): Promise<Box> => {
    const b = await loc.first().boundingBox({ timeout: 3000 });
    if (!b) throw new Error('no box');
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  async function snap(name: string, targets: Record<string, Loc> = {}, keepToast = false) {
    await page.addStyleTag({ content: `.toast{display:${keepToast ? 'block' : 'none'}!important} input,textarea{caret-color:transparent!important}` });
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
  const navBtn = (label: string) => page.locator('.sidebar nav button', { hasText: label }).first();
  const scrollTo = async (loc: Loc, top = 90) => {
    await loc.first().evaluate((el, top) => {
      const c = document.querySelector('.content')!;
      const r = el.getBoundingClientRect();
      c.scrollBy(0, r.top - top);
    }, top);
    await page.waitForTimeout(150);
  };
  const m = page.locator('.modal');
  const field = (scope: Loc, label: string) => scope.locator('.field', { hasText: label }).first().locator('input, select, textarea').first();
  const ymd = (off: number) => {
    const d = new Date();
    d.setDate(d.getDate() + off);
    return d.toISOString().slice(0, 10);
  };
  try {
    // ── التفعيل
    await page.getByText('بصمة الجهاز', { exact: true }).waitFor();
    await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));
    const ta = page.locator('textarea');
    const act = page.getByRole('button', { name: 'تفعيل', exact: true });
    await snap('lock', { fp: page.locator('.big-code').first(), key: ta, btn: act });
    const machineId = (await page.locator('.big-code').first().innerText()).trim();
    await ta.fill(licenseFor(machineId, 'annual'));
    await snap('lock_key', { key: ta, btn: act });
    await act.click();
    await page.getByText('شركة جديدة').first().waitFor();
    await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));

    // ── شركة جديدة
    const newTab = page.getByRole('button', { name: 'شركة جديدة' });
    await snap('welcome', { newTab });
    await newTab.click();
    const tailorAct = page.locator('.activity', { hasText: 'خياطة وتفصيل' });
    await snap('new0', { act: tailorAct, grid: page.locator('.activity-grid') });
    await tailorAct.click();
    await snap('new_act', { act: tailorAct });
    const cname = page.locator('.field', { hasText: 'اسم الشركة' }).locator('input');
    await cname.fill('خياطة الأناقة');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('أبو فادي');
    await page.locator('.field', { hasText: 'اسم الدخول' }).locator('input').fill('abufadi');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    const createBtn = page.getByRole('button', { name: 'إنشاء الشركة' });
    await createBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await snap('new_form', {
      name: cname,
      owner: page.locator('.field', { hasText: 'اسمك' }).locator('input'),
      user: page.locator('.field', { hasText: 'اسم الدخول' }).locator('input'),
      pass: page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input'),
      create: createBtn,
    });
    await createBtn.click();
    await page.locator('.modal .big-code').waitFor();
    await snap('recovery', { code: page.locator('.modal .big-code'), ok: page.getByRole('button', { name: 'حفظته، تابع' }), modal: m });
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();
    await page.locator('.sidebar').waitFor();
    await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));

    // ── بيانات أولية: زبائن، أقمشة، وطلبات جارية
    const customers = [
      ['c1', 'أبو محمد الشامي', '0933 210 456'],
      ['c2', 'أم ريم', '0944 778 120'],
      ['c3', 'خالد الحلبي', '0955 301 880'],
      ['c4', 'سمير العلي', '0988 412 090'],
      ['c5', 'أم أحمد', '0936 555 721'],
    ];
    for (const [id, name, phone] of customers) await call('saveParty', { id, kind: 'customer', name, phone });
    const fabrics = [
      ['f2', 'أزرار بدلة عظم', 'قطعة', 500, 400, 'لوازم'],
      ['f3', 'سحاب مخفي 20 سم', 'قطعة', 750, 300, 'لوازم'],
      ['f4', 'بطانة ساتان', 'متر', 4000, 60, 'أقمشة'],
      ['f5', 'قماش ثوب أبيض ياباني', 'متر', 9000, 80, 'أقمشة'],
      ['f6', 'كريب فساتين', 'متر', 11000, 45, 'أقمشة'],
    ] as const;
    for (const [id, name, unit, price, , cat] of fabrics) await call('saveItem', { id, code: id.toUpperCase(), name, kind: 'stock', unit, price: price * 100, priceCurrency: 'SYP', category: cat, minStock: 5 });
    await call('adjustStock', { kind: 'opening', date: ymd(-30), lines: fabrics.map(([id, , , price, qty]) => ({ itemId: id, qty, unitCost: Math.round(price * 100 * 0.7) })) });
    const seed = [
      ['o1', 'c1', ymd(-4), 'sewing', ymd(3), '', [['ثوب', 2, 30000]]],
      ['o2', 'c2', ymd(-6), 'fitting', ymd(4), ymd(0), [['فستان سهرة', 1, 90000]]],
      ['o3', 'c3', ymd(-8), 'ready', ymd(1), '', [['بدلة رجالية', 1, 60000]]],
      ['o4', 'c4', ymd(-5), 'received', ymd(-1), '', [['تقصير بنطال', 3, 3000]]],
      ['o5', 'c5', ymd(-9), 'cutting', ymd(-2), '', [['عباية', 1, 45000]]],
    ] as const;
    for (const [id, partyId, date, status, dueDate, fittingDate, garments] of seed) {
      await call('saveTailorOrder', {
        id,
        partyId,
        date,
        status,
        currency: 'SYP',
        garments: garments.map(([description, qty, price]) => ({ description, qty, price: price * 100 })),
        fabrics: [],
        measurements: {},
        dueDate,
        ...(fittingDate ? { fittingDate } : {}),
        tailor: 'أبو فادي',
      });
    }
    await nav(page, 'الإعدادات');
    await nav(page, 'الرئيسية');

    // ── تسجيل الخروج ثم الدخول
    await page.locator('.close-company').click();
    await page.locator('.recent button').first().waitFor();
    await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));
    await snap('welcome_recent', { recent: page.locator('.recent button').first() });
    await page.locator('.recent button').first().click();
    await m.waitFor();
    const uIn = m.locator('.field', { hasText: 'المستخدم' }).locator('input, select').first();
    const pIn = m.locator('.field', { hasText: 'كلمة السر' }).locator('input').first();
    const loginBtn = m.locator('button.primary');
    await snap('login0', { user: uIn, pass: pIn, btn: loginBtn, modal: m });
    if ((await uIn.evaluate((e) => e.tagName)) === 'INPUT') await uIn.fill('abufadi');
    await pIn.fill('secret123');
    await snap('login_filled', { user: uIn, pass: pIn, btn: loginBtn });
    await loginBtn.click();
    await page.locator('.sidebar').waitFor();
    await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));
    await page.waitForTimeout(400);

    // ── المستخدمون
    await nav(page, 'المستخدمون');
    const addUser = page.locator('.page-header button.primary').first();
    await snap('users', { navUsers: navBtn('المستخدمون'), add: addUser });
    await addUser.click();
    await field(m, 'الاسم').fill('سامي');
    await field(m, 'اسم الدخول').fill('sami');
    await snap('user_new', { name: field(m, 'الاسم'), role: field(m, 'الدور'), perms: m.locator('text=الصلاحيات').first(), modal: m });
    await m.getByRole('button', { name: 'إلغاء' }).click();

    // ── الرئيسية
    await nav(page, 'الرئيسية');
    const stat = (t: string) => page.locator('.stat', { hasText: t }).first();
    await snap('dash', {
      navDash: navBtn('الرئيسية'),
      sActive: stat('الطلبات الجارية'),
      sLate: stat('متأخرة عن موعدها'),
      sToday: stat('تسليم أو بروفة اليوم'),
      sReady: stat('جاهزة للتسليم'),
      stats: page.locator('.stats').first(),
      table: page.locator('section.card', { hasText: 'طلبات التفصيل الجارية' }),
      newOrder: page.getByRole('button', { name: 'طلب تفصيل جديد' }),
      navParties: navBtn('العملاء والموردون'),
    });

    // ── زبون جديد مع القياسات
    await nav(page, 'العملاء والموردون');
    const addParty = page.getByRole('button', { name: 'إضافة', exact: true });
    await snap('parties', { navParties: navBtn('العملاء والموردون'), add: addParty });
    await addParty.click();
    const pName = m.locator('.field', { hasText: 'الاسم' }).first().locator('input');
    const pPhone = field(m, 'الهاتف');
    await snap('party0', { name: pName, phone: pPhone, modal: m });
    await pName.fill('أبو سامر');
    await pPhone.fill('0944 123 789');
    await snap('party_name', { name: pName, phone: pPhone });
    const meas = m.locator('.measurements');
    await meas.scrollIntoViewIfNeeded();
    await snap('party_meas0', { meas });
    const values: [string, string][] = [
      ['الطول الكامل', '178'],
      ['الكتف', '47'],
      ['الصدر', '104'],
      ['الخصر', '92'],
      ['الورك', '102'],
      ['طول الكم', '63'],
      ['الرقبة', '41'],
      ['طول البنطال', '105'],
    ];
    for (const [k, v] of values) await m.locator('.measure', { hasText: k }).first().locator('input').fill(v);
    const saveP = m.getByRole('button', { name: 'حفظ', exact: true });
    await snap('party_meas', { meas, first: m.locator('.measure', { hasText: 'الطول الكامل' }).first(), save: saveP });
    const extra = m.locator('.measure.add input');
    await extra.fill('طول الثوب (الابن)');
    await snap('party_extra', { extra: m.locator('.measure.add'), meas });
    await m.locator('.measure.add button').click();
    await m.locator('.measure', { hasText: 'طول الثوب (الابن)' }).locator('input').fill('120');
    await snap('party_extra2', { added: m.locator('.measure', { hasText: 'طول الثوب (الابن)' }), extra: m.locator('.measure.add'), save: saveP });
    await saveP.click();
    await page.waitForTimeout(300);
    await snap('parties_saved', { row: page.locator('table.table tbody tr', { hasText: 'أبو سامر' }), navItems: navBtn('المواد') }, true);

    // ── الأقمشة
    await nav(page, 'المواد');
    const newItem = page.getByRole('button', { name: /مادة جديدة/ });
    await snap('items', { navItems: navBtn('المواد'), add: newItem, table: page.locator('table.table') });
    await newItem.click();
    const iName = m.locator('.field', { hasText: 'الاسم' }).first().locator('input');
    const iCat = field(m, 'التصنيف');
    await iName.fill('جوخ إنكليزي كحلي');
    await iCat.fill('أقمشة');
    await page.keyboard.press('Tab');
    const tabPrices = m.getByRole('button', { name: 'الأسعار والوحدات' });
    await snap('item_form', { name: iName, cat: iCat, tabPrices });
    await tabPrices.click();
    const unitIn = field(m, 'الوحدة الأساسية');
    const priceIn = field(m, 'سعر المبيع');
    await unitIn.fill('متر');
    await priceIn.fill('12000');
    const saveI = m.getByRole('button', { name: 'حفظ', exact: true });
    await snap('item_prices', { unit: unitIn, price: priceIn, save: saveI });
    await saveI.click();
    await page.waitForTimeout(300);
    {
      const stt = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))) as any;
      const items = (stt.items ?? stt.state?.items ?? {}) as Record<string, { id: string; name: string }>;
      const jokh = Object.values(items).find((i) => i.name.includes('جوخ'));
      if (!jokh) console.log('NO JOKH', Object.keys(stt));
      else await call('adjustStock', { kind: 'opening', date: ymd(-1), lines: [{ itemId: jokh.id, qty: 50, unitCost: 850000 }] });
    }
    await nav(page, 'الإعدادات');
    await nav(page, 'المواد');
    await snap('items_list', { row: page.locator('table.table tbody tr', { hasText: 'جوخ' }), rows: page.locator('table.table tbody') });

    // ── طلب تفصيل جديد
    await nav(page, 'طلبات التفصيل');
    const newOrder = page.getByRole('button', { name: 'طلب تفصيل جديد' });
    await snap('tlist0', { navTailor: navBtn('طلبات التفصيل'), add: newOrder, stats: page.locator('.stats').first() });
    await newOrder.click();
    const custIn = page.locator('.field', { hasText: 'الزبون' }).first().locator('.picker input');
    await snap('order0', { cust: custIn, plus: page.locator('.field', { hasText: 'الزبون' }).first().locator('button[title="زبون جديد"]') });
    await pick(page, custIn, 'سامر');
    await snap('order_cust', { cust: custIn, phone: field(page.locator('.page'), 'الهاتف') });
    const measCard = page.locator('section.card', { hasText: 'القياسات (سم)' });
    await scrollTo(measCard, 80);
    await snap('order_meas', { meas: measCard.locator('.measurements'), card: measCard });
    const gCard = page.locator('section.card', { hasText: 'القطع المطلوبة' });
    await scrollTo(gCard, 120);
    const g = gCard.locator('tbody tr').first();
    await snap('order_g0', { row: g, desc: g.locator('input').nth(0), card: gCard, fabCard: page.locator('section.card', { hasText: 'أقمشة ولوازم من المحل' }) });
    await g.locator('input').nth(0).fill('بدلة رجالية');
    await g.locator('input').nth(1).fill('1');
    await g.locator('input').nth(2).fill('60000');
    await g.locator('input').nth(3).fill('صدر واحد، زرين');
    await snap('order_g1', { row: g, price: g.locator('input').nth(2), total: page.locator('.totals-bar') });
    const fCard = page.locator('section.card', { hasText: 'أقمشة ولوازم من المحل' });
    const fPick = fCard.locator('.picker input');
    await pick(page, fPick, 'جوخ');
    const fRow1 = fCard.locator('tbody tr').first();
    await fRow1.locator('input.num-input').nth(0).fill('3');
    await pick(page, fPick, 'أزرار');
    const fRow2 = fCard.locator('tbody tr').nth(1);
    await fRow2.locator('input.num-input').nth(0).fill('8');
    await pick(page, fPick, 'بطانة');
    const fRow3 = fCard.locator('tbody tr').nth(2);
    await fRow3.locator('input.num-input').nth(0).fill('2');
    await snap('order_fab', { card: fCard, row1: fRow1, qty1: fRow1.locator('input.num-input').nth(0), picker: fPick, total: page.locator('.totals-bar') });
    // الحقول العليا
    await page.locator('.content').evaluate((c) => c.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const own = field(page.locator('.page'), 'قماش الزبون');
    await own.fill('3 متر جوخ كحلي');
    await snap('order_own', { own });
    await own.fill('');
    const fit = field(page.locator('.page'), 'موعد البروفة');
    const due = field(page.locator('.page'), 'موعد التسليم');
    const tailorIn = field(page.locator('.page'), 'الخياط');
    await snap('order_top', { fit, due, tailor: tailorIn, own, notes: field(page.locator('.page'), 'ملاحظات'), status: field(page.locator('.page'), 'الحالة') });
    await fit.fill(ymd(5));
    await due.fill(ymd(10));
    await tailorIn.fill('أبو فادي');
    await snap('order_dates', { fit, due, tailor: tailorIn });
    const notes = field(page.locator('.page'), 'ملاحظات');
    await notes.fill('ياقة عريضة، زرين، جيبة جانبية مائلة، بنطال بدون ثنية');
    const saveO = page.locator('.page-header').getByRole('button', { name: 'حفظ', exact: true });
    await snap('order_notes', { notes, save: saveO });
    await saveO.click();
    await page.waitForTimeout(500);
    const depBtn = page.getByRole('button', { name: 'قبض عربون' });
    const delBtn = page.getByRole('button', { name: 'تسليم وفوترة' });
    const printBtn = page.locator('.page-header').getByRole('button', { name: 'طباعة' });
    await snap('order_saved', { title: page.locator('.page-header h2'), dep: depBtn, del: delBtn, print: printBtn, paper: page.locator('.paper-select'), status: field(page.locator('.page'), 'الحالة') }, true);

    // ── العربون
    await depBtn.click();
    const amt = m.locator('.field', { hasText: 'المبلغ' }).locator('input');
    await amt.fill('');
    await snap('deposit0', { amount: amt, btn: m.getByRole('button', { name: 'قبض', exact: true }), modal: m });
    await amt.fill('40000');
    await snap('deposit1', { amount: amt, btn: m.getByRole('button', { name: 'قبض', exact: true }), note: m.locator('p.muted') });
    await m.getByRole('button', { name: 'قبض', exact: true }).click();
    await page.waitForTimeout(400);
    const tbar = page.locator('.totals-bar');
    await scrollTo(tbar, 300);
    await snap('order_dep', { bar: tbar, depCard: page.locator('section.card', { hasText: 'مقبوض' }).last() }, true);
    await page.locator('.content').evaluate((c) => c.scrollTo(0, 0));

    // ── وصل طلب التفصيل (طباعة حرارية)
    await page.evaluate(() => (document.body.dataset['paper'] = '80mm'));
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 302, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'ticket.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => delete document.body.dataset['paper']);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(300);

    // ── تغيير الحالة
    const st = field(page.locator('.page'), 'الحالة');
    await snap('st_received', { status: st });
    for (const [v, n] of [
      ['cutting', 'st_cut'],
      ['sewing', 'st_sew'],
      ['fitting', 'st_fit'],
      ['ready', 'st_ready'],
    ] as const) {
      await st.selectOption(v);
      await snap(n, { status: st, wa: page.getByRole('button', { name: 'نسخ رسالة للزبون' }) });
    }
    await saveO.click();
    await page.waitForTimeout(300);

    // ── قائمة الطلبات: بحث وفلترة
    await nav(page, 'طلبات التفصيل');
    const search = page.locator('.toolbar input').first();
    const filter = page.locator('.toolbar select').first();
    await snap('tlist', { search, filter, stats: page.locator('.stats').first(), table: page.locator('table.table') });
    await search.fill('سامر');
    await snap('tlist_search', { search, row: page.locator('table.table tbody tr').first() });
    await search.fill('');
    await filter.selectOption('late');
    await snap('tlist_late', { filter, table: page.locator('table.table'), late: page.locator('.stat', { hasText: 'متأخرة' }) });
    await filter.selectOption('active');

    // ── التسليم والفاتورة
    await page.locator('table.table tbody tr', { hasText: 'أبو سامر' }).click();
    await page.waitForTimeout(300);
    await snap('order_open', { del: delBtn, bar: page.locator('.totals-bar') });
    await delBtn.click();
    await snap('deliver0', { kv: m.locator('.kv'), auto: m.locator('label.check').first(), btn: m.getByRole('button', { name: 'تسليم وإصدار الفاتورة' }), modal: m });
    await m.locator('label.check input').first().uncheck();
    const paidIn = m.locator('.field', { hasText: 'المقبوض الآن' }).locator('input');
    await paidIn.fill('40000');
    await snap('deliver_paid', { paid: paidIn, btn: m.getByRole('button', { name: 'تسليم وإصدار الفاتورة' }), modal: m });
    await m.getByRole('button', { name: 'تسليم وإصدار الفاتورة' }).click();
    await page.waitForTimeout(600);
    await snap(
      'invoice',
      {
        doc: page.locator('.paper-preview .invoice-doc').first(),
        lines: page.locator('.paper-preview .doc-lines').first(),
        totals: page.locator('.paper-preview .doc-totals').first(),
        print: page.getByRole('button', { name: 'طباعة' }).first(),
        pdf: page.getByRole('button', { name: 'PDF' }).first(),
        stamp: page.locator('.paper-preview .doc-stamp').first(),
      },
      true,
    );

    // ── ملف الزبون
    await nav(page, 'العملاء والموردون');
    await page.getByRole('cell', { name: 'أبو سامر' }).click();
    await page.waitForTimeout(300);
    const panel = page.locator('.panel').first();
    await snap('party_panel', { panel, kv: panel.locator('.kv').first(), meas: panel.locator('.doc-measures').first(), orders: panel.locator('text=مسلّم').first() });

    // ── التخصيص
    await nav(page, 'الإعدادات');
    const tabC = page.getByRole('button', { name: 'تخصيص النشاط' });
    await snap('settings', { navSettings: navBtn('الإعدادات'), tab: tabC });
    await tabC.click();
    const ftog = page.locator('.feature-toggle', { hasText: 'المواعيد' });
    await snap('custom0', { tab: tabC, toggle: ftog, features: page.locator('.feature-toggle').first() });
    await ftog.click();
    await snap('custom_toggle', { toggle: ftog, navAppt: navBtn('المواعيد') });
    const catCard = page.locator('.card', { hasText: 'تصنيفات المواد' });
    await scrollTo(catCard, 200);
    const catIn = catCard.locator('input');
    await catIn.fill('عبايات');
    await catIn.press('Enter');
    await catIn.fill('بدلات أعراس');
    await catIn.press('Enter');
    await snap('custom_cat', { card: catCard, input: catIn });

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
