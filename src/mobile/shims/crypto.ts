// نسخة من node:crypto للموبايل (WebView): نفس الدوال اللي بيستعملها كود التخزين والترخيص، بمكتبات noble (JS صافي ومتزامن).
import { gcm } from '@noble/ciphers/aes.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Buffer } from 'buffer';

type Data = string | Uint8Array;
const bytes = (d: Data): Uint8Array => (typeof d === 'string' ? new TextEncoder().encode(d) : d);
const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const out = (b: Uint8Array, enc?: string): Buffer | string => (enc ? Buffer.from(b).toString(enc as BufferEncoding) : Buffer.from(b));

function hasher(make: () => { update(d: Uint8Array): unknown; digest(): Uint8Array }) {
  const h = make();
  const api = {
    update(d: Data) {
      h.update(bytes(d));
      return api;
    },
    digest(enc?: string) {
      return out(h.digest(), enc);
    },
  };
  return api;
}

export function createHash(alg: string) {
  if (alg !== 'sha256') throw new Error(`hash غير مدعوم: ${alg}`);
  return hasher(() => sha256.create());
}

export function createHmac(alg: string, key: Data) {
  if (alg !== 'sha256') throw new Error(`hmac غير مدعوم: ${alg}`);
  return hasher(() => hmac.create(sha256, bytes(key)));
}

export function randomBytes(n: number): Buffer {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(n)));
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export function scryptSync(secret: Data, salt: Data, keylen: number, o: { N?: number; r?: number; p?: number } = {}): Buffer {
  return Buffer.from(scrypt(bytes(secret), bytes(salt), { N: o.N ?? 16384, r: o.r ?? 8, p: o.p ?? 1, dkLen: keylen }));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i]! ^ b[i]!;
  return x === 0;
}

// AES-256-GCM بنفس شكل واجهة node: update بترجع فاضي، والنتيجة كلها بـ final
export function createCipheriv(alg: string, key: Uint8Array, iv: Uint8Array) {
  if (alg !== 'aes-256-gcm') throw new Error(`تشفير غير مدعوم: ${alg}`);
  const parts: Uint8Array[] = [];
  let aad: Uint8Array | undefined;
  let tag: Uint8Array | null = null;
  return {
    setAAD(a: Uint8Array) {
      aad = a;
    },
    update(d: Data) {
      parts.push(bytes(d));
      return Buffer.alloc(0);
    },
    final() {
      const sealed = gcm(key, iv, aad).encrypt(concat(parts));
      tag = sealed.slice(sealed.length - 16);
      return Buffer.from(sealed.slice(0, sealed.length - 16));
    },
    getAuthTag() {
      if (!tag) throw new Error('final() لازم قبل getAuthTag()');
      return Buffer.from(tag);
    },
  };
}

export function createDecipheriv(alg: string, key: Uint8Array, iv: Uint8Array) {
  if (alg !== 'aes-256-gcm') throw new Error(`تشفير غير مدعوم: ${alg}`);
  const parts: Uint8Array[] = [];
  let aad: Uint8Array | undefined;
  let tag: Uint8Array | null = null;
  return {
    setAAD(a: Uint8Array) {
      aad = a;
    },
    setAuthTag(t: Uint8Array) {
      tag = t;
    },
    update(d: Data) {
      parts.push(bytes(d));
      return Buffer.alloc(0);
    },
    final() {
      if (!tag) throw new Error('Unsupported state or unable to authenticate data');
      return Buffer.from(gcm(key, iv, aad).decrypt(concat([...parts, tag])));
    },
  };
}

// Ed25519 للتحقق من التراخيص والقائمة الموقّعة. المفتاح العام PEM (SPKI): آخر 32 بايت هي المفتاح.
interface KeyObject {
  raw: Uint8Array;
}

export function createPublicKey(pem: string | KeyObject): KeyObject {
  if (typeof pem !== 'string') return pem;
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
  if (der.length !== 44) throw new Error('مفتاح عام غير مدعوم');
  return { raw: new Uint8Array(der.subarray(12)) };
}

export function verify(_alg: null, data: Uint8Array, key: string | KeyObject, sig: Uint8Array): boolean {
  try {
    return ed25519.verify(sig, data, createPublicKey(key).raw);
  } catch {
    return false;
  }
}

// إصدار التراخيص أداة البائع على الكمبيوتر بس
export function createPrivateKey(): never {
  throw new Error('غير متاح على الموبايل');
}
export function sign(): never {
  throw new Error('غير متاح على الموبايل');
}

export default { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv, createPublicKey, verify, createPrivateKey, sign };
