// لقطات فيديو «الاتصال عن بعد». المتطلبات: محاكي Firestore على 8085، www على 8790، web-dist على 8791، وMIZAN_TEST_BUILD=1 npm run build.
// xvfb-run -a npx tsx marketing/video/remote-tutorial/capture.mts <outdir>
// لقطات فيديو «الاتصال عن بعد»: كمبيوتر المحل (رئيسي) + جوال أندرويد + آيفون + كمبيوتر البيت، كلهن عالمحاكي.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, devices, type Page } from '@playwright/test';
import { launch } from '../../../tests/e2e/helpers';
import { issueLicense, signFeed, type LicenseFeed } from '../../../src/license/license';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const devKey = fs.readFileSync(path.join(ROOT, 'dev-keys/license-private.dev.pem'), 'utf8');
const OUT = process.argv[2]!;
const EMU = '127.0.0.1:8085';
const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-rt': { status: 'active', cloud: true } } };
const srv = http.createServer((_q, r) => r.end(signFeed(feed, devKey)));
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${(srv.address() as { port: number }).port}/feed.txt`;
const style = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' }).catch(() => undefined);
const snap = async (p: Page, n: string, wait = 700) => { await style(p); await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('snap', n); };
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (p: Page, label: string | RegExp) => p.locator('.field', { hasText: label }).first();
const nav = (p: Page, label: string) => p.locator('.sidebar nav button', { hasText: label }).first();

// ── كمبيوتر المحل ──
const shop = await launch({ feedUrl });
const sp = shop.page;
await sp.setViewportSize({ width: 1600, height: 900 });
await sp.evaluate((e) => localStorage.setItem('wazn.cloudEmulator', e), EMU);
await sp.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
const machineId = (await sp.locator('.big-code').first().innerText()).trim();
await sp.locator('textarea').first().fill(issueLicense({ id: 'lic-rt', customer: 'ماركت النور', machineId, plan: 'annual', devices: 8 }, devKey));
await btn(sp, 'تفعيل', true).click();
await btn(sp, 'شركة جديدة').click();
await sp.locator('.activity', { hasText: 'سوبرماركت' }).first().click();
await field(sp, 'اسم الشركة').locator('input').fill('ماركت النور');
await field(sp, 'اسمك').locator('input').fill('أبو محمد');
await field(sp, 'كلمة السر (6').locator('input').fill('secret123');
await field(sp, 'تأكيد كلمة السر').locator('input').fill('secret123');
await sp.locator('.demo-check input').check();
await btn(sp, 'إنشاء الشركة').click();
await btn(sp, 'حفظته، تابع').click({ timeout: 30000 });
await sp.locator('.sidebar').waitFor();
await snap(sp, 'd-dash', 1200);
await nav(sp, 'الإعدادات').click();
await snap(sp, 'd-settings');
await btn(sp, 'الاتصال عن بعد').click();
await snap(sp, 'd-remote-off');
await sp.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }).locator('input').check();
await sp.locator('.cloud-code .big-code').waitFor();
const code = (await sp.locator('.cloud-code .big-code').innerText()).trim().replace(/\s+/g, '-');
await snap(sp, 'd-remote-on', 1200);
console.log('code', code);
// كاشير بصلاحيات محدودة (لمشهد الصلاحيات)
await sp.evaluate(() => (window as any).mizan.invoke('company:call', 'createUser', [{ id: 'cash1', username: 'cashier', displayName: 'الكاشير سامر', role: 'cashier', active: true }, 'cashier1']));
await nav(sp, 'المستخدمون').click();
await snap(sp, 'd-users');

// ── جوال أندرويد ──
const b = await chromium.launch();
const ctxA = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true });
const A = await ctxA.newPage();
await A.addInitScript((e) => { localStorage.setItem('mizan.tour.off', '1'); localStorage.setItem('wazn.cloudEmulator', e); }, EMU);
await A.goto('http://127.0.0.1:8790/index.html');
await A.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
await A.locator('#wazn-intro').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
await snap(A, 'a-start');
await btn(A, 'اتصال عن بعد').click();
await snap(A, 'a-connect-empty');
await field(A, 'رمز الاتصال').locator('input').fill(code);
await field(A, 'اسم المستخدم').locator('input').fill('admin');
await field(A, 'كلمة السر').locator('input').fill('secret123');
await snap(A, 'a-connect-filled');
await btn(A, 'اتصال', true).click();
await A.locator('.bottom-nav').waitFor({ timeout: 60000 });
await snap(A, 'a-dash', 1500);
await A.locator('.bottom-nav button', { hasText: 'الفواتير' }).click();
await snap(A, 'a-invoices', 1000);
await A.locator('.bottom-nav button', { hasText: 'الديون' }).click();
await snap(A, 'a-debts', 1000);

// ── آيفون (الويب) ──
const ctxI = await b.newContext({ ...devices['iPhone 13'], bypassCSP: true });
const I = await ctxI.newPage();
await I.addInitScript((e) => { localStorage.setItem('mizan.tour.off', '1'); localStorage.setItem('wazn.cloudEmulator', e); }, EMU);
await I.goto(`http://127.0.0.1:8791/index.html#c=${code.replace(/-/g, '')}`);
await I.locator('.web-connect').waitFor({ timeout: 20000 });
await I.locator('#wazn-intro').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
await snap(I, 'i-connect');
await field(I, 'اسم المستخدم').locator('input').fill('admin');
await field(I, 'كلمة السر').locator('input').fill('secret123');
await snap(I, 'i-connect-filled');
await btn(I, 'اتصال', true).click();
await I.locator('.bottom-nav').waitFor({ timeout: 60000 });
await snap(I, 'i-dash', 1500);

