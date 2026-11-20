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

test('free price: POS line price / total and invoice line total, not bound to the item price', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل السعر الحر', activity: 'سوبرماركت' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveItem', { id: 'r', code: 'R', name: 'رز', kind: 'service', unit: 'كيس', price: 100000, priceCurrency: 'SYP' });
    const syp = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;

    // نقطة البيع: 3 أكياس، المجموع كله 250
    await nav(page, 'نقطة البيع');
    const item = page.locator('.pos-item', { hasText: 'رز' });
    for (let i = 0; i < 3; i++) await item.click();
    await page.locator('.price-edit-btn').first().click();
    await page.locator('.price-box select').selectOption('total');
    await page.locator('.price-box input').fill('250');
    await page.locator('.price-box').getByRole('button', { name: 'تم' }).click();
    await expect(page.locator('.price-edit-btn.on')).toHaveCount(1);
    // كيس زيادة بسعر المادة بينزل بسطر لحاله
    await item.click();
    await expect(page.locator('.cart-line')).toHaveCount(2);
    await page.getByRole('button', { name: 'دفع نقداً' }).click();
    await toast(page, 'تم البيع');
    let st = await syp();
    const scale = 10 ** st.currencies['SYP'].decimals;
    expect(st.invoices.at(-1).total / scale).toBe(1250); // 250 للتلاتة + 1000 للرابع

    // الفاتورة: كبسة على المجموع وكتابة المجموع اللي بدك ياه
    await nav(page, 'فاتورة مبيع');
    const row = page.locator('table.lines tbody tr').first();
    await row.locator('.with-button input').first().click();
    await row.locator('.with-button input').first().fill('رز');
    await page.locator('.picker-list li').first().waitFor();
    await row.locator('.with-button input').first().press('Enter');
    await row.locator('.qty-cell input').first().fill('4');
    await row.locator('.line-total-btn').click();
    await row.locator('td[data-label="المجموع"] input').fill('300');
    await row.locator('td[data-label="المجموع"] input').press('Enter');
    await expect(row.locator('td[data-label="السعر"] input')).toHaveValue('75');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    st = await syp();
    expect(st.invoices.at(-1).total / scale).toBe(300);
  } finally {
    await close();
  }
});

test('purchase cost breakdown: shipping + customs + other expenses = full cost (and typing the full cost fills the factory price)', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الاستيراد', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    await call('saveItem', { id: 'p', code: 'P', name: 'براد', kind: 'stock', unit: 'قطعة', price: 0, priceCurrency: 'SYP' });
    await nav(page, 'فاتورة شراء');
    await page.locator('label', { hasText: 'تفصيل تكلفة القطعة' }).locator('input').check();
    const row = page.locator('table.lines tbody tr').first();
    const itemInput = row.locator('.with-button input').first();
    await itemInput.click();
    await itemInput.fill('براد');
    await page.locator('.picker-list li').first().waitFor();
    await itemInput.press('Enter');
    await row.locator('.qty-cell input').first().fill('2');
    const part = (label: string) => row.locator('.cost-parts label', { hasText: label }).locator('input');
    await part('سعر المعمل').fill('100');
    await part('الشحن').fill('20');
    await part('الجمارك').fill('15');
    await part('مصاريف تانية').fill('5');
    const full = row.locator('.cost-full input');
    await expect(full).toHaveValue('140');
    await expect(row.locator('small.cost-sum')).toContainText('280');
    // بكتب الكلفة الكاملة مباشرة: سعر المعمل بيتعدّل لحاله
    await full.fill('150');
    await expect(part('سعر المعمل')).toHaveValue('110');
    if (process.env.SHOT) await row.locator('.cost-parts').screenshot({ path: '/tmp/claude-0/cost.png' });
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const scale = 10 ** st.currencies['SYP'].decimals;
    const line = st.invoices.at(-1).lines[0];
    expect(line.price / scale).toBe(150);
    expect(line.costParts.other / scale).toBe(5);
    expect(st.stock['p'].value / scale).toBe(300);
  } finally {
    await close();
  }
});

