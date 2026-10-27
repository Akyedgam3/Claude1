import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentBalance, normalizeShortCode, Registry } from '../admin/registry';
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
  it('an annual customer can switch to lifetime from the lifetime balance', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'وكيل', packages: 1 });
    const c = r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id });
    expect(() => r.extend(c.id, 'lifetime')).toThrow(/الدائم/);
    r.addPackage(a.id, { tier: 'l10' });
    const up = r.extend(c.id, 'lifetime');
    expect(up.plan).toBe('lifetime');
    expect(up.expiresAt).toBeNull();
    expect(parseLicense(up.key, PUB)?.expiresAt ?? null).toBeNull();
    expect(agentBalance(r.agent(a.id))).toMatchObject({ annual: { used: 1 }, lifetime: { used: 1, left: 9 } });
    expect(() => r.extend(c.id, 'annual')).toThrow(/دائم/);
    // المدير بيقدر يمدد بدون خصم من الوكيل
    const c2 = r.add({ name: 'زبون 2', machineId: M2, plan: 'annual', agentId: a.id });
    r.extend(c2.id, 'lifetime', { free: true });
    expect(agentBalance(r.agent(a.id)).lifetime.used).toBe(1);
  });
  it('the owner can reduce an agent balance, never below what is used', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'وكيل', packages: 1 });
    r.addPackage(a.id, { tier: 'l10' });
    r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id });
    r.deductPackage(a.id, { kind: 'annual', count: 4, note: 'غلطة' });
    expect(agentBalance(r.agent(a.id))).toMatchObject({ annual: { total: 6, used: 1, left: 5 }, lifetime: { left: 10 } });
    expect(() => r.deductPackage(a.id, { kind: 'annual', count: 6 })).toThrow();
    expect(() => r.deductPackage(a.id, { kind: 'lifetime', mobile: true, count: 1 })).toThrow();
    r.deductPackage(a.id, { kind: 'lifetime', count: 10 });
    expect(agentBalance(r.agent(a.id)).lifetime.left).toBe(0);
  });
  it('a package adds 10 licenses and every activation uses one', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'أبو خالد — حلب', phone: '+963 911 111 111', packages: 1 });
    expect(agentBalance(a)).toMatchObject({ total: 10, used: 0, left: 10, annual: { left: 10 }, lifetime: { total: 0 } });
    expect(a.packages[0]).toMatchObject({ count: 10, price: 12_250, kind: 'annual', currency: 'SYP' });
    const c = r.add({ name: 'ماركت النور', machineId: M1, plan: 'annual', agentId: a.id });
    expect(c.plan).toBe('annual');
    expect(c.devices).toBe(2);
    expect(c.agentId).toBe(a.id);
    expect(parseLicense(c.key, PUB)?.machineId).toBe(M1);
    expect(agentBalance(r.agent(a.id)).left).toBe(9);
    // التجديد كمان بينخصم، وأي مدة غير الدائم بتصير سنة
    const renewed = r.extend(c.id, 'monthly');
    expect(renewed.plan).toBe('annual');
    expect(renewed.expiresAt).not.toBeNull();
    expect(agentBalance(r.agent(a.id))).toMatchObject({ total: 10, used: 2, left: 8 });
    // بيضل محفوظ بعد إعادة التحميل
    const again = new Registry(path.join(dir, 'registry.json'), PRIV);
    expect(agentBalance(again.agent(a.id)).left).toBe(8);
    expect(again.customers[0]!.agentId).toBe(a.id);
  });

  it('sells permanent keys from the permanent balance only', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'وكيل دائم' });
    expect(() => r.add({ name: 'زبون', machineId: M1, plan: 'lifetime', agentId: a.id })).toThrow(/الدائم خلص/);
    r.addPackage(a.id, { tier: 'l25' });
    expect(agentBalance(r.agent(a.id))).toMatchObject({ annual: { total: 0 }, lifetime: { total: 25, left: 25 } });
    expect(r.agent(a.id).packages[0]).toMatchObject({ count: 25, price: 37_250, kind: 'lifetime', tier: 'l25' });
    // ما في رصيد سنوي
    expect(() => r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id })).toThrow(/السنوي خلص/);
    const c = r.add({ name: 'زبون', machineId: M1, plan: 'lifetime', agentId: a.id });
    expect(c.plan).toBe('lifetime');
    expect(c.expiresAt).toBeNull();
    expect(agentBalance(r.agent(a.id)).lifetime.left).toBe(24);
    expect(() => r.extend(c.id, 'annual')).toThrow(/دائم/);
    expect(() => r.addPackage(a.id, { tier: 'x' })).toThrow(/خطة/);
  });

  it('computer + phone licenses: one unit, a free phone key that renews with the computer', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'وكيل الجوال' });
    r.addPackage(a.id, { tier: 'a10m' });
    expect(agentBalance(r.agent(a.id))).toMatchObject({ annual: { total: 0 }, annualMobile: { total: 10, left: 10 } });
    // رصيد «+ جوال» ما بينصرف على رخصة كمبيوتر بس، والعكس
    expect(() => r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id })).toThrow(/السنوي خلص/);
    const pc = r.add({ name: 'محل الجوالات', machineId: M1, plan: 'annual', agentId: a.id, mobile: true });
    expect(pc.mobile).toBe(true);
    const phone = r.addPhone(pc.id, M2);
    expect(phone).toMatchObject({ phoneOf: pc.id, plan: 'annual', expiresAt: pc.expiresAt, agentId: a.id });
    expect(parseLicense(phone.key, PUB)?.machineId).toBe(M2);
    expect(agentBalance(r.agent(a.id)).annualMobile.left).toBe(9);
    expect(() => r.addPhone(pc.id, '9999-9999-9999-9999')).toThrow(/من قبل/);
    expect(() => r.extend(phone.id, 'annual')).toThrow(/الكمبيوتر/);
    // تجديد الكمبيوتر بيجدد الجوال كمان
    const renewed = r.extend(pc.id, 'annual');
    expect(r.find(phone.id).expiresAt).toBe(renewed.expiresAt);
    expect(agentBalance(r.agent(a.id)).annualMobile.left).toBe(8);
    // رخصة كمبيوتر بس ما إلها جوال
    r.addPackage(a.id, { tier: 'a10' });
    const only = r.add({ name: 'ماركت', machineId: '5555-6666-7777-8888', plan: 'annual', agentId: a.id });
    expect(() => r.addPhone(only.id, '1212-3434-5656-7878')).toThrow(/بس/);
  });

  it('short activation codes: per customer, and prepaid cards without a fingerprint', () => {
    const r = new Registry(path.join(dir, 'registry.json'), PRIV);
    const a = r.addAgent({ name: 'وكيل الأكواد' });
    r.addPackage(a.id, { tier: 'a10' });
    r.addPackage(a.id, { tier: 'l10m' });
    // كل زبون جديد إلو كود 16 حرف، بيرجّع مفتاحه لنفس جهازه بس
    const c = r.add({ name: 'زبون', machineId: M1, plan: 'annual', agentId: a.id });
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    expect(r.redeem(c.code!.replace(/-/g, '').toLowerCase(), ['0000-0000-0000-0000', M1]).key).toBe(c.key);
    expect(() => r.redeem(c.code!, [M2])).toThrow(/لجهاز تاني/);
    expect(() => r.redeem('ABCD', [M1])).toThrow(/16/);
    // كرت «دائم + جوال»: الرصيد بينخصم هلق، وأول جهاز بياخده، والتاني بياخد مفتاح الجوال
    const card = r.createCard({ name: 'محل الكرت', plan: 'lifetime', mobile: true, agentId: a.id });
    expect(agentBalance(r.agent(a.id)).lifetimeMobile.left).toBe(9);
    const pc = r.redeem(card.code, [M2]);
    expect(parseLicense(pc.key, PUB)).toMatchObject({ machineId: M2, plan: 'lifetime', customer: 'محل الكرت' });
    expect(r.redeem(card.code, [M2]).id).toBe(pc.id); // إعادة التنصيب على نفس الجهاز
    expect(agentBalance(r.agent(a.id)).lifetimeMobile.left).toBe(9); // ما انخصم مرتين
    const phone = r.redeem(card.code, ['5555-6666-7777-8888']);
    expect(phone.phoneOf).toBe(pc.id);
    expect(() => r.redeem(card.code, ['9999-9999-9999-9999'])).toThrow(/انستعمل/);
    // كرت سنوي بس جهاز واحد، والإلغاء قبل الاستعمال بيرجّع الرصيد
    const spare = r.createCard({ plan: 'annual', agentId: a.id });
    expect(agentBalance(r.agent(a.id)).annual.left).toBe(8);
    r.voidCard(spare.id);
    expect(agentBalance(r.agent(a.id)).annual.left).toBe(9);
    expect(() => r.redeem(spare.code, [M2])).toThrow(/ملغى/);
    expect(() => r.voidCard(card.id)).toThrow(/انستعمل/);
    // الكرت بيضل شغّال حتى لو الوكيل انوقف بعد ما باعه
    const sold = r.createCard({ plan: 'annual', agentId: a.id });
    r.updateAgent(a.id, { active: false });
    expect(r.redeem(sold.code, ['1212-3434-5656-7878']).agentId).toBe(a.id);
    // كرت على جهاز إلو ترخيص سنوي: بيجدده بدل ما يرفض
    r.updateAgent(a.id, { active: true });
    const before = r.find(c.id).expiresAt!;
    const renewal = r.createCard({ plan: 'annual', agentId: a.id });
    const renewed = r.redeem(renewal.code, [M1]);
    expect(renewed.id).toBe(c.id);
    expect(new Date(renewed.expiresAt!).getTime()).toBeGreaterThan(new Date(before).getTime() + 300 * 86_400_000);
    expect(parseLicense(renewed.key, PUB)?.expiresAt).toBe(renewed.expiresAt);
    // والدائم ما بيحتاج تجديد
    const extra = r.createCard({ plan: 'annual', agentId: a.id });
    expect(() => r.redeem(extra.code, [M2])).toThrow(/دائم/);
    expect(normalizeShortCode(' abcd efgh jkmn pqrs ')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normalizeShortCode('1A2B-3C4D-5E6F-7A8B')).toBeNull(); // البصمة مش كود
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
    expect(r.addPackage(a.id).packages[0]).toMatchObject({ count: 10, price: 12_250, kind: 'annual', tier: 'a10' });
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
