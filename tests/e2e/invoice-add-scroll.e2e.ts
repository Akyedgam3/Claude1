import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';

// شكوى زبون (لابتوب شاشته صغيرة): كل ما يضيف مادة خانة «ابحث عن مادة» بتنزل لتحت وبيضطر يعمل سكرول.
// هلق بعد كل مادة الخانة الفاضية بتضل باينة (مع مطرح للاقتراحات) بدون سكرول بالإيد.
test('the empty "add item" row stays on screen while adding item after item', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل السرعة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    for (let i = 0; i < 14; i++) await call('saveItem', { id: 'p' + i, code: String(100 + i), name: `برغي رقم ${100 + i}`, kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'SYP' });
    await page.setViewportSize({ width: 1280, height: 620 });
    await nav(page, 'فاتورة مبيع');
    const rows = page.locator('table.lines tbody tr');
    const inView = async () =>
      page.evaluate(() => {
        const all = document.querySelectorAll<HTMLElement>('table.lines tbody tr');
        const r = all[all.length - 1]!.querySelector('.with-button input')!.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight * 0.75;
      });
    for (let i = 0; i < 10; i++) {
      // بالكيبورد: اكتب، Enter، الكمية، Enter ← المؤشر بخانة المادة الجاية
      const input = rows.last().locator('.with-button input');
      await expect(input).toBeFocused({ timeout: 3000 }).catch(() => input.click());
      await page.keyboard.type(String(100 + i));
      await page.locator('.picker-list li').first().waitFor();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
      expect(await inView(), `after choosing item ${i + 1} the next empty row is visible`).toBe(true);
      await page.keyboard.type('2');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
      expect(await inView(), `after item ${i + 1} the add box is visible`).toBe(true);
    }
    await expect(rows).toHaveCount(11);
  } finally {
    await close();
  }
});
