// صيغة الرخص وقائمة الحالة والتوقيع (Ed25519 بمكتبة noble): نفس الكود بيشتغل بالكمبيوتر وبلوحة الإدارة على النت
// (Cloudflare Workers ما فيها node:crypto كاملة). التوقيع حتمي ومتطابق مع node:crypto بالظبط.
import { ed25519 } from '@noble/curves/ed25519.js';

export type Plan = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'lifetime';

export const PLANS: Record<Plan, { nameAr: string; days: number | null }> = {
  monthly: { nameAr: 'اشتراك شهري', days: 30 },
  quarterly: { nameAr: 'اشتراك 3 أشهر', days: 90 },
  semiannual: { nameAr: 'اشتراك 6 أشهر', days: 180 },
  annual: { nameAr: 'اشتراك سنوي', days: 365 },
  lifetime: { nameAr: 'شراء دائم', days: null },
};

export const DEFAULT_OFFLINE_DAYS = 7;

export interface LicensePayload {
  v: 2;
  id: string;
  customer: string;
  machineId: string;
  plan: Plan;
  devices: number; // عدد الأجهزة المسموح بها (الجهاز الرئيسي + أجهزة الشبكة)
  issuedAt: string; // ISO
  expiresAt: string | null; // null = دائم
  offlineDays: number; // كم يوماً يعمل البرنامج بدون التحقق من الإنترنت
}

export type FeedStatus = 'active' | 'suspended' | 'revoked';

export interface FeedEntry {
  status: FeedStatus;
  expiresAt?: string | null; // تمديد/تعديل تاريخ الانتهاء دون مفتاح جديد
  devices?: number;
  message?: string; // رسالة تظهر للعميل (مثلاً: يرجى تسديد الاشتراك)
  /** خدمة الاتصال عن بعد (إضافية، بتنفتح من لوحة الإدارة لكل زبون). */
  cloud?: boolean;
}

/** إعلان نسخة جديدة من البرنامج، ينشر مع قائمة الحالة الموقّعة فلا يمكن تزويره. */
export interface UpdateInfo {
  version: string; // مثل 0.3.0
  url: string; // رابط تحميل ملف التنصيب
  notes: string[]; // شو الجديد
  date: string; // ISO
  /** النسخ الأقدم من هذه لازم تتحدث قبل ما تكمل شغل. */
  minVersion?: string;
}

export interface LicenseFeed {
  v: 1;
  issuedAt: string; // وقت النشر — يُستخدم كوقت موثوق لكشف تلاعب الساعة
  entries: Record<string, FeedEntry>;
  update?: UpdateInfo;
}

/** مقارنة أرقام النسخ (1.2.10 > 1.2.9). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** هل في تحديث لهالنسخة؟ وهل هو إجباري؟ */
export function updateFor(feed: LicenseFeed | null | undefined, current: string): (UpdateInfo & { mandatory: boolean }) | null {
  const u = feed?.update;
  if (!u || typeof u.version !== 'string' || !/^https:\/\//.test(u.url ?? '')) return null;
  if (compareVersions(u.version, current) <= 0) return null;
  return { ...u, notes: Array.isArray(u.notes) ? u.notes.map(String) : [], mandatory: !!u.minVersion && compareVersions(current, u.minVersion) < 0 };
}

export const KEY_PREFIX = 'MZN2-';

/** حروف كود التفعيل القصير: بدون 0/O و1/I حتى ما يتلخبط الزبون. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** كود التفعيل القصير (16 حرف) بشكل XXXX-XXXX-XXXX-XXXX، أو null إذا النص مش كود قصير. */
export function normalizeShortCode(text: string): string | null {
  const clean = String(text ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (clean.length !== 16 || [...clean].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return clean.match(/.{4}/g)!.join('-');
}
export const FEED_PREFIX = 'MZNF1.';
export const DAY = 86_400_000;

// ───────────── base64url و PEM بدون Buffer ─────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? B64[n & 63]! : '=');
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]!) : -1));
    const n = (c[0]! << 18) | (c[1]! << 12) | (Math.max(c[2]!, 0) << 6) | Math.max(c[3]!, 0);
    out.push((n >> 16) & 255);
    if (c[2]! >= 0) out.push((n >> 8) & 255);
    if (c[3]! >= 0) out.push(n & 255);
  }
  return new Uint8Array(out);
}

