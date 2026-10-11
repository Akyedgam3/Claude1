import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, pick, toast } from './helpers';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

test('supermarket: opening stock, fast checkout by barcode and scale barcode', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'سوبرماركت الخير', activity: 'سوبرماركت' });
    await shot(page, '01-dashboard-supermarket');

    const m = page.locator('.modal');
    // صنف بالقطعة وصنف بالوزن
    await nav(page, 'المواد');
    await page.getByRole('button', { name: /صنف جديد/ }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('علبة حليب');
    await m.locator('.field', { hasText: 'الباركود' }).locator('input').fill('6291000000017');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await m.locator('.field', { hasText: 'سعر المبيع' }).locator('input').fill('15000');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    await page.getByRole('button', { name: /صنف جديد/ }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('جبنة بلدية');
    await m.locator('.field', { hasText: 'الرمز' }).locator('input').fill('00123');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await m.locator('.field', { hasText: 'الوحدة الأساسية' }).locator('input').fill('كيلو');
    await m.locator('.field', { hasText: 'سعر المبيع' }).locator('input').fill('80000');
    await m.getByRole('button', { name: 'التتبع' }).click();
    await m.getByText('يُباع بالوزن').click();
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    // بضاعة أول المدة
    await nav(page, 'عمليات المخزون');
    await page.getByRole('button', { name: 'الأرصدة الافتتاحية' }).click();
    await page.locator('.field', { hasText: 'الصندوق (ليرة)' }).locator('input').fill('500000');
    for (const [name, qty, cost] of [['حليب', '24', '11000'], ['جبنة', '10', '60000']]) {
      await pick(page, page.locator('.card .picker input').last(), name!);
      const row = page.locator('table.lines').last().locator('tbody tr').last();
      await row.locator('input.num-input').nth(0).fill(qty!);
      await row.locator('input.num-input').nth(1).fill(cost!);
    }
    await page.getByRole('button', { name: 'حفظ الأرصدة الافتتاحية' }).click();
    await toast(page, 'تم تسجيل الأرصدة الافتتاحية');

    // نقطة البيع: باركود عادي مرتين + باركود ميزان (1.250 كيلو جبنة)
    await nav(page, 'نقطة البيع');
    await page.getByLabel('طباعة الإيصال تلقائياً').uncheck();
    const scan = page.locator('.scan-input');
    for (const code of ['6291000000017', '6291000000017', '2100123012503']) {
      await scan.fill(code);
      await scan.press('Enter');
    }
    await expect(page.locator('.pos-line')).toHaveCount(2);
    // 2 × 15,000 + 1.25 × 80,000 = 130,000
    await expect(page.locator('.pos-totals .grand').last()).toContainText('130,000.00');
    await page.locator('.pos-totals input.big-input').fill('150000');
    await expect(page.locator('.pos-totals')).toContainText('20,000.00');
    await shot(page, '02-pos');
    await page.getByRole('button', { name: 'دفع نقداً' }).click();
    await toast(page, 'الباقي للزبون: 20,000.00');

    await nav(page, 'المواد');
    await expect(page.locator('tr', { hasText: 'علبة حليب' })).toContainText('22');
    await expect(page.locator('tr', { hasText: 'جبنة بلدية' })).toContainText('8.75');
  } finally {
    await close();
  }
});

test('pharmacy: batches with expiry dates are sold nearest-expiry first', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'صيدلية الشفاء', activity: 'صيدلية' });
    const m = page.locator('.modal');
    await nav(page, 'المواد');
    await page.getByRole('button', { name: /دواء جديد/ }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('بنادول 500');
    await m.locator('.field', { hasText: 'الاسم العلمي' }).locator('input').fill('Paracetamol');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await m.locator('.field', { hasText: 'سعر المبيع' }).locator('input').fill('12000');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    // شراء دفعتين بتاريخي صلاحية
    await nav(page, 'فاتورة شراء');
    for (const [qty, batch, expiry] of [['10', 'B-LATE', '2028-01-01'], ['5', 'B-SOON', '2027-01-01']]) {
      await pick(page, page.locator('table.lines .picker input').last(), 'بنادول');
      const row = page.locator('table.lines tbody tr').filter({ hasText: 'بنادول' }).last();
      await row.locator('input.num-input').nth(0).fill(qty!);
      await row.locator('input.num-input').nth(1).fill('8000');
      await row.getByPlaceholder('رقم الدفعة').fill(batch!);
      await row.locator('input[type=date]').fill(expiry!);
    }
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ فاتورة شراء');

    // البيع يسحب من الدفعة الأقرب انتهاءً
    await nav(page, 'فاتورة مبيع');
    await pick(page, page.locator('table.lines .picker input').first(), 'بنادول');
    await page.locator('table.lines tbody tr').first().locator('input.num-input').nth(0).fill('7');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ فاتورة مبيع');
    await expect(page.locator('.invoice-doc')).toContainText('B-SOON');
    await expect(page.locator('.invoice-doc')).toContainText('B-LATE');
    await shot(page, '03-pharmacy-invoice');

    await nav(page, 'عمليات المخزون');
    await page.getByRole('button', { name: 'الصلاحية' }).click();
    await page.locator('.field', { hasText: 'خلال' }).locator('input').fill('2000');
    await expect(page.locator('table tbody tr')).toHaveCount(1); // بقيت دفعة واحدة (8 علب من B-LATE)
    await expect(page.locator('table tbody tr')).toContainText('B-LATE');
  } finally {
    await close();
  }
});

