// لقطات الحلقة 7 (الاتصال المحلي والاتصال عن بعد): البرنامج الحقيقي بكمبيوترين (Electron، 1600×1000) وجوالين بالمتصفح (390×844).
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build، و MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts (www على 8790)،
// و MIZAN_TEST_BUILD=1 npm run build:web (web-dist على 8791)، ومحاكي Firestore على 127.0.0.1:8085.
// xvfb-run -a npx tsx marketing/video/guide-07/capture.mts <outdir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, devices, type Locator, type Page } from '@playwright/test';
import { launch } from '../../../tests/e2e/helpers';
import { issueLicense, signFeed, type LicenseFeed } from '../../../src/license/license';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const devKey = fs.readFileSync(path.join(ROOT, 'dev-keys/license-private.dev.pem'), 'utf8');
const OUT = path.resolve(process.argv[2]!);
const EMU = '127.0.0.1:8085';
const WWW = 'http://127.0.0.1:8790';
const WEB = 'http://127.0.0.1:8791';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, { file: string; phone?: boolean; targets: Record<string, Box> }> = {};
const errs: string[] = [];

async function snap(p: Page, name: string, targets: Record<string, Locator> = {}, wait = 700, phone = false) {
  await p.waitForTimeout(wait);
  // عنوان الحاوية مش شكل عنوان راوتر بالمحل
  await p.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue?.includes('192.0.2.')) n.nodeValue = n.nodeValue.replace(/192\.0\.2\.\d+/g, '192.168.1.10');
    for (const i of document.querySelectorAll('input')) if (i.value.includes('192.0.2.')) i.value = i.value.replace(/192\.0\.2\.\d+/g, '192.168.1.10');
  }).catch(() => undefined);
  const t: Record<string, Box> = {};
  for (const [k, loc] of Object.entries(targets)) {
    const bx = await loc.first().boundingBox({ timeout: 2500 }).catch(() => null);
    if (bx) t[k] = { x: Math.round(bx.x), y: Math.round(bx.y), w: Math.round(bx.width), h: Math.round(bx.height) };
    else errs.push(`no box ${name}.${k}`);
  }
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  states[name] = { file: `${name}.png`, ...(phone ? { phone: true } : {}), targets: t };
  console.log('snap', name, Object.keys(t).join(','));
}
const center = (l: Locator) => l.first().evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => undefined);
const psnap = (p: Page, name: string, targets: Record<string, Locator> = {}, wait = 700) => snap(p, name, targets, wait, true);

