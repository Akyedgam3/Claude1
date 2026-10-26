// تجربة لوحة الإدارة على النت محلياً: cd panel && npx wrangler dev --port 8787، بعدين:
// npx tsx panel/test/e2e.mts <مجلد الصور>
import fs from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { chromium, type Page } from 'playwright';
import { parseFeed, parseLicense } from '../../src/license/license';

const BASE = process.env['PANEL_URL'] ?? 'http://127.0.0.1:8787';
const OUT = process.argv[2] ?? '/tmp';
const PEM = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const PUB = createPublicKey(PEM).export({ type: 'spki', format: 'pem' }).toString();
const fails: string[] = [];
const check = (ok: unknown, what: string) => { if (!ok) fails.push(what); console.log(ok ? '✓' : '✗', what); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
const p = await ctx.newPage();
p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (d.message().includes('بصمة') ? '9999-8888-7777-6666' : d.defaultValue()) : undefined));
const sawToast = async (pg: Page, text: string) => pg.locator('.toast', { hasText: text }).first().waitFor({ timeout: 8000 }).then(() => true, () => false);

await p.goto(BASE);
// إعداد أول مرة
await p.locator('input[name=code]').fill('WRONG');
await p.locator('input[name=username]').fill('owner');
await p.locator('input[name=password]').fill('StrongPass123');
await p.getByRole('button', { name: 'إنشاء الحساب' }).click();
check(await sawToast(p, 'رمز الإعداد غلط'), 'wrong setup code refused');
await p.locator('input[name=code]').fill('SETUP-1234');
await p.getByRole('button', { name: 'إنشاء الحساب' }).click();
await p.getByText('لوحة المدير').waitFor();
check(true, 'owner created and logged in');
// المفتاح
await p.getByRole('button', { name: 'الإعدادات' }).click();
await p.locator('#pem').setInputFiles({ name: 'license-private.pem', mimeType: 'text/plain', buffer: Buffer.from(PEM) });
check(await sawToast(p, 'انحفظ مفتاح التوقيع'), 'signing key uploaded');
// وكيل جديد مع خطة «انطلاقة سنوي + جوال»
await p.getByRole('button', { name: 'الوكلاء' }).click();
await p.locator('#na input[name=name]').fill('LAPTOP HOME');
await p.locator('#na input[name=username]').fill('laptop.home');
await p.locator('#na input[name=phone]').fill('+963937205475');
await p.locator('#na select[name=tier]').selectOption('a10m');
await p.getByRole('button', { name: 'إنشاء الوكيل ولوحته' }).click();
const creds = await p.locator('.modal .key').innerText();
const password = /كلمة السر: (\S+)/.exec(creds)?.[1] ?? '';
check(password.length === 12 && creds.includes('laptop.home') && creds.includes(BASE), 'agent credentials message');
await p.screenshot({ path: `${OUT}/panel-owner-agent-created.png` });
await p.locator('.modal').getByRole('button', { name: 'سكّر' }).click();
// زبون مباشر
await p.getByRole('button', { name: 'الزباين' }).click();
await p.locator('#nc input[name=name]').fill('زبون مباشر');
await p.locator('#nc input[name=machineId]').fill('1111-2222-3333-4444');
await p.getByRole('button', { name: 'إصدار المفتاح' }).click();
const directKey = (await p.locator('.modal .key').textContent()) ?? '';
check(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test((await p.locator('.modal .code').innerText()).trim()), 'direct customer has a 16-char code');
check(parseLicense(directKey, PUB)?.customer === 'زبون مباشر', 'direct customer key verifies with the app code');
await p.locator('.modal').getByRole('button', { name: 'سكّر' }).click();
await p.getByRole('button', { name: 'خروج' }).click();

