// لقطات فيديو شرح قسم الفروج والدواجن: البرنامج الحقيقي (Electron، 1600×1000).
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/guide-poultry/capture.mts <outdir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { launch } from '../../../tests/e2e/helpers';
import { issueLicense, signFeed, type LicenseFeed } from '../../../src/license/license';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const devKey = fs.readFileSync(path.join(ROOT, 'dev-keys/license-private.dev.pem'), 'utf8');
const OUT = path.resolve(process.argv[2]!);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, { file: string; targets: Record<string, Box> }> = {};
const errs: string[] = [];

async function snap(p: Page, name: string, targets: Record<string, Locator> = {}, wait = 700) {
  await p.waitForTimeout(wait);
  const t: Record<string, Box> = {};
  for (const [k, loc] of Object.entries(targets)) {
    const bx = await loc.first().boundingBox({ timeout: 2500 }).catch(() => null);
    if (bx) t[k] = { x: Math.round(bx.x), y: Math.round(bx.y), w: Math.round(bx.width), h: Math.round(bx.height) };
    else errs.push(`no box ${name}.${k}`);
  }
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  states[name] = { file: `${name}.png`, targets: t };
  console.log('snap', name, Object.keys(t).join(','));
}
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    errs.push(`${name}: ${(e as Error).message.split('\n')[0]}`);
    console.log('FAIL', name, (e as Error).message.split('\n')[0]);
  }
}

