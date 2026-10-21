import type { User } from '../core/types';
import type { CompanyStore } from '../storage/company-store';
import { SESSION_EXPIRED } from '../cloud/host';
import { execute } from './executor';

// جلسات الأجهزة البعيدة (الاتصال عن بعد) على الجهاز الرئيسي.
// كلمة السر بتتحقق هون، وكل عملية بتتنفذ باسم صاحب الجلسة وبصلاحياته متل الشبكة المحلية تماماً.

const ACTIVE_MS = 30 * 60_000;
/** الخدمة مدفوعة لحالها: جوالين عن بعد على الأقل (بالبيت وبالمحل) مهما كان عدد أجهزة الترخيص. */
export const CLOUD_MIN_DEVICES = 2;

interface Session {
  user: User;
  deviceId: string;
  deviceName: string;
  lastSeen: number;
}

export class CloudSessions {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly store: () => CompanyStore,
    private readonly maxClients: () => number,
  ) {}

  login(username: string, password: string, deviceId: string, deviceName: string): { token: string; user: User } {
    const store = this.store();
    const user = store.verify(username, password);
    if (!user) throw new Error('اسم المستخدم أو كلمة السر غير صحيحة');
    const now = Date.now();
    const others = new Set([...this.sessions.values()].filter((s) => s.deviceId !== deviceId && now - s.lastSeen < ACTIVE_MS).map((s) => s.deviceId));
    if (others.size >= this.maxClients()) throw new Error('تم الوصول للحد الأقصى من الأجهزة المسموحة في الترخيص');
    for (const [t, s] of this.sessions) if (s.deviceId === deviceId) this.sessions.delete(t);
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
    this.sessions.set(token, { user, deviceId, deviceName: deviceName.slice(0, 60), lastSeen: now });
    return { token, user };
  }

  private session(token: string): Session {
    const s = this.sessions.get(token);
    if (!s) throw new Error(SESSION_EXPIRED);
    if (!this.store().ledger.state.users[s.user.id]?.active) {
      this.sessions.delete(token);
      throw new Error('هذا المستخدم موقوف');
    }
    s.lastSeen = Date.now();
    return s;
  }

  snapshot(token: string) {
    this.session(token);
    const store = this.store();
    return { state: store.ledger.state, seq: store.lastSeq };
  }

  call(token: string, method: string, args: unknown[]) {
    const s = this.session(token);
    const store = this.store();
    const local = store.ledger.actor;
    try {
      return execute(store, s.user, method, args);
    } finally {
      store.ledger.actor = local; // عمليات الجهاز نفسه بتضل باسم مستخدمه
    }
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }

  devices(): { deviceName: string; user: string; lastSeen: number }[] {
    const cutoff = Date.now() - ACTIVE_MS;
    return [...this.sessions.values()].filter((s) => s.lastSeen > cutoff).map((s) => ({ deviceName: s.deviceName, user: s.user.displayName, lastSeen: s.lastSeen }));
  }

  clear(): void {
    this.sessions.clear();
  }
}
