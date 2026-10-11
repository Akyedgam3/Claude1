import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';
import os from 'node:os';

// الترخيص يعمل بدون إنترنت: نحن نوقّع مفتاح الترخيص بمفتاح خاص (Ed25519) لا يخرج من عندنا،
// والبرنامج يتحقق منه بالمفتاح العام المضمّن فيه. المفتاح مربوط ببصمة الجهاز ومدة الاشتراك.

export type Plan = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'lifetime';

export const PLANS: Record<Plan, { nameAr: string; days: number | null }> = {
  monthly: { nameAr: 'اشتراك شهري', days: 30 },
  quarterly: { nameAr: 'اشتراك 3 أشهر', days: 90 },
  semiannual: { nameAr: 'اشتراك 6 أشهر', days: 180 },
  annual: { nameAr: 'اشتراك سنوي', days: 365 },
  lifetime: { nameAr: 'شراء دائم', days: null },
};

export interface LicensePayload {
  v: 1;
  id: string;
  customer: string;
  machineId: string;
  plan: Plan;
  devices: number; // عدد الأجهزة المسموح بها على الشبكة المحلية (الجهاز الرئيسي + الفرعية)
  issuedAt: string; // ISO
  expiresAt: string | null; // null = دائم
}

export type LicenseCheck =
  | { status: 'valid'; payload: LicensePayload; daysLeft: number | null }
  | { status: 'expired'; payload: LicensePayload } // البرنامج يعمل للقراءة والطباعة فقط
  | { status: 'invalid'; reason: string };

const PREFIX = 'MZN1-';
const DAY = 86_400_000;

const b64 = (buf: Buffer) => buf.toString('base64url');

/** بصمة ثابتة للجهاز تُرسل لنا لإصدار الترخيص. */
export function machineId(): string {
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && !n.internal && n.mac !== '00:00:00:00:00:00')
    .map((n) => n!.mac)
    .sort();
  const raw = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model ?? '', ...new Set(macs)].join('|');
  const hex = createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g)!.join('-');
}

export interface IssueOptions {
  customer: string;
  machineId: string;
  plan: Plan;
  devices?: number;
  issuedAt?: Date;
}

/** يُستخدم عندنا فقط (أداة إصدار التراخيص)، وليس داخل البرنامج المُوزَّع. */
export function issueLicense(opts: IssueOptions, privateKeyPem: string): string {
  const issuedAt = opts.issuedAt ?? new Date();
  const days = PLANS[opts.plan].days;
  const payload: LicensePayload = {
    v: 1,
    id: randomUUID(),
    customer: opts.customer,
    machineId: opts.machineId,
    plan: opts.plan,
    devices: opts.devices ?? 1,
    issuedAt: issuedAt.toISOString(),
    expiresAt: days === null ? null : new Date(issuedAt.getTime() + days * DAY).toISOString(),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = sign(null, body, createPrivateKey(privateKeyPem));
  return PREFIX + b64(body) + '.' + b64(signature);
}

export interface VerifyOptions {
  machineId: string;
  now?: Date;
  /** آخر وقت شوهد فيه البرنامج يعمل؛ لكشف إرجاع ساعة الجهاز للخلف. */
  lastSeen?: Date;
}

export function verifyLicense(key: string, publicKeyPem: string, opts: VerifyOptions): LicenseCheck {
  const trimmed = key.trim();
  if (!trimmed.startsWith(PREFIX)) return { status: 'invalid', reason: 'صيغة مفتاح الترخيص غير صحيحة' };
  const [bodyPart, sigPart] = trimmed.slice(PREFIX.length).split('.');
  if (!bodyPart || !sigPart) return { status: 'invalid', reason: 'صيغة مفتاح الترخيص غير صحيحة' };

  const body = Buffer.from(bodyPart, 'base64url');
  let ok = false;
  try {
    ok = verify(null, body, createPublicKey(publicKeyPem), Buffer.from(sigPart, 'base64url'));
  } catch {
    ok = false;
  }
  if (!ok) return { status: 'invalid', reason: 'مفتاح الترخيص غير صالح' };

  const payload = JSON.parse(body.toString('utf8')) as LicensePayload;
  if (payload.machineId !== opts.machineId) return { status: 'invalid', reason: 'الترخيص صادر لجهاز آخر' };

  const now = opts.now ?? new Date();
  // نسمح بفرق يوم واحد (تغيير المنطقة الزمنية مثلاً)
  if (opts.lastSeen && now.getTime() < opts.lastSeen.getTime() - DAY) {
    return { status: 'invalid', reason: 'تاريخ الجهاز غير صحيح، يرجى ضبط الساعة' };
  }
  if (now.getTime() < new Date(payload.issuedAt).getTime() - DAY) {
    return { status: 'invalid', reason: 'تاريخ الجهاز غير صحيح، يرجى ضبط الساعة' };
  }
  if (payload.expiresAt === null) return { status: 'valid', payload, daysLeft: null };
  const left = new Date(payload.expiresAt).getTime() - now.getTime();
  if (left <= 0) return { status: 'expired', payload };
  return { status: 'valid', payload, daysLeft: Math.ceil(left / DAY) };
}
