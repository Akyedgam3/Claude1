import { applyCommerceEvent, buildInvoice, repairToInvoiceLines, validateCommerceEvent, type InvoiceDraft, type InvoiceLineDraft } from './commerce';
import { SYSTEM_ACCOUNTS } from './chart-templates';
import { ALLOWED_CURRENCIES, convertMinor, type Currency } from './money';
import {
  buildAdjustment,
  buildCount,
  buildProduction,
  buildTransfer,
  type AdjustDraft,
  type CountDraft,
  type OpsContext,
  type ProductionDraft,
  type TransferDraft,
} from './operations';
import type {
  Account,
  Appointment,
  CompanyEvent,
  CompanyInfo,
  CompanyState,
  DiningTable,
  ExchangeRate,
  Invoice,
  Item,
  JournalEntry,
  JournalLine,
  Order,
  Party,
  Production,
  RateKind,
  RepairOrder,
  Role,
  StockAdjustment,
  StockTransfer,
  Tax,
  User,
  Vehicle,
  Warehouse,
} from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES: Role[] = ['owner', 'manager', 'accountant', 'cashier', 'storekeeper', 'technician', 'viewer'];

export function emptyState(): CompanyState {
  return {
    info: null,
    currencies: {},
    accounts: {},
    rates: [],
    taxes: {},
    entries: [],
    voided: {},
    users: {},
    parties: {},
    items: {},
    warehouses: {},
    stock: {},
    invoices: [],
    adjustments: [],
    transfers: [],
    productions: [],
    vehicles: {},
    repairs: {},
    tables: {},
    orders: {},
    appointments: {},
    counters: {},
  };
}

// ───────────── التحقق من صحة الأحداث قبل تسجيلها ─────────────

function fail(message: string): never {
  throw new Error(message);
}

function validateAccount(state: CompanyState, account: Account): void {
  if (!account.id.trim()) fail('رمز الحساب مطلوب');
  if (!account.name.trim()) fail('اسم الحساب مطلوب');
  if (account.parentId !== null) {
    const parent = state.accounts[account.parentId] ?? fail(`الحساب الأب غير موجود: ${account.parentId}`);
    if (!parent.isGroup) fail(`الحساب الأب ${parent.id} ليس حساباً تجميعياً`);
    if (parent.type !== account.type) fail('نوع الحساب يجب أن يطابق نوع الحساب الأب');
    for (let p: Account | undefined = parent; p; p = p.parentId ? state.accounts[p.parentId] : undefined) {
      if (p.id === account.id) fail('لا يمكن جعل الحساب أباً لنفسه');
    }
  }
  if (account.currency && !state.currencies[account.currency]) fail(`عملة غير معرّفة: ${account.currency}`);
  const existing = state.accounts[account.id];
  if (existing && !existing.isGroup && account.isGroup && hasMovements(state, account.id)) {
    fail('لا يمكن تحويل حساب عليه حركات إلى حساب تجميعي');
  }
  if (existing?.isGroup && !account.isGroup && Object.values(state.accounts).some((a) => a.parentId === account.id)) {
    fail('لا يمكن تحويل حساب تجميعي له حسابات فرعية إلى حساب عادي');
  }
  if (existing && existing.type !== account.type) fail('لا يمكن تغيير نوع الحساب');
  if (existing && existing.currency !== account.currency && hasMovements(state, account.id)) fail('لا يمكن تغيير عملة حساب عليه حركات');
}

