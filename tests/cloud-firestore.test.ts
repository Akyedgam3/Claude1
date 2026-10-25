// تجربة الاتصال عن بعد على Firestore حقيقي (المحاكي المحلي) مع القواعد المنشورة.
// بتشتغل بس إذا المحاكي شغّال: FIRESTORE_EMULATOR=127.0.0.1:8085 npx vitest run tests/cloud-firestore.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CloudSessions } from '../src/app/cloud-sessions';
import { execute } from '../src/app/executor';
import { CloudClient } from '../src/cloud/client';
import { cloudRoom, newCloudCode } from '../src/cloud/code';
import { CloudHost } from '../src/cloud/host';
import { DEFAULT_CURRENCIES, chartFor } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

const EMU = process.env['FIRESTORE_EMULATOR'];

describe.skipIf(!EMU)('cloud over the Firestore emulator', () => {
  let dir: string;
  let store: CompanyStore;
  let host: CloudHost;
  let off: () => void;
  let code: string;
  let T: typeof import('../src/cloud/firestore');

  beforeAll(async () => {
    T = await import('../src/cloud/firestore');
    const [h, p] = EMU!.split(':');
    T.useFirestoreEmulator(h!, Number(p));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-emu-'));
    store = CompanyStore.create(dir, {
      info: { name: 'محل المحاكي', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
      currencies: DEFAULT_CURRENCIES,
      accounts: chartFor('general'),
      owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
    }).store;
    execute(store, store.user, 'saveItem', [{ id: 'i', code: '1', name: 'مادة', kind: 'stock', unit: 'قطعة', price: 1000, priceCurrency: 'SYP' }]);
    execute(store, store.user, 'adjustStock', [{ kind: 'opening', date: '2026-01-01', lines: [{ itemId: 'i', qty: 10, unitCost: 500 }] }]);
    const sessions = new CloudSessions(() => store, () => 1);
    code = newCloudCode();
    host = new CloudHost(new T.FirestoreTransport(), await cloudRoom(code), {
      name: () => 'محل المحاكي',
      login: async (u, p, d, n) => sessions.login(u, p, d, n),
      snapshot: async (t) => sessions.snapshot(t),
      call: async (t, m, a) => sessions.call(t, m, a),
      logout: async (t) => sessions.logout(t),
      fullState: async () => sessions.fullState(),
      runQueued: async (u, p, m, a) => sessions.runQueued(u, p, m, a),
      backup: async () => '',
    });
    host.onError = (m) => console.error('host error', m);
    off = store.onEvent((event, seq) => host.push([{ event, seq }]));
    await host.start();
  }, 60_000);

  afterAll(() => {
    off?.();
    host?.stop();
    if (store?.isOpen) store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('works end to end within the security rules', async () => {
    const c = new CloudClient(new T.FirestoreTransport(), await cloudRoom(code), { username: 'admin', password: 'secret123', deviceId: 'p1', deviceName: 'جوال' });
    expect((await c.ping()).name).toBe('محل المحاكي');
    const r = await c.login();
    expect(r.state.items['i']!.name).toBe('مادة');
    let got = 0;
    c.listen((items) => (got += items.length), () => undefined, (m) => console.error('client error', m));
    const t0 = Date.now();
    const res = await c.call('postInvoice', [{ kind: 'sale', date: '2026-01-02', lines: [{ itemId: 'i', qty: 1, price: 1000 }] }]);
    console.log('call round trip ms', Date.now() - t0);
    expect(res.value).toMatchObject({ number: 1 });
    for (let i = 0; i < 300 && c.snapshot().seq < store.lastSeq; i++) await new Promise((r) => setTimeout(r, 20));
    expect(c.snapshot().seq).toBe(store.lastSeq);
    execute(store, store.user, 'saveItem', [{ id: 'j', code: '2', name: 'تانية', kind: 'stock', unit: 'قطعة', price: 5, priceCurrency: 'SYP' }]);
    for (let i = 0; i < 300 && !c.snapshot().state.items['j']; i++) await new Promise((r) => setTimeout(r, 20));
    expect(c.snapshot().state.items['j']?.name).toBe('تانية');
    expect(got).toBeGreaterThan(0);
    await c.close();
  }, 60_000);

  it('rules reject anything that is not a room document', async () => {
    const t = new T.FirestoreTransport();
    const { room } = await cloudRoom(code);
    await expect(t.set('not-a-room', 'events', 'x', { ct: 'a' })).rejects.toThrow();
    await expect(t.set(room, 'events', 'x', { ct: 'a', name: 'x' } as never)).rejects.toThrow();
    await expect(t.set(room, 'events', 'x', { ct: 'a'.repeat(960_000) })).rejects.toThrow();
    await expect(t.set(room, 'other' as never, 'x', { ct: 'a' })).rejects.toThrow();
  }, 60_000);
});
