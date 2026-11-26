import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// زبون: «عندي بصندوق سوري بدي حولن لدولار»: الصندوق ← «صرف عملة» ← من صندوق الليرة لصندوق الدولار بسعر اليوم
test('exchange lira box to dollar box from the cash screen', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('setRate', { date: today, currency: 'USD', kind: 'market', rate: 130 });
    await call('postEntry', { date: today, memo: 'رأس مال', lines: [{ accountId: '1101', debit: 1_000_000 }, { accountId: '3101', credit: 1_000_000 }] });

    await nav(page, 'الصندوق');
    await page.getByRole('button', { name: /صرف عملة/ }).click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'المبلغ اللي طالع' }).locator('input').fill('6500');
    await expect(m.locator('.field', { hasText: 'لأي صندوق' }).locator('select')).toHaveValue('1108');
    await expect(m.locator('.field', { hasText: 'المبلغ اللي داخل' }).locator('input')).toHaveValue('50');
    await m.getByRole('button', { name: 'صرف', exact: true }).click();
    await toast(page, 'تم الصرف');
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const bal = (id: string) => st.entries.flatMap((e: any) => e.lines).filter((l: any) => l.accountId === id).reduce((t: number, l: any) => t + l.debit - l.credit, 0);
    expect(bal('1101')).toBe(350_000);
    expect(bal('1108')).toBe(5_000);
  } finally {
    await close();
  }
});