function validateEntry(state: CompanyState, entry: JournalEntry): void {
  const base = state.info?.baseCurrency ?? fail('يجب إنشاء الشركة أولاً');
  if (!DATE_RE.test(entry.date)) fail(`تاريخ غير صالح: ${entry.date}`);
  const locked = state.info?.lockedUntil;
  if (locked && entry.date <= locked && entry.source?.type !== 'closing') {
    fail(`الفترة حتى ${locked} مقفلة، لا يمكن تسجيل حركات بتاريخ ${entry.date}`);
  }
  if (entry.lines.length < 2) fail('القيد يحتاج سطرين على الأقل');
  if (state.entries.some((e) => e.id === entry.id)) fail('القيد مسجّل مسبقاً');

  let debit = 0;
  let credit = 0;
  entry.lines.forEach((line, i) => {
    const n = i + 1;
    const account = state.accounts[line.accountId] ?? fail(`السطر ${n}: الحساب غير موجود (${line.accountId})`);
    if (account.isGroup) fail(`السطر ${n}: لا يمكن الترحيل على حساب تجميعي (${account.name})`);
    if (account.archived) fail(`السطر ${n}: الحساب مؤرشف (${account.name})`);
    if (!state.currencies[line.currency]) fail(`السطر ${n}: عملة غير معرّفة (${line.currency})`);
    if (account.currency && account.currency !== line.currency) {
      fail(`السطر ${n}: الحساب ${account.name} يقبل عملة ${account.currency} فقط`);
    }
    if (line.partyId && !state.parties[line.partyId]) fail(`السطر ${n}: الطرف غير موجود`);
    if (line.currency === base && line.rate !== 1) fail(`السطر ${n}: سعر صرف العملة الأساسية يجب أن يكون 1`);
    if (!(line.rate > 0) || !Number.isFinite(line.rate)) fail(`السطر ${n}: سعر صرف غير صالح`);
    for (const v of [line.debit, line.credit, line.baseDebit, line.baseCredit]) {
      if (!Number.isSafeInteger(v) || v < 0) fail(`السطر ${n}: مبلغ غير صالح`);
    }
    if ((line.debit > 0) === (line.credit > 0)) fail(`السطر ${n}: يجب إدخال مدين أو دائن (واحد فقط)`);
    debit += line.baseDebit;
    credit += line.baseCredit;
  });
  if (debit !== credit) fail(`القيد غير متوازن: المدين ${debit} ≠ الدائن ${credit}`);

  if (entry.voidOf) {
    const original = state.entries.find((e) => e.id === entry.voidOf) ?? fail('القيد المراد إلغاؤه غير موجود');
    if (original.voidOf) fail('لا يمكن إلغاء قيد عكسي');
    if (state.voided[original.id]) fail('القيد ملغى مسبقاً');
  }
}

function validateUser(state: CompanyState, user: User): void {
  if (!/^[\p{L}\p{N}._-]{2,32}$/u.test(user.username)) fail('اسم المستخدم من 2 إلى 32 حرفاً بدون مسافات');
  if (!user.displayName.trim()) fail('الاسم الظاهر مطلوب');
  if (!ROLES.includes(user.role)) fail('دور غير معروف');
  const others = Object.values(state.users).filter((u) => u.id !== user.id);
  if (others.some((u) => u.username.toLowerCase() === user.username.toLowerCase())) fail('اسم المستخدم مستخدم مسبقاً');
  const ownersLeft = others.filter((u) => u.role === 'owner' && u.active).length + (user.role === 'owner' && user.active ? 1 : 0);
  if (ownersLeft === 0) fail('يجب أن يبقى مالك واحد فعّال على الأقل');
}

export function validateEvent(state: CompanyState, event: CompanyEvent): void {
  if (event.type !== 'company.created' && !state.info) fail('يجب إنشاء الشركة أولاً');
  switch (event.type) {
    case 'company.created':
      if (state.info) fail('الشركة منشأة مسبقاً');
      if (!event.info.name.trim()) fail('اسم الشركة مطلوب');
      if (!event.currencies.some((c) => c.code === event.info.baseCurrency)) fail('العملة الأساسية غير موجودة');
      for (const c of event.currencies) if (!ALLOWED_CURRENCIES.has(c.code)) fail(`العملة ${c.code} غير مدعومة`);
      return;
    case 'company.updated':
      if (event.info.baseCurrency && event.info.baseCurrency !== state.info!.baseCurrency) {
        fail('لا يمكن تغيير العملة الأساسية بعد إنشاء الشركة');
      }
      if ('lockedUntil' in event.info) fail('استخدم إقفال الفترة لتغيير تاريخ الإقفال');
      if (event.info.print?.logo && event.info.print.logo.length > 400_000) fail('حجم الشعار كبير، اختر صورة أصغر من 300 كيلوبايت');
      return;
    case 'currency.saved':
      if (!ALLOWED_CURRENCIES.has(event.currency.code)) fail('العملات المدعومة: الليرة السورية الجديدة والدولار فقط');
      if (!Number.isInteger(event.currency.decimals) || event.currency.decimals < 0 || event.currency.decimals > 4) {
        fail('عدد المنازل العشرية بين 0 و 4');
      }
      {
        const existing = state.currencies[event.currency.code];
        if (existing && existing.decimals !== event.currency.decimals) fail('لا يمكن تغيير المنازل العشرية لعملة مستخدمة');
      }
      return;
    case 'account.saved':
      return validateAccount(state, event.account);
    case 'rate.set':
      if (!DATE_RE.test(event.rate.date)) fail('تاريخ غير صالح');
      if (!state.currencies[event.rate.currency]) fail('عملة غير معرّفة');
      if (event.rate.currency === state.info!.baseCurrency) fail('لا حاجة لسعر صرف للعملة الأساسية');
      if (!(event.rate.rate > 0) || !Number.isFinite(event.rate.rate)) fail('سعر الصرف يجب أن يكون أكبر من صفر');
      return;
    case 'tax.saved':
      if (!(event.tax.percent >= 0 && event.tax.percent <= 100)) fail('نسبة الضريبة بين 0 و 100');
      {
        const acc = state.accounts[event.tax.accountId] ?? fail('حساب الضريبة غير موجود');
        if (acc.isGroup) fail('حساب الضريبة يجب ألا يكون تجميعياً');
      }
      return;
    case 'entry.posted':
      return validateEntry(state, event.entry);
    case 'period.locked':
      if (!DATE_RE.test(event.until)) fail('تاريخ غير صالح');
      if (event.entry) {
        if (event.entry.source?.type !== 'closing') fail('قيد الإقفال غير صالح');
        validateEntry(state, event.entry);
      }
      return;
    case 'user.saved':
      return validateUser(state, event.user);
    case 'invoice.posted':
    case 'invoice.voided':
      validateCommerceEvent(state, event);
      return validateEntry(state, event.entry);
    case 'stock.adjusted':
      validateCommerceEvent(state, event);
      if (event.entry) validateEntry(state, event.entry);
      return;
    default:
      return validateCommerceEvent(state, event);
  }
}

