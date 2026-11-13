// لقطات الحلقة 5 (الصندوق وكشف الحساب ومراقبة المواد): البرنامج الحقيقي (Electron، 1600×1000) بشركة سوبرماركت تجريبية.
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/guide-05/capture.mts <outdir>
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

const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-g5': { status: 'active' } } };
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
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-g5', customer: 'ماركت النور', machineId, plan: 'annual' }, devKey));
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
  await snap(p, 'dash', { cash: nav(p, 'الصندوق'), st: nav(p, 'كشف الحساب'), iw: nav(p, 'مراقبة المواد'), side: p.locator('.sidebar nav') }, 1500);

  const call = (method: string, ...args: unknown[]) => p.evaluate(([m, a]) => (window as any).mizan.invoke('company:call', m, a), [method, args] as const);
  const sel = (label: string) => p.locator(`select[aria-label="${label}"]`).first();

  // ── الصندوق ──
  await nav(p, 'الصندوق').click();
  await p.locator('.cash-cards').waitFor();
  await style(p);
  const card = (i: number) => p.locator('.cash-card').nth(i);
  await snap(p, 'cash0', {
    nav: nav(p, 'الصندوق'),
    cards: p.locator('.cash-cards'),
    syp: card(0), usd: card(2), bank: card(1),
    today: card(0).locator('.cash-line small').first(),
    period: p.locator('.period-picker').first(),
    table: p.locator('table.statement').first(),
    row: p.locator('table.statement tbody tr').nth(1),
    zero: btn(p, /تصفير الصندوق/),
  }, 1200);
  await p.locator('.period-picker button', { hasText: 'هالشهر' }).first().click();
  await p.waitForTimeout(400);
  await snap(p, 'cash_month', { period: p.locator('.period-picker').first(), month: p.locator('.period-picker button', { hasText: 'هالشهر' }).first(), custom: p.locator('.period-picker button', { hasText: 'من تاريخ لتاريخ' }).first(), table: p.locator('table.statement').first() });
  await btn(p, /تصفير الصندوق/).click();
  const zm = p.locator('.modal').first();
  await zm.waitFor();
  await zm.locator('.field', { hasText: 'فراطة' }).locator('input').fill('5000');
  await snap(p, 'cash_zero', { modal: zm, to: zm.locator('.field', { hasText: 'لوين' }), keep: zm.locator('.field', { hasText: 'فراطة' }), save: zm.getByRole('button', { name: 'تصفير', exact: true }) });
  await p.keyboard.press('Escape');
  await zm.waitFor({ state: 'detached' });
  // صندوق الدولار بالسالب ← «ما في نقد» و«تصفير السالب»
  const usdBox = await p.evaluate(() => (window as any).mizan.invoke('company:state').then((r: any) => Object.values((r.state ?? r).accounts).find((a: any) => a.currency === 'USD' && /صندوق/.test(a.name))?.id));
  if (usdBox) await call('drawFromBox', { date: new Date().toISOString().slice(0, 10), from: usdBox, amount: 2500, currency: 'USD' });
  await p.waitForTimeout(500);
  const neg = p.locator('.cash-card', { hasText: 'ما في نقد' }).first();
  await neg.click();
  await p.waitForTimeout(500);
  await style(p);
  await snap(p, 'cash_neg', { card: neg, fill: btn(p, 'تصفير السالب'), last: p.locator('.stats .stat', { hasText: 'آخر المدة' }).first() });

  // ── كشف الحساب ──
  await nav(p, 'كشف الحساب').click();
  await p.locator('.statement-target').waitFor();
  await style(p);
  await snap(p, 'st0', { nav: nav(p, 'كشف الحساب'), modes: p.locator('.page .segmented').first(), party: p.locator('.statement-target .picker input').first(), account: p.locator('.page .segmented button', { hasText: 'حساب' }).first() }, 900);
  const pin = p.locator('.statement-target .picker input').first();
  await pin.click();
  await pin.fill('مطعم');
  await p.locator('.picker-list li').first().click();
  await p.locator('.period-picker button', { hasText: 'الكل' }).first().click();
  await p.waitForTimeout(600);
  await style(p);
  const strow = p.locator('table.statement tbody tr.clickable').first();
  await snap(p, 'st1', {
    party: p.locator('.statement-target').first(),
    stats: p.locator('.stats').first(),
    opening: p.locator('table.statement tbody tr.group-row').first(),
    table: p.locator('table.statement').first(),
    row: strow,
    running: strow.locator('td').last(),
    closing: p.locator('table.statement tfoot tr').first(),
    print: btn(p, 'طباعة'), pdf: btn(p, 'PDF', true),
  }, 900);
  await strow.click();
  await p.waitForTimeout(900);
  await style(p);
  await snap(p, 'st_inv', { doc: p.locator('.invoice-doc, .print-area').first() });
  await nav(p, 'كشف الحساب').click();
  await p.waitForTimeout(600);

  // ── مراقبة المواد ──
  await nav(p, 'مراقبة المواد').click();
  await p.locator('table.item-watch').waitFor();
  await p.locator('.period-picker button', { hasText: 'هالشهر' }).first().click().catch(() => undefined);
  await p.waitForTimeout(500);
  await style(p);
  const wrow = p.locator('table.item-watch tbody tr').first();
  await snap(p, 'iw0', {
    nav: nav(p, 'مراقبة المواد'),
    stats: p.locator('.stats').first(),
    losing: p.locator('.stats .stat', { hasText: 'عم تخسر' }).first(),
    table: p.locator('table.item-watch').first(),
    row: wrow,
    cols: p.locator('table.item-watch thead').first(),
    profit: wrow.locator('td').nth(7),
    sort: sel('الترتيب'),
  }, 900);
  await sel('الترتيب').selectOption({ label: 'الأكثر ربحاً' }).catch(async () => { await sel('الترتيب').selectOption({ index: 1 }); });
  await p.waitForTimeout(500);
  await snap(p, 'iw_sorted', { sort: sel('الترتيب'), table: p.locator('table.item-watch').first(), row: p.locator('table.item-watch tbody tr').first() });
  await p.locator('table.item-watch tbody tr').first().click();
  await p.waitForTimeout(800);
  await style(p);
  await snap(p, 'iw_item', { stats: p.locator('.stats').first(), table: p.locator('.page table').last(), row: p.locator('.page table tbody tr').nth(1), back: p.locator('.page button.ghost').first() }, 900);
} catch (e) {
  errs.push('APP ' + (e as Error).message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, '_error.png') }).catch(() => undefined);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await A.close();
  feedServer.close();
}
