// لقطات الفيديو التالت (فاتورة الشراء والديون): البرنامج الحقيقي (Electron، 1600×1000) بشركة سوبرماركت تجريبية.
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/guide-03/capture.mts <outdir>
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

const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-g3': { status: 'active' } } };
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
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-g3', customer: 'ماركت النور', machineId, plan: 'annual' }, devKey));
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

  await snap(p, 'dash2', { purchase: nav(p, 'فاتورة شراء'), debts: nav(p, 'الديون') }, 300);

  // ── فاتورة شراء ──
  await nav(p, 'فاتورة شراء').click();
  await p.getByPlaceholder('ابحث عن مادة...').first().waitFor();
  await style(p);
  const top = () => p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop > 0) e.scrollTop = 0; });
  const bottom = () => p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 5 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; });
  const party = field(p, 'المورد');
  await snap(p, 'pur_empty', { nav: nav(p, 'فاتورة شراء'), party, plus: party.locator('button').last(), scan: p.locator('input[placeholder*="امسح"]').first(), item: p.getByPlaceholder('ابحث عن مادة...').first() });
  await party.locator('input').first().fill('النجمة');
  await p.locator('.picker-list li', { hasText: 'النجمة' }).first().click();
  for (const [q, name] of [['رز', 'رز مصري'], ['سكر', 'سكر 1'], ['شاي', 'شاي أسود']] as const) {
    await p.getByPlaceholder('ابحث عن مادة...').last().fill(q);
    await p.locator('.picker-list li', { hasText: name }).first().click();
    await p.waitForTimeout(250);
  }
  const lines = p.locator('table.table').first();
  const row = (i: number) => lines.locator('tbody tr').nth(i);
  for (const [i, q, pr] of [[0, '40', '1400'], [1, '30', '930'], [2, '24', '2950']] as const) {
    await row(i).locator('.num-input').nth(0).fill(q);
    await row(i).locator('.num-input').nth(1).fill(pr);
  }
  await style(p);
  await top();
  await snap(p, 'pur_lines', { party, lines, item: p.getByPlaceholder('ابحث عن مادة...').last(), scan: p.locator('input[placeholder*="امسح"]').first(), qty: row(0).locator('.num-input').nth(0), price: row(0).locator('.num-input').nth(1), prices: lines.locator('thead th', { hasText: 'السعر' }) });
  const pay = p.locator('.pay-switch');
  await bottom();
  await snap(p, 'pur_bottom', { totals: p.locator('.totals').first(), pay, cash: pay.getByRole('button').nth(0), credit: pay.getByRole('button').nth(1), partial: pay.getByRole('button').nth(2), save: btn(p, /حفظ الفاتورة/) });
  await pay.getByRole('button').nth(2).click();
  await p.locator('.totals input[placeholder="0"]').first().fill('50000');
  await bottom();
  await snap(p, 'pur_partial', { partial: pay.getByRole('button').nth(2), paid: p.locator('.totals input[placeholder="0"]').first(), totals: p.locator('.totals').first(), save: btn(p, /حفظ الفاتورة/) });
  await btn(p, /حفظ الفاتورة/).click();
  await btn(p, 'حذف الفاتورة').waitFor({ timeout: 10000 });
  await style(p);
  await snap(p, 'pur_view', { edit: btn(p, 'تعديل', true), doc: p.locator('.doc, .commercial-doc, .print-area').first() }, 1000);

  // ── الديون ──
  await nav(p, 'الديون').click();
  await p.locator('.debt-stats').waitFor();
  await style(p);
  const stat = (t: string) => p.locator('.debt-stats .stat', { hasText: t }).first();
  const drow = p.locator('.card table tbody tr').first();
  await snap(p, 'debts', {
    nav: nav(p, 'الديون'),
    owed: stat('ديون لنا'),
    owe: stat('ديون علينا'),
    net: stat('الصافي'),
    due: stat('مواعيد السداد'),
    newOwed: btn(p, 'تسجيل دين لنا'),
    newOwe: btn(p, 'تسجيل دين علينا'),
    table: p.locator('.card table').first(),
    row: drow,
    receive: drow.getByRole('button', { name: 'تسجيل قبض' }),
    details: drow.getByRole('button', { name: 'التفاصيل' }),
  }, 1000);
  await btn(p, 'تسجيل دين لنا').click();
  const m = p.locator('.modal').first();
  await m.waitFor();
  await m.locator('.field', { hasText: 'المبلغ' }).first().locator('input').fill('150000');
  await snap(p, 'debt_new', { modal: m, person: m.locator('.field', { hasText: 'الشخص' }).first(), amount: m.locator('.field', { hasText: 'المبلغ' }).first(), reasons: m.locator('.reason-cards'), old: m.locator('.reason', { hasText: 'دين سابق' }), cash: m.locator('.reason').nth(1) });
  await p.keyboard.press('Escape');
  await m.waitFor({ state: 'detached' });
  await drow.getByRole('button', { name: 'تسجيل قبض' }).click();
  const m2 = p.locator('.modal').first();
  await m2.waitFor();
  await m2.locator('.field', { hasText: 'المبلغ' }).first().locator('input').fill('5000');
  await snap(p, 'debt_pay', { modal: m2, amount: m2.locator('.field', { hasText: 'المبلغ' }).first(), save: m2.locator('button.primary.big') });
  await p.keyboard.press('Escape');
  await m2.waitFor({ state: 'detached' });
  await p.locator('.debt-toolbar .segmented button', { hasText: 'لهم علينا' }).click();
  await p.waitForTimeout(400);
  const orow = p.locator('.card table tbody tr').first();
  await snap(p, 'debts_owe', { tab: p.locator('.debt-toolbar .segmented button', { hasText: 'لهم علينا' }), row: orow, pay: orow.getByRole('button', { name: 'تسجيل دفع' }), table: p.locator('.card table').first() });
  await p.locator('.debt-toolbar .segmented button', { hasText: 'لنا عليهم' }).click();
  await p.waitForTimeout(400);
  await p.locator('.card table tbody tr').first().getByRole('button', { name: 'التفاصيل' }).click();
  const d = p.locator('.modal').first();
  await d.waitFor();
  const past = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  await d.locator('.debt-mini input[type=date]').fill(past);
  await p.waitForTimeout(600);
  await style(p);
  await snap(p, 'debt_detail', {
    modal: d,
    balance: d.locator('.debt-balance'),
    mini: d.locator('.debt-mini'),
    due: d.locator('.debt-mini .stat', { hasText: 'موعد السداد' }),
    reminder: d.getByRole('button', { name: /رسالة تذكير/ }),
    table: d.locator('table').last(),
    pay: d.getByRole('button', { name: 'تسجيل قبض' }),
  }, 900);
} catch (e) {
  errs.push('APP ' + (e as Error).message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, '_error.png') }).catch(() => undefined);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await A.close();
  feedServer.close();
}
