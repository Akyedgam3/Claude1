import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, licenseFor, nav, toast } from './helpers';

test('a second device connects to the main device over the local network', async () => {
  const host = await launch();
  const client = await launch();
  try {
    // الجهاز الرئيسي: ترخيص لجهازين
    const hp = host.page;
    await expect(hp.getByText('بصمة الجهاز', { exact: true })).toBeVisible();
    const machineId = (await hp.locator('.big-code').first().innerText()).trim();
    await hp.locator('textarea').fill(licenseFor(machineId, 'annual', { devices: 2 }));
    await hp.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await createCompany(hp, { name: 'محل الشبكة', activity: 'تجارة عامة' });

    await nav(hp, 'الإعدادات');
    await hp.getByRole('button', { name: 'الشبكة المحلية' }).click();
    await hp.getByLabel(/تفعيل وضع الخادم/).check();
    await toast(hp, 'وضع الخادم يعمل');
    const code = (await hp.locator('.lan-info .big-code').innerText()).trim();
    const port = (await hp.locator('.lan-info strong').nth(1).innerText()).trim();

    // الجهاز الفرعي بدون ترخيص خاص: يتصل بالجهاز الرئيسي
    const cp = client.page;
    await expect(cp.getByText('جهاز فرعي على الشبكة؟')).toBeVisible();
    await cp.getByRole('button', { name: 'الاتصال بالجهاز الرئيسي' }).click();
    await cp.locator('.field', { hasText: 'عنوان الجهاز الرئيسي' }).locator('input').fill('127.0.0.1');
    await cp.locator('.field', { hasText: 'المنفذ' }).locator('input').fill(port);
    await cp.locator('.field', { hasText: 'رمز الربط' }).locator('input').fill('WRONG-CODE');
    await cp.locator('.field', { hasText: 'اسم المستخدم' }).locator('input').fill('admin');
    await cp.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('secret123');
    await cp.getByRole('button', { name: 'اتصال' }).click();
    await expect(cp.locator('.toast.error')).toContainText('رمز الربط');
    await cp.locator('.field', { hasText: 'رمز الربط' }).locator('input').fill(code);
    await cp.getByRole('button', { name: 'اتصال' }).click();
    await expect(cp.locator('.user-chip')).toContainText('متصل بالجهاز الرئيسي');

    // عملية من الجهاز الفرعي تظهر مباشرة على الجهاز الرئيسي
    await nav(cp, 'العملاء والموردون');
    await cp.getByRole('button', { name: '+ إضافة' }).click();
    await cp.locator('.modal .field', { hasText: 'الاسم' }).locator('input').fill('زبون من الكاشير الثاني');
    await cp.locator('.modal').getByRole('button', { name: 'حفظ' }).click();
    await toast(cp, 'تم الحفظ');

    await nav(hp, 'العملاء والموردون');
    await expect(hp.locator('table')).toContainText('زبون من الكاشير الثاني');

    // والعكس: عملية من الجهاز الرئيسي تصل للفرعي
    await hp.getByRole('button', { name: '+ إضافة' }).click();
    await hp.locator('.modal .field', { hasText: 'الاسم' }).locator('input').fill('مورد من الجهاز الرئيسي');
    await hp.locator('.modal select').first().selectOption('supplier');
    await hp.locator('.modal').getByRole('button', { name: 'حفظ' }).click();
    await expect(cp.locator('table')).toContainText('مورد من الجهاز الرئيسي');

    // الجهاز الرئيسي يرى الجهاز المتصل
    await nav(hp, 'الإعدادات');
    await hp.getByRole('button', { name: 'الشبكة المحلية' }).click();
    await expect(hp.locator('.lan-info')).toContainText('المالك');
  } finally {
    await client.close();
    await host.close();
  }
});
