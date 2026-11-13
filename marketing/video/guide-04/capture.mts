// لقطات الحلقة 4 (نقطة البيع والتقارير والأرباح): البرنامج الحقيقي (Electron، 1600×1000) بشركة سوبرماركت تجريبية.
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/guide-04/capture.mts <outdir>
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

const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-g4': { status: 'active' } } };
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
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-g4', customer: 'ماركت النور', machineId, plan: 'annual' }, devKey));
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
  await snap(p, 'dash', { pos: nav(p, 'نقطة البيع'), reports: nav(p, 'التقارير'), side: p.locator('.sidebar nav') }, 1500);

  // ── نقطة البيع ──
  await nav(p, 'نقطة البيع').click();
  await p.locator('.pos-grid').waitFor();
  await style(p);
  const tile = (i: number) => p.locator('.pos-item').nth(i);
  await snap(p, 'pos0', {
    nav: nav(p, 'نقطة البيع'),
    grid: p.locator('.pos-grid'),
    cats: p.locator('.pos-cats'),
    tile: tile(0),
    scan: p.locator('.pos-search input').first(),
    search: p.getByPlaceholder('بحث بالاسم...'),
    cart: p.locator('.pos-cart'),
  }, 1000);
  await tile(0).click();
  await p.waitForTimeout(250);
  await tile(2).click();
  await p.waitForTimeout(250);
  await snap(p, 'pos1', { tile: tile(2), lines: p.locator('.pos-lines'), cart: p.locator('.pos-cart') });
  await p.getByPlaceholder('بحث بالاسم...').fill('شا');
  await p.waitForTimeout(400);
  await snap(p, 'pos_search', { search: p.getByPlaceholder('بحث بالاسم...'), grid: p.locator('.pos-grid'), tile: tile(0) });
  await tile(0).click();
  await p.getByPlaceholder('بحث بالاسم...').fill('');
  await p.waitForTimeout(300);
  const line0 = p.locator('.pos-line-wrap').first();
  await line0.locator('.qty-box button', { hasText: '+' }).click();
  await p.waitForTimeout(250);
  await style(p);
  await snap(p, 'pos_cart', {
    lines: p.locator('.pos-lines'),
    qty: line0.locator('.qty-box'),
    discount: p.locator('.pos-totals input').first(),
    totals: p.locator('.pos-totals'),
    received: p.locator('.pos-totals input.big-input, .pos-totals input').last(),
    exact: btn(p, 'مضبوط', true),
    cash: btn(p, 'دفع نقداً'),
    credit: btn(p, 'على الحساب'),
    hold: btn(p, /تعليق الفاتورة/),
    party: p.locator('.pos-head .picker input').first(),
    cart: p.locator('.pos-cart'),
  });
  await p.locator('.pos-totals input.big-input').first().fill('20000');
  await p.waitForTimeout(400);
  await snap(p, 'pos_change', { received: p.locator('.pos-totals input.big-input').first(), change: p.locator('.pos-totals strong.good').first(), totals: p.locator('.pos-totals'), cash: btn(p, 'دفع نقداً'), exact: btn(p, 'مضبوط', true) });
  await btn(p, 'دفع نقداً').click();
  await p.waitForTimeout(1200);
  await style(p);
  await snap(p, 'pos_done', { cart: p.locator('.pos-cart'), reprint: btn(p, /إعادة طباعة/) }, 600);
  // تعليق فاتورة
  await tile(1).click();
  await tile(3).click();
  await p.waitForTimeout(300);
  await snap(p, 'pos_hold0', { hold: btn(p, /تعليق الفاتورة/), lines: p.locator('.pos-lines') });
  await btn(p, /تعليق الفاتورة/).click();
  await p.waitForTimeout(600);
  await style(p);
  await snap(p, 'pos_held', { held: p.locator('.held-bar'), chip: p.locator('.held-chip').first(), cart: p.locator('.pos-cart') });
  // على الحساب: زبون من القائمة
  await tile(4).click();
  await p.waitForTimeout(250);
  const partyIn = p.locator('.pos-head .picker input').first();
  await partyIn.click();
  await partyIn.fill('مطعم');
  await p.locator('.picker-list li').first().click().catch(() => undefined);
  await p.waitForTimeout(400);
  await style(p);
  await snap(p, 'pos_credit', { party: p.locator('.pos-head .picker').first(), credit: btn(p, 'على الحساب'), lines: p.locator('.pos-lines') });

  // ── الرئيسية: الربح اليومي ──
  await nav(p, 'الرئيسية').click();
  await p.locator('.daily-profit').waitFor();
  await style(p);
  await p.locator('.daily-profit').scrollIntoViewIfNeeded();
  await p.evaluate(() => { const c = document.querySelector('.daily-profit'); c?.scrollIntoView({ block: 'center' }); });
  await snap(p, 'dash_profit', {
    card: p.locator('.daily-profit'),
    net: p.locator('.dp-net'),
    kv: p.locator('.dp-kv'),
    nav: p.locator('.dp-nav'),
    prev: p.locator('.dp-nav button').first(),
  }, 900);
  await p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop > 0) e.scrollTop = 0; });

  // ── التقارير ──
  await nav(p, 'التقارير').click();
  await p.locator('.segmented.tabs').waitFor();
  const tab = (t: string) => p.locator('.segmented.tabs button', { hasText: t }).first();
  await tab('إغلاق اليوم').click();
  await style(p);
  await snap(p, 'rep_daily', { nav: nav(p, 'التقارير'), tabs: p.locator('.segmented.tabs'), tab: tab('إغلاق اليوم'), body: p.locator('.page .card').first(), print: btn(p, 'طباعة'), paper: p.locator('.paper-select').first() }, 900);
  await tab('الأرباح والخسائر').click();
  await style(p);
  await snap(p, 'rep_income', { tab: tab('الأرباح والخسائر'), period: p.locator('.toolbar.period'), stats: p.locator('.stats').first(), net: p.locator('.stats .stat').last() }, 900);
  await tab('أرباح المواد').click();
  await style(p);
  await snap(p, 'rep_items', { tab: tab('أرباح المواد'), table: p.locator('.page table').first(), row: p.locator('.page table tbody tr').first(), last: p.locator('.page table tbody tr').last() }, 900);
  await tab('المخزون').click();
  await style(p);
  await snap(p, 'rep_stock', { tab: tab('المخزون'), stats: p.locator('.stats').first(), table: p.locator('.page table').first(), low: p.locator('.page table tbody td.bad').first(), print: btn(p, 'طباعة'), pdf: btn(p, 'PDF', true), excel: btn(p, 'Excel', true) }, 900);
} catch (e) {
  errs.push('APP ' + (e as Error).message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, '_error.png') }).catch(() => undefined);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await A.close();
  feedServer.close();
}
