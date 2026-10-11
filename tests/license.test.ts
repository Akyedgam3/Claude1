import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { issueLicense, machineId, verifyLicense } from '../src/license/license';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const MACHINE = 'AAAA-BBBB-CCCC-DDDD';
const issuedAt = new Date('2026-01-01T00:00:00Z');

describe('license', () => {
  it('produces a stable machine id', () => {
    expect(machineId()).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(machineId()).toBe(machineId());
  });

  it('accepts a valid monthly license and reports days left', () => {
    const key = issueLicense({ customer: 'زبون', machineId: MACHINE, plan: 'monthly', issuedAt }, priv);
    const r = verifyLicense(key, pub, { machineId: MACHINE, now: new Date('2026-01-21T00:00:00Z') });
    expect(r).toMatchObject({ status: 'valid', daysLeft: 10 });
  });

  it('expires subscriptions but never lifetime licenses', () => {
    const annual = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'annual', issuedAt }, priv);
    const lifetime = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'lifetime', issuedAt }, priv);
    const later = new Date('2030-01-01T00:00:00Z');
    expect(verifyLicense(annual, pub, { machineId: MACHINE, now: later }).status).toBe('expired');
    expect(verifyLicense(lifetime, pub, { machineId: MACHINE, now: later })).toMatchObject({ status: 'valid', daysLeft: null });
  });

  it('rejects other machines, edited keys and clock rollback', () => {
    const key = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'quarterly', issuedAt }, priv);
    const now = new Date('2026-01-10T00:00:00Z');
    expect(verifyLicense(key, pub, { machineId: 'XXXX-XXXX-XXXX-XXXX', now }).status).toBe('invalid');

    const [body, sig] = key.slice(5).split('.');
    const forged = JSON.parse(Buffer.from(body!, 'base64url').toString());
    forged.plan = 'lifetime';
    forged.expiresAt = null;
    const forgedKey = 'MZN1-' + Buffer.from(JSON.stringify(forged)).toString('base64url') + '.' + sig;
    expect(verifyLicense(forgedKey, pub, { machineId: MACHINE, now })).toMatchObject({ status: 'invalid' });

    expect(
      verifyLicense(key, pub, { machineId: MACHINE, now, lastSeen: new Date('2026-02-01T00:00:00Z') }),
    ).toMatchObject({ status: 'invalid', reason: expect.stringMatching(/الساعة/) });
  });
});