test('second $100 credit invoice shows the old debt while writing and on the printed invoice', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الديون', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('setRate', { date: today, currency: 'USD', rate: 11000, kind: 'market' });
    await call('saveParty', { id: 'c', kind: 'customer', name: 'أبو سمير' });
    await call('saveItem', { id: 'w', code: 'W', name: 'جوال', kind: 'service', unit: 'قطعة', price: 10000, priceCurrency: 'USD' });
    await call('postInvoice', { kind: 'sale', date: today, currency: 'USD', partyId: 'c', paid: 0, lines: [{ itemId: 'w', qty: 1, price: 10000 }] });

    // الفاتورة التانية: وقت الكتابة بيبيّن عليه من قبل وبيصير عليه
    await nav(page, 'فاتورة مبيع');
    const partyInput = page.locator('.field', { hasText: 'العميل' }).locator('input').first();
    await partyInput.click();
    await partyInput.fill('أبو سمير');
    await page.locator('.picker-list li').first().waitFor();
    await partyInput.press('Enter');
    await page.locator('.field', { hasText: 'العملة' }).locator('select').first().selectOption('USD');
    const row = page.locator('table.lines tbody tr').first();
    const itemInput = row.locator('.with-button input').first();
    await itemInput.click();
    await itemInput.fill('جوال');
    await page.locator('.picker-list li').first().waitFor();
    await itemInput.press('Enter');
    await page.locator('.pay-switch button', { hasText: 'دون قبض' }).click();
    await expect(page.locator('.kv', { hasText: 'عليه من قبل' })).toContainText('100.00');
    await expect(page.locator('.party-after')).toContainText('200.00');
    await page.getByRole('button', { name: /حفظ الفاتورة/ }).click();
    await toast(page, 'تم حفظ');

    // الفاتورة المطبوعة: حساب سابق 100 والباقي بذمته 200
    await nav(page, 'سجل الفواتير');
    await page.locator('table tbody tr').first().click();
    const doc = page.locator('.invoice-doc').first();
    await expect(doc).toContainText('حساب سابق');
    await expect(doc.locator('.doc-totals .after', { hasText: 'الباقي بذمته' })).toContainText('200.00');
  } finally {
    await close();
  }
});

test('item card: edit the purchase price (stock cost follows, qty stays), delete with stock, restore', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل المواد', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('saveParty', { id: 's', kind: 'supplier', name: 'مورد' });
    await call('saveItem', { id: 'r', code: 'R1', name: 'رز', kind: 'stock', unit: 'كيس', price: 100000, priceCurrency: 'SYP' });
    await call('postInvoice', { kind: 'purchase', date: today, partyId: 's', lines: [{ itemId: 'r', qty: 10, price: 60000 }] });
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const scale = 10 ** (await st()).currencies['SYP'].decimals;

    await nav(page, 'المواد');
    await page.locator('tr', { hasText: 'رز' }).first().click();
    const m = page.locator('.modal');
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click();
    const buy = m.locator('.buy-price input').first();
    await expect(buy).toHaveValue(/600/);
    await buy.fill('500');
    await expect(m.locator('.buy-price label.check')).toContainText('الكمية ما بتتغيّر');
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');
    let s = await st();
    expect(s.stock['r'].totalQty).toBe(10);
    expect(s.stock['r'].value / scale).toBe(5000);

    // حذف وهي إلها رصيد
    await page.locator('tr', { hasText: 'رز' }).first().click();
    await m.getByRole('button', { name: /حذف/ }).click();
    await m.getByRole('button', { name: /رصيدها/ }).click();
    await toast(page, /بيضلّوا بالحسابات/);
    s = await st();
    expect(s.items['r'].archived).toBe(true);
    expect(s.stock['r'].totalQty).toBe(10);
    await page.getByRole('button', { name: /المحذوفة \(1\)/ }).click();
    await page.locator('tr', { hasText: 'رز' }).getByRole('button', { name: 'ترجيع' }).click();
    await toast(page, 'رجعت');
    s = await st();
    expect(s.items['r'].archived).toBeFalsy();
  } finally {
    await close();
  }
});

