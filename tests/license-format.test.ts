import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as format from '../src/license/format';
import { issueLicense, parseFeed, parseLicense, signFeed } from '../src/license/license';

// لوحة الإدارة على النت بتوقّع بمكتبة noble (src/license/format.ts)، والبرنامج بيتحقق بـ node:crypto:
// لازم يطلعوا نفس المفاتيح بالحرف.
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();

describe('license format (noble) matches node:crypto', () => {
  const opts = { customer: 'محل النور', machineId: '1a2b-3c4d-5e6f-7a8b', plan: 'annual' as const, devices: 2, id: 'fixed-id', issuedAt: new Date('2026-10-27T10:00:00Z') };

  it('signs the exact same license key and feed', () => {
    expect(format.issueLicense(opts, PRIV)).toBe(issueLicense(opts, PRIV));
    const feed = { v: 1 as const, issuedAt: '2026-10-27T10:00:00.000Z', entries: { a: { status: 'active' as const, expiresAt: null, cloud: true } } };
    expect(format.signFeed(feed, PRIV)).toBe(signFeed(feed, PRIV));
  });

  it('keys from each side verify on the other, and the public key matches', () => {
    expect(parseLicense(format.issueLicense(opts, PRIV), PUB)?.customer).toBe('محل النور');
    expect(format.parseLicense(issueLicense(opts, PRIV), PUB)?.machineId).toBe('1A2B-3C4D-5E6F-7A8B');
    expect(format.publicKeyFromPrivate(PRIV).replace(/\s/g, '')).toBe(PUB.replace(/\s/g, ''));
    expect(parseFeed(format.signFeed({ v: 1, issuedAt: 'x', entries: {} }, PRIV), PUB)).not.toBeNull();
    // مفتاح تاني ما بيمشي
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(format.parseLicense(issueLicense(opts, PRIV), other)).toBeNull();
  });

  it('base64 round-trips', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 33, 100]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37) & 255);
      expect([...format.fromBase64(format.toBase64(b))]).toEqual([...b]);
      expect(format.toBase64(b)).toBe(Buffer.from(b).toString('base64'));
    }
  });
});
