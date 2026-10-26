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

    // الجهاز الفرعي بدون ترخيص خاص: بيلاقي الجهاز الرئيسي بالشبكة لحالو
    const cp = client.page;
    await expect(cp.getByText('جهاز فرعي أو متصل عن بعد؟')).toBeVisible();
    await cp.getByRole('button', { name: 'على نفس الشبكة' }).click();
    await expect(cp.locator('.lan-found button', { hasText: 'محل الشبكة' }).first()).toBeVisible({ timeout: 10000 });
    await cp.locator('.lan-found button', { hasText: 'محل الشبكة' }).first().click();
    await expect(cp.locator('.field', { hasText: 'المنفذ' }).locator('input')).toHaveValue(port);
    await cp.locator('.field', { hasText: 'رمز الربط' }).locator('input').fill('WRONG-CODE');
    await cp.locator('.field', { hasText: 'اسم المستخدم' }).locator('input').fill('admin');
    await cp.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('secret123');
    await cp.getByRole('button', { name: 'اتصال', exact: true }).click();
    await expect(cp.locator('.toast.error')).toContainText('رمز الربط');
    await cp.locator('.field', { hasText: 'رمز الربط' }).locator('input').fill(code);
    await cp.getByRole('button', { name: 'اتصال', exact: true }).click();
    await expect(cp.locator('.user-chip')).toContainText('متصل بالجهاز الرئيسي');

    // عملية من الجهاز الفرعي تظهر مباشرة على الجهاز الرئيسي
    await nav(cp, 'العملاء والموردون');
    await cp.getByRole('button', { name: 'إضافة', exact: true }).click();
    await cp.locator('.modal .field', { hasText: 'الاسم' }).locator('input').fill('زبون من الكاشير الثاني');
    await cp.locator('.modal').getByRole('button', { name: 'حفظ' }).click();
    await toast(cp, 'تم الحفظ');

    await nav(hp, 'العملاء والموردون');
    await expect(hp.locator('table')).toContainText('زبون من الكاشير الثاني');

    // والعكس: عملية من الجهاز الرئيسي تصل للفرعي
    await hp.getByRole('button', { name: 'إضافة', exact: true }).click();
    await hp.locator('.modal .field', { hasText: 'الاسم' }).locator('input').fill('مورد من الجهاز الرئيسي');
    await hp.locator('.modal select').first().selectOption('supplier');
    await hp.locator('.modal').getByRole('button', { name: 'حفظ' }).click();
    await expect(cp.locator('table')).toContainText('مورد من الجهاز الرئيسي');

    // الجهاز الرئيسي يرى الجهاز المتصل
    await nav(hp, 'الإعدادات');
    await hp.getByRole('button', { name: 'الشبكة المحلية' }).click();
    await expect(hp.locator('.lan-info')).toContainText('المالك');

    // المرة الجاية: بيكفي كلمة السر
    await client.close();
    const again = await launch({ home: client.home });
    try {
      const ap = again.page;
      await ap.getByRole('button', { name: 'على نفس الشبكة' }).click();
      await expect(ap.locator('.saved-conn')).toContainText('محل الشبكة');
      await expect(ap.locator('.field', { hasText: 'رمز الربط' })).toHaveCount(0);
      await ap.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('secret123');
      await ap.getByRole('button', { name: 'اتصال', exact: true }).click();
      await expect(ap.locator('.user-chip')).toContainText('متصل بالجهاز الرئيسي');
    } finally {
      await again.close();
    }
  } finally {
    await client.close();
    await host.close();
  }
});
