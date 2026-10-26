// اختبار أمان لوحة الإدارة: هجمات حقيقية على نسخة محلية (لوحة فاضية، مفتاح التطوير).
// cd panel && npx wrangler dev --port 8789 --persist-to <مجلد فاضي>، بعدين:
// PANEL_URL=http://127.0.0.1:8789 npx tsx panel/test/security.mts
import { createHmac, createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { parseLicense } from '../../src/license/license';

const BASE = process.env['PANEL_URL'] ?? 'http://127.0.0.1:8789';
const PEM = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const PUB = createPublicKey(PEM).export({ type: 'spki', format: 'pem' }).toString();
const fails: string[] = [];
const check = (ok: unknown, what: string) => {
  if (!ok) fails.push(what);
  console.log(ok ? '✓' : '✗', what);
};

let ipN = 0;
/** كل سيناريو من «عنوان» مختلف حتى ما يأثر قفل واحد على التاني. */
const newIp = () => `10.0.0.${++ipN}`;

class Client {
  cookie = '';
  constructor(readonly ip = newIp()) {}
  async req(path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
    const r = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'CF-Connecting-IP': this.ip, ...(this.cookie ? { Cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Wazn': '1' }), ...extra },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!;
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown>, headers: r.headers };
  }
}

const b32 = (t: string) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, v = 0;
  const out: number[] = [];
  for (const ch of t) {
    v = (v << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};
const totp = (secret: string) => {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(Date.now() / 30_000), 4);
  const h = createHmac('sha1', b32(secret)).update(msg).digest();
  const o = h[19]! & 15;
  return String((((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1_000_000).padStart(6, '0');
};

// ── رؤوس الحماية ──
const home = await fetch(BASE + '/');
const csp = home.headers.get('content-security-policy') ?? '';
check(csp.includes("script-src 'self'") && !/script-src[^;]*unsafe-inline/.test(csp), 'CSP: no inline scripts');
check(home.headers.get('x-frame-options') === 'DENY' && csp.includes("frame-ancestors 'none'"), 'cannot be framed (clickjacking)');
check((home.headers.get('strict-transport-security') ?? '').includes('max-age='), 'HSTS');
check(!(await home.text()).includes('<script>'), 'page has no inline script');

// ── الإعداد ──
const owner = new Client();
check((await owner.req('/api/setup', { code: 'WRONG', username: 'owner', password: 'StrongPass123' })).status === 403, 'setup refuses a wrong code');
const weak = await owner.req('/api/setup', { code: 'SETUP-1234', username: 'owner', password: 'short' });
check(weak.status === 400, 'setup refuses a weak owner password');
const setup = await owner.req('/api/setup', { code: 'SETUP-1234', username: 'owner', password: 'StrongPass123' });
check(setup.status === 200, 'owner created');
check((await new Client().req('/api/setup', { code: 'SETUP-1234', username: 'evil', password: 'StrongPass123456' })).status === 400, 'setup cannot run twice (no second owner)');
const ck = (await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1', 'CF-Connecting-IP': newIp() }, body: JSON.stringify({ username: 'owner', password: 'StrongPass123' }) })).headers.get('set-cookie') ?? '';
check(/HttpOnly/.test(ck) && /Secure/.test(ck) && /SameSite=Strict/.test(ck), 'session cookie is HttpOnly + Secure + SameSite=Strict');
check(/Max-Age=604800/.test(ck), 'owner session lasts 7 days');
check((await owner.req('/api/settings/key', { pem: 'not a key' })).status === 400, 'garbage signing key refused');
check((await owner.req('/api/settings/key', { pem: PEM })).status === 200, 'signing key uploaded');

// ── التحقق بخطوتين ──
const st = await owner.req('/api/2fa/start', {});
const secret = String(st.json['secret'] ?? '');
check(String(st.json['svg'] ?? '').startsWith('<svg'), '2FA QR code generated');
check((await owner.req('/api/2fa/enable', { code: '000000' })).status === 400, '2FA refuses a wrong code');
check((await owner.req('/api/2fa/enable', { code: totp(secret) })).status === 200, '2FA enabled');
const noOtp = await new Client().req('/api/login', { username: 'owner', password: 'StrongPass123' });
check(noOtp.status === 401 && noOtp.json['needOtp'] === true, 'password alone is not enough with 2FA');
check((await new Client().req('/api/login', { username: 'owner', password: 'StrongPass123', otp: '123456' })).status === 401, 'wrong 2FA code refused');
const o2 = new Client();
check((await o2.req('/api/login', { username: 'owner', password: 'StrongPass123', otp: totp(secret) })).status === 200, 'password + 2FA code logs in');

// ── وكيلين ──
const mk = async (name: string, username: string) => {
  const r = await owner.req('/api/agents', { name, username, tier: 'a10' });
  const ag = new Client();
  await ag.req('/api/login', { username, password: String(r.json['password']) });
  return { id: String((r.json['agent'] as { id: string }).id), c: ag };
};
const A = await mk('وكيل أ', 'agent.a');
const B = await mk('وكيل ب', 'agent.b');
check((await A.c.req('/api/agent/state')).status === 200, 'agent A logged in');
const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';
const ca = await A.c.req('/api/agent/customers', { name: xss, machineId: '1A2B-3C4D-5E6F-7A8B', plan: 'annual' });
check(ca.status === 200, 'agent A activated a customer (with a script in its name)');
const caId = String((ca.json['customer'] as { id: string }).id);
check(parseLicense(String((ca.json['customer'] as { key: string }).key), PUB)?.customer === xss, 'the key holds the name as plain text');

// ── صلاحيات ──
check((await A.c.req('/api/state')).status === 404, 'agent cannot read the owner data');
check((await A.c.req('/api/backup')).status === 404, 'agent cannot download the backup');
check((await A.c.req(`/api/customers/${caId}/status`, { status: 'revoked' })).status === 404, 'agent cannot suspend or revoke');
check((await A.c.req('/api/agents', { name: 'x', username: 'xx.x' })).status === 404, 'agent cannot create agents');
check((await A.c.req(`/api/agents/${A.id}/package`, { tier: 'l100m' })).status === 404, 'agent cannot top up its own balance');
check((await B.c.req(`/api/agent/customers/${caId}/renew`, {})).status === 403, "agent B cannot renew agent A's customer");
const bState = await B.c.req('/api/agent/state');
check((bState.json['customers'] as unknown[]).length === 0, "agent B does not see agent A's customers");
check((await new Client().req('/api/state')).status === 401, 'no session, no data');

// ── CSRF ──
const csrf1 = await fetch(BASE + '/api/agent/customers', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: A.c.cookie, 'CF-Connecting-IP': A.c.ip }, body: '{}' });
check(csrf1.status === 403, 'POST without the page header refused (CSRF)');
check((await A.c.req('/api/agent/customers', {}, { Origin: 'https://evil.example' })).status === 403, 'POST from another site refused (CSRF)');

// ── تخمين ──
const g = new Client();
let locked = false;
for (let i = 0; i < 10; i++) {
  const r = await g.req('/api/login', { username: 'agent.a', password: `guess${i}` });
  if (r.status === 429) locked = true;
}
check(locked, 'password guessing gets locked out');
const redeemer = new Client();
let rlocked = false;
for (let i = 0; i < 10; i++) {
  const r = await fetch(BASE + '/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': redeemer.ip }, body: JSON.stringify({ code: `ABCD-EFGH-JKMN-PQR${'ABCDEFGHJK'[i]}`, machineIds: ['1111-2222-3333-4444'] }) });
  if (r.status === 429) rlocked = true;
}
check(rlocked, 'guessing activation codes gets locked out');
const flood = new Client();
let limited = false;
for (let i = 0; i < 260 && !limited; i++) if ((await flood.req('/api/me')).status === 429) limited = true;
check(limited, 'request flood gets rate limited');
check((await A.c.req('/api/agent/customers', 'x'.repeat(70_000))).status === 413, 'oversized request refused');

// ── الكود القصير ما بيمشي لجهاز تاني ──
const code = String((ca.json['customer'] as { code: string }).code);
const other = await fetch(BASE + '/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': newIp() }, body: JSON.stringify({ code, machineIds: ['9999-9999-9999-9999'] }) });
check(other.status === 400, "a customer's code does not work on another machine");

