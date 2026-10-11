import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// التشفير: AES-256-GCM لكل سجل. مفتاح البيانات عشوائي، ويُحفظ مغلّفاً بكلمة سر كل مستخدم
// (scrypt) وبرمز استرداد، فلا يمكن قراءة ملفات الشركة بدون كلمة سر صحيحة.

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export interface Sealed {
  iv: string;
  ct: string;
  tag: string;
}

const b64 = (b: Buffer) => b.toString('base64');
const unb64 = (s: string) => Buffer.from(s, 'base64');

export function randomKey(): Buffer {
  return randomBytes(32);
}

export function deriveKey(secret: string, salt: Buffer, params = SCRYPT): Buffer {
  return scryptSync(secret.normalize('NFC'), salt, 32, params);
}

export function seal(key: Buffer, plain: Buffer | string, aad?: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain), cipher.final()]);
  return { iv: b64(iv), ct: b64(ct), tag: b64(cipher.getAuthTag()) };
}

/** يرمي خطأ إن كان المفتاح خاطئاً أو البيانات معدّلة. */
export function open(key: Buffer, sealed: Sealed, aad?: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, unb64(sealed.iv));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(unb64(sealed.tag));
  return Buffer.concat([decipher.update(unb64(sealed.ct)), decipher.final()]);
}

export interface WrappedKey extends Sealed {
  salt: string;
}

export function wrapKey(dataKey: Buffer, secret: string): WrappedKey {
  const salt = randomBytes(16);
  return { salt: b64(salt), ...seal(deriveKey(secret, salt), dataKey, 'mizan-key') };
}

export function unwrapKey(wrapped: WrappedKey, secret: string): Buffer | null {
  try {
    return open(deriveKey(secret, unb64(wrapped.salt)), wrapped, 'mizan-key');
  } catch {
    return null;
  }
}

export function hmac(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** رمز استرداد من 24 حرفاً مقروءاً، مثل ABCD-EFGH-... */
export function newRecoveryCode(): string {
  const bytes = randomBytes(24);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

export function normalizeRecoveryCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.match(/.{1,4}/g)?.join('-') ?? '';
}
