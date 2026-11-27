import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

// الكمبيوتر: سهم «رجوع» بكل شاشة، وAlt+← وزر الماوس الجانبي بيرجعوا للشاشة اللي قبل (خطوة وحدة)
test('desktop back arrow and Alt+Left go back one screen', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const title = () => page.locator('.page-header h2').first();
    await nav(page, 'المواد');
    await nav(page, 'الديون');
    await nav(page, 'الصندوق');
    await expect(title()).toHaveText('الصندوق');
    await page.locator('.page-header .back-arrow').click();
    await expect(title()).toHaveText(/الديون/);
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(title()).toHaveText(/المواد|الأصناف/);
  } finally {
    await close();
  }
});
