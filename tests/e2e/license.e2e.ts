import { expect, test } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signFeed, type LicenseFeed } from '../../src/license/license';
import { activate, createCompany, launch, nav } from './helpers';

const devKey = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dev-keys/license-private.dev.pem'), 'utf8');

test('the app stays locked without a license and can be suspended remotely', async () => {
  // خادم محلي يمثل "قائمة حالة التراخيص" المنشورة
  let feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: {} };
  const server = http.createServer((_req, res) => res.end(signFeed(feed, devKey)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;

  const { page, close } = await launch({ feedUrl: `http://127.0.0.1:${port}/feed.txt` });
  try {
    // لا يوجد ترخيص: شاشة القفل فقط
    await expect(page.getByText('تفعيل البرنامج')).toBeVisible();
    await expect(page.getByText('شركة جديدة')).toHaveCount(0);
    await page.locator('textarea').fill('MZN2-fake.key');
    await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await expect(page.locator('.toast.error')).toContainText('غير صالح');

    await activate(page, { id: 'E2E-LICENSE' });
    await createCompany(page, { name: 'محل الترخيص', activity: 'تجارة عامة' });

    // البائع يوقف الترخيص وينشر القائمة
    feed = { v: 1, issuedAt: new Date(Date.now() + 1000).toISOString(), entries: { 'E2E-LICENSE': { status: 'suspended', message: 'لم يتم تسديد الاشتراك' } } };
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الترخيص' }).click();
    await page.getByRole('button', { name: 'تحقق الآن' }).click();

    // البرنامج يغلق الشركة فوراً ويعرض سبب الإيقاف
    await expect(page.getByText('البرنامج متوقف')).toBeVisible();
    await expect(page.locator('.banner.bad')).toContainText('لم يتم تسديد الاشتراك');
    await expect(page.locator('.sidebar')).toHaveCount(0);

    // إعادة التفعيل من البائع
    feed = { v: 1, issuedAt: new Date(Date.now() + 2000).toISOString(), entries: { 'E2E-LICENSE': { status: 'active' } } };
    await page.getByRole('button', { name: 'إعادة التحقق عبر الإنترنت' }).click();
    await expect(page.getByText('فتح شركة')).toBeVisible();
  } finally {
    await close();
    server.close();
  }
});

test('a device-count change in the feed reaches the screen without restarting', async () => {
  let feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: {} };
  const server = http.createServer((_req, res) => res.end(signFeed(feed, devKey)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const { page, close } = await launch({ feedUrl: `http://127.0.0.1:${port}/feed.txt` });
  try {
    await activate(page, { id: 'E2E-DEVICES' });
    await createCompany(page, { name: 'محل الأجهزة', activity: 'تجارة عامة' });
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الترخيص' }).click();
    const devices = page.locator('.kv', { hasText: 'عدد الأجهزة' });
    await expect(devices).toContainText('1');

    // البائع بيرفع العدد لـ 5 وبينشر؛ البرنامج بيقرا القائمة بالخلفية (بدون زر «تحقق الآن» وبدون إعادة تحميل)
    feed = { v: 1, issuedAt: new Date(Date.now() + 1000).toISOString(), entries: { 'E2E-DEVICES': { status: 'active', devices: 5, cloud: true } } };
    await page.evaluate(() => window.mizan.invoke('license:refresh'));
    await expect(devices.locator('strong').filter({ hasText: /^5$/ })).toBeVisible();
    await expect(page.locator('.kv', { hasText: 'آخر قائمة وصلت' })).not.toContainText('لم تصل بعد');
  } finally {
    await close();
    server.close();
  }
});
