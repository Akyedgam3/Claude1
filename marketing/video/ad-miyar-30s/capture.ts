// إعلان معيار: لقطات حقيقية بالاسم الجديد.
import fs from 'node:fs';
import path from 'node:path';
import { activate, launch, nav } from '/home/user/Claude1/tests/e2e/helpers';
const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/ad3/assets/shots';
type P = Awaited<ReturnType<typeof launch>>['page'];
const hide = (page: P) => page.addStyleTag({ content: '.toast{display:none!important} input,textarea{caret-color:transparent!important}' });
async function snap(page: P, name: string) { await hide(page); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('snap', name); }
async function company(page: P, act: string, name: string, shotNew?: string) {
  await activate(page);
  await page.getByRole('button', { name: 'شركة جديدة' }).click();
  await page.locator('.activity', { hasText: act }).first().click();
  await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill(name);
  await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
  await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
  await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
  if (shotNew) await snap(page, shotNew);
  await page.locator('.demo-check input').check();
  await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
  await page.getByRole('button', { name: 'حفظته، تابع' }).click();
  await page.locator('.sidebar').waitFor();
  await page.waitForTimeout(500);
}
async function run(fn: (l: Awaited<ReturnType<typeof launch>>) => Promise<void>) {
  const l = await launch();
  await l.page.setViewportSize({ width: 1600, height: 1000 });
  try { await fn(l); } catch (e) { console.log('FAIL', (e as Error).message.split('\n')[0]); await l.page.screenshot({ path: path.join(OUT, 'error.png') }); }
  await l.close();
}
(async () => {
  // مطعم
  await run(async ({ app, page }) => {
    await company(page, 'مطعم', 'مطعم الشام', 'activities');
    await snap(page, 'dash_rest');
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الإيصال وشاشة الزبون' }).click();
    await page.locator('.receipt-designer input[type=file]').setInputFiles('/home/user/Claude1/src/renderer/src/assets/logo.png');
    await page.locator('.field', { hasText: 'حجم الشعار' }).locator('select').selectOption('banner');
    await page.getByText('جدول بخطوط').click();
    await page.locator('.field', { hasText: 'نص قبل رقم التواصل' }).locator('input').fill('للتوصيات والاستفسار');
    await page.getByRole('textbox', { name: 'رقم التواصل', exact: true }).fill('0933 123 456');
    await page.locator('.field', { hasText: 'رسالة الشكر' }).locator('input').fill('نشكر لكم زيارتكم');
    await page.locator('.field', { hasText: 'رسالة الترحيب' }).locator('input').fill('أهلاً فيكم بمطعم الشام');
    await page.getByRole('button', { name: 'حفظ التصميم' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.thermal-preview').screenshot({ path: path.join(OUT, 'receipt.png') });
    console.log('snap receipt');
    await nav(page, 'الطاولات والطلبات');
    await snap(page, 'tables');
    await page.locator('.table-card', { hasText: 'طاولة 6' }).click();
    const [display] = await Promise.all([app.waitForEvent('window'), page.getByRole('button', { name: 'شاشة الزبون' }).click()]);
    await display.waitForLoadState();
    for (const n of ['شيش طاووق', 'شيش طاووق', 'فتوش', 'حمص', 'كولا']) await page.locator('.pos-item', { hasText: n }).first().click();
    await page.locator('.quick-notes button', { hasText: 'حار' }).first().click().catch(() => {});
    await snap(page, 'order');
    await page.locator('.kv input.num-input').last().fill('5000').catch(() => {});
    await display.setViewportSize({ width: 1600, height: 900 });
    await display.waitForTimeout(800);
    await display.screenshot({ path: path.join(OUT, 'customer.png') });
    console.log('snap customer');
    await page.getByRole('button', { name: 'الحساب وإغلاق الطلب' }).click();
    await page.waitForTimeout(800);
    await nav(page, 'شاشة المطبخ');
    await snap(page, 'kitchen');
    await nav(page, 'لوحة الإدارة المباشرة');
    await snap(page, 'live');
  });
  // سوبرماركت
  await run(async ({ page }) => {
    await company(page, 'سوبرماركت', 'سوبرماركت الخير');
    await snap(page, 'dash_sm');
    await nav(page, 'نقطة البيع');
    const scan = async (c: string) => { await page.locator('.scan-input').fill(c); await page.locator('.scan-input').press('Enter'); await page.waitForTimeout(250); };
    for (const c of ['6210001000017', '6210002000016', '6210003000015', '2100101007507', '6210004000014']) await scan(c);
    await page.locator('.big-input').first().fill('50000').catch(() => {});
    await snap(page, 'pos');
    await nav(page, 'التقارير');
    await page.getByRole('button', { name: 'الأرباح والخسائر' }).first().click();
    const td = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await page.locator('input[type=date]').first().fill(td);
    await page.locator('h1, .page-header h2').first().click().catch(() => {});
    await snap(page, 'income');
  });
  // موبايلات
  await run(async ({ page }) => {
    await company(page, 'موبايلات', 'موبايلات النجمة');
    await nav(page, 'سجل الأجهزة');
    const first = page.locator('table.table tbody tr', { hasText: 'iPhone 13' }).first();
    await first.click();
    await snap(page, 'imei');
    await nav(page, 'التقسيط');
    await page.locator('table.table tbody tr', { hasText: 'أبو علي' }).click();
    await snap(page, 'installments');
  });
})();
