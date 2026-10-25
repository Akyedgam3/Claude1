// لقطات فيديو شرح الكمبيوتر: شاشات حقيقية من برنامج الكمبيوتر (Electron، 1600×1000) مع مربعات العناصر للتأشير.
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/desktop-guide/capture.mts <outdir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { launch } from '../../../tests/e2e/helpers';
import { issueLicense, signFeed, type LicenseFeed } from '../../../src/license/license';

const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const OUT = process.argv[2]!;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, { file: string; targets: Record<string, Box> }> = {};
const errs: string[] = [];
const today = new Date().toISOString().slice(0, 10);

// قائمة حالة محلية: الاتصال عن بعد مفعّل، ولاحقاً منضيف إعلان نسخة جديدة
let feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-d': { status: 'active', cloud: true, devices: 3 } } };
const server = http.createServer((_q, r) => r.end(signFeed(feed, devKey)));
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/feed.txt`;

const W = 1600, H = 1000;
async function snap(p: Page, name: string, targets: Record<string, Locator | Box> = {}, wait = 600) {
  await p.waitForTimeout(wait);
  const t: Record<string, Box> = {};
  for (const [k, loc] of Object.entries(targets)) {
    if ('x' in (loc as Box) && typeof (loc as Box).x === 'number') { t[k] = loc as Box; continue; }
    const bx = await (loc as Locator).first().boundingBox({ timeout: 2500 }).catch(() => null);
    if (bx) t[k] = { x: Math.round(bx.x), y: Math.round(bx.y), w: Math.round(bx.width), h: Math.round(bx.height) };
    else errs.push(`no box ${name}.${k}`);
  }
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  states[name] = { file: `${name}.png`, targets: t };
  console.log('snap', name, Object.keys(t).join(','));
}
const style = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' }).catch(() => undefined);
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (s: Page | Locator, label: string | RegExp) => s.locator('.field', { hasText: label }).first();
const navBtn = (p: Page, label: string | RegExp) => p.locator('.sidebar nav button', { hasText: label }).first();
const nav = async (p: Page, label: string | RegExp) => { await navBtn(p, label).click(); await p.waitForTimeout(600); };
const esc = async (p: Page) => { await p.keyboard.press('Escape'); await p.locator('.modal').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined); };
const step = async (label: string, fn: () => Promise<void>) => {
  try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${(e as Error).message.split('\n')[0]}`); }
};
const call = (p: Page, method: string, ...args: unknown[]) => p.evaluate(([m, a]) => (window as any).mizan.invoke('company:call', m, a), [method, args] as const);

