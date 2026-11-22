import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RegistryCore, agentCloud } from '../admin/registry-core';
import { parseFeed, parseLicense } from '../src/license/license';
import { publicKeyFromPrivate } from '../src/license/format';

// «امسح وفعّل من جديد»: نفس البصمة، كود تفعيل جديد، والقديم ما عاد يمشي
const key = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const M = '1A2B-3C4D-5E6F-7A8B';

describe('registry: delete and reactivate with a new code', () => {
  it('revokes the old license and code, issues a new one on the same fingerprint with the same expiry', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const old = reg.add({ name: 'محل أبو أمير', phone: '0990', machineId: M, plan: 'annual', mobile: true });
    reg.setCloud(old.id, true);
    const phone = reg.addPhone(old.id, '9F9F-9F9F-9F9F-9F9F');
    const oldCode = old.code!;
    const c = reg.reissue(old.id);

    expect(c.id).not.toBe(old.id);
    expect(c.code).toBeTruthy();
    expect(c.code).not.toBe(oldCode);
    expect(c).toMatchObject({ name: 'محل أبو أمير', phone: '0990', machineId: M, plan: 'annual', expiresAt: old.expiresAt, status: 'active', cloud: true, mobile: true });
    expect(reg.find(old.id)).toMatchObject({ status: 'revoked', replacedBy: c.id });
    expect(reg.find(phone.id).status).toBe('revoked');
    // المفتاح الجديد موقّع لنفس الجهاز
    const lic = parseLicense(c.key, publicKeyFromPrivate(key))!;
    expect(lic.machineId).toBe(M);
    // الكود القديم ما عاد يفعّل، والجديد بيفعّل نفس الجهاز، وبيفعّل الجوال من جديد
    expect(() => reg.redeem(oldCode, [M])).toThrow(/ملغى/);
    expect(reg.redeem(c.code!, [M]).id).toBe(c.id);
    expect(reg.redeem(c.code!, ['9F9F-9F9F-9F9F-9F9F']).phoneOf).toBe(c.id);
    // بالقائمة: القديم ملغى والجديد شغّال
    const feed = parseFeed(reg.buildFeed().text, publicKeyFromPrivate(key))!;
    expect(feed.entries[old.id]!.status).toBe('revoked');
    expect(feed.entries[c.id]).toMatchObject({ status: 'active', cloud: true });
    // مرة وحدة بس لنفس الرخصة
    expect(() => reg.reissue(old.id)).toThrow(/من قبل/);
  });

  it('can move to a new fingerprint, and refuses one used by another customer', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const a = reg.add({ name: 'أ', machineId: M, plan: 'lifetime' });
    reg.add({ name: 'ب', machineId: '2222-2222-2222-2222', plan: 'annual' });
    expect(() => reg.reissue(a.id, '2222-2222-2222-2222')).toThrow(/«ب»/);
    const c = reg.reissue(a.id, '3333-3333-3333-3333');
    expect(c).toMatchObject({ machineId: '3333-3333-3333-3333', plan: 'lifetime', expiresAt: null });
  });
});

describe('registry: owner adds a customer for an agent', () => {
  it('with or without taking from the agent balance', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const a = reg.addAgent({ name: 'وكيل حلب' });
    reg.addPackage(a.id, { tier: 'p25' });
    const before = agentLeft();
    function agentLeft() {
      return reg.agent(a.id).uses.length;
    }
    const free = reg.add({ name: 'زبون ببلاش', machineId: '4444-4444-4444-4444', plan: 'annual', agentId: a.id, devices: 2 }, { free: true });
    expect(free.agentId).toBe(a.id);
    expect(agentLeft()).toBe(before); // ما انخصم شي
    expect(free.history[0]!.action).toMatch(/بدون خصم/);
    const paid = reg.add({ name: 'زبون عادي', machineId: '5555-5555-5555-5555', plan: 'annual', agentId: a.id, devices: 2 });
    expect(paid.agentId).toBe(a.id);
    expect(agentLeft()).toBe(before + 1); // انخصمت رخصة
  });
});

