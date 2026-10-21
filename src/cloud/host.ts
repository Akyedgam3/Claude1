// الجهاز الرئيسي (اللي عليه البيانات) بيخدم الأجهزة البعيدة عبر السحابة:
// بيرفع العمليات الجديدة مشفّرة، وبيستقبل الطلبات (دخول، حالة، عملية) وبينفّذها بنفس صلاحيات المستخدم.
// السحابة ما بتشوف غير بيانات مشفّرة بمفتاح من رمز الاتصال.
import type { CompanyState, User } from '../core/types';
import type { EventItem } from '../app/lan';
import { seal, unseal } from './seal';
import type { CloudRoom } from './code';
import type { CloudTransport } from './transport';

/** اللي بيحتاجه الجهاز الرئيسي من الشركة المفتوحة (بالكمبيوتر عبر العملية الرئيسية). */
export interface CloudCompany {
  name(): string;
  login(username: string, password: string, deviceId: string, deviceName: string): Promise<{ token: string; user: User }>;
  snapshot(token: string): Promise<{ state: CompanyState; seq: number }>;
  call(token: string, method: string, args: unknown[]): Promise<{ value: unknown; seq: number }>;
  logout(token: string): Promise<void>;
}

export type CloudRequest =
  | { op: 'ping' }
  | { op: 'login'; username: string; password: string; deviceId: string; deviceName: string }
  | { op: 'state'; token: string }
  | { op: 'call'; token: string; method: string; args: unknown[] }
  | { op: 'logout'; token: string };

export const SESSION_EXPIRED = 'انتهت الجلسة على الجهاز الرئيسي';
export const PART_CHARS = 700_000; // أقل من حد Firestore (1MB للوثيقة)
const MAX_DOC_CHARS = 900_000;
const BATCH_ITEMS = 300;
const FLUSH_MS = 700;
const KEEP_BATCHES = 400;
const STALE_MS = 2 * 60_000;
const HEARTBEAT_MS = 30 * 60_000;

export const pad = (n: number, w = 10) => String(n).padStart(w, '0');
export const eventId = (epoch: number, last: number) => `${pad(epoch, 13)}_${pad(last)}`;

export class CloudHost {
  private epoch = 0;
  private pending: EventItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> = Promise.resolve();
  private chain: Promise<unknown> = Promise.resolve();
  private written: string[] = [];
  private offReq: (() => void) | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  onError: (message: string) => void = () => undefined;

  constructor(
    private readonly t: CloudTransport,
    private readonly room: CloudRoom,
    private readonly company: CloudCompany,
  ) {}

  async start(): Promise<void> {
    // بقايا التشغيلة الماضية: الأجهزة البعيدة بتاخد الحالة من جديد
    for (const coll of ['events', 'req', 'res', 'snap'] as const) {
      for (const id of await this.t.list(this.room.room, coll)) await this.t.del(this.room.room, coll, id);
    }
    await this.newEpoch();
    this.offReq = this.t.watch(this.room.room, 'req', null, (docs) => {
      for (const d of docs) this.chain = this.chain.then(() => this.handle(d.id, d.data)).catch((e: Error) => this.onError(e.message));
    });
    this.beat = setInterval(() => void this.writeMeta().catch(() => undefined), HEARTBEAT_MS);
  }

  stop(): void {
    this.stopped = true;
    this.offReq?.();
    if (this.beat) clearInterval(this.beat);
    if (this.timer) clearTimeout(this.timer);
  }

  /** العمليات الجديدة على الجهاز الرئيسي (من أي جهاز). */
  push(items: EventItem[]): void {
    if (this.stopped || !items.length) return;
    this.pending.push(...items);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
  }

  /** الشركة تصفّرت: الأجهزة البعيدة لازم تاخد الحالة من جديد. */
  async reset(): Promise<void> {
    this.pending = [];
    await this.flushing;
    await this.restart();
  }

  private async restart(): Promise<void> {
    const old = this.written;
    this.written = [];
    await this.newEpoch();
    for (const id of old) await this.t.del(this.room.room, 'events', id).catch(() => undefined);
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const items = this.pending;
    this.pending = [];
    this.flushing = this.flushing.then(() => this.upload(items)).catch((e: Error) => this.onError(e.message));
    return this.flushing;
  }

