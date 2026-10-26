// لوحة إدارة وزن على النت (Cloudflare Worker + Durable Object):
// - صاحب البرنامج: كل شي (الزباين، الوكلاء، الباقات، التحديثات، الإعدادات، سجل النشاط).
// - الوكيل: رصيده وزباينه بس، وبيفعّل ويجدد من رصيده.
// كل تغيير بيأثر على قائمة الحالة بينشر feed.txt لحالو على GitHub (mizan-updates) بعد ثواني.
// البيانات كلها بـ Durable Object واحد (بيتنفذ طلب ورا طلب، فما في تضارب برصيد الوكيل).
import { DurableObject } from 'cloudflare:workers';
import { agentBalance, AGENT_DEFAULT_DEVICES, AGENT_TIERS, RegistryCore, type Agent, type AgentKind, type Customer, type RegistryFile } from '../../admin/registry-core';
import { PLANS, publicKeyFromPrivate, type FeedStatus, type Plan } from '../../src/license/format';
import UI from './ui.html';

export interface Env {
  REGISTRY: DurableObjectNamespace<RegistryDO>;
  /** مفتاح تشفير الأسرار المخزّنة (المفتاح الخاص ورمز GitHub)، سر بـ wrangler secret. */
  SECRET_KEY: string;
  /** رمز الإعداد لأول مرة (إنشاء حساب المدير)، سر بـ wrangler secret. */
  SETUP_CODE: string;
  /** المفتاح العام اللي لازم يطابق المفتاح الخاص المرفوع (المفتاح الحقيقي تبع البرنامج). */
  EXPECTED_PUBLIC_KEY: string;
  /** مستودع الموقع وملف القائمة. */
  FEED_REPO: string;
  FEED_PATH: string;
  FEED_BRANCH: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return new Response(UI, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } });
    }
    if (url.pathname === '/feed.txt' || url.pathname.startsWith('/api/')) {
      return env.REGISTRY.get(env.REGISTRY.idFromName('main')).fetch(req);
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers } });

// ───────────── تشفير وكلمات سر ─────────────

const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