describe('registry: remote connection as a subscription', () => {
  it('monthly/annual extend from the end date, lifetime has none, feed turns it off when expired', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const c = reg.add({ name: 'محل', machineId: M, plan: 'annual' });
    const t0 = Date.now();
    reg.setCloudPlan(c.id, 'monthly');
    const u1 = new Date(reg.find(c.id).cloudUntil!).getTime();
    expect(Math.round((u1 - t0) / 86_400_000)).toBe(30);
    reg.setCloudPlan(c.id, 'annual'); // بيتمدد من آخر تاريخ
    expect(Math.round((new Date(reg.find(c.id).cloudUntil!).getTime() - t0) / 86_400_000)).toBe(395);
    let feed = parseFeed(reg.buildFeed().text, publicKeyFromPrivate(key))!;
    expect(feed.entries[c.id]!.cloud).toBe(true);
    // خلصت المدة: القائمة ما بتفتحها
    reg.find(c.id).cloudUntil = new Date(t0 - 1000).toISOString();
    feed = parseFeed(reg.buildFeed().text, publicKeyFromPrivate(key))!;
    expect(feed.entries[c.id]!.cloud).toBeUndefined();
    reg.setCloudPlan(c.id, 'lifetime');
    expect(reg.find(c.id).cloudUntil).toBeNull();
    expect(() => reg.setCloudPlan(c.id, 'monthly')).toThrow(/دائم أصلاً/);
    reg.setCloudPlan(c.id, 'off');
    expect(reg.find(c.id).cloud).toBeUndefined();
  });

  it('agent cloud balance per duration', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const a = reg.addAgent({ name: 'وكيل' });
    reg.addPackage(a.id, { tier: 'p25' });
    const c = reg.add({ name: 'زبون', machineId: M, plan: 'annual', agentId: a.id });
    reg.addCloud(a.id, 3, 'باقة', 'annual');
    expect(() => reg.agentSetCloud(a.id, c.id, 'monthly')).toThrow(/شهري.*خلص|خلص/);
    reg.agentSetCloud(a.id, c.id, 'annual');
    const bal = agentCloud(reg.agent(a.id));
    expect(bal.plans.annual).toMatchObject({ total: 3, used: 1, left: 2 });
    expect(bal.plans.lifetime).toMatchObject({ total: 25, used: 0 }); // رصيد الوكيل المميز القديم
    expect(reg.find(c.id)).toMatchObject({ cloud: true, cloudPlan: 'annual' });
  });
});

describe('registry: move a license to an agent', () => {
  it('moves with its phone key, optionally charging, and back to direct', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const a = reg.addAgent({ name: 'وكيل حمص' });
    const b = reg.addAgent({ name: 'وكيل حماة' });
    reg.addPackage(a.id, { kind: 'annual', count: 1, mobile: true });
    const c = reg.add({ name: 'محل', machineId: M, plan: 'annual', mobile: true });
    const ph = reg.addPhone(c.id, '9F9F-9F9F-9F9F-9F9F');
    const keyBefore = c.key;
    const used = () => reg.agent(a.id).uses.length;
    reg.transfer(c.id, a.id);
    expect(reg.find(c.id).agentId).toBe(a.id);
    expect(reg.find(ph.id).agentId).toBe(a.id);
    expect(used()).toBe(0);
    expect(reg.find(c.id).key).toBe(keyBefore);
    expect(() => reg.transfer(c.id, a.id)).toThrow(/أصلاً/);
    expect(() => reg.transfer(ph.id, b.id)).toThrow(/جوال/);
    reg.transfer(c.id, null);
    expect(reg.find(c.id).agentId).toBeUndefined();
    reg.transfer(c.id, a.id, { charge: true });
    expect(used()).toBe(1);
    expect(() => reg.transfer(c.id, b.id, { charge: true })).toThrow(/خلص/);
    reg.transfer(c.id, b.id);
    expect(reg.find(c.id).agentId).toBe(b.id);
  });
});
