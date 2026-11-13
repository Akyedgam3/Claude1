// لقطات الحلقة 6 (المستخدمين والصلاحيات والنسخ الاحتياطي): البرنامج الحقيقي (Electron، 1600×1000) بشركة سوبرماركت تجريبية.
// المتطلبات: MIZAN_TEST_BUILD=1 npm run build
// xvfb-run -a npx tsx marketing/video/guide-06/capture.mts <outdir>
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

const feed: LicenseFeed = { v: 1, issuedAt: new Date().toISOString(), entries: { 'lic-g6': { status: 'active' } } };
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
  await p.locator('textarea').first().fill(issueLicense({ id: 'lic-g6', customer: 'ماركت النور', machineId, plan: 'annual' }, devKey));
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
  await snap(p, 'dash', { users: nav(p, 'المستخدمون'), settings: nav(p, 'الإعدادات'), side: p.locator('.sidebar nav') }, 1500);

  // ── المستخدمون ──
  await nav(p, 'المستخدمون').click();
  await p.locator('.page table').first().waitFor();
  await style(p);
  await snap(p, 'users0', { nav: nav(p, 'المستخدمون'), add: btn(p, '+ مستخدم'), table: p.locator('.page table').first(), me: p.locator('.page table tbody tr').first() }, 900);
  await btn(p, '+ مستخدم').click();
  const m = p.locator('.modal').first();
  await m.waitFor();
  await m.locator('.field', { hasText: 'الاسم' }).first().locator('input').fill('سامر');
  await m.locator('.field', { hasText: 'اسم الدخول' }).locator('input').fill('samer');
  await m.locator('.field', { hasText: 'كلمة السر' }).locator('input').fill('samer123');
  await m.locator('.field', { hasText: 'الدور' }).locator('select').selectOption('cashier');
  await p.waitForTimeout(400);
  await snap(p, 'user_new', {
    modal: m,
    name: m.locator('.field', { hasText: 'الاسم' }).first(),
    username: m.locator('.field', { hasText: 'اسم الدخول' }),
    password: m.locator('.field', { hasText: 'كلمة السر' }),
    role: m.locator('.field', { hasText: 'الدور' }),
    box: m.locator('.field', { hasText: 'صندوق المستخدم' }),
    perms: m.locator('.perm-grid'),
    costs: m.locator('.perm-grid label', { hasText: 'رؤية التكاليف' }),
    void: m.locator('.perm-grid label', { hasText: 'إلغاء الفواتير' }),
  });
  const boxSel = m.locator('.field', { hasText: 'صندوق المستخدم' }).locator('select');
  await boxSel.selectOption({ index: 1 }).catch(() => undefined);
  await m.locator('.perm-grid label', { hasText: 'إعطاء خصم' }).locator('input').uncheck().catch(() => undefined);
  await p.waitForTimeout(300);
  await snap(p, 'user_new2', { modal: m, box: m.locator('.field', { hasText: 'صندوق المستخدم' }), perms: m.locator('.perm-grid'), changed: m.locator('.perm-grid label.bad, .perm-grid label.good').first(), save: m.getByRole('button', { name: 'حفظ' }) });
  await m.getByRole('button', { name: 'حفظ' }).click();
  await m.waitFor({ state: 'detached' });
  await p.waitForTimeout(500);
  await style(p);
  const srow = p.locator('.page table tbody tr', { hasText: 'سامر' }).first();
  await snap(p, 'users1', { table: p.locator('.page table').first(), row: srow, role: srow.locator('td').nth(2), status: srow.locator('td').nth(3) });
  await srow.click();
  const m2 = p.locator('.modal').first();
  await m2.waitFor();
  await snap(p, 'user_edit', { modal: m2, active: m2.locator('label.check', { hasText: 'فعّال' }) });
  await p.keyboard.press('Escape');
  await m2.waitFor({ state: 'detached' });
  // سجل: كل عملية باسم اللي عملها (سجل الفواتير بعمود المستخدم)
  await nav(p, 'سجل الفواتير').click();
  await p.waitForTimeout(900);
  await style(p);
  await snap(p, 'log', { table: p.locator('.page table').first(), by: p.locator('.page table thead th', { hasText: /المستخدم|بواسطة|سجّلها/ }).first(), row: p.locator('.page table tbody tr').first() }, 600);

  // ── النسخ الاحتياطي ──
  await nav(p, 'الإعدادات').click();
  await p.locator('.segmented.tabs').waitFor();
  await p.locator('.segmented.tabs button', { hasText: 'النسخ الاحتياطي' }).click();
  await p.waitForTimeout(800);
  await style(p);
  await snap(p, 'backup', {
    nav: nav(p, 'الإعدادات'),
    tab: p.locator('.segmented.tabs button', { hasText: 'النسخ الاحتياطي' }),
    now: btn(p, 'نسخة احتياطية الآن'),
    auto: p.locator('.page', { hasText: 'عند كل خروج' }).locator('p, .muted', { hasText: 'عند كل خروج' }).first(),
    folder: p.locator('section, .card', { hasText: 'مكان النسخ التلقائي' }).last(),
    drive: p.locator('section, .card', { hasText: 'النسخ على Google Drive' }).last(),
    link: btn(p, 'ربط حساب Google Drive'),
  }, 900);
  await p.evaluate(() => { const e = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('ربط حساب Google Drive')); e?.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(500);
  await snap(p, 'backup_drive', { drive: p.locator('section, .card', { hasText: 'النسخ على Google Drive' }).last(), link: btn(p, 'ربط حساب Google Drive') });

  // ── شاشة البداية: الاستعادة ──
  await p.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop > 0) e.scrollTop = 0; });
  await p.locator('.close-company').click();
  await p.locator('.welcome-tabs').waitFor({ timeout: 15000 });
  await p.locator('.welcome-tabs button', { hasText: 'فتح شركة' }).click();
  await p.waitForTimeout(800);
  await style(p);
  await snap(p, 'welcome', {
    open: p.locator('.welcome-tabs button', { hasText: 'فتح شركة' }),
    restore: btn(p, /استعادة نسخة احتياطية/),
    drive: btn(p, 'استعادة من Google Drive'),
    list: p.locator('.welcome section, .welcome .card').first(),
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
