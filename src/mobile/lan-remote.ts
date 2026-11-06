// الجوال كجهاز فرعي بالشبكة المحلية (متل الكمبيوتر الفرعي): بيوصل للكمبيوتر الرئيسي بنفس البروتوكول المشفّر.
// الطلبات بتمشي عبر CapacitorHttp (HTTP أصلي من أندرويد) لأن صفحة التطبيق https والجهاز الرئيسي http.
import { CapacitorHttp } from '@capacitor/core';
import { applyEvent } from '../core/ledger';
import type { CompanyState, User } from '../core/types';
import { LanClient, type EventItem, type LanFetch } from '../app/lan-proto';

export const nativeLanFetch: LanFetch = async (url, body, timeoutMs) => {
  const r = await CapacitorHttp.request({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.parse(body) as unknown,
    connectTimeout: Math.min(timeoutMs, 8000),
    readTimeout: timeoutMs,
    responseType: 'json',
  });
  return { status: r.status, json: async () => (typeof r.data === 'string' ? (JSON.parse(r.data) as unknown) : (r.data as unknown)) };
};

export class LanRemote {
  private seq: number;
  constructor(
    readonly client: LanClient,
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

  call(method: string, args: unknown[]) {
    return this.client.call(method, args);
  }

  listen(onEvents: (items: EventItem[]) => void, onReset: () => void, onError: (message: string) => void): void {
    this.client.startEvents(
      this.seq,
      (items) => {
        for (const it of items) if (it.seq > this.seq) applyEvent(this.state, it.event);
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

  close(): Promise<void> {
    return this.client.stop();
  }
}
