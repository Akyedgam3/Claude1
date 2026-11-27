import { expect, test } from '@playwright/test';
import { activate, companyWizard, launch, nav, toast } from './helpers';

// زبون عليه 35$ (الشركة بالدولار والليرة مخفية) ودفع 30$ بالليرة: «العملة اللي قبضتها» ليرة،
// الليرات بتفوت صندوق الليرة والدين بالدولار بينزل 30
test('pay a dollar debt in lira from the debts screen', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await companyWizard(page, { activity: 'تجارة عامة', name: 'محل', owner: 'المالك', username: 'admin' });
    await page.getByRole('button', { name: 'حفظته، تابع' }).click();
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const s0 = await st();
    const base = s0.info.baseCurrency;
    const foreign = base === 'USD' ? 'SYP' : 'USD';
    const today = new Date().toISOString().slice(0, 10);
    // سعر الدولار 120 ل.س (بأي عملة أساسية)
    await call('setRate', { date: today, currency: foreign, kind: 'market', rate: foreign === 'USD' ? 120 : 1 / 120 });
    await call('saveParty', { id: 'c', kind: 'customer', name: 'علي ابو سلوم' });
    await call('postDebt', { direction: 'owed', partyId: 'c', date: today, amount: 3500, currency: 'USD', reason: 'old' });
    await nav(page, 'الديون');
    await page.locator('tr', { hasText: 'علي ابو سلوم' }).first().click();
    await page.locator('.modal').getByRole('button', { name: 'تسجيل قبض', exact: true }).click();
    const m = page.locator('.modal', { hasText: 'قبض من علي ابو سلوم' });
    await m.locator('.field', { hasText: 'العملة اللي قبضتها' }).locator('select').selectOption('SYP');
    await m.locator('.field', { hasText: 'المبلغ' }).first().locator('input').fill('3600');
    await expect(m).toContainText('ينزل من الدين');
    await expect(m).toContainText('30.00');
    await m.getByRole('button', { name: 'تسجيل القبض' }).click();
    await toast(page, 'تم قبض');
    const s = await st();
    const usd = s.entries.flatMap((e: any) => e.lines).filter((l: any) => l.partyId === 'c' && l.currency === 'USD').reduce((t: number, l: any) => t + l.debit - l.credit, 0);
    expect(usd).toBe(500);
  } finally {
    await close();
  }
});
