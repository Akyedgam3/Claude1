// الجهاز البعيد (جوال بالبيت مثلاً): بيبعت طلبات للجهاز الرئيسي عبر السحابة وبيستقبل العمليات الجديدة أول بأول.
import { applyEvent, Ledger } from '../core/ledger';
import type { CompanyEvent, CompanyState, User } from '../core/types';
import type { EventItem } from '../app/lan';
import { execute, isSpecialMethod } from '../app/executor';
import type { CompanyStore } from '../storage/company-store';
import { eventId, QUEUE_PREFIX, SESSION_EXPIRED, type CloudRequest, type LatestInfo, type QueuedOp } from './host';
import { seal, unseal } from './seal';
import type { CloudRoom } from './code';
import type { CloudDoc, CloudTransport } from './transport';

export const OFFLINE = 'الجهاز الرئيسي غير متصل حالياً. تأكد أن البرنامج مفتوح عليه وأنه متصل بالإنترنت.';

/** عملية انعملت والجهاز الرئيسي مطفي، بانتظار تتنفّذ عليه. */
export interface PendingOp {
  id: string;
  method: string;
  at: number;
}

/** نتيجة العمليات المأجّلة لما يرجع الجهاز الرئيسي. */
export interface QueueReport {
  done: number;
  failed: { method: string; error: string }[];
}

