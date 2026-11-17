import path from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { activate, createCompany, launch, nav, toast } from './helpers';

// تحكم كامل بالمستخدمين + تحويل عملة سعر المادة + إعادة استيراد الإكسل بأسعار جديدة + QR إضافي بالفاتورة

test('item currency change converts prices; Excel re-import updates prices; extra QR on invoice', async () => {
  const { app, page, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل التجربة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('setRate', { date: today, currency: 'USD', rate: 11000, kind: 'market' });
    await call('saveItem', { id: 'usd1', code: 'U1', name: 'شاحن', kind: 'service', unit: 'قطعة', price: 1000, priceCurrency: 'USD' });

    // 10 دولار ← سوري بتصير 110,000 مش 10
    await nav(page, 'المواد');
    await page.locator('tr', { hasText: 'شاحن' }).first().click();
    const m = page.locator('.modal');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    await m.locator('.field', { hasText: 'عملة السعر' }).locator('select').selectOption('SYP');
    const priceInput = m.locator('.tier-prices-row label', { hasText: 'مفرق' }).locator('input');
    await expect(priceInput).toHaveValue(/110[,٬]?000/);
    await m.getByRole('button', { name: 'حفظ' }).click();
    const st = await page.evaluate(() => (window as any).mizan.invoke('company:state'));
    expect(st.state.items['usd1'].priceCurrency).toBe('SYP');
    expect(st.state.items['usd1'].price / 10 ** st.state.currencies['SYP'].decimals).toBe(110000);

    // استيراد إكسل، وبعدين نفس المواد بسعر تاني: الأسعار بتتحدّث
    const file1 = path.join(home, 'a.xlsx');
    const file2 = path.join(home, 'b.xlsx');
    for (const [f, p] of [[file1, 500], [file2, 750]] as const) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('المواد');
      ws.addRow(['الاسم', 'الرمز', 'الوحدة', 'سعر المبيع']);
      ws.addRow(['كابل', 'K1', 'قطعة', p]);
      ws.addRow(['سماعة', '', 'قطعة', p * 2]);
      await wb.xlsx.writeFile(f);
    }
    const pickFile = (f: string) => app.evaluate(({ dialog }, x) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [x] })) as never; }, f);
    await pickFile(file1);
    await page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await toast(page, /استيراد 2 مادة/);
    await pickFile(file2);
    await page.getByRole('button', { name: 'استيراد من Excel' }).click();
    await toast(page, /تحدّثت أسعار وبيانات 2 مادة/);
    const after = await page.evaluate(() => (window as any).mizan.invoke('company:state'));
    const items = Object.values(after.state.items) as { name: string; price: number }[];
    expect(items.filter((i) => i.name === 'كابل')).toHaveLength(1);
    expect(items.find((i) => i.name === 'كابل')!.price).toBe(75000);
    expect(items.find((i) => i.name === 'سماعة')!.price).toBe(150000);

    // QR إضافي (شام كاش) بيطلع بالفاتورة
    await call('updateCompany', { print: { extraQrs: [{ kind: 'text', label: 'ادفع بشام كاش', value: 'SC-123456' }, { kind: 'whatsapp', label: 'راسلنا', value: '0999123456' }] } });
    const inv = await call('postInvoice', { kind: 'sale', date: today, lines: [{ itemId: 'usd1', qty: 1, price: 11000000 }] });
    expect(inv).toBeTruthy();
    await nav(page, 'سجل الفواتير');
    await page.locator('table tbody tr').first().click();
    await expect(page.locator('.invoice-doc .doc-qr-box', { hasText: 'ادفع بشام كاش' })).toBeVisible();
    await expect(page.locator('.invoice-doc .doc-qr-box', { hasText: 'راسلنا' })).toBeVisible();
  } finally {
    await close();
  }
});