// ───────────── تطبيق الأحداث على الحالة (يُستخدم أيضاً عند إعادة التحميل من الملف) ─────────────

export function applyEvent(state: CompanyState, event: CompanyEvent): CompanyState {
  switch (event.type) {
    case 'company.created':
      state.info = { ...event.info };
      for (const c of event.currencies) state.currencies[c.code] = { ...c };
      break;
    case 'company.updated':
      state.info = { ...state.info!, ...event.info };
      break;
    case 'currency.saved':
      state.currencies[event.currency.code] = { ...event.currency };
      break;
    case 'account.saved':
      state.accounts[event.account.id] = { ...event.account };
      break;
    case 'rate.set': {
      const r = event.rate;
      const i = state.rates.findIndex((x) => x.date === r.date && x.currency === r.currency && x.kind === r.kind);
      if (i >= 0) state.rates[i] = { ...r };
      else state.rates.push({ ...r });
      break;
    }
    case 'tax.saved':
      state.taxes[event.tax.id] = { ...event.tax };
      break;
    case 'entry.posted':
      state.entries.push(event.entry);
      if (event.entry.voidOf) state.voided[event.entry.voidOf] = event.entry.id;
      break;
    case 'period.locked':
      if (event.entry) state.entries.push(event.entry);
      state.info = { ...state.info!, lockedUntil: event.until };
      break;
    case 'user.saved':
      state.users[event.user.id] = { ...event.user };
      break;
    default:
      applyCommerceEvent(state, event);
  }
  return state;
}

function hasMovements(state: CompanyState, accountId: string): boolean {
  return state.entries.some((e) => e.lines.some((l) => l.accountId === accountId));
}

/** آخر سعر صرف مسجّل بالتاريخ المطلوب أو قبله (1 للعملة الأساسية). */
export function findRate(state: CompanyState, currency: string, date: string, kind: RateKind = 'market'): number | undefined {
  if (currency === state.info?.baseCurrency) return 1;
  let best: ExchangeRate | undefined;
  for (const r of state.rates) {
    if (r.currency === currency && r.kind === kind && r.date <= date && (!best || r.date > best.date)) best = r;
  }
  return best?.rate;
}

// ───────────── واجهة العمليات ─────────────

export interface LineDraft {
  accountId: string;
  debit?: number; // بأصغر وحدة من عملة السطر
  credit?: number;
  currency?: string; // الافتراضي: العملة الأساسية
  rate?: number; // الافتراضي: سعر الصرف المسجّل في تاريخ القيد
  memo?: string;
  costCenter?: string;
  partyId?: string;
}

export interface EntryDraft {
  date: string;
  memo: string;
  lines: LineDraft[];
  source?: { type: string; id: string };
  createdBy?: string;
}

export interface VoucherDraft {
  kind: 'receipt' | 'payment'; // سند قبض / سند دفع
  date: string;
  amount: number; // بأصغر وحدة من العملة
  currency?: string;
  rate?: number;
  partyId?: string; // إن وُجد يُرحَّل على حساب العملاء/الموردين
  accountId?: string; // الحساب المقابل (مصروف مثلاً) إن لم يكن طرفاً
  cashAccountId?: string;
  memo: string;
  createdBy?: string;
}

