import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

// الأقسام الجديدة اللي بتساعد الزبون: التنبيهات، المصاريف الثابتة، حاسبة التسعير
test('alerts, recurring expenses and the pricing calculator', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'ماركت التنبيهات', activity: 'سوبرماركت', demo: true });

    // التنبيهات: البيانات التجريبية فيها مواد تحت الحد وحليب قرب تنتهي صلاحيته
    await expect(page.locator('.alert-strip')).toBeVisible();
    await expect(page.locator('.sidebar nav button[data-nav="alerts"] .nav-count')).toBeVisible();
    await page.locator('.alert-strip').click();
    await expect(page.locator('.page.alerts h2')).toHaveText('التنبيهات');
    await expect(page.locator('[data-alert="expiring"]')).toContainText('حليب');
    await page.locator('[data-alert="expiring"] button').click();
    await expect(page.locator('.page h2').first()).toContainText('الجرد');

    // المصاريف الثابتة: إيجار يوم 1 ← فات موعده (إلا إذا اليوم أول الشهر) ← دفعتها ← مدفوع وبينزل بالسندات
    await nav(page, 'المصاريف الثابتة');
    await page.getByRole('button', { name: /مصروف ثابت/ }).click();
    const f = page.locator('.modal');
    await f.locator('.field', { hasText: 'الاسم' }).locator('input').fill('إيجار المحل');
    await f.locator('.field', { hasText: 'المبلغ كل شهر' }).locator('input').fill('500000');
    await f.locator('.field', { hasText: 'يوم الدفع' }).locator('select').selectOption('1');
    await f.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');
    const card = page.locator('.recurring-card', { hasText: 'إيجار المحل' });
    await expect(card).toContainText('500,000');
    await card.getByRole('button', { name: 'دفعتها' }).click();
    await page.locator('.modal').getByRole('button', { name: 'تسجيل الدفع' }).click();
    await toast(page, 'انسجّل إيجار المحل');
    await expect(card.locator('.tag')).toContainText('مدفوع');
    await expect(card.getByRole('button', { name: 'دفعتها' })).toHaveCount(0);
    await nav(page, 'سندات القبض والدفع');
    await expect(page.locator('.page')).toContainText('إيجار المحل عن شهر');

    // حاسبة التسعير: كرتونة 12 قطعة بـ 12,000 + 10% مصاريف، ربح 25% ← القطعة 1,375
    await nav(page, 'حاسبة التسعير');
    const calc = page.locator('.pricing');
    await calc.locator('label.check', { hasText: 'السعر لكرتونة' }).locator('input').check();
    await calc.locator('.field', { hasText: 'سعر شراء الكرتونة' }).locator('input').fill('12000');
    await calc.locator('.field', { hasText: 'كم قطعة' }).locator('input').fill('12');
    await calc.locator('.field', { hasText: 'مصاريف إضافية' }).locator('input').fill('10');
    await expect(calc.locator('.pricing-big strong')).toContainText('1,375');
    await expect(calc.locator('.pricing-facts')).toContainText('20.0%'); // الهامش = 275 / 1375
    // سعر بيع معروف ← الربح
    await calc.getByRole('button', { name: 'سعر بيع بعرفه' }).click();
    await calc.locator('.field', { hasText: 'سعر البيع' }).locator('input').fill('1500');
    await expect(calc.locator('.pricing-facts')).toContainText('400');
    // اعتماد السعر لمادة
    await calc.locator('label.check', { hasText: 'السعر لكرتونة' }).locator('input').uncheck();
    await pick(page, calc.locator('.field', { hasText: 'مادة' }).locator('input'), 'بندورة');
    await calc.locator('.field', { hasText: 'سعر شراء القطعة' }).locator('input').fill('600');
    await calc.locator('.field', { hasText: 'مصاريف إضافية' }).locator('input').fill('');
    await calc.getByRole('button', { name: 'بالمية من الكلفة' }).click();
    await calc.locator('.field', { hasText: 'النسبة' }).locator('input').fill('50');
    await calc.getByRole('button', { name: /اعتمد السعر للمادة/ }).click();
    await toast(page, /صار سعر «بندورة»/);
    const items = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state.items as Record<string, { name: string; price: number }>;
    expect(Object.values(items).find((i) => i.name === 'بندورة')!.price).toBe(90000);
  } finally {
    await close();
  }
});
