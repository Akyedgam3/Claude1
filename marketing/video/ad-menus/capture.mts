// لقطات إعلان «القوائم والسهولة» (ريلز 60 ثانية): شاشات حقيقية من وزن بالجوال والكمبيوتر.
// MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts، وسيرفر لـ www على 8790، بعدين:
// npx tsx marketing/video/ad-menus/capture.mts <outdir>
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
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 30000 });
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
  await p.getByRole('button', { name: 'حفظته، تابع' }).click({ timeout: 60000 });
  await p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important} *{animation-duration:0s!important;transition-duration:0s!important}' });
  await p.waitForTimeout(900);
}
const shot = async (p: Page, n: string, wait = 900) => {
  await p.waitForTimeout(wait);
  await p.mouse.move(0, 0);
  await p.screenshot({ path: `${OUT}/${n}.png` });
};
const box = async (p: Page, sel: string, n: string) => {
  const r = await p.locator(sel).first().boundingBox();
  boxes[n] = r;
};
const boxes: Record<string, unknown> = {};

// ── الجوال (390×844 ×3) ──
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await setup(p, 'سوبرماركت الخير');
  await p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
  await shot(p, 'm-home');
  await box(p, '.content button:has-text("فاتورة مبيع")', 'home-sale');
  await box(p, '.mobile-bar .menu', 'menu-btn');
  await box(p, '.bottom-nav button:has-text("الديون")', 'nav-debts');
  await box(p, '.mobile-bar button[aria-label="المساعد"]', 'ai-btn');
  // فاتورة مبيع: فاضية، بعدين بمواد
  await p.locator('.content button', { hasText: 'فاتورة مبيع' }).first().click();
  await shot(p, 'm-sale-empty');
  for (const q of ['رز', 'سكر', 'شاي']) {
    await p.locator('.lines .picker input, table.lines .picker input').last().click();
    await p.keyboard.type(q);
    await p.waitForTimeout(350);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(350);
  }
  await p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
  await shot(p, 'm-sale-filled');
  await p.getByRole('button', { name: /حفظ الفاتورة/ }).first().click();
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
  await shot(p, 'm-invoice');
  // القائمة الجانبية
  await p.locator('.mobile-bar .menu').click();
  await shot(p, 'm-menu', 600);
  await box(p, '.sidebar nav button:has-text("المواد")', 'menu-items');
  await p.locator('.sidebar nav button', { hasText: 'المواد' }).first().click();
  await p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
  await shot(p, 'm-items');
  // الديون
  await p.locator('.bottom-nav button', { hasText: 'الديون' }).click();
  await p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
  await shot(p, 'm-debts');
  // التقارير
  await p.locator('.mobile-bar .menu').click();
  await p.waitForTimeout(400);
  await p.locator('.sidebar nav button', { hasText: 'التقارير' }).first().click();
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
  await shot(p, 'm-reports');
  // المساعد
  await p.locator('.bottom-nav button', { hasText: 'الرئيسية' }).click();
  await p.waitForTimeout(500);
  await p.locator('.mobile-bar button[aria-label="المساعد"]').click();
  await shot(p, 'm-ai-empty', 600);
  await p.locator('.assistant-input input').fill('شقد ربحت هالشهر؟');
  await p.locator('.assistant-input input').press('Enter');
  await p.waitForTimeout(400);
  await p.locator('.assistant-input input').fill('كيف بسجل مصروف كهربا؟');
  await p.locator('.assistant-input input').press('Enter');
  await shot(p, 'm-ai-answer', 700);
  await ctx.close();
}
// ── الكمبيوتر (1440×900 ×2) ──
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await setup(p, 'سوبرماركت الخير');
  await shot(p, 'd-dashboard');
  await p.locator('.sidebar nav button', { hasText: 'نقطة البيع' }).first().click();
  for (const i of [0, 2, 3, 5]) await p.locator('.pos-item').nth(i).click();
  await shot(p, 'd-pos');
  await ctx.close();
}
fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
await b.close();
console.log('ok');
