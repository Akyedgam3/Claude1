// لقطات إعلان «بلا نظام» (ad-pro): شاشة العملات وسعر الصرف (والباقي من ad-action/capture.mts).
// MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts، سيرفر لـ www على 8790، بعدين:
// npx tsx marketing/video/ad-pro/capture.mts <outdir>
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense } from '../../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const OUT = process.argv[2]!;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();

async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('mizan.tour.off', '1'));
  await page.goto('http://127.0.0.1:8790/index.html');
  await page.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 30000 });
  const machineId = (await page.locator('.big-code').first().innerText()).trim();
  await page.locator('textarea').first().fill(issueLicense({ customer: 'ت', machineId, plan: 'annual' }, devKey));
  await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await page.getByText('شركة جديدة').first().click();
  await page.locator('.activity', { hasText: 'سوبرماركت' }).click();
  await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('سوبرماركت الخير');
  await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('أبو محمد');
  await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
  await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
  await page.locator('.demo-check input').check();
  await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
  await page.getByRole('button', { name: 'حفظته، تابع' }).click({ timeout: 60000 });
  await page.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important} *{animation-duration:0s!important;transition-duration:0s!important} .content{scroll-behavior:auto!important}' });
  await page.waitForTimeout(900);
}

/** بيسجّل الشاشة وهي نازلة: N فريم من فوق لـ max (مع تسارع وتباطؤ). */
async function scrollRec(name: string, frames = 48, maxPx = 900) {
  const dir = `${OUT}/${name}`;
  fs.mkdirSync(dir, { recursive: true });
  const max = await p.evaluate((m) => {
    const c = document.querySelector('.content')!;
    return Math.min(m, c.scrollHeight - c.clientHeight);
  }, maxPx);
  await p.mouse.move(0, 0);
  for (let i = 0; i < frames; i++) {
    const x = i / (frames - 1);
    const e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    await p.evaluate((y) => document.querySelector('.content')!.scrollTo(0, y), Math.round(e * max));
    await p.waitForTimeout(40);
    await p.screenshot({ path: `${dir}/${String(i).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 88 });
  }
  console.log(name, max);
}
const top = () => p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
const go = async (label: string) => {
  const nav = p.locator('.bottom-nav button', { hasText: label });
  if (await nav.count()) await nav.first().click();
  else {
    await p.locator('.mobile-bar .menu').click();
    await p.waitForTimeout(400);
    await p.locator('.sidebar nav button', { hasText: label }).first().click();
  }
  await p.waitForTimeout(800);
  await top();
};

await setup(p);
await go('العملات');
await p.waitForTimeout(600);
await p.mouse.move(0, 0);
await p.screenshot({ path: `${OUT}/currency.jpg`, type: 'jpeg', quality: 90 });
await b.close();
console.log('ok');