export interface OpeningDraft {
  date: string;
  warehouseId?: string;
  accounts?: { accountId: string; debit?: number; credit?: number; currency?: string; rate?: number }[];
  /** amount موجب = الطرف مدين لنا، سالب = نحن مدينون له. */
  parties?: { partyId: string; amount: number; currency?: string; rate?: number }[];
  stock?: AdjustDraft['lines'];
}

export interface CloseOrderOptions {
  date: string;
  paid?: number;
  cashAccountId?: string;
  discount?: number;
  taxIds?: string[];
  partyId?: string | null;
}

/** يستقبل الحدث ليحفظه (على الملف مثلاً) قبل اعتماده في الذاكرة. */
export type EventSink = (event: CompanyEvent) => void;

export class Ledger {
  /** اسم المستخدم الذي ينفّذ العمليات حالياً (يُسجَّل في كل مستند). */
  actor = 'system';

  constructor(
    private readonly sink: EventSink,
    public readonly state: CompanyState = emptyState(),
  ) {}

  /** يتحقق من الحدث، ثم يحفظه، ثم يطبّقه. إن فشل الحفظ تبقى الحالة كما هي. */
  emit(event: CompanyEvent): void {
    validateEvent(this.state, event);
    this.sink(event);
    applyEvent(this.state, event);
  }

  get base(): Currency {
    const code = this.state.info?.baseCurrency ?? fail('يجب إنشاء الشركة أولاً');
    return this.state.currencies[code]!;
  }

  private ops(): OpsContext {
    return { state: this.state, baseCode: this.base.code, actor: this.actor, buildEntry: (d) => this.buildEntry(d) };
  }

  createCompany(
    info: CompanyInfo,
    currencies: Currency[],
    accounts: Account[] = [],
    taxes: Tax[] = [],
    warehouses: Warehouse[] = [{ id: 'main', name: 'المستودع الرئيسي' }],
    owner?: User,
  ): void {
    this.emit({ type: 'company.created', info, currencies });
    // الآباء قبل الأبناء
    const sorted = [...accounts].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
    for (const account of sorted) this.saveAccount(account);
    for (const tax of taxes) this.saveTax(tax);
    for (const warehouse of warehouses) this.saveWarehouse(warehouse);
    if (owner) this.saveUser(owner);
  }

  updateCompany(info: Partial<CompanyInfo>): void {
    this.emit({ type: 'company.updated', info });
  }

  saveCurrency(currency: Currency): void {
    this.emit({ type: 'currency.saved', currency });
  }

  saveAccount(account: Account): void {
    this.emit({ type: 'account.saved', account });
  }

  saveTax(tax: Tax): void {
    this.emit({ type: 'tax.saved', tax });
  }

  setRate(rate: ExchangeRate): void {
    this.emit({ type: 'rate.set', rate });
  }

  saveUser(user: User): void {
    this.emit({ type: 'user.saved', user });
  }

  rateFor(currency: string, date: string, kind: RateKind = 'market'): number | undefined {
    return findRate(this.state, currency, date, kind);
  }

  postEntry(draft: EntryDraft): JournalEntry {
    const entry = this.buildEntry(draft);
    this.emit({ type: 'entry.posted', entry });
    return entry;
  }

  /** يبني القيد ويحسب المقابل بالعملة الأساسية دون حفظه. */
  buildEntry(draft: EntryDraft): JournalEntry {
    const base = this.base;
    const lines: JournalLine[] = draft.lines.map((d, i) => {
      const currency = this.state.currencies[d.currency ?? base.code] ?? fail(`السطر ${i + 1}: عملة غير معرّفة`);
      const rate =
        currency.code === base.code
          ? 1
          : (d.rate ?? this.rateFor(currency.code, draft.date) ?? fail(`لا يوجد سعر صرف لـ ${currency.nameAr} بتاريخ ${draft.date}`));
      const debit = d.debit ?? 0;
      const credit = d.credit ?? 0;
      return {
        accountId: d.accountId,
        currency: currency.code,
        rate,
        debit,
        credit,
        baseDebit: debit ? convertMinor(debit, currency, base, rate) : 0,
        baseCredit: credit ? convertMinor(credit, currency, base, rate) : 0,
        ...(d.memo ? { memo: d.memo } : {}),
        ...(d.costCenter ? { costCenter: d.costCenter } : {}),
        ...(d.partyId ? { partyId: d.partyId } : {}),
      };
    });
    absorbRounding(lines);

    return {
      id: crypto.randomUUID(),
      number: this.state.entries.length + 1,
      date: draft.date,
      memo: draft.memo,
      lines,
      ...(draft.source ? { source: draft.source } : {}),
      createdAt: new Date().toISOString(),
      createdBy: draft.createdBy ?? this.actor,
    };
  }

