// الجهاز الرئيسي مطفي: جوال B اتصل مرة وهو شغّال، بعدين A انطفى، وB سكّر التطبيق ورجع فتحه ← لازم يفتح بكلمة السر عالنسخة المحفوظة.
// المتطلبات: MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts، سيرفر لـ www على 8790، ومحاكي Firestore على 8085.
// npx tsx tests/mobile/cloud-offline.mts <outdir>
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense, signFeed } from '../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const S = process.argv[2] ?? '/tmp';
const URL = 'http://127.0.0.1:8790';
fs.writeFileSync('www/test-feed.txt', signFeed({ v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-a': { status: 'active', cloud: true } } }, devKey));

const b = await chromium.launch();
const errs: string[] = [];
const aDir = fs.mkdtempSync('/tmp/wazn-host-a-');
async function phone(tag: string, persistent = false): Promise<Page> {
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true };
  const ctx = persistent ? await chromium.launchPersistentContext(aDir, opts) : await b.newContext(opts);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`${tag} console: ${m.text().slice(0, 300)}`));
  await p.addInitScript((u) => {
    localStorage.setItem('mizan.tour.off', '1');
    localStorage.setItem('wazn.testFeed', `${u}/test-feed.txt`);
    localStorage.setItem('wazn.cloudEmulator', '127.0.0.1:8085');
  }, URL);
  await p.goto(`${URL}/index.html`);
  if (tag !== 'A2') await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
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
const A = await phone('A', true);
const machineId = (await A.locator('.big-code').first().innerText()).trim();
await A.locator('textarea').first().fill(issueLicense({ id: 'lic-a', customer: 'تجربة', machineId, plan: 'annual' }, devKey));
await A.getByRole('button', { name: 'تفعيل', exact: true }).click();
await A.getByText('شركة جديدة').first().click();
await A.locator('.act-choose').click();
await A.locator('.act-search input').fill('سوبرماركت');
await A.locator('.act-card').first().click();
await A.locator('.act-modal-foot .primary').click();
await A.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('ماركت عن بعد');
await A.getByRole('button', { name: 'التالي' }).click();
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


// A بيبيع وهو شغّال (لازم تبيّن عند B حتى وهو مطفي)
await sell(A);
await A.waitForTimeout(2500);
// A بينطفى (سكّر التطبيق)، وB بيسكّر التطبيق ويرجع يفتحه
// سكّر البرنامج عادي (بيكتب «مطفي» بالسحابة) إلا إذا HARD=1 (انقطاع كهربا: ما بيلحق يكتب)
if (!process.env.HARD) {
  await A.goto('about:blank');
  await A.waitForTimeout(1500);
}
await A.context().close();
await B.waitForTimeout(1500);
await B.reload();
await B.waitForTimeout(2500);
await shot(B, 'off-1-reopened');
await B.screenshot({ path: `${S}/cloud-off-1-full.png`, fullPage: true });
const body = (await B.locator('body').innerText()).slice(0, 400);
console.log('after reload:', body.replace(/\s+/g, ' ').slice(0, 300));
// الاتصال المحفوظ: كلمة السر بس
await B.getByRole('button', { name: 'اتصال عن بعد' }).last().click();
await shot(B, 'off-1b-saved');
const pass = B.locator('input[type=password]').first();
await pass.waitFor({ timeout: 20000 });
await pass.fill('secret123');
console.log('buttons:', (await B.locator('form button').allInnerTexts()).join(' | '));
await B.locator('form button.primary').last().click();
const t1 = Date.now();
try {
  await B.locator('.bottom-nav').waitFor({ timeout: 60000 });
  console.log('opened offline in ms', Date.now() - t1);
} catch {
  await shot(B, 'off-2-failed');
  console.log('toasts:', await B.locator('.toast').allInnerTexts());
  console.log('saved-conn:', await B.locator('.saved-conn').count(), 'pw inputs:', await B.locator('input[type=password]').count());
  console.log('FAILED to open:', (await B.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500));
  console.log(JSON.stringify(errs, null, 1));
  process.exit(1);
}
await shot(B, 'off-2-opened');
const n = await invoiceCount(B);
console.log('invoices on B offline:', n, 'expected', before + 1);
if (n !== before + 1) errs.push(`offline count ${n} != ${before + 1}`);
// بيع والرئيسي مطفي: بيستنى. وبعدين فاتورة تانية منلغيها (عملية بتعتمد على فاتورة انعملت والرئيسي مطفي)
await sell(B);
await shot(B, 'off-3-sold');
const bCall = (m: string, a: unknown[]) => B.evaluate(([mm, aa]) => (window as any).mizan.invoke('company:call', mm, aa), [m, a] as const);
const bState = async () => (await B.evaluate(() => (window as any).mizan.invoke('company:state'))) as { state: { invoices: { id: string; number: number; voidedBy?: string; voided?: boolean }[] } };
await sell(B);
const offInv = (await bState()).state.invoices.at(-1)!;
await bCall('voidInvoice', [offInv.id, new Date().toISOString().slice(0, 10)]);
await B.waitForTimeout(800);

// ── رجع الجهاز الرئيسي: لازم يوصله كل شي انعمل عالجوال ──
const A2 = await phone('A2', true);
await A2.waitForTimeout(4000);
await shot(A2, 'off-4a-host-reopen');
await A2.getByText('ماركت عن بعد').first().click();
await A2.locator('input[type=password]').first().waitFor({ timeout: 30000 });
await A2.locator('input[type=password]').first().fill('secret123');
await A2.locator('input[type=password]').first().press('Enter');
await A2.locator('.bottom-nav').waitFor({ timeout: 30000 });
const aState = async () => (await A2.evaluate(() => (window as any).mizan.invoke('company:state'))) as { state: { invoices: { id: string; voidedBy?: string; voided?: boolean; status?: string }[] } };
let ok = false;
for (let i = 0; i < 60 && !ok; i++) {
  await A2.waitForTimeout(1000);
  const st = (await aState()).state;
  const mine = st.invoices.find((x) => x.id === offInv.id);
  ok = st.invoices.length >= before + 3 && !!mine && JSON.stringify(mine).includes('void');
}
const stA = (await aState()).state;
console.log('host invoices after return:', stA.invoices.length, 'expected >=', before + 3, 'offline invoice voided on host:', JSON.stringify(stA.invoices.find((x) => x.id === offInv.id) ?? null).includes('void'));
await shot(A2, 'off-4-host-back');
if (!ok) errs.push('host did not receive the offline operations');
await A2.context().close();
console.log(JSON.stringify(errs, null, 1));
await b.close();
process.exit(errs.filter((e) => !/console:/.test(e) && !/A pageerror: Failed to read the 'localStorage'/.test(e)).length ? 1 : 0);