const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-g7': { status: 'active', cloud: true } } };
const feedServer = http.createServer((_q, r) => r.end(signFeed(feed, devKey)));
await new Promise<void>((r) => feedServer.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.txt`;
const style = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' }).catch(() => undefined);
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (p: Page, label: string | RegExp) => p.locator('.field', { hasText: label }).first();
const nav = (p: Page, label: string) => p.locator('.sidebar nav a, .sidebar nav button', { hasText: label }).first();
const tab = (p: Page, label: string) => p.locator('.segmented.tabs button', { hasText: label }).first();
// اسم الجهاز بقائمة «الأجهزة المتصلة» (بدل اسم الحاوية)
const hostName = (a: Awaited<ReturnType<typeof launch>>, n: string) =>
  a.app.evaluate((_e, name) => {
    (process as unknown as { getBuiltinModule: (m: string) => { hostname: () => string } }).getBuiltinModule('os').hostname = () => name;
  }, n);

const A = await launch({ feedUrl });
const p = A.page;
const B = await launch({ feedUrl });
const q = B.page;
const br = await chromium.launch();
let bHome = B.home;
try {
  await hostName(A, 'كمبيوتر المحل');
  await hostName(B, 'كاشير 2');
  for (const x of [p, q]) {
    await x.setViewportSize({ width: 1600, height: 1000 });
    await x.evaluate((e) => localStorage.setItem('wazn.cloudEmulator', e), EMU);
  }
  // ── A: الجهاز الرئيسي ──
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  const machineId = (await p.locator('.big-code').first().innerText()).trim();
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-g7', customer: 'ماركت النور', machineId, plan: 'annual', devices: 3 }, devKey));
  await btn(p, 'تفعيل', true).click();
  await btn(p, 'شركة جديدة').click();
  await p.locator('.activity', { hasText: 'سوبرماركت' }).first().click();
  await field(p, 'اسم الشركة').locator('input').fill('ماركت النور');
  await field(p, 'الهاتف').locator('input').fill('0944 123 456');
  await field(p, 'اسمك').locator('input').fill('أبو محمد');
  await field(p, 'اسم الدخول').locator('input').fill('abumohammad');
  await field(p, 'كلمة السر (6').locator('input').fill('secret123');
  await field(p, 'تأكيد كلمة السر').locator('input').fill('secret123');
  await p.locator('.demo-check input').check();
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').click({ timeout: 30000 });
  await p.locator('.sidebar').waitFor();
  await style(p);
  await snap(p, 'dash', { settings: nav(p, 'الإعدادات'), side: p.locator('.sidebar nav') }, 1500);

  // ── الشبكة المحلية ──
  await nav(p, 'الإعدادات').click();
  await p.locator('.segmented.tabs').waitFor();
  await tab(p, 'الشبكة المحلية').click();
  await p.waitForTimeout(800);
  await style(p);
  const lanCheck = p.locator('label.check', { hasText: 'تفعيل وضع الخادم' });
  await snap(p, 'lan0', { nav: nav(p, 'الإعدادات'), tab: tab(p, 'الشبكة المحلية'), check: lanCheck, card: p.locator('.page section.card').first() });
  await lanCheck.locator('input').check();
  await p.locator('.lan-info .big-code').waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  const lanTargets = () => ({
    check: lanCheck,
    info: p.locator('.lan-info'),
    addr: p.locator('.lan-info strong').first(),
    code: p.locator('.lan-info .big-code'),
    qr: p.locator('.lan-qr'),
    devices: p.locator('.lan-info strong').last(),
    newcode: btn(p, 'تغيير رمز الربط'),
    fw: p.locator('.page p.muted', { hasText: 'جدار حماية' }),
  });
  await snap(p, 'lan1', lanTargets());
  const lanCode = (await p.locator('.lan-info .big-code').innerText()).trim();
  const lanAddr = (await p.locator('.lan-info strong').first().innerText()).split(/\s+أو\s+/)[0]!.trim();
  const lanPort = (await p.locator('.lan-info strong').nth(1).innerText()).trim();

  // ── B: الكمبيوتر التاني (بدون ترخيص خاص) ──
  await q.getByText('جهاز فرعي أو متصل عن بعد؟').waitFor({ timeout: 20000 });
  await style(q);
  await center(q.locator('.lock-card'));
  await snap(q, 'b_lock', { lan: btn(q, 'على نفس الشبكة'), cloud: btn(q, 'اتصال عن بعد'), card: q.locator('.lock-card') });
  await btn(q, 'على نفس الشبكة').click();
  const found = q.locator('.lan-found button', { hasText: 'ماركت النور' }).first();
  await found.waitFor({ timeout: 15000 });
  await center(q.locator('.lan-found'));
  await snap(q, 'b_find', { found, search: q.locator('.lan-found button').first(), card: q.locator('.lock-card') });
  await found.click();
  await field(q, 'رمز الربط').locator('input').fill(lanCode);
  await center(field(q, 'رمز الربط'));
  await snap(q, 'b_code', { found, code: field(q, 'رمز الربط'), host: field(q, 'عنوان الجهاز الرئيسي') });
  await field(q, 'اسم المستخدم').locator('input').fill('abumohammad');
  await field(q, 'كلمة السر').locator('input').fill('secret123');
  await center(field(q, 'كلمة السر'));
  await snap(q, 'b_login', { user: field(q, 'اسم المستخدم'), pass: field(q, 'كلمة السر'), go: btn(q, 'اتصال', true) });
  await btn(q, 'اتصال', true).click();
  await q.locator('.user-chip').filter({ hasText: 'متصل بالجهاز الرئيسي' }).waitFor({ timeout: 20000 });
  await q.evaluate(() => localStorage.setItem('mizan.tour.off', '1'));
  await style(q);
  await snap(q, 'b_dash', { chip: q.locator('.user-chip') }, 1500);
  // B بيعمل فاتورة من نقطة البيع، وبتطلع على A
  await nav(q, 'نقطة البيع').click().catch(() => undefined);
  await q.waitForTimeout(1200);
  await style(q);
  const item = q.locator('.pos-item').first();
  if (await item.count()) {
    await item.click();
    await q.locator('.pos-item').nth(1).click().catch(() => undefined);
    await q.waitForTimeout(500);
    await snap(q, 'b_pos', { pay: btn(q, /دفع نقداً|نقداً/), cart: q.locator('.pos-cart, .cart').first() });
    await btn(q, /دفع نقداً|نقداً/).click().catch((e: Error) => errs.push('pay ' + e.message.split('\n')[0]));
    await q.waitForTimeout(1200);
  } else errs.push('no pos items');
  await nav(p, 'سجل الفواتير').click();
  await p.waitForTimeout(1500);
  await style(p);
  await snap(p, 'a_log', { row: p.locator('.page table tbody tr').first(), table: p.locator('.page table').first() });
  await nav(p, 'الإعدادات').click();
  await tab(p, 'الشبكة المحلية').click();
  await p.waitForTimeout(1500);
  await style(p);
  await snap(p, 'lan2', lanTargets());

  // ── جوال أندرويد على نفس الشبكة (www) ──
  const phone = async (tag: string, url: string, iphone: boolean) => {
    const ctx = await br.newContext(iphone ? { ...devices['iPhone 13'], deviceScaleFactor: 2, bypassCSP: true } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true });
    const x = await ctx.newPage();
    x.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
    await x.addInitScript((e) => {
      localStorage.setItem('mizan.tour.off', '1');
      localStorage.setItem('wazn.cloudEmulator', e);
    }, EMU);
    await x.goto(url);
    await x.locator('#wazn-intro').waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
    await style(x);
    return x;
  };
  const m = await phone('M', `${WWW}/index.html`, false);
  await m.locator('.lock-card', { hasText: 'متصل بجهاز المحل' }).waitFor({ timeout: 20000 });
  await center(m.locator('.lock-card', { hasText: 'متصل بجهاز المحل' }));
  await psnap(m, 'm_lock', { lan: btn(m, 'على نفس الشبكة'), cloud: btn(m, 'اتصال عن بعد'), card: m.locator('.lock-card', { hasText: 'متصل بجهاز المحل' }) });
  await btn(m, 'على نفس الشبكة').click();
  await m.locator('.lan-scan').waitFor();
  await center(m.locator('.lan-scan'));
  await psnap(m, 'm_lan', { scan: m.locator('.lan-scan'), card: m.locator('.lock-card', { hasText: 'متصل بجهاز المحل' }) });
  await field(m, 'عنوان الجهاز الرئيسي').locator('input').fill(lanAddr.replace(/192\.0\.2\.\d+/, '192.168.1.10'));
  await field(m, 'المنفذ').locator('input').fill(lanPort);
  await field(m, 'رمز الربط').locator('input').fill(lanCode);
  await field(m, 'اسم المستخدم').locator('input').fill('abumohammad');
  await field(m, 'كلمة السر').locator('input').fill('secret123');
  await field(m, 'رمز الربط').scrollIntoViewIfNeeded();
  await psnap(m, 'm_lan2', { host: field(m, 'عنوان الجهاز الرئيسي'), code: field(m, 'رمز الربط'), user: field(m, 'اسم المستخدم'), pass: field(m, 'كلمة السر'), go: btn(m, 'اتصال', true) });

  // ── الاتصال عن بعد على A ──
  await tab(p, 'الاتصال عن بعد').click();
  await p.waitForTimeout(900);
  await style(p);
  const cloudCheck = p.locator('label.check', { hasText: 'تفعيل الاتصال عن بعد' });
  await snap(p, 'cloud0', { nav: nav(p, 'الإعدادات'), tab: tab(p, 'الاتصال عن بعد'), check: cloudCheck, card: p.locator('.page section.card').first() });
  await cloudCheck.locator('input').check();
  await p.locator('.cloud-code .big-code').waitFor({ timeout: 30000 });
  await p.waitForTimeout(1200);
  const cloudTargets = () => ({
    check: cloudCheck,
    qr: p.locator('.cloud-code img, .cloud-code canvas, .cloud-code svg').first(),
    code: p.locator('.cloud-code .big-code'),
    box: p.locator('.cloud-code'),
    devices: p.locator('.page .kv', { hasText: 'الأجهزة المتصلة' }).locator('strong'),
    warn: p.locator('.page p.bad'),
    newcode: btn(p, 'رمز جديد'),
  });
  await snap(p, 'cloud1', cloudTargets());
  const code = (await p.locator('.cloud-code .big-code').innerText()).trim().replace(/\s+/g, '-');

  // ── جوال أندرويد عن بعد ──
  await m.reload();
  await m.locator('#wazn-intro').waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
  await style(m);
  await m.locator('.lock-card', { hasText: 'متصل بجهاز المحل' }).waitFor({ timeout: 20000 });
  await center(m.locator('.lock-card', { hasText: 'متصل بجهاز المحل' }));
  await psnap(m, 'm_lock2', { cloud: btn(m, 'اتصال عن بعد'), card: m.locator('.lock-card', { hasText: 'متصل بجهاز المحل' }) });
  await btn(m, 'اتصال عن بعد').click();
  await m.locator('.camera-scan').waitFor();
  await center(m.locator('.camera-scan'));
  await psnap(m, 'm_cloud', { scan: m.locator('.camera-scan'), code: field(m, 'رمز الاتصال') });
  await field(m, 'رمز الاتصال').locator('input').fill(code);
  await field(m, 'اسم المستخدم').locator('input').fill('abumohammad');
  await field(m, 'كلمة السر').locator('input').fill('secret123');
  await psnap(m, 'm_cloud2', { code: field(m, 'رمز الاتصال'), user: field(m, 'اسم المستخدم'), pass: field(m, 'كلمة السر'), go: btn(m, 'اتصال', true) });
  await btn(m, 'اتصال', true).click();
  await m.locator('.bottom-nav').waitFor({ timeout: 40000 });
  await style(m);
  await psnap(m, 'm_dash', { nav: m.locator('.bottom-nav') }, 2500);

  // ── آيفون: كاميرا ← رابط الـ QR بسفاري ──
  const w = await phone('W', `${WEB}/index.html#c=${code.replace(/-/g, '')}`, true);
  await w.locator('.web-connect').waitFor({ timeout: 20000 });
  await psnap(w, 'w_connect', { code: field(w, 'رمز الاتصال'), user: field(w, 'اسم المستخدم') }, 900);
  await center(w.locator('.web-install'));
  await psnap(w, 'w_install', { install: w.locator('.web-install') });
  await w.evaluate(() => window.scrollTo(0, 0));
  await field(w, 'اسم المستخدم').locator('input').fill('abumohammad');
  await field(w, 'كلمة السر').locator('input').fill('secret123');
  await field(w, 'كلمة السر').scrollIntoViewIfNeeded();
  await psnap(w, 'w_login', { user: field(w, 'اسم المستخدم'), pass: field(w, 'كلمة السر'), go: btn(w, 'اتصال', true) });
  await btn(w, 'اتصال', true).click();
  await w.locator('.bottom-nav').waitFor({ timeout: 40000 });
  await style(w);
  await psnap(w, 'w_dash', { nav: w.locator('.bottom-nav') }, 2500);

  // ── A: الأجهزة المتصلة ──
  await p.waitForTimeout(2500);
  await tab(p, 'الشبكة المحلية').click();
  await tab(p, 'الاتصال عن بعد').click();
  await p.waitForTimeout(1500);
  await style(p);
  await snap(p, 'cloud2', cloudTargets());

  // ── المرة الجاية: كلمة السر بس ──
  await w.goto(`${WEB}/index.html`);
  await w.locator('.web-connect').waitFor({ timeout: 20000 });
  await w.locator('#wazn-intro').waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
  await style(w);
  await psnap(w, 'w_quick', { saved: w.locator('.saved-conn'), pass: field(w, 'كلمة السر') }, 1200);
  await B.close();
  const B2 = await launch({ home: bHome, feedUrl });
  bHome = '';
  try {
    const r = B2.page;
    await r.setViewportSize({ width: 1600, height: 1000 });
    await r.getByText('جهاز فرعي أو متصل عن بعد؟').waitFor({ timeout: 20000 });
    await btn(r, 'على نفس الشبكة').click();
    await r.locator('.saved-conn').waitFor({ timeout: 10000 });
    await style(r);
    await center(r.locator('.saved-conn'));
    await snap(r, 'b_quick', { saved: r.locator('.saved-conn'), pass: field(r, 'كلمة السر'), card: r.locator('.lock-card') });
  } finally {
    await B2.close();
  }

} catch (e) {
  errs.push('APP ' + (e as Error).message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, '_error.png') }).catch(() => undefined);
  await q.screenshot({ path: path.join(OUT, '_errorB.png') }).catch(() => undefined);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  fs.writeFileSync(path.join(OUT, 'fp.txt'), 'g7');
  console.log(JSON.stringify(errs, null, 1));
  await A.close().catch(() => undefined);
  if (bHome) await B.close().catch(() => undefined);
  await br.close();
  feedServer.close();
}
