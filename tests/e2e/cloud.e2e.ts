import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { signFeed } from '../../src/license/license';
import { activate, createCompany, launch, nav } from './helpers';

// الاتصال عن بعد: خدمة إضافية. بدون تفعيلها بالترخيص بتظهر رسالة بس؛ ومعها الكمبيوتر بيصير جهاز رئيسي.
// الجزء الثاني بيحتاج محاكي Firestore: FIRESTORE_EMULATOR=127.0.0.1:8085
const devKey = fs.readFileSync(path.resolve('dev-keys/license-private.dev.pem'), 'utf8');
const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('cloud: optional add-on hidden behind the license', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل بلا سحابة', activity: 'سوبرماركت' });
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الاتصال عن بعد' }).click();
    await expect(page.getByText('هذه الخدمة غير مفعّلة في ترخيصك')).toBeVisible();
    await expect(page.locator('.cloud-code')).toHaveCount(0);
    await shot(page, '80-cloud-not-enabled');
  } finally {
    await close();
  }
});

const EMU = process.env['FIRESTORE_EMULATOR'];
test('cloud: desktop hosts a remote phone', async () => {
  test.skip(!EMU, 'needs the Firestore emulator');
  const feed = { v: 1 as const, issuedAt: new Date().toISOString(), entries: { 'lic-cloud': { status: 'active' as const, cloud: true } } };
  const server = http.createServer((_req, res) => res.end(signFeed(feed, devKey)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const { page, close } = await launch({ feedUrl: `http://127.0.0.1:${port}/feed.txt` });
  await page.evaluate((e) => localStorage.setItem('wazn.cloudEmulator', e), EMU!);
  try {
    await activate(page, { id: 'lic-cloud' });
    await createCompany(page, { name: 'محل السحابة', activity: 'سوبرماركت' });
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الاتصال عن بعد' }).click();
    await page.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }).locator('input').check();
    const code = (await page.locator('.cloud-code .big-code').innerText()).replace(/\s+/g, '-');
    await shot(page, '81-cloud-host');

    // جوال بعيد (هون من الاختبار نفسه) بيدخل وبيضيف مادة
    const T = await import('../../src/cloud/firestore');
    const { CloudClient } = await import('../../src/cloud/client');
    const { cloudRoom } = await import('../../src/cloud/code');
    const [h, p] = EMU!.split(':');
    T.useFirestoreEmulator(h!, Number(p));
    const c = new CloudClient(new T.FirestoreTransport(), await cloudRoom(code), { username: 'admin', password: 'secret123', deviceId: 'phone', deviceName: 'جوال' });
    const r = await c.login();
    expect(r.companyName).toBe('محل السحابة');
    await c.call('saveItem', [{ id: 'remote-1', code: 'R1', name: 'مادة من الجوال', kind: 'stock', unit: 'قطعة', price: 2500, priceCurrency: 'SYP' }]);
    await nav(page, 'المواد');
    await expect(page.getByText('مادة من الجوال')).toBeVisible();
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الاتصال عن بعد' }).click();
    await expect(page.locator('.kv', { hasText: 'الأجهزة المتصلة' })).toContainText('جوال');
    await c.close();
  } finally {
    await close();
    server.close();
  }
});