  /** لا يُحذف أي قيد؛ الإلغاء يكون بقيد عكسي يحفظ أثر العملية. */
  voidEntry(entryId: string, date: string): JournalEntry {
    const original = this.state.entries.find((e) => e.id === entryId) ?? fail('القيد غير موجود');
    if (original.source && !['receipt', 'payment', 'manual', 'opening'].includes(original.source.type)) {
      fail('هذا القيد تابع لمستند؛ ألغِ المستند نفسه');
    }
    const entry = this.reversal(original, date);
    this.emit({ type: 'entry.posted', entry });
    return entry;
  }

  private reversal(original: JournalEntry, date: string): JournalEntry {
    return {
      id: crypto.randomUUID(),
      number: this.state.entries.length + 1,
      date,
      memo: `إلغاء: ${original.memo}`,
      lines: original.lines.map((l) => ({
        ...l,
        debit: l.credit,
        credit: l.debit,
        baseDebit: l.baseCredit,
        baseCredit: l.baseDebit,
      })),
      voidOf: original.id,
      ...(original.source ? { source: original.source } : {}),
      createdAt: new Date().toISOString(),
      createdBy: this.actor,
    };
  }

  // ───────────── إقفال الفترات ─────────────

  /** يمنع أي تعديل على الحركات حتى التاريخ المحدد (بعد تدقيق الشهر مثلاً). */
  lockPeriod(until: string): void {
    this.emit({ type: 'period.locked', until });
  }

  /**
   * إقفال السنة المالية: تصفير حسابات الإيرادات والمصاريف في الأرباح المدوّرة،
   * ثم قفل الفترة حتى نهاية السنة.
   */
  closeYear(endDate: string): JournalEntry | undefined {
    if (!DATE_RE.test(endDate)) fail('تاريخ غير صالح');
    const from = this.state.info?.lockedUntil;
    const balances = new Map<string, number>();
    for (const e of this.state.entries) {
      if (e.date > endDate || (from && e.date <= from) || e.source?.type === 'closing') continue;
      for (const l of e.lines) {
        const type = this.state.accounts[l.accountId]?.type;
        if (type === 'revenue' || type === 'expense') balances.set(l.accountId, (balances.get(l.accountId) ?? 0) + l.baseDebit - l.baseCredit);
      }
    }
    const lines: LineDraft[] = [];
    let net = 0; // مدين - دائن للحسابات المقفلة
    for (const [accountId, b] of balances) {
      if (b === 0) continue;
      net += b;
      lines.push({ accountId, ...(b > 0 ? { credit: b } : { debit: -b }) });
    }
    let entry: JournalEntry | undefined;
    if (lines.length) {
      // net > 0 يعني خسارة (المصاريف أكبر) فتُحمَّل على الأرباح المدوّرة
      lines.push({ accountId: SYSTEM_ACCOUNTS.retainedEarnings, ...(net > 0 ? { debit: net } : { credit: -net }) });
      entry = this.buildEntry({ date: endDate, memo: `إقفال السنة المالية حتى ${endDate}`, lines, source: { type: 'closing', id: endDate } });
    }
    this.emit({ type: 'period.locked', until: endDate, ...(entry ? { entry } : {}) });
    return entry;
  }

  // ───────────── التجارة ─────────────

  saveParty(party: Party): void {
    this.emit({ type: 'party.saved', party });
  }

  saveItem(item: Item): void {
    this.emit({ type: 'item.saved', item });
  }

  /** حفظ مجموعة مواد دفعة واحدة (استيراد من Excel أو توليد مقاسات وألوان). */
  saveItems(items: Item[]): number {
    for (const item of items) this.saveItem(item);
    return items.length;
  }

  saveWarehouse(warehouse: Warehouse): void {
    this.emit({ type: 'warehouse.saved', warehouse });
  }

  private partyBaseBalance(partyId: string): number {
    let b = 0;
    for (const e of this.state.entries) for (const l of e.lines) if (l.partyId === partyId) b += l.baseDebit - l.baseCredit;
    return b;
  }

