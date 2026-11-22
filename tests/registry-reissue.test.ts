import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RegistryCore } from '../admin/registry-core';
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
