// لقطات إعلان «سكّر الدفتر» (16:9): البرنامج الحقيقي (Electron، 1600×1000) بسوبرماركت وصالة أفراح تجريبية.
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/ad-break/capture.mts <outdir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { launch } from '../../../tests/e2e/helpers';
import { issueLicense, signFeed, type LicenseFeed } from '../../../src/license/license';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const devKey = fs.readFileSync(path.join(ROOT, 'dev-keys/license-private.dev.pem'), 'utf8');
const OUT = path.resolve(process.argv[2]!);
fs.mkdirSync(OUT, { recursive: true });
const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-ad': { status: 'active' } } };
const feedServer = http.createServer((_q, r) => r.end(signFeed(feed, devKey)));
await new Promise<void>((r) => feedServer.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.txt`;
const style = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' }).catch(() => undefined);
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (p: Page, label: string | RegExp) => p.locator('.field', { hasText: label }).first();
const nav = (p: Page, label: string) => p.locator('.sidebar nav a, .sidebar nav button', { hasText: label }).first();
const snap = async (p: Page, name: string, wait = 900) => { await style(p); await p.waitForTimeout(wait); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('snap', name); };

async function company(p: Page, activity: string, name: string) {
  await btn(p, 'شركة جديدة').click();
  await p.locator('.activity', { hasText: activity }).first().click();
  await field(p, 'اسم الشركة').locator('input').fill(name);
  await field(p, 'الهاتف').locator('input').fill('0944 123 456');
  await field(p, 'اسمك').locator('input').fill('أبو محمد');
  await field(p, 'كلمة السر (6').locator('input').fill('secret123');
  await field(p, 'تأكيد كلمة السر').locator('input').fill('secret123');
  await p.locator('.demo-check input').check();
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').click({ timeout: 30000 });
  await p.locator('.sidebar').waitFor();
}

const A = await launch({ feedUrl });
const p = A.page;
try {
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  const machineId = (await p.locator('.big-code').first().innerText()).trim();
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-ad', customer: 'ماركت النور', machineId, plan: 'annual' }, devKey));
  await btn(p, 'تفعيل', true).click();
  // شاشة اختيار النشاط: كل المصالح
  await btn(p, 'شركة جديدة').click();
  await p.locator('.activity').first().waitFor();
  await snap(p, 'activities');
  await btn(p, /رجوع|إلغاء/).click().catch(() => p.keyboard.press('Escape'));
  await p.waitForTimeout(500);
  await company(p, 'سوبرماركت', 'ماركت النور');
  await snap(p, 'dash', 1500);
  await nav(p, 'نقطة البيع').click();
  await p.locator('.pos-item').first().waitFor();
  for (const i of [0, 2, 3, 5, 2]) await p.locator('.pos-item').nth(i).click();
  await snap(p, 'pos');
  await nav(p, 'الديون').click();
  await snap(p, 'debts');
  await nav(p, 'التقارير').click().catch(() => undefined);
  await snap(p, 'reports');
  await nav(p, 'سجل الفواتير').click();
  await p.locator('table.table tbody tr').first().click();
  await p.locator('.paper-preview').waitFor();
  await snap(p, 'invoice');
} finally {
  await A.close();
}

// صالة أفراح: تقويم الحجوزات
const B = await launch({ feedUrl });
const q = B.page;
try {
  await q.setViewportSize({ width: 1600, height: 1000 });
  await q.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  const machineId = (await q.locator('.big-code').first().innerText()).trim();
  await q.locator('textarea').first().fill(issueLicense({ id: 'lic-ad', customer: 'صالة الياسمين', machineId, plan: 'annual' }, devKey));
  await btn(q, 'تفعيل', true).click();
  await company(q, 'صالة أفراح', 'صالة الياسمين');
  await nav(q, 'حجوزات الصالة').click();
  await q.getByTitle('الشهر اللي بعد').click();
  await snap(q, 'halls', 1200);
} finally {
  await B.close();
  feedServer.close();
}
