import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('quotes, invoice designs, daily closing report and dark mode', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل النور للأدوات', activity: 'تجارة عامة' });
    const m = page.locator('.modal');

    // مادة ورصيد
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveItem', { id: 'drill', code: '0001', name: 'مثقب كهربائي', kind: 'stock', unit: 'قطعة', price: 450000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'drill', qty: 10, unitCost: 300000 }] });

    // تصميم الفاتورة: كلاسيكي بلون أزرق مع شروط وتوقيع
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الطباعة والفواتير' }).click();
    await page.locator('.template-card', { hasText: 'عصري' }).click();
    await page.locator('.swatch').nth(1).click();
    await page.getByText('خانات التوقيع').click();
    await page.locator('.designer-controls textarea').fill('البضاعة المباعة لا ترد بعد 7 أيام');
    await shot(page, '30-invoice-designer');
    await page.getByRole('button', { name: 'حفظ التصميم' }).click();
    await toast(page, 'تم حفظ تصميم الفاتورة');

    // عرض سعر ثم تحويله لفاتورة
    await nav(page, 'عروض الأسعار');
    await page.getByRole('button', { name: 'عرض سعر جديد' }).first().click();
    await page.locator('.field', { hasText: 'أو اسم الزبون' }).locator('input').fill('شركة البناء الحديث');
    await pick(page, page.locator('table.lines .picker input'), 'مثقب');
    await page.locator('table.lines tbody tr').first().locator('input.num-input').first().fill('3');
    await page.locator('.page-header').getByRole('button', { name: 'حفظ' }).click();
    await toast(page, /تم حفظ عرض السعر رقم 1/);
    await expect(page.locator('.totals')).toContainText('13,500.00');
    await shot(page, '31-quote');
    await page.getByRole('button', { name: 'تحويل إلى فاتورة' }).click();
    await m.getByRole('button', { name: 'إصدار الفاتورة' }).click();
    await toast(page, /تم إنشاء فاتورة رقم 1/);
    await expect(page.locator('.invoice-doc')).toContainText('مثقب كهربائي');
    await expect(page.locator('.invoice-doc .doc-stamp')).toHaveText('مدفوعة');
    await expect(page.locator('.invoice-doc .doc-qr')).toBeVisible();
    await expect(page.locator('.invoice-doc')).toContainText('لا ترد بعد 7 أيام');
    await shot(page, '32-invoice-modern');

    // إغلاق اليوم
    await nav(page, 'التقارير');
    await page.getByRole('button', { name: 'إغلاق اليوم' }).click();
    await expect(page.locator('.daily-card')).toContainText('13,500.00');
    await shot(page, '33-daily-closing');

    // الوضع الداكن
    await page.getByRole('button', { name: 'الوضع الداكن' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await nav(page, 'الرئيسية');
    await shot(page, '34-dark-dashboard');
    await nav(page, 'عروض الأسعار');
    await shot(page, '35-dark-quotes');
  } finally {
    await close();
  }
});