// ── سحب الوكالة ──
await o2.req(`/api/agents/${A.id}/update`, { active: false });
check((await A.c.req('/api/agent/state')).status === 401, 'withdrawn agent is kicked out at once');
check((await new Client().req('/api/login', { username: 'agent.a', password: 'whatever' })).status !== 200, 'withdrawn agent cannot log in');

// ── XSS بالمتصفح: المدير بيفتح الزباين ──
const br = await chromium.launch();
const ctx = await br.newContext();
await ctx.addCookies([{ name: 'wazn_s', value: o2.cookie.split('=')[1]!, url: BASE }]);
const p = await ctx.newPage();
let dialogs = 0;
p.on('dialog', (d) => {
  dialogs++;
  void d.dismiss();
});
await p.setExtraHTTPHeaders({ 'CF-Connecting-IP': newIp() });
await p.goto(BASE);
await p.getByRole('button', { name: 'الزباين' }).click();
await p.waitForTimeout(1200);
check(dialogs === 0, 'a script in a customer name does not run in the owner panel');
check((await p.locator('.item b.name').first().innerText()).includes('<img src=x'), 'the name shows as plain text');
const log = await p.locator('body').innerText();
check(!log.includes('undefined'), 'no broken values on screen');
await br.close();

// ── النسخة الاحتياطية ──
const bk = await fetch(BASE + '/api/backup', { headers: { Cookie: o2.cookie, 'CF-Connecting-IP': o2.ip } });
const bkText = await bk.text();
check(bk.status === 200 && bkText.includes('"customers"') && !bkText.includes('PRIVATE KEY'), 'backup downloads without the signing key');

console.log(fails.length ? `FAILED (${fails.length}): ${fails.join(' | ')}` : 'ALL SECURITY CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
