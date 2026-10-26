import { buildPayload, compareVersions, issueLicense, parseLicense, publicKeyFromPrivate, signFeed, type FeedStatus, type LicenseFeed, type Plan, PLANS, type UpdateInfo } from '../src/license/format';

// سجل العملاء والوكلاء والتراخيص: نفس المنطق للوحة الإدارة على الجهاز (registry.ts) وعلى النت (panel/).
// ما فيه node:fs ولا node:crypto حتى يشتغل بـ Cloudflare Workers كمان.

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
  /** خدمة الاتصال عن بعد (إضافية). */
  cloud?: boolean;
  /** رخصة «كمبيوتر + جوال»: إلها مفتاح جوال مجاني (سجل تاني فيه phoneOf). */
  mobile?: boolean;
  /** هالسجل هو مفتاح الجوال لزبون الكمبيوتر هاد (ما بينخصم من رصيد الوكيل). */
  phoneOf?: string;
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
  /** kind: نوع الرخص (القديمة بدونه = سنوي)، currency: عملة المبلغ (القديمة بدونها = دولار). */
  packages: { at: string; count: number; price: number; kind?: AgentKind; mobile?: boolean; currency?: 'SYP' | 'USD'; tier?: string; note?: string }[];
  /** كل رخصة انصرفت من رصيده. */
  uses: { at: string; customerId: string; action: 'issue' | 'renew'; kind?: AgentKind; mobile?: boolean }[];
}

/** الوكيل بيبيع سنوي (بيتجدد كل سنة من رصيده) أو دائم، والرخصة الوحدة بتشتغل على جهازين افتراضياً. */
export type AgentKind = 'annual' | 'lifetime';
export const AGENT_PLAN: Plan = 'annual';
export const AGENT_DEFAULT_DEVICES = 2;
export const PACKAGE_SIZE = 10;

/**
 * خطط الوكلاء بالليرة السورية الجديدة (نفس الجدول بصفحة الوكلاء بالموقع).
 * mobile = «كمبيوتر + جوال»: كل رخصة إلها مفتاحين، واحد للكمبيوتر وواحد لتطبيق الجوال.
 */
export const AGENT_TIERS: { id: string; name: string; kind: AgentKind; mobile: boolean; count: number; price: number }[] = [
  { id: 'a10', name: 'انطلاقة', kind: 'annual', mobile: false, count: 10, price: 12_250 },
  { id: 'a25', name: 'فضي', kind: 'annual', mobile: false, count: 25, price: 28_750 },
  { id: 'a50', name: 'ذهبي', kind: 'annual', mobile: false, count: 50, price: 53_500 },
  { id: 'a100', name: 'ماسي', kind: 'annual', mobile: false, count: 100, price: 98_000 },
  { id: 'a10m', name: 'انطلاقة', kind: 'annual', mobile: true, count: 10, price: 16_500 },
  { id: 'a25m', name: 'فضي', kind: 'annual', mobile: true, count: 25, price: 38_750 },
  { id: 'a50m', name: 'ذهبي', kind: 'annual', mobile: true, count: 50, price: 72_000 },
  { id: 'a100m', name: 'ماسي', kind: 'annual', mobile: true, count: 100, price: 132_000 },
  { id: 'l10', name: 'انطلاقة', kind: 'lifetime', mobile: false, count: 10, price: 15_800 },
  { id: 'l25', name: 'فضي', kind: 'lifetime', mobile: false, count: 25, price: 37_250 },
  { id: 'l50', name: 'ذهبي', kind: 'lifetime', mobile: false, count: 50, price: 69_500 },
  { id: 'l100', name: 'ماسي', kind: 'lifetime', mobile: false, count: 100, price: 128_000 },
  { id: 'l10m', name: 'انطلاقة', kind: 'lifetime', mobile: true, count: 10, price: 21_300 },
  { id: 'l25m', name: 'فضي', kind: 'lifetime', mobile: true, count: 25, price: 50_250 },
  { id: 'l50m', name: 'ذهبي', kind: 'lifetime', mobile: true, count: 50, price: 93_750 },
  { id: 'l100m', name: 'ماسي', kind: 'lifetime', mobile: true, count: 100, price: 172_500 },
];

