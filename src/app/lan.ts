import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import type { CompanyEvent, CompanyState, User } from '../core/types';

// العمل على أكثر من جهاز في الشبكة المحلية بدون إنترنت:
// الجهاز الرئيسي يحفظ البيانات ويشغّل خادماً صغيراً، والأجهزة الأخرى تتصل به.
// كل الرسائل مشفّرة (AES-256-GCM) بمفتاح مشتق من "رمز الربط" الظاهر على الجهاز الرئيسي،
// ومربوطة بالوقت ورقم عشوائي لمنع إعادة إرسالها، ثم يدخل كل مستخدم باسمه وكلمة سره.

export const DEFAULT_LAN_PORT = 47100;
const MAX_SKEW_MS = 2 * 60_000;
const LONG_POLL_MS = 25_000;
const RING_SIZE = 2000;

export function lanKey(pairingCode: string): Buffer {
  const clean = pairingCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return scryptSync(clean, 'mizan-lan-v1', 32, { N: 1 << 14, r: 8, p: 1 });
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newPairingCode(): string {
  return [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('').replace(/^(.{4})/, '$1-');
}

interface Envelope {
  iv: string;
  ct: string;
  tag: string;
}

function seal(key: Buffer, data: unknown, aad: string): Envelope {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64') };
}

function unseal<T>(key: Buffer, env: Envelope, aad: string): T {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(env.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(env.ct, 'base64')), d.final()]).toString('utf8')) as T;
}

export interface EventItem {
  event: CompanyEvent;
  seq: number;
}

/** ما يحتاجه الخادم من الشركة المفتوحة على الجهاز الرئيسي. */
export interface HostCompany {
  name: string;
  id: string;
  snapshot(): { state: CompanyState; seq: number };
  verify(username: string, password: string): User | null;
  execute(user: User, method: string, args: unknown[]): { value: unknown; seq: number };
  subscribe(fn: (item: EventItem) => void): () => void;
  /** null = مسموح، أو رسالة سبب المنع (ترخيص الجهاز الرئيسي منتهٍ مثلاً). */
  blocked(): string | null;
  /** أقصى عدد أجهزة متصلة (غير الجهاز الرئيسي). */
  maxClients(): number;
}

interface Session {
  token: string;
  user: User;
  deviceId: string;
  deviceName: string;
  lastSeen: number;
}

export interface ConnectedDevice {
  deviceName: string;
  user: string;
  lastSeen: number;
}

export class LanHost {
  private server: http.Server | null = null;
  private readonly key: Buffer;
  private readonly sessions = new Map<string, Session>();
  private readonly nonces = new Map<string, number>();
  private readonly ring: EventItem[] = [];
  private readonly waiters = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly company: HostCompany,
    readonly pairingCode: string,
    private readonly port = DEFAULT_LAN_PORT,
  ) {
    this.key = lanKey(pairingCode);
  }

  get devices(): ConnectedDevice[] {
    const cutoff = Date.now() - 2 * LONG_POLL_MS;
    return [...this.sessions.values()].filter((s) => s.lastSeen > cutoff).map((s) => ({ deviceName: s.deviceName, user: s.user.displayName, lastSeen: s.lastSeen }));
  }

  async start(): Promise<{ port: number; addresses: string[] }> {
    this.unsubscribe = this.company.subscribe((item) => {
      this.ring.push(item);
      if (this.ring.length > RING_SIZE) this.ring.shift();
      for (const w of [...this.waiters]) w();
    });
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, '0.0.0.0', () => resolve());
    });
    const port = (this.server.address() as { port: number }).port;
    return { port, addresses: localAddresses() };
  }

  stop(): void {
    this.unsubscribe?.();
    for (const w of [...this.waiters]) w();
    this.server?.close();
    this.server?.closeAllConnections?.();
    this.server = null;
    this.sessions.clear();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const path = req.url ?? '';
    const reply = (status: number, body: unknown, nonce = '') => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? seal(this.key, body, `${path}|res|${nonce}`) : body));
    };
    if (req.method !== 'POST' || !['/hello', '/login', '/call', '/events', '/snapshot', '/logout'].includes(path)) return reply(404, { error: 'not found' });
    let msg: { ts: number; nonce: string; [k: string]: unknown };
    try {
      const raw = await readBody(req);
      msg = unseal(this.key, JSON.parse(raw) as Envelope, path);
    } catch {
      // رمز ربط خاطئ أو رسالة معدّلة
      return reply(401, { error: 'pairing' });
    }
    const now = Date.now();
    if (typeof msg.nonce !== 'string' || Math.abs(now - Number(msg.ts)) > MAX_SKEW_MS || this.nonces.has(msg.nonce)) {
      return reply(401, { error: 'replay' });
    }
    this.nonces.set(msg.nonce, now);
    if (this.nonces.size > 5000) for (const [n, t] of this.nonces) if (now - t > MAX_SKEW_MS) this.nonces.delete(n);
    const ok = (body: unknown) => reply(200, { ok: true, ...(body as object) }, msg.nonce);
    const err = (error: string) => reply(200, { ok: false, error }, msg.nonce);

    try {
      if (path === '/hello') return ok({ name: this.company.name, id: this.company.id });
      const blocked = this.company.blocked();
      if (blocked) return err(blocked);

      if (path === '/login') {
        const user = this.company.verify(String(msg['username'] ?? ''), String(msg['password'] ?? ''));
        if (!user) return err('اسم المستخدم أو كلمة السر غير صحيحة');
        const deviceId = String(msg['deviceId'] ?? '');
        const others = new Set([...this.sessions.values()].filter((s) => s.deviceId !== deviceId && now - s.lastSeen < 2 * LONG_POLL_MS).map((s) => s.deviceId));
        if (others.size >= this.company.maxClients()) return err('تم الوصول للحد الأقصى من الأجهزة المسموحة في الترخيص');
        const token = randomBytes(24).toString('hex');
        this.sessions.set(token, { token, user, deviceId, deviceName: String(msg['deviceName'] ?? 'جهاز'), lastSeen: now });
        const snap = this.company.snapshot();
        return ok({ token, user, state: snap.state, seq: snap.seq });
      }

      const session = this.sessions.get(String(msg['token'] ?? ''));
      if (!session) return err('انتهت الجلسة، سجّل الدخول من جديد');
      session.lastSeen = now;

      if (path === '/logout') {
        this.sessions.delete(session.token);
        return ok({});
      }
      if (path === '/snapshot') return ok(this.company.snapshot());
      if (path === '/call') {
        const { value, seq } = this.company.execute(session.user, String(msg['method']), (msg['args'] as unknown[]) ?? []);
        return ok({ value: value ?? null, seq });
      }
      // /events: انتظار طويل حتى وصول حدث جديد
      const since = Number(msg['since'] ?? 0);
      const pick = () => {
        const first = this.ring[0]?.seq;
        if (first !== undefined && since < first - 1) return { resync: true };
        const events = this.ring.filter((e) => e.seq > since);
        return events.length ? { events } : null;
      };
      let result = pick();
      if (!result) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            this.waiters.delete(done);
            resolve();
          };
          const timer = setTimeout(done, LONG_POLL_MS);
          this.waiters.add(done);
          req.on('close', done);
        });
        result = pick() ?? { events: [] };
      }
      return ok(result);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      data += c;
      if (data.length > 20_000_000) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function localAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n): n is os.NetworkInterfaceInfo => !!n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
}

