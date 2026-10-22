// تجربة نسخة الويب (آيفون): جوال A (أندرويد بالمحل، الجهاز الرئيسي) وآيفون B بيفتح رابط QR بسفاري وبيتصل عن بعد.
// المتطلبات: MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts (www على 8790)،
// MIZAN_TEST_BUILD=1 npm run build:web (web-dist على 8791)، ومحاكي Firestore على 8085.
// npx tsx tests/mobile/cloud-web.mts <outdir>
import { chromium, devices, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense, signFeed } from '../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const S = process.argv[2] ?? '/tmp';
const URL = 'http://127.0.0.1:8790';
const WEB = 'http://127.0.0.1:8791';
fs.writeFileSync('www/test-feed.txt', signFeed({ v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-a': { status: 'active', cloud: true } } }, devKey));

const b = await chromium.launch();
const errs: string[] = [];
async function open(tag: string, url: string, iphone: boolean): Promise<Page> {
  const ctx = await b.newContext(iphone ? { ...devices['iPhone 13'], defaultBrowserType: undefined, bypassCSP: true } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`${tag} console: ${m.text().slice(0, 300)}`));
  await p.addInitScript((u) => {
    localStorage.setItem('mizan.tour.off', '1');
    if (u) localStorage.setItem('wazn.testFeed', `${u}/test-feed.txt`);
    localStorage.setItem('wazn.cloudEmulator', '127.0.0.1:8085');
  }, iphone ? '' : URL);
  await p.goto(url);
  return p;
}
const shot = async (p: Page, n: string) => {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${S}/web-${n}.png` });
};
const go = async (p: Page, label: string) => {
  if (await p.locator('.mobile-bar .menu').isVisible()) await p.locator('.mobile-bar .menu').click();
  await p.locator('.sidebar nav button', { hasText: label }).first().click();
};
const invoiceCount = async (p: Page) => {
  await go(p, 'سجل الفواتير');
  await p.waitForTimeout(600);
  return p.locator('table.table tbody tr').count();
};

// ── A: الجهاز الرئيسي ──
const A = await open('A', `${URL}/index.html`, false);
await A.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
const machineId = (await A.locator('.big-code').first().innerText()).trim();
await A.locator('textarea').first().fill(issueLicense({ id: 'lic-a', customer: 'تجربة', machineId, plan: 'annual' }, devKey));
await A.getByRole('button', { name: 'تفعيل', exact: true }).click();
await A.getByText('شركة جديدة').first().click();
await A.locator('.activity', { hasText: 'سوبرماركت' }).click();
await A.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('ماركت الآيفون');
await A.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
await A.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
await A.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
await A.locator('.demo-check input').check();
await A.getByRole('button', { name: 'إنشاء الشركة' }).click();
await A.getByRole('button', { name: 'حفظته، تابع' }).click();
await go(A, 'الإعدادات');
await A.locator('.tabs button, [role=tab]', { hasText: 'الاتصال عن بعد' }).first().click();
await A.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }).locator('input').check();
await A.locator('.cloud-code .big-code').waitFor();
const code = (await A.locator('.cloud-code .big-code').innerText()).trim().replace(/\s+/g, '-');
const before = await invoiceCount(A);

// ── B: آيفون بيفتح رابط الـ QR (بنفس شكل cloudCodeLink بس على السيرفر المحلي) ──
const B = await open('B', `${WEB}/index.html#c=${code.replace(/-/g, '')}`, true);
await B.locator('.web-connect').waitFor({ timeout: 20000 });
if ((await B.locator('.camera-scan').count()) !== 0) errs.push('camera button shown on web');
const prefilled = await B.locator('.field', { hasText: 'رمز الاتصال' }).locator('input').inputValue();
if (prefilled !== code) errs.push(`code not prefilled: ${prefilled} vs ${code}`);
if (!(await B.getByText('إضافة إلى الشاشة الرئيسية').isVisible())) errs.push('no add-to-home hint');
await B.locator('#wazn-intro').waitFor({ state: 'detached', timeout: 10000 });
await shot(B, '1-connect');
await B.locator('.field', { hasText: 'اسم المستخدم' }).locator('input').fill('admin');
await B.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('secret123');
await B.getByRole('button', { name: 'اتصال', exact: true }).click();
await B.locator('.bottom-nav').waitFor({ timeout: 30000 });
await shot(B, '2-dashboard');

await B.locator('.bottom-nav button', { hasText: 'البيع' }).click();
await B.locator('.pos-item').first().click();
if (await B.locator('.m-cart-bar').isVisible()) await B.locator('.m-cart-bar').click();
await B.getByRole('button', { name: 'دفع نقداً' }).click();
await B.waitForTimeout(1200);
await shot(B, '3-sold');
const after = await invoiceCount(A);
if (after !== before + 1) errs.push(`counts wrong: ${before} ${after}`);

// بعد إعادة فتح الصفحة: بيرجع لشاشة الاتصال والرمز واسم المستخدم محفوظين
await B.goto(`${WEB}/index.html`);
await B.locator('.web-connect').waitFor({ timeout: 20000 });
await B.waitForFunction(() => (document.querySelector('.web-connect input.mono') as HTMLInputElement | null)?.value);
const kept = await B.locator('.field', { hasText: 'اسم المستخدم' }).locator('input').inputValue();
if (kept !== 'admin') errs.push(`username not remembered: ${kept}`);
console.log(JSON.stringify({ before, after, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