  postInvoice(draft: InvoiceDraft): Invoice {
    const { invoice, entry } = buildInvoice(
      {
        state: this.state,
        baseCode: this.base.code,
        resolveRate: (c, d) => this.rateFor(c, d),
        buildEntry: (d) => this.buildEntry(d),
        partyBalance: (id) => this.partyBaseBalance(id),
      },
      { ...draft, createdBy: draft.createdBy ?? this.actor },
    );
    this.emit({ type: 'invoice.posted', invoice, entry });
    return invoice;
  }

  /** إلغاء الفاتورة: قيد عكسي وإرجاع حركة المخزون كما كانت. */
  voidInvoice(invoiceId: string, date: string): void {
    const invoice = this.state.invoices.find((i) => i.id === invoiceId) ?? fail('الفاتورة غير موجودة');
    const original = this.state.entries.find((e) => e.id === invoice.entryId)!;
    this.emit({ type: 'invoice.voided', invoiceId, entry: this.reversal(original, date) });
    // إعادة فتح المستند المرتبط إن وُجد لتعديله وفوترته من جديد
    const src = invoice.source;
    if (src?.type === 'repair') {
      const r = this.state.repairs[src.id];
      if (r?.invoiceId === invoice.id) this.emit({ type: 'repair.saved', repair: { ...withoutInvoice(r), status: 'done' } });
    } else if (src?.type === 'appointment') {
      const a = this.state.appointments[src.id];
      if (a?.invoiceId === invoice.id) this.emit({ type: 'appointment.saved', appointment: { ...withoutInvoice(a), status: 'arrived' } });
    }
  }

  /** سند قبض (من زبون مثلاً) أو سند دفع (لمورد أو مصروف). */
  postVoucher(v: VoucherDraft): JournalEntry {
    if (!(v.amount > 0) || !Number.isSafeInteger(v.amount)) fail('المبلغ يجب أن يكون أكبر من صفر');
    const party = v.partyId ? (this.state.parties[v.partyId] ?? fail('الطرف غير موجود')) : null;
    const counter =
      v.accountId ??
      (party
        ? party.kind === 'supplier' || (party.kind === 'both' && v.kind === 'payment')
          ? SYSTEM_ACCOUNTS.suppliers
          : SYSTEM_ACCOUNTS.customers
        : fail('اختر الحساب المقابل أو العميل/المورد'));
    const currency = v.currency ?? this.base.code;
    const cash = v.cashAccountId ?? (currency === 'USD' && this.state.accounts[SYSTEM_ACCOUNTS.usdCash] ? SYSTEM_ACCOUNTS.usdCash : SYSTEM_ACCOUNTS.cash);
    const fx = { currency, ...(v.rate ? { rate: v.rate } : {}) };
    const inflow = v.kind === 'receipt';
    const number = this.state.entries.filter((e) => e.source?.type === v.kind && !e.voidOf).length + 1;
    return this.postEntry({
      date: v.date,
      memo: `${inflow ? 'سند قبض' : 'سند دفع'} رقم ${number}: ${v.memo}`,
      lines: [
        { accountId: cash, ...(inflow ? { debit: v.amount } : { credit: v.amount }), ...fx },
        {
          accountId: counter,
          ...(inflow ? { credit: v.amount } : { debit: v.amount }),
          ...fx,
          ...(party ? { partyId: party.id } : {}),
        },
      ],
      source: { type: v.kind, id: crypto.randomUUID() },
      ...(v.createdBy ? { createdBy: v.createdBy } : {}),
    });
  }

  // ───────────── المخزون ─────────────