test('restaurant: table order with recipe deducts ingredients', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مطعم الياسمين', activity: 'مطعم' });
    const m = page.locator('.modal');
    await nav(page, 'المواد');
    // مادة أولية
    await page.getByRole('button', { name: /صنف جديد/ }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('لحمة شاورما');
    await m.locator('.field', { hasText: 'التصنيف' }).locator('input').fill('مواد أولية');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await m.locator('.field', { hasText: 'الوحدة الأساسية' }).locator('input').fill('كيلو');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');
    // وجبة مركّبة
    await page.getByRole('button', { name: /صنف جديد/ }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('صحن شاورما');
    await m.locator('.field', { hasText: 'النوع' }).locator('select').selectOption('composite');
    await m.locator('.field', { hasText: 'التصنيف' }).locator('input').fill('وجبات رئيسية');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await m.locator('.field', { hasText: 'سعر المبيع' }).locator('input').fill('60000');
    await m.getByRole('button', { name: 'المكوّنات' }).click();
    await pick(page, m.locator('.picker input'), 'لحمة');
    await m.locator('table input').first().fill('0.25');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    await nav(page, 'عمليات المخزون');
    await page.getByRole('button', { name: 'الأرصدة الافتتاحية' }).click();
    await pick(page, page.locator('.card .picker input').last(), 'لحمة');
    const row = page.locator('table.lines').last().locator('tbody tr').last();
    await row.locator('input.num-input').nth(0).fill('10');
    await row.locator('input.num-input').nth(1).fill('100000');
    await page.getByRole('button', { name: 'حفظ الأرصدة الافتتاحية' }).click();
    await toast(page, 'تم تسجيل الأرصدة الافتتاحية');

    await nav(page, 'الطاولات والطلبات');
    await page.getByPlaceholder(/اسم الطاولة/).fill('طاولة 1');
    await page.getByRole('button', { name: 'إضافة طاولة' }).click();
    await page.locator('.table-card', { hasText: 'طاولة 1' }).click();
    await page.locator('.pos-item', { hasText: 'صحن شاورما' }).click();
    await page.locator('.pos-item', { hasText: 'صحن شاورما' }).click();
    await expect(page.locator('.pos-totals')).toContainText('120,000.00');
    await shot(page, '04-restaurant-order');
    await page.getByRole('button', { name: 'الحساب وإغلاق الطلب' }).click();
    await toast(page, /./);
    await nav(page, 'المواد');
    await expect(page.locator('tr', { hasText: 'لحمة شاورما' })).toContainText('9.5');
  } finally {
    await close();
  }
});

test('users: a cashier sees only what the role allows', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الصلاحيات', activity: 'تجارة عامة' });
    const m = page.locator('.modal');
    await nav(page, 'المستخدمون');
    await page.getByRole('button', { name: '+ مستخدم' }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('سامر');
    await m.locator('.field', { hasText: 'اسم الدخول' }).locator('input').fill('samer');
    await m.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('samer123');
    await shot(page, '05-user-permissions');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await page.locator('.recent button').first().click();
    await m.locator('select').selectOption('samer');
    await m.locator('input[type=password]').fill('wrongpass');
    await m.getByRole('button', { name: 'دخول', exact: true }).click();
    await expect(page.locator('.toast.error')).toContainText('غير صحيحة');
    await m.locator('input[type=password]').fill('samer123');
    await m.getByRole('button', { name: 'دخول', exact: true }).click();
    await expect(page.locator('.user-chip')).toContainText('سامر');
    await expect(page.locator('.sidebar nav')).toContainText('فاتورة مبيع');
    await expect(page.locator('.sidebar nav')).not.toContainText('فاتورة شراء');
    await expect(page.locator('.sidebar nav')).not.toContainText('المستخدمون');
    await expect(page.locator('.sidebar nav')).not.toContainText('القيود اليومية');
  } finally {
    await close();
  }
});
