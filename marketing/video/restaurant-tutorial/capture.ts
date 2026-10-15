// شرح المطعم: لقطات حقيقية (الوضع الفاتح) بالبيانات التجريبية.
import fs from 'node:fs';
import path from 'node:path';
import { activate, launch, nav } from '/home/user/Claude1/tests/e2e/helpers';
const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/rest/assets/shots';
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, Record<string, Box>> = {};
(async () => {
  const { page, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  type Loc = ReturnType<typeof page.locator>;
  const top = () => page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { if ((e as HTMLElement).scrollTop) (e as HTMLElement).scrollTop = 0; }); window.scrollTo(0, 0); });
  async function snap(name: string, t: Record<string, Loc> = {}, keepScroll = false) {
    if (!keepScroll) await top();
    await page.addStyleTag({ content: '.toast{display:none!important} input,textarea{caret-color:transparent!important}' });
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
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'مطعم' }).first().click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('مطعم الشام');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await snap('new_company', { act: page.locator('.activity', { hasText: 'مطعم' }).first() });
    await page.locator('.demo-check input').check();
    await btn('إنشاء الشركة').click();
    await btn('حفظته، تابع').click();
    await page.locator('.sidebar').waitFor();
    await page.waitForTimeout(400);
    await snap('dash', { side: page.locator('.sidebar nav') , navTables: page.locator('.sidebar nav button', { hasText: 'الطاولات والطلبات' }) });

    await nav(page, 'الطاولات والطلبات');
    await snap('tables', { areas: page.locator('.pos-cats'), stats: page.locator('.stats').first(), add: btn('إضافة طاولة'), group: btn('إضافة مجموعة طاولات'), t2: page.locator('.table-card', { hasText: 'طاولة 2' }), hall: page.locator('.tables-grid').first(), takeaway: btn('طلب سفري'), delivery: btn('توصيل', true) });
    await step('add table', async () => {
      const inp = page.locator('input[placeholder^="اسم الطاولة الجديدة"]');
      await inp.scrollIntoViewIfNeeded();
      await inp.fill('طاولة 9');
      await snap('add_table', { form: page.locator('form.inline-form').last(), input: inp, add: page.locator('form.inline-form').last().getByRole('button') }, true);
      await inp.fill('');
      await page.locator('.content').evaluate((c) => c.scrollTo(0, 0));
    });
    await step('add group', async () => {
      await btn('الطاولات', true).click();
      await fld(m, 'المنطقة').fill('الطابق العلوي');
      await fld(m, 'العدد').fill('8');
      await snap('add_group', { modal: m, form: m.locator('form.form-grid').first(), count: m.locator('.field', { hasText: 'العدد' }), add: m.getByRole('button', { name: 'إضافة', exact: true }) });
      await esc();
    });
    await nav(page, 'المواد');
    await snap('items', { table: page.locator('table.table').first(), add: btn(/صنف جديد/), cats: page.locator('select').first() });
    await step('new item', async () => {
      await btn(/صنف جديد/).click();
      await fld(m, 'الاسم').fill('شاورما عربي');
      await fld(m, 'التصنيف').fill('سندويش').catch(() => {});
      await snap('item_new', { modal: m, name: m.locator('.field', { hasText: 'الاسم' }), cat: m.locator('.field', { hasText: 'التصنيف' }) });
      await m.getByRole('button', { name: 'الأسعار والوحدات' }).click().catch(() => {});
      await fld(m, 'سعر المبيع').fill('25000').catch(() => {});
      await snap('item_price', { modal: m, price: m.locator('.field', { hasText: 'سعر المبيع' }) });
      await esc();
    });
    await step('recipe', async () => {
      await page.locator('table.table tbody tr', { hasText: 'شاورما' }).first().click();
      await page.waitForTimeout(300);
      await m.getByRole('button', { name: /المكوّنات|وصفة/ }).click();
      await snap('item_recipe', { modal: m, recipe: m.locator('table').last(), kind: m.locator('.field', { hasText: 'النوع' }) });
      await esc();
    });

    await nav(page, 'الطاولات والطلبات');
    await page.locator('.table-card', { hasText: 'طاولة 2' }).click();
    await page.waitForTimeout(400);
    await snap('order_empty', { cats: page.locator('.pos-cats'), items: page.locator('.pos-items, .pos-grid').first(), cart: page.locator('.pos-lines').first(), info: page.locator('.order-info') });
    for (const n of ['شيش طاووق', 'فتوش', 'حمص']) await page.locator('.pos-item', { hasText: n }).first().click();
    await page.locator('.pos-item', { hasText: 'شيش طاووق' }).first().click();
    await snap('order_items', { cart: page.locator('.pos-lines').first(), tile: page.locator('.pos-item', { hasText: 'شيش طاووق' }).first() });
    await step('notes', async () => {
      await page.locator('.quick-notes button', { hasText: 'حار' }).first().click();
      await page.locator('.quick-notes button', { hasText: 'بدون بصل' }).first().click();
    });
    await step('guests', async () => {
      await page.locator('.order-info label', { hasText: 'الضيوف' }).locator('input').fill('4');
      await page.locator('.order-info label', { hasText: 'الكابتن' }).locator('input').fill('أبو سمير');
      await page.locator('.pos-totals input').first().fill('10');
    });
    await snap('order_full', { notes: page.locator('.quick-notes').first(), info: page.locator('.order-info'), service: page.locator('.pos-totals input').first(), totals: page.locator('.pos-totals'), kitchen: btn(/إرسال للمطبخ/), bill: btn(/طباعة الحساب/), move: btn('نقل', true), merge: btn('دمج', true), close: btn(/الحساب وإغلاق الطلب/) });
    await btn(/إرسال للمطبخ/).click();
    await page.waitForTimeout(400);
    await snap('order_sent', { cart: page.locator('.pos-lines').first() });
    await btn(/رجوع/).click();
    await page.waitForTimeout(300);
    await snap('tables_busy', { t2: page.locator('.table-card', { hasText: 'طاولة 2' }), stats: page.locator('.stats').first() });

    await nav(page, 'شاشة المطبخ');
    const tCard = page.locator('.kitchen-card', { hasText: 'طاولة 2' });
    await snap('kitchen', { grid: page.locator('.kitchen-grid').first(), t2: tCard, done: tCard.getByRole('button', { name: /الطلب كله جاهز/ }), timer: tCard.locator('.timer'), line: tCard.locator('li, .k-line').first() });
    await step('ready', async () => { await tCard.getByRole('button', { name: /الطلب كله جاهز/ }).click(); });
    await nav(page, 'الطاولات والطلبات');
    await snap('tables_ready', { t2: page.locator('.table-card', { hasText: 'طاولة 2' }) });

    await step('takeaway', async () => {
      await btn('طلب سفري').click();
      await page.waitForTimeout(300);
      for (const n of ['شاورما دجاج سندويش', 'كولا']) await page.locator('.pos-item', { hasText: n }).first().click();
      await snap('takeaway', { cart: page.locator('.pos-lines').first(), info: page.locator('.order-info') });
      await btn(/رجوع/).click();
    });
    await step('delivery', async () => {
      await btn('توصيل', true).click();
      await page.waitForTimeout(300);
      const info = page.locator('.order-info');
      const lab = (t: string) => info.locator('label', { hasText: t }).locator('input').first();
      await lab('الاسم').fill('أبو خالد');
      await lab('الموبايل').fill('0933 222 111');
      await lab('العنوان').fill('المزة، جانب الجامع');
      for (const n of ['مشاوي مشكلة', 'فتوش']) await page.locator('.pos-item', { hasText: n }).first().click();
      await page.locator('.pos-totals input').first().fill('5000').catch(() => {});
      await snap('delivery', { info, fee: page.locator('.pos-totals input').first(), cart: page.locator('.pos-lines').first() });
      await btn(/رجوع/).click();
    });
    await page.locator('section', { hasText: 'طلبات سفري وتوصيل' }).first().scrollIntoViewIfNeeded();
    await snap('tables_open', { open: page.locator('section', { hasText: 'طلبات سفري وتوصيل' }).first() }, true);

    await step('move', async () => {
      await page.locator('.table-card', { hasText: 'التراس 1' }).click();
      await btn('نقل', true).click();
      await snap('move', { modal: m });
      await esc();
      await btn('دمج', true).click();
      await snap('merge', { modal: m });
      await esc();
      await btn(/رجوع/).click();
    });

    await page.locator('.table-card', { hasText: 'طاولة 2' }).click();
    await page.waitForTimeout(300);
    await step('bill', async () => { await btn(/طباعة الحساب/).click(); await page.waitForTimeout(500); await printShot('bill.png', 302, '80mm'); });
    await step('close', async () => {
      const kv = page.locator('.pos-totals ~ .kv, .kv').last();
      await kv.locator('input.num-input').last().fill('150000');
      await btn(/الحساب وإغلاق الطلب/).scrollIntoViewIfNeeded();
      await snap('close', { modes: page.locator('.pay-modes'), kv, close: btn(/الحساب وإغلاق الطلب/), totals: page.locator('.pos-totals') }, true);
    });
    await esc();
    await nav(page, 'التقارير');
    await step('daily', async () => { await page.getByRole('button', { name: 'إغلاق اليوم' }).first().click(); await page.waitForTimeout(400); await snap('daily', { main: page.locator('.content') }); });
    await step('income', async () => {
      await page.getByRole('button', { name: 'الأرباح والخسائر' }).first().click();
      const td = await page.evaluate(() => new Date().toISOString().slice(0, 10));
      await page.locator('input[type=date]').first().fill(td);
      await page.locator('h1, .page-header h2').first().click().catch(() => {});
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