  /** الأرصدة الافتتاحية: حسابات + ديون العملاء والموردين + بضاعة أول المدة. */
  postOpeningBalances(d: OpeningDraft): { entry?: JournalEntry; adjustment?: StockAdjustment } {
    const lines: LineDraft[] = [];
    for (const a of d.accounts ?? []) {
      if (a.accountId === SYSTEM_ACCOUNTS.openingBalances) continue;
      lines.push({
        accountId: a.accountId,
        ...(a.debit ? { debit: a.debit } : {}),
        ...(a.credit ? { credit: a.credit } : {}),
        ...(a.currency ? { currency: a.currency } : {}),
        ...(a.rate ? { rate: a.rate } : {}),
      });
    }
    for (const p of d.parties ?? []) {
      if (!p.amount) continue;
      const party = this.state.parties[p.partyId] ?? fail('الطرف غير موجود');
      const accountId = party.kind === 'supplier' ? SYSTEM_ACCOUNTS.suppliers : SYSTEM_ACCOUNTS.customers;
      lines.push({
        accountId,
        partyId: party.id,
        ...(p.amount > 0 ? { debit: p.amount } : { credit: -p.amount }),
        ...(p.currency ? { currency: p.currency } : {}),
        ...(p.rate ? { rate: p.rate } : {}),
      });
    }
    let entry: JournalEntry | undefined;
    if (lines.length) {
      // الطرف المقابل: حساب الأرصدة الافتتاحية بالعملة الأساسية بقيمة الفرق
      const draft = this.buildEntry({ date: d.date, memo: 'أرصدة افتتاحية', lines });
      const diff = draft.lines.reduce((s, l) => s + l.baseDebit - l.baseCredit, 0);
      if (diff !== 0) lines.push({ accountId: SYSTEM_ACCOUNTS.openingBalances, ...(diff > 0 ? { credit: diff } : { debit: -diff }) });
      entry = this.postEntry({ date: d.date, memo: 'أرصدة افتتاحية', lines, source: { type: 'opening', id: crypto.randomUUID() } });
    }
    let adjustment: StockAdjustment | undefined;
    if (d.stock?.length) {
      adjustment = this.adjustStock({
        kind: 'opening',
        date: d.date,
        lines: d.stock,
        memo: 'بضاعة أول المدة',
        ...(d.warehouseId ? { warehouseId: d.warehouseId } : {}),
      });
    }
    return { ...(entry ? { entry } : {}), ...(adjustment ? { adjustment } : {}) };
  }

  adjustStock(d: AdjustDraft): StockAdjustment {
    const { adjustment, entry } = buildAdjustment(this.ops(), d);
    this.emit({ type: 'stock.adjusted', adjustment, ...(entry ? { entry } : {}) });
    return adjustment;
  }

  countStock(d: CountDraft): StockAdjustment {
    const { adjustment, entry } = buildCount(this.ops(), d);
    this.emit({ type: 'stock.adjusted', adjustment, ...(entry ? { entry } : {}) });
    return adjustment;
  }

  transferStock(d: TransferDraft): StockTransfer {
    const transfer = buildTransfer(this.ops(), d);
    this.emit({ type: 'stock.transferred', transfer });
    return transfer;
  }

  postProduction(d: ProductionDraft): Production {
    const production = buildProduction(this.ops(), d);
    this.emit({ type: 'production.posted', production });
    return production;
  }

  // ───────────── الصيانة ─────────────

  saveVehicle(vehicle: Vehicle): void {
    this.emit({ type: 'vehicle.saved', vehicle });
  }

  /** حفظ أمر إصلاح جديد أو تعديله. الرقم يُعطى تلقائياً للأوامر الجديدة. */
  saveRepair(repair: Omit<RepairOrder, 'number'> & { number?: number }): RepairOrder {
    const existing = this.state.repairs[repair.id];
    if (existing?.status === 'invoiced') fail('أمر الإصلاح مفوتر؛ ألغِ الفاتورة أولاً لتعديله');
    if (repair.status === 'invoiced') fail('استخدم "تسليم وفوترة" لإصدار الفاتورة');
    const full: RepairOrder = { ...repair, number: existing?.number ?? (this.state.counters['repair'] ?? 0) + 1 };
    this.emit({ type: 'repair.saved', repair: full });
    return full;
  }

  /** يحوّل أمر الإصلاح إلى فاتورة مبيع (قطع + أجور يد) ويعلّمه كمفوتر. */
  invoiceRepair(
    repairId: string,
    opts: Pick<InvoiceDraft, 'date' | 'paid' | 'cashAccountId' | 'taxIds' | 'discount' | 'rate' | 'warehouseId'>,
  ): Invoice {
    const repair = this.state.repairs[repairId] ?? fail('أمر الإصلاح غير موجود');
    if (repair.status === 'invoiced') fail('أمر الإصلاح مفوتر مسبقاً');
    if (repair.status === 'cancelled') fail('أمر الإصلاح ملغى');
    if (repair.parts.length + repair.labor.length === 0) fail('أمر الإصلاح فارغ');
    const v = this.state.vehicles[repair.vehicleId]!;
    const invoice = this.postInvoice({
      ...opts,
      kind: 'sale',
      partyId: repair.partyId,
      currency: repair.currency,
      lines: repairToInvoiceLines(this.state, repair),
      notes: `أمر صيانة رقم ${repair.number} — ${v.make} ${v.model}${v.plate ? ` (${v.plate})` : ''}`,
      source: { type: 'repair', id: repair.id },
    });
    this.emit({ type: 'repair.saved', repair: { ...repair, status: 'invoiced', invoiceId: invoice.id } });
    return invoice;
  }