// ───────────── الجهاز الفرعي ─────────────

export class LanClient {
  private readonly key: Buffer;
  private token = '';
  private polling = false;

  constructor(
    readonly host: string,
    readonly port: number,
    pairingCode: string,
  ) {
    this.key = lanKey(pairingCode);
  }

  private async post<T>(path: string, payload: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const nonce = randomBytes(12).toString('hex');
    let res: Response;
    try {
      res = await fetch(`http://${this.host}:${this.port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seal(this.key, { ...payload, ts: Date.now(), nonce }, path)),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error('تعذر الاتصال بالجهاز الرئيسي. تأكد أنه يعمل وأنكما على نفس الشبكة.');
    }
    if (res.status === 401) throw new Error('رمز الربط غير صحيح، أو ساعة الجهاز مختلفة عن الجهاز الرئيسي');
    if (res.status !== 200) throw new Error('رد غير متوقع من الجهاز الرئيسي');
    let body: { ok: boolean; error?: string } & T;
    try {
      body = unseal(this.key, (await res.json()) as Envelope, `${path}|res|${nonce}`);
    } catch {
      throw new Error('رد غير صالح من الجهاز الرئيسي');
    }
    if (!body.ok) throw new Error(body.error ?? 'خطأ');
    return body;
  }

  hello(): Promise<{ name: string; id: string }> {
    return this.post('/hello', {});
  }

  async login(username: string, password: string, deviceId: string, deviceName: string): Promise<{ user: User; state: CompanyState; seq: number }> {
    const r = await this.post<{ token: string; user: User; state: CompanyState; seq: number }>('/login', { username, password, deviceId, deviceName }, 60_000);
    this.token = r.token;
    return r;
  }

  async call(method: string, args: unknown[]): Promise<{ value: unknown; seq: number }> {
    return this.post('/call', { token: this.token, method, args }, 60_000);
  }

  snapshot(): Promise<{ state: CompanyState; seq: number }> {
    return this.post('/snapshot', { token: this.token }, 60_000);
  }

  /** يستقبل الأحداث الجديدة باستمرار حتى استدعاء stop(). */
  startEvents(since: number, onEvents: (items: EventItem[]) => void, onResync: () => Promise<number>, onError: (e: Error) => void): void {
    this.polling = true;
    let cursor = since;
    const loop = async () => {
      while (this.polling) {
        try {
          const r = await this.post<{ events?: EventItem[]; resync?: boolean }>('/events', { token: this.token, since: cursor }, LONG_POLL_MS + 10_000);
          if (!this.polling) return;
          if (r.resync) cursor = await onResync();
          else if (r.events?.length) {
            onEvents(r.events);
            cursor = r.events[r.events.length - 1]!.seq;
          }
        } catch (e) {
          if (!this.polling) return;
          onError(e as Error);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };
    void loop();
  }

  async stop(): Promise<void> {
    this.polling = false;
    if (this.token) await this.post('/logout', { token: this.token }).catch(() => undefined);
    this.token = '';
  }
}
