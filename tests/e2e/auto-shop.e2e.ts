import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { activate, createCompany, launch, nav, pick, toast, waitForFile } from './helpers';

test('a full day in an auto parts shop and workshop', async () => {
  const { page, home, close } = await launch();
  try {
    await activate(page);
    const recovery = await createCompany(page, { name: 'مركز أبو سمير', activity: 'قطع غيار وصيانة سيارات' });
    expect(recovery).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);

    // سعر الدولار
    await nav(page, 'سعر الدولار');
    await page.locator('.field', { hasText: 'سعر السوق' }).locator('input').fill('120');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم حفظ السعر');

    // قطعة جديدة
    await nav(page, 'المواد');
    await page.getByRole('button', { name: /قطعة جديد/ }).click();
    const m = page.locator('.modal');
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('فلتر زيت كيا ريو');
    await m.locator('.field', { hasText: 'رقم القطعة' }).locator('input').fill('26300-35505');
    await m.locator('.field', { hasText: 'الباركود' }).locator('input').fill('8801234567890');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await m.locator('.field', { hasText: 'سعر المبيع' }).locator('input').fill('75000');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    // مورد وعميل
    await nav(page, 'العملاء والموردون');
    for (const [name, kind] of [['مستودع الشام', 'supplier'], ['أبو خالد', 'customer']] as const) {
      await page.getByRole('button', { name: '+ إضافة' }).click();
      await m.locator('.field', { hasText: 'الاسم' }).locator('input').fill(name);
      await m.locator('select').first().selectOption(kind);
      await m.getByRole('button', { name: 'حفظ' }).click();
      await toast(page, 'تم الحفظ');
    }

    // فاتورة شراء بالباركود
    await nav(page, 'فاتورة شراء');
    await pick(page, page.locator('.field', { hasText: 'المورد' }).locator('input').first(), 'الشام');
    await page.locator('.scan-input').fill('8801234567890');
    await page.locator('.scan-input').press('Enter');
    const row = page.locator('table.lines tbody tr').first();
    await row.locator('input.num-input').nth(0).fill('10');
    await row.locator('input.num-input').nth(1).fill('45000');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ فاتورة شراء رقم 1');

    // سيارة وأمر صيانة
    await nav(page, 'السيارات والأجهزة');
    await page.getByRole('button', { name: /سيارة جديد/ }).click();
    await pick(page, m.locator('.picker input'), 'خالد');
    await m.locator('.field', { hasText: 'رقم اللوحة' }).locator('input').fill('دمشق 512347');
    await m.locator('.field', { hasText: 'الشركة الصانعة' }).locator('input').fill('كيا');
    await m.locator('.field', { hasText: 'الطراز' }).locator('input').fill('ريو');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    await nav(page, 'أوامر الصيانة');
    await page.getByRole('button', { name: /أمر إصلاح جديد|أمر صيانة جديد/ }).click();
    await pick(page, page.locator('.field', { hasText: 'السيارة' }).locator('.picker input'), '512347');
    await page.locator('.field', { hasText: 'شكوى الزبون' }).locator('textarea').fill('تغيير زيت وفلتر');
    await pick(page, page.locator('section', { hasText: 'القطع المستخدمة' }).locator('.picker input'), 'فلتر');
    await page.getByRole('button', { name: '+ أضف عملاً' }).click();
    const labor = page.locator('section', { hasText: 'أجور اليد' }).locator('tbody tr').first();
    await labor.locator('input').nth(0).fill('أجور تغيير زيت');
    await labor.locator('input').nth(1).fill('25000');
    await page.locator('.page-header').getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم حفظ أمر الإصلاح رقم 1');
    await page.getByRole('button', { name: 'تسليم وفوترة' }).click();
    await m.locator('.field', { hasText: 'المقبوض' }).locator('input').fill('50000');
    await m.getByRole('button', { name: 'إصدار الفاتورة' }).click();
    await toast(page, 'تم إنشاء فاتورة رقم 1');

    // الفاتورة: التفقيط والتصدير إلى PDF
    await expect(page.locator('.invoice-doc')).toContainText('فقط مئة ألف ليرة سورية لا غير');
    await expect(page.locator('.invoice-doc')).toContainText('26300-35505');
    await page.getByRole('button', { name: 'PDF' }).click();
    const pdf = await waitForFile(home, '.pdf');
    expect(fs.readFileSync(pdf).subarray(0, 4).toString()).toBe('%PDF');

    // التقارير: ميزان مراجعة متوازن وتصدير Excel
    await nav(page, 'التقارير');
    await page.getByRole('button', { name: 'ميزان المراجعة' }).click();
    await expect(page.locator('tfoot')).toContainText('متوازن ✓');
    await page.getByRole('button', { name: 'Excel' }).click();
    const xlsx = await waitForFile(home, '.xlsx');
    expect(fs.readFileSync(xlsx).subarray(0, 2).toString()).toBe('PK');

    await page.getByRole('button', { name: 'الأرباح والخسائر' }).click();
    // المبيع 100,000 (قطعة 75,000 + أجور 25,000) والتكلفة 45,000
    await expect(page.locator('.stat.good')).toContainText('55,000.00');

    await nav(page, 'الرئيسية');
    await expect(page.locator('.stat', { hasText: 'ديون لنا على العملاء' })).toContainText('50,000.00');
  } finally {
    await close();
  }
});
