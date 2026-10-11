import fs from 'node:fs';
import path from 'node:path';
import { buildPayload, issueLicense, signFeed, type FeedStatus, type LicenseFeed, type Plan, PLANS } from '../src/license/license';

// سجل العملاء والتراخيص — يبقى عندك فقط (مجلد keys/ مستثنى من git).

export interface Customer {
  id: string; // رقم الترخيص
  name: string;
  phone?: string;
  notes?: string;
  machineId: string;
  plan: Plan;
  devices: number;
  offlineDays: number;
  issuedAt: string;
  expiresAt: string | null;
  status: FeedStatus;
  message?: string;
  key: string;
  history: { at: string; action: string }[];
}

interface RegistryFile {
  customers: Customer[];
  lastPublished?: string;
}

const DAY = 86_400_000;

export class Registry {
  private data: RegistryFile;

  constructor(
    private readonly file: string,
    private readonly privateKey: string,
  ) {
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { customers: [] };
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  get customers(): Customer[] {
    return this.data.customers;
  }

  get lastPublished(): string | undefined {
    return this.data.lastPublished;
  }

  private find(id: string): Customer {
    const c = this.data.customers.find((x) => x.id === id);
    if (!c) throw new Error('العميل غير موجود');
    return c;
  }

  private sign(c: Customer): string {
    return issueLicense(
      {
        id: c.id,
        customer: c.name,
        machineId: c.machineId,
        plan: c.plan,
        devices: c.devices,
        offlineDays: c.offlineDays,
        issuedAt: new Date(),
        expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
      },
      this.privateKey,
    );
  }

  add(input: { name: string; phone?: string; notes?: string; machineId: string; plan: Plan; devices?: number; offlineDays?: number }): Customer {
    if (!input.name?.trim()) throw new Error('اسم العميل مطلوب');
    if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(input.machineId?.trim() ?? '')) throw new Error('بصمة الجهاز غير صحيحة (مثال: 1A2B-3C4D-5E6F-7A8B)');
    if (!(input.plan in PLANS)) throw new Error('نوع الاشتراك غير معروف');
    const payload = buildPayload({
      customer: input.name.trim(),
      machineId: input.machineId,
      plan: input.plan,
      devices: input.devices ?? 1,
      offlineDays: input.offlineDays ?? 7,
    });
    const c: Customer = {
      id: payload.id,
      name: payload.customer,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      machineId: payload.machineId,
      plan: payload.plan,
      devices: payload.devices,
      offlineDays: payload.offlineDays,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      status: 'active',
      key: '',
      history: [{ at: payload.issuedAt, action: `إصدار ${PLANS[payload.plan].nameAr}` }],
    };
    c.key = this.sign(c);
    this.data.customers.push(c);
    this.save();
    return c;
  }

  /** تمديد الاشتراك (يصل للعميل عبر القائمة، أو بمفتاح جديد إن لم يكن لديه إنترنت). */
  extend(id: string, plan: Plan): Customer {
    const c = this.find(id);
    const days = PLANS[plan].days;
    if (days === null) {
      c.expiresAt = null;
    } else {
      const from = Math.max(Date.now(), c.expiresAt ? new Date(c.expiresAt).getTime() : Date.now());
      c.expiresAt = new Date(from + days * DAY).toISOString();
    }
    c.plan = plan;
    c.status = 'active';
    delete c.message;
    c.key = this.sign(c);
    c.history.push({ at: new Date().toISOString(), action: `تمديد ${PLANS[plan].nameAr} حتى ${c.expiresAt?.slice(0, 10) ?? 'دائم'}` });
    this.save();
    return c;
  }

  setStatus(id: string, status: FeedStatus, message?: string): Customer {
    const c = this.find(id);
    c.status = status;
    if (message) c.message = message;
    else delete c.message;
    const names: Record<FeedStatus, string> = { active: 'تفعيل', suspended: 'إيقاف مؤقت', revoked: 'إلغاء نهائي' };
    c.history.push({ at: new Date().toISOString(), action: names[status] + (message ? `: ${message}` : '') });
    this.save();
    return c;
  }

  update(id: string, patch: { name?: string; phone?: string; notes?: string; devices?: number; offlineDays?: number; machineId?: string }): Customer {
    const c = this.find(id);
    if (patch.machineId && !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(patch.machineId.trim())) throw new Error('بصمة الجهاز غير صحيحة');
    Object.assign(c, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')));
    if (patch.machineId) c.machineId = patch.machineId.trim().toUpperCase();
    c.key = this.sign(c);
    c.history.push({ at: new Date().toISOString(), action: 'تعديل البيانات وإصدار مفتاح جديد' });
    this.save();
    return c;
  }

  /** يكتب قائمة الحالة الموقّعة لتُرفع على الإنترنت. */
  publish(outFile: string): { file: string; text: string } {
    const feed: LicenseFeed = {
      v: 1,
      issuedAt: new Date().toISOString(),
      entries: Object.fromEntries(
        this.data.customers.map((c) => [
          c.id,
          { status: c.status, expiresAt: c.expiresAt, devices: c.devices, ...(c.message ? { message: c.message } : {}) },
        ]),
      ),
    };
    const text = signFeed(feed, this.privateKey);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, text);
    this.data.lastPublished = feed.issuedAt;
    this.save();
    return { file: outFile, text };
  }
}
