import { randomBytes } from 'node:crypto';
import { DEFAULT_LAN_PORT, LONG_POLL_MS, lanKey, seal, unseal, type Envelope, type EventItem } from './lan-proto';
export { DEFAULT_LAN_PORT, LanClient, lanKey, type EventItem, type LanFetch } from './lan-proto';
import dgram from 'node:dgram';
import http from 'node:http';
import os from 'node:os';
import type { CompanyEvent, CompanyState, User } from '../core/types';

// العمل على أكثر من جهاز في الشبكة المحلية بدون إنترنت:
// الجهاز الرئيسي يحفظ البيانات ويشغّل خادماً صغيراً، والأجهزة الأخرى تتصل به.
// كل الرسائل مشفّرة (AES-256-GCM) بمفتاح مشتق من "رمز الربط" الظاهر على الجهاز الرئيسي،
// ومربوطة بالوقت ورقم عشوائي لمنع إعادة إرسالها، ثم يدخل كل مستخدم باسمه وكلمة سره.

/** البحث عن الجهاز الرئيسي بالشبكة (UDP): الجهاز الفرعي بينادي، والرئيسي بيرد باسم الشركة والمنفذ. */
export const DISCOVERY_PORT = 47101;
const DISCOVER_MSG = 'wazn-discover-v1';
const MAX_SKEW_MS = 2 * 60_000;
const RING_SIZE = 2000;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newPairingCode(): string {
  return [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('').replace(/^(.{4})/, '$1-');
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
  /** هل المستخدم ما زال فعّالاً (يُوقف المستخدم المعطّل فوراً على كل الأجهزة). */
  userActive?(userId: string): boolean;
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
  private beacon: dgram.Socket | null = null;

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
    this.startBeacon(port);
    return { port, addresses: localAddresses() };
  }

  /** بيرد على البحث بالشبكة باسم الشركة ومعرّفها والمنفذ بس (الدخول نفسه بيضل برمز الربط وكلمة السر). */
  private startBeacon(port: number): void {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', () => {
      // المنفذ محجوز (نسخة تانية من البرنامج مثلاً): البحث ما بيشتغل بس الاتصال بالعنوان بيضل شغّال
      sock.close();
      if (this.beacon === sock) this.beacon = null;
    });
    sock.on('message', (msg, rinfo) => {
      if (msg.toString() !== DISCOVER_MSG) return;
      const reply = JSON.stringify({ app: 'wazn', name: this.company.name, id: this.company.id, port });
      sock.send(reply, rinfo.port, rinfo.address);
    });
    sock.bind(DISCOVERY_PORT);
    this.beacon = sock;
  }

  stop(): void {
    this.beacon?.close();
    this.beacon = null;
    this.unsubscribe?.();
    for (const w of [...this.waiters]) w();
    this.server?.close();
    this.server?.closeAllConnections?.();
    this.server = null;
    this.sessions.clear();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const path = req.url ?? '';
    // الجوال (تطبيق وزن) بيبعت من صفحة ويب، فبدو إذن CORS. الأمان مش من هون: كل رسالة مشفّرة برمز الربط
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const reply = (status: number, body: unknown, nonce = '') => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
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
      if (this.company.userActive && !this.company.userActive(session.user.id)) {
        this.sessions.delete(session.token);
        return err('هذا المستخدم موقوف');
      }
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
        // الجهاز الرئيسي صفّر الشركة: السجل رجع لورا، فلازم الجهاز ياخد الحالة من جديد
        if (since > this.company.snapshot().seq) return { resync: true };
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

/** جهاز رئيسي لقيناه بالشبكة. */
export interface FoundHost {
  host: string;
  port: number;
  name: string;
  id: string;
}

/** عناوين البث لكل شبكة متصل فيها الجهاز (192.168.1.255 مثلاً). */
function broadcastAddresses(): string[] {
  const out = new Set<string>(['255.255.255.255']);
  for (const n of Object.values(os.networkInterfaces()).flat()) {
    if (!n || n.family !== 'IPv4' || n.internal) continue;
    const ip = n.address.split('.').map(Number);
    const mask = n.netmask.split('.').map(Number);
    out.add(ip.map((b, i) => (b & mask[i]!) | (~mask[i]! & 255)).join('.'));
  }
  return [...out];
}

/** بيدوّر على الأجهزة الرئيسية (وضع الخادم مفعّل) بنفس الشبكة. */
export function discoverHosts(timeoutMs = 1500, targets = broadcastAddresses()): Promise<FoundHost[]> {
  return new Promise((resolve) => {
    const found = new Map<string, FoundHost>();
    const sock = dgram.createSocket('udp4');
    const done = () => {
      try {
        sock.close();
      } catch {
        // انسكر
      }
      resolve([...found.values()]);
    };
    sock.on('error', done);
    sock.on('message', (msg, rinfo) => {
      try {
        const r = JSON.parse(msg.toString()) as { app?: string; name?: string; id?: string; port?: number };
        if (r.app !== 'wazn' || typeof r.port !== 'number') return;
        found.set(`${rinfo.address}:${r.port}`, { host: rinfo.address, port: r.port, name: String(r.name ?? ''), id: String(r.id ?? '') });
      } catch {
        // رد مش من وزن
      }
    });
    sock.bind(0, () => {
      sock.setBroadcast(true);
      for (const t of targets) sock.send(DISCOVER_MSG, DISCOVERY_PORT, t, () => undefined);
      setTimeout(done, timeoutMs);
    });
  });
}

