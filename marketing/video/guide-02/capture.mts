// لقطات الفيديو التاني (المواد وأول فاتورة مبيع): البرنامج الحقيقي (Electron، 1600×1000) بشركة سوبرماركت تجريبية.
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/guide-02/capture.mts <outdir>
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

const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-g2': { status: 'active' } } };
const feedServer = http.createServer((_q, r) => r.end(signFeed(feed, devKey)));
await new Promise<void>((r) => feedServer.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.txt`;
const style = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' }).catch(() => undefined);
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (p: Page, label: string | RegExp) => p.locator('.field', { hasText: label }).first();
const nav = (p: Page, label: string) => p.locator('.sidebar nav a, .sidebar nav button', { hasText: label }).first();
const A = await launch({ feedUrl });
const p = A.page;
try {
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  const machineId = (await p.locator('.big-code').first().innerText()).trim();
  fs.writeFileSync(path.join(OUT, 'fp.txt'), machineId);
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-g2', customer: 'ماركت النور', machineId, plan: 'annual' }, devKey));
  await btn(p, 'تفعيل', true).click();
  await btn(p, 'شركة جديدة').click();
  await p.locator('.activity', { hasText: 'سوبرماركت' }).first().click();
  await field(p, 'اسم الشركة').locator('input').fill('ماركت النور');
  await field(p, 'الهاتف').locator('input').fill('0944 123 456');
  await field(p, 'اسمك').locator('input').fill('أبو محمد');
  await field(p, 'كلمة السر (6').locator('input').fill('secret123');
  await field(p, 'تأكيد كلمة السر').locator('input').fill('secret123');
  await p.locator('.demo-check input').check();
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').click({ timeout: 30000 });
  await p.locator('.sidebar').waitFor();
  await style(p);
  await snap(p, 'dash', { items: nav(p, 'المواد'), sale: nav(p, 'فاتورة مبيع'), side: p.locator('.sidebar nav') }, 1500);

  // ── المواد ──
  await nav(p, 'المواد').click();
  await p.locator('table.table').first().waitFor();
  const table = p.locator('table.table').first();
  await snap(p, 'items', { newItem: btn(p, /صنف جديد|مادة جديدة/), import: btn(p, 'استيراد من Excel'), search: p.locator('.toolbar input').first(), table, nav: nav(p, 'المواد'), qtyCol: table.locator('thead th', { hasText: 'الرصيد' }), priceCol: table.locator('thead th', { hasText: 'سعر المبيع' }) });
  await btn(p, /صنف جديد|مادة جديدة/).click();
  const modal = p.locator('.modal').first();
  await modal.waitFor();
  await field(p, /^الاسم/).locator('input').fill('زيت زيتون بكر 1 لتر');
  await field(p, 'التصنيف').locator('input, select').first().fill('مواد غذائية').catch(() => field(p, 'التصنيف').locator('select').selectOption({ index: 1 }));
  await field(p, 'الباركود').locator('input').first().fill('6210001000079');
  await snap(p, 'form_basic', { tabs: modal.locator('.tabs'), name: field(p, /^الاسم/), code: field(p, 'الرمز'), barcode: field(p, 'الباركود'), category: field(p, 'التصنيف'), pricesTab: btn(p, 'الأسعار والوحدات'), modal });
  await btn(p, 'الأسعار والوحدات').click();
  await field(p, 'الوحدة الأساسية').locator('input').fill('قطعة');
  await field(p, 'سعر المبيع (مفرق)').locator('input').fill('9500');
  await field(p, 'سعر الجملة').locator('input').fill('9000');
  await field(p, 'الحد الأدنى للتنبيه').locator('input').fill('6');
  await btn(p, '+ وحدة').click();
  const urow = modal.locator('table.compact tbody tr').first();
  await urow.locator('input').nth(0).fill('كرتونة');
  await urow.locator('input').nth(1).fill('12');
  await urow.locator('input').nth(2).fill('105000');
  await snap(p, 'form_prices', {
    unit: field(p, 'الوحدة الأساسية'),
    cur: field(p, 'عملة السعر'),
    price: field(p, 'سعر المبيع (مفرق)'),
    whole: field(p, 'سعر الجملة'),
    min: field(p, 'الحد الأدنى للتنبيه'),
    units: modal.locator('table.compact'),
    save: modal.getByRole('button', { name: 'حفظ', exact: true }),
    modal,
  });
  await modal.getByRole('button', { name: 'حفظ', exact: true }).click();
  await modal.waitFor({ state: 'detached' });
  await style(p);
  await p.locator('.toolbar input').first().fill('زيت');
  await snap(p, 'items_search', { search: p.locator('.toolbar input').first(), row: table.locator('tbody tr', { hasText: 'زيت زيتون' }), table, import: btn(p, 'استيراد من Excel') });
  await p.locator('.toolbar input').first().fill('');

  // ── فاتورة مبيع ──
  await nav(p, 'فاتورة مبيع').click();
  await p.getByPlaceholder('ابحث عن مادة...').first().waitFor();
  await style(p);
  const pay = p.locator('.pay-switch');
  await snap(p, 'sale_empty', { nav: nav(p, 'فاتورة مبيع'), party: field(p, 'العميل'), scan: p.locator('.scan-input, input[placeholder*="امسح"]').first(), item: p.getByPlaceholder('ابحث عن مادة...').first() });
  await field(p, 'العميل').locator('input').first().fill('أبو خالد');
  await p.locator('.picker-list li', { hasText: 'أبو خالد' }).first().click();
  for (const [q, name] of [['زيت دوار', 'زيت دوار الشمس'], ['رز', 'رز مصري'], ['شاي', 'شاي أسود']] as const) {
    const box = p.getByPlaceholder('ابحث عن مادة...').last();
    await box.fill(q);
    await p.locator('.picker-list li', { hasText: name }).first().click();
    await p.waitForTimeout(250);
  }
  const lines = p.locator('table.table').first();
  await lines.locator('tbody tr').nth(1).locator('.num-input').first().fill('3');
  await lines.locator('tbody tr').nth(0).locator('.num-input').first().fill('2');
  await lines.locator('tbody tr').nth(2).locator('.num-input').first().fill('2');
  await style(p);
  const top = () => p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop > 0) e.scrollTop = 0; });
  await top();
  await snap(p, 'sale_lines', {
    party: field(p, 'العميل'),
    lines: lines,
    item: p.getByPlaceholder('ابحث عن مادة...').last(),
    scan: p.locator('input[placeholder*="امسح"]').first(),
    qty: lines.locator('tbody tr').nth(1).locator('.num-input').nth(0),
    price: lines.locator('tbody tr').nth(1).locator('.num-input').nth(1),
    disc: lines.locator('tbody tr').nth(1).locator('.num-input').nth(2),
    totals: p.locator('.totals').first(),
    profit: p.locator('.profit-box').first(),
    pay,
    cash: pay.getByRole('button').nth(0),
    credit: pay.getByRole('button').nth(1),
    partial: pay.getByRole('button').nth(2),
    save: btn(p, /حفظ الفاتورة/),
  });
  const bottom = () => p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 5 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; });
  await bottom();
  await snap(p, 'sale_bottom', { totals: p.locator('.totals').first(), sum: p.locator('.totals .kv, .totals').first(), profit: p.locator('.profit-box').first(), pay, cash: pay.getByRole('button').nth(0), credit: pay.getByRole('button').nth(1), partial: pay.getByRole('button').nth(2), save: btn(p, /حفظ الفاتورة/) });
  await pay.getByRole('button').nth(2).click();
  await p.locator('.totals input[placeholder="0"]').first().fill('10000');
  await bottom();
  await snap(p, 'sale_partial', { partial: pay.getByRole('button').nth(2), paid: p.locator('.totals input[placeholder="0"]').first(), totals: p.locator('.totals').first(), save: btn(p, /حفظ الفاتورة/) });
  await btn(p, /حفظ الفاتورة/).click();
  await btn(p, 'حذف الفاتورة').waitFor({ timeout: 10000 });
  await style(p);
  const doc = p.locator('.doc, .commercial-doc, .print-area').first();
  await snap(p, 'invoice', {
    print: btn(p, /طباعة/),
    paper: p.locator('select').first(),
    pdf: btn(p, 'PDF', true),
    copy: btn(p, 'نسخ كنص'),
    edit: btn(p, 'تعديل', true),
    del: btn(p, 'حذف الفاتورة'),
    doc,
    prev: p.getByText('حساب سابق', { exact: true }).first().locator('..'),
    remain: p.getByText('الباقي بذمته', { exact: true }).first().locator('..'),
  }, 1200);
} catch (e) {
  errs.push('APP ' + (e as Error).message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, '_error.png') }).catch(() => undefined);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await A.close();
  feedServer.close();
}
