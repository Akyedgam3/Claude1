import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// بدون حساب Google حقيقي: منتأكد إنو الزر بيفتح رابط الدخول الصح، وإنو الرجعة على المنفذ المحلي بتنفهم.
test('Google Drive: ربط الحساب من إعدادات النسخ واستعادة من شاشة البداية', async () => {
  process.env.WAZN_GDRIVE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  const { app, page, close } = await launch();
  try {
    await app.evaluate(({ shell }) => {
      (globalThis as { opened?: string[] }).opened = [];
      shell.openExternal = async (u: string) => {
        (globalThis as unknown as { opened: string[] }).opened.push(u);
      };
    });
    await activate(page);
    // شاشة البداية فيها «استعادة من Google Drive» لما الميزة جاهزة
    await page.getByRole('button', { name: 'فتح شركة', exact: true }).click();
    await expect(page.getByRole('button', { name: 'استعادة من Google Drive' })).toBeVisible();
    await page.getByRole('button', { name: 'شركة جديدة', exact: true }).click();
    await createCompany(page, { name: 'سوبرماركت الدرايف', activity: 'سوبرماركت' });
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'النسخ الاحتياطي', exact: true }).click();
    await expect(page.getByText('النسخ على Google Drive')).toBeVisible();
    await page.getByRole('button', { name: 'ربط حساب Google Drive' }).click();
    await expect(page.getByRole('button', { name: /كمّل تسجيل الدخول/ })).toBeVisible();
    const url = await expect
      .poll(async () => (await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))[0] ?? '')
      .toContain('accounts.google.com')
      .then(async () => (await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))[0]!);
    const u = new URL(url);
    expect(u.searchParams.get('client_id')).toBe('test-client.apps.googleusercontent.com');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    const redirect = u.searchParams.get('redirect_uri')!;
    expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // الزبون رفض بصفحة Google ← البرنامج بيرجع طبيعي وبيقول السبب
    const res = await fetch(`${redirect}/?error=access_denied&state=${u.searchParams.get('state')}`);
    expect(await res.text()).toContain('ما تم الربط');
    await toast(page, 'ما وافقت على الربط');
    await expect(page.getByRole('button', { name: 'ربط حساب Google Drive' })).toBeEnabled();
  } finally {
    delete process.env.WAZN_GDRIVE_CLIENT_ID;
    await close();
  }
});