type Balance = { total: number; used: number; left: number };
export type Bucket = 'annual' | 'lifetime' | 'annualMobile' | 'lifetimeMobile';
export const bucketOf = (kind: AgentKind, mobile?: boolean): Bucket => (mobile ? `${kind}Mobile` : kind) as Bucket;
export function agentBalance(a: Agent): Balance & Record<Bucket, Balance> {
  const of = (b: Bucket): Balance => {
    const total = a.packages.filter((p) => bucketOf(p.kind ?? 'annual', p.mobile) === b).reduce((s, p) => s + p.count, 0);
    const used = a.uses.filter((u) => bucketOf(u.kind ?? 'annual', u.mobile) === b).length;
    return { total, used, left: total - used };
  };
  const all = { annual: of('annual'), lifetime: of('lifetime'), annualMobile: of('annualMobile'), lifetimeMobile: of('lifetimeMobile') };
  const sum = (k: keyof Balance) => Object.values(all).reduce((s, x) => s + x[k], 0);
  return { total: sum('total'), used: sum('used'), left: sum('left'), ...all };
}
const BUCKET_NAME: Record<Bucket, string> = { annual: 'السنوي', lifetime: 'الدائم', annualMobile: 'السنوي مع الجوال', lifetimeMobile: 'الدائم مع الجوال' };

/** سجل النشاط: مين عمل شو (صاحب البرنامج بيشوف كل شي بيعملو الوكلاء). */
export interface LogEntry {
  at: string;
  by: string;
  action: string;
  customerId?: string;
  agentId?: string;
}

export interface RegistryFile {
  customers: Customer[];
  agents?: Agent[];
  update?: UpdateInfo;
  lastPublished?: string;
  log?: LogEntry[];
}

const LOG_MAX = 5000;

const DAY = 86_400_000;

export class RegistryCore {
  /** مين عم يعمل العمليات هلق (للسجل): «المدير» أو اسم الوكيل. */
  actor = 'المدير';

  constructor(
    protected data: RegistryFile,
    protected readonly privateKey: string,
    private readonly persist: (data: RegistryFile) => void = () => undefined,
  ) {}

  protected save(): void {
    this.persist(this.data);
  }

  /** بيسجّل العملية بسجل النشاط (آخر LOG_MAX عملية). */
  protected note(action: string, ids: { customerId?: string; agentId?: string } = {}): void {
    const log = (this.data.log ??= []);
    log.push({ at: new Date().toISOString(), by: this.actor, action, ...ids });
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  }

  /** عملية من برّا السجل (حسابات الدخول مثلاً) بتنسجل وبتنحفظ. */
  record(action: string, ids: { customerId?: string; agentId?: string } = {}): void {
    this.note(action, ids);
    this.save();
  }

  get log(): LogEntry[] {
    return this.data.log ?? [];
  }

