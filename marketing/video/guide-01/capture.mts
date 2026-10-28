// لقطات الفيديو الأول (التنصيب وإنشاء الشركة): شاشات ويندوز والتنصيب من mocks.html، والبرنامج الحقيقي (Electron، 1600×1000).
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/guide-01/capture.mts <outdir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';
import { launch } from '../../../tests/e2e/helpers';
import { issueLicense, signFeed, type LicenseFeed } from '../../../src/license/license';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SITE = '/home/user/mizan-updates';
const devKey = fs.readFileSync(path.join(ROOT, 'dev-keys/license-private.dev.pem'), 'utf8');
const OUT = path.resolve(process.argv[2]!);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, { file: string; targets: Record<string, Box> }> = {};
const errs: string[] = [];

async function snap(p: Page, name: string, targets: Record<string, Locator> = {}, wait = 600) {
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

// ── 1. شاشات ويندوز: الموقع، التحميل، SmartScreen، ملف التنصيب ──
const MOCK = path.join(OUT, '_mock');
fs.mkdirSync(path.join(MOCK, 'fonts'), { recursive: true });
const lic = fs.readFileSync(path.join(ROOT, 'build/license_ar.txt'), 'utf8').replace(/^﻿/, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
fs.writeFileSync(path.join(MOCK, 'mocks.html'), fs.readFileSync(path.join(import.meta.dirname, 'mocks.html'), 'utf8').replace('{{LICENSE}}', esc(lic.slice(0, 900))));
for (const f of fs.readdirSync(path.join(SITE, 'assets/fonts'))) fs.copyFileSync(path.join(SITE, 'assets/fonts', f), path.join(MOCK, 'fonts', f));
fs.copyFileSync(path.join(ROOT, 'build/icon.png'), path.join(MOCK, 'logo.png'));
fs.copyFileSync(path.join(ROOT, 'build/installerSidebar.bmp'), path.join(MOCK, 'side.bmp'));
fs.copyFileSync(path.join(ROOT, 'build/installerHeader.bmp'), path.join(MOCK, 'head.bmp'));

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.bmp': 'image/bmp', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent((q.url ?? '/').split('?')[0]!);
  const file = u.startsWith('/site/') ? path.join(SITE, u.slice(6)) : u.startsWith('/mock/') ? path.join(MOCK, u.slice(6)) : '';
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void r.writeHead(404).end();
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto(`${base}/mock/mocks.html`);
  await p.evaluate(() => (window as unknown as { show: (a: string, c: string) => void }).show('site', ''));
  await p.evaluate((src) => ((document.getElementById('frame') as HTMLIFrameElement).src = src), `${base}/site/index.html`);
  const fr = p.frameLocator('#frame');
  await fr.locator('a.btn', { hasText: 'لويندوز' }).first().waitFor({ timeout: 15000 });
  await p.evaluate(() => document.fonts.ready);
  const site = p.frames().find((f) => f.url().includes('/site/'))!;
  await site.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important} .wa-float,.toast{display:none!important} *{animation-play-state:paused!important}' });
  const show = (s: string, pg = '') => p.evaluate(([a, c]) => (window as unknown as { show: (a: string, c: string) => void }).show(a!, c!), [s, pg]);
  await show('site');
  await snap(p, 'site', { dl: fr.locator('a.btn', { hasText: 'لويندوز' }), url: p.locator('.url') }, 1500);
  await show('site', 'dl');
  await snap(p, 'site_dl', { row: p.locator('#dlrow'), open: p.locator('#openfile') });
  await show('smart');
  await snap(p, 'smart', { more: p.locator('#more'), box: p.locator('#ss') });
  await show('smart', 'more');
  await snap(p, 'smart_more', { run: p.locator('#run'), meta: p.locator('#meta') });
  for (const [pg, extra] of [
    ['welcome', {}],
    ['license', { text: p.locator('#lic') }],
    ['dir', {}],
    ['progress', { bar: p.locator('#pg-progress .bar') }],
    ['finish', { run: p.locator('#runnow') }],
  ] as const) {
    await show('inst', pg);
    await snap(p, `inst_${pg}`, { main: p.locator('#btn-main'), win: p.locator('#instwin'), ...extra });
  }
} catch (e) {
  errs.push('MOCKS ' + (e as Error).message.split('\n')[0]);
} finally {
  await b.close();
  server.close();
}

