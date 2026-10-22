// لقطات الإعلان: شاشات حقيقية من وزن (نسخة الويب تبع الجوال، بعرض كمبيوتر وبعرض جوال).
// npx tsx marketing/video/ad60/capture.mts <outdir>   (بعد MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts وسيرفر لـ www على 8790)
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense } from '../../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const OUT = process.argv[2]!;
const b = await chromium.launch();

async function setup(p: Page, company: string) {
  await p.addInitScript(() => localStorage.setItem('mizan.tour.off', '1'));
  await p.goto('http://127.0.0.1:8790/index.html');
  await p.waitForFunction(() => !document.getElementById('wazn-intro'), null, { timeout: 15000 });
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  const machineId = (await p.locator('.big-code').first().innerText()).trim();
  await p.locator('textarea').first().fill(issueLicense({ customer: 'ت', machineId, plan: 'annual' }, devKey));
  await p.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await p.getByText('شركة جديدة').first().click();
  await p.locator('.activity', { hasText: 'سوبرماركت' }).click();
  await p.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill(company);
  await p.locator('.field', { hasText: 'اسمك' }).locator('input').fill('أبو محمد');
  await p.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
  await p.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
  await p.locator('.demo-check input').check();
  await p.getByRole('button', { name: 'إنشاء الشركة' }).click();
  await p.getByRole('button', { name: 'حفظته، تابع' }).click();
  await p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' });
  await p.waitForTimeout(800);
}
const shot = async (p: Page, n: string, wait = 1300) => {
  await p.waitForTimeout(wait);
  await p.mouse.move(0, 0);
  await p.screenshot({ path: `${OUT}/${n}.png` });
};
const nav = async (p: Page, label: string) => {
  if (await p.locator('.mobile-bar .menu').isVisible()) await p.locator('.mobile-bar .menu').click();
  await p.locator('.sidebar nav button', { hasText: label }).first().click();
};

// ── شاشات الكمبيوتر (عرض 1440، القائمة الجانبية ثابتة) ──
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await setup(p, 'سوبرماركت الخير');
  // عملة تانية للمشهد: ليرة تركية
  await p.evaluate(() => (window as any).mizan.invoke('company:call', 'saveCurrency', [{ code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺', decimals: 2 }]));
  await p.evaluate((d) => (window as any).mizan.invoke('company:call', 'setRate', [{ date: d, currency: 'TRY', kind: 'market', rate: 3.5 }]), new Date().toISOString().slice(0, 10));
  await shot(p, 'd-dashboard');
  await nav(p, 'نقطة البيع');
  for (const i of [0, 2, 3, 5]) await p.locator('.pos-item').nth(i).click();
  await shot(p, 'd-pos');
  await p.getByRole('button', { name: 'دفع نقداً' }).click();
  await p.waitForTimeout(800);
  await nav(p, 'سجل الفواتير');
  await p.waitForTimeout(600);
  await p.locator('table.table tbody tr').first().click();
  await shot(p, 'd-invoice');
  await nav(p, 'الديون');
  await shot(p, 'd-debts');
  await nav(p, 'التقارير');
  await shot(p, 'd-reports');
  await nav(p, 'المواد');
  await shot(p, 'd-items');
  await nav(p, 'العملات وسعر الصرف');
  await shot(p, 'd-rates');
  await ctx.close();
}
// ── شاشات الجوال ──
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await setup(p, 'سوبرماركت الخير');
  await shot(p, 'm-dashboard');
  await p.locator('.bottom-nav button', { hasText: 'البيع' }).click();
  for (const i of [0, 2, 3]) await p.locator('.pos-item').nth(i).click();
  await shot(p, 'm-pos');
  await p.locator('.m-cart-bar').click();
  await shot(p, 'm-cart');
  await p.getByRole('button', { name: 'دفع نقداً' }).click();
  await p.waitForTimeout(700);
  await p.locator('.bottom-nav button', { hasText: 'الديون' }).click();
  await shot(p, 'm-debts');
  await p.locator('.bottom-nav button', { hasText: 'الفواتير' }).click();
  await shot(p, 'm-invoices');
  await ctx.close();
}
await b.close();
console.log('ok');
