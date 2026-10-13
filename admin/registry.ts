import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildPayload, compareVersions, issueLicense, signFeed, type FeedStatus, type LicenseFeed, type Plan, PLANS, type UpdateInfo } from '../src/license/license';

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
  /** الوكيل اللي باع الرخصة (إن وجد). */
  agentId?: string;
}

/** وكيل: بيشتري باقات رخص بسعر الوكلاء، وكل تفعيل أو تجديد لزبون بينخصم من رصيده. */
export interface Agent {
  id: string;
  name: string;
  phone?: string;
  city?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  packages: { at: string; count: number; price: number; note?: string }[];
  /** كل رخصة انصرفت من رصيده. */
  uses: { at: string; customerId: string; action: 'issue' | 'renew' }[];
}

/** الوكيل بيبيع اشتراك سنوي بس، والرخصة الوحدة بتشتغل على جهازين افتراضياً. */
export const AGENT_PLAN: Plan = 'annual';
export const AGENT_DEFAULT_DEVICES = 2;
export const PACKAGE_SIZE = 10;
export const PACKAGE_PRICE = 59.99;

export function agentBalance(a: Agent): { total: number; used: number; left: number } {
  const total = a.packages.reduce((s, p) => s + p.count, 0);
  const used = a.uses.length;
  return { total, used, left: total - used };
}

interface RegistryFile {
  customers: Customer[];
  agents?: Agent[];
  update?: UpdateInfo;
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

  get agents(): Agent[] {
    return (this.data.agents ??= []);
  }

  get appUpdate(): UpdateInfo | undefined {
    return this.data.update;
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

  add(input: { name: string; phone?: string; notes?: string; machineId: string; plan: Plan; devices?: number; offlineDays?: number; agentId?: string }): Customer {
    if (!input.name?.trim()) throw new Error('اسم العميل مطلوب');
    const agent = input.agentId ? this.agent(input.agentId) : null;
    if (agent) {
      if (!agent.active) throw new Error('هذا الوكيل موقوف');
      if (agentBalance(agent).left <= 0) throw new Error(`رصيد الوكيل ${agent.name} خلص. ضيفله باقة جديدة أولاً.`);
      input = { ...input, plan: AGENT_PLAN, devices: input.devices ?? AGENT_DEFAULT_DEVICES };
    }
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
      history: [{ at: payload.issuedAt, action: `إصدار ${PLANS[payload.plan].nameAr}` + (agent ? ` عن طريق الوكيل ${agent.name}` : '') }],
      ...(agent ? { agentId: agent.id } : {}),
    };
    if (this.data.customers.some((x) => x.machineId === c.machineId && x.status !== 'revoked')) {
      throw new Error('هالجهاز إله ترخيص من قبل. استعمل التمديد بدل إصدار ترخيص جديد.');
    }
    c.key = this.sign(c);
    this.data.customers.push(c);
    if (agent) agent.uses.push({ at: c.issuedAt, customerId: c.id, action: 'issue' });
    this.save();
    return c;
  }