// ── 2. البرنامج: التفعيل وإنشاء الشركة ──
const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-g1': { status: 'active' } } };
const feedServer = http.createServer((_q, r) => r.end(signFeed(feed, devKey)));
await new Promise<void>((r) => feedServer.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.txt`;
const style = (p: Page) => p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' }).catch(() => undefined);
const btn = (p: Page, name: string | RegExp, exact = false) => p.getByRole('button', { name, exact }).first();
const field = (p: Page, label: string | RegExp) => p.locator('.field', { hasText: label }).first();
const A = await launch({ feedUrl });
const p = A.page;
try {
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  await style(p);
  const fp = p.locator('.big-code').first();
  await snap(p, 'lock', { fp, copy: btn(p, 'نسخ البصمة'), key: p.locator('textarea').first(), activate: btn(p, 'تفعيل', true) });
  const machineId = (await fp.innerText()).trim();
  fs.writeFileSync(path.join(OUT, 'fp.txt'), machineId);
  // شكل الكود القصير متل ما بيوصل للزبون، وبعدين المفتاح الحقيقي للتفعيل (بدون إنترنت)
  await p.locator('textarea').first().fill('W7KQ-4PZM-8HTR-2XNA');
  await snap(p, 'lock_key', { key: p.locator('textarea').first(), activate: btn(p, 'تفعيل', true) });
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-g1', customer: 'ماركت النور', machineId, plan: 'annual' }, devKey));
  await btn(p, 'تفعيل', true).click();
  await p.getByText('شركة جديدة').first().waitFor();
  await style(p);
  await snap(p, 'welcome', { newco: btn(p, 'شركة جديدة') });
  await btn(p, 'شركة جديدة').click();
  const act = (t: string) => p.locator('.activity', { hasText: t }).first();
  await snap(p, 'acts', { grid: p.locator('.activity-grid'), a1: act('سوبرماركت'), a2: act('مطعم'), a3: act('موبايلات'), a4: act('صيدلية'), a5: act('ألبسة'), a6: act('خياطة'), a7: act('مواد بناء'), gen: act('تجارة عامة') });
  await act('سوبرماركت').click();
  await field(p, 'اسم الشركة').locator('input').fill('ماركت النور');
  await field(p, 'الهاتف').locator('input').fill('0944 123 456');
  await field(p, 'العنوان').locator('input').fill('دمشق — الميدان');
  await field(p, 'اسم الشركة').scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -120));
  await snap(p, 'form_co', { act: act('سوبرماركت'), name: field(p, 'اسم الشركة'), phone: field(p, 'الهاتف'), address: field(p, 'العنوان'), cur: field(p, 'العملة الأساسية') });
  await field(p, 'اسمك').locator('input').fill('أبو محمد');
  await field(p, 'كلمة السر (6').locator('input').fill('secret123');
  await field(p, 'تأكيد كلمة السر').locator('input').fill('secret123');
  await field(p, 'اسمك').scrollIntoViewIfNeeded();
  await snap(p, 'form_owner', { owner: field(p, 'اسمك'), user: field(p, 'اسم الدخول'), pass: field(p, 'كلمة السر (6'), confirm: field(p, 'تأكيد كلمة السر') });
  await p.locator('.demo-check input').check();
  await p.locator('.demo-check').scrollIntoViewIfNeeded();
  await snap(p, 'form_demo', { demo: p.locator('.demo-check'), create: btn(p, 'إنشاء الشركة') });
  await btn(p, 'إنشاء الشركة').click();
  await btn(p, 'حفظته، تابع').waitFor({ timeout: 30000 });
  await snap(p, 'recovery', { key: p.locator('.modal .big-code').first(), ok: btn(p, 'حفظته، تابع'), modal: p.locator('.modal').first() });
  await btn(p, 'حفظته، تابع').click();
  await p.locator('.sidebar').waitFor();
  await style(p);
  await snap(p, 'dash', {
    side: p.locator('.sidebar nav'),
    stats: p.locator('.stats').first(),
    sales: p.locator('.stats > *', { hasText: 'مبيعات اليوم' }),
    profit: p.locator('.stats > *', { hasText: 'ربح اليوم' }),
    debts: p.locator('.stats > *', { hasText: 'لنا على الناس' }),
    cash: p.locator('.stats > *', { hasText: /الصندوق|الصناديق/ }),
  }, 1500);
} catch (e) {
  errs.push('APP ' + (e as Error).message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, '_error.png') }).catch(() => undefined);
} finally {
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
  console.log(JSON.stringify(errs, null, 1));
  await A.close();
  feedServer.close();
}