// ── كمبيوتر البيت ──
process.env['WAZN_CLOUD_EMULATOR'] = EMU;
const home = await launch();
const hp = home.page;
await hp.setViewportSize({ width: 1600, height: 900 });
await hp.getByText('جهاز فرعي أو متصل عن بعد؟').waitFor({ timeout: 20000 });
await snap(hp, 'h-start');
await btn(hp, 'اتصال عن بعد').click();
await field(hp, 'رمز الاتصال').locator('input').fill(code);
await field(hp, 'اسم المستخدم').locator('input').fill('admin');
await field(hp, 'كلمة السر').locator('input').fill('secret123');
await snap(hp, 'h-connect');
try {
  await btn(hp, 'اتصال', true).click();
  await hp.locator('.user-chip').filter({ hasText: 'متصل بالجهاز الرئيسي' }).waitFor({ timeout: 120000 });
  await snap(hp, 'h-dash', 1500);
  await home.close();
  const again = await launch({ home: home.home });
  const ap = again.page;
  await ap.setViewportSize({ width: 1600, height: 900 });
  await btn(ap, 'اتصال عن بعد').click();
  await ap.locator('.saved-conn').waitFor({ timeout: 20000 });
  await field(ap, 'كلمة السر').locator('input').fill('secret123');
  await snap(ap, 'h-again');
  await again.close();
} catch (e) {
  console.log('home failed', (e as Error).message.slice(0, 200));
  await hp.screenshot({ path: `${OUT}/h-error.png` }).catch(() => undefined);
  console.log('home text', (await hp.locator('body').innerText().catch(() => '')).slice(-400));
  await home.close().catch(() => undefined);
}

// ── الكاشير بصلاحياته من الجوال ──
const ctxC = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true });
const C = await ctxC.newPage();
await C.addInitScript((e) => { localStorage.setItem('mizan.tour.off', '1'); localStorage.setItem('wazn.cloudEmulator', e); }, EMU);
await C.goto('http://127.0.0.1:8790/index.html');
await C.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
await btn(C, 'اتصال عن بعد').click();
await field(C, 'رمز الاتصال').locator('input').fill(code);
await field(C, 'اسم المستخدم').locator('input').fill('cashier');
await field(C, 'كلمة السر').locator('input').fill('cashier1');
await btn(C, 'اتصال', true).click();
await C.locator('.bottom-nav').waitFor({ timeout: 60000 });
await snap(C, 'c-dash', 1500);
await C.locator('.bottom-nav button', { hasText: 'المزيد' }).click();
await snap(C, 'c-menu', 800);

// ── الجهاز الرئيسي انطفى ──
await shop.close();
// عملية من الجوال والجهاز الرئيسي مطفي: بتتأخر وبعدين الجوال بيشتغل عالنسخة المحفوظة
await A.locator('.bottom-nav button', { hasText: 'البيع' }).click();
await A.locator('.pos-item').first().click();
if (await A.locator('.m-cart-bar').isVisible()) await A.locator('.m-cart-bar').click();
await A.getByRole('button', { name: 'دفع نقداً' }).click().catch(() => undefined);
for (let k = 0; k < 40; k++) {
  if (await A.locator('.banner', { hasText: 'الجهاز الرئيسي مطفي' }).count()) break;
  await A.waitForTimeout(3000);
}
await A.locator('.bottom-nav button', { hasText: 'الرئيسية' }).click();
await snap(A, 'a-offline', 1000);
await b.close();
srv.close();
console.log('done');
