import { expect, test } from '@playwright/test';
import { activate, launch } from './helpers';

// اختيار النشاط: البحث بكلمات الناس، الأقسام، ولوحة «شو بيجهّزلك وزن»
test('activity picker: search, groups and the preview panel', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.act-search input').fill('فروج');
    await expect(page.locator('.act-card')).toHaveCount(1);
    await page.locator('.act-card').first().click();
    await expect(page.locator('.act-preview h4')).toContainText('فروج');
    await expect(page.locator('.act-preview')).toContainText('شو بيجهّزلك وزن');
    await page.locator('.act-search input').fill('');
    await page.locator('.act-groups button', { hasText: 'أغذية ومطاعم' }).click();
    await expect(page.locator('.act-card', { hasText: 'مطعم' })).toBeVisible();
    await expect(page.locator('.act-card', { hasText: 'صيدلية' })).toHaveCount(0);
    await page.locator('.act-search input').fill('لابتوب');
    await expect(page.locator('.act-card').first()).toContainText('موبايلات');
    await page.locator('.act-search input').fill('');
    await page.locator('.act-groups button', { hasText: 'الكل' }).click();
    expect(await page.locator('.act-card').count()).toBeGreaterThan(50);
    if (process.env.SHOT) await page.locator('.act-picker').screenshot({ path: process.env.SHOT });
    // نشاط جديد (كافيه) مع بيانات تجريبية
    await page.locator('.act-search input').fill('اركيله');
    await page.locator('.act-card').first().click();
    await expect(page.locator('.act-preview h4')).toContainText('كافيه');
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('كافيه الشام');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'اسم الدخول' }).locator('input').fill('admin');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();
    await expect(page.locator('.sidebar')).toBeVisible();
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    expect(st.info.activity).toBe('cafe');
    expect(Object.keys(st.items).length).toBeGreaterThan(0);
  } finally {
    await close();
  }
});