/** PBKDF2 (عدد دورات معتدل لأن Workers المجاني إلو حد بوقت المعالج؛ كلمات سر الوكلاء عشوائية وطويلة). */
const PBKDF2_ITER = 20_000;
async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITER }, key, 256));
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`wazn-panel|${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(secret: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text));
  return `${hex(iv)}.${hex(ct)}`;
}
async function unseal(secret: string, sealed: string): Promise<string> {
  const [iv, ct] = sealed.split('.');
  const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv!) }, await aesKey(secret), bytes(ct!)));
}

/** كلمة سر عشوائية سهلة القراءة (بدون حروف بتتلخبط متل 0 و O). */
function newPassword(len = 12): string {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(len))].map((b) => A[b % A.length]).join('');
}

// ───────────── Durable Object: السجل كله ─────────────

type Role = 'owner' | 'agent';
type UserRow = {
  username: string;
  role: Role;
  agent_id: string | null;
  hash: string;
  salt: string;
  disabled: number;
};
interface Session {
  username: string;
  role: Role;
  agentId: string | null;
}

const SESSION_DAYS = 30;
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
const PUBLISH_DELAY_MS = 4000;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export class RegistryDO extends DurableObject<Env> {
  private sql: SqlStorage;
  private reg: RegistryCore | null = null;
  private regKey = '';
  /** نسخة JSON من كل زبون ووكيل محفوظة، لحتى نكتب يلي تغيّر بس. */
  private saved = new Map<string, string>();
  private savedLog = new WeakSet<object>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ent (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT NOT NULL, agent_id TEXT, hash TEXT NOT NULL, salt TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS fails (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)`);
  }

  // ── تخزين ──

  private kvGet(k: string): string | null {
    const r = this.sql.exec<{ v: string }>(`SELECT v FROM kv WHERE k = ?`, k).toArray()[0];
    return r?.v ?? null;
  }
  private kvSet(k: string, v: string | null): void {
    if (v === null) this.sql.exec(`DELETE FROM kv WHERE k = ?`, k);
    else this.sql.exec(`INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, k, v);
  }

  private async privateKey(): Promise<string | null> {
    const s = this.kvGet('secret:privateKey');
    return s ? unseal(this.env.SECRET_KEY, s) : null;
  }

  /** السجل بالذاكرة (بينحمّل مرة وحدة). بدون مفتاح خاص منقدر نقرا بس. */
  private async registry(): Promise<RegistryCore> {
    const key = (await this.privateKey()) ?? '';
    if (this.reg && this.regKey === key) return this.reg;
    this.saved.clear();
    const data: RegistryFile = { customers: [], agents: [], log: [] };
    for (const row of this.sql.exec<{ k: string; v: string }>(`SELECT k, v FROM ent`)) {
      this.saved.set(row.k, row.v);
      const obj = JSON.parse(row.v);
      if (row.k.startsWith('c:')) data.customers.push(obj as Customer);
      else if (row.k.startsWith('a:')) data.agents!.push(obj as Agent);
    }
    data.customers.sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : 1));
    data.agents!.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const upd = this.kvGet('update');
    if (upd) data.update = JSON.parse(upd);
    const lp = this.kvGet('lastPublished');
    if (lp) data.lastPublished = lp;
    for (const row of this.sql.exec<{ v: string }>(`SELECT v FROM (SELECT id, v FROM log ORDER BY id DESC LIMIT 5000) ORDER BY id`)) {
      const e = JSON.parse(row.v);
      this.savedLog.add(e);
      data.log!.push(e);
    }
    this.reg = new RegistryCore(data, key, (d) => this.persist(d));
    this.regKey = key;
    return this.reg;
  }

  private persist(d: RegistryFile): void {
    const seen = new Set<string>();
    const write = (k: string, obj: unknown) => {
      seen.add(k);
      const v = JSON.stringify(obj);
      if (this.saved.get(k) === v) return;
      this.sql.exec(`INSERT INTO ent (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, k, v);
      this.saved.set(k, v);
    };
    for (const c of d.customers) write(`c:${c.id}`, c);
    for (const a of d.agents ?? []) write(`a:${a.id}`, a);
    for (const k of [...this.saved.keys()]) {
      if (!seen.has(k)) {
        this.sql.exec(`DELETE FROM ent WHERE k = ?`, k);
        this.saved.delete(k);
      }
    }
    this.kvSet('update', d.update ? JSON.stringify(d.update) : null);
    this.kvSet('lastPublished', d.lastPublished ?? null);
    for (const e of d.log ?? []) {
      if (this.savedLog.has(e)) continue;
      this.sql.exec(`INSERT INTO log (v) VALUES (?)`, JSON.stringify(e));
      this.savedLog.add(e);
    }
    this.sql.exec(`DELETE FROM log WHERE id <= (SELECT MAX(id) FROM log) - 5000`);
  }

  // ── جلسات ──

  private cookieToken(req: Request): string | null {
    const m = /(?:^|;\s*)wazn_s=([a-f0-9]{64})/.exec(req.headers.get('Cookie') ?? '');
    return m?.[1] ?? null;
  }

  private async session(req: Request): Promise<Session | null> {
    const token = this.cookieToken(req);
    if (!token) return null;
    const h = await sha256(token);
    const s = this.sql.exec<{ username: string; expires: number }>(`SELECT username, expires FROM sessions WHERE token = ?`, h).toArray()[0];
    if (!s || s.expires < Date.now()) return null;
    const u = this.sql.exec<UserRow>(`SELECT * FROM users WHERE username = ?`, s.username).toArray()[0];
    if (!u || u.disabled) return null;
    if (u.role === 'agent') {
      const a = (await this.registry()).agents.find((x) => x.id === u.agent_id);
      if (!a || !a.active) return null;
    }
    return { username: u.username, role: u.role, agentId: u.agent_id };
  }

  private async newSession(username: string): Promise<string> {
    const token = randomHex(32);
    this.sql.exec(`INSERT INTO sessions (token, username, expires) VALUES (?, ?, ?)`, await sha256(token), username, Date.now() + SESSION_DAYS * 86_400_000);
    this.sql.exec(`DELETE FROM sessions WHERE expires < ?`, Date.now());
    return `wazn_s=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
  }

  private tooMany(k: string): boolean {
    const r = this.sql.exec<{ n: number; until: number }>(`SELECT n, until FROM fails WHERE k = ?`, k).toArray()[0];
    return !!r && r.n >= MAX_FAILS && r.until > Date.now();
  }
  private fail(k: string): void {
    const r = this.sql.exec<{ n: number; until: number }>(`SELECT n, until FROM fails WHERE k = ?`, k).toArray()[0];
    const n = r && r.until > Date.now() ? r.n + 1 : 1;
    this.sql.exec(`INSERT INTO fails (k, n, until) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, until = excluded.until`, k, n, Date.now() + LOCK_MINUTES * 60_000);
  }

  private async setPassword(username: string, password: string): Promise<void> {
    const salt = randomHex(16);
    this.sql.exec(`UPDATE users SET hash = ?, salt = ? WHERE username = ?`, await hashPassword(password, salt), salt, username);
    this.sql.exec(`DELETE FROM sessions WHERE username = ?`, username);
  }

  private async createUser(username: string, password: string, role: Role, agentId: string | null): Promise<void> {
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'اسم المستخدم: 3–32 حرف إنكليزي صغير أو رقم (مسموح . _ -)');
    if (this.sql.exec(`SELECT 1 FROM users WHERE username = ?`, username).toArray().length) throw new HttpError(400, 'اسم المستخدم مستعمل');
    const salt = randomHex(16);
    this.sql.exec(`INSERT INTO users (username, role, agent_id, hash, salt, disabled, created) VALUES (?, ?, ?, ?, ?, 0, ?)`, username, role, agentId, await hashPassword(password, salt), salt, new Date().toISOString());
  }

  // ── نشر قائمة الحالة ──

  private schedulePublish(): void {
    this.kvSet('dirty', '1');
    void this.ctx.storage.setAlarm(Date.now() + PUBLISH_DELAY_MS);
  }

  override async alarm(): Promise<void> {
    if (this.kvGet('dirty') !== '1') return;
    await this.publish();
  }

  /** بيوقّع القائمة وبيرفعها على GitHub (والبرامج بتقراها من هناك). */
  private async publish(): Promise<{ ok: boolean; message: string }> {
    const reg = await this.registry();
    if (!(await this.privateKey())) return this.publishStatus(false, 'ما في مفتاح توقيع. ارفعه من الإعدادات.');
    const { text, issuedAt } = reg.buildFeed();
    this.kvSet('feed', text);
    this.kvSet('dirty', null);
    const tokenSealed = this.kvGet('secret:github');
    if (!tokenSealed) return this.publishStatus(false, 'القائمة جاهزة بس ما في رمز GitHub لرفعها. ضيفه من الإعدادات.');
    try {
      const token = await unseal(this.env.SECRET_KEY, tokenSealed);
      const api = `https://api.github.com/repos/${this.env.FEED_REPO}/contents/${this.env.FEED_PATH}`;
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'wazn-panel', 'X-GitHub-Api-Version': '2022-11-28' };
      const put = async () => {
        const cur = await fetch(`${api}?ref=${this.env.FEED_BRANCH}`, { headers });
        const sha = cur.ok ? ((await cur.json()) as { sha: string }).sha : undefined;
        return fetch(api, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `feed: نشر تلقائي ${issuedAt.slice(0, 16)}`, content: btoa(text), branch: this.env.FEED_BRANCH, ...(sha ? { sha } : {}) }),
        });
      };
      let r = await put();
      if (r.status === 409) r = await put(); // حدا تاني رفع بنفس اللحظة
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
      // jsDelivr بيخزّن نسخة قديمة لساعات
      await fetch(`https://purge.jsdelivr.net/gh/${this.env.FEED_REPO}@${this.env.FEED_BRANCH}/${this.env.FEED_PATH}`).catch(() => undefined);
      return this.publishStatus(true, 'انتشرت القائمة');
    } catch (e) {
      this.kvSet('dirty', '1');
      await this.ctx.storage.setAlarm(Date.now() + 60_000); // منعيد بعد دقيقة
      return this.publishStatus(false, `ما قدرنا نرفع القائمة: ${(e as Error).message}`);
    }
  }

  private publishStatus(ok: boolean, message: string): { ok: boolean; message: string } {
    this.kvSet('publishStatus', JSON.stringify({ ok, message, at: new Date().toISOString() }));
    return { ok, message };
  }

  // ── الطلبات ──

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/feed.txt') {
        const feed = this.kvGet('feed');
        return feed ? new Response(feed, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }) : new Response('', { status: 404 });
      }
      if (req.method === 'POST') {
        // الطلبات من صفحتنا بس (الكوكي SameSite=Strict، وهاد حماية زيادة)
        if (req.headers.get('X-Wazn') !== '1') throw new HttpError(403, 'غير مصرح');
        const origin = req.headers.get('Origin');
        if (origin && origin !== url.origin) throw new HttpError(403, 'غير مصرح');
      }
      const body = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
      return await this.route(req, url.pathname, body);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      return json({ error: (e as Error).message || 'خطأ' }, 400);
    }
  }

  private async route(req: Request, path: string, body: Record<string, unknown>): Promise<Response> {
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
    const num = (k: string) => (body[k] === undefined || body[k] === '' ? undefined : Number(body[k]));
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
    const hasOwner = this.sql.exec(`SELECT 1 FROM users WHERE role = 'owner'`).toArray().length > 0;

    // ── بدون تسجيل دخول ──
    if (path === '/api/me' && req.method === 'GET') {
      const s = await this.session(req);
      if (!s) return json({ user: null, needsSetup: !hasOwner });
      const agent = s.agentId ? (await this.registry()).agents.find((a) => a.id === s.agentId) : null;
      return json({ user: { username: s.username, role: s.role, name: agent?.name ?? 'المدير' } });
    }
    if (path === '/api/setup' && req.method === 'POST') {
      if (hasOwner) throw new HttpError(400, 'الإعداد صار من قبل');
      if (this.tooMany(`setup|${ip}`)) throw new HttpError(429, 'محاولات كتير، جرّب بعد ربع ساعة');
      if (!this.env.SETUP_CODE || !sameString(str('code'), this.env.SETUP_CODE)) {
        this.fail(`setup|${ip}`);
        throw new HttpError(403, 'رمز الإعداد غلط');
      }
      if (str('password').length < 10) throw new HttpError(400, 'كلمة السر لازم تكون 10 حروف عالأقل');
      await this.createUser(str('username').toLowerCase(), str('password'), 'owner', null);
      return json({ ok: true }, 200, { 'Set-Cookie': await this.newSession(str('username').toLowerCase()) });
    }
    if (path === '/api/login' && req.method === 'POST') {
      const username = str('username').toLowerCase();
      if (this.tooMany(`u|${username}`) || this.tooMany(`ip|${ip}`)) throw new HttpError(429, 'محاولات دخول كتير، جرّب بعد ربع ساعة');
      const u = this.sql.exec<UserRow>(`SELECT * FROM users WHERE username = ?`, username).toArray()[0];
      const ok = u && !u.disabled && sameString(await hashPassword(str('password'), u.salt), u.hash);
      if (!ok) {
        this.fail(`u|${username}`);
        this.fail(`ip|${ip}`);
        throw new HttpError(401, 'اسم المستخدم أو كلمة السر غلط');
      }
      if (u.role === 'agent') {
        const a = (await this.registry()).agents.find((x) => x.id === u.agent_id);
        if (!a?.active) throw new HttpError(403, 'حساب الوكيل موقوف. تواصل مع وزن.');
      }
      this.sql.exec(`DELETE FROM fails WHERE k = ?`, `u|${username}`);
      return json({ ok: true }, 200, { 'Set-Cookie': await this.newSession(username) });
    }
    if (path === '/api/logout' && req.method === 'POST') {
      const t = this.cookieToken(req);
      if (t) this.sql.exec(`DELETE FROM sessions WHERE token = ?`, await sha256(t));
      return json({ ok: true }, 200, { 'Set-Cookie': 'wazn_s=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
    }

    const s = await this.session(req);
    if (!s) throw new HttpError(401, 'سجّل دخول من جديد');

    if (path === '/api/password' && req.method === 'POST') {
      const u = this.sql.exec<UserRow>(`SELECT * FROM users WHERE username = ?`, s.username).toArray()[0]!;
      if (!sameString(await hashPassword(str('old'), u.salt), u.hash)) throw new HttpError(400, 'كلمة السر الحالية غلط');
      if (str('new').length < (s.role === 'owner' ? 10 : 8)) throw new HttpError(400, `كلمة السر الجديدة لازم تكون ${s.role === 'owner' ? 10 : 8} حروف عالأقل`);
      await this.setPassword(s.username, str('new'));
      return json({ ok: true }, 200, { 'Set-Cookie': await this.newSession(s.username) });
    }

    const reg = await this.registry();
    const canSign = !!(await this.privateKey());
    const needKey = () => {
      if (!canSign) throw new HttpError(400, 'لوحة الإدارة لسا ما فيها مفتاح التوقيع. المدير لازم يرفعه من الإعدادات.');
    };

    // ── الوكيل ──
    if (s.role === 'agent') {
      const agent = reg.agent(s.agentId!);
      reg.actor = agent.name;
      const mine = () => reg.customers.filter((c) => c.agentId === agent.id);
      const own = (id: string) => {
        const c = reg.find(id);
        if (c.agentId !== agent.id) throw new HttpError(403, 'هالزبون مش من زباينك');
        return c;
      };
      if (path === '/api/agent/state' && req.method === 'GET') {
        return json({ agent: { name: agent.name, city: agent.city ?? '', phone: agent.phone ?? '' }, balance: agentBalance(agent), customers: mine(), tiers: AGENT_TIERS, devices: AGENT_DEFAULT_DEVICES, canSign });
      }
      if (path === '/api/agent/customers' && req.method === 'POST') {
        needKey();
        const plan: Plan = str('plan') === 'lifetime' ? 'lifetime' : 'annual';
        const mobile = body['mobile'] === true;
        const c = reg.add({ name: str('name'), machineId: str('machineId'), plan, agentId: agent.id, mobile, ...(str('phone') ? { phone: str('phone') } : {}), ...(str('notes') ? { notes: str('notes') } : {}) });
        let phone: Customer | null = null;
        if (mobile && str('phoneMachineId')) phone = reg.addPhone(c.id, str('phoneMachineId'));
        this.schedulePublish();
        return json({ customer: c, phone });
      }
      const m = /^\/api\/agent\/customers\/([^/]+)\/(renew|phone)$/.exec(path);
      if (m && req.method === 'POST') {
        needKey();
        const c = own(m[1]!);
        const out = m[2] === 'renew' ? reg.extend(c.id, 'annual') : reg.addPhone(c.id, str('machineId'));
        this.schedulePublish();
        return json(out);
      }
      throw new HttpError(404, 'غير موجود');
    }

    // ── المدير ──
    reg.actor = 'المدير';
    const agentUsers = () => Object.fromEntries(this.sql.exec<{ username: string; agent_id: string }>(`SELECT username, agent_id FROM users WHERE role = 'agent'`).toArray().map((u) => [u.agent_id, u.username]));
    if (path === '/api/state' && req.method === 'GET') {
      const users = agentUsers();
      return json({
        customers: reg.customers,
        agents: reg.agents.map((a) => ({ ...a, balance: agentBalance(a), username: users[a.id] ?? null })),
        update: reg.appUpdate ?? null,
        tiers: AGENT_TIERS,
        plans: PLANS,
        devices: AGENT_DEFAULT_DEVICES,
        log: reg.log.slice(-400).reverse(),
        lastPublished: reg.lastPublished ?? null,
        publish: JSON.parse(this.kvGet('publishStatus') ?? 'null'),
        pending: this.kvGet('dirty') === '1',
        settings: { hasKey: canSign, hasGithub: !!this.kvGet('secret:github'), feedRepo: this.env.FEED_REPO },
      });
    }

    const touch = <T>(v: T) => {
      this.schedulePublish();
      return json(v);
    };
    if (path === '/api/customers' && req.method === 'POST') {
      needKey();
      return touch(
        reg.add({
          name: str('name'),
          machineId: str('machineId'),
          plan: str('plan') as Plan,
          ...(str('phone') ? { phone: str('phone') } : {}),
          ...(str('notes') ? { notes: str('notes') } : {}),
          ...(num('devices') ? { devices: num('devices')! } : {}),
          ...(num('offlineDays') ? { offlineDays: num('offlineDays')! } : {}),
          ...(body['force'] ? { force: true } : {}),
        }),
      );
    }
    const mc = /^\/api\/customers\/([^/]+)\/(extend|status|update|cloud|phone)$/.exec(path);
    if (mc && req.method === 'POST') {
      const [, id, action] = mc;
      if (action !== 'status' && action !== 'cloud') needKey();
      if (action === 'extend') return touch(reg.extend(id!, str('plan') as Plan));
      if (action === 'status') return touch(reg.setStatus(id!, str('status') as FeedStatus, str('message') || undefined));
      if (action === 'cloud') return touch(reg.setCloud(id!, body['on'] === true));
      if (action === 'phone') return touch(reg.addPhone(id!, str('machineId')));
      return touch(
        reg.update(id!, {
          ...(body['name'] !== undefined ? { name: str('name') } : {}),
          ...(body['phone'] !== undefined ? { phone: str('phone') } : {}),
          ...(body['notes'] !== undefined ? { notes: str('notes') } : {}),
          ...(num('devices') ? { devices: num('devices')! } : {}),
          ...(num('offlineDays') ? { offlineDays: num('offlineDays')! } : {}),
          ...(str('machineId') ? { machineId: str('machineId') } : {}),
        }),
      );
    }
    if (path === '/api/agents' && req.method === 'POST') {
      const username = str('username').toLowerCase();
      if (!USERNAME_RE.test(username)) throw new HttpError(400, 'اسم المستخدم: 3–32 حرف إنكليزي صغير أو رقم (مسموح . _ -)');
      if (this.sql.exec(`SELECT 1 FROM users WHERE username = ?`, username).toArray().length) throw new HttpError(400, 'اسم المستخدم مستعمل');
      const a = reg.addAgent({ name: str('name'), ...(str('phone') ? { phone: str('phone') } : {}), ...(str('city') ? { city: str('city') } : {}), ...(str('notes') ? { notes: str('notes') } : {}) });
      const password = newPassword();
      await this.createUser(username, password, 'agent', a.id);
      if (str('tier')) reg.addPackage(a.id, { tier: str('tier') });
      return json({ agent: a, username, password });
    }
    const ma = /^\/api\/agents\/([^/]+)\/(package|update|reset|login)$/.exec(path);
    if (ma && req.method === 'POST') {
      const [, id, action] = ma;
      const a = reg.agent(id!);
      if (action === 'package') {
        return json(
          reg.addPackage(a.id, {
            ...(str('tier') ? { tier: str('tier') } : {}),
            ...(str('kind') ? { kind: str('kind') as AgentKind } : {}),
            ...(body['mobile'] === true ? { mobile: true } : {}),
            ...(num('count') !== undefined ? { count: num('count')! } : {}),
            ...(num('price') !== undefined ? { price: num('price')! } : {}),
            ...(str('note') ? { note: str('note') } : {}),
          }),
        );
      }
      if (action === 'reset') {
        const u = this.sql.exec<UserRow>(`SELECT * FROM users WHERE agent_id = ?`, a.id).toArray()[0];
        if (!u) throw new HttpError(400, 'هالوكيل ما إلو حساب دخول');
        const password = newPassword();
        await this.setPassword(u.username, password);
        reg.record(`كلمة سر جديدة للوكيل ${a.name}`, { agentId: a.id });
        return json({ username: u.username, password });
      }
      if (action === 'login') {
        // وكيل قديم (من السجل المستورد) بدون حساب دخول
        const username = str('username').toLowerCase();
        const password = newPassword();
        await this.createUser(username, password, 'agent', a.id);
        reg.record(`حساب دخول للوكيل ${a.name}`, { agentId: a.id });
        return json({ username, password });
      }
      const out = reg.updateAgent(a.id, {
        ...(body['name'] !== undefined ? { name: str('name') } : {}),
        ...(body['phone'] !== undefined ? { phone: str('phone') } : {}),
        ...(body['city'] !== undefined ? { city: str('city') } : {}),
        ...(body['notes'] !== undefined ? { notes: str('notes') } : {}),
        ...(typeof body['active'] === 'boolean' ? { active: body['active'] as boolean } : {}),
      });
      if (body['active'] === false) {
        // إيقاف الوكيل بيطلعه من اللوحة فوراً
        const u = this.sql.exec<UserRow>(`SELECT username FROM users WHERE agent_id = ?`, a.id).toArray()[0];
        if (u) this.sql.exec(`DELETE FROM sessions WHERE username = ?`, u.username);
      }
      return json(out);
    }
    if (path === '/api/update' && req.method === 'POST') {
      if (body['clear']) return touch({ update: reg.setUpdate(null) ?? null });
      return touch({ update: reg.setUpdate({ version: str('version'), url: str('url'), notes: str('notes'), ...(str('minVersion') ? { minVersion: str('minVersion') } : {}) }) });
    }
    if (path === '/api/publish' && req.method === 'POST') {
      return json(await this.publish());
    }

    // ── الإعدادات (مرة وحدة) ──
    if (path === '/api/settings/key' && req.method === 'POST') {
      const pem = str('pem');
      let pub: string;
      try {
        pub = publicKeyFromPrivate(pem);
      } catch {
        throw new HttpError(400, 'هاد مش ملف مفتاح صالح. ارفع keys/license-private.pem');
      }
      const norm = (k: string) => k.replace(/\s/g, '');
      if (norm(pub) !== norm(this.env.EXPECTED_PUBLIC_KEY)) throw new HttpError(400, 'هالمفتاح مش مفتاح وزن الحقيقي (ما بيطابق المفتاح العام بالبرنامج). تأكد إنك رفعت keys/license-private.pem');
      this.kvSet('secret:privateKey', await seal(this.env.SECRET_KEY, pem));
      this.reg = null;
      return json({ ok: true });
    }
    if (path === '/api/settings/github' && req.method === 'POST') {
      const token = str('token');
      if (!token) throw new HttpError(400, 'الرمز فاضي');
      const r = await fetch(`https://api.github.com/repos/${this.env.FEED_REPO}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'wazn-panel', Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new HttpError(400, `GitHub ما قبل الرمز (${r.status}). تأكد إنو إلو صلاحية Contents: Read and write على ${this.env.FEED_REPO}`);
      const perms = ((await r.json()) as { permissions?: { push?: boolean } }).permissions;
      if (perms && !perms.push) throw new HttpError(400, 'الرمز ما إلو صلاحية كتابة على المستودع');
      this.kvSet('secret:github', await seal(this.env.SECRET_KEY, token));
      return json({ ok: true });
    }
    if (path === '/api/import' && req.method === 'POST') {
      // نقل السجل من لوحة الإدارة القديمة (keys/registry.json) مرة وحدة
      needKey();
      if (reg.customers.length || reg.agents.length) throw new HttpError(400, 'اللوحة فيها بيانات أصلاً. الاستيراد بيصير مرة وحدة على لوحة فاضية بس.');
      let data: RegistryFile;
      try {
        data = JSON.parse(String(body['registry'] ?? '')) as RegistryFile;
      } catch {
        throw new HttpError(400, 'الملف مش registry.json صالح');
      }
      if (!Array.isArray(data.customers)) throw new HttpError(400, 'الملف مش registry.json صالح');
      reg.raw.customers.push(...data.customers);
      reg.raw.agents = [...(data.agents ?? [])];
      if (data.update) reg.raw.update = data.update;
      reg.record(`استيراد السجل القديم: ${data.customers.length} زبون و${(data.agents ?? []).length} وكيل`);
      this.schedulePublish();
      return json({ customers: data.customers.length, agents: (data.agents ?? []).length });
    }
    throw new HttpError(404, 'غير موجود');
  }
}
