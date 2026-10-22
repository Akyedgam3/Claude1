// لقطات فيديو شرح الجوال: شاشات حقيقية من نسخة الموبايل (390×844، دقة 3x) مع مربعات العناصر للتأشير.
// المتطلبات: MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts (www على 8790)،
// MIZAN_TEST_BUILD=1 npm run build:web (web-dist على 8791)، والموقع (mizan-updates) على 8792.
// npx tsx marketing/video/mobile-guide/capture.mts <outdir>
import { chromium, devices, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { issueLicense, signFeed } from '../../../src/license/license';

const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const OUT = process.argv[2]!;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:8790';
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, { file: string; targets: Record<string, Box> }> = {};
const errs: string[] = [];
const today = new Date().toISOString().slice(0, 10);
const feed = (update: boolean) =>
  signFeed({ v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-v': { status: 'active', cloud: true, devices: 3 } }, ...(update ? { update: { version: '1.3.0', url: 'https://akyedgam3.github.io/mizan-updates/update.html', notes: 'تحسينات وإصلاحات', date: new Date().toISOString() } } : {}) }, devKey);
fs.writeFileSync('www/test-feed.txt', feed(false));
fs.writeFileSync('www/test-feed-up.txt', feed(true));

const b = await chromium.launch();
async function phone(feedFile = 'test-feed.txt', vp = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.addInitScript((f) => {
    localStorage.setItem('mizan.tour.off', '1');
    localStorage.setItem('wazn.testFeed', f);
  }, `${URL}/${feedFile}`);
  return p;
}
const hide = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' });

async function snap(p: Page, name: string, targets: Record<string, Locator> = {}, wait = 700) {
  await p.waitForTimeout(wait);
  const t: Record<string, Box> = {};
  for (const [k, loc] of Object.entries(targets)) {
    const bx = await loc.first().boundingBox({ timeout: 2500 }).catch(() => null);
    if (bx) t[k] = { x: Math.round(bx.x), y: Math.round(bx.y), w: Math.round(bx.width), h: Math.round(bx.height) };
    else errs.push(`no box ${name}.${k}`);
  }
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  states[name] = { file: `${name}.png`, targets: t };
  console.log('snap', name, Object.keys(t).join(','));
}
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (p: Page, label: string) => p.locator('.field', { hasText: label }).first();
const nav = async (p: Page, label: string) => {
  if (await p.locator('.mobile-bar .menu').isVisible()) await p.locator('.mobile-bar .menu').click();
  await p.locator('.sidebar nav button', { hasText: label }).first().click();
  await p.waitForTimeout(500);
};
const bottom = (p: Page, label: string) => p.locator('.bottom-nav button', { hasText: label }).first();
const esc = async (p: Page) => {
  await p.keyboard.press('Escape');
  await p.locator('.modal').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);
};

try {
  // ── الموقع ──
  {
    const p = await phone();
    await p.goto('http://127.0.0.1:8792/index.html');
    await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in', 'visible', 'shown')));
    await snap(p, 'site', { apk: p.locator('a', { hasText: 'تطبيق أندرويد' }) }, 1200);
  }

  // ── المسار الأساسي ──
  const p = await phone();
  await p.goto(`${URL}/index.html`);
  await p.waitForTimeout(1000);
  await snap(p, 'intro', {}, 0);
  await p.waitForFunction(() => !document.getElementById('wazn-intro'), null, { timeout: 15000 });
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  await hide(p);
  const fp = p.locator('.big-code').first();
  await snap(p, 'lock', { fp, copy: btn(p, 'نسخ البصمة'), key: p.locator('textarea').first(), activate: btn(p, 'تفعيل', true) });
  const machineId = (await fp.innerText()).trim();
  fs.writeFileSync(path.join(OUT, 'fp.txt'), machineId);
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-v', customer: 'ماركت الخير', machineId, plan: 'annual', devices: 3 }, devKey));
  await snap(p, 'lock_key', { key: p.locator('textarea').first(), activate: btn(p, 'تفعيل', true) });
  await btn(p, 'تفعيل', true).click();
  await p.getByText('شركة جديدة').first().waitFor();
  await p.getByText('شركة جديدة').first().click();
  await snap(p, 'welcome', { tab: p.getByText('شركة جديدة').first(), acts: p.locator('.activity').first() });
  await p.locator('.activity').first().scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
  await snap(p, 'acts', {
    a1: p.locator('.activity', { hasText: 'سوبرماركت' }),
    a2: p.locator('.activity', { hasText: 'مطعم' }),
    a3: p.locator('.activity', { hasText: 'ألبسة' }),
    a4: p.locator('.activity', { hasText: 'موبايلات' }),
    a5: p.locator('.activity', { hasText: 'صيدلية' }),
  });
  await p.locator('.activity', { hasText: 'سوبرماركت' }).click();
  await field(p, 'اسم الشركة').locator('input').fill('ماركت الخير');
  await field(p, 'اسمك').locator('input').fill('أبو محمد');
  await field(p, 'كلمة السر (6').locator('input').fill('secret123');
  await field(p, 'تأكيد كلمة السر').locator('input').fill('secret123');
  await field(p, 'اسم الشركة').scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
  await snap(p, 'form', { name: field(p, 'اسم الشركة'), owner: field(p, 'اسمك'), pass: field(p, 'كلمة السر (6') });
  await p.locator('.demo-check input').check();
  await p.locator('.demo-check').scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
  await snap(p, 'form_demo', { demo: p.locator('.demo-check'), create: btn(p, 'إنشاء الشركة') });
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').waitFor({ timeout: 20000 });
  await snap(p, 'recovery', { key: p.locator('.modal .big-code, .modal .mono, .big-code').first(), ok: btn(p, 'حفظته، تابع') });
  await btn(p, 'حفظته، تابع').click();
  await p.locator('.bottom-nav').waitFor();
  await hide(p);
  // عملات للمشاهد
  await p.evaluate(() => (window as any).mizan.invoke('company:call', 'saveCurrency', [{ code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺', decimals: 2 }]));
  await p.evaluate((d) => (window as any).mizan.invoke('company:call', 'setRate', [{ date: d, currency: 'TRY', kind: 'market', rate: 350 }]), today);
  await p.waitForTimeout(1200);
  await snap(p, 'dash', {
    n1: bottom(p, 'الرئيسية'),
    n2: bottom(p, 'البيع'),
    n3: bottom(p, 'الفواتير'),
    n4: bottom(p, 'الديون'),
    n5: bottom(p, 'المزيد'),
    nav: p.locator('.bottom-nav'),
    search: p.locator('.mobile-bar button').last(),
    menu: p.locator('.mobile-bar .menu'),
    hero: p.locator('.dash-hero, .hero, .welcome-card').first(),
    quick: p.locator('.quick-actions, .quick').first(),
  }, 1500);
  await p.mouse.wheel(0, 500);
  await snap(p, 'dash2', { stats: p.locator('.stats').first() }, 900);
  await p.mouse.wheel(0, -2000);

  // المواد
  await p.locator('.mobile-bar .menu').click();
  await snap(p, 'drawer', { items: p.locator('.sidebar nav button', { hasText: 'المواد' }).first(), rates: p.locator('.sidebar nav button', { hasText: 'العملات' }).first(), reports: p.locator('.sidebar nav button', { hasText: 'التقارير' }).first() });
  await p.locator('.sidebar nav button', { hasText: 'المواد' }).first().click();
  await snap(p, 'items', { add: p.locator('.page-header button.primary').first(), imp: btn(p, 'استيراد من Excel'), cam: p.locator('.camera-scan').first() }, 900);
  await p.locator('.page-header button.primary').first().click();
  const m = p.locator('.modal');
  await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('شيبس بطاطا 50غ');
  await m.locator('.field', { hasText: 'الباركود' }).first().locator('input').fill('6291041500213');
  await snap(p, 'item_new', { name: m.locator('.field', { hasText: 'الاسم' }).first(), barcode: m.locator('.field', { hasText: 'الباركود' }).first(), cam: m.locator('.camera-scan').first() });
  await m.locator('button', { hasText: 'الأسعار والوحدات' }).first().click();
  await m.locator('.field input').first().waitFor();
  for (const [lab, v] of [['سعر المبيع (مفرق)', '4500'], ['سعر الجملة', '4200']] as const) await m.locator('.field', { hasText: lab }).first().locator('input').fill(v).catch(() => undefined);
  await snap(p, 'item_price', { tab: m.locator('button', { hasText: 'الأسعار والوحدات' }).first(), unit: m.locator('.field', { hasText: /الوحدة/ }).first(), cur: m.locator('.field', { hasText: 'عملة السعر' }).first(), sale: m.locator('.field', { hasText: 'سعر المبيع' }).first(), cost: m.locator('.field', { hasText: /الشراء|الكلفة|التكلفة/ }).first() }, 900);
  await esc(p);

  // نقطة البيع
  await bottom(p, 'البيع').click();
  await p.waitForTimeout(700);
  await snap(p, 'pos', { tabs: p.locator('.m-cart-tabs'), item: p.locator('.pos-item').first(), search: p.locator('.scan-input, .pos input').first(), cam: p.locator('.camera-scan').first(), nav: bottom(p, 'البيع') });
  for (const i of [0, 2, 3]) await p.locator('.pos-item').nth(i).click();
  await p.locator('.pos-item').nth(0).click();
  await snap(p, 'pos_added', { item: p.locator('.pos-item').first(), bar: p.locator('.m-cart-bar') });
  await p.locator('.m-cart-bar').click();
  await snap(p, 'cart', {
    lines: p.locator('.pos-cart, .cart-lines').first(),
    qty: p.locator('.qty, .pos-cart input').first(),
    del: p.locator('.pos-cart button.icon, .cart-line button.icon').first(),
    disc: p.locator('.field, label', { hasText: /حسم|خصم/ }).first(),
    cur: p.locator('.currency-switch, .cur-switch, .pos-currency').first(),
    pay: btn(p, 'دفع نقداً'),
    totals: p.locator('.pos-totals').first(),
  });
  await btn(p, 'دفع نقداً').scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
  await snap(p, 'cart2', { disc: p.locator('.pos-totals').getByText('حسم', { exact: true }).first(), totals: p.locator('.pos-totals').first(), pay: btn(p, 'دفع نقداً') });
  await p.mouse.wheel(0, -3000);
  // عملة الدولار
  const usd = p.locator('.currency-switch button, .cur-switch button, .pos-currency button', { hasText: /\$|دولار/ }).first();
  if (await usd.isVisible().catch(() => false)) {
    await usd.click();
    await snap(p, 'cart_usd', { cur: usd, totals: p.locator('.pos-totals').first(), pay: btn(p, 'دفع نقداً') });
  }
  await btn(p, 'دفع نقداً').click();
  await p.waitForTimeout(900);
  await snap(p, 'sold', {}, 300);

  // الفواتير
  await bottom(p, 'الفواتير').click();
  await snap(p, 'invoices', { list: p.locator('table.table, .m-cards').first(), first: p.locator('table.table tbody tr').first(), nav: bottom(p, 'الفواتير') }, 900);
  await p.locator('table.table tbody tr').first().click();
  await snap(p, 'invoice', { back: p.locator('.back-x'), print: btn(p, /طباعة/), share: p.locator('button[title*="واتساب"], button', { hasText: /PDF|مشاركة/ }).first(), head: p.locator('.page-header').first() }, 900);
  await nav(p, 'فاتورة مبيع');
  await snap(p, 'sale0', { party: p.locator('.field', { hasText: /الزبون|العميل/ }).first(), lines: p.locator('.scan-wrap, .lines').first() }, 900);
  await p.locator('.field', { hasText: /المدفوع|مدفوع/ }).first().scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
  await snap(p, 'sale', { party: p.locator('.field', { hasText: /الزبون|العميل/ }).first(), lines: p.locator('.lines, table').first(), paid: p.locator('.field', { hasText: /المدفوع|مدفوع/ }).first() }, 900);

  // الديون
  await bottom(p, 'الديون').click();
  await snap(p, 'debts', { owed: p.locator('.segmented button', { hasText: 'لنا عليهم' }).first(), owe: p.locator('.segmented button', { hasText: 'لهم علينا' }).first(), pay: btn(p, 'تسجيل قبض'), add: p.locator('.page-header button.primary').first(), nav: bottom(p, 'الديون') }, 900);
  const remind = p.locator('button', { hasText: 'رسالة تذكير' }).first();
  await btn(p, 'تسجيل قبض').click();
  await snap(p, 'debt_pay', { modal: p.locator('.modal').first(), amount: p.locator('.modal input').first() }, 1200);
  await esc(p);
  await p.locator('.page-header button.primary').first().click();
  await snap(p, 'debt_new', { modal: p.locator('.modal').first() }, 2600);
  await esc(p);
  await p.locator('table.table tbody tr').first().click().catch(() => undefined);
  await p.waitForTimeout(700);
  await snap(p, 'debt_party', { remind: remind, sheet: p.locator('.modal').first() }, 2600);
  await esc(p);

  // العملات
  await nav(p, 'العملات وسعر الصرف');
  await snap(p, 'rates', { tabs: p.locator('.cur-tabs').first(), current: p.locator('.stats').first(), market: p.locator('.field', { hasText: 'سعر السوق' }).first(), add: p.locator('.page-header button').first() }, 900);
  await p.locator('.page-header button').first().click();
  await snap(p, 'cur_new', { quick: p.locator('.quick-cur'), eur: p.locator('.quick-cur button', { hasText: 'يورو' }), sar: p.locator('.quick-cur button', { hasText: 'ريال' }) }, 1200);
  await esc(p);

  // التقارير والمستخدمين
  await nav(p, 'التقارير');
  await snap(p, 'reports', { tabs: p.locator('.tabs, .segmented').first(), body: p.locator('.page').first() }, 1000);
  await p.mouse.wheel(0, 600);
  await snap(p, 'reports2', { exp: p.locator('button', { hasText: /Excel|إكسل|تصدير/ }).first(), print: btn(p, /طباعة/) }, 700);
  await nav(p, 'المستخدمون');
  await snap(p, 'users', { add: p.locator('.page-header button').first(), list: p.locator('table, .m-cards').first() }, 900);
  await p.locator('.page-header button').first().click();
  await snap(p, 'user_new', { modal: p.locator('.modal').first(), role: p.locator('.modal select, .modal .segmented').first() }, 1200);
  await esc(p);

  // الإعدادات: النسخ الاحتياطي والاتصال عن بعد
  await nav(p, 'الإعدادات');
  const tab = (label: string) => p.locator('.tabs button, [role=tab]', { hasText: label }).first();
  await tab('النسخ الاحتياطي').scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
  await tab('النسخ الاحتياطي').click();
  await snap(p, 'backup', { tab: tab('النسخ الاحتياطي'), btn: p.locator('button', { hasText: /نسخة احتياطية/ }).first() }, 900);
  await tab('الاتصال عن بعد').click();
  await p.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }).locator('input').check();
  await p.locator('.cloud-code .big-code').waitFor();
  const code = (await p.locator('.cloud-code .big-code').innerText()).trim().replace(/\s+/g, '-');
  await p.locator('.cloud-code').scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
  await snap(p, 'cloud', { tab: tab('الاتصال عن بعد'), check: p.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }), qr: p.locator('.cloud-code svg, .cloud-code canvas, .cloud-code img').first(), code: p.locator('.cloud-code .big-code') }, 900);
  fs.writeFileSync(path.join(OUT, 'code.txt'), code);

  // ── جوال تاني: شاشة البداية (استعادة + اتصال عن بعد) ──
  {
    const q = await phone();
    await q.goto(`${URL}/index.html`);
    await q.waitForFunction(() => !document.getElementById('wazn-intro'), null, { timeout: 15000 });
    await q.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
    await hide(q);
    const mid = (await q.locator('.big-code').first().innerText()).trim();
    await q.locator('textarea').first().fill(issueLicense({ id: 'lic-w', customer: 'ت', machineId: mid, plan: 'annual' }, devKey));
    await btn(q, 'تفعيل', true).click();
    await q.getByText('فتح شركة').first().waitFor();
    await q.getByText('فتح شركة').first().click();
    await snap(q, 'restore', { btn: q.locator('button', { hasText: 'استعادة نسخة احتياطية' }).first() });
    await q.getByRole('button', { name: 'اتصال عن بعد' }).first().click();
    await q.locator('.field', { hasText: 'رمز الاتصال' }).locator('input').fill(code);
    await q.locator('.field', { hasText: 'اسم المستخدم' }).locator('input').fill('admin');
    await q.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('secret123');
    await snap(q, 'remote_android', { tab: q.getByRole('button', { name: 'اتصال عن بعد' }).first(), code: q.locator('.field', { hasText: 'رمز الاتصال' }), cam: q.locator('.camera-scan').first(), user: q.locator('.field', { hasText: 'اسم المستخدم' }), connect: q.getByRole('button', { name: 'اتصال', exact: true }) });
  }

  // ── آيفون: نسخة الويب ──
  {
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 3, bypassCSP: true });
    const q = await ctx.newPage();
    await q.addInitScript(() => localStorage.setItem('mizan.tour.off', '1'));
    await q.goto(`http://127.0.0.1:8791/index.html#c=${code.replace(/-/g, '')}`);
    await q.locator('.web-connect').waitFor({ timeout: 20000 });
    await q.waitForFunction(() => !document.getElementById('wazn-intro'), null, { timeout: 15000 });
    await hide(q);
    await snap(q, 'iphone', { code: q.locator('.field', { hasText: 'رمز الاتصال' }), user: q.locator('.field', { hasText: 'اسم المستخدم' }) });
    await q.locator('.web-install').scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => undefined);
    await snap(q, 'iphone_install', { hint: q.locator('.web-install') });
  }

  // ── تنبيه نسخة جديدة ──
  {
    const q = await phone('test-feed-up.txt');
    await q.goto(`${URL}/index.html`);
    await q.waitForFunction(() => !document.getElementById('wazn-intro'), null, { timeout: 15000 });
    await q.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
    await hide(q);
    await q.waitForTimeout(2500);
    await snap(q, 'update', { notice: q.locator('.update-notice, .update, .modal').first() }, 500);
  }
} catch (e) {
  errs.push('FAILED ' + (e as Error).message.split('\n')[0]);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await b.close();
}
