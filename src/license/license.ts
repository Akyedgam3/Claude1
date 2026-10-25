import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

// الترخيص: نحن نوقّع مفتاح الترخيص بمفتاح خاص (Ed25519) لا يخرج من عندنا، والبرنامج يتحقق منه
// بالمفتاح العام المضمّن فيه. المفتاح مربوط ببصمة الجهاز ومدة الاشتراك.
// إضافة لذلك ننشر "قائمة حالة" موقّعة على الإنترنت يتحقق منها البرنامج دورياً، فنستطيع إيقاف
// أي ترخيص أو تمديده في أي وقت دون الحاجة لمفتاح جديد.

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

const KEY_PREFIX = 'MZN2-';
const FEED_PREFIX = 'MZNF1.';
const DAY = 86_400_000;

const b64 = (buf: Buffer) => buf.toString('base64url');

function signText(json: unknown, privateKeyPem: string): string {
  const body = Buffer.from(JSON.stringify(json), 'utf8');
  return b64(body) + '.' + b64(sign(null, body, createPrivateKey(privateKeyPem)));
}

function verifyText<T>(text: string, publicKeyPem: string): T | null {
  const [bodyPart, sigPart, extra] = text.trim().split('.');
  if (!bodyPart || !sigPart || extra !== undefined) return null;
  const body = Buffer.from(bodyPart, 'base64url');
  try {
    if (!verify(null, body, createPublicKey(publicKeyPem), Buffer.from(sigPart, 'base64url'))) return null;
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    return null;
  }
}

// ───────────── بصمة الجهاز ─────────────

function readPlatformId(): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
      return /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out)?.[1] ?? null;
    }
    if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      return /"IOPlatformUUID" = "([^"]+)"/.exec(out)?.[1] ?? null;
    }
    for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim() || null;
    }
  } catch {
    // نرجع للطريقة الاحتياطية
  }
  return null;
}

/** رقم اللوحة الأم (SMBIOS UUID): ثابت مع الفورمات وتحديثات ويندوز، ومختلف بين جهاز وجهاز. */
function readHardwareUuid(): string | null {
  if (process.platform !== 'win32') return null;
  const clean = (v: string | undefined) => {
    const u = v?.replace(/[{}]/g, '').trim().toUpperCase();
    // بعض اللوحات الرخيصة بتعطي رقم وهمي واحد لكل الأجهزة
    return u && /^[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}$/.test(u) && !/^(0{8}-0{4}|F{8}-F{4}|03000200-0400-0500-0006-000700080009)/.test(u) ? u : null;
  };
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SYSTEM\\HardwareConfig', '/v', 'LastConfig'], { encoding: 'utf8', windowsHide: true });
    const u = clean(/LastConfig\s+REG_SZ\s+(\S+)/i.exec(out)?.[1]);
    if (u) return u;
  } catch {
    // نجرّب PowerShell
  }
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    return clean(out);
  } catch {
    return null;
  }
}

const fmtId = (raw: string) => createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase().match(/.{4}/g)!.join('-');

/**
 * بصمة ثابتة للجهاز تُرسل لنا لإصدار الترخيص.
 * - `legacy`: من MachineGuid بس (لحتى 1.2.18). نسخ ويندوز المعدّلة المنسوخة من نفس الملف بتطلع بنفس
 *   MachineGuid على كل الأجهزة، فصار في أجهزة بمدن مختلفة بنفس البصمة.
 * - `id`: MachineGuid + رقم اللوحة الأم، فبتختلف حتى لو نفس نسخة ويندوز. هي اللي بتنعرض للتفعيل الجديد.
 * التراخيص القديمة الصادرة على `legacy` بتضل شغالة.
 */
export function machineIds(): { id: string; legacy: string } {
  const platformId = readPlatformId();
  const legacy = fmtId(platformId ? `mizan|${platformId}` : [os.platform(), os.arch(), os.cpus()[0]?.model ?? '', os.totalmem(), os.hostname()].join('|'));
  const hw = platformId ? readHardwareUuid() : null;
  return { id: hw ? fmtId(`wazn2|${platformId}|${hw}`) : legacy, legacy };
}

