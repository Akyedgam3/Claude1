// تجربة الاتصال عن بعد بالمتصفح: جوال A (بالمحل، الجهاز الرئيسي) وجوال B (بالبيت، بدون ترخيص).
// المتطلبات: MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts، سيرفر لـ www على 8790، ومحاكي Firestore على 8085.
// npx tsx tests/mobile/cloud.mts <outdir>
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense, signFeed } from '../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const S = process.argv[2] ?? '/tmp';
const URL = 'http://127.0.0.1:8790';
fs.writeFileSync('www/test-feed.txt', signFeed({ v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-a': { status: 'active', cloud: true } } }, devKey));

const b = await chromium.launch();
const errs: string[] = [];
async function phone(tag: string): Promise<Page> {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`${tag} console: ${m.text().slice(0, 300)}`));
  await p.addInitScript((u) => {
    localStorage.setItem('mizan.tour.off', '1');
    localStorage.setItem('wazn.testFeed', `${u}/test-feed.txt`);
    localStorage.setItem('wazn.cloudEmulator', '127.0.0.1:8085');
  }, URL);
  await p.goto(`${URL}/index.html`);
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  return p;
}
const shot = async (p: Page, n: string) => {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${S}/cloud-${n}.png` });
};
const go = async (p: Page, label: string) => {
  if (await p.locator('.mobile-bar .menu').isVisible()) await p.locator('.mobile-bar .menu').click();
  await p.locator('.sidebar nav button', { hasText: label }).first().click();
};
const sell = async (p: Page) => {
  await p.locator('.bottom-nav button', { hasText: 'البيع' }).click();
  await p.locator('.pos-item').first().click();
  if (await p.locator('.m-cart-bar').isVisible()) await p.locator('.m-cart-bar').click();
  await p.getByRole('button', { name: 'دفع نقداً' }).click();
  await p.waitForTimeout(800);
};
const invoiceCount = async (p: Page) => {
  await go(p, 'سجل الفواتير');
  await p.waitForTimeout(600);
  return p.locator('table.table tbody tr').count();
};

// ── A: الجهاز الرئيسي بالمحل، ترخيص فيه خدمة الاتصال عن بعد ──
const A = await phone('A');
const machineId = (await A.locator('.big-code').first().innerText()).trim();
await A.locator('textarea').first().fill(issueLicense({ id: 'lic-a', customer: 'تجربة', machineId, plan: 'annual' }, devKey));
await A.getByRole('button', { name: 'تفعيل', exact: true }).click();
await A.getByText('شركة جديدة').first().click();
await A.locator('.activity', { hasText: 'سوبرماركت' }).click();
await A.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('ماركت عن بعد');
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
const code = (await A.locator('.cloud-code .big-code').innerText()).trim();
await shot(A, '1-host-settings');
const before = await invoiceCount(A);

// ── B: جوال بالبيت بدون ترخيص، بيتصل عن بعد ──
const B = await phone('B');
await B.getByRole('button', { name: 'اتصال عن بعد' }).click();
await B.locator('.field', { hasText: 'رمز الاتصال' }).locator('input').fill(code.toLowerCase().replace(/-/g, ' '));
await B.locator('.field', { hasText: 'اسم المستخدم' }).locator('input').fill('admin');
await B.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('secret123');
await shot(B, '2-client-connect');
const t0 = Date.now();
await B.getByRole('button', { name: 'اتصال', exact: true }).click();
await B.locator('.bottom-nav').waitFor({ timeout: 30000 });
console.log('connect ms', Date.now() - t0);
await shot(B, '3-client-dashboard');

// B بيبيع ← بيظهر على A
await sell(B);
await shot(B, '4-client-sold');
const afterB = await invoiceCount(A);
// A بيبيع ← بيظهر على B
await sell(A);
await A.waitForTimeout(1500);
const onB = await invoiceCount(B);
await shot(B, '5-client-invoices');
console.log(JSON.stringify({ before, afterB, onB }));
if (afterB !== before + 1 || onB !== before + 2) errs.push(`counts wrong: ${before} ${afterB} ${onB}`);
console.log(JSON.stringify(errs, null, 1));
await b.close();
