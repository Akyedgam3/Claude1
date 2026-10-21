// الجهاز البعيد (جوال بالبيت مثلاً): بيبعت طلبات للجهاز الرئيسي عبر السحابة وبيستقبل العمليات الجديدة أول بأول.
import { applyEvent } from '../core/ledger';
import type { CompanyState, User } from '../core/types';
import type { EventItem } from '../app/lan';
import { eventId, SESSION_EXPIRED, type CloudRequest } from './host';
import { seal, unseal } from './seal';
import type { CloudRoom } from './code';
import type { CloudDoc, CloudTransport } from './transport';

const OFFLINE = 'الجهاز الرئيسي غير متصل حالياً. تأكد أن البرنامج مفتوح عليه وأنه متصل بالإنترنت.';

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
  user: User | null = null;
  companyName = '';
  timeoutMs = 25_000;

  constructor(
    private readonly t: CloudTransport,
    private readonly room: CloudRoom,
    private readonly creds: { username: string; password: string; deviceId: string; deviceName: string },
  ) {}

  /** يبعت طلب وينتظر الرد. */
  private async request<T>(req: CloudRequest, timeoutMs = this.timeoutMs): Promise<T & { ok: true }> {
    const id = `${Date.now().toString(36).padStart(9, '0')}${[...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
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
    try {
      return await this.request<{ value: unknown; seq: number }>({ op: 'call', token: this.token, method, args });
    } catch (e) {
      if (!(e as { expired?: boolean }).expired) throw e;
      await this.relogin();
      return this.request<{ value: unknown; seq: number }>({ op: 'call', token: this.token, method, args });
    }
  }

  private async relogin(): Promise<void> {
    const r = await this.request<{ token: string; user: User }>({ op: 'login', ...this.creds }, 90_000);
    this.token = r.token;
    this.user = r.user;
  }

  /** يستقبل العمليات الجديدة؛ onReset لما لازم تنعاد الحالة كاملة (تصفير، أو الجهاز الرئيسي انفتح من جديد). */
  listen(onEvents: (items: EventItem[]) => void, onReset: () => void, onError: (message: string) => void): void {
    const r = this.room.room;
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
        } catch (e) {
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
