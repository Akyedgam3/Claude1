import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav } from './helpers';
// زبون: الشركة بالليرة والمواد بالدولار، بدّه سعر الشراء بقائمة المواد يبان بالدولار
test('items list shows the purchase cost in the item price currency', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'ملبوسات', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('setRate', { date: '2026-11-01', currency: 'USD', kind: 'market', rate: 151 });
    await call('saveItem', { id: 'a', code: '0002', name: 'شيال M', kind: 'stock', unit: 'قطعة', price: 300, priceCurrency: 'USD' });
    await call('adjustStock', { kind: 'opening', date: '2026-11-22', lines: [{ itemId: 'a', qty: 21, unitCost: 26425 }] });
    await nav(page, 'المواد');
    const row = page.locator('tr', { hasText: 'شيال M' }).first();
    await expect(row).toContainText('1.75');
    await expect(row).toContainText('$');
  } finally {
    await close();
  }
});
