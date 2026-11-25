import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// كيبورد الجوال: آخر كلمة («، ٢م») بتكون بالخانة بس لسا ما انبعتت للبرنامج لما يكبس حفظ.
// منحاكيها: منحط النص بالخانة بدون حدث input، والاسم لازم ينحفظ كامل.
test('item and customer names keep the last word the phone keyboard did not send yet', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const typeUncommitted = (sel: string, v: string) =>
      page.evaluate(
        ([s, val]) => {
          const el = document.querySelector(s) as HTMLInputElement;
          // كلمة «قيد الكتابة» (composition) ما خلصت: القيمة بالخانة بس البرنامج ما وصله شي
          el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, val);
          // الكيبورد بيمنع الـchange لما ينكبس زر تاني: منلغي حدث الإرسال الضمني
          el.addEventListener('change', (e) => e.stopImmediatePropagation(), { capture: true, once: true });
          el.addEventListener('focusout', (e) => e.stopImmediatePropagation(), { capture: true, once: true });
          el.addEventListener('blur', (e) => e.stopImmediatePropagation(), { capture: true, once: true });
        },
        [sel, v] as const,
      );

    await nav(page, 'المواد');
    await page.getByRole('button', { name: /مادة جديدة|متر جديد|جديد/ }).first().click();
    const m = page.locator('.modal');
    const name = m.locator('.field', { hasText: 'الاسم' }).first().locator('input');
    await name.fill('زنوبيا');
    await typeUncommitted('.modal .field input[autofocus], .modal .field:first-child input', 'زنوبيا، ٢م');
    await m.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect.poll(async () => Object.values((await st()).items as Record<string, any>).map((i) => i.name)).toContain('زنوبيا، ٢م');

    await nav(page, 'العملاء والموردون');
    await page.getByRole('button', { name: 'إضافة' }).first().click();
    const pm = page.locator('.modal');
    await pm.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('أبو');
    await typeUncommitted('.modal .field:first-child input', 'أبو خالد ٢');
    await pm.getByRole('button', { name: 'حفظ', exact: true }).click();
    await toast(page, /تم|انحفظ/).catch(() => undefined);
    await expect.poll(async () => Object.values((await st()).parties as Record<string, any>).map((p) => p.name)).toContain('أبو خالد ٢');
  } finally {
    await close();
  }
});
