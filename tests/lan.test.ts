import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execute } from '../src/app/executor';
import { hostCompanyFor } from '../src/app/host-company';
import { discoverHosts, LanClient, LanHost, newPairingCode, type EventItem } from '../src/app/lan';
import { DEFAULT_CURRENCIES, applyEvent, chartFor, type CompanyState, type User } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

let dir: string;
let store: CompanyStore;
const cashier: User = { id: 'u2', username: 'kasher', displayName: 'كاشير', role: 'cashier', active: true };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-lan-'));
  store = CompanyStore.create(dir, {
    info: { name: 'محل الشبكة', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
    currencies: DEFAULT_CURRENCIES,
    accounts: chartFor('general'),
    owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
  }).store;
  execute(store, store.user, 'createUser', [cashier, 'cashier1']);
  execute(store, store.user, 'saveItem', [{ id: 'i', code: '1', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'SYP' }]);
  execute(store, store.user, 'adjustStock', [{ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i', qty: 10, unitCost: 500 }] }]);
});
afterEach(() => {
  if (store.isOpen) store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('executor', () => {
  it('enforces permissions per user', () => {
    const sale = { kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i', qty: 1, price: 1000 }] };
    expect(execute(store, cashier, 'postInvoice', [sale]).value).toMatchObject({ number: 1, createdBy: 'u2' });
    expect(() => execute(store, cashier, 'postInvoice', [{ ...sale, kind: 'purchase' }])).toThrow(/صلاحية/);
    expect(() => execute(store, cashier, 'postInvoice', [{ ...sale, discount: 100 }])).toThrow(/خصم/);
    expect(() => execute(store, cashier, 'closeYear', ['2025-12-31'])).toThrow(/صلاحية/);
    expect(() => execute(store, cashier, 'createUser', [{ ...cashier, id: 'x', username: 'x' }, 'pass123'])).toThrow(/صلاحية/);
    expect(() => execute(store, cashier, 'emit', [{}])).toThrow(/غير معروفة/);
    for (const m of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(() => execute(store, cashier, m, [])).toThrow(/غير معروفة/);
  });

  it('keeps hidden items away from users without the permission', async () => {
    const { visibleState } = await import('../src/renderer/src/api');
    execute(store, store.user, 'saveItem', [{ id: 'h', code: '2', name: 'مادة المورّد', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'SYP', hidden: true }]);
    execute(store, store.user, 'adjustStock', [{ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'h', qty: 5, unitCost: 500 }] }]);
    const sale = { kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'h', qty: 1, price: 1000 }] };
    expect(() => execute(store, cashier, 'postInvoice', [sale])).toThrow(/غير موجودة/);
    expect(() => execute(store, cashier, 'saveItem', [{ id: 'h', code: '2', name: 'x', kind: 'stock', unit: 'قطعة', price: 1, priceCurrency: 'SYP' }])).toThrow();
    expect(execute(store, store.user, 'postInvoice', [sale]).value).toBeTruthy();
    expect(visibleState(store.ledger.state, cashier).items['h']!.archived).toBe(true);
    expect(visibleState(store.ledger.state, store.user).items['h']!.archived).toBeUndefined();
  });

  it('applies role changes and deactivation immediately', () => {
    execute(store, store.user, 'updateUser', [{ ...cashier, role: 'accountant' }]);
    expect(execute(store, cashier, 'postInvoice', [{ kind: 'purchase', date: '2026-01-02', lines: [{ itemId: 'i', qty: 1, price: 1 }] }]).value).toBeTruthy();
    execute(store, store.user, 'updateUser', [{ ...cashier, active: false }]);
    expect(() => execute(store, cashier, 'postVoucher', [{}])).toThrow(/موقوف/);
    expect(store.verify('kasher', 'cashier1')).toBeNull();
  });

  it('lets users change their own password', () => {
    expect(() => execute(store, cashier, 'changeMyPassword', ['wrong', 'newpass1'])).toThrow(/الحالية/);
    execute(store, cashier, 'changeMyPassword', ['cashier1', 'newpass1']);
    expect(store.verify('kasher', 'newpass1')?.id).toBe('u2');
  });
});

describe('LAN host and client', () => {
  let host: LanHost;
  let blocked: string | null;
  let devices: number;
  const code = newPairingCode();

  beforeEach(async () => {
    blocked = null;
    devices = 3;
    host = new LanHost(hostCompanyFor(store, { blocked: () => blocked, devices: () => devices }), code, 0);
  });
  afterEach(() => host.stop());

  it('answers network discovery with the company name and port only', async () => {
    const { port } = await host.start();
    const found = await discoverHosts(800, ['127.0.0.1']);
    expect(found).toEqual([{ host: '127.0.0.1', port, name: 'محل الشبكة', id: store.meta.id }]);
    host.stop();
    expect(await discoverHosts(400, ['127.0.0.1'])).toEqual([]);
  });

  it('works end to end with encrypted messages, permissions and live events', async () => {
    const { port } = await host.start();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const wrong = new LanClient('127.0.0.1', port, 'AAAA-AAAA');
    await expect(wrong.hello()).rejects.toThrow(/رمز الربط/);

    const client = new LanClient('127.0.0.1', port, code.toLowerCase());
    expect(await client.hello()).toMatchObject({ name: 'محل الشبكة' });
    await expect(client.login('kasher', 'bad', 'd1', 'كاشير 2')).rejects.toThrow(/غير صحيحة/);
    const session = await client.login('kasher', 'cashier1', 'd1', 'كاشير 2');
    expect(session.user.role).toBe('cashier');
    expect(session.state.stock['i']!.totalQty).toBe(10);

    // نسخة محلية من الحالة تتحدث بالأحداث
    const local: CompanyState = session.state;
    const received: EventItem[] = [];
    client.startEvents(session.seq, (items) => {
      for (const it of items) {
        applyEvent(local, it.event);
        received.push(it);
      }
    }, async () => 0, () => undefined);

    const res = await client.call('postInvoice', [{ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i', qty: 2, price: 1000 }] }]);
    expect(res.value).toMatchObject({ total: 2000, createdBy: 'u2' });
    await expect(client.call('postInvoice', [{ kind: 'purchase', date: '2026-01-02', lines: [{ itemId: 'i', qty: 1, price: 1 }] }])).rejects.toThrow(/صلاحية/);

    // عملية من الجهاز الرئيسي تصل للجهاز الفرعي
    execute(store, store.user, 'adjustStock', [{ kind: 'damage', date: '2026-01-03', lines: [{ itemId: 'i', qty: 1 }] }]);
    for (let i = 0; i < 50 && local.stock['i']!.totalQty !== 7; i++) await new Promise((r) => setTimeout(r, 50));
    expect(local.stock['i']!.totalQty).toBe(7);
    expect(store.ledger.state.stock['i']!.totalQty).toBe(7);
    expect(received.map((r) => r.event.type)).toEqual(['invoice.posted', 'stock.adjusted']);
    expect(host.devices).toHaveLength(1);
    await client.stop();
  });

  it('limits devices by license and blocks when the host license is locked', async () => {
    const { port } = await host.start();
    devices = 2; // الجهاز الرئيسي + جهاز واحد
    const a = new LanClient('127.0.0.1', port, code);
    await a.login('admin', 'secret123', 'A', 'A');
    const b = new LanClient('127.0.0.1', port, code);
    await expect(b.login('admin', 'secret123', 'B', 'B')).rejects.toThrow(/الأقصى/);
    blocked = 'انتهى ترخيص الجهاز الرئيسي';
    await expect(a.call('saveParty', [{ id: 'p', kind: 'customer', name: 'x' }])).rejects.toThrow(/انتهى/);
  });

  it('rejects replayed requests', async () => {
    const { port } = await host.start();
    const client = new LanClient('127.0.0.1', port, code);
    await client.login('admin', 'secret123', 'A', 'A');
    // نلتقط طلباً مشفراً ونعيد إرساله
    const captured: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured.push(String(init.body));
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      await client.call('saveParty', [{ id: 'p', kind: 'customer', name: 'x' }]);
    } finally {
      globalThis.fetch = realFetch;
    }
    const replay = await realFetch(`http://127.0.0.1:${port}/call`, { method: 'POST', body: captured[0] });
    expect(replay.status).toBe(401);
  });
});
