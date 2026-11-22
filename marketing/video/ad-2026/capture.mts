// لقطات إعلان التحديث (2.0.3): شاشات حقيقية من وزن، كمبيوتر (1440) وجوال (390).
// MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts، سيرفر لـ www على 8790، ثم:
// npx tsx marketing/video/ad-2026/capture.mts <outdir>
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense } from '../../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const OUT = process.argv[2]!;
fs.mkdirSync(OUT, { recursive: true });
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
  await p.locator('.act-choose').click();
  await p.locator('.act-search input').fill('سوبرماركت');
  await p.locator('.act-card').first().click();
  await p.locator('.act-modal-foot .primary').click();
  await p.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill(company);
  await p.getByRole('button', { name: 'التالي' }).click();
  await p.locator('.field', { hasText: 'اسمك' }).locator('input').fill('أبو محمد');
  await p.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
  await p.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
  await p.locator('.demo-check input').check();
  await p.getByRole('button', { name: 'إنشاء الشركة' }).click();
  await p.getByRole('button', { name: 'حفظته، تابع' }).click();
  await p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important} .assistant-fab{display:none!important}' });
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

// ── الكمبيوتر ──
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await setup(p, 'سوبرماركت الخير');
  await shot(p, 'd-dashboard');
  await nav(p, 'لوحة الإدارة');
  await shot(p, 'd-mgmt', 2000);
  await nav(p, 'التنبيهات');
  await shot(p, 'd-alerts');
  await nav(p, 'نقطة البيع');
  for (const i of [0, 2, 3, 5]) await p.locator('.pos-item').nth(i).click();
  await shot(p, 'd-pos');
  await ctx.close();
}
// ── الجوال ──
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await setup(p, 'سوبرماركت الخير');
  await shot(p, 'm-dashboard');
  await nav(p, 'لوحة الإدارة');
  await shot(p, 'm-mgmt', 2000);
  await nav(p, 'التنبيهات');
  await shot(p, 'm-alerts');
  await p.locator('.bottom-nav button', { hasText: 'البيع' }).click();
  for (const i of [0, 2, 3]) await p.locator('.pos-item').nth(i).click();
  await shot(p, 'm-pos');
  await ctx.close();
}
await b.close();
console.log('ok');
