// بروتوكول الشبكة المحلية (التشفير والجهاز الفرعي) بدون أي شي من الخادم (http/udp):
// نفس الملف بيشتغل بالكمبيوتر وبتطبيق الجوال (الجوال بيوصل للجهاز الرئيسي عبر CapacitorHttp).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { CompanyEvent, CompanyState, User } from '../core/types';

export const DEFAULT_LAN_PORT = 47100;
export const LONG_POLL_MS = 25_000;

export function lanKey(pairingCode: string): Buffer {
  const clean = pairingCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return scryptSync(clean, 'mizan-lan-v1', 32, { N: 1 << 14, r: 8, p: 1 });
}

export interface Envelope {
  iv: string;
  ct: string;
  tag: string;
}

export function seal(key: Buffer, data: unknown, aad: string): Envelope {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64') };
}

export function unseal<T>(key: Buffer, env: Envelope, aad: string): T {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(env.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(env.ct, 'base64')), d.final()]).toString('utf8')) as T;
}

export interface EventItem {
  event: CompanyEvent;
  seq: number;
}

/** طريقة إرسال الطلب (fetch بالكمبيوتر، والـ HTTP الأصلي بالجوال لأن المتصفح بيمنع http من https). */
export type LanFetch = (url: string, body: string, timeoutMs: number) => Promise<{ status: number; json: () => Promise<unknown> }>;

const defaultFetch: LanFetch = async (url, body, timeoutMs) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, json: () => res.json() };
};

// ───────────── الجهاز الفرعي ─────────────

export class LanClient {
  private readonly key: Buffer;
  private token = '';
  private polling = false;

  constructor(
    readonly host: string,
    readonly port: number,
    pairingCode: string,
    private readonly send: LanFetch = defaultFetch,
  ) {
    this.key = lanKey(pairingCode);
  }

  private async post<T>(path: string, payload: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const nonce = randomBytes(12).toString('hex');
    let res: { status: number; json: () => Promise<unknown> };
    try {
      res = await this.send(`http://${this.host}:${this.port}${path}`, JSON.stringify(seal(this.key, { ...payload, ts: Date.now(), nonce }, path)), timeoutMs);
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