const A = await launch({ feedUrl });
const p = A.page;
try {
  await p.setViewportSize({ width: W, height: H });
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  await style(p);
  const fp = p.locator('.big-code').first();
  await snap(p, 'lock', { fp, copy: btn(p, 'نسخ البصمة'), key: p.locator('textarea').first(), activate: btn(p, 'تفعيل', true) });
  const machineId = (await fp.innerText()).trim();
  fs.writeFileSync(path.join(OUT, 'fp.txt'), machineId);
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-d', customer: 'موبايلات النور', machineId, plan: 'annual', devices: 3 }, devKey));
  await snap(p, 'lock_key', { key: p.locator('textarea').first(), activate: btn(p, 'تفعيل', true) });
  await btn(p, 'تفعيل', true).click();
  await p.getByText('شركة جديدة').first().waitFor();
  await snap(p, 'welcome', { newco: btn(p, 'شركة جديدة'), connect: btn(p, 'الاتصال بجهاز رئيسي'), open: btn(p, 'فتح شركة'), restore: btn(p, /استعادة نسخة احتياطية/) });
  await btn(p, 'فتح شركة').click();
  await snap(p, 'welcome_open', { open: btn(p, 'فتح شركة'), restore: btn(p, /استعادة نسخة احتياطية/), connect: btn(p, 'الاتصال بجهاز رئيسي') });
  await btn(p, 'الاتصال بجهاز رئيسي').click();
  await snap(p, 'welcome_connect', { connect: btn(p, 'الاتصال بجهاز رئيسي'), form: p.locator('form, section.card').last() });
  await btn(p, 'شركة جديدة').click();
  const act = (t: string) => p.locator('.activity', { hasText: t }).first();
  await snap(p, 'acts', { newco: btn(p, 'شركة جديدة'), a1: act('سوبرماركت'), a2: act('مطعم'), a3: act('ألبسة'), a4: act('موبايلات'), a5: act('صيدلية'), a6: act('قطع'), grid: p.locator('.activities, .activity-grid').first() });
  await act('موبايلات').click();
  await field(p, 'اسم الشركة').locator('input').fill('موبايلات النور');
  await field(p, 'اسمك').locator('input').fill('أبو أحمد');
  await field(p, 'كلمة السر (6').locator('input').fill('secret123');
  await field(p, 'تأكيد كلمة السر').locator('input').fill('secret123');
  await field(p, 'اسم الشركة').scrollIntoViewIfNeeded().catch(() => undefined);
  await snap(p, 'form', { act: act('موبايلات'), name: field(p, 'اسم الشركة'), owner: field(p, 'اسمك'), pass: field(p, 'كلمة السر (6') });
  await p.locator('.demo-check input').check();
  await p.locator('.demo-check').scrollIntoViewIfNeeded().catch(() => undefined);
  await snap(p, 'form_demo', { demo: p.locator('.demo-check'), create: btn(p, 'إنشاء الشركة') });
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').waitFor({ timeout: 30000 });
  await snap(p, 'recovery', { key: p.locator('.modal .big-code').first(), ok: btn(p, 'حفظته، تابع') });
  await btn(p, 'حفظته، تابع').click();
  await p.locator('.sidebar').waitFor();
  await style(p);
  await step('try', async () => {
    await call(p, 'saveCurrency', { code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺', decimals: 2 });
    await call(p, 'setRate', { date: today, currency: 'TRY', kind: 'market', rate: 350 });
  });
  await p.waitForTimeout(1200);

  // الرئيسية
  await snap(p, 'dash', {
    side: p.locator('.sidebar nav'),
    stats: p.locator('.stats').first(),
    sales: p.locator('.stats > *', { hasText: 'مبيعات اليوم' }),
    profit: p.locator('.stats > *', { hasText: 'ربح اليوم' }),
    cash: p.locator('.stats > *', { hasText: /الصندوق|الصناديق/ }),
    debts: p.locator('.stats > *', { hasText: 'لنا على الناس' }),
    low: p.locator('section, .card', { hasText: /نواقص|قربت تخلص|تحت الحد/ }).last(),
    search: p.locator('.quick-search-button'),
    k_sale: navBtn(p, 'فاتورة مبيع'),
    k_pos: navBtn(p, 'نقطة البيع'),
    k_pur: navBtn(p, 'فاتورة شراء'),
    k_rep: navBtn(p, 'التقارير'),
  }, 1200);
  await step('qsearch', async () => {
    await p.keyboard.press('Control+KeyK');
    await p.locator('.quick-search input').first().fill('A15');
    await snap(p, 'qsearch', { input: p.locator('.quick-search input').first(), res: p.locator('.quick-search').first() }, 800);
    await esc(p);
  });

  // المواد
  await nav(p, /^المواد|الأجهزة والإكسسوارات/);
  await snap(p, 'items', { add: p.locator('.page-header button.primary').first(), imp: btn(p, 'استيراد من Excel'), labels: btn(p, 'طباعة ملصقات'), table: p.locator('table.table').first() }, 900);
  await step('item form', async () => {
    await p.locator('.page-header button.primary').first().click();
    const m = p.locator('.modal');
    await field(m, 'الاسم').locator('input').fill('Samsung Galaxy A25 128GB');
    await field(m, 'الباركود').locator('input').fill('8806095412345');
    await snap(p, 'item_new', { name: field(m, 'الاسم'), barcode: field(m, 'الباركود'), modal: m.first() });
    const tabBtn = m.locator('button', { hasText: 'الأسعار والوحدات' }).first();
    if (await tabBtn.isVisible().catch(() => false)) await tabBtn.click();
    for (const [lab, v] of [['سعر المبيع', '210'], ['سعر الجملة', '195']] as const) await field(m, lab).locator('input').fill(v).catch(() => undefined);
    await snap(p, 'item_price', {
      sale: field(m, 'سعر المبيع'), whole: field(m, 'سعر الجملة'), unit: field(m, /الوحدة/), cur: field(m, 'عملة السعر'),
      units: m.locator('section, .units, fieldset', { hasText: /وحدات|كرتونة/ }).first(), min: field(m, /الحد الأدنى|حد/), modal: m.first(),
    });
    await esc(p);
  });
  await step('labels', async () => {
    await btn(p, 'طباعة ملصقات').click();
    await snap(p, 'labels', { modal: p.locator('.modal').first() }, 900);
    await esc(p);
  });

  // نقطة البيع
  await nav(p, 'نقطة البيع');
  await style(p);
  await snap(p, 'pos', { scan: p.locator('.pos-search .scan-input').first(), item: p.locator('.pos-item').first(), grid: p.locator('.pos-grid').first(), cart: p.locator('.pos-cart').first() }, 900);
  for (const i of [5, 6, 7]) await p.locator('.pos-item').nth(i).click().catch(() => undefined);
  await p.locator('.pos-item').nth(5).click().catch(() => undefined);
  await snap(p, 'pos_cart', {
    lines: p.locator('.pos-lines').first(), qty: p.locator('.pos-line').first().locator('button', { hasText: '+' }), price: p.locator('.pos-line').first(),
    disc: p.locator('.pos-totals input').first(), totals: p.locator('.pos-totals').first(), cur: p.locator('.cur-switch').first(),
  });
  await step('pos usd', async () => {
    await p.locator('.cur-switch button', { hasText: /\$|دولار/ }).first().click();
    await snap(p, 'pos_usd', { cur: p.locator('.cur-switch').first(), rate: p.locator('.cur-switch').first(), totals: p.locator('.pos-totals').first() });
    await p.locator('.cur-switch button').first().click();
  });
  await step('pos paid', async () => {
    const tot = Number((await p.locator('.pos-totals strong.grand').first().innerText()).replace(/[^0-9.]/g, '')) || 37000;
    await p.locator('.pos-totals .big-input').fill(String(Math.ceil(tot / 5000) * 5000));
    await snap(p, 'pos_paid', {
      recv: p.locator('.pos-totals .big-input'), change: p.locator('.pos-totals strong').last(), pay: btn(p, 'دفع نقداً'), credit: btn(p, 'على الحساب'),
      auto: p.locator('.pos-footer label.check').first(), display: p.locator('.pos-footer button', { hasText: /شاشة الزبون/ }).first(), party: p.locator('.pos-cart .picker, .pos-cart input').first(),
    });
  });
  await btn(p, 'دفع نقداً').click();
  await p.waitForTimeout(1200);

  // الفواتير
  await nav(p, 'فاتورة مبيع');
  await style(p);
  await step('sale', async () => {
    await p.locator('.scan-input').first().fill('0151');
    await p.locator('.scan-input').first().press('Enter');
    await field(p, 'العميل').locator('input').first().click();
    await p.keyboard.type('سامر');
    await p.waitForTimeout(400);
    await p.keyboard.press('Enter');
    await p.locator('.pay-switch button.partial').click().catch(() => undefined);
    await p.waitForTimeout(10);
    await snap(p, 'sale', { party: field(p, 'العميل'), lines: p.locator('table.lines').first(), pay: p.locator('.pay-switch').first(), paid: p.locator('.invoice-editor .totals, .pay-switch').last(), save: btn(p, /حفظ الفاتورة/), newb: btn(p, 'فاتورة جديدة مع هي') }, 800);
  });
  await step('drafts', async () => {
    await p.locator('.pay-switch button.cash').click().catch(() => undefined);
    await btn(p, 'فاتورة جديدة مع هي').click();
    await p.waitForTimeout(500);
    await p.locator('.scan-input').first().fill('0000');
    await p.locator('.scan-input').first().press('Enter');
    await snap(p, 'imei', { scan: p.locator('.scan-input').first(), modal: p.locator('.modal').first(), first: p.locator('.serial-choices button').first() }, 800);
    await p.locator('.serial-choices button').nth(2).click();
    await snap(p, 'drafts', { bar: p.locator('.open-invoices'), first: p.locator('.open-invoice').first(), cur: p.locator('.open-invoice.active'), newb: btn(p, 'فاتورة جديدة مع هي'), line: p.locator('table.lines tbody tr').first() }, 700);
  });
  await step('currency convert', async () => {
    const cur = field(p, 'العملة').locator('select');
    await cur.selectOption('USD');
    await p.waitForTimeout(300);
    await p.locator('table.lines tbody tr').first().locator('td').nth(3).locator('input').fill('150');
    await snap(p, 'conv_usd', { cur: field(p, 'العملة'), price: p.locator('table.lines tbody tr').first().locator('td').nth(3), total: p.locator('.grand').first() });
    await cur.selectOption('SYP');
    await snap(p, 'conv_syp', { cur: field(p, 'العملة'), price: p.locator('table.lines tbody tr').first().locator('td').nth(3), total: p.locator('.grand').first() });
  });
  await nav(p, 'فاتورة شراء');
  await step('purchase', async () => {
    await p.locator('.scan-input').first().fill('CHARGER');
    await p.locator('.scan-input').first().press('Enter');
    await snap(p, 'purchase', { party: field(p, 'المورد'), lines: p.locator('table.lines').first(), save: btn(p, /حفظ الفاتورة/) }, 700);
  });
  // نسكّر الفواتير المفتوحة حتى ما يضل شريطها بباقي اللقطات
  p.on('dialog', (d) => void d.accept());
  for (let i = 0; i < 6 && (await p.locator('.open-invoice button.close').count()); i++) {
    await p.locator('.open-invoice button.close').first().click();
    await p.waitForTimeout(300);
  }
  await nav(p, 'سجل الفواتير');
  await snap(p, 'invoices', { list: p.locator('table.table').first(), first: p.locator('table.table tbody tr').first() }, 900);
  await step('ctx', async () => {
    await p.locator('table.table tbody tr').first().click({ button: 'right' });
    await snap(p, 'ctx', { first: p.locator('table.table tbody tr').first(), menu: p.locator('.ctx-menu').first(), edit: p.locator('.ctx-menu button', { hasText: 'تعديل' }).first() }, 500);
    await p.locator('.ctx-menu button', { hasText: 'تعديل' }).first().click();
    await snap(p, 'edit', { banner: p.locator('.banner').first(), head: p.locator('.page-header').first(), lines: p.locator('table.lines').first() }, 800);
  });
  for (let i = 0; i < 6 && (await p.locator('.open-invoice button.close').count()); i++) {
    await p.locator('.open-invoice button.close').first().click();
    await p.waitForTimeout(300);
  }
  await nav(p, 'سجل الفواتير');
  await p.locator('table.table tbody tr').first().click();
  await snap(p, 'invoice', { print: btn(p, /طباعة/), pdf: btn(p, /PDF/), back: p.locator('.back-x'), doc: p.locator('.invoice-paper, .paper, .doc').first(), edit: btn(p, /تعديل/) }, 900);
  await step('quotes', async () => {
    await nav(p, 'عروض الأسعار');
    await snap(p, 'quotes', { add: p.locator('.page-header button.primary').first() }, 800);
    await p.locator('.page-header button.primary').first().click();
    await p.waitForTimeout(500);
    const sc = p.locator('.scan-input').first();
    if (await sc.isVisible().catch(() => false)) { await sc.fill('A55'); await sc.press('Enter'); }
    await snap(p, 'quote', { head: p.locator('.page-header').first(), lines: p.locator('table.lines, table').first(), save: p.locator('button.primary.big, button.primary').last() }, 800);
  });
  await nav(p, 'الإعدادات');
  const tab = (label: string) => p.locator('.tabs button, .segmented button, [role=tab]', { hasText: label }).first();
  await step('print settings', async () => {
    await tab('الطباعة والفواتير').click();
    await snap(p, 'print_set', { tab: tab('الطباعة والفواتير'), tpl: p.locator('.template-picker, .templates, section').first(), color: field(p, /اللون/), stamp: field(p, /الختم/), terms: field(p, /الشروط/) }, 900);
  });

  // الديون
  await nav(p, 'الديون');
  await snap(p, 'debts', { owed: p.locator('.segmented button', { hasText: 'لنا عليهم' }).first(), owe: p.locator('.segmented button', { hasText: 'لهم علينا' }).first(), pay: btn(p, 'تسجيل قبض'), payout: btn(p, 'تسجيل دفع'), add: p.locator('.page-header button.primary').first(), list: p.locator('table.table').first() }, 900);
  await step('debt pay', async () => {
    await btn(p, 'تسجيل قبض').click();
    await snap(p, 'debt_pay', { modal: p.locator('.modal').first(), amount: p.locator('.modal input').first() }, 900);
    await esc(p);
  });
  await step('debt new', async () => {
    await p.locator('.page-header button.primary').first().click();
    await snap(p, 'debt_new', { modal: p.locator('.modal').first() }, 900);
    await esc(p);
  });
  await step('remind', async () => {
    const r = p.locator('button', { hasText: /تذكير/ }).first();
    if (!(await r.isVisible().catch(() => false))) await p.locator('table.table tbody tr').first().click();
    await snap(p, 'debt_remind', { remind: p.locator('button', { hasText: /تذكير/ }).first(), modal: p.locator('.modal').first() }, 900);
    await esc(p);
  });

  // العملات
  await nav(p, 'العملات وسعر الصرف');
  await snap(p, 'rates', { tabs: p.locator('.cur-tabs').first(), current: p.locator('.stats').first(), market: field(p, 'سعر السوق'), add: p.locator('.page-header button').first() }, 900);
  await step('cur new', async () => {
    await p.locator('.page-header button').first().click();
    await snap(p, 'cur_new', { quick: p.locator('.quick-cur').first(), modal: p.locator('.modal').first() }, 900);
    await esc(p);
  });

  // التقارير
  await nav(p, 'التقارير');
  await snap(p, 'reports', { tabs: p.locator('.tabs, .segmented').first(), body: p.locator('.page').first(), exp: p.locator('button', { hasText: /Excel|إكسل|تصدير/ }).first(), print: btn(p, /طباعة/) }, 1100);
  await step('daily', async () => {
    const d = p.locator('.tabs button, .segmented button, .sidebar nav button', { hasText: /إغلاق اليوم/ }).first();
    await d.click();
    await snap(p, 'daily', { tab: d, body: p.locator('.page').first(), exp: p.locator('button', { hasText: /Excel|إكسل|تصدير/ }).first(), print: btn(p, /طباعة/) }, 1000);
  });

  // المستخدمين
  await nav(p, 'المستخدمون');
  await snap(p, 'users', { add: p.locator('.page-header button').first(), list: p.locator('table.table').first() }, 900);
  await step('user new', async () => {
    await p.locator('.page-header button').first().click();
    await snap(p, 'user_new', { modal: p.locator('.modal').first(), role: p.locator('.modal select, .modal .segmented').first(), perms: p.locator('.modal .perms, .modal table, .modal ul').first() }, 1000);
    await esc(p);
  });

  // الإعدادات: الشبكة، الاتصال عن بعد، النسخ الاحتياطي
  await nav(p, 'الإعدادات');
  await step('lan', async () => {
    await tab('الشبكة المحلية').click();
    await snap(p, 'lan', { tab: tab('الشبكة المحلية'), body: p.locator('.page section, .card').nth(1) }, 900);
    const en = p.locator('label.check, button', { hasText: /تفعيل|السماح/ }).first();
    await en.click().catch(() => undefined);
    await snap(p, 'lan_on', { tab: tab('الشبكة المحلية'), en, code: p.locator('.big-code').first() }, 1200);
  });
  await step('cloud', async () => {
    await tab('الاتصال عن بعد').click();
    await p.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }).locator('input').check();
    await p.locator('.cloud-code .big-code').waitFor({ timeout: 8000 });
    await snap(p, 'cloud', { tab: tab('الاتصال عن بعد'), check: p.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }), qr: p.locator('.cloud-code svg, .cloud-code canvas, .cloud-code img').first(), code: p.locator('.cloud-code .big-code') }, 900);
  });
  await step('backup', async () => {
    await tab('النسخ الاحتياطي').click();
    await snap(p, 'backup', { tab: tab('النسخ الاحتياطي'), btn: p.locator('button', { hasText: /نسخة احتياطية/ }).first(), auto: p.locator('section, .card', { hasText: /تلقائي/ }).first(), folder: p.locator('button', { hasText: /مجلد|فلاشة|اختيار/ }).first() }, 900);
  });

  // تنبيه نسخة جديدة
  await step('update', async () => {
    feed = { ...feed, issuedAt: new Date(Date.now() + 2000).toISOString(), update: { version: '1.3.0', url: 'https://waznsy.com', notes: ['فواتير أسرع وتقارير أوضح', 'تحسينات بنقطة البيع', 'إصلاحات صغيرة'], date: new Date().toISOString() } };
    await nav(p, 'الرئيسية');
    await p.evaluate(() => (window as any).mizan.invoke('license:refresh'));
    await p.locator('.update-modal').waitFor({ timeout: 8000 });
    await snap(p, 'update', { modal: p.locator('.update-modal').first(), dl: p.locator('.update-modal button.primary').first(), chip: p.locator('.update-chip').first() }, 2000);
  });
} catch (e) {
  errs.push('FAILED ' + (e as Error).message.split('\n')[0]);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await A.close();
  server.close();
}
