import nodeCrypto from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as shim from '../src/mobile/shims/crypto';
import { issueLicense, parseLicense } from '../src/license/license';
import { LICENSE_PUBLIC_KEY } from '../src/license/public-key';

// نسخة الموبايل لازم تقرأ وتكتب بالضبط متل الكمبيوتر (نفس الصيغ ونفس النتائج)
describe('mobile crypto shim matches node:crypto', () => {
  it('sha256, hmac and scrypt give the same bytes', () => {
    expect(shim.createHash('sha256').update('وزن').digest('hex')).toBe(nodeCrypto.createHash('sha256').update('وزن').digest('hex'));
    const key = Buffer.from('k'.repeat(32));
    expect(shim.createHmac('sha256', key).update('x|1').digest('hex')).toBe(nodeCrypto.createHmac('sha256', key).update('x|1').digest('hex'));
    const salt = Buffer.from('0123456789abcdef');
    const p = { N: 1 << 10, r: 8, p: 1 };
    expect(Buffer.from(shim.scryptSync('كلمة سر', salt, 32, p)).toString('hex')).toBe(nodeCrypto.scryptSync('كلمة سر', salt, 32, p).toString('hex'));
  });

  it('AES-256-GCM is interchangeable in both directions, AAD included, and rejects tampering', () => {
    const key = nodeCrypto.randomBytes(32);
    const iv = nodeCrypto.randomBytes(12);
    const aad = Buffer.from('3|abc');
    const c = shim.createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(aad);
    const ct = Buffer.concat([c.update('بيانات الشركة'), c.final()]);
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAAD(aad);
    d.setAuthTag(c.getAuthTag());
    expect(Buffer.concat([d.update(ct), d.final()]).toString()).toBe('بيانات الشركة');

    const nc = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
    const nct = Buffer.concat([nc.update('رصيد'), nc.final()]);
    const sd = shim.createDecipheriv('aes-256-gcm', key, iv);
    sd.setAuthTag(nc.getAuthTag());
    expect(Buffer.concat([sd.update(nct), sd.final()]).toString()).toBe('رصيد');

    const bad = shim.createDecipheriv('aes-256-gcm', key, iv);
    bad.setAuthTag(Buffer.alloc(16));
    bad.update(nct);
    expect(() => bad.final()).toThrow();
  });

  it('verifies Ed25519 license signatures like node', () => {
    const dev = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
    const pub = nodeCrypto.createPublicKey(dev).export({ type: 'spki', format: 'pem' }).toString();
    const key = issueLicense({ customer: 'موبايل', machineId: 'AAAA-BBBB-CCCC-DDDD', plan: 'annual' }, dev);
    const [body, sig] = key.replace(/^MZN2-/, '').split('.');
    const bodyBuf = Buffer.from(body!, 'base64url');
    const sigBuf = Buffer.from(sig!, 'base64url');
    expect(shim.verify(null, bodyBuf, pub, sigBuf)).toBe(true);
    expect(shim.verify(null, Buffer.from('x'), pub, sigBuf)).toBe(false);
    expect(parseLicense(key, pub)).not.toBeNull();
    // المفتاح الحقيقي (المضمّن بالبرنامج) بنفس صيغة SPKI
    expect(() => shim.createPublicKey(LICENSE_PUBLIC_KEY)).not.toThrow();
  });
});
