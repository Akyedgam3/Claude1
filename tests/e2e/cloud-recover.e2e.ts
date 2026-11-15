import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { signFeed } from '../../src/license/license';
import { activate, createCompany, launch, nav, toast } from './helpers';

// ضاع الجهاز الرئيسي (انحذف التطبيق): من الكمبيوتر البعيد منرجّع بيانات المحل من آخر نسخة بالسحابة بملف .wazn،
// والملف بينفتح على جهاز مرخّص بكلمة السر الجديدة. بيحتاج محاكي Firestore: FIRESTORE_EMULATOR=127.0.0.1:8085
const devKey = fs.readFileSync(path.resolve('dev-keys/license-private.dev.pem'), 'utf8');
const EMU = process.env['FIRESTORE_EMULATOR'];

test('cloud: main device lost, the remote computer recovers the shop data as a backup file', async () => {
  test.skip(!EMU, 'needs the Firestore emulator');
  test.setTimeout(240_000);
  const feed = { v: 1 as const, issuedAt: new Date().toISOString(), entries: { 'lic-rec': { status: 'active' as const, cloud: true } } };
  const server = http.createServer((_req, res) => res.end(signFeed(feed, devKey)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const feedUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/feed.txt`;
  process.env['WAZN_CLOUD_EMULATOR'] = EMU!;
  const shop = await launch({ feedUrl });
  const home = await launch();
  try {
    const sp = shop.page;
    await sp.evaluate((e) => localStorage.setItem('wazn.cloudEmulator', e), EMU!);
    await activate(sp, { id: 'lic-rec' });
    await createCompany(sp, { name: 'محل ضايع', activity: 'سوبرماركت' });
    await nav(sp, 'العملاء والموردون');
    await sp.getByRole('button', { name: 'إضافة', exact: true }).click();
    await sp.locator('.modal .field', { hasText: 'الاسم' }).locator('input').fill('زبون مهم');
    await sp.locator('.modal').getByRole('button', { name: 'حفظ' }).click();
    await toast(sp, 'تم الحفظ');
    await nav(sp, 'الإعدادات');
    await sp.getByRole('button', { name: 'الاتصال عن بعد' }).click();
    await sp.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' }).locator('input').check();
    const code = (await sp.locator('.cloud-code .big-code').innerText()).replace(/\s+/g, '-');
    await sp.waitForTimeout(8000); // آخر نسخة بتنرفع للسحابة
    await shop.close(); // راح الجهاز الرئيسي

    const hp = home.page;
    await hp.getByRole('button', { name: 'اتصال عن بعد' }).click();
    await hp.locator('.field', { hasText: 'رمز الاتصال' }).locator('input').fill(code);
    await hp.locator('.field', { hasText: 'اسم المستخدم' }).locator('input').fill('admin');
    await hp.locator('.field', { hasText: 'كلمة السر' }).locator('input').first().fill('secret123');
    await hp.getByRole('button', { name: 'اتصال', exact: true }).click();
    const box = hp.locator('.cloud-recover');
    await expect(box).toBeVisible({ timeout: 90_000 });
    await box.locator('.field', { hasText: 'كلمة سر جديدة' }).locator('input').fill('newpass1');
    await box.locator('.field', { hasText: 'تأكيد' }).locator('input').fill('newpass1');
    await box.getByRole('button', { name: 'استرجع بيانات المحل بملف' }).click();
    await toast(hp, 'انحفظت بيانات المحل');
    const file = fs.readdirSync(home.home).find((f) => f.endsWith('.wazn'));
    expect(file).toBeTruthy();
    const data = JSON.parse(fs.readFileSync(path.join(home.home, file!), 'utf8'));
    expect(data.app).toBe('wazn-backup');
    expect(JSON.stringify(data)).not.toContain('زبون مهم'); // مشفّر
  } finally {
    await home.close().catch(() => undefined);
    await shop.close().catch(() => undefined);
    server.close();
  }
});
