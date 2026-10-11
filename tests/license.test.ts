import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkLicense, issueLicense, machineId, parseFeed, signFeed, type LicenseFeed } from '../src/license/license';
import { LicenseManager } from '../src/license/manager';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const MACHINE = 'AAAA-BBBB-CCCC-DDDD';
const issuedAt = new Date('2026-01-01T00:00:00Z');
const at = (iso: string) => new Date(iso);
const feed = (entries: LicenseFeed['entries'], issued = '2026-01-05T00:00:00Z') => signFeed({ v: 1, issuedAt: issued, entries }, priv);

describe('license keys', () => {
  it('produces a stable machine id', () => {
    expect(machineId()).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(machineId()).toBe(machineId());
  });

  it('locks when there is no key or the key is forged', () => {
    expect(checkLicense(undefined, pub, { machineId: MACHINE })).toMatchObject({ status: 'locked', reason: 'none' });
    const key = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'quarterly', issuedAt }, priv);
    const [body, sig] = key.slice(5).split('.');
    const forged = JSON.parse(Buffer.from(body!, 'base64url').toString());
    forged.plan = 'lifetime';
    forged.expiresAt = null;
    const forgedKey = 'MZN2-' + Buffer.from(JSON.stringify(forged)).toString('base64url') + '.' + sig;
    expect(checkLicense(forgedKey, pub, { machineId: MACHINE })).toMatchObject({ status: 'locked', reason: 'invalid' });
    expect(checkLicense(key, pub, { machineId: 'XXXX-XXXX-XXXX-XXXX', now: at('2026-01-10') })).toMatchObject({ reason: 'machine' });
  });

  it('expires subscriptions but never lifetime licenses', () => {
    const monthly = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'monthly', issuedAt }, priv);
    expect(checkLicense(monthly, pub, { machineId: MACHINE, now: at('2026-01-21T00:00:00Z') })).toMatchObject({ status: 'valid', daysLeft: 10 });
    expect(checkLicense(monthly, pub, { machineId: MACHINE, now: at('2026-02-01') })).toMatchObject({ status: 'locked', reason: 'expired' });
    const lifetime = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'lifetime', issuedAt }, priv);
    expect(checkLicense(lifetime, pub, { machineId: MACHINE, now: at('2030-01-01') })).toMatchObject({ status: 'valid', daysLeft: null });
  });

  it('detects the clock being turned back', () => {
    const key = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'annual', issuedAt }, priv);
    expect(checkLicense(key, pub, { machineId: MACHINE, now: at('2026-01-10'), lastSeen: at('2026-03-01') })).toMatchObject({ reason: 'clock' });
    expect(checkLicense(key, pub, { machineId: MACHINE, now: at('2025-06-01') })).toMatchObject({ reason: 'clock' });
  });
});

describe('remote status feed', () => {
  const key = issueLicense({ customer: 'x', machineId: MACHINE, plan: 'monthly', issuedAt, id: 'L1' }, priv);
  const now = at('2026-01-10T00:00:00Z');

  it('suspends, revokes and extends licenses remotely', () => {
    const opts = { machineId: MACHINE, now, lastOnline: now, onlineRequired: true };
    expect(checkLicense(key, pub, { ...opts, feed: parseFeed(feed({ L1: { status: 'suspended', message: 'يرجى الدفع' } }), pub) })).toMatchObject({
      status: 'locked',
      reason: 'suspended',
      message: 'يرجى الدفع',
    });
    expect(checkLicense(key, pub, { ...opts, feed: parseFeed(feed({ L1: { status: 'revoked' } }), pub) })).toMatchObject({ reason: 'revoked' });
    const extended = checkLicense(key, pub, { ...opts, now: at('2026-03-01'), lastOnline: at('2026-03-01'), feed: parseFeed(feed({ L1: { status: 'active', expiresAt: '2026-04-01T00:00:00Z' } }), pub) });
    expect(extended).toMatchObject({ status: 'valid', daysLeft: 31 });
    expect(checkLicense(key, pub, { ...opts, feed: parseFeed(feed({ OTHER: { status: 'revoked' } }), pub) })).toMatchObject({ status: 'valid' });
  });

  it('rejects unsigned or tampered feeds', () => {
    const text = feed({ L1: { status: 'active' } });
    expect(parseFeed(text, pub)).not.toBeNull();
    const [, bodyPart, sig] = text.split('.');
    const body = JSON.parse(Buffer.from(bodyPart!, 'base64url').toString());
    body.entries.L2 = { status: 'active' };
    expect(parseFeed(`MZNF1.${Buffer.from(JSON.stringify(body)).toString('base64url')}.${sig}`, pub)).toBeNull();
    expect(parseFeed('{"v":1}', pub)).toBeNull();
  });

  it('locks after the offline grace period', () => {
    const opts = { machineId: MACHINE, onlineRequired: true };
    expect(checkLicense(key, pub, { ...opts, now: at('2026-01-07'), lastOnline: null })).toMatchObject({ status: 'valid' });
    expect(checkLicense(key, pub, { ...opts, now: at('2026-01-09'), lastOnline: null })).toMatchObject({ status: 'locked', reason: 'offline' });
    expect(checkLicense(key, pub, { ...opts, now: at('2026-01-20'), lastOnline: at('2026-01-15') })).toMatchObject({ status: 'valid' });
    expect(checkLicense(key, pub, { machineId: MACHINE, now: at('2026-01-20'), lastOnline: null })).toMatchObject({ status: 'valid' }); // التحقق غير مفعّل
  });
});