test('draft invoices: save as draft (no stock move), find it in the log, print it, approve it into a real invoice', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل المسودات', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('saveParty', { id: 's', kind: 'supplier', name: 'مورد' });
    await call('saveParty', { id: 'c', kind: 'customer', name: 'أبو علي' });
    await call('saveItem', { id: 'r', code: 'R1', name: 'رز', kind: 'stock', unit: 'كيس', price: 100000, priceCurrency: 'SYP' });
    await call('postInvoice', { kind: 'purchase', date: today, partyId: 's', lines: [{ itemId: 'r', qty: 10, price: 60000 }] });
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;

    await nav(page, 'فاتورة مبيع');
    const partyInput = page.locator('.field', { hasText: 'العميل' }).locator('input').first();
    await partyInput.click();
    await partyInput.fill('أبو علي');
    await page.locator('.picker-list li').first().waitFor();
    await partyInput.press('Enter');
    const row = page.locator('table.lines tbody tr').first();
    const itemInput = row.locator('.with-button input').first();
    await itemInput.click();
    await itemInput.fill('رز');
    await page.locator('.picker-list li').first().waitFor();
    await itemInput.press('Enter');
    await row.locator('.qty-cell input').first().fill('3');
    await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
    await toast(page, /انحفظت المسودة رقم 1/);
    let s = await st();
    expect(s.stock['r'].totalQty).toBe(10); // ما تحرّكت البضاعة
    expect(s.invoices.filter((i: any) => i.kind === 'sale')).toHaveLength(0);

    // سجل الفواتير ← المسودات
    await expect(page.getByRole('button', { name: /المسودات \(1\)/ })).toBeVisible();
    const draftRow = page.locator('.drafts-table tbody tr', { hasText: 'أبو علي' });
    await expect(draftRow).toBeVisible();
    await draftRow.getByRole('button', { name: 'طباعة' }).click();
    await expect(page.locator('.modal .invoice-doc .doc-stamp')).toContainText('مسودة');
    await page.locator('.modal header button').first().click();

    // فتح واعتماد
    await draftRow.getByRole('button', { name: /فتح واعتماد/ }).click();
    await expect(page.locator('.draft-banner')).toContainText('المسودة رقم 1');
    await expect(page.locator('table.lines tbody tr').first().locator('.qty-cell input').first()).toHaveValue('3');
    await page.getByRole('button', { name: /اعتماد المسودة كفاتورة/ }).click();
    await toast(page, /انعتمدت المسودة 1/);
    s = await st();
    expect(s.stock['r'].totalQty).toBe(7);
    expect(Object.keys(s.drafts ?? {})).toHaveLength(0);
    expect(s.invoices.filter((i: any) => i.kind === 'sale')).toHaveLength(1);

    // فحص البيانات بالإعدادات
    await nav(page, 'الإعدادات');
    await page.getByRole('button', { name: 'فحص البيانات' }).click();
    await page.getByRole('button', { name: /افحص هلق/ }).click();
    await expect(page.locator('.health-result.good')).toContainText('سليم');
  } finally {
    await close();
  }
});

