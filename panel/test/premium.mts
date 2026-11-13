// خطة «الوكيل المميز»: 25 رخصة مرنة (شهري/سنوي/دائم) + 25 تفعيل عن بعد، والمدير بيزيد تفعيلات عن بعد بأي عدد.
// بعد e2e.mts (الحساب والمفتاح موجودين): npx tsx panel/test/premium.mts <مجلد الصور>
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
const b = await chromium.launch(process.env['PW_EXE'] ? { executablePath: process.env['PW_EXE'] } : {});
const sawToast = async (pg: Page, text: string) => pg.locator('.toast', { hasText: text }).first().waitFor({ timeout: 8000 }).then(() => true, () => false);

const p = await (await b.newContext({ viewport: { width: 400, height: 900 } })).newPage();
p.on('dialog', (d) => d.accept());
await p.goto(BASE);
await p.locator('input[name=username]').fill('owner');
await p.locator('input[name=password]').fill('StrongPass123');
await p.getByRole('button', { name: 'دخول' }).click();
await p.getByText('لوحة المدير').waitFor();
await p.getByRole('button', { name: 'الوكلاء' }).click();
await p.locator('#na input[name=name]').fill('وكيل مميز');
await p.locator('#na input[name=username]').fill('premium.agent');
await p.locator('#na select[name=tier]').selectOption('p25');
check((await p.locator('#na select[name=tier] option[value=p25]').innerText()).includes('25 عن بعد'), 'premium plan listed with its remote activations');
await p.getByRole('button', { name: 'إنشاء الوكيل ولوحته' }).click();
const password = /كلمة السر: (\S+)/.exec(await p.locator('.modal .key').innerText())?.[1] ?? '';
await p.locator('.modal').getByRole('button', { name: 'سكّر' }).click();
const card = p.locator('.item', { hasText: 'وكيل مميز' });
check((await card.locator('.bal').innerText()).includes('25'), 'owner sees 25 flex + 25 remote');
// المدير بيزيد 10 تفعيلات عن بعد
await card.getByRole('button', { name: '± تفعيلات عن بعد' }).click();
await p.locator('.modal [data-n="10"]').click();
await p.locator('.modal').getByRole('button', { name: 'حفظ' }).click();
check(await sawToast(p, 'تم'), 'owner added 10 remote activations');
check((await p.locator('.item', { hasText: 'وكيل مميز' }).locator('.bal').innerText()).includes('35'), 'remote balance is now 35');
await p.screenshot({ path: `${OUT}/premium-owner.png`, fullPage: true });

// الوكيل
const ag = await (await b.newContext({ viewport: { width: 400, height: 900 } })).newPage();
ag.on('dialog', (d) => d.accept());
await ag.goto(BASE);
await ag.locator('input[name=username]').fill('premium.agent');
await ag.locator('input[name=password]').fill(password);
await ag.getByRole('button', { name: 'دخول' }).click();
await ag.getByText('لوحة الوكيل').waitFor();
const bal = await ag.locator('.bal').first().innerText();
check(bal.includes('مرن') && bal.includes('25') && bal.includes('35'), 'agent sees flex 25 and remote 35');
// تفعيل شهري من المرن
await ag.locator('#ac input[name=name]').fill('محل شهري');
await ag.locator('#ac input[name=machineId]').fill('2222-3333-4444-5555');
await ag.locator('#ac select[name=bucket]').selectOption('flex');
await ag.locator('#ac select[name=fplan]').selectOption('monthly');
await ag.getByRole('button', { name: 'تفعيل وإطلاع المفتاح' }).click();
const k1 = parseLicense((await ag.locator('.modal .key').first().textContent()) ?? '', PUB);
check(k1?.plan === 'monthly' && k1.machineId === '2222-3333-4444-5555', 'monthly license from the flex balance');
await ag.locator('.modal').getByRole('button', { name: 'سكّر' }).click();
// كود دائم من المرن
await ag.locator('#ak select[name=bucket]').selectOption('flex');
await ag.locator('#ak select[name=fplan]').selectOption('lifetime');
await ag.getByRole('button', { name: 'إنشاء الكود' }).click();
const code = (await ag.locator('.modal .code').innerText()).trim();
await ag.locator('.modal').getByRole('button', { name: 'سكّر' }).click();
const red = await (await fetch(`${BASE}/api/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, machineIds: ['6666-7777-8888-9999'] }) })).json() as { key?: string };
check(parseLicense(red.key ?? '', PUB)?.expiresAt === null, 'lifetime code from the flex balance activates');
check((await ag.locator('.bal').first().innerText()).includes('23'), 'flex balance 23 after two');
// الاتصال عن بعد لزبونه
const row = ag.locator('.item', { hasText: 'محل شهري' }).first();
await row.getByRole('button', { name: 'تفعيل عن بعد' }).click();
check(await sawToast(ag, 'انفتح الاتصال عن بعد'), 'agent opened remote for his customer');
check((await ag.locator('.bal').first().innerText()).includes('34'), 'remote balance 34');
await ag.getByRole('button', { name: 'تجديد شهر' }).first().click();
check(await sawToast(ag, 'تم التجديد'), 'agent renewed one month from flex');
await ag.screenshot({ path: `${OUT}/premium-agent.png`, fullPage: true });
await ag.waitForTimeout(6000);
const feed = parseFeed(await (await fetch(`${BASE}/feed.txt`)).text(), PUB);
check(feed && Object.values(feed.entries).some((e) => (e as { cloud?: boolean }).cloud), 'feed carries the remote flag');
await b.close();
console.log(fails.length ? `FAILED: ${fails.join(' | ')}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
