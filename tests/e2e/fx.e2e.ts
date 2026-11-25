import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// صرافة: نشرة أسعار، تصريف 100$ بحساب تلقائي، إيصال، وحوالة صادرة لمكتب جديد بتنسلّم
test('exchange desk and remittances', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'صرافة الأمانة', activity: 'صرافة وحوالات' });
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;

    await nav(page, 'الصرافة');
    await page.getByRole('button', { name: 'نشرة الأسعار' }).click();
    const m = page.locator('.modal');
    const usd = m.locator('tr', { hasText: 'دولار' });
    await usd.locator('input[type=checkbox]').check();
    await usd.locator('input.num-input').nth(0).fill('130');
    await usd.locator('input.num-input').nth(1).fill('132');
    await m.getByRole('button', { name: 'حفظ النشرة' }).click();
    await toast(page, 'انحفظت النشرة');
    await expect(page.locator('.fx-rate-card').first()).toContainText('130');

    // الزبون بيعطي 100$ ← بياخد 13,000 ل.س
    await page.locator('.fx-side.give input').fill('100');
    await expect(page.locator('.fx-side.take input')).toHaveValue(/13[,٬]?000/);
    await page.locator('.fx-meta .field', { hasText: 'الزبون' }).first().locator('input').fill('أبو محمد');
    await page.getByRole('button', { name: 'تنفيذ' }).click();
    await toast(page, 'تمت العملية رقم 1');
    await expect(page.locator('.modal .fx-receipt')).toContainText('أبو محمد');
    await page.locator('.modal').getByRole('button', { name: 'إغلاق' }).or(page.locator('.modal .modal-close')).first().click().catch(() => page.keyboard.press('Escape'));
    let s = await st();
    const deal = Object.values(s.fxDeals as Record<string, any>)[0];
    expect(deal).toMatchObject({ side: 'buy', give: { currency: 'USD', amount: 10000 }, take: { currency: 'SYP' } });
    expect(deal.profit).toBeGreaterThan(0);
    await expect(page.locator('table.fx-deals tbody tr')).toHaveCount(1);

    // حوالة صادرة
    await nav(page, 'الحوالات');
    await page.getByRole('button', { name: 'حوالة صادرة' }).click();
    const f = page.locator('.modal');
    await f.locator('.field', { hasText: 'اسم مكتب جديد' }).locator('input').fill('مكتب الهرم - حلب');
    await f.locator('.field', { hasText: /^المرسل/ }).locator('input').fill('أحمد');
    await f.locator('.field', { hasText: /^المستلم/ }).first().locator('input').fill('خالد');
    await f.locator('.field', { hasText: 'رقم المستلم' }).locator('input').fill('0944000000');
    await f.locator('.field', { hasText: /^المبلغ/ }).locator('input').fill('10000');
    await f.locator('.field', { hasText: 'عمولتنا' }).locator('input').fill('100');
    await expect(f.locator('.fx-total')).toContainText('10,100');
    await f.getByRole('button', { name: 'حفظ الحوالة' }).click();
    await toast(page, 'انسجّلت الحوالة رقم 1');
    await page.keyboard.press('Escape');
    const row = page.locator('table.remit-table tbody tr').first();
    await expect(row).toContainText('خالد');
    await expect(row).toContainText('معلّقة');
    await row.getByRole('button', { name: 'انسلّمت' }).click();
    await page.locator('.modal').getByRole('button', { name: /تأكيد|نعم|موافق/ }).first().click();
    await toast(page, 'انسلّمت الحوالة');
    s = await st();
    const r = Object.values(s.remittances as Record<string, any>)[0];
    expect(r).toMatchObject({ direction: 'out', status: 'delivered', amount: 1000000, fee: 10000 });
    await expect(page.locator('.remit-office')).toContainText('مكتب الهرم');
  } finally {
    await close();
  }
});
