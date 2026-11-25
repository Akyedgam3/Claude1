import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RegistryCore, normMachineId } from '../admin/registry-core';
import { parseLicense } from '../src/license/license';
import { publicKeyFromPrivate } from '../src/license/format';

// شكوى: «فعّلنا من اللوحة نظامي، وبجهاز الزبون الكود بيقول مسجّل على جهاز تاني» = البصمة انكتبت غلط
const key = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');

describe('registry: wrong fingerprint typed in the panel', () => {
  it('normalizes how sellers type fingerprints', () => {
    expect(normMachineId('1a2b 3c4d 5e6f 7a8b')).toBe('1A2B-3C4D-5E6F-7A8B');
    expect(normMachineId('1A2B3C4D5E6F7A8B')).toBe('1A2B-3C4D-5E6F-7A8B');
    expect(normMachineId('١A2B-3C4D-5E6F-7A8O')).toBe('1A2B-3C4D-5E6F-7A80');
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const c = reg.add({ name: 'محل', machineId: '1a2b 3c4d 5e6f 7a8b', plan: 'annual' });
    expect(c.machineId).toBe('1A2B-3C4D-5E6F-7A8B');
    expect(reg.redeem(c.code!, ['1A2B-3C4D-5E6F-7A8B']).id).toBe(c.id);
  });

  it('records the attempt from the real device and moves the license there in one step (same code)', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const agent = reg.addAgent({ name: 'وكيل', packages: 1 });
    const c = reg.add({ name: 'محل', machineId: '1A2B-3C4D-5E6F-7A8B', plan: 'annual', agentId: agent.id });
    const real = 'AAAA-BBBB-CCCC-DDDD';
    expect(() => reg.redeem(c.code!, [real, real])).toThrow(/بصمة هالجهاز: AAAA-BBBB-CCCC-DDDD/);
    expect(reg.find(c.id).tried?.machineId).toBe(real);
    expect(() => reg.rebind(c.id, 'other-agent')).toThrow();
    const code = c.code;
    const now = reg.rebind(c.id, agent.id);
    expect(now.machineId).toBe(real);
    expect(now.tried).toBeUndefined();
    expect(now.code).toBe(code);
    // الرخصة القديمة انلغت (الجهاز القديم بيوقف مع قائمة الحالة)
    expect(reg.find(c.id).status).toBe('revoked');
    const got = reg.redeem(code!, [real]);
    expect(parseLicense(got.key, publicKeyFromPrivate(key))!.machineId).toBe(real);
  });

  it('agent moves a license to a new device after a format: same code, old device stops, yearly limit', () => {
    const reg = new RegistryCore({ customers: [], agents: [] }, key);
    const agent = reg.addAgent({ name: 'وكيل', packages: 1 });
    const other = reg.addAgent({ name: 'وكيل تاني', packages: 1 });
    const c = reg.add({ name: 'محل', machineId: '1A2B-3C4D-5E6F-7A8B', plan: 'annual', agentId: agent.id });
    const code = c.code!;
    expect(() => reg.moveDevice(c.id, 'AAAA-0000-0000-0001', { agentId: other.id })).toThrow(/مش إلك/);
    const moved = reg.moveDevice(c.id, 'aaaa 0000 0000 0001', { agentId: agent.id });
    expect(moved.machineId).toBe('AAAA-0000-0000-0001');
    expect(moved.code).toBe(code);
    expect(moved.expiresAt).toBe(c.expiresAt);
    expect(moved.agentId).toBe(agent.id);
    expect(reg.find(c.id)).toMatchObject({ status: 'revoked', replacedBy: moved.id });
    expect(reg.find(c.id).code).toBeUndefined();
    // الزبون بيحط نفس الكود عالجهاز الجديد
    expect(reg.redeem(code, ['AAAA-0000-0000-0001']).id).toBe(moved.id);
    // الجهاز القديم: الكود ما عاد إلو
    expect(() => reg.redeem(code, ['1A2B-3C4D-5E6F-7A8B'])).toThrow();
    // حد الوكيل: 3 مرات بالسنة
    let cur = moved;
    cur = reg.moveDevice(cur.id, 'AAAA-0000-0000-0002', { agentId: agent.id });
    cur = reg.moveDevice(cur.id, 'AAAA-0000-0000-0003', { agentId: agent.id });
    expect(() => reg.moveDevice(cur.id, 'AAAA-0000-0000-0004', { agentId: agent.id })).toThrow(/3 مرات/);
    // المدير بلا حد
    cur = reg.moveDevice(cur.id, 'AAAA-0000-0000-0004');
    expect(cur.machineId).toBe('AAAA-0000-0000-0004');
    // تعديل البصمة من المدير = نقل كمان (القديمة بتنلغى)
    const viaEdit = reg.update(cur.id, { name: 'محل جديد', machineId: 'AAAA-0000-0000-0005' });
    expect(viaEdit.id).not.toBe(cur.id);
    expect(viaEdit).toMatchObject({ name: 'محل جديد', machineId: 'AAAA-0000-0000-0005', code });
    expect(reg.find(cur.id).status).toBe('revoked');
    // تعديل بدون بصمة جديدة بيضل نفس الرخصة
    expect(reg.update(viaEdit.id, { phone: '0999' }).id).toBe(viaEdit.id);
  });
});
