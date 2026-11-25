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
    reg.rebind(c.id, agent.id);
    const now = reg.find(c.id);
    expect(now.machineId).toBe(real);
    expect(now.tried).toBeUndefined();
    expect(now.code).toBe(c.code);
    const got = reg.redeem(c.code!, [real]);
    expect(parseLicense(got.key, publicKeyFromPrivate(key))!.machineId).toBe(real);
  });
});
