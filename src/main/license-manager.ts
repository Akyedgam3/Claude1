import fs from 'node:fs';
import path from 'node:path';
import { machineId, verifyLicense, PLANS, type LicensePayload } from '../license/license';
import { LICENSE_PUBLIC_KEY } from '../license/public-key';

const TRIAL_DAYS = 14;
const DAY = 86_400_000;

interface LicenseFile {
  key?: string;
  trialStart?: string;
  lastSeen?: string;
}

export interface LicenseStatus {
  machineId: string;
  mode: 'licensed' | 'trial' | 'expired';
  readOnly: boolean; // بعد انتهاء الاشتراك: قراءة وطباعة فقط
  planName?: string;
  customer?: string;
  daysLeft: number | null;
  message?: string;
}

/** يحفظ مفتاح الترخيص وتاريخ بداية التجربة في مجلد بيانات البرنامج على الجهاز. */
export class LicenseManager {
  private readonly file: string;
  readonly machineId = machineId();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'license.json');
  }

  private read(): LicenseFile {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  private write(data: LicenseFile): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }

  status(now = new Date()): LicenseStatus {
    const data = this.read();
    const lastSeen = data.lastSeen ? new Date(data.lastSeen) : undefined;
    const base = { machineId: this.machineId };

    if (data.key) {
      const check = verifyLicense(data.key, LICENSE_PUBLIC_KEY, { machineId: this.machineId, now, ...(lastSeen ? { lastSeen } : {}) });
      if (check.status === 'invalid') {
        return { ...base, mode: 'expired', readOnly: true, daysLeft: 0, message: check.reason };
      }
      const payload: LicensePayload = check.payload;
      this.touch(data, now);
      if (check.status === 'expired') {
        return {
          ...base,
          mode: 'expired',
          readOnly: true,
          daysLeft: 0,
          planName: PLANS[payload.plan].nameAr,
          customer: payload.customer,
          message: 'انتهى الاشتراك. البرنامج يعمل للقراءة والطباعة فقط حتى التجديد.',
        };
      }
      return { ...base, mode: 'licensed', readOnly: false, daysLeft: check.daysLeft, planName: PLANS[payload.plan].nameAr, customer: payload.customer };
    }

    if (!data.trialStart) {
      data.trialStart = now.toISOString();
      this.write(data);
    }
    if (lastSeen && now.getTime() < lastSeen.getTime() - DAY) {
      return { ...base, mode: 'expired', readOnly: true, daysLeft: 0, message: 'تاريخ الجهاز غير صحيح، يرجى ضبط الساعة' };
    }
    this.touch(data, now);
    const left = Math.ceil((new Date(data.trialStart).getTime() + TRIAL_DAYS * DAY - now.getTime()) / DAY);
    if (left <= 0) {
      return { ...base, mode: 'expired', readOnly: true, daysLeft: 0, message: 'انتهت الفترة التجريبية. أدخل مفتاح الترخيص للمتابعة.' };
    }
    return { ...base, mode: 'trial', readOnly: false, daysLeft: left, planName: `نسخة تجريبية (${TRIAL_DAYS} يوماً)` };
  }

  private touch(data: LicenseFile, now: Date): void {
    if (!data.lastSeen || new Date(data.lastSeen) < now) this.write({ ...data, lastSeen: now.toISOString() });
  }

  activate(key: string): LicenseStatus {
    const data = this.read();
    const check = verifyLicense(key, LICENSE_PUBLIC_KEY, { machineId: this.machineId });
    if (check.status === 'invalid') throw new Error(check.reason);
    if (check.status === 'expired') throw new Error('مفتاح الترخيص منتهي الصلاحية');
    this.write({ ...data, key: key.trim() });
    return this.status();
  }
}