  get raw(): RegistryFile {
    return this.data;
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

  find(id: string): Customer {
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

  add(input: { name: string; phone?: string; notes?: string; machineId: string; plan: Plan; devices?: number; offlineDays?: number; agentId?: string; force?: boolean; mobile?: boolean }): Customer {
    if (!input.name?.trim()) throw new Error('اسم العميل مطلوب');
    // نفس البصمة عند زبون تاني: غالباً ويندوز منسوخ من نفس الملف، أو نفس الزبون عم يتسجّل مرتين
    const same = this.data.customers.find((x) => x.machineId.toUpperCase() === input.machineId?.trim().toUpperCase() && x.status !== 'revoked');
    if (same && !input.force && !input.agentId) throw Object.assign(new Error(`هالبصمة مسجّلة أصلاً للزبون «${same.name}». إذا جهاز تاني فعلاً، خلّيه يحدّث وزن لآخر نسخة ويبعتلك البصمة الجديدة.`), { duplicate: same.name });
    const agent = input.agentId ? this.agent(input.agentId) : null;
    if (agent) {
      if (!agent.active) throw new Error('هذا الوكيل موقوف');
      // الوكيل بيفعّل سنوي أو دائم، كل واحد من رصيده
      const kind: AgentKind = input.plan === 'lifetime' ? 'lifetime' : 'annual';
      const bucket = bucketOf(kind, input.mobile);
      if (agentBalance(agent)[bucket].left <= 0) throw new Error(`رصيد الوكيل ${agent.name} ${BUCKET_NAME[bucket]} خلص. ضيفله باقة جديدة أولاً.`);
      input = { ...input, plan: kind, devices: input.devices ?? AGENT_DEFAULT_DEVICES };
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
      ...(input.mobile ? { mobile: true } : {}),
    };
    if (!input.force && this.data.customers.some((x) => x.machineId === c.machineId && x.status !== 'revoked')) {
      throw new Error('هالجهاز إله ترخيص من قبل. استعمل التمديد بدل إصدار ترخيص جديد.');
    }
    c.key = this.sign(c);
    this.data.customers.push(c);
    if (agent) agent.uses.push({ at: c.issuedAt, customerId: c.id, action: 'issue', kind: c.plan === 'lifetime' ? 'lifetime' : 'annual', ...(c.mobile ? { mobile: true } : {}) });
    this.note(`تفعيل ${c.name} (${PLANS[c.plan].nameAr}${c.mobile ? ' + جوال' : ''})`, { customerId: c.id, ...(agent ? { agentId: agent.id } : {}) });
    this.save();
    return c;
  }

  /** مفتاح تطبيق الجوال لزبون رخصته «كمبيوتر + جوال»: نفس الاشتراك والانتهاء، وما بينخصم شي من الرصيد. */
  addPhone(id: string, machineId: string): Customer {
    const pc = this.find(id);
    if (!pc.mobile) throw new Error('رخصة هالزبون للكمبيوتر بس، ما فيها جوال');
    if (this.data.customers.some((x) => x.phoneOf === pc.id && x.status !== 'revoked')) throw new Error('هالزبون إلو مفتاح جوال من قبل');
    if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(machineId?.trim() ?? '')) throw new Error('بصمة الجوال غير صحيحة (مثال: 1A2B-3C4D-5E6F-7A8B)');
    if (this.data.customers.some((x) => x.machineId.toUpperCase() === machineId.trim().toUpperCase() && x.status !== 'revoked')) throw new Error('هالجوال إلو ترخيص من قبل');
    const now = new Date().toISOString();
    const c: Customer = {
      id: crypto.randomUUID(),
      name: `${pc.name} — جوال`,
      ...(pc.phone ? { phone: pc.phone } : {}),
      machineId: machineId.trim().toUpperCase(),
      plan: pc.plan,
      devices: pc.devices,
      offlineDays: pc.offlineDays,
      issuedAt: now,
      expiresAt: pc.expiresAt,
      status: 'active',
      key: '',
      history: [{ at: now, action: `مفتاح الجوال لرخصة ${pc.name}` }],
      ...(pc.agentId ? { agentId: pc.agentId } : {}),
      phoneOf: pc.id,
    };
    c.key = this.sign(c);
    this.data.customers.push(c);
    this.note(`مفتاح جوال لـ ${pc.name}`, { customerId: c.id, ...(pc.agentId ? { agentId: pc.agentId } : {}) });
    this.save();
    return c;
  }

  /** تمديد الاشتراك (يصل للعميل عبر القائمة، أو بمفتاح جديد إن لم يكن لديه إنترنت). */
  extend(id: string, plan: Plan): Customer {
    const c = this.find(id);
    const agent = c.agentId ? this.agents.find((a) => a.id === c.agentId) : undefined;
    if (agent) {
      // زبائن الوكلاء: التجديد سنوي، وبينخصم من رصيد الوكيل السنوي (الدائم ما بيحتاج تجديد)
      if (c.phoneOf) throw new Error('مفتاح الجوال بيتجدد مع رخصة الكمبيوتر تبعه');
      if (c.plan === 'lifetime') throw new Error('هالزبون اشتراكه دائم، ما بيحتاج تجديد');
      const bucket = bucketOf('annual', c.mobile);
      if (agentBalance(agent)[bucket].left <= 0) throw new Error(`رصيد الوكيل ${agent.name} ${BUCKET_NAME[bucket]} خلص. ضيفله باقة جديدة أولاً.`);
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
    if (agent) agent.uses.push({ at: new Date().toISOString(), customerId: c.id, action: 'renew', kind: 'annual', ...(c.mobile ? { mobile: true } : {}) });
    // مفتاح الجوال بيمشي مع رخصة الكمبيوتر
    for (const ph of this.data.customers.filter((x) => x.phoneOf === c.id && x.status !== 'revoked')) {
      ph.plan = c.plan;
      ph.expiresAt = c.expiresAt;
      ph.status = 'active';
      delete ph.message;
      ph.key = this.sign(ph);
      ph.history.push({ at: new Date().toISOString(), action: `تمديد مع رخصة الكمبيوتر حتى ${c.expiresAt?.slice(0, 10) ?? 'دائم'}` });
    }
    this.note(`تمديد ${c.name} ${PLANS[plan].nameAr} حتى ${c.expiresAt?.slice(0, 10) ?? 'دائم'}`, { customerId: c.id, ...(agent ? { agentId: agent.id } : {}) });
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
    this.note(`${names[status]} ${c.name}${message ? `: ${message}` : ''}`, { customerId: c.id });
    this.save();
    return c;
  }

  /**
   * استيراد مفاتيح صادرة من مكان تاني (مثلاً Claude وانت مش عاللابتوب) حتى تنحفظ هون وتطلع بكل نشر.
   * النص: JSON ‏{ customers: [{ key, phone?, notes?, agent?, cloud? }] } أو مفاتيح، كل مفتاح بسطر.
   * المفتاح لازم يكون موقّع بمفتاحك. اللي موجود من قبل (نفس الرقم) بيتجاهل.
   */
  importKeys(text: string): { added: string[]; skipped: string[] } {
    const pub = publicKeyFromPrivate(this.privateKey);
    let items: { key: string; phone?: string; notes?: string; agent?: string; cloud?: boolean }[];
    try {
      const j = JSON.parse(text) as { customers?: typeof items } | typeof items;
      items = Array.isArray(j) ? j : (j.customers ?? []);
    } catch {
      items = text.split(/\s+/).filter((x) => x.startsWith('MZN')).map((key) => ({ key }));
    }
    if (!items.length) throw new Error('ما لقيت مفاتيح بالنص');
    const added: string[] = [], skipped: string[] = [];
    for (const it of items) {
      const p = parseLicense(String(it.key ?? '').trim(), pub);
      if (!p) throw new Error('مفتاح غير صالح أو مش موقّع بمفتاحك: ' + String(it.key ?? '').slice(0, 24) + '…');
      if (this.data.customers.some((c) => c.id === p.id)) {
        skipped.push(p.customer);
        continue;
      }
      const agent = it.agent ? this.agents.find((a) => a.name === it.agent) : undefined;
      if (it.agent && !agent) throw new Error(`الوكيل ${it.agent} مش موجود`);
      const c: Customer = {
        id: p.id,
        name: p.customer,
        ...(it.phone ? { phone: it.phone } : {}),
        ...(it.notes ? { notes: it.notes } : {}),
        machineId: p.machineId,
        plan: p.plan,
        devices: p.devices,
        offlineDays: p.offlineDays,
        issuedAt: p.issuedAt,
        expiresAt: p.expiresAt,
        status: 'active',
        key: String(it.key).trim(),
        history: [{ at: new Date().toISOString(), action: `استيراد ${PLANS[p.plan].nameAr}` + (agent ? ` عن طريق الوكيل ${agent.name}` : '') }],
        ...(agent ? { agentId: agent.id } : {}),
        ...(it.cloud ? { cloud: true } : {}),
      };
      this.data.customers.push(c);
      if (agent) agent.uses.push({ at: p.issuedAt, customerId: c.id, action: 'issue', kind: p.plan === 'lifetime' ? 'lifetime' : 'annual' });
      added.push(c.name);
    }
    if (added.length) this.note(`استيراد ${added.length} مفتاح`);
    this.save();
    return { added, skipped };
  }

  /** تشغيل/إيقاف خدمة الاتصال عن بعد لزبون (بتوصله مع القائمة الموقّعة الجاية). */
  setCloud(id: string, on: boolean): Customer {
    const c = this.find(id);
    if (on) c.cloud = true;
    else delete c.cloud;
    c.history.push({ at: new Date().toISOString(), action: on ? 'تفعيل الاتصال عن بعد' : 'إيقاف الاتصال عن بعد' });
    this.note(`${on ? 'تفعيل' : 'إيقاف'} الاتصال عن بعد لـ ${c.name}`, { customerId: c.id });
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
    this.note(`تعديل بيانات ${c.name}`, { customerId: c.id });
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
      id: crypto.randomUUID(),
      name,
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      ...(input.city?.trim() ? { city: input.city.trim() } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      active: true,
      createdAt: now,
      packages: [],
      uses: [],
    };
    const first = AGENT_TIERS[0]!;
    for (let i = 0; i < (input.packages ?? 0); i++) a.packages.push({ at: now, count: first.count, price: first.price, kind: first.kind, currency: 'SYP', tier: first.id });
    this.agents.push(a);
    this.note(`وكيل جديد: ${a.name}`, { agentId: a.id });
    this.save();
    return a;
  }

  /** باقة رخص جديدة للوكيل: خطة من AGENT_TIERS (افتراضياً «انطلاقة» السنوية)، أو عدد وسعر ونوع بإيدك. */
  addPackage(id: string, input: { tier?: string; count?: number; price?: number; kind?: AgentKind; mobile?: boolean; currency?: 'SYP' | 'USD'; note?: string } = {}): Agent {
    const a = this.agent(id);
    const custom = input.count !== undefined || input.price !== undefined;
    const tier = AGENT_TIERS.find((t) => t.id === (input.tier ?? (custom ? '' : AGENT_TIERS[0]!.id)));
    if (input.tier && !tier) throw new Error('خطة غير معروفة');
    const count = input.count ?? tier?.count ?? PACKAGE_SIZE;
    const price = input.price ?? tier?.price ?? 0;
    const kind: AgentKind = input.kind ?? tier?.kind ?? 'annual';
    const mobile = input.mobile ?? tier?.mobile ?? false;
    if (!Number.isInteger(count) || count <= 0 || count > 10_000) throw new Error('عدد الرخص غير صحيح');
    if (!Number.isFinite(price) || price < 0) throw new Error('السعر غير صحيح');
    if (kind !== 'annual' && kind !== 'lifetime') throw new Error('نوع الرخص غير معروف');
    a.packages.push({ at: new Date().toISOString(), count, price, kind, ...(mobile ? { mobile: true } : {}), currency: input.currency ?? 'SYP', ...(tier && !custom ? { tier: tier.id } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}) });
    this.note(`باقة لـ ${a.name}: ${count} رخصة ${kind === 'lifetime' ? 'دائمة' : 'سنوية'}${mobile ? ' + جوال' : ''}`, { agentId: a.id });
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
    this.note(patch.active === false ? `إيقاف الوكيل ${a.name}` : patch.active === true ? `تفعيل الوكيل ${a.name}` : `تعديل بيانات الوكيل ${a.name}`, { agentId: a.id });
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

  /** قائمة الحالة الموقّعة (بتنرفع على الإنترنت وبتقراها البرامج المنصّبة). */
  buildFeed(): { text: string; issuedAt: string } {
    const feed: LicenseFeed = {
      v: 1,
      issuedAt: new Date().toISOString(),
      entries: Object.fromEntries(
        this.data.customers.map((c) => [
          c.id,
          { status: c.status, expiresAt: c.expiresAt, devices: c.devices, ...(c.message ? { message: c.message } : {}), ...(c.cloud ? { cloud: true } : {}) },
        ]),
      ),
      ...(this.data.update ? { update: this.data.update } : {}),
    };
    const text = signFeed(feed, this.privateKey);
    this.data.lastPublished = feed.issuedAt;
    this.save();
    return { text, issuedAt: feed.issuedAt };
  }
}