  /** تمديد الاشتراك (يصل للعميل عبر القائمة، أو بمفتاح جديد إن لم يكن لديه إنترنت). */
  extend(id: string, plan: Plan): Customer {
    const c = this.find(id);
    const agent = c.agentId ? this.agents.find((a) => a.id === c.agentId) : undefined;
    if (agent) {
      // زبائن الوكلاء: تجديد سنوي بس، وبينخصم من رصيد الوكيل
      if (agentBalance(agent).left <= 0) throw new Error(`رصيد الوكيل ${agent.name} خلص. ضيفله باقة جديدة أولاً.`);
      plan = AGENT_PLAN;
    }
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
    if (agent) agent.uses.push({ at: new Date().toISOString(), customerId: c.id, action: 'renew' });
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

  // ───────────── الوكلاء ─────────────

  agent(id: string): Agent {
    const a = this.agents.find((x) => x.id === id);
    if (!a) throw new Error('الوكيل غير موجود');
    return a;
  }

  addAgent(input: { name: string; phone?: string; city?: string; notes?: string; packages?: number }): Agent {
    const name = input.name?.trim();
    if (!name) throw new Error('اسم الوكيل مطلوب');
    if (this.agents.some((a) => a.name === name)) throw new Error('في وكيل بنفس الاسم');
    const now = new Date().toISOString();
    const a: Agent = {
      id: randomUUID(),
      name,
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      ...(input.city?.trim() ? { city: input.city.trim() } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      active: true,
      createdAt: now,
      packages: [],
      uses: [],
    };
    for (let i = 0; i < (input.packages ?? 0); i++) a.packages.push({ at: now, count: PACKAGE_SIZE, price: PACKAGE_PRICE });
    this.agents.push(a);
    this.save();
    return a;
  }

  /** باقة رخص جديدة للوكيل (افتراضياً 10 رخص بـ 59.99$). */
  addPackage(id: string, input: { count?: number; price?: number; note?: string } = {}): Agent {
    const a = this.agent(id);
    const count = input.count ?? PACKAGE_SIZE;
    const price = input.price ?? PACKAGE_PRICE;
    if (!Number.isInteger(count) || count <= 0 || count > 10_000) throw new Error('عدد الرخص غير صحيح');
    if (!Number.isFinite(price) || price < 0) throw new Error('السعر غير صحيح');
    a.packages.push({ at: new Date().toISOString(), count, price, ...(input.note?.trim() ? { note: input.note.trim() } : {}) });
    this.save();
    return a;
  }

  updateAgent(id: string, patch: { name?: string; phone?: string; city?: string; notes?: string; active?: boolean }): Agent {
    const a = this.agent(id);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error('اسم الوكيل مطلوب');
      if (this.agents.some((x) => x !== a && x.name === name)) throw new Error('في وكيل بنفس الاسم');
      a.name = name;
    }
    for (const k of ['phone', 'city', 'notes'] as const) {
      const v = patch[k];
      if (v === undefined) continue;
      if (v.trim()) a[k] = v.trim();
      else delete a[k];
    }
    if (patch.active !== undefined) a.active = patch.active;
    this.save();
    return a;
  }

  // ───────────── التحديثات ─────────────

  /** إعلان نسخة جديدة (بيوصل لكل البرامج مع النشر الجاي). null بيلغي الإعلان. */
  setUpdate(input: { version: string; url: string; notes?: string[] | string; minVersion?: string } | null): UpdateInfo | undefined {
    if (!input) {
      delete this.data.update;
      this.save();
      return undefined;
    }
    const version = input.version?.trim();
    if (!/^\d+(\.\d+){1,3}$/.test(version ?? '')) throw new Error('رقم النسخة غير صحيح (مثال: 0.3.0)');
    const url = input.url?.trim();
    if (!/^https:\/\/\S+$/.test(url ?? '')) throw new Error('رابط التحميل لازم يبلش بـ https://');
    const minVersion = input.minVersion?.trim();
    if (minVersion) {
      if (!/^\d+(\.\d+){1,3}$/.test(minVersion)) throw new Error('الحد الأدنى للنسخة غير صحيح');
      if (compareVersions(minVersion, version!) > 0) throw new Error('الحد الأدنى لازم يكون أصغر من النسخة الجديدة أو مساويها');
    }
    const notes = (Array.isArray(input.notes) ? input.notes : String(input.notes ?? '').split('\n')).map((n) => n.trim()).filter(Boolean);
    this.data.update = { version: version!, url: url!, notes, date: new Date().toISOString(), ...(minVersion ? { minVersion } : {}) };
    this.save();
    return this.data.update;
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
      ...(this.data.update ? { update: this.data.update } : {}),
    };
    const text = signFeed(feed, this.privateKey);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, text);
    this.data.lastPublished = feed.issuedAt;
    this.save();
    return { file: outFile, text };
  }
}