  private async upload(items: EventItem[]): Promise<void> {
    if (this.stopped) return;
    for (let i = 0; i < items.length; i += BATCH_ITEMS) await this.uploadBatch(items.slice(i, i + BATCH_ITEMS));
    if (this.written.length > KEEP_BATCHES) {
      const old = this.written.splice(0, this.written.length - KEEP_BATCHES / 2);
      for (const id of old) await this.t.del(this.room.room, 'events', id).catch(() => undefined);
    }
  }

  private async uploadBatch(items: EventItem[]): Promise<void> {
    if (!items.length) return;
    const id = eventId(this.epoch, items[items.length - 1]!.seq);
    const sealed = await seal(this.room.key, `events/${id}`, items);
    if (sealed.ct.length > MAX_DOC_CHARS) {
      // عملية ضخمة (استيراد آلاف المواد مثلاً): منقسمها، وإذا كانت وحدة لحالها منخلي الأجهزة تاخد الحالة كاملة
      if (items.length === 1) return this.restart();
      const half = Math.ceil(items.length / 2);
      await this.uploadBatch(items.slice(0, half));
      return this.uploadBatch(items.slice(half));
    }
    await this.t.set(this.room.room, 'events', id, { ...sealed, last: items[items.length - 1]!.seq });
    this.written.push(id);
  }

  private async newEpoch(): Promise<void> {
    this.epoch = Math.max(Date.now(), this.epoch + 1);
    await this.writeMeta();
  }

  private async writeMeta(): Promise<void> {
    const sealed = await seal(this.room.key, 'meta/host', { name: this.company.name() });
    await this.t.set(this.room.room, 'meta', 'host', { ...sealed, epoch: this.epoch, seen: Date.now() });
  }

  private async handle(id: string, doc: { iv?: string; ct?: string; at?: number }): Promise<void> {
    if (this.stopped) return;
    await this.t.del(this.room.room, 'req', id);
    if (!doc.at || Math.abs(Date.now() - doc.at) > STALE_MS) return;
    let req: CloudRequest;
    try {
      req = await unseal<CloudRequest>(this.room.key, `req/${id}`, doc);
    } catch {
      return; // مو من جهاز معه الرمز
    }
    let res: Record<string, unknown>;
    try {
      res = { ok: true, ...(await this.run(id, req)) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res = { ok: false, error: message, ...(message === SESSION_EXPIRED ? { expired: true } : {}) };
    }
    await this.t.set(this.room.room, 'res', id, { ...(await seal(this.room.key, `res/${id}`, res)), at: Date.now() });
  }

  private async run(id: string, req: CloudRequest): Promise<Record<string, unknown>> {
    switch (req.op) {
      case 'ping':
        return { name: this.company.name(), epoch: this.epoch };
      case 'login': {
        const { token, user } = await this.company.login(String(req.username ?? ''), String(req.password ?? ''), String(req.deviceId ?? ''), String(req.deviceName ?? 'جوال'));
        return { token, user, name: this.company.name(), ...(await this.sendSnapshot(id, token)) };
      }
      case 'state':
        return this.sendSnapshot(id, String(req.token));
      case 'call': {
        const { value, seq } = await this.company.call(String(req.token), String(req.method), Array.isArray(req.args) ? req.args : []);
        // العمليات بتوصل قبل الرد، فالجهاز البعيد بيشوف النتيجة فوراً
        await this.flush();
        return { value: value ?? null, seq };
      }
      case 'logout':
        await this.company.logout(String(req.token));
        return {};
      default:
        throw new Error('طلب غير معروف');
    }
  }

  /** الحالة الكاملة بقطع (Firestore ما بيقبل وثيقة أكبر من 1MB). */
  private async sendSnapshot(id: string, token: string): Promise<Record<string, unknown>> {
    await this.flush();
    const snap = await this.company.snapshot(token);
    const sealed = await seal(this.room.key, `snap/${id}`, snap.state);
    const parts = Math.max(1, Math.ceil(sealed.ct.length / PART_CHARS));
    for (let i = 0; i < parts; i++) await this.t.set(this.room.room, 'snap', `${id}_${i}`, { ct: sealed.ct.slice(i * PART_CHARS, (i + 1) * PART_CHARS), at: Date.now() });
    return { seq: snap.seq, epoch: this.epoch, iv: sealed.iv, parts };
  }
}
