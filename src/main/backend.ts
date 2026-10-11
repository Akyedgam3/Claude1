import type { CompanyState, User } from '../core/types';
import { execute } from '../app/executor';
import { LanClient, type EventItem } from '../app/lan';
import type { CompanyStore } from '../storage/company-store';

/** الشركة المفتوحة: محلياً على هذا الجهاز، أو عن بعد على الجهاز الرئيسي في الشبكة. */
export interface Backend {
  readonly kind: 'local' | 'remote';
  readonly user: User;
  readonly companyName: string;
  snapshot(): Promise<{ state: CompanyState; seq: number }>;
  call(method: string, args: unknown[]): Promise<{ value: unknown; seq: number }>;
  /** مشترك واحد (العملية الرئيسية) يمرر الأحداث للواجهة. */
  listen(onEvents: (items: EventItem[]) => void, onReset: () => void, onError: (message: string) => void): void;
  close(): Promise<void>;
}

export class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  private unsubscribe: (() => void) | null = null;

  constructor(readonly store: CompanyStore) {}

  get user(): User {
    return this.store.ledger.state.users[this.store.user.id] ?? this.store.user;
  }

  get companyName(): string {
    return this.store.ledger.state.info?.name ?? this.store.meta.name;
  }

  async snapshot() {
    return { state: this.store.ledger.state, seq: this.store.lastSeq };
  }

  async call(method: string, args: unknown[]) {
    return execute(this.store, this.user, method, args);
  }

  listen(onEvents: (items: EventItem[]) => void): void {
    this.unsubscribe?.();
    this.unsubscribe = this.store.onEvent((event, seq) => onEvents([{ event, seq }]));
  }

  async close(): Promise<void> {
    this.unsubscribe?.();
    if (!this.store.isOpen) return;
    try {
      this.store.backup(); // نسخة احتياطية تلقائية عند كل إغلاق
    } finally {
      this.store.close();
    }
  }
}

export class RemoteBackend implements Backend {
  readonly kind = 'remote' as const;
  private seq: number;

  constructor(
    private readonly client: LanClient,
    readonly user: User,
    readonly companyName: string,
    private state: CompanyState,
    seq: number,
  ) {
    this.seq = seq;
  }

  get address(): string {
    return `${this.client.host}:${this.client.port}`;
  }

  async snapshot() {
    return { state: this.state, seq: this.seq };
  }

  async call(method: string, args: unknown[]) {
    return this.client.call(method, args);
  }

  listen(onEvents: (items: EventItem[]) => void, onReset: () => void, onError: (message: string) => void): void {
    this.client.startEvents(
      this.seq,
      (items) => {
        this.seq = items[items.length - 1]!.seq;
        onEvents(items);
      },
      async () => {
        const snap = await this.client.snapshot();
        this.state = snap.state;
        this.seq = snap.seq;
        onReset();
        return snap.seq;
      },
      (e) => onError(e.message),
    );
  }

  async close(): Promise<void> {
    await this.client.stop();
  }
}