const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-gp': { status: 'active' } } };
const feedServer = http.createServer((_q, r) => r.end(signFeed(feed, devKey)));
await new Promise<void>((r) => feedServer.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.txt`;
const style = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' }).catch(() => undefined);
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (p: Page | Locator, label: string | RegExp) => p.locator('.field', { hasText: label }).first();
const nav = (p: Page, label: string) => p.locator('.sidebar nav a, .sidebar nav button', { hasText: label }).first();
const top = (p: Page) => p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop > 0) e.scrollTop = 0; });
const bottom = (p: Page) => p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 5 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; });

async function open(p: Page) {
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  const machineId = (await p.locator('.big-code').first().innerText()).trim();
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-gp', customer: 'فروج الريف', machineId, plan: 'annual' }, devKey));
  await btn(p, 'تفعيل', true).click();
  await btn(p, 'شركة جديدة').waitFor();
}
async function fillCompany(p: Page) {
  await p.locator('.activity', { hasText: 'فروج' }).first().click();
  await field(p, 'اسم الشركة').locator('input').fill('فروج الريف');
  await field(p, 'الهاتف').locator('input').fill('0944 123 456');
  await field(p, 'اسمك').locator('input').fill('أبو أحمد');
  await field(p, 'كلمة السر (6').locator('input').fill('secret123');
  await field(p, 'تأكيد كلمة السر').locator('input').fill('secret123');
}

// ── التشغيل الأول: شركة فاضية (إنشاء الشركة والقطعيات الجاهزة)
const A = await launch({ feedUrl });
try {
  const p = A.page;
  await open(p);
  await style(p);
  await snap(p, 'start', { new: btn(p, 'شركة جديدة') }, 600);
  await btn(p, 'شركة جديدة').click();
  await p.locator('.activity').first().waitFor();
  await style(p);
  await snap(p, 'activities', { poultry: p.locator('.activity', { hasText: 'فروج' }) }, 500);
  await fillCompany(p);
  await p.locator('.demo-check input').check();
  await bottom(p);
  await snap(p, 'create', { name: field(p, 'اسم الشركة'), phone: field(p, 'الهاتف'), you: field(p, 'اسمك'), pass: field(p, 'كلمة السر (6'), demo: p.locator('.demo-check'), create: btn(p, 'إنشاء الشركة'), poultry: p.locator('.activity.selected, .activity.on, .activity', { hasText: 'فروج' }) }, 500);
  await p.locator('.demo-check input').uncheck();
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').click({ timeout: 30000 });
  await p.locator('.sidebar').waitFor();
  await style(p);
  await nav(p, 'الفروج والتوزيع').click();
  await p.waitForTimeout(600);
  await style(p);
  await snap(p, 'cuts_empty', { nav: nav(p, 'الفروج والتوزيع'), add: btn(p, 'أضف القطعيات الجاهزة'), tab: btn(p, 'تسعيرة اليوم') });
  await btn(p, 'أضف القطعيات الجاهزة').click();
  await p.locator('table.price-board tbody tr').first().waitFor();
  await style(p);
  await snap(p, 'cuts', { table: p.locator('table.price-board'), first: p.locator('table.price-board tbody tr').first(), unit: p.locator('table.price-board thead th', { hasText: 'الوحدة' }) }, 800);
} catch (e) {
  errs.push('A ' + (e as Error).message.split('\n')[0]);
  await A.page.screenshot({ path: path.join(OUT, '_errA.png') }).catch(() => undefined);
} finally {
  await A.close();
}

// ── التشغيل التاني: بيانات تجريبية (كل الشغل)
const B = await launch({ feedUrl });
const p = B.page;
try {
  await open(p);
  await btn(p, 'شركة جديدة').click();
  await fillCompany(p);
  await p.locator('.demo-check input').check();
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').click({ timeout: 30000 });
  await p.locator('.sidebar').waitFor();
  await style(p);
  await snap(p, 'dash', { poultry: nav(p, 'الفروج والتوزيع'), items: nav(p, 'المواد'), sale: nav(p, 'فاتورة مبيع'), pos: nav(p, 'نقطة البيع'), debts: nav(p, 'الديون'), reports: nav(p, 'التقارير'), production: nav(p, 'الإنتاج'), stock: nav(p, 'الجرد وعمليات المخزون'), side: p.locator('.sidebar nav') }, 1200);

  await step('board', async () => {
    await nav(p, 'الفروج والتوزيع').click();
    await p.locator('table.price-board').waitFor();
    const r0 = p.locator('table.price-board tbody tr').first();
    await style(p);
    await snap(p, 'board', {
      tab: btn(p, 'تسعيرة اليوم'),
      table: p.locator('table.price-board'),
      whole: p.locator('table.price-board thead th').nth(2),
      cons: p.locator('table.price-board thead th').nth(3),
      prev: p.locator('table.price-board thead th', { hasText: 'تسعيرة' }),
      cost: p.locator('table.price-board thead th', { hasText: 'الكلفة' }),
      w0: r0.locator('.num-input').nth(0),
      c0: r0.locator('.num-input').nth(1),
      save: btn(p, 'حفظ تسعيرة اليوم'),
      copy: btn(p, 'نسخ للواتساب'),
      date: field(p, 'تاريخ التسعيرة'),
    }, 900);
    await r0.locator('.num-input').nth(0).fill('290');
    await r0.locator('.num-input').nth(1).fill('310');
    await snap(p, 'board_edit', { w0: r0.locator('.num-input').nth(0), c0: r0.locator('.num-input').nth(1), save: btn(p, 'حفظ تسعيرة اليوم'), copy: btn(p, 'نسخ للواتساب') }, 400);
  });

  await step('load', async () => {
    await btn(p, 'استلام حمولة').click();
    await p.waitForTimeout(600);
    const party = field(p, 'المدجنة');
    await party.locator('input').first().click();
    await p.locator('.picker-list li').first().click();
    const item = field(p, 'الصنف');
    await item.locator('input').first().click();
    await p.locator('.picker-list li', { hasText: 'فروج' }).first().click();
    await field(p, 'سعر الكيلو').locator('input').fill('245');
    await style(p);
    await snap(p, 'load', { party, item, price: field(p, 'سعر الكيلو'), weigh: p.locator('.weigh-summary button.primary'), extras: p.locator('h3', { hasText: 'مع الحمولة' }), pay: field(p, 'الدفع'), save: p.locator('.form-actions button.primary').first() });
    await p.locator('.weigh-summary button.primary').click();
    const m = p.locator('.modal').last();
    await m.waitFor();
    const inp = m.getByPlaceholder('99 أو 99+110+114');
    for (const w of ['412', '398.5', '405', '420.5', '388', '401']) {
      await inp.fill(w);
      await inp.press('Enter');
    }
    await field(m, 'عدد الأقفاص الفاضية').locator('input').fill('60');
    await field(m, 'وزن القفص الفاضي').locator('input').fill('7');
    await field(m, 'عدد الطيور').locator('input').fill('840').catch(() => undefined);
    await field(m, 'النافق').locator('input').fill('6').catch(() => undefined);
    await style(p);
    await snap(p, 'weigh', { modal: m, input: field(m, 'الوزنة'), list: m.locator('.weights, .weigh-list, table').first(), boxes: field(m, 'عدد الأقفاص الفاضية'), tare: field(m, 'وزن القفص الفاضي'), birds: field(m, 'عدد الطيور'), dead: field(m, 'النافق'), sum: m.locator('.kv, .weigh-sum, .weigh-totals').last(), save: m.locator('button.primary').last() });
    await m.locator('button.primary').last().click();
    await m.waitFor({ state: 'detached' });
    await bottom(p);
    await style(p);
    await snap(p, 'load_filled', { summary: p.locator('.weigh-summary'), extras: p.locator('button.small', { hasText: 'صنف مع الحمولة' }), kv: p.locator('.kv.wide').first(), pay: field(p, 'الدفع'), save: p.locator('.form-actions button.primary').first() });
    await p.locator('.form-actions button.primary').first().click();
    await p.waitForTimeout(900);
    await bottom(p);
    await style(p);
    await snap(p, 'load_list', { table: p.locator('table.table').last(), head: p.locator('table.table').last().locator('thead') });
  });

  await step('sale', async () => {
    await nav(p, 'فاتورة مبيع').click();
    await p.getByPlaceholder('ابحث عن مادة...').first().waitFor();
    const party = field(p, 'العميل');
    await party.locator('input').first().click();
    await p.locator('.picker-list li').first().click();
    await p.getByPlaceholder('ابحث عن مادة...').last().fill('فروج');
    await p.locator('.picker-list li', { hasText: 'فروج' }).first().click();
    await p.waitForTimeout(300);
    const row = p.locator('table.table').first().locator('tbody tr').first();
    await top(p);
    await style(p);
    await snap(p, 'sale', { party, row, qty: row.locator('.qty-cell input'), wbtn: row.locator('.qty-cell button'), price: row.locator('.num-input').nth(1) });
    await row.locator('.qty-cell button').click();
    const m = p.locator('.modal').last();
    await m.waitFor();
    const inp = m.getByPlaceholder('99 أو 99+110+114');
    for (const w of ['29.5', '30', '28.5', '31']) {
      await inp.fill(w);
      await inp.press('Enter');
    }
    await field(m, 'عدد الأقفاص الفاضية').locator('input').fill('4');
    await field(m, 'وزن القفص الفاضي').locator('input').fill('7');
    await style(p);
    await snap(p, 'sale_weigh', { modal: m, input: field(m, 'الوزنة'), boxes: field(m, 'عدد الأقفاص الفاضية'), save: m.locator('button.primary').last() });
    await m.locator('button.primary').last().click();
    await m.waitFor({ state: 'detached' });
    await top(p);
    await snap(p, 'sale_filled', { row, qty: row.locator('.qty-cell') });
    const pay = p.locator('.pay-switch');
    await bottom(p);
    await style(p);
    await snap(p, 'sale_bottom', { totals: p.locator('.totals').first(), pay, cash: pay.getByRole('button').nth(0), credit: pay.getByRole('button').nth(1), partial: pay.getByRole('button').nth(2), save: btn(p, /حفظ الفاتورة/) });
    await pay.getByRole('button').nth(1).click();
    await btn(p, /حفظ الفاتورة/).click();
    await btn(p, 'حذف الفاتورة').waitFor({ timeout: 10000 });
    await style(p);
    await snap(p, 'sale_view', { doc: p.locator('.paper-preview, .doc, .print-area').first(), prev: p.getByText(/الحساب السابق|الرصيد السابق/).first(), print: btn(p, /طباعة/) }, 1000);
  });

  await step('debts', async () => {
    await nav(p, 'الديون').click();
    await p.locator('.debt-stats').waitFor();
    const drow = p.locator('.card table tbody tr').first();
    await style(p);
    await snap(p, 'debts', { nav: nav(p, 'الديون'), owed: p.locator('.debt-stats .stat', { hasText: 'ديون لنا' }), owe: p.locator('.debt-stats .stat', { hasText: 'ديون علينا' }), table: p.locator('.card table').first(), row: drow, receive: drow.getByRole('button', { name: 'تسجيل قبض' }), details: drow.getByRole('button', { name: 'التفاصيل' }) }, 900);
    await drow.getByRole('button', { name: 'التفاصيل' }).click();
    const m = p.locator('.modal').last();
    await m.waitFor();
    await style(p);
    await snap(p, 'debt_detail', { modal: m, table: m.locator('table').first(), wa: m.getByRole('button', { name: /واتساب|تذكير/ }) }, 700);
    await p.keyboard.press('Escape');
  });

  await step('pos', async () => {
    await nav(p, 'نقطة البيع').click();
    await p.locator('.pos-item').first().waitFor();
    await p.locator('.pos-item').first().click();
    await p.waitForTimeout(400);
    await style(p);
    await snap(p, 'pos', { tiles: p.locator('.pos-tile').first(), cart: p.locator('.pos-cart, .cart').first(), pay: btn(p, 'دفع نقداً') }, 800);
    await p.keyboard.press('Escape').catch(() => undefined);
  });

  await step('production', async () => {
    await nav(p, 'الإنتاج').click();
    await p.waitForTimeout(800);
    await style(p);
    await snap(p, 'production', { nav: nav(p, 'الإنتاج'), main: p.locator('.page').first() }, 600);
  });

  await step('damage', async () => {
    await nav(p, 'الجرد وعمليات المخزون').click();
    await p.waitForTimeout(600);
    await btn(p, 'تالف / استهلاك').click();
    await p.waitForTimeout(600);
    await style(p);
    await snap(p, 'damage', { nav: nav(p, 'الجرد وعمليات المخزون'), tab: btn(p, 'تالف / استهلاك'), main: p.locator('.page').first() }, 500);
  });

  await step('summary', async () => {
    await nav(p, 'الفروج والتوزيع').click();
    await btn(p, 'ملخص اليوم').click();
    await p.waitForTimeout(800);
    await style(p);
    const tb = p.locator('table.table').first();
    await snap(p, 'summary', { tab: btn(p, 'ملخص اليوم'), date: p.locator('.toolbar .with-button').first(), stats: p.locator('.stats').first(), table: tb, bought: tb.locator('thead th', { hasText: 'اشترينا' }), sold: tb.locator('thead th', { hasText: 'بعنا' }), sales: tb.locator('thead th', { hasText: 'المبيعات' }), profit: tb.locator('thead th', { hasText: 'الربح' }), left: tb.locator('thead th', { hasText: 'الباقي' }) }, 800);
  });

  await step('reports', async () => {
    await nav(p, 'التقارير').click();
    await p.waitForTimeout(900);
    await style(p);
    await snap(p, 'reports', { nav: nav(p, 'التقارير'), main: p.locator('.page').first() }, 600);
  });

  await step('home', async () => {
    await nav(p, 'الرئيسية').click();
    await p.waitForTimeout(800);
    await style(p);
    await snap(p, 'home', { profit: p.locator('.daily-profit'), stats: p.locator('.stats').first() }, 800);
  });
} catch (e) {
  errs.push('B ' + (e as Error).message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, '_errB.png') }).catch(() => undefined);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await B.close();
  feedServer.close();
}