const toB64Url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** مفتاح Ed25519 من PEM (PKCS8 خاص أو SPKI عام): آخر 32 بايت هي المفتاح نفسه. */
function pemKey(pem: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): Uint8Array {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`).exec(pem);
  if (!m) throw new Error(label === 'PRIVATE KEY' ? 'المفتاح الخاص غير صالح' : 'المفتاح العام غير صالح');
  const der = fromBase64(m[1]!);
  // Ed25519: OID 1.3.101.112 (06 03 2B 65 70)
  const oid = der.findIndex((b, i) => b === 0x06 && der[i + 1] === 0x03 && der[i + 2] === 0x2b && der[i + 3] === 0x65 && der[i + 4] === 0x70);
  if (oid < 0 || der.length < 32) throw new Error('المفتاح مش Ed25519');
  return der.slice(der.length - 32);
}

/** المفتاح العام (PEM) من الخاص. */
export function publicKeyFromPrivate(privateKeyPem: string): string {
  const pub = ed25519.getPublicKey(pemKey(privateKeyPem, 'PRIVATE KEY'));
  const der = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00, ...pub]);
  return `-----BEGIN PUBLIC KEY-----\n${toBase64(der)}\n-----END PUBLIC KEY-----\n`;
}

export function signText(json: unknown, privateKeyPem: string): string {
  const body = new TextEncoder().encode(JSON.stringify(json));
  return toB64Url(body) + '.' + toB64Url(ed25519.sign(body, pemKey(privateKeyPem, 'PRIVATE KEY')));
}

export function verifyText<T>(text: string, publicKeyPem: string): T | null {
  const [bodyPart, sigPart, extra] = text.trim().split('.');
  if (!bodyPart || !sigPart || extra !== undefined) return null;
  try {
    const body = fromBase64(bodyPart);
    if (!ed25519.verify(fromBase64(sigPart), body, pemKey(publicKeyPem, 'PUBLIC KEY'))) return null;
    return JSON.parse(new TextDecoder().decode(body)) as T;
  } catch {
    return null;
  }
}

// ───────────── إصدار المفاتيح والقائمة (أداة البائع فقط) ─────────────

export interface IssueOptions {
  customer: string;
  machineId: string;
  plan: Plan;
  devices?: number;
  offlineDays?: number;
  issuedAt?: Date;
  expiresAt?: Date | null; // لتحديد تاريخ انتهاء مخصص
  id?: string; // لإعادة إصدار نفس الترخيص بمفتاح جديد
}

export function buildPayload(opts: IssueOptions): LicensePayload {
  const issuedAt = opts.issuedAt ?? new Date();
  const days = PLANS[opts.plan].days;
  const expiresAt =
    opts.expiresAt !== undefined ? (opts.expiresAt ? opts.expiresAt.toISOString() : null) : days === null ? null : new Date(issuedAt.getTime() + days * DAY).toISOString();
  return {
    v: 2,
    id: opts.id ?? crypto.randomUUID(),
    customer: opts.customer,
    machineId: opts.machineId.trim().toUpperCase(),
    plan: opts.plan,
    devices: opts.devices ?? 1,
    issuedAt: issuedAt.toISOString(),
    expiresAt,
    offlineDays: opts.offlineDays ?? DEFAULT_OFFLINE_DAYS,
  };
}

export function issueLicense(opts: IssueOptions, privateKeyPem: string): string {
  return KEY_PREFIX + signText(buildPayload(opts), privateKeyPem);
}

export function signFeed(feed: LicenseFeed, privateKeyPem: string): string {
  return FEED_PREFIX + signText(feed, privateKeyPem);
}

export function parseLicense(key: string, publicKeyPem: string): LicensePayload | null {
  const trimmed = key.trim().replace(/\s+/g, '');
  if (!trimmed.startsWith(KEY_PREFIX)) return null;
  const payload = verifyText<LicensePayload>(trimmed.slice(KEY_PREFIX.length), publicKeyPem);
  return payload?.v === 2 ? payload : null;
}

export function parseFeed(text: string, publicKeyPem: string): LicenseFeed | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(FEED_PREFIX)) return null;
  const feed = verifyText<LicenseFeed>(trimmed.slice(FEED_PREFIX.length), publicKeyPem);
  return feed?.v === 1 && typeof feed.issuedAt === 'string' && feed.entries ? feed : null;
}
