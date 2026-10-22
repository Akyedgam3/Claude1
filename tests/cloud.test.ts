import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloudSessions } from '../src/app/cloud-sessions';
import { execute } from '../src/app/executor';
import type { EventItem } from '../src/app/lan';
import { CloudClient } from '../src/cloud/client';
import { cloudCodeFromHash, cloudCodeLink, cloudRoom, newCloudCode, normalizeCloudCode } from '../src/cloud/code';
import { CloudHost, type CloudCompany } from '../src/cloud/host';
import { seal, unseal } from '../src/cloud/seal';
import { MemoryTransport } from '../src/cloud/transport';
import { DEFAULT_CURRENCIES, chartFor, type User } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

let dir: string;
let store: CompanyStore;
const cashier: User = { id: 'u2', username: 'kasher', displayName: 'كاشير', role: 'cashier', active: true };
const sale = { kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i', qty: 1, price: 1000 }] };
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !fn(); t += 10) await wait(10);
  expect(fn()).toBe(true);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-cloud-'));
  store = CompanyStore.create(dir, {
    info: { name: 'محل السحابة', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
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

describe('connection code', () => {
  it('generates readable codes and tolerates typing mistakes', async () => {
    const code = newCloudCode();
    expect(code).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
    expect(normalizeCloudCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normalizeCloudCode(`wazn://connect/${code.replace(/-/g, '')}`)).toBe(code);
    expect(cloudCodeLink(code)).toMatch(/^https:\/\/.+\/app\/#c=[A-Z2-9]{32}$/);
    expect(normalizeCloudCode(cloudCodeLink(code))).toBe(code);
    expect(cloudCodeFromHash(new URL(cloudCodeLink(code)).hash)).toBe(code);
    expect(cloudCodeFromHash('')).toBeNull();
    expect(normalizeCloudCode('ABC')).toBeNull();
    const a = await cloudRoom(code);
    const b = await cloudRoom(code.toLowerCase());
    expect(a.room).toBe(b.room);
    expect(a.room).toMatch(/^[0-9a-f]{40}$/);
    expect((await cloudRoom(newCloudCode())).room).not.toBe(a.room);
  });

  it('binds ciphertext to its place and key', async () => {
    const { key } = await cloudRoom(newCloudCode());
    const other = (await cloudRoom(newCloudCode())).key;
    const doc = await seal(key, 'events/1', { x: 'سر' });
    expect(doc.ct).not.toContain('سر');
    expect(await unseal(key, 'events/1', doc)).toEqual({ x: 'سر' });
    await expect(unseal(key, 'events/2', doc)).rejects.toThrow(/تشفير/);
    await expect(unseal(other, 'events/1', doc)).rejects.toThrow(/تشفير/);
  });
});

describe('cloud host and client', () => {
  let t: MemoryTransport;
  let host: CloudHost;
  let sessions: CloudSessions;
  let off: () => void;
  let code: string;

  beforeEach(async () => {
    t = new MemoryTransport();
    code = newCloudCode();
    sessions = new CloudSessions(() => store, () => 1);
    const company: CloudCompany = {
      name: () => store.ledger.state.info!.name,
      login: async (u, p, d, n) => sessions.login(u, p, d, n),
      snapshot: async (tok) => sessions.snapshot(tok),
      call: async (tok, m, a) => sessions.call(tok, m, a),
      logout: async (tok) => sessions.logout(tok),
    };
    host = new CloudHost(t, await cloudRoom(code), company);
    off = store.onEvent((event, seq) => host.push([{ event, seq }]));
    await host.start();
  });
  afterEach(() => {
    off();
    host.stop();
  });

  const client = async (username = 'kasher', password = 'cashier1', deviceId = 'phone1') => new CloudClient(t, await cloudRoom(code), { username, password, deviceId, deviceName: 'جوال' });

  it('logs in, executes with the user permissions and streams events', async () => {
    const bad = await client('kasher', 'wrong');
    await expect(bad.login()).rejects.toThrow(/كلمة السر/);

    const c = await client();
    const r = await c.login();
    expect(r.companyName).toBe('محل السحابة');
    expect(r.user.id).toBe('u2');
    expect(r.state.items['i']!.name).toBe('مادة');
    expect(r.seq).toBe(store.lastSeq);
    const got: EventItem[] = [];
    c.listen((items) => got.push(...items), () => undefined, () => undefined);

    const res = await c.call('postInvoice', [sale]);
    expect(res.value).toMatchObject({ number: 1, createdBy: 'u2' });
    expect(res.seq).toBe(store.lastSeq);
    await until(() => c.snapshot().seq === store.lastSeq);
    expect(Object.keys(c.snapshot().state.invoices)).toHaveLength(1);
    expect(got.length).toBeGreaterThan(0);

    // عملية على الجهاز الرئيسي نفسه بتوصل للجوال
    execute(store, store.user, 'postInvoice', [sale]);
    await until(() => c.snapshot().seq === store.lastSeq);
    expect(Object.keys(c.snapshot().state.invoices)).toHaveLength(2);
    expect(store.ledger.actor).toBe(store.user.id);

    await expect(c.call('postInvoice', [{ ...sale, kind: 'purchase' }])).rejects.toThrow(/صلاحية/);
    await expect(c.call('closeYear', ['2025-12-31'])).rejects.toThrow(/صلاحية/);
    await c.close();
  });

  it('keeps everything encrypted in the cloud', async () => {
    const c = await client('admin', 'secret123');
    await c.login();
    await c.call('saveItem', [{ id: 'j', code: '2', name: 'زيت زيتون فاخر', kind: 'stock', unit: 'قطعة', price: 5, priceCurrency: 'SYP' }]);
    await host.flush();
    const dump = JSON.stringify([...(t as unknown as { docs: Map<string, unknown> }).docs]);
    expect(dump.length).toBeGreaterThan(100);
    expect(dump).not.toContain('زيت');
    expect(dump).not.toContain('cashier1');
    expect(dump).not.toContain('secret123');
    expect(dump).not.toContain('admin');
  });

  it('enforces the device limit and stops deactivated users', async () => {
    const a = await client('kasher', 'cashier1', 'p1');
    await a.login();
    const b = await client('admin', 'secret123', 'p2');
    await expect(b.login()).rejects.toThrow(/الأجهزة المسموحة/);
    execute(store, store.user, 'updateUser', [{ ...cashier, active: false }]);
    await expect(a.call('postInvoice', [sale])).rejects.toThrow(/موقوف/);
  });

  it('resyncs after a reset and re-logs in after the host restarts', async () => {
    const c = await client();
    await c.login();
    let resets = 0;
    c.listen(() => undefined, () => resets++, () => undefined);
    await c.call('postInvoice', [sale]);
    await host.reset();
    await until(() => resets === 1);

    // الجهاز الرئيسي انسكّر وانفتح: الجلسات راحت والجوال بيرجع يدخل لحالو
    host.stop();
    sessions.clear();
    const company: CloudCompany = {
      name: () => 'محل السحابة',
      login: async (u, p, d, n) => sessions.login(u, p, d, n),
      snapshot: async (tok) => sessions.snapshot(tok),
      call: async (tok, m, a) => sessions.call(tok, m, a),
      logout: async (tok) => sessions.logout(tok),
    };
    off();
    host = new CloudHost(t, await cloudRoom(code), company);
    off = store.onEvent((event, seq) => host.push([{ event, seq }]));
    await host.start();
    await until(() => resets === 2);
    const res = await c.call('postInvoice', [sale]);
    expect(res.value).toMatchObject({ number: 2 });
    await until(() => c.snapshot().seq === store.lastSeq);
  });

  it('reports an offline host and rejects foreign requests', async () => {
    host.stop();
    const c = await client();
    c.timeoutMs = 200;
    await expect(c.call('postInvoice', [sale])).rejects.toThrow(/غير متصل/);
    // جهاز معه رمز تاني ما بيقدر يحكي مع هالجهاز حتى لو عرف المكان
    const room = await cloudRoom(code);
    const fake = await cloudRoom(newCloudCode());
    await t.set(room.room, 'req', 'x', { ...(await seal(fake.key, 'req/x', { op: 'ping' })), at: Date.now() });
    await wait(50);
    expect(await t.get(room.room, 'res', 'x')).toBeNull();
  });

  it('splits large snapshots into parts', async () => {
    const items = Array.from({ length: 3000 }, (_, n) => ({ id: `x${n}`, code: `c${n}`, name: `مادة ${crypto.randomUUID()}`, description: Array.from({ length: 10 }, () => crypto.randomUUID()).join(' '), kind: 'stock', unit: 'قطعة', price: n, priceCurrency: 'SYP' }));
    execute(store, store.user, 'saveItems', [items]);
    const parts = new Set<string>();
    const set = t.set.bind(t);
    t.set = async (r, coll, id, d) => {
      if (coll === 'snap') parts.add(id);
      return set(r, coll, id, d);
    };
    const c = await client('admin', 'secret123');
    const r = await c.login();
    expect(Object.keys(r.state.items)).toHaveLength(3001);
    expect(parts.size).toBeGreaterThan(1);
    expect(await t.list((await cloudRoom(code)).room, 'snap')).toEqual([]);
  }, 60_000);
});
