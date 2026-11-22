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

const b = await chromium.launch(process.env['PW_EXE'] ? { executablePath: process.env['PW_EXE'] } : {});
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
// إنقاص رصيد الوكيل
await p.getByRole('button', { name: 'الوكلاء' }).click();
const balBefore = await p.locator('.item .bal').first().innerText();
await p.getByRole('button', { name: '− إنقاص رصيد' }).first().click();
await p.locator('.modal input[name=count]').fill('2');
await p.locator('.modal input[name=note]').fill('تجربة');
await p.screenshot({ path: `${OUT}/panel-deduct.png` });
await p.locator('.modal').getByRole('button', { name: 'إنقاص' }).click();
check(await sawToast(p, 'انخصم من الرصيد'), 'owner reduced the agent balance');
await p.waitForTimeout(500);
const balAfter = await p.locator('.item .bal').first().innerText();
console.log('balance', JSON.stringify(balBefore), '->', JSON.stringify(balAfter));
check(balBefore !== balAfter, 'balance changed on screen');
// مدة تجريبية من لوحة الوكيل (ببلاش، 1–7 أيام)
const tr = await ag.evaluate(`(async () => {
  const post = (days) => fetch('/api/agent/trial', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: JSON.stringify({ name: 'تجربة', machineId: '7777-8888-9999-AAAA', days }) });
  const bad = (await post(9)).status;
  const ok = await post(3);
  const again = (await post(2)).status;
  return { bad, ok: ok.status, trial: (await ok.json()).customer?.trial, again };
})()`) as { bad: number; ok: number; trial: boolean; again: number };
check(tr.bad === 400 && tr.ok === 200 && tr.trial === true && tr.again === 400, `agent gives a 1–7 day trial once per machine (${JSON.stringify(tr)})`);
// تحويل زبون سنوي لدائم (المدير، بدون خصم من الوكيل)
const up = await p.evaluate(async () => {
  const st = await (await fetch('/api/state')).json();
  const c = st.customers.find((x: { plan: string; phoneOf?: string; agentId?: string }) => x.plan !== 'lifetime' && !x.phoneOf && x.agentId);
  const r = await fetch(`/api/customers/${c.id}/extend`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: JSON.stringify({ plan: 'lifetime', free: true }) });
  return { status: r.status, plan: (await r.json()).plan };
});
check(up.status === 200 && up.plan === 'lifetime', `owner switched an agent customer to lifetime (${JSON.stringify(up)})`);
// «امسح وفعّل بكود جديد» من الواجهة: نفس البصمة، كود جديد، والقديم ما عاد يفعّل
{
  const st0 = await p.evaluate(async () => (await fetch('/api/state')).json());
  const target = st0.customers.find((x: { phoneOf?: string; status: string; replacedBy?: string; trial?: boolean }) => !x.phoneOf && x.status === 'active' && !x.replacedBy && !x.trial);
  await p.reload();
  await p.locator('nav.tabs button', { hasText: 'الزباين' }).first().click().catch(() => undefined);
  const row = p.locator('.item', { hasText: target.name }).filter({ has: p.locator('[data-c="reissue"]') }).first();
  await row.locator('[data-c="reissue"]').click();
  await p.locator('.modal button.primary', { hasText: 'امسح وفعّل بكود جديد' }).click();
  await p.locator('.modal .code').waitFor({ timeout: 8000 });
  const newCode = (await p.locator('.modal .code').innerText()).trim();
  await p.screenshot({ path: `${OUT}/panel-reissue.png` });
  check(newCode.length >= 16 && newCode !== target.code, `reissue shows a new code (${target.code} -> ${newCode})`);
  const oldR = await fetch(`${BASE}/api/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: target.code, machineIds: [target.machineId] }) });
  const newR = (await (await fetch(`${BASE}/api/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: newCode, machineIds: [target.machineId] }) })).json()) as { key?: string };
  const nk = newR.key ? parseLicense(newR.key, PUB) : null;
  check(oldR.status !== 200 && nk?.machineId === target.machineId, `old code refused (${oldR.status}), new code activates the same fingerprint`);
  await p.locator('.modal button', { hasText: 'سكّر' }).click();
  check((await p.locator('.item', { hasText: target.name }).count()) >= 1, 'customer still listed once with the new license');
  await p.locator('nav.tabs button', { hasText: 'الوكلاء' }).first().click();
  await p.waitForTimeout(500);
}
// المدير بيسجّل زبون للوكيل: مع خصم من رصيده أو بدون
{
  const res = (await p.evaluate(`(async () => {
    const st = await (await fetch('/api/state')).json();
    const ag = st.agents.find((a) => a.active);
    const post = (b) => fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: JSON.stringify(b) }).then((r) => r.json());
    const uses = async () => (await (await fetch('/api/state')).json()).agents.find((a) => a.id === ag.id).uses.length;
    const u0 = await uses();
    const free = await post({ name: 'للوكيل ببلاش', machineId: '1212-3434-5656-7878', plan: 'annual', devices: 2, agentId: ag.id });
    const u1 = await uses();
    const paid = await post({ name: 'للوكيل بخصم', machineId: '2121-4343-6565-8787', plan: 'annual', devices: 2, agentId: ag.id, charge: 'on', mobile: 'on' });
    const u2 = await uses();
    return { free: free.agentId === ag.id, paid: paid.agentId === ag.id, u0, u1, u2, err: free.error || paid.error };
  })()`)) as { free: boolean; paid: boolean; u0: number; u1: number; u2: number };
  check(res.free && res.paid && res.u1 === res.u0 && res.u2 === res.u0 + 1, `owner adds customers for an agent, free and charged (${JSON.stringify(res)})`);
  await p.reload();
  await p.locator('nav.tabs button', { hasText: 'الزباين' }).first().click();
  await p.locator('#nca').selectOption({ index: 1 });
  check(await p.locator('#ncc').isVisible(), 'charge checkbox appears when an agent is chosen');
  await p.locator('nav.tabs button', { hasText: 'الوكلاء' }).first().click();
  await p.waitForTimeout(500);
}
// نقل رخصة مباشرة لوكيل من الواجهة (بدون خصم)، والمفتاح ما بيتغيّر
{
  const st0 = await p.evaluate(async () => (await fetch('/api/state')).json());
  const target = st0.customers.find((x: { phoneOf?: string; status: string; replacedBy?: string; agentId?: string }) => !x.phoneOf && x.status === 'active' && !x.replacedBy && !x.agentId);
  const ag = st0.agents.find((a: { active: boolean }) => a.active);
  await p.reload();
  await p.locator('nav.tabs button', { hasText: 'الزباين' }).first().click();
  const row = p.locator('.item', { hasText: target.name }).filter({ has: p.locator('[data-c="transfer"]') }).first();
  await row.locator('[data-c="transfer"]').click();
  await p.locator('.modal select[name="agentId"]').selectOption(ag.id);
  await p.screenshot({ path: `${OUT}/panel-transfer.png` });
  await p.locator('.modal button.primary', { hasText: 'نقل' }).click();
  const ok = await sawToast(p, 'تم النقل');
  const st1 = await p.evaluate(async () => (await fetch('/api/state')).json());
  const moved = st1.customers.find((x: { id: string }) => x.id === target.id);
  const used = (id: string, st: { agents: { id: string; uses: unknown[] }[] }) => st.agents.find((a) => a.id === id)!.uses.length;
  check(ok && moved.agentId === ag.id && moved.key === target.key && used(ag.id, st1) === used(ag.id, st0), `owner moves a direct license to an agent without charge (${ok}, ${moved.agentId === ag.id})`);
  await p.locator('nav.tabs button', { hasText: 'الوكلاء' }).first().click();
  await p.waitForTimeout(500);
}
// حذف وكيل نهائياً من الواجهة: بيختفي، حسابه ما عاد يفوت، وزباينه بيصيروا مباشرين
{
  const created = (await p.evaluate(`(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: JSON.stringify(b) }).then((r) => r.json());
    const r = await post('/api/agents', { name: 'وكيل للحذف', username: 'todelete' });
    const c = await post('/api/customers', { name: 'زبون وكيل للحذف', machineId: '7171-7272-7373-7474', plan: 'annual', devices: 2, agentId: r.agent.id });
    return { id: r.agent.id, password: r.password, cid: c.id };
  })()`)) as { id: string; password: string; cid: string };
  await p.reload();
  await p.locator('nav.tabs button', { hasText: 'الوكلاء' }).first().click();
  await p.locator(`[data-act="delete"][data-id="${created.id}"]`).click();
  await p.locator('.modal input[name="confirm"]').fill('وكيل للحذف');
  await p.screenshot({ path: `${OUT}/panel-delete-agent.png` });
  await p.locator('.modal button.danger', { hasText: 'حذف نهائي' }).click();
  const ok = await sawToast(p, 'انحذف الوكيل');
  const st = await p.evaluate(async () => (await fetch('/api/state')).json());
  const cust = st.customers.find((x: { id: string }) => x.id === created.cid);
  const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: JSON.stringify({ username: 'todelete', password: created.password }) });
  check(ok && !st.agents.some((a: { id: string }) => a.id === created.id) && cust.status === 'active' && !cust.agentId && login.status !== 200, `delete agent permanently (${ok}, login ${login.status})`);
}
// الاتصال عن بعد كاشتراك: المدير بيفعّل سنوي لزبون، والوكيل بياخد رصيد عن بعد بمدة وبيفعّل منه
{
  const res = (await p.evaluate(`(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const st = await (await fetch('/api/state')).json();
    const c = st.customers.find((x) => !x.phoneOf && x.status === 'active' && !x.replacedBy);
    const a1 = await post('/api/customers/' + c.id + '/cloud', { plan: 'annual' });
    const ag = st.agents.find((a) => a.active);
    const add = await post('/api/agents/' + ag.id + '/cloud', { count: 3, plan: 'monthly' });
    const st2 = await (await fetch('/api/state')).json();
    const bal = st2.agents.find((a) => a.id === ag.id).cloudBalance.plans.monthly;
    return { until: a1.body.cloudUntil, plan: a1.body.cloudPlan, add: add.status, bal };
  })()`)) as { until: string; plan: string; add: number; bal: { total: number } };
  const days = Math.round((new Date(res.until).getTime() - Date.now()) / 86_400_000);
  check(res.plan === 'annual' && days >= 364 && days <= 366 && res.add === 200 && res.bal.total === 3, `remote connection as a subscription (${JSON.stringify(res)})`);
}
// سحب الوكالة بيطلع الوكيل
await p.getByRole('button', { name: 'سحب الوكالة' }).click();
await p.waitForTimeout(800);
const after = await ag.evaluate(async () => (await fetch('/api/agent/state')).status);
check(after === 401, `withdrawn agent is logged out (${after})`);
await p.getByRole('button', { name: 'الزباين' }).click();
await p.screenshot({ path: `${OUT}/panel-owner-customers.png`, fullPage: true });

await b.close();
console.log(fails.length ? `FAILED: ${fails.join(' | ')}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
