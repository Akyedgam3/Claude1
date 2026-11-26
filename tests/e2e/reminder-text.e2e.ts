import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// زبون: «وين فيني عدّل هي الرسالة التلقائية» (تذكير الدين عالواتساب): الإعدادات ← الطباعة والفواتير ← رسالة تذكير الدين
test('debt reminder text is editable from settings', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'ALRASHEED net', activity: 'تجارة عامة' });
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'الطباعة والفواتير' }).click();
    const card = page.locator('.reminder-card');
    await card.locator('textarea').fill('أهلين {الاسم}، عليك {المبلغ} عند {المحل}.{الموعد}');
    await expect(card.locator('.reminder-sample')).toContainText('أهلين أبو خالد، عليك 43.00 $ عند ALRASHEED net.');
    await card.getByRole('button', { name: 'حفظ الرسالة' }).click();
    await toast(page, 'تم حفظ رسالة التذكير');
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    expect(st.info.reminderText).toBe('أهلين {الاسم}، عليك {المبلغ} عند {المحل}.{الموعد}');
  } finally {
    await close();
  }
});