export function machineId(): string {
  return machineIds().id;
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
    id: opts.id ?? randomUUID(),
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

// ───────────── التحقق (داخل البرنامج) ─────────────

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

export type LicenseCheck =
  | { status: 'valid'; payload: LicensePayload; expiresAt: string | null; daysLeft: number | null; devices: number; cloud: boolean; message?: string }
  | { status: 'locked'; reason: 'none' | 'invalid' | 'machine' | 'expired' | 'suspended' | 'revoked' | 'offline' | 'clock'; message: string; payload?: LicensePayload };

export interface VerifyOptions {
  /** بصمة الجهاز (أو كذا بصمة: الجديدة والقديمة). */
  machineId: string | string[];
  now?: Date;
  /** آخر وقت شوهد فيه البرنامج يعمل؛ لكشف إرجاع ساعة الجهاز للخلف. */
  lastSeen?: Date;
  /** آخر قائمة حالة صالحة تم تنزيلها. */
  feed?: LicenseFeed | null;
  /** وقت آخر تحقق ناجح من الإنترنت (بساعة الجهاز). */
  lastOnline?: Date | null;
  /** هل التحقق من الإنترنت مفعّل في هذه النسخة. */
  onlineRequired?: boolean;
}

export function checkLicense(key: string | undefined, publicKeyPem: string, opts: VerifyOptions): LicenseCheck {
  if (!key) return { status: 'locked', reason: 'none', message: 'البرنامج غير مفعّل. أدخل مفتاح الترخيص.' };
  const payload = parseLicense(key, publicKeyPem);
  if (!payload) return { status: 'locked', reason: 'invalid', message: 'مفتاح الترخيص غير صالح' };
  if (![opts.machineId].flat().includes(payload.machineId)) return { status: 'locked', reason: 'machine', message: 'الترخيص صادر لجهاز آخر', payload };

  const now = opts.now ?? new Date();
  const clockWrong = { status: 'locked' as const, reason: 'clock' as const, message: 'تاريخ الجهاز غير صحيح، يرجى ضبط الساعة والتاريخ', payload };
  // نسمح بفرق يوم واحد (تغيير المنطقة الزمنية مثلاً)
  if (opts.lastSeen && now.getTime() < opts.lastSeen.getTime() - DAY) return clockWrong;
  if (now.getTime() < new Date(payload.issuedAt).getTime() - DAY) return clockWrong;
  if (opts.feed && now.getTime() < new Date(opts.feed.issuedAt).getTime() - DAY) return clockWrong;

  const entry = opts.feed?.entries[payload.id];
  if (entry?.status === 'revoked') return { status: 'locked', reason: 'revoked', message: entry.message || 'تم إلغاء هذا الترخيص', payload };
  if (entry?.status === 'suspended') {
    return { status: 'locked', reason: 'suspended', message: entry.message || 'تم إيقاف الترخيص مؤقتاً. يرجى التواصل مع البائع.', payload };
  }

  if (opts.onlineRequired) {
    const last = opts.lastOnline?.getTime() ?? 0;
    const graceEnds = (last || new Date(payload.issuedAt).getTime()) + payload.offlineDays * DAY;
    if (now.getTime() > graceEnds) {
      return {
        status: 'locked',
        reason: 'offline',
        message: `لم يتم التحقق من الاشتراك منذ أكثر من ${payload.offlineDays} أيام. اتصل بالإنترنت ليتم التحقق تلقائياً.`,
        payload,
      };
    }
  }

  const expiresAt = entry && entry.expiresAt !== undefined ? entry.expiresAt : payload.expiresAt;
  const devices = entry?.devices ?? payload.devices;
  const cloud = entry?.cloud === true;
  const message = entry?.message;
  if (expiresAt === null) return { status: 'valid', payload, expiresAt, daysLeft: null, devices, cloud, ...(message ? { message } : {}) };
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return { status: 'locked', reason: 'expired', message: 'انتهى الاشتراك. يرجى التجديد للمتابعة.', payload };
  return { status: 'valid', payload, expiresAt, daysLeft: Math.ceil(left / DAY), devices, cloud, ...(message ? { message } : {}) };
}