test('a cashier from the preset sees no purchase prices, profits or purchase invoices', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل الكاشير', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('saveParty', { id: 's', kind: 'supplier', name: 'مورد' });
    await call('saveItem', { id: 'r', code: 'R1', name: 'رز', kind: 'stock', unit: 'كيس', price: 100000, priceCurrency: 'SYP' });
    await call('postInvoice', { kind: 'purchase', date: today, partyId: 's', lines: [{ itemId: 'r', qty: 10, price: 60000 }] });
    await call('postInvoice', { kind: 'sale', date: today, lines: [{ itemId: 'r', qty: 1, price: 100000 }] });

    const m = page.locator('.modal');
    await nav(page, 'المستخدمون');
    await page.getByRole('button', { name: '+ مستخدم' }).click();
    await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('خالد');
    await m.locator('.field', { hasText: 'اسم الدخول' }).locator('input').fill('khaled');
    await m.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('khaled123');
    await m.getByRole('button', { name: 'كاشير ما بيشوف أسعار الشراء والأرباح' }).click();
    await expect(m.locator('label.check', { hasText: 'رؤية سعر الشراء والتكلفة' }).locator('input')).not.toBeChecked();
    await expect(m.locator('label.check', { hasText: 'رؤية الأرباح' }).locator('input')).not.toBeChecked();
    await m.getByRole('button', { name: 'حفظ' }).click();
    await toast(page, 'تم الحفظ');

    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await page.locator('.recent button').first().click();
    await m.locator('select').selectOption('khaled');
    await m.locator('input[type=password]').fill('khaled123');
    await m.getByRole('button', { name: 'دخول', exact: true }).click();
    await expect(page.locator('.user-chip')).toContainText('خالد');

    await nav(page, 'سجل الفواتير');
    await expect(page.getByRole('button', { name: /فواتير الشراء/ })).toHaveCount(0);
    await expect(page.locator('table thead')).not.toContainText('الربح');
    await nav(page, 'المواد');
    await expect(page.locator('table thead')).not.toContainText('التكلفة');
    await expect(page.locator('table thead')).not.toContainText('آخر سعر شراء');
  } finally {
    await close();
  }
});

test('cash journal: several receipts and payments on one box with F9; POS shows unpriced items; cancelled invoices in their own list', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'مكتب الحوالات', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const today = new Date().toISOString().slice(0, 10);
    await call('saveParty', { id: 'a', kind: 'both', name: 'ماني اوت' });
    await call('saveParty', { id: 'b', kind: 'both', name: 'خداش' });

    await nav(page, 'يومية الصندوق');
    const rows = page.locator('.cj-lines tbody tr');
    const pickWho = async (i: number, name: string) => {
      const inp = rows.nth(i).locator('.with-button input').first();
      await inp.click();
      await inp.fill(name);
      await page.locator('.picker-list li').first().waitFor();
      await inp.press('Enter');
    };
    await rows.nth(0).locator('input.cj-in').fill('5000');
    await pickWho(0, 'ماني اوت');
    await rows.nth(1).locator('input.cj-out').fill('3000');
    await pickWho(1, 'خداش');
    await expect(page.locator('.cj-totals')).toContainText('2,000');
    await page.keyboard.press('F9');
    await toast(page, 'تسجّلت 2 حركة');
    const st = (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    expect(st.entries.filter((e: any) => e.source?.type === 'receipt' || e.source?.type === 'payment')).toHaveLength(2);

    // نقطة البيع: مادة بدون سعر بتطلع (مش مخفية)
    await call('saveItem', { id: 'np', code: 'NP', name: 'مادة بلا سعر', kind: 'service', unit: 'قطعة', price: 0, priceCurrency: 'SYP' });
    await nav(page, 'نقطة البيع');
    await expect(page.locator('.pos-item.no-price', { hasText: 'مادة بلا سعر' })).toBeVisible();

    // فاتورة ملغاة بتروح على قائمة «الملغاة»
    await call('saveItem', { id: 's', code: 'S', name: 'خدمة', kind: 'service', unit: 'قطعة', price: 100000, priceCurrency: 'SYP' });
    const inv = (await call('postInvoice', { kind: 'sale', date: today, lines: [{ itemId: 's', qty: 1, price: 100000 }] })) as any;
    await call('voidInvoice', inv.value?.id ?? inv.id, today);
    await nav(page, 'سجل الفواتير');
    await expect(page.locator('table tbody tr', { hasText: 'ملغاة' })).toHaveCount(0);
    await page.getByRole('button', { name: /الملغاة \(1\)/ }).click();
    await expect(page.locator('table tbody tr', { hasText: 'ملغاة' })).toHaveCount(1);
  } finally {
    await close();
  }
});

