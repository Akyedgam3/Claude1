import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// متل الزبون: مادة انضافت بسعر شراء غلط، انصفّرت بالجرد وانحذفت ← خسارة «فروقات الجرد».
// من سجل عمليات المخزون: إلغاء الجرد وبعده الإضافة، فبتنمحي الخسارة والمادة بتضل محذوفة ورصيدها صفر.
test('إلغاء جرد وإضافة غلط بيمحي خسارة فروقات الجرد', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل التصحيح', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const d = new Date().toISOString().slice(0, 10);
    await call('saveItem', { id: 'w', code: '77', name: 'بسكوت غلط', kind: 'stock', unit: 'علبة', price: 100000, priceCurrency: 'SYP' });
    await call('adjustStock', { kind: 'opening', date: d, lines: [{ itemId: 'w', qty: 17, unitCost: 1000000 }] });
    await call('countStock', { date: d, lines: [{ itemId: 'w', counted: 0 }] });
    await call('deleteItem', 'w');
    const diff = () => page.evaluate(() => (window as any).mizan.invoke('company:state').then((r: any) => (r.state ?? r).entries.flatMap((e: any) => e.lines).filter((x: any) => x.accountId === '5402').reduce((t: number, x: any) => t + x.debit - x.credit, 0)));
    await nav(page, 'الجرد وعمليات المخزون');
    await page.getByRole('button', { name: 'السجل', exact: true }).click();
    const rows = page.locator('table.table tbody tr');
    await expect(rows).toHaveCount(2);
    // الإضافة أول: بيرفض لأنه في جرد بعدها
    await rows.filter({ hasText: /رصيد|إضافة/ }).first().click();
    const m = page.locator('.modal');
    await m.getByRole('button', { name: /إلغاء العملية/ }).click();
    await m.getByRole('button', { name: 'متأكد؟ ألغيها' }).click();
    await toast(page, 'ما بتنلغى');
    await m.getByRole('button', { name: 'إغلاق' }).click();
    await expect(m).toHaveCount(0);
    // الجرد، بعدين الإضافة
    await rows.filter({ hasText: 'جرد' }).first().click();
    await m.getByRole('button', { name: /إلغاء العملية/ }).click();
    await m.getByRole('button', { name: 'متأكد؟ ألغيها' }).click();
    await toast(page, 'انلغت');
    await rows.filter({ hasText: /رصيد|إضافة/ }).filter({ hasNotText: 'إلغاء' }).first().click();
    await m.getByRole('button', { name: /إلغاء العملية/ }).click();
    await m.getByRole('button', { name: 'متأكد؟ ألغيها' }).click();
    await toast(page, 'انلغت');
    await expect(rows.locator('.tag.bad')).toHaveCount(2);
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    expect(await diff()).toBe(0);
  } finally {
    await close();
  }
});