// الوكيل بجلسة تانية
const ag = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
ag.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '9999-8888-7777-6666' : undefined));
await ag.goto(BASE);
await ag.locator('input[name=username]').fill('laptop.home');
await ag.locator('input[name=password]').fill('wrong-password');
await ag.getByRole('button', { name: 'دخول' }).click();
check(await sawToast(ag, 'غلط'), 'agent wrong password refused');
await ag.locator('input[name=password]').fill(password);
await ag.getByRole('button', { name: 'دخول' }).click();
await ag.getByText('لوحة الوكيل').waitFor();
check((await ag.locator('.bal').first().innerText()).includes('10'), 'agent sees balance 10 (annual + phone)');
await ag.locator('#ac input[name=name]').fill('محل النور');
await ag.locator('#ac input[name=phone]').fill('+963911000000');
await ag.locator('#ac input[name=machineId]').fill('1A2B-3C4D-5E6F-7A8B');
await ag.locator('#ac select[name=bucket]').selectOption('annualMobile');
await ag.locator('#ac input[name=phoneMachineId]').fill('ABCD-ABCD-ABCD-ABCD');
await ag.getByRole('button', { name: 'تفعيل وإطلاع المفتاح' }).click();
const pc = parseLicense((await ag.locator('.modal .key').first().textContent()) ?? '', PUB);
check(pc?.machineId === '1A2B-3C4D-5E6F-7A8B' && pc.plan === 'annual' && pc.devices === 2, 'agent computer key verifies');
const codes = await ag.locator('.modal .code').allInnerTexts();
check(codes.length === 2, 'agent sees the computer code and the phone code');
// كود الجوال بيرجّع مفتاح الجوال لجهازه بس
const red = await (await fetch(`${BASE}/api/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: codes[1], machineIds: ['ABCD-ABCD-ABCD-ABCD'] }) })).json() as { key?: string };
const ph = parseLicense(red.key ?? '', PUB);
check(ph?.machineId === 'ABCD-ABCD-ABCD-ABCD' && ph.expiresAt === pc?.expiresAt, 'phone code redeems the phone key, same expiry');
await ag.screenshot({ path: `${OUT}/panel-agent-key.png` });
await ag.locator('.modal').getByRole('button', { name: 'سكّر' }).click();
check((await ag.locator('.bal').first().innerText()).includes('9'), 'agent balance went down to 9');
// كرت بدون بصمة من الوكيل
await ag.locator('#ak input[name=name]').fill('محل الكرت');
await ag.getByRole('button', { name: 'إنشاء الكود' }).click();
const cardCode = (await ag.locator('.modal .code').innerText()).trim();
check(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(cardCode), 'agent sells a code without a fingerprint');
await ag.locator('.modal').getByRole('button', { name: 'سكّر' }).click();
check((await ag.locator('.bal').first().innerText()).includes('8'), 'selling a code takes from the balance');
const got = await (await fetch(`${BASE}/api/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: cardCode, machineIds: ['5555-6666-7777-8888'] }) })).json() as { key?: string; name?: string };
check(parseLicense(got.key ?? '', PUB)?.customer === 'محل الكرت', 'the code activates a new machine');
await ag.screenshot({ path: `${OUT}/panel-agent.png`, fullPage: true });
// الوكيل ما بيوصل لبيانات المدير ولا لزباين غيره
const forbidden = await ag.evaluate(async () => (await fetch('/api/state')).status);
check(forbidden === 404, `agent cannot read owner state (${forbidden})`);
const other = await ag.evaluate(async () => (await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: '{"name":"x","machineId":"1234-1234-1234-1234","plan":"lifetime"}' })).status);
check(other === 404, `agent cannot use owner actions (${other})`);
const noHeader = await ag.evaluate(async () => (await fetch('/api/agent/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
check(noHeader === 403, 'POST without the page header refused');

// المدير بيشوف كل شي، والقائمة انتشرت
await p.locator('input[name=username]').fill('owner');
await p.locator('input[name=password]').fill('StrongPass123');
await p.getByRole('button', { name: 'دخول' }).click();
await p.getByText('آخر النشاط').waitFor();
const log = await p.locator('.log').innerText();
check(log.includes('LAPTOP HOME') && log.includes('محل النور') && log.includes('مفتاح جوال'), 'owner sees agent activity in the log');
await p.waitForTimeout(6000);
const feedText = await (await fetch(`${BASE}/feed.txt`)).text();
const feed = parseFeed(feedText, PUB);
check(feed && Object.keys(feed.entries).length === 4, `feed signed and has 4 licenses (${feed ? Object.keys(feed.entries).length : 'none'})`);
await p.reload();
await p.getByText('آخر النشاط').waitFor();
await p.screenshot({ path: `${OUT}/panel-owner-home.png`, fullPage: true });
// سحب الوكالة بيطلع الوكيل
await p.getByRole('button', { name: 'الوكلاء' }).click();
await p.getByRole('button', { name: 'سحب الوكالة' }).click();
await p.waitForTimeout(800);
const after = await ag.evaluate(async () => (await fetch('/api/agent/state')).status);
check(after === 401, `withdrawn agent is logged out (${after})`);
await p.getByRole('button', { name: 'الزباين' }).click();
await p.screenshot({ path: `${OUT}/panel-owner-customers.png`, fullPage: true });

await b.close();
console.log(fails.length ? `FAILED: ${fails.join(' | ')}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
