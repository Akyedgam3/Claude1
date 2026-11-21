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
  } finally {
    await close();
  }
});
