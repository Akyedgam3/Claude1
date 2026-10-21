import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkLicense, machineId as readMachineId, parseFeed, parseLicense, PLANS, updateFor, type LicenseCheck, type LicenseFeed, type UpdateInfo } from './license';

// يحفظ مفتاح الترخيص وآخر قائمة حالة ووقت آخر تحقق في ملف مشفّر على الجهاز.
// التلاعب بالملف يجعله غير صالح فيُعامل كأنه لم يتم أي تحقق.

interface Stored {
  key?: string;
  feed?: string; // آخر قائمة حالة موقّعة كما وصلت
  lastOnline?: string; // ISO
  lastSeen?: string; // ISO
}

export interface LicenseStatus {
  machineId: string;
  locked: boolean;
  reason?: Extract<LicenseCheck, { status: 'locked' }>['reason'];
  message?: string;
  licenseId?: string;
  customer?: string;
  planName?: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
  devices: number;
  /** خدمة الاتصال عن بعد مفعّلة لهالترخيص (من القائمة الموقّعة). */
  cloud: boolean;
  onlineEnabled: boolean;
  lastOnline?: string;
  /** أيام متبقية قبل القفل إن لم يتصل بالإنترنت. */
  offlineDaysLeft?: number;
  /** نسخة أحدث منشورة (من القائمة الموقّعة). */
  update?: UpdateInfo & { mandatory: boolean };
}

export interface ManagerOptions {
  dataDir: string;
  publicKey: string;
  feedUrls: string[];
  fetcher?: (url: string) => Promise<string>;
  now?: () => Date;
  machineId?: string;
  /** نسخة البرنامج الحالية، لمعرفة إذا في تحديث. */
  appVersion?: string;
}

const DAY = 86_400_000;

