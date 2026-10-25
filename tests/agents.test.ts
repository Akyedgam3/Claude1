import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentBalance, Registry } from '../admin/registry';
import { compareVersions, parseFeed, parseLicense, updateFor } from '../src/license/license';
import { LicenseManager } from '../src/license/manager';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const M1 = '1A2B-3C4D-5E6F-7A8B';
const M2 = '1111-2222-3333-4444';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-agents-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('agents', () => {
  it('a package adds 10 licenses and every activation uses one', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'أبو خالد — حلب', phone: '+963 911 111 111', packages: 1 });
    expect(agentBalance(a)).toEqual({ total: 10, used: 0, left: 10 });
    const c = r.add({ name: 'ماركت النور', machineId: M1, plan: 'lifetime', agentId: a.id });
    // الوكيل بيبيع سنوي بس، وجهازين افتراضياً
    expect(c.plan).toBe('annual');
    expect(c.devices).toBe(2);
    expect(c.agentId).toBe(a.id);
    expect(parseLicense(c.key, PUB)?.machineId).toBe(M1);
    expect(agentBalance(r.agent(a.id)).left).toBe(9);
    // التجديد كمان بينخصم، وبيضل سنوي
    const renewed = r.extend(c.id, 'lifetime');
    expect(renewed.plan).toBe('annual');
    expect(renewed.expiresAt).not.toBeNull();
    expect(agentBalance(r.agent(a.id))).toEqual({ total: 10, used: 2, left: 8 });
    // بيضل محفوظ بعد إعادة التحميل
    const again = new Registry(path.join(dir, 'registry.json'), PRIV);
    expect(agentBalance(again.agent(a.id)).left).toBe(8);
    expect(again.customers[0]!.agentId).toBe(a.id);
  });

  it('refuses activation when the balance is empty or the agent is stopped', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'وكيل', packages: 0 });
    expect(() => r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id })).toThrow(/رصيد/);
    r.addPackage(a.id, { count: 1, price: 6 });
    r.updateAgent(a.id, { active: false });
    expect(() => r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id })).toThrow(/موقوف/);
    r.updateAgent(a.id, { active: true });
    const c = r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id });
    expect(() => r.extend(c.id, 'annual')).toThrow(/رصيد/);
    // نفس الجهاز ما بياخد ترخيصين
    r.addPackage(a.id);
    expect(() => r.add({ name: 'زبون 2', machineId: M1, plan: 'annual', agentId: a.id })).toThrow(/ترخيص من قبل/);
    expect(r.add({ name: 'زبون 2', machineId: M2, plan: 'annual', agentId: a.id }).devices).toBe(2);
  });

  it('warns when a fingerprint already belongs to another customer', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    r.add({ name: 'زبون الرقة', machineId: M1, plan: 'annual' });
    expect(() => r.add({ name: 'زبون حماة', machineId: M1.toLowerCase(), plan: 'annual' })).toThrow(/زبون الرقة/);
    expect(r.add({ name: 'زبون حماة', machineId: M1, plan: 'annual', force: true }).name).toBe('زبون حماة');
  });

  it('validates packages and names', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    expect(() => r.addAgent({ name: ' ' })).toThrow();
    const a = r.addAgent({ name: 'وكيل' });
    expect(() => r.addAgent({ name: 'وكيل' })).toThrow(/نفس الاسم/);
    expect(() => r.addPackage(a.id, { count: 0 })).toThrow();
    expect(() => r.addPackage(a.id, { count: 1.5 })).toThrow();
    expect(() => r.addPackage(a.id, { price: -1 })).toThrow();
    expect(r.addPackage(a.id).packages[0]).toMatchObject({ count: 10, price: 59.99 });
  });
});

describe('app updates', () => {
  it('compares versions', () => {
    expect(compareVersions('0.3.0', '0.2.9')).toBe(1);
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.2.0', '0.10.0')).toBe(-1);
  });

  it('publishes a signed update that installed apps pick up', async () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    expect(() => r.setUpdate({ version: 'x', url: 'https://a/b.exe' })).toThrow();
    expect(() => r.setUpdate({ version: '0.3.0', url: 'http://a/b.exe' })).toThrow(/https/);
    expect(() => r.setUpdate({ version: '0.3.0', url: 'https://a/b.exe', minVersion: '0.4.0' })).toThrow();
    r.setUpdate({ version: '0.3.0', url: 'https://example.com/Mizan-0.3.0.exe', notes: 'قسم المطاعم\n\nقسم الخياطة', minVersion: '0.2.0' });
    const { text } = r.publish(path.join(dir, 'feed.txt'));
    const feed = parseFeed(text, PUB)!;
    expect(feed.update?.notes).toEqual(['قسم المطاعم', 'قسم الخياطة']);

    expect(updateFor(feed, '0.3.0')).toBeNull();
    expect(updateFor(feed, '0.2.5')).toMatchObject({ version: '0.3.0', mandatory: false });
    expect(updateFor(feed, '0.1.9')?.mandatory).toBe(true);

    const m = new LicenseManager({ dataDir: dir, publicKey: PUB, feedUrls: ['https://feed'], fetcher: async () => text, machineId: M1, appVersion: '0.2.0' });
    expect(m.status().update).toBeUndefined();
    expect(await m.refresh()).toBe(true);
    expect(m.status().update).toMatchObject({ version: '0.3.0', url: 'https://example.com/Mizan-0.3.0.exe', mandatory: false });

    r.setUpdate(null);
    expect(parseFeed(r.publish(path.join(dir, 'feed.txt')).text, PUB)!.update).toBeUndefined();
  });

  it('imports keys issued elsewhere so the next publish keeps them', () => {
    // مفاتيح طلعت من سجل تاني (مثلاً وصاحب المشروع بعيد عن اللابتوب)
    const other = new Registry(path.join(dir, 'other.json'), PRIV);
    const k1 = other.add({ name: 'بكر', machineId: M1, plan: 'lifetime', devices: 2 }).key;
    const k2 = other.add({ name: 'محمود', machineId: M2, plan: 'lifetime', devices: 2 }).key;
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'LaptopHome', packages: 1 });
    const res = r.importKeys(JSON.stringify({ customers: [{ key: k1, agent: 'LaptopHome', cloud: true, notes: 'حماة' }, { key: k2, phone: '+963 956 060 786' }] }));
    expect(res.added).toEqual(['بكر', 'محمود']);
    expect(agentBalance(r.agent(a.id)).used).toBe(1);
    const feed = parseFeed(r.publish(path.join(dir, 'feed.txt')).text, PUB)!;
    expect(Object.keys(feed.entries)).toHaveLength(2);
    expect(feed.entries[parseLicense(k1, PUB)!.id]).toMatchObject({ cloud: true, expiresAt: null, devices: 2 });
    // مرة تانية: ما بيتكرر
    expect(r.importKeys(k1 + '\n' + k2)).toEqual({ added: [], skipped: ['بكر', 'محمود'] });
    // مفتاح من مكان غريب بيترفض
    const { privateKey: x } = generateKeyPairSync('ed25519');
    const bad = new Registry(path.join(dir, 'bad.json'), x.export({ type: 'pkcs8', format: 'pem' }).toString()).add({ name: 'ز', machineId: M1, plan: 'monthly' }).key;
    expect(() => r.importKeys(bad)).toThrow(/غير صالح/);
  });
});
