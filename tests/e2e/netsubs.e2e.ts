import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// محل إنترنت: مشترك جديد من الشاشة، بيبيّن «خلص»، والتجديد بيعمل فاتورة وبيمدّد
test('internet subscribers: add, expired, renew with invoice', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'التقني للإنترنت', activity: 'موبايلات وكمبيوتر وإلكترونيات' });
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const today = new Date().toISOString().slice(0, 10);
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

    await nav(page, 'الاشتراكات');
    await page.getByRole('button', { name: 'مشترك جديد' }).click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'اسم مشترك جديد' }).locator('input').fill('أبو أحمد - حي الجامع');
    await m.locator('.field', { hasText: 'رقمه' }).locator('input').fill('0944000000');
    await m.locator('.field', { hasText: 'الباقة' }).locator('input').fill('4 ميغا');
    await m.locator('.field', { hasText: 'السعر بالشهر' }).locator('input').fill('25000');
    await m.locator('.field', { hasText: 'مدفوع لحد' }).locator('input').fill(past);
    await m.locator('.field', { hasText: 'IP' }).locator('input').fill('10.0.0.5');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'انضاف المشترك');

    const row = page.locator('table.netsubs-table tbody tr').first();
    await expect(row).toContainText('أبو أحمد');
    await expect(row).toContainText('خلص من 5 يوم');
    await expect(row.getByRole('button', { name: 'واتساب' })).toBeVisible();

    await row.getByRole('button', { name: 'تجديد' }).click();
    await page.locator('.modal').getByRole('button', { name: 'تجديد وفاتورة' }).click();
    await toast(page, 'تجدّد لحد');
    await expect(row).toContainText(/باقي (29|30|31) يوم/);
    const s = await st();
    const sub = Object.values(s.netSubs as Record<string, any>)[0];
    expect(sub.renewals).toHaveLength(1);
    expect(sub.renewals[0].from).toBe(today);
    const inv = s.invoices.at(-1);
    expect(inv.total / 10 ** s.currencies['SYP'].decimals).toBe(25000);
    expect(inv.lines[0].description).toContain('4 ميغا');
  } finally {
    await close();
  }
});