async function defaultFetch(url: string): Promise<string> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export class LicenseManager {
  readonly machineId: string;
  private readonly file: string;
  private readonly secret: Buffer;
  private readonly fetcher: (url: string) => Promise<string>;
  private readonly now: () => Date;

  constructor(private readonly o: ManagerOptions) {
    this.machineId = o.machineId ?? readMachineId();
    this.file = path.join(o.dataDir, 'license.dat');
    this.secret = createHash('sha256').update(`mizan-local|${this.machineId}`).digest();
    this.fetcher = o.fetcher ?? defaultFetch;
    this.now = o.now ?? (() => new Date());
  }

  get onlineEnabled(): boolean {
    return this.o.feedUrls.length > 0;
  }

  private read(): Stored {
    try {
      const buf = fs.readFileSync(this.file);
      const decipher = createDecipheriv('aes-256-gcm', this.secret, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
    } catch {
      return {};
    }
  }

  private write(data: Stored): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.secret, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // حفظ آمن: ملف مؤقت ثم استبدال، حتى لا يضيع الترخيص إن انقطعت الكهرباء أثناء الحفظ
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, Buffer.concat([iv, cipher.getAuthTag(), ct]));
    fs.renameSync(tmp, this.file);
  }

  private feedOf(data: Stored): LicenseFeed | null {
    return data.feed ? parseFeed(data.feed, this.o.publicKey) : null;
  }

  status(): LicenseStatus {
    const data = this.read();
    const now = this.now();
    const check = checkLicense(data.key, this.o.publicKey, {
      machineId: this.machineId,
      now,
      ...(data.lastSeen ? { lastSeen: new Date(data.lastSeen) } : {}),
      feed: this.feedOf(data),
      lastOnline: data.lastOnline ? new Date(data.lastOnline) : null,
      onlineRequired: this.onlineEnabled,
    });
    if (check.status !== 'locked' || check.reason !== 'clock') {
      if (!data.lastSeen || new Date(data.lastSeen) < now) this.write({ ...data, lastSeen: now.toISOString() });
    }
    const payload = check.payload;
    const update = this.o.appVersion ? updateFor(this.feedOf(data), this.o.appVersion) : null;
    const base: LicenseStatus = {
      machineId: this.machineId,
      locked: check.status === 'locked',
      devices: check.status === 'valid' ? check.devices : (payload?.devices ?? 1),
      cloud: check.status === 'valid' && check.cloud,
      onlineEnabled: this.onlineEnabled,
      ...(data.lastOnline ? { lastOnline: data.lastOnline } : {}),
      ...(update ? { update } : {}),
      ...(payload ? { licenseId: payload.id, customer: payload.customer, planName: PLANS[payload.plan].nameAr } : {}),
    };
    if (check.status === 'locked') return { ...base, reason: check.reason, message: check.message };
    const offlineDaysLeft = this.onlineEnabled
      ? Math.max(0, Math.ceil(((data.lastOnline ? new Date(data.lastOnline).getTime() : new Date(check.payload.issuedAt).getTime()) + check.payload.offlineDays * DAY - now.getTime()) / DAY))
      : undefined;
    return {
      ...base,
      expiresAt: check.expiresAt,
      daysLeft: check.daysLeft,
      ...(check.message ? { message: check.message } : {}),
      ...(offlineDaysLeft !== undefined ? { offlineDaysLeft } : {}),
    };
  }

  /** تفعيل مفتاح جديد. يرمي خطأ إن كان غير صالح لهذا الجهاز. */
  activate(key: string): LicenseStatus {
    const clean = key.trim().replace(/\s+/g, '');
    const payload = parseLicense(clean, this.o.publicKey);
    if (!payload) throw new Error('مفتاح الترخيص غير صالح');
    if (payload.machineId !== this.machineId) throw new Error('هذا المفتاح صادر لجهاز آخر');
    const data = this.read();
    // لا نعيد ضبط وقت آخر تحقق عند التفعيل؛ مهلة العمل بدون إنترنت تُحسب من تاريخ إصدار المفتاح
    // أو من آخر تحقق فعلي، حتى لا يكفي إعادة إدخال المفتاح لتجاوز التحقق
    const old = data.key ? parseLicense(data.key, this.o.publicKey) : null;
    const now = this.now();
    // مفتاح أحدث من البائع (موقّع) دليل على وقت صحيح: يصلح قفل "تاريخ الجهاز" إن قفزت الساعة للمستقبل سابقاً
    const newer = (!old || payload.issuedAt > old.issuedAt) && now.getTime() >= new Date(payload.issuedAt).getTime() - DAY;
    this.write({ ...data, key: clean, ...(newer ? { lastSeen: now.toISOString() } : {}) });
    const s = this.status();
    if (s.locked && s.reason !== 'offline') throw new Error(s.message ?? 'تعذر التفعيل');
    return s;
  }

  /** التحقق من الإنترنت. يعيد true إن وصلت قائمة صالحة. */
  async refresh(): Promise<boolean> {
    if (!this.onlineEnabled) return false;
    for (const url of this.o.feedUrls) {
      try {
        const text = await this.fetcher(url);
        const feed = parseFeed(text, this.o.publicKey);
        if (!feed) continue;
        const data = this.read();
        const cached = this.feedOf(data);
        // نرفض قائمة أقدم من المحفوظة (حتى لا تُستخدم نسخة قديمة لإعادة تفعيل ترخيص موقوف)
        if (cached && feed.issuedAt < cached.issuedAt) continue;
        const now = this.now();
        // القائمة الموقّعة وقت موثوق: إن لم تكن ساعة الجهاز متأخرة عنها نصحّح آخر وقت محفوظ
        const clockOk = now.getTime() >= new Date(feed.issuedAt).getTime() - DAY;
        this.write({ ...data, feed: text.trim(), lastOnline: now.toISOString(), ...(clockOk ? { lastSeen: now.toISOString() } : {}) });
        return true;
      } catch {
        // نجرب الرابط التالي
      }
    }
    return false;
  }
}