  // ───────────── المطعم ─────────────

  saveTable(table: DiningTable): void {
    this.emit({ type: 'table.saved', table });
  }

  saveOrder(order: Omit<Order, 'number' | 'openedAt'> & { number?: number; openedAt?: string }): Order {
    const existing = this.state.orders[order.id];
    if (order.status === 'closed') fail('استخدم إغلاق الطلب لإصدار الفاتورة');
    const full: Order = {
      ...order,
      number: existing?.number ?? (this.state.counters['order'] ?? 0) + 1,
      openedAt: existing?.openedAt ?? order.openedAt ?? new Date().toISOString(),
    };
    this.emit({ type: 'order.saved', order: full });
    return full;
  }

  /** يغلق الطلب بفاتورة مبيع (تُنقص مكوّنات الوجبات من المخزون). */
  closeOrder(orderId: string, opts: CloseOrderOptions): Invoice {
    const order = this.state.orders[orderId] ?? fail('الطلب غير موجود');
    if (order.status !== 'open') fail('الطلب مغلق مسبقاً');
    if (order.lines.length === 0) fail('الطلب فارغ');
    const table = order.tableId ? this.state.tables[order.tableId] : null;
    const partyId = opts.partyId ?? order.partyId ?? null;
    const invoice = this.postInvoice({
      kind: 'sale',
      date: opts.date,
      partyId,
      lines: order.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price, ...(l.note ? { note: l.note } : {}) })),
      ...(opts.discount ? { discount: opts.discount } : {}),
      ...(opts.taxIds ? { taxIds: opts.taxIds } : {}),
      ...(opts.paid !== undefined ? { paid: opts.paid } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      notes: `طلب رقم ${order.number}${table ? ` — ${table.name}` : ''}`,
      source: { type: 'order', id: order.id },
    });
    this.emit({ type: 'order.saved', order: { ...order, status: 'closed', closedAt: new Date().toISOString(), invoiceId: invoice.id } });
    return invoice;
  }

  // ───────────── المواعيد ─────────────

  saveAppointment(appointment: Appointment): void {
    if (appointment.invoiceId !== this.state.appointments[appointment.id]?.invoiceId) fail('لا يمكن تعديل فاتورة الموعد');
    this.emit({ type: 'appointment.saved', appointment });
  }

  invoiceAppointment(id: string, opts: { date: string; paid?: number; cashAccountId?: string; lines?: InvoiceLineDraft[] }): Invoice {
    const a = this.state.appointments[id] ?? fail('الموعد غير موجود');
    if (a.invoiceId) fail('الموعد مفوتر مسبقاً');
    const service = a.itemId ? this.state.items[a.itemId] : undefined;
    const lines = opts.lines ?? (service ? [{ itemId: service.id, qty: 1, price: service.price }] : fail('حدد الخدمة'));
    const invoice = this.postInvoice({
      kind: 'sale',
      date: opts.date,
      partyId: a.partyId,
      lines,
      ...(opts.paid !== undefined ? { paid: opts.paid } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      notes: `موعد ${a.date} ${a.time}${a.staff ? ` — ${a.staff}` : ''}`,
      source: { type: 'appointment', id: a.id },
    });
    this.emit({ type: 'appointment.saved', appointment: { ...a, status: 'done', invoiceId: invoice.id } });
    return invoice;
  }
}

function withoutInvoice<T extends { invoiceId?: string }>(doc: T): Omit<T, 'invoiceId'> {
  const copy = { ...doc };
  delete copy.invoiceId;
  return copy;
}

/**
 * التحويل بين العملات قد يترك فرق تقريب بسيط (وحدة صغرى أو اثنتين) في القيود متعددة العملات.
 * نضيف الفرق إلى أكبر سطر في الجهة الأصغر بشرط ألا يتجاوز عدد الأسطر.
 */
function absorbRounding(lines: JournalLine[]): void {
  const diff = lines.reduce((s, l) => s + l.baseDebit - l.baseCredit, 0);
  if (diff === 0 || Math.abs(diff) > lines.length) return;
  if (lines.every((l) => l.rate === 1)) return; // لا تقريب في قيود العملة الأساسية
  const side = diff > 0 ? 'baseCredit' : 'baseDebit';
  const target = lines.filter((l) => l[side] > 0).sort((a, b) => b[side] - a[side])[0];
  if (target) target[side] += Math.abs(diff);
}