describe('LicenseManager', () => {
  let dir: string;
  let clock: Date;
  let served: string;
  let failing: boolean;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-lic-'));
    clock = at('2026-01-02T00:00:00Z');
    served = feed({}, '2026-01-02T00:00:00Z');
    failing = false;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const manager = () =>
    new LicenseManager({
      dataDir: dir,
      publicKey: pub,
      feedUrls: ['https://a.example/feed.txt', 'https://b.example/feed.txt'],
      machineId: MACHINE,
      now: () => clock,
      fetcher: async (url) => {
        if (failing || url.includes('a.example')) throw new Error('offline');
        return served;
      },
    });

  it('is locked until activated, then follows the online feed', async () => {
    const m = manager();
    expect(m.status()).toMatchObject({ locked: true, reason: 'none', machineId: MACHINE });
    expect(() => m.activate('MZN2-bad')).toThrow(/غير صالح/);
    expect(() => m.activate(issueLicense({ customer: 'x', machineId: 'OTHER', plan: 'annual', issuedAt }, priv))).toThrow(/جهاز آخر/);
    m.activate(issueLicense({ customer: 'محل أبو أحمد', machineId: MACHINE, plan: 'annual', issuedAt, id: 'L9' }, priv));
    expect(m.status()).toMatchObject({ locked: false, customer: 'محل أبو أحمد', planName: 'اشتراك سنوي' });

    expect(await m.refresh()).toBe(true); // الرابط الأول فاشل والثاني يعمل
    clock = at('2026-02-01T00:00:00Z');
    served = feed({ L9: { status: 'suspended', message: 'لم يتم الدفع' } }, '2026-02-01T00:00:00Z');
    await m.refresh();
    expect(m.status()).toMatchObject({ locked: true, reason: 'suspended', message: 'لم يتم الدفع' });

    // نسخة قديمة من القائمة لا تُلغي الإيقاف
    served = feed({ L9: { status: 'active' } }, '2026-01-15T00:00:00Z');
    await m.refresh();
    expect(m.status()).toMatchObject({ locked: true, reason: 'suspended' });

    served = feed({ L9: { status: 'active' } }, '2026-02-02T00:00:00Z');
    clock = at('2026-02-02T01:00:00Z');
    await m.refresh();
    expect(m.status().locked).toBe(false);
  });

  it('locks when offline too long and unlocks after a successful check', async () => {
    const m = manager();
    m.activate(issueLicense({ customer: 'x', machineId: MACHINE, plan: 'lifetime', issuedAt, id: 'L2' }, priv));
    failing = true;
    clock = at('2026-01-20T00:00:00Z');
    await m.refresh();
    expect(m.status()).toMatchObject({ locked: true, reason: 'offline' });
    // إعادة إدخال المفتاح لا تتجاوز التحقق
    expect(() => m.activate(issueLicense({ customer: 'x', machineId: MACHINE, plan: 'lifetime', issuedAt, id: 'L2' }, priv))).not.toThrow();
    expect(m.status()).toMatchObject({ locked: true, reason: 'offline' });
    failing = false;
    served = feed({}, '2026-01-20T00:00:00Z');
    await m.refresh();
    expect(m.status()).toMatchObject({ locked: false, offlineDaysLeft: 7 });
  });

  it('treats a tampered local file as empty', () => {
    const m = manager();
    m.activate(issueLicense({ customer: 'x', machineId: MACHINE, plan: 'annual', issuedAt }, priv));
    const file = path.join(dir, 'license.dat');
    const buf = fs.readFileSync(file);
    buf[buf.length - 1] ^= 1;
    fs.writeFileSync(file, buf);
    expect(m.status()).toMatchObject({ locked: true, reason: 'none' });
  });
});