/** بصمة كلمة السر المحلية: لفتح الشركة على الجوال والجهاز الرئيسي مطفي (بس إذا دخل بنفس الحساب قبل). */
export async function cloudVerifier(room: string, username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`wazn-offline|${room}|${username.trim().toLowerCase()}|${password}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Snapshot {
  seq: number;
  epoch: number;
  iv: string;
  parts: number;
}

export class CloudClient {
  private state: CompanyState | null = null;
  private seq = 0;
  private epoch = 0;
  private token = '';
  private offEvents: (() => void) | null = null;
  private offMeta: (() => void) | null = null;
  private resyncing: Promise<void> | null = null;
  private closed = false;
  private lastId = '';
  user: User | null = null;
  companyName = '';
  timeoutMs = 25_000;
  /** الجهاز الرئيسي مطفي: عم نشتغل على آخر نسخة، والعمليات الجديدة بتستنى. */
  offline = false;
  /** وقت آخر نسخة وصلت من الجهاز الرئيسي. */
  syncedAt = 0;
  /** العمليات المأجّلة اللي لسا ما وصلت نتيجتها. */
  pending: PendingOp[] = [];
  private onEvents: ((items: EventItem[]) => void) | null = null;
  /** تغيّر الوضع (مطفي/شغّال) أو عدد العمليات المأجّلة. */
  onMode: () => void = () => undefined;
  /** نتيجة العمليات المأجّلة بعد ما رجع الجهاز الرئيسي. */
  onQueueReport: (r: QueueReport) => void = () => undefined;

  constructor(
    private readonly t: CloudTransport,
    private readonly room: CloudRoom,
    private readonly creds: { username: string; password: string; deviceId: string; deviceName: string },
  ) {}

  /** يبعت طلب وينتظر الرد. */
  private async request<T>(req: CloudRequest, timeoutMs = this.timeoutMs): Promise<T & { ok: true }> {
    const id = `${Date.now().toString(36).padStart(9, '0')}${[...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    this.lastId = id;
    const r = this.room.room;
    const reply = new Promise<CloudDoc>((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        void this.t.del(r, 'req', id).catch(() => undefined);
        reject(new Error(OFFLINE));
      }, timeoutMs);
      const off = this.t.watchDoc(r, 'res', id, (d) => {
        if (!d) return;
        clearTimeout(timer);
        off();
        resolve(d);
      });
    });
    await this.t.set(r, 'req', id, { ...(await seal(this.room.key, `req/${id}`, req)), at: Date.now() });
    const doc = await reply;
    void this.t.del(r, 'res', id).catch(() => undefined);
    const res = await unseal<{ ok: boolean; error?: string; expired?: boolean } & T>(this.room.key, `res/${id}`, doc);
    if (!res.ok) {
      const e = new Error(res.error ?? 'خطأ') as Error & { expired?: boolean };
      e.expired = !!res.expired;
      throw e;
    }
    if ((res as unknown as Partial<Snapshot>).parts) this.applySnapshot(id, res as unknown as Snapshot, await this.readParts(id, res as unknown as Snapshot));
    return res as T & { ok: true };
  }

  private async readParts(id: string, snap: Snapshot): Promise<CompanyState> {
    const r = this.room.room;
    const parts: string[] = [];
    for (let i = 0; i < snap.parts; i++) {
      const d = await this.t.get(r, 'snap', `${id}_${i}`);
      if (!d?.ct) throw new Error('ما وصلت بيانات الشركة كاملة، جرّب مرة ثانية');
      parts.push(d.ct);
    }
    for (let i = 0; i < snap.parts; i++) void this.t.del(r, 'snap', `${id}_${i}`).catch(() => undefined);
    return unseal<CompanyState>(this.room.key, `snap/${id}`, { iv: snap.iv, ct: parts.join('') });
  }

  private applySnapshot(_id: string, snap: Snapshot, state: CompanyState): void {
    this.state = state;
    this.seq = snap.seq;
    this.epoch = snap.epoch;
    this.syncedAt = Date.now();
  }

  /** بصمة كلمة السر لهالحساب (بتنحفظ بعد أول دخول ناجح). */
  verifier(): Promise<string> {
    return cloudVerifier(this.room.room, this.creds.username, this.creds.password);
  }

  /**
   * الجهاز الرئيسي مطفي: منفتح آخر نسخة محفوظة بالسحابة مع العمليات اللي بعدها.
   * لازم يكون هالحساب دخل من هالجوال قبل (منتحقق من كلمة السر محلياً).
   */
  async openOffline(expectedVerifier: string | null | undefined, pending: PendingOp[] = []): Promise<{ user: User; companyName: string; state: CompanyState; seq: number }> {
    if (!expectedVerifier || (await this.verifier()) !== expectedVerifier) {
      throw new Error('الجهاز الرئيسي مطفي حالياً. لتشتغل وهو مطفي لازم تكون داخل بهالحساب من هالجوال مرة وحدة على الأقل وهو شغّال، وكلمة السر نفسها.');
    }
    const r = this.room.room;
    const meta = await this.t.get(r, 'meta', 'latest');
    if (!meta?.ct) throw new Error(OFFLINE);
    const info = await unseal<LatestInfo>(this.room.key, 'meta/latest', meta);
    const parts: string[] = [];
    for (let i = 0; i < info.parts; i++) {
      const d = await this.t.get(r, 'snap', `${info.prefix}${i}`);
      if (!d?.ct) throw new Error('النسخة المحفوظة عم تتحدّث هلق، جرّب بعد شوي');
      parts.push(d.ct);
    }
    this.state = await unseal<CompanyState>(this.room.key, 'snap/latest', { iv: info.iv, ct: parts.join('') });
    this.seq = info.seq;
    this.epoch = info.epoch;
    this.syncedAt = info.at;
    // العمليات اللي صارت بعد النسخة (لآخر لحظة كان فيها الجهاز الرئيسي شغّال)
    const prefix = `${String(info.epoch).padStart(13, '0')}_`;
    for (const id of await this.t.list(r, 'events')) {
      if (!id.startsWith(prefix) || id <= eventId(info.epoch, info.seq)) continue;
      const d = await this.t.get(r, 'events', id);
      if (!d) continue;
      const items = await unseal<EventItem[]>(this.room.key, `events/${id}`, d).catch(() => [] as EventItem[]);
      const fresh = items.filter((it) => it.seq > this.seq);
      if (!fresh.length || fresh[0]!.seq !== this.seq + 1) continue;
      for (const it of fresh) applyEvent(this.state, it.event);
      this.seq = fresh[fresh.length - 1]!.seq;
      this.syncedAt = Math.max(this.syncedAt, d.at ?? 0);
    }
    const name = this.creds.username.trim().toLowerCase();
    const user = Object.values(this.state.users).find((u) => u.username.toLowerCase() === name && u.active);
    if (!user) throw new Error('هذا المستخدم موقوف');
    this.user = user;
    this.companyName = this.state.info?.name ?? '';
    this.offline = true;
    this.pending = [...pending];
    return { user, companyName: this.companyName, state: this.state, seq: this.seq };
  }

  /**
   * عملية والجهاز الرئيسي مطفي: بتتسجّل بالسحابة لتتنفّذ عليه لما يرجع، وبتبيّن هون فوراً
   * (منجرّبها على نسخة من البيانات بنفس الصلاحيات قبل ما نسجّلها).
   */
  private async runLocal(method: string, args: unknown[]): Promise<{ value: unknown; seq: number }> {
    if (!this.state || !this.user) throw new Error('غير متصل');
    if (isSpecialMethod(method)) throw new Error('هالعملية بتحتاج الجهاز الرئيسي يكون شغّال');
    const run = (state: CompanyState, sink: (e: CompanyEvent) => void) => {
      const ledger = new Ledger(sink, state);
      return execute({ ledger, lastSeq: this.seq } as unknown as CompanyStore, this.user!, method, structuredClone(args));
    };
    run(structuredClone(this.state), () => undefined); // تجربة: إذا في خطأ (رصيد، صلاحية...) ما منسجّل شي
    const id = `${QUEUE_PREFIX}${Date.now().toString(36).padStart(9, '0')}${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    const op: QueuedOp = { op: 'queued', username: this.creds.username, password: this.creds.password, method, args, at: Date.now() };
    try {
      await this.t.set(this.room.room, 'req', id, { ...(await seal(this.room.key, `req/${id}`, op)), at: op.at });
    } catch {
      throw new Error('ما في إنترنت على الجوال. العملية ما انحفظت، جرّب لما يرجع النت.');
    }
    const events: EventItem[] = [];
    const { value } = run(this.state, (event) => events.push({ event, seq: this.seq + events.length + 1 }));
    if (events.length) this.seq = events[events.length - 1]!.seq;
    this.pending.push({ id, method, at: op.at });
    if (events.length) this.onEvents?.(events);
    this.onMode();
    return { value: value ?? null, seq: this.seq };
  }

  /** لما يرجع الجهاز الرئيسي: منستنى نتيجة كل عملية مأجّلة ومنبلّغ عنها. */
  collectQueued(): void {
    const ops = [...this.pending];
    if (!ops.length) return;
    const report: QueueReport = { done: 0, failed: [] };
    let left = ops.length;
    const finish = (op: PendingOp, error?: string) => {
      this.pending = this.pending.filter((p) => p.id !== op.id);
      if (error) report.failed.push({ method: op.method, error });
      else report.done++;
      if (--left === 0) {
        this.onMode();
        this.onQueueReport(report);
      }
    };
    for (const op of ops) {
      const off = this.t.watchDoc(this.room.room, 'res', op.id, (d) => {
        if (!d) return;
        off();
        void (async () => {
          try {
            const res = await unseal<{ ok: boolean; error?: string }>(this.room.key, `res/${op.id}`, d);
            finish(op, res.ok ? undefined : (res.error ?? 'خطأ'));
          } catch {
            finish(op, 'ما قدرنا نقرا النتيجة');
          }
          void this.t.del(this.room.room, 'res', op.id).catch(() => undefined);
        })();
      });
    }
  }

  /** فحص سريع إنو الجهاز الرئيسي شغّال ورمز الاتصال صح. */
  ping(): Promise<{ name: string }> {
    return this.request<{ name: string }>({ op: 'ping' }, 15_000);
  }

  async login(): Promise<{ user: User; companyName: string; state: CompanyState; seq: number }> {
    const r = await this.request<{ token: string; user: User; name: string }>({ op: 'login', ...this.creds }, 90_000);
    this.token = r.token;
    this.user = r.user;
    this.companyName = r.name;
    return { user: r.user, companyName: r.name, state: this.state!, seq: this.seq };
  }

  snapshot(): { state: CompanyState; seq: number } {
    if (!this.state) throw new Error('غير متصل');
    return { state: this.state, seq: this.seq };
  }

  /** عملية باسم المستخدم؛ إذا الجهاز الرئيسي انفتح من جديد منسجّل دخول تلقائياً ومنعيد. */
  async call(method: string, args: unknown[]): Promise<{ value: unknown; seq: number }> {
    if (this.offline) return this.runLocal(method, args);
    try {
      return await this.request<{ value: unknown; seq: number }>({ op: 'call', token: this.token, method, args });
    } catch (e) {
      if ((e as Error).message === OFFLINE && this.state && this.user) {
        // الجهاز الرئيسي طفي بنص الشغل: منكمّل على آخر نسخة ومنأجّل العملية
        this.offline = true;
        this.onMode();
        return this.runLocal(method, args);
      }
      if (!(e as { expired?: boolean }).expired) throw e;
      await this.relogin();
      return this.request<{ value: unknown; seq: number }>({ op: 'call', token: this.token, method, args });
    }
  }

  /** نسخة احتياطية كاملة من الجهاز الرئيسي (ملف .wazn بينفتح على أي جهاز). */
  async backup(): Promise<Uint8Array> {
    if (this.offline) throw new Error('النسخة الاحتياطية بتنعمل من الجهاز الرئيسي، ولازم يكون شغّال');
    const ask = () => this.request<{ backupIv: string; backupParts: number }>({ op: 'backup', token: this.token }, 180_000);
    let r: { backupIv: string; backupParts: number };
    try {
      r = await ask();
    } catch (e) {
      if (!(e as { expired?: boolean }).expired) throw e;
      await this.relogin();
      r = await ask();
    }
    const parts: string[] = [];
    const reqId = this.lastId;
    for (let i = 0; i < r.backupParts; i++) {
      const d = await this.t.get(this.room.room, 'snap', `B${reqId}_${i}`);
      if (!d?.ct) throw new Error('ما وصلت النسخة كاملة، جرّب مرة ثانية');
      parts.push(d.ct);
    }
    for (let i = 0; i < r.backupParts; i++) void this.t.del(this.room.room, 'snap', `B${reqId}_${i}`).catch(() => undefined);
    const b64 = await unseal<string>(this.room.key, `backup/${reqId}`, { iv: r.backupIv, ct: parts.join('') });
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  private async relogin(): Promise<void> {
    const r = await this.request<{ token: string; user: User }>({ op: 'login', ...this.creds }, 90_000);
    this.token = r.token;
    this.user = r.user;
  }

  /** يستقبل العمليات الجديدة؛ onReset لما لازم تنعاد الحالة كاملة (تصفير، أو الجهاز الرئيسي انفتح من جديد). */
  listen(onEvents: (items: EventItem[]) => void, onReset: () => void, onError: (message: string) => void): void {
    const r = this.room.room;
    this.onEvents = onEvents;
    const resync = () => {
      if (this.resyncing || this.closed) return;
      this.resyncing = (async () => {
        try {
          try {
            await this.request({ op: 'state', token: this.token }, 90_000);
          } catch (e) {
            if (!(e as { expired?: boolean }).expired) throw e;
            await this.relogin(); // الدخول بيرجّع الحالة كمان
          }
          this.watchEvents(onEvents, resync);
          onReset();
          if (this.offline) {
            // رجع الجهاز الرئيسي: البيانات صارت منه، والعمليات المأجّلة عم تتنفّذ عليه
            this.offline = false;
            this.onMode();
            this.collectQueued();
          }
        } catch (e) {
          if (this.offline) return; // لسا مطفي أو عم يقلع
          onError((e as Error).message);
        } finally {
          this.resyncing = null;
        }
      })();
    };
    this.offMeta = this.t.watchDoc(r, 'meta', 'host', (d) => {
      if (d?.epoch && d.epoch !== this.epoch) resync();
    });
    this.watchEvents(onEvents, resync);
  }

  private watchEvents(onEvents: (items: EventItem[]) => void, resync: () => void): void {
    this.offEvents?.();
    const epoch = this.epoch;
    const prefix = `${String(epoch).padStart(13, '0')}_`;
    this.offEvents = this.t.watch(this.room.room, 'events', eventId(epoch, this.seq), (docs) => {
      void (async () => {
        for (const d of docs) {
          if (this.epoch !== epoch || this.resyncing) return;
          if (!d.id.startsWith(prefix)) return resync();
          if ((d.data.last ?? 0) <= this.seq) continue;
          let items: EventItem[];
          try {
            items = await unseal<EventItem[]>(this.room.key, `events/${d.id}`, d.data);
          } catch {
            continue;
          }
          const fresh = items.filter((it) => it.seq > this.seq);
          if (!fresh.length) continue;
          if (fresh[0]!.seq !== this.seq + 1) return resync(); // فجوة (دفعات قديمة انحذفت)
          for (const it of fresh) applyEvent(this.state!, it.event);
          this.seq = fresh[fresh.length - 1]!.seq;
          onEvents(fresh);
        }
      })();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.offEvents?.();
    this.offMeta?.();
    if (this.token) await this.request({ op: 'logout', token: this.token }, 5000).catch(() => undefined);
    this.token = '';
  }
}