test('owner hides sections and blocks credit sales / price edits for a cashier', async () => {
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
    await m.locator('label.check', { hasText: 'البيع بالدين' }).locator('input').uncheck();
    await m.locator('label.check', { hasText: 'تغيير سعر المادة' }).locator('input').uncheck();
    const sections = m.locator('.field', { hasText: 'الأقسام اللي بيشوفها' });
    await sections.locator('label.check', { hasText: 'سجل الفواتير' }).locator('input').uncheck();
    await sections.locator('label.check', { hasText: 'الديون' }).locator('input').uncheck();
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');
    const st = await page.evaluate(() => (window as any).mizan.invoke('company:state'));
    const samer = Object.values(st.state.users).find((u: any) => u.username === 'samer') as any;
    expect(samer.hiddenScreens.sort()).toEqual(['debts', 'invoices']);
    expect(samer.denied.sort()).toEqual(['price.edit', 'sales.credit']);

    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await page.locator('.recent button').first().click();
    await m.locator('select').selectOption('samer');
    await m.locator('input[type=password]').fill('samer123');
    await m.getByRole('button', { name: 'دخول', exact: true }).click();
    await expect(page.locator('.user-chip')).toContainText('سامر');
    const sidebar = page.locator('.sidebar nav');
    await expect(sidebar).toContainText('فاتورة مبيع');
    await expect(sidebar).not.toContainText('سجل الفواتير');
    await expect(sidebar).not.toContainText('الديون');

    await nav(page, 'فاتورة مبيع');
    await expect(page.locator('.pay-switch button')).toHaveCount(1);
    await expect(page.locator('.pay-switch')).not.toContainText('دين');
  } finally {
    await close();
  }
});

test('long 80mm receipt prints as one page (no extra page with just the thanks line)', async () => {
  const { page, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الطباعة', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('saveItem', { id: 'x', code: 'X', name: 'مادة طويلة الاسم للتجربة', kind: 'service', unit: 'قطعة', price: 100000, priceCurrency: 'SYP' });
    await call('postInvoice', { kind: 'sale', date: today, lines: Array.from({ length: 45 }, (_, i) => ({ itemId: 'x', qty: i + 1, price: 100000 })) });
    await nav(page, 'سجل الفواتير');
    await page.locator('table tbody tr').first().click();
    await page.locator('.paper-select').first().selectOption('80mm');
    await page.getByRole('button', { name: 'PDF' }).first().click();
    const fs = await import('node:fs');
    const { waitForFile } = await import('./helpers');
    const pdf = await waitForFile(home, '.pdf');
    await expect.poll(() => fs.statSync(pdf).size).toBeGreaterThan(1000);
    const raw = fs.readFileSync(pdf).toString('latin1');
    const pages = raw.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBe(1);
  } finally {
    await close();
  }
});

test('A4 invoice that spills a little onto page 2 is shrunk to one page; long ones are left as is', async () => {
  const { page, home, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('saveItem', { id: 'x', code: 'X', name: 'مادة', kind: 'service', unit: 'قطعة', price: 100000, priceCurrency: 'SYP' });
    await call('updateCompany', { print: { footer: 'شكراً لزيارتكم' } });
    for (const n of [24, 40]) await call('postInvoice', { kind: 'sale', date: today, lines: Array.from({ length: n }, (_, i) => ({ itemId: 'x', qty: i + 1, price: 100000 })) });
    const fs = await import('node:fs');
    const pagesOf = async (row: number) => {
      await nav(page, 'سجل الفواتير');
      await page.locator('table tbody tr').nth(row).click();
      const before = new Set(fs.readdirSync(home));
      await page.getByRole('button', { name: 'PDF' }).first().click();
      let f = '';
      await expect.poll(() => (f = fs.readdirSync(home).find((x) => x.endsWith('.pdf') && !before.has(x)) ?? '')).not.toBe('');
      await expect.poll(() => fs.statSync(`${home}/${f}`).size).toBeGreaterThan(1000);
      return (fs.readFileSync(`${home}/${f}`).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    };
    expect(await pagesOf(1)).toBe(1); // 24 سطر
    expect(await pagesOf(0)).toBeGreaterThan(1); // 40 سطر: طويلة فعلاً، ما منصغّرها
  } finally {
    await close();
  }
});