test('edit everywhere: a voucher from the cash box, a manual entry, a stock opening', async () => {
  const { page, close } = await launch();
  try {
    await activate(page);
    await createCompany(page, { name: 'محل التعديل', activity: 'تجارة عامة' });
    const call = (method: string, ...args: unknown[]) => page.evaluate(([mm, a]) => (window as any).mizan.invoke('company:call', mm, a), [method, args] as const);
    const st = async () => (await page.evaluate(() => (window as any).mizan.invoke('company:state'))).state;
    const today = new Date().toISOString().slice(0, 10);
    await call('saveParty', { id: 'c', kind: 'customer', name: 'أبو سامر' });
    await call('saveItem', { id: 'r', code: 'R1', name: 'رز', kind: 'stock', unit: 'كيس', price: 100000, priceCurrency: 'SYP' });
    const scale = 10 ** (await st()).currencies['SYP'].decimals;
    await call('postVoucher', { kind: 'receipt', date: today, amount: 5000 * scale, partyId: 'c', memo: 'دفعة' });

    // من الصندوق: كبسة عالحركة بتفتح السند للتعديل
    await nav(page, 'الصندوق');
    await page.locator('tr.clickable', { hasText: 'دفعة' }).first().click();
    await expect(page.locator('.draft-banner')).toContainText('عم تعدّل');
    await page.locator('.field', { hasText: 'المبلغ' }).locator('input').fill('7000');
    await page.getByRole('button', { name: 'حفظ التعديل' }).click();
    await toast(page, 'تم تعديل السند');
    await page.locator('.modal header button').first().click();
    let s = await st();
    const live = s.entries.filter((e: any) => e.source?.type === 'receipt' && !e.voidOf && !s.voided[e.id]);
    expect(live).toHaveLength(1);
    expect(live[0].memo).toMatch(/سند قبض رقم 1:/);

    // قيد يدوي
    await call('postEntry', { date: today, memo: 'قيد تجربة', lines: [{ accountId: '5209', debit: 100 * scale }, { accountId: '1101', credit: 100 * scale }], source: { type: 'manual', id: 'm1' } });
    await nav(page, 'القيود اليومية');
    await page.locator('tr', { hasText: 'قيد تجربة' }).getByRole('button', { name: 'تعديل' }).click();
    await expect(page.locator('h3', { hasText: 'تعديل القيد' })).toBeVisible();
    await page.locator('table.lines tbody tr').first().locator('input.num-input').first().fill('150');
    await page.locator('table.lines tbody tr').nth(1).locator('input.num-input').nth(1).fill('150');
    await page.getByRole('button', { name: /حفظ/ }).first().click();
    await toast(page, 'تم تعديل القيد');

    // رصيد افتتاحي من سجل عمليات المخزون
    await call('adjustStock', { kind: 'opening', date: today, lines: [{ itemId: 'r', qty: 10, unitCost: 60000 }] });
    await nav(page, 'الجرد وعمليات المخزون');
    await page.getByRole('button', { name: /السجل/ }).click();
    await page.locator('table tbody tr').first().click();
    await page.locator('.modal').getByRole('button', { name: 'تعديل', exact: true }).click();
    const m = page.locator('.modal').last();
    await m.locator('table.lines tbody tr').first().locator('input.num-input').first().fill('12');
    await m.getByRole('button', { name: 'حفظ التعديل' }).click();
    await toast(page, 'تم تعديل العملية');
    s = await st();
    expect(s.stock['r'].totalQty).toBe(12);
  } finally {
    await close();
  }
});
