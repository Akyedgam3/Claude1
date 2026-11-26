// زر الرجوع بالجوال: بيرجع خطوة وحدة (بيسكّر النافذة، بعدين الشاشة اللي قبل)، مش للرئيسية دغري.
// npx tsx tests/mobile/back-button.mts (www على 8790)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense } from '../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem('mizan.tour.off', '1'));
await p.goto('http://127.0.0.1:8790/index.html');
await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
const machineId = (await p.locator('.big-code').first().innerText()).trim();
await p.locator('textarea').first().fill(issueLicense({ customer: 'تجربة', machineId, plan: 'annual' }, devKey));
await p.getByRole('button', { name: 'تفعيل', exact: true }).click();
await p.getByText('شركة جديدة').first().click();
await p.locator('.act-choose').click();
await p.locator('.act-search input').fill('سوبرماركت');
await p.locator('.act-card').first().click();
await p.locator('.act-modal-foot .primary').click();
await p.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('ماركت');
await p.getByRole('button', { name: 'التالي' }).click();
await p.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
await p.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
await p.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
await p.getByRole('button', { name: 'إنشاء الشركة' }).click();
await p.getByRole('button', { name: 'حفظته، تابع' }).click();
await p.waitForTimeout(800);
const go = async (label: string) => {
  await p.locator('.mobile-bar .menu').click();
  await p.locator('.sidebar nav button', { hasText: label }).first().click();
  await p.waitForTimeout(400);
};
const title = async () => (await p.locator('.mobile-bar').innerText()).trim();
const fail = (m: string) => { console.log('FAIL', m); process.exitCode = 1; };
const back = async () => { await p.goBack({ waitUntil: 'commit' }).catch(() => 0); await p.waitForTimeout(500); };
await go('المواد');
await go('الديون');
await go('الصندوق');
if (!(await title()).includes('الصندوق')) fail('ما فتح الصندوق');
await back();
if (!(await title()).includes('الديون')) fail('رجوع من الصندوق لازم يرجع للديون: ' + (await title()));
await back();
if (!(await title()).includes('المواد')) fail('رجوع تاني لازم يرجع للمواد: ' + (await title()));
// نافذة مفتوحة: الرجوع بيسكّرها بس
await p.locator('.page-header button.primary').first().click();
await p.locator('.modal').waitFor();
await back();
if (await p.locator('.modal').count()) fail('الرجوع ما سكّر النافذة');
if (!(await title()).includes('المواد')) fail('سكّر النافذة بس لازم يضل بالمواد');
// القائمة الجانبية مفتوحة: بتتسكّر
await p.locator('.mobile-bar .menu').click();
await back();
if (await p.locator('.nav-backdrop').count()) fail('الرجوع ما سكّر القائمة');
await back();
if (!(await title()).includes('الرئيسية')) fail('آخر رجوع لازم يوصل للرئيسية: ' + (await title()));
// الرئيسية: رجوع بيقول «كمان مرة للخروج» وما بيطلع
await back();
if (!(await p.locator('.toast').innerText().catch(() => '')).includes('للخروج')) fail('ما طلعت رسالة الخروج');
if (!p.url().includes('127.0.0.1:8790')) fail('طلع من التطبيق من أول رجوع');
console.log(process.exitCode ? 'back button FAILED' : 'back button OK');
await b.close();
