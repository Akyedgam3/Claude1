import { applyCommerceEvent, buildInvoice, convertOrder, orderTotals, piecesTotal, repairToInvoiceLines, rollRemaining, siteJobDeposits, siteJobToInvoiceLines, siteJobTotals, stoneBlockUsage, shipmentSummary, UNIT_NAMES, tailorDeposits, tailorToInvoiceLines, validateCommerceEvent, workOrderProgress, type InvoiceDraft, type InvoiceLineDraft } from './commerce';
import { ACTIVITIES } from './activities';
import { PARTNER_MOVE_NAMES, partnerSourceId, type PartnerMoveKind } from './partners';
import { loadDemo } from './demo';
import { buildSchedule, installmentState } from './electronics';
import { cashAccountFor, SYSTEM_ACCOUNTS } from './chart-templates';
import { convertMinor, currencyProblem, type Currency } from './money';
import { invoiceMoves } from './stock';
import { POULTRY_CUTS } from './poultry';
import { dealerStock, dealerUnitCost } from './dealers';
import { printJobDeposits, printJobToInvoiceLines, printJobTotals } from './printshop';
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
  Partner,
  PriceBoard,
  Dealer,
  DealerMove,
  DealerMoveKind,
  DealerSale,
  DealerSaleLine,
  PrintJob,
  Account,
  Appointment,
  CompanyEvent,
  CompanyInfo,
  CompanyState,
  DiningTable,
  ExchangeRate,
  FabricRoll,
  InstallmentPlan,
  LengthUnit,
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
  Quote,
  SiteJob,
  Shipment,
  StoneBlock,
  TailorOrder,
  Tax,
  User,
  Vehicle,
  Warehouse,
  WorkCut,
  WorkOrder,
  WorkStage,
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
    tailorOrders: {},
    siteJobs: {},
    partners: {},
    quotes: {},
    rolls: {},
    workOrders: {},
    installments: {},
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
      for (const c of event.currencies) {
        const problem = currencyProblem(c);
        if (problem) fail(problem);
      }
      return;
    case 'company.updated':
      if (event.info.baseCurrency && event.info.baseCurrency !== state.info!.baseCurrency) {
        fail('لا يمكن تغيير العملة الأساسية بعد إنشاء الشركة');
      }
      if ('lockedUntil' in event.info) fail('استخدم إقفال الفترة لتغيير تاريخ الإقفال');
      if (event.info.print?.logo && event.info.print.logo.length > 400_000) fail('حجم الشعار كبير، اختر صورة أصغر من 300 كيلوبايت');
      if (event.info.print?.color && !/^#[0-9a-fA-F]{6}$/.test(event.info.print.color)) fail('لون غير صالح');
      if (event.info.print?.terms && event.info.print.terms.length > 2000) fail('نص الشروط طويل جداً');
      if (event.info.activity !== undefined && !(event.info.activity in ACTIVITIES)) fail('نوع نشاط غير معروف');
      if (event.info.customize) {
        const c = event.info.customize;
        for (const list of [c.featuresOn, c.featuresOff, c.categories, c.units, c.attributes]) {
          if (list !== undefined && (!Array.isArray(list) || list.length > 500 || list.some((x) => typeof x !== 'string' || x.length > 80))) fail('قائمة تخصيص غير صالحة');
        }
      }
      return;
    case 'currency.saved':
      {
        const problem = currencyProblem(event.currency);
        if (problem) fail(problem);
        const existing = state.currencies[event.currency.code];
        if (existing && existing.decimals !== event.currency.decimals) fail('لا يمكن تغيير المنازل العشرية لعملة مستخدمة');
        if (event.currency.code === state.info!.baseCurrency && event.currency.hidden) fail('لا يمكن إخفاء العملة الأساسية');
        if (!existing && Object.keys(state.currencies).length >= 20) fail('الحد الأقصى 20 عملة');
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
    case 'invoice.repriced':
      validateCommerceEvent(state, event);
      validateEntry(state, event.voidEntry);
      validateEntry(state, event.entry);
      if (event.cogsEntry) validateEntry(state, event.cogsEntry);
      return;
    case 'stock.adjusted':
      validateCommerceEvent(state, event);
      if (event.entry) validateEntry(state, event.entry);
      return;
    default:
      return validateCommerceEvent(state, event);
  }
}

// ───────────── تصفير الشركة ─────────────

export type ResetMode = 'transactions' | 'all';

/**
 * أحداث شركة جديدة مبنية من الحالة الحالية: نفس الإعدادات والحسابات والمستخدمين، بدون أي حركة.
 * 'transactions' بيخلّي المواد والزباين والموردين والطاولات وسجل الأجهزة/السيارات وأسعار الصرف (أرصدتهم بترجع صفر).
 * 'all' بيرجّع الشركة متل أول يوم (الإعدادات والمستخدمين بس).
 */
export function resetEvents(state: CompanyState, mode: ResetMode): CompanyEvent[] {
  const info = state.info ?? fail('يجب إنشاء الشركة أولاً');
  const { lockedUntil: _locked, ...rest } = info;
  const events: CompanyEvent[] = [{ type: 'company.created', info: rest, currencies: Object.values(state.currencies) }];
  const accounts = Object.values(state.accounts).sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
  for (const account of accounts) events.push({ type: 'account.saved', account });
  for (const tax of Object.values(state.taxes)) events.push({ type: 'tax.saved', tax });
  for (const warehouse of Object.values(state.warehouses)) events.push({ type: 'warehouse.saved', warehouse });
  // المالك أولاً: لازم يضل مالك فعّال بكل لحظة
  const users = Object.values(state.users).sort((a, b) => Number(b.role === 'owner' && b.active) - Number(a.role === 'owner' && a.active));
  for (const user of users) events.push({ type: 'user.saved', user });
  if (mode === 'all') return events;
  for (const rate of state.rates) events.push({ type: 'rate.set', rate });
  for (const party of Object.values(state.parties)) events.push({ type: 'party.saved', party });
  for (const dealer of Object.values(state.dealers ?? {})) events.push({ type: 'dealer.saved', dealer });
  // المكوّنات قبل الأصناف اللي بتستعملها
  const pending = Object.values(state.items);
  const done = new Set<string>();
  while (pending.length) {
    const ready = pending.filter((i) => (i.recipe ?? []).every((r) => done.has(r.itemId) || !state.items[r.itemId]));
    const batch = ready.length ? ready : pending.slice();
    for (const item of batch) {
      const recipe = item.recipe?.filter((r) => state.items[r.itemId]);
      events.push({ type: 'item.saved', item: recipe ? { ...item, recipe } : item });
      done.add(item.id);
      pending.splice(pending.indexOf(item), 1);
    }
  }
  for (const table of Object.values(state.tables)) events.push({ type: 'table.saved', table });
  for (const vehicle of Object.values(state.vehicles)) if (state.parties[vehicle.partyId]) events.push({ type: 'vehicle.saved', vehicle });
  return events;
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

/** دين بدون فاتورة: إلي على حدا (owed) أو علي لحدا (owe). */
export interface DebtDraft {
  direction: 'owed' | 'owe';
  partyId: string;
  date: string;
  amount: number; // بأصغر وحدة من العملة
  currency?: string;
  rate?: number;
  /** old: دين قديم من قبل البرنامج. cash: مصاري (سلفة/قرض) طلعت أو فاتت عالصندوق. goods: بضاعة أو خدمة بدون فاتورة. */
  reason: 'old' | 'cash' | 'goods';
  cashAccountId?: string;
  memo?: string;
  createdBy?: string;
}

/** تسديد دين: قبضت من حدا أو دفعت لحدا. */
export interface DebtPaymentDraft {
  direction: 'in' | 'out';
  partyId: string;
  date: string;
  amount: number;
  currency?: string;
  rate?: number;
  cashAccountId?: string;
  memo?: string;
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
  /** عملة الحساب (الطلب مسعّر بعملة الشركة، فبنحوّله بسعر الصرف). */
  currency?: string;
  rate?: number;
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

  /** عملة جديدة أو تعديل اسمها ورمزها. العملة الجديدة بيتعمللها صندوق خاص فيها. */
  saveCurrency(currency: Currency): Currency {
    const c: Currency = {
      code: String(currency?.code ?? '').trim().toUpperCase(),
      nameAr: String(currency?.nameAr ?? '').trim(),
      symbol: String(currency?.symbol ?? '').trim(),
      decimals: Number(currency?.decimals ?? 2),
      ...(currency?.rateInverted ? { rateInverted: true } : {}),
      ...(currency?.hidden ? { hidden: true } : {}),
    };
    const isNew = !this.state.currencies[c.code];
    this.emit({ type: 'currency.saved', currency: c });
    if (isNew && c.code !== this.base.code && !Object.values(this.state.accounts).some((a) => a.currency === c.code && !a.isGroup)) {
      const parent = this.state.accounts['11']?.isGroup ? '11' : null;
      let id = '';
      for (let n = 9; n < 100 && !id; n++) if (!this.state.accounts[`11${String(n).padStart(2, '0')}`]) id = `11${String(n).padStart(2, '0')}`;
      if (parent && id) this.emit({ type: 'account.saved', account: { id, name: `صندوق ${c.nameAr}`, type: 'asset', parentId: parent, isGroup: false, currency: c.code } });
    }
    return c;
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
    let inexact = false; // هل نتج عن التحويل كسور قُرّبت؟
    const lines: JournalLine[] = draft.lines.map((d, i) => {
      const currency = this.state.currencies[d.currency ?? base.code] ?? fail(`السطر ${i + 1}: عملة غير معرّفة`);
      const rate =
        currency.code === base.code
          ? 1
          : (d.rate ?? this.rateFor(currency.code, draft.date) ?? fail(`لا يوجد سعر صرف لـ ${currency.nameAr} بتاريخ ${draft.date}`));
      const debit = d.debit ?? 0;
      const credit = d.credit ?? 0;
      const scale = 10 ** (base.decimals - currency.decimals);
      if (rate !== 1 && [debit, credit].some((v) => v && !Number.isInteger(v * rate * scale))) inexact = true;
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
    if (inexact) absorbRounding(lines);

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
    if (original.source && !['receipt', 'payment', 'manual', 'opening', 'work-adjust', 'debt'].includes(original.source.type)) {
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
    // نجمع كل الحركات حتى تاريخ الإقفال بما فيها قيود الإقفال السابقة، فيبقى فقط ما لم يُقفل بعد
    // (حتى لو أُقفلت أشهر من السنة سابقاً، أو أُعيد إقفال سنة مقفلة)
    const balances = new Map<string, number>();
    for (const e of this.state.entries) {
      if (e.date > endDate) continue;
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

  /**
   * حذف مادة: بتختفي من المواد والبيع، وفواتيرها القديمة بتضل متل ما هي.
   * لازم رصيدها يكون صفر، وما تكون داخلة بوصفة مادة تانية.
   */
  deleteItem(itemId: string): void {
    const item = this.state.items[itemId] ?? fail('المادة غير موجودة');
    if (item.archived) fail('المادة محذوفة مسبقاً');
    const qty = this.state.stock[itemId]?.totalQty ?? 0;
    if (item.kind === 'stock' && Math.abs(qty) > 1e-9) fail(`ما فيك تحذف «${item.name}» وإلها رصيد (${+qty.toFixed(3)} ${item.unit}). صفّر رصيدها من الجرد أو بيعها أول`);
    const inRecipe = Object.values(this.state.items).find((i) => !i.archived && i.recipe?.some((r) => r.itemId === itemId));
    if (inRecipe) fail(`«${item.name}» داخلة بوصفة «${inRecipe.name}»؛ شيلها من الوصفة أول`);
    this.saveItem({ ...item, archived: true });
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

  postInvoice(draft: InvoiceDraft, opts: { number?: number; replaces?: string } = {}): Invoice {
    const { invoice, entry } = buildInvoice(
      {
        state: this.state,
        baseCode: this.base.code,
        resolveRate: (c, d) => this.rateFor(c, d),
        buildEntry: (d) => this.buildEntry(d),
        partyBalance: (id) => this.partyBaseBalance(id),
      },
      { ...draft, createdBy: draft.createdBy ?? this.actor },
      opts,
    );
    this.emit({ type: 'invoice.posted', invoice, entry });
    return invoice;
  }

  /**
   * تعديل فاتورة: بتنلغى القديمة (بتاريخها) وبتنسجّل الجديدة بنفس الرقم. السجل بيضل محفوظ (القديمة ملغاة ومربوطة بالجديدة).
   * منجرّب العملية كاملة على نسخة أول، فإذا في شي غلط ما بيتغيّر شي.
   */
  replaceInvoice(invoiceId: string, draft: InvoiceDraft): Invoice {
    const old = this.state.invoices.find((i) => i.id === invoiceId) ?? fail('الفاتورة غير موجودة');
    if (old.voidEntryId) fail('الفاتورة ملغاة؛ ما بتتعدّل');
    if (old.source) fail('هالفاتورة طالعة من طلب أو مشروع أو أمر صيانة؛ عدّلها من هناك (ألغِ الفاتورة وعدّل المستند)');
    if (draft.kind !== old.kind) fail('ما بيصير تغيّر نوع الفاتورة');
    if (this.state.invoices.some((i) => i.replaces === old.id)) fail('هالفاتورة معدّلة من قبل');
    const next: InvoiceDraft = { ...draft };
    delete next.source;
    // فاتورة شراء نفس البضاعة والكميات (تعديل سعر أو مورد أو ملاحظات): ما منحرّك المخزون، لأنو ممكن انباع منها أو انتقلت لمستودع تاني
    if (old.kind === 'purchase' && this.sameStock(old, next)) return this.repriceInvoice(old, next);
    const trial = new Ledger(() => {}, structuredClone(this.state));
    trial.actor = this.actor;
    try {
      trial.voidInvoice(old.id, old.date);
    } catch (e) {
      if (old.kind !== 'purchase') throw e;
      fail(`${(e as Error).message}. لتعدّل السعر بس خلّي المواد والكميات متل ما هي. ولتغيّر الكمية: رجّع البضاعة للمستودع الأصلي (إلغاء التحويل)، أو اعمل مرتجع شراء بالفرق.`);
    }
    trial.postInvoice(next, { number: old.number, replaces: old.id });
    this.voidInvoice(old.id, old.date);
    return this.postInvoice(next, { number: old.number, replaces: old.id });
  }

  /**
   * حذف فاتورة انعملت بالغلط: بتنلغى بتاريخها نفسه (فأرباح وصندوق هداك اليوم بيرجعوا متل ما كانوا)
   * وبتختفي من سجل الفواتير. إذا فترتها مقفلة بتنلغى بتاريخ اليوم. القيود بتضل محفوظة للمراجعة.
   */
  deleteInvoice(invoiceId: string, today: string): void {
    const invoice = this.state.invoices.find((i) => i.id === invoiceId) ?? fail('الفاتورة غير موجودة');
    if (invoice.voidEntryId) fail('الفاتورة ملغاة مسبقاً');
    const locked = this.state.info?.lockedUntil;
    this.voidInvoice(invoiceId, locked && invoice.date <= locked ? today : invoice.date, { deleted: true });
  }

  /** نفس المواد والكميات والوحدات والأرقام التسلسلية والدفعات والمستودع؟ */
  private sameStock(old: Invoice, d: InvoiceDraft): boolean {
    const wh = d.warehouseId ?? Object.keys(this.state.warehouses)[0];
    if (wh !== old.warehouseId) return false;
    const a = old.lines.filter((l) => l.itemId);
    const b = d.lines.filter((l) => l.itemId);
    if (a.length !== b.length) return false;
    const ser = (s?: string[]) => [...(s ?? [])].map((x) => x.trim()).filter(Boolean).sort().join('|');
    return a.every((x, i) => {
      const y = b[i]!;
      const batch = x.batches?.[0];
      return (
        x.itemId === y.itemId &&
        Math.abs(x.qty - y.qty) < 1e-9 &&
        (x.unit ?? '') === (y.unit ?? '') &&
        ser(x.serials) === ser(y.serials) &&
        (batch?.batch ?? '') === (y.batch?.trim() || (batch ? y.expiry ?? '' : '')) &&
        (batch?.expiry ?? '') === (batch ? y.expiry ?? '' : '')
      );
    });
  }

  /**
   * تعديل فاتورة شراء بدون تحريك البضاعة: منحسب الفاتورة الجديدة كأنو القديمة ما كانت، ومنعكس قيدها.
   * فرق تكلفة كل مادة بيروح على قيمة المخزون للكمية اللي لسا موجودة، والباقي (المنباع) على تكلفة المبيعات.
   */
  private repriceInvoice(old: Invoice, d: InvoiceDraft): Invoice {
    const clone = structuredClone(this.state);
    for (const m of invoiceMoves(clone, old)) {
      const lvl = clone.stock[m.itemId];
      if (!lvl) continue;
      lvl.qty[m.warehouseId] = (lvl.qty[m.warehouseId] ?? 0) - m.qty;
      lvl.totalQty -= m.qty;
      lvl.value -= m.value;
      for (const s of m.serials ?? []) delete lvl.serials?.[s];
      for (const b of m.batches ?? []) {
        const k = `${m.warehouseId}|${b.batch}`;
        if (lvl.batches?.[k]) lvl.batches[k]!.qty -= b.qty;
      }
    }
    const { invoice, entry } = buildInvoice(
      { state: clone, baseCode: this.base.code, resolveRate: (c, dt) => this.rateFor(c, dt), buildEntry: (e) => this.buildEntry(e), partyBalance: (id) => this.partyBaseBalance(id) },
      { ...d, createdBy: d.createdBy ?? this.actor },
      { number: old.number, replaces: old.id },
    );
    const voidEntry = this.reversal(this.state.entries.find((e) => e.id === old.entryId)!, old.date);
    const costs = new Map<string, { old: number; next: number; qty: number }>();
    for (const l of old.lines) if (l.itemId) { const c = costs.get(l.itemId) ?? { old: 0, next: 0, qty: 0 }; c.old += l.cost ?? 0; c.qty += l.qty * (l.factor ?? 1); costs.set(l.itemId, c); }
    for (const l of invoice.lines) if (l.itemId) { const c = costs.get(l.itemId) ?? { old: 0, next: 0, qty: 0 }; c.next += l.cost ?? 0; costs.set(l.itemId, c); }
    const adjust: { itemId: string; warehouseId: string; value: number }[] = [];
    let sold = 0;
    for (const [itemId, c] of costs) {
      const delta = c.next - c.old;
      if (!delta) continue;
      const now = Math.max(0, this.state.stock[itemId]?.totalQty ?? 0);
      const inStock = c.qty > 0 && now < c.qty ? Math.round((delta * now) / c.qty) : delta;
      if (inStock) adjust.push({ itemId, warehouseId: old.warehouseId, value: inStock });
      sold += delta - inStock;
    }
    const n = this.state.entries.length;
    voidEntry.number = n + 1;
    entry.number = n + 2;
    const cogsEntry = sold
      ? {
          ...this.buildEntry({
            date: invoice.date,
            memo: `فرق سعر الشراء على البضاعة المباعة — فاتورة شراء رقم ${old.number}`,
            lines: [
              { accountId: SYSTEM_ACCOUNTS.cogs, ...(sold > 0 ? { debit: sold } : { credit: -sold }) },
              { accountId: SYSTEM_ACCOUNTS.inventory, ...(sold > 0 ? { credit: sold } : { debit: -sold }) },
            ],
            source: { type: 'reprice', id: invoice.id },
          }),
          number: n + 3,
        }
      : undefined;
    this.emit({ type: 'invoice.repriced', invoiceId: old.id, voidEntry, invoice, entry, adjust, ...(cogsEntry ? { cogsEntry } : {}) });
    return invoice;
  }

  /** إلغاء الفاتورة: قيد عكسي وإرجاع حركة المخزون كما كانت. */
  voidInvoice(invoiceId: string, date: string, opts: { deleted?: boolean } = {}): void {
    const invoice = this.state.invoices.find((i) => i.id === invoiceId) ?? fail('الفاتورة غير موجودة');
    const original = this.state.entries.find((e) => e.id === invoice.entryId)!;
    this.emit({ type: 'invoice.voided', invoiceId, entry: this.reversal(original, date), ...(opts.deleted ? { deleted: true } : {}) });
    // إعادة فتح المستند المرتبط إن وُجد لتعديله وفوترته من جديد
    const src = invoice.source;
    if (src?.type === 'repair') {
      const r = this.state.repairs[src.id];
      if (r?.invoiceId === invoice.id) this.emit({ type: 'repair.saved', repair: { ...withoutInvoice(r), status: 'done' } });
    } else if (src?.type === 'appointment') {
      const a = this.state.appointments[src.id];
      if (a?.invoiceId === invoice.id) this.emit({ type: 'appointment.saved', appointment: { ...withoutInvoice(a), status: 'arrived' } });
    } else if (src?.type === 'quote') {
      const q = this.state.quotes[src.id];
      if (q?.invoiceId === invoice.id) this.emit({ type: 'quote.saved', quote: { ...withoutInvoice(q), status: 'accepted' } });
    } else if (src?.type === 'tailor') {
      const o = this.state.tailorOrders[src.id];
      if (o?.invoiceId === invoice.id) this.emit({ type: 'tailor.saved', order: { ...withoutInvoice(o), status: 'ready' } });
    } else if (src?.type === 'printjob') {
      const j = this.state.printJobs?.[src.id];
      if (j?.invoiceId === invoice.id) {
        const { invoiceId: _i, ...rest } = j;
        this.emit({ type: 'printjob.saved', job: { ...rest, status: 'delivered' } });
      }
    } else if (src?.type === 'sitejob') {
      const j = this.state.siteJobs[src.id];
      if (j?.invoiceId === invoice.id) this.emit({ type: 'sitejob.saved', job: { ...withoutInvoice(j), status: 'done' } });
    } else if (src?.type === 'shipment') {
      const s = this.state.shipments?.[src.id];
      if (s?.invoiceId === invoice.id) this.emit({ type: 'shipment.saved', shipment: { ...withoutInvoice(s), status: 'delivered' } });
    } else if (src?.type === 'stoneblock') {
      // إلغاء فاتورة شراء الكتلة (قبل قصّها) بيلغي الكتلة
      const b = this.state.stoneBlocks?.[src.id];
      if (b && !b.closed) this.emit({ type: 'stoneblock.saved', block: { ...b, closed: true, notes: [b.notes, 'انلغت فاتورة شرائها'].filter(Boolean).join(' — ') } });
    } else if (src?.type === 'workorder') {
      // إلغاء فاتورة دفعة التسليم بيرجّع القطع جاهزة للتسليم
      const o = this.state.workOrders[src.id];
      if (o) this.emit({ type: 'workorder.saved', order: { ...o, status: o.status === 'done' ? 'open' : o.status, deliveries: o.deliveries.filter((d) => d.invoiceId !== invoice.id) } });
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
    const cash = v.cashAccountId ?? cashAccountFor(this.state, currency);
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

  // ───────────── الديون ─────────────

  /** يسجّل دين بدون فاتورة على حساب الزبون/المورد. */
  postDebt(d: DebtDraft): JournalEntry {
    if (!(d.amount > 0) || !Number.isSafeInteger(d.amount)) fail('المبلغ يجب أن يكون أكبر من صفر');
    const party = this.state.parties[d.partyId] ?? fail('الشخص غير موجود');
    if (!['old', 'cash', 'goods'].includes(d.reason)) fail('سبب الدين غير معروف');
    const currency = d.currency ?? this.base.code;
    const fx = { currency, ...(d.rate ? { rate: d.rate } : {}) };
    const owed = d.direction === 'owed';
    const cash = d.cashAccountId ?? cashAccountFor(this.state, currency);
    const counter =
      d.reason === 'old' ? SYSTEM_ACCOUNTS.openingBalances : d.reason === 'cash' ? cash : owed ? SYSTEM_ACCOUNTS.serviceRevenue : SYSTEM_ACCOUNTS.miscExpenses;
    const partyAccount = owed ? SYSTEM_ACCOUNTS.customers : SYSTEM_ACCOUNTS.suppliers;
    const why = d.reason === 'old' ? 'دين سابق' : d.reason === 'cash' ? (owed ? 'سلفة نقدية' : 'قرض نقدي') : 'بضاعة أو خدمة دون فاتورة';
    return this.postEntry({
      date: d.date,
      memo: `${owed ? 'دين لنا على' : 'دين علينا لـ'} ${party.name} — ${why}${d.memo?.trim() ? `: ${d.memo.trim()}` : ''}`,
      lines: [
        { accountId: partyAccount, ...(owed ? { debit: d.amount } : { credit: d.amount }), ...fx, partyId: party.id },
        { accountId: counter, ...(owed ? { credit: d.amount } : { debit: d.amount }), ...fx },
      ],
      source: { type: 'debt', id: crypto.randomUUID() },
      ...(d.createdBy ? { createdBy: d.createdBy } : {}),
    });
  }

  /** قبضت من حدا (in) أو دفعت لحدا (out). بيسكّر الدين من الحساب اللي عليه الرصيد. */
  settleDebt(d: DebtPaymentDraft): JournalEntry {
    const party = this.state.parties[d.partyId] ?? fail('الشخص غير موجود');
    const balance = (acc: string) =>
      this.state.entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + (l.partyId === party.id && l.accountId === acc ? l.baseDebit - l.baseCredit : 0), 0), 0);
    // القبض بيسكّر دين الزبون أولاً؛ الدفع بيسكّر دين المورد أولاً
    const accountId =
      d.direction === 'in'
        ? balance(SYSTEM_ACCOUNTS.customers) > 0 || balance(SYSTEM_ACCOUNTS.suppliers) >= 0
          ? SYSTEM_ACCOUNTS.customers
          : SYSTEM_ACCOUNTS.suppliers
        : balance(SYSTEM_ACCOUNTS.suppliers) < 0 || balance(SYSTEM_ACCOUNTS.customers) <= 0
          ? SYSTEM_ACCOUNTS.suppliers
          : SYSTEM_ACCOUNTS.customers;
    return this.postVoucher({
      kind: d.direction === 'in' ? 'receipt' : 'payment',
      date: d.date,
      amount: d.amount,
      partyId: party.id,
      accountId,
      memo: `${d.direction === 'in' ? 'تسديد من' : 'تسديد لـ'} ${party.name}${d.memo?.trim() ? ` — ${d.memo.trim()}` : ''}`,
      ...(d.currency ? { currency: d.currency } : {}),
      ...(d.rate ? { rate: d.rate } : {}),
      ...(d.cashAccountId ? { cashAccountId: d.cashAccountId } : {}),
      ...(d.createdBy ? { createdBy: d.createdBy } : {}),
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

  /** إلغاء تحويل انعمل بالغلط: البضاعة بترجع للمستودع الأصلي بنفس كمياتها ودفعاتها وأرقامها. */
  voidTransfer(transferId: string, date: string): StockTransfer {
    this.emit({ type: 'transfer.voided', transferId, date, by: this.actor });
    return this.state.transfers.find((t) => t.id === transferId)!;
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

  /** يغلق الطلب بفاتورة مبيع (تُنقص مكوّنات الوجبات من المخزون). الخدمة والتوصيل أسطر خدمة بالفاتورة. */
  closeOrder(orderId: string, opts: CloseOrderOptions): Invoice {
    const order = this.state.orders[orderId] ?? fail('الطلب غير موجود');
    if (order.status !== 'open') fail('الطلب مغلق مسبقاً');
    if (order.lines.length === 0) fail('الطلب فارغ');
    const table = order.tableId ? this.state.tables[order.tableId] : null;
    const partyId = opts.partyId ?? order.partyId ?? null;
    // الزبون بدو يدفع بعملة تانية: منحوّل أسعار الطلب من عملة الشركة قبل الحساب
    const currency = opts.currency ?? this.base.code;
    const fx = currency === this.base.code ? null : (this.state.currencies[currency] ?? fail('عملة غير معرّفة'));
    const rate = fx ? (opts.rate ?? this.rateFor(currency, opts.date) ?? fail(`لا يوجد سعر صرف لـ ${fx.nameAr} بتاريخ ${opts.date}`)) : 1;
    const priced = fx ? convertOrder(order, (minor) => Math.round((minor / rate) * 10 ** (fx.decimals - this.base.decimals))) : order;
    const t = orderTotals(priced);
    const extra: InvoiceLineDraft[] = [];
    if (t.service > 0) extra.push({ description: `خدمة ${order.servicePercent}%`, qty: 1, price: t.service });
    if (t.delivery > 0) extra.push({ description: 'أجور توصيل', qty: 1, price: t.delivery });
    const discount = (opts.discount ?? 0) + t.discount;
    const who = [order.customerName, order.phone, order.address].filter(Boolean).join(' — ');
    const invoice = this.postInvoice({
      kind: 'sale',
      date: opts.date,
      partyId,
      ...(fx ? { currency, rate } : {}),
      lines: [...priced.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price, ...(l.note ? { note: l.note } : {}) })), ...extra],
      ...(discount ? { discount } : {}),
      ...(opts.taxIds ? { taxIds: opts.taxIds } : {}),
      ...(opts.paid !== undefined ? { paid: opts.paid } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      notes: `طلب رقم ${order.number}${table ? ` — ${table.name}` : ''}${who ? ` — ${who}` : ''}`,
      source: { type: 'order', id: order.id },
    });
    this.emit({ type: 'order.saved', order: { ...order, ...(partyId ? { partyId } : {}), status: 'closed', closedAt: new Date().toISOString(), invoiceId: invoice.id } });
    return invoice;
  }

  /** نقل طلب لطاولة تانية (فاضية). */
  moveOrder(orderId: string, tableId: string): Order {
    const order = this.state.orders[orderId] ?? fail('الطلب غير موجود');
    if (order.status !== 'open') fail('الطلب مغلق');
    return this.saveOrder({ ...order, tableId, type: 'dine_in' });
  }

  /** دمج طلب بطلب تاني (طاولتين صاروا وحدة). */
  mergeOrders(fromId: string, intoId: string): Order {
    const from = this.state.orders[fromId] ?? fail('الطلب غير موجود');
    const into = this.state.orders[intoId] ?? fail('الطلب غير موجود');
    if (fromId === intoId) fail('اختار طلب تاني');
    if (from.status !== 'open' || into.status !== 'open') fail('الطلب مغلق');
    this.emit({ type: 'order.saved', order: { ...from, status: 'cancelled', lines: [], notes: `دُمج بالطلب رقم ${into.number}` } });
    return this.saveOrder({ ...into, lines: [...into.lines, ...from.lines], ...(from.guests || into.guests ? { guests: (from.guests ?? 0) + (into.guests ?? 0) } : {}) });
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

  // ───────────── عروض الأسعار ─────────────

  saveQuote(draft: QuoteDraft): Quote {
    const existing = this.state.quotes[draft.id];
    if (existing?.invoiceId) fail('العرض تحوّل إلى فاتورة؛ ألغِ الفاتورة أولاً لتعديله');
    if (draft.status === 'converted') fail('استخدم "تحويل إلى فاتورة"');
    if (draft.lines.length === 0) fail('أضف سطراً واحداً على الأقل');
    const quote: Quote = { ...draft, number: existing?.number ?? (this.state.counters['quote'] ?? 0) + 1, createdBy: existing?.createdBy ?? this.actor };
    this.emit({ type: 'quote.saved', quote });
    return quote;
  }

  /** يحوّل العرض إلى فاتورة مبيع (تنقص البضاعة من المخزون وتُرحَّل القيود). */
  convertQuote(id: string, opts: { date: string; paid?: number; cashAccountId?: string; warehouseId?: string; rate?: number }): Invoice {
    const q = this.state.quotes[id] ?? fail('العرض غير موجود');
    if (q.invoiceId) fail('العرض تحوّل إلى فاتورة مسبقاً');
    if (q.status === 'rejected') fail('العرض مرفوض');
    const invoice = this.postInvoice({
      kind: 'sale',
      date: opts.date,
      partyId: q.partyId,
      currency: q.currency,
      lines: q.lines.map((l) => ({ itemId: l.itemId ?? null, description: l.description, qty: l.qty, price: l.price, ...(l.unit ? { unit: l.unit } : {}), ...(l.discount ? { discount: l.discount } : {}) })),
      ...(q.discount ? { discount: q.discount } : {}),
      taxIds: q.taxIds,
      ...(opts.paid !== undefined ? { paid: opts.paid } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      ...(opts.warehouseId ? { warehouseId: opts.warehouseId } : {}),
      ...(opts.rate ? { rate: opts.rate } : {}),
      notes: `عرض سعر رقم ${q.number}${q.customerName && !q.partyId ? ` — ${q.customerName}` : ''}`,
      source: { type: 'quote', id: q.id },
    });
    this.emit({ type: 'quote.saved', quote: { ...q, status: 'converted', invoiceId: invoice.id } });
    return invoice;
  }

  // ───────────── الخياطة والتفصيل ─────────────

  /** حفظ طلب تفصيل جديد أو تعديله. العربون والفاتورة لا يُعدَّلان من هنا. */
  saveTailorOrder(draft: TailorOrderDraft): TailorOrder {
    const existing = this.state.tailorOrders[draft.id];
    if (existing?.invoiceId) fail('الطلب مسلّم ومفوتر؛ ألغِ الفاتورة أولاً لتعديله');
    if (draft.status === 'delivered') fail('استخدم "تسليم وفوترة" لتسليم الطلب');
    if (existing && existing.status !== 'cancelled' && draft.status === 'cancelled' && tailorDeposits(this.state, existing) > 0) {
      fail('على الطلب عربون؛ أرجع العربون (ألغِ سند القبض) قبل إلغاء الطلب');
    }
    if (draft.garments.length + draft.fabrics.length === 0) fail('أضف قطعة واحدة على الأقل');
    if (existing && tailorDeposits(this.state, existing) > 0 && (draft.currency !== existing.currency || draft.partyId !== existing.partyId)) {
      fail('على الطلب عربون؛ لا يمكن تغيير الزبون أو العملة');
    }
    const order: TailorOrder = {
      ...draft,
      number: existing?.number ?? (this.state.counters['tailor'] ?? 0) + 1,
      deposits: existing?.deposits ?? [],
    };
    this.emit({ type: 'tailor.saved', order });
    return order;
  }

  /** تسجيل عربون على الطلب: سند قبض على حساب الزبون. */
  addTailorDeposit(orderId: string, d: { date: string; amount: number; cashAccountId?: string; rate?: number }): TailorOrder {
    const o = this.state.tailorOrders[orderId] ?? fail('الطلب غير موجود');
    if (o.invoiceId || o.status === 'cancelled') fail('لا يمكن إضافة عربون على طلب مسلّم أو ملغى');
    const entry = this.postVoucher({
      kind: 'receipt',
      date: d.date,
      amount: d.amount,
      currency: o.currency,
      partyId: o.partyId,
      memo: `عربون طلب تفصيل رقم ${o.number}`,
      ...(d.cashAccountId ? { cashAccountId: d.cashAccountId } : {}),
      ...(d.rate ? { rate: d.rate } : {}),
      createdBy: this.actor,
    });
    const order: TailorOrder = { ...o, deposits: [...o.deposits, { entryId: entry.id, amount: d.amount, date: d.date }] };
    this.emit({ type: 'tailor.saved', order });
    return order;
  }

  /** تسليم الطلب للزبون: فاتورة مبيع بأجور الخياطة والأقمشة، والعربون يُخصم من المطلوب. */
  deliverTailorOrder(orderId: string, opts: TailorDeliverOptions): Invoice {
    const o = this.state.tailorOrders[orderId] ?? fail('الطلب غير موجود');
    if (o.invoiceId) fail('الطلب مسلّم مسبقاً');
    if (o.status === 'cancelled') fail('الطلب ملغى');
    const draft: InvoiceDraft = {
      kind: 'sale',
      date: opts.date,
      partyId: o.partyId,
      currency: o.currency,
      lines: tailorToInvoiceLines(this.state, o),
      ...(opts.rate ? { rate: opts.rate } : {}),
      ...(opts.warehouseId ? { warehouseId: opts.warehouseId } : {}),
      ...(opts.discount ? { discount: opts.discount } : {}),
      ...(opts.taxIds ? { taxIds: opts.taxIds } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      notes: `طلب تفصيل رقم ${o.number}`,
      source: { type: 'tailor', id: o.id },
    };
    let paid = opts.paid;
    if (paid === undefined) {
      // حساب المجموع النهائي (مع الخصم والضريبة) دون تسجيل شيء، ثم دفع المتبقي بعد العربون
      const { invoice: preview } = buildInvoice(
        { state: this.state, baseCode: this.base.code, resolveRate: (c, dt) => this.rateFor(c, dt), buildEntry: (e) => this.buildEntry(e), partyBalance: () => -Infinity },
        { ...draft, paid: 0 },
      );
      paid = Math.max(0, preview.total - tailorDeposits(this.state, o));
    }
    const invoice = this.postInvoice({ ...draft, paid });
    this.emit({ type: 'tailor.saved', order: { ...o, status: 'delivered', invoiceId: invoice.id } });
    return invoice;
  }

  // ───────────── مشاريع التنفيذ (جبسين وديكور) ─────────────

  /** حفظ مشروع (كشف) جديد أو تعديله. الدفعات والفاتورة ما بتتعدّل من هون. */
  // ───────────── الشركاء والمساهمين ─────────────

  savePartner(p: Omit<Partner, 'createdAt' | 'active'> & { active?: boolean }): Partner {
    const prev = this.state.partners?.[p.id];
    const partner: Partner = {
      id: p.id || crypto.randomUUID(),
      name: String(p.name ?? '').trim(),
      ...(p.phone?.trim() ? { phone: p.phone.trim() } : {}),
      ...(p.notes?.trim() ? { notes: p.notes.trim() } : {}),
      ...(p.profitPercent !== undefined && p.profitPercent !== null && String(p.profitPercent) !== '' ? { profitPercent: Number(p.profitPercent) } : {}),
      active: p.active ?? prev?.active ?? true,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
    };
    this.emit({ type: 'partner.saved', partner });
    return partner;
  }

  /**
   * حركة شريك: إيداع رأس مال (صندوق ← رأس المال)، سحب من رأس المال (العكس)،
   * سحب أرباح (جاري الشركاء ← صندوق)، أو توزيع أرباح (الأرباح المدوّرة ← جاري الشريك).
   */
  partnerMove(d: { partnerId: string; kind: PartnerMoveKind; amount: number; date: string; memo?: string; cashAccountId?: string }): JournalEntry {
    const partner = this.state.partners?.[d.partnerId] ?? fail('الشريك غير موجود');
    if (!(d.kind in PARTNER_MOVE_NAMES)) fail('نوع الحركة غير معروف');
    if (!(d.amount > 0) || !Number.isSafeInteger(d.amount)) fail('المبلغ يجب أن يكون أكبر من صفر');
    const need = (id: string) => (this.state.accounts[id] ? id : fail('حسابات رأس المال وجاري الشركاء غير موجودة بدليل الحسابات'));
    const cash = d.cashAccountId ?? cashAccountFor(this.state, this.base.code);
    const [debit, credit] =
      d.kind === 'capital_in' ? [cash, need(SYSTEM_ACCOUNTS.capital)]
      : d.kind === 'capital_out' ? [need(SYSTEM_ACCOUNTS.capital), cash]
      : d.kind === 'profit_out' ? [need(SYSTEM_ACCOUNTS.partnersCurrent), cash]
      : [need(SYSTEM_ACCOUNTS.retainedEarnings), need(SYSTEM_ACCOUNTS.partnersCurrent)];
    return this.postEntry({
      date: d.date,
      memo: `${PARTNER_MOVE_NAMES[d.kind]} — ${partner.name}${d.memo?.trim() ? `: ${d.memo.trim()}` : ''}`,
      lines: [
        { accountId: debit, debit: d.amount },
        { accountId: credit, credit: d.amount },
      ],
      source: { type: 'partner', id: partnerSourceId(partner.id, d.kind) },
    });
  }

  /** إلغاء حركة شريك (قيد عكسي بتاريخ الإلغاء). */
  voidPartnerMove(entryId: string, date: string): JournalEntry {
    const e = this.state.entries.find((x) => x.id === entryId) ?? fail('الحركة غير موجودة');
    if (e.source?.type !== 'partner') fail('هذا القيد مش حركة شريك');
    if (this.state.entries.some((x) => x.voidOf === e.id)) fail('الحركة ملغاة من قبل');
    const entry = this.reversal(e, date);
    this.emit({ type: 'entry.posted', entry });
    return entry;
  }

  saveSiteJob(draft: SiteJobDraft): SiteJob {
    const existing = this.state.siteJobs[draft.id];
    if (existing?.invoiceId) fail('المشروع مفوتر؛ ألغِ الفاتورة أولاً لتعديله');
    if (draft.status === 'invoiced') fail('استخدم "فوترة" لإصدار فاتورة المشروع');
    const paid = existing ? siteJobDeposits(this.state, existing) : 0;
    if (existing && existing.status !== 'cancelled' && draft.status === 'cancelled' && paid > 0) fail('على المشروع دفعات؛ أرجعها (ألغِ سندات القبض) قبل إلغاء المشروع');
    if (paid > 0 && (draft.currency !== existing!.currency || draft.partyId !== existing!.partyId)) fail('على المشروع دفعات؛ ما بيصير تغيّر الزبون أو العملة');
    const job: SiteJob = {
      ...draft,
      costs: draft.costs ?? [],
      number: existing?.number ?? (this.state.counters['sitejob'] ?? 0) + 1,
      deposits: existing?.deposits ?? [],
    };
    this.emit({ type: 'sitejob.saved', job });
    return job;
  }

  /** دفعة على المشروع (عربون أو دفعة أثناء الشغل): سند قبض على حساب الزبون. */
  addSiteJobDeposit(jobId: string, d: { date: string; amount: number; cashAccountId?: string; rate?: number }): SiteJob {
    const j = this.state.siteJobs[jobId] ?? fail('المشروع غير موجود');
    if (j.invoiceId || j.status === 'cancelled') fail('ما بيصير دفعة على مشروع مفوتر أو ملغى');
    const entry = this.postVoucher({
      kind: 'receipt',
      date: d.date,
      amount: d.amount,
      currency: j.currency,
      partyId: j.partyId,
      memo: `دفعة على المشروع رقم ${j.number}${j.title ? ` (${j.title})` : ''}`,
      ...(d.cashAccountId ? { cashAccountId: d.cashAccountId } : {}),
      ...(d.rate ? { rate: d.rate } : {}),
      createdBy: this.actor,
    });
    const job: SiteJob = { ...j, deposits: [...j.deposits, { entryId: entry.id, amount: d.amount, date: d.date }] };
    this.emit({ type: 'sitejob.saved', job });
    return job;
  }

  /** فوترة المشروع: فاتورة مبيع ببنود الكشف، والدفعات بتنخصم من المطلوب. */
  deliverSiteJob(jobId: string, opts: TailorDeliverOptions): Invoice {
    const j = this.state.siteJobs[jobId] ?? fail('المشروع غير موجود');
    if (j.invoiceId) fail('المشروع مفوتر من قبل');
    if (j.status === 'cancelled') fail('المشروع ملغى');
    const lines = siteJobToInvoiceLines(j);
    if (!lines.length) fail('المشروع فاضي');
    const t = siteJobTotals(j);
    const discount = (opts.discount ?? 0) + t.discount;
    const draft: InvoiceDraft = {
      kind: 'sale',
      date: opts.date,
      partyId: j.partyId,
      currency: j.currency,
      lines,
      ...(opts.rate ? { rate: opts.rate } : {}),
      ...(discount ? { discount } : {}),
      ...(opts.taxIds ? { taxIds: opts.taxIds } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      notes: `مشروع رقم ${j.number}${j.title ? ` — ${j.title}` : ''}${j.address ? ` — ${j.address}` : ''}`,
      source: { type: 'sitejob', id: j.id },
    };
    let paid = opts.paid;
    if (paid === undefined) {
      const { invoice: preview } = buildInvoice(
        { state: this.state, baseCode: this.base.code, resolveRate: (c, dt) => this.rateFor(c, dt), buildEntry: (e) => this.buildEntry(e), partyBalance: () => -Infinity },
        { ...draft, paid: 0 },
      );
      paid = Math.max(0, preview.total - siteJobDeposits(this.state, j));
    }
    const invoice = this.postInvoice({ ...draft, paid });
    this.emit({ type: 'sitejob.saved', job: { ...j, status: 'invoiced', invoiceId: invoice.id } });
    return invoice;
  }

  // ───────────── صيدلية مع موردين مستقلين ─────────────

  /** مورّد جديد أو تعديل: بينعمله حساب زبون عند الصيدلية (دين الأدوية اللي بياخدها). */
  saveDealer(d: { id: string; name: string; phone?: string; active?: boolean }): Dealer {
    const existing = this.state.dealers?.[d.id];
    const name = d.name.trim() || fail('اكتب اسم المورّد');
    let partyId = existing?.partyId;
    if (!partyId) {
      partyId = `dealer-${d.id}`;
      this.saveParty({ id: partyId, kind: 'customer', name: `المورّد ${name}`, ...(d.phone ? { phone: d.phone } : {}) });
    } else {
      const p = this.state.parties[partyId];
      if (p) this.saveParty({ ...p, name: `المورّد ${name}`, ...(d.phone ? { phone: d.phone } : {}) });
    }
    const dealer: Dealer = { id: d.id, name, ...(d.phone ? { phone: d.phone } : {}), partyId, active: d.active ?? existing?.active ?? true, createdAt: existing?.createdAt ?? new Date().toISOString() };
    this.emit({ type: 'dealer.saved', dealer });
    return dealer;
  }

  /** سعر الصيدلية للمادة بالعملة الأساسية (للمحاسبة مع المورّد). */
  private pharmacyPrice(itemId: string, date: string): number {
    const it = this.state.items[itemId]!;
    if (it.priceCurrency === this.base.code) return it.price;
    const rate = this.rateFor(it.priceCurrency, date) ?? fail(`لا يوجد سعر صرف لـ ${it.priceCurrency}`);
    return convertMinor(it.price, this.state.currencies[it.priceCurrency]!, this.base, rate);
  }

  /**
   * بيعة المورّد لزبونه بسعر المورّد، المصاري لصندوقه.
   * الأدوية (من بضاعة الصيدلية) بتنسجّل فاتورة مبيع من الصيدلية للمورّد بسعر الصيدلية، دين عليه، والمخزون بينقص.
   * بضاعته الخاصة بتنقص من مخزونه هو بتكلفتها.
   */
  postDealerSale(d: { id?: string; dealerId: string; date: string; lines: { itemId: string; qty: number; price: number }[]; discount?: number; customer?: string }): DealerSale {
    const dealer = this.state.dealers?.[d.dealerId] ?? fail('المورّد غير موجود');
    if (!dealer.active) fail('المورّد موقوف');
    if (!d.lines.length) fail('الفاتورة فاضية');
    const id = d.id ?? crypto.randomUUID();
    const own = dealerStock(this.state, dealer.id);
    const need = new Map<string, number>();
    const lines: DealerSaleLine[] = d.lines.map((l) => {
      const it = this.state.items[l.itemId] ?? fail('مادة غير موجودة');
      if (!(l.qty > 0)) fail(`الكمية غير صالحة: ${it.name}`);
      if (it.dealerId && it.dealerId !== dealer.id) fail(`«${it.name}» من بضاعة مورّد تاني`);
      if (it.dealerId) {
        const total = (need.get(it.id) ?? 0) + l.qty;
        need.set(it.id, total);
        const have = own[it.id]?.qty ?? 0;
        if (total > have + 1e-9) fail(`ما بيكفي «${it.name}» ببضاعة المورّد: الموجود ${have}`);
        return { itemId: it.id, name: it.name, qty: l.qty, price: l.price, cost: Math.round(dealerUnitCost(this.state, dealer.id, it.id) * l.qty), own: true };
      }
      return { itemId: it.id, name: it.name, qty: l.qty, price: l.price, cost: Math.round(this.pharmacyPrice(it.id, d.date) * l.qty), own: false };
    });
    const gross = lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);
    const discount = Math.min(d.discount ?? 0, gross);
    const meds = lines.filter((l) => !l.own);
    let invoiceId: string | undefined;
    if (meds.length) {
      const inv = this.postInvoice({
        kind: 'sale',
        date: d.date,
        partyId: dealer.partyId,
        lines: meds.map((l) => ({ itemId: l.itemId, qty: l.qty, price: Math.round(l.cost / l.qty) })),
        paid: 0,
        notes: `بيع المورّد ${dealer.name} — بسعر الصيدلية`,
        source: { type: 'dealersale', id },
      });
      invoiceId = inv.id;
    }
    const sale: DealerSale = {
      id,
      number: (this.state.counters['dealersale'] ?? 0) + 1,
      dealerId: dealer.id,
      date: d.date,
      lines,
      discount,
      total: gross - discount,
      ...(d.customer?.trim() ? { customer: d.customer.trim() } : {}),
      ...(invoiceId ? { invoiceId } : {}),
      createdAt: new Date().toISOString(),
      createdBy: this.actor,
    };
    this.emit({ type: 'dealersale.posted', sale });
    return sale;
  }

  /** إلغاء بيعة المورّد: فاتورة الصيدلية بتنلغى (الأدوية بترجع والدين بينشال)، وبضاعته بترجع لمخزونه. */
  voidDealerSale(saleId: string, date: string): void {
    const sale = (this.state.dealerSales ?? []).find((s) => s.id === saleId) ?? fail('الفاتورة غير موجودة');
    if (sale.voided) fail('الفاتورة ملغاة من قبل');
    const inv = sale.invoiceId ? this.state.invoices.find((i) => i.id === sale.invoiceId) : undefined;
    if (inv && !inv.voidEntryId) this.voidInvoice(inv.id, date);
    this.emit({ type: 'dealersale.voided', saleId, date, by: this.actor });
  }

  /**
   * حركة بصندوق المورّد. التسديد للصيدلية بيعمل سند قبض عند الصيدلية على حسابه.
   * شراء بضاعته الخاصة: lines بالكمية وتكلفة الوحدة.
   */
  postDealerMove(d: { dealerId: string; date: string; kind: DealerMoveKind; amount?: number; lines?: { itemId: string; qty: number; unitCost: number }[]; note?: string; cashAccountId?: string }): DealerMove {
    const dealer = this.state.dealers?.[d.dealerId] ?? fail('المورّد غير موجود');
    const lines = d.kind === 'purchase' ? (d.lines ?? []).map((l) => ({ itemId: l.itemId, qty: l.qty, cost: Math.round(l.qty * l.unitCost) })) : undefined;
    if (d.kind === 'purchase' && !lines?.length) fail('أضف مادة واحدة عالأقل');
    const amount = lines ? lines.reduce((s, l) => s + l.cost, 0) : (d.amount ?? 0);
    let entryId: string | undefined;
    if (d.kind === 'payment') {
      if (!(amount > 0)) fail('المبلغ لازم يكون أكبر من صفر');
      const entry = this.postVoucher({ kind: 'receipt', date: d.date, amount, partyId: dealer.partyId, memo: `تسديد المورّد ${dealer.name}${d.note ? `: ${d.note}` : ''}`, ...(d.cashAccountId ? { cashAccountId: d.cashAccountId } : {}), createdBy: this.actor });
      entryId = entry.id;
    }
    const move: DealerMove = {
      id: crypto.randomUUID(),
      dealerId: dealer.id,
      date: d.date,
      kind: d.kind,
      amount,
      ...(lines ? { lines } : {}),
      ...(d.note?.trim() ? { note: d.note.trim() } : {}),
      ...(entryId ? { entryId } : {}),
      createdAt: new Date().toISOString(),
      createdBy: this.actor,
    };
    this.emit({ type: 'dealermove.posted', move });
    return move;
  }

  voidDealerMove(moveId: string, date: string): void {
    const m = (this.state.dealerMoves ?? []).find((x) => x.id === moveId) ?? fail('الحركة غير موجودة');
    if (m.voided) fail('الحركة ملغاة من قبل');
    if (m.kind === 'purchase') {
      const st = dealerStock(this.state, m.dealerId);
      for (const l of m.lines ?? []) if ((st[l.itemId]?.qty ?? 0) < l.qty - 1e-9) fail(`ما بيصير تلغي الشراء: انباع من «${this.state.items[l.itemId]?.name}»`);
    }
    if (m.entryId && !this.state.voided[m.entryId]) {
      const e = this.state.entries.find((x) => x.id === m.entryId)!;
      this.emit({ type: 'entry.posted', entry: this.reversal(e, date) });
    }
    this.emit({ type: 'dealermove.voided', moveId, date, by: this.actor });
  }

  // ───────────── المطبعة: طلبات الطباعة ─────────────

  savePrintJob(draft: Omit<PrintJob, 'number' | 'deposits' | 'materialsAdjustmentId' | 'invoiceId'> & { number?: number }): PrintJob {
    const existing = this.state.printJobs?.[draft.id];
    if (existing?.invoiceId) fail('الطلب مفوتر؛ ألغِ الفاتورة أولاً لتعديله');
    if (draft.status === 'invoiced') fail('استخدم «فوترة» لإصدار فاتورة الطلب');
    const paid = existing ? printJobDeposits(this.state, existing) : 0;
    if (existing && existing.status !== 'cancelled' && draft.status === 'cancelled' && paid > 0) fail('على الطلب عربون؛ رجّعه (ألغِ سند القبض) قبل إلغاء الطلب');
    if (paid > 0 && (draft.currency !== existing!.currency || draft.partyId !== existing!.partyId)) fail('على الطلب عربون؛ ما بيصير تغيّر الزبون أو العملة');
    const job: PrintJob = {
      ...draft,
      extras: draft.extras ?? [],
      number: existing?.number ?? (this.state.counters['printjob'] ?? 0) + 1,
      deposits: existing?.deposits ?? [],
      ...(existing?.materialsAdjustmentId ? { materialsAdjustmentId: existing.materialsAdjustmentId } : {}),
    };
    this.emit({ type: 'printjob.saved', job });
    return job;
  }

  /** عربون أو دفعة على طلب الطباعة: سند قبض على حساب الزبون. */
  addPrintDeposit(jobId: string, d: { date: string; amount: number; cashAccountId?: string; rate?: number }): PrintJob {
    const j = this.state.printJobs?.[jobId] ?? fail('الطلب غير موجود');
    if (j.invoiceId || j.status === 'cancelled') fail('ما بيصير عربون على طلب مفوتر أو ملغى');
    const entry = this.postVoucher({
      kind: 'receipt',
      date: d.date,
      amount: d.amount,
      currency: j.currency,
      partyId: j.partyId,
      memo: `عربون طلب طباعة رقم ${j.number}${j.title ? ` (${j.title})` : ''}`,
      ...(d.cashAccountId ? { cashAccountId: d.cashAccountId } : {}),
      ...(d.rate ? { rate: d.rate } : {}),
      createdBy: this.actor,
    });
    const job: PrintJob = { ...j, deposits: [...j.deposits, { entryId: entry.id, amount: d.amount, date: d.date }] };
    this.emit({ type: 'printjob.saved', job });
    return job;
  }

  /** فوترة الطلب: فاتورة مبيع بالبنود، العربون بينخصم من المطلوب، والمواد (فلكس، ورق) بتنصرف من المخزون مرة وحدة. */
  deliverPrintJob(jobId: string, opts: TailorDeliverOptions): Invoice {
    const j = this.state.printJobs?.[jobId] ?? fail('الطلب غير موجود');
    if (j.invoiceId) fail('الطلب مفوتر من قبل');
    if (j.status === 'cancelled') fail('الطلب ملغى');
    const lines = printJobToInvoiceLines(j);
    if (!lines.length) fail('الطلب فاضي');
    const t = printJobTotals(j);
    const discount = (opts.discount ?? 0) + t.discount;
    const draft: InvoiceDraft = {
      kind: 'sale',
      date: opts.date,
      partyId: j.partyId,
      currency: j.currency,
      lines,
      ...(opts.rate ? { rate: opts.rate } : {}),
      ...(discount ? { discount } : {}),
      ...(opts.taxIds ? { taxIds: opts.taxIds } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      notes: `طلب طباعة رقم ${j.number}${j.title ? ` — ${j.title}` : ''}`,
      source: { type: 'printjob', id: j.id },
    };
    let paid = opts.paid;
    if (paid === undefined) {
      const { invoice: preview } = buildInvoice(
        { state: this.state, baseCode: this.base.code, resolveRate: (c, dt) => this.rateFor(c, dt), buildEntry: (e) => this.buildEntry(e), partyBalance: () => -Infinity },
        { ...draft, paid: 0 },
      );
      paid = Math.max(0, preview.total - printJobDeposits(this.state, j));
    }
    // المواد (فلكس، ورق) بتنصرف مرة وحدة. منتأكد إنها بتكفي قبل الفاتورة حتى ما تنعمل وحدة بدون التانية
    let materialsAdjustmentId = j.materialsAdjustmentId;
    const mats = new Map<string, number>();
    if (!materialsAdjustmentId) for (const l of j.lines) if (l.material) mats.set(l.material.itemId, (mats.get(l.material.itemId) ?? 0) + l.material.qty);
    const wh = Object.keys(this.state.warehouses)[0] ?? 'main';
    if (!this.state.info?.allowNegativeStock)
      for (const [itemId, qty] of mats) {
        const have = this.state.stock[itemId]?.qty[wh] ?? 0;
        if (qty > have + 1e-9) fail(`ما بيكفي «${this.state.items[itemId]?.name}» بالمخزون: المطلوب ${qty} والموجود ${have}`);
      }
    const invoice = this.postInvoice({ ...draft, paid });
    if (mats.size) {
      const adj = this.adjustStock({ kind: 'consumption', date: opts.date, warehouseId: wh, lines: [...mats].map(([itemId, qty]) => ({ itemId, qty })), memo: `مواد طلب طباعة رقم ${j.number}` });
      materialsAdjustmentId = adj.id;
    }
    this.emit({ type: 'printjob.saved', job: { ...j, status: 'invoiced', invoiceId: invoice.id, ...(materialsAdjustmentId ? { materialsAdjustmentId } : {}) } });
    return invoice;
  }

  // ───────────── النقل والتخليص الجمركي ─────────────

  saveShipment(draft: Omit<Shipment, 'number' | 'invoiceId'> & { number?: number }): Shipment {
    const existing = this.state.shipments?.[draft.id];
    if (existing?.invoiceId) fail('الشحنة مفوترة؛ ألغِ الفاتورة أولاً لتعديلها');
    if (draft.status === 'invoiced') fail('استخدم «فوترة» لإصدار فاتورة الشحنة');
    const shipment: Shipment = {
      ...draft,
      charges: draft.charges ?? [],
      costs: draft.costs ?? [],
      number: existing?.number ?? (this.state.counters['shipment'] ?? 0) + 1,
    };
    this.emit({ type: 'shipment.saved', shipment });
    return shipment;
  }

  /** فاتورة الشحنة: بنود الأجور كخدمات، وتفاصيل السائق والسيارة والوجهة بالملاحظات والفاتورة. */
  invoiceShipment(id: string, opts: { date: string; paid?: number; cashAccountId?: string; rate?: number }): Invoice {
    const s = this.state.shipments?.[id] ?? fail('الشحنة غير موجودة');
    if (s.invoiceId) fail('الشحنة مفوترة من قبل');
    if (s.status === 'cancelled') fail('الشحنة ملغاة');
    const lines = s.charges.filter((c) => c.amount > 0).map((c) => ({ description: c.description, qty: 1, price: c.amount }));
    if (!lines.length) fail('ضيف بنود الأجور أول (أجار سيارة، تخليص...)');
    const invoice = this.postInvoice({
      kind: 'sale',
      date: opts.date,
      partyId: s.partyId,
      currency: s.currency,
      lines,
      paid: opts.paid ?? 0,
      ...(opts.rate ? { rate: opts.rate } : {}),
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      notes: shipmentSummary(s),
      source: { type: 'shipment', id: s.id },
    });
    this.emit({ type: 'shipment.saved', shipment: { ...s, status: 'invoiced', invoiceId: invoice.id } });
    return invoice;
  }

  // ───────────── منشرة الحجر ─────────────

  /** مادة «كتل حجر خام» بالمتر المكعب (بتنعمل أول مرة). */
  private stoneBlockItem(): string {
    const found = this.state.items['stone-blocks'];
    if (found) return found.id;
    const taken = new Set(Object.values(this.state.items).filter((i) => !i.archived).map((i) => i.code));
    let code = 'BLOCK';
    for (let n = 2; taken.has(code); n++) code = `BLOCK-${n}`;
    this.saveItem({ id: 'stone-blocks', code, name: 'كتل حجر خام', kind: 'stock', unit: 'م³', category: 'كتل خام', price: 0, priceCurrency: this.base.code });
    return 'stone-blocks';
  }

  /** شراء كتلة: بتنسجّل بأبعادها وحجمها، وبتدخل المخزون بفاتورة شراء (سعر المتر المكعب). */
  addStoneBlock(d: {
    date: string;
    partyId?: string;
    stone: string;
    quarry?: string;
    length: number;
    width: number;
    height: number;
    volume?: number; // إذا الحجم بالفاتورة غير الأبعاد
    pricePerM3: number;
    currency?: string;
    rate?: number;
    paid?: number;
    cashAccountId?: string;
    notes?: string;
  }): StoneBlock {
    const volume = Math.round((d.volume ?? d.length * d.width * d.height) * 1000) / 1000;
    if (!(volume > 0)) fail('اكتب أبعاد الكتلة أو حجمها');
    if (!Number.isSafeInteger(d.pricePerM3) || d.pricePerM3 <= 0) fail('اكتب سعر المتر المكعب');
    const itemId = this.stoneBlockItem();
    const id = crypto.randomUUID();
    const number = (this.state.counters['stoneblock'] ?? 0) + 1;
    const total = Math.round(volume * d.pricePerM3);
    const invoice = this.postInvoice({
      kind: 'purchase',
      date: d.date,
      ...(d.partyId ? { partyId: d.partyId } : {}),
      ...(d.currency ? { currency: d.currency } : {}),
      ...(d.rate ? { rate: d.rate } : {}),
      lines: [{ itemId, qty: volume, price: d.pricePerM3, description: `كتلة ${d.stone} رقم ${number} (${volume} م³)` }],
      paid: d.paid ?? (d.partyId ? 0 : total),
      ...(d.cashAccountId ? { cashAccountId: d.cashAccountId } : {}),
      notes: `كتلة رقم ${number} — ${d.stone}${d.quarry ? ` — ${d.quarry}` : ''}`,
      source: { type: 'stoneblock', id },
    });
    const block: StoneBlock = {
      id,
      number,
      date: d.date,
      ...(d.partyId ? { partyId: d.partyId } : {}),
      stone: d.stone.trim(),
      ...(d.quarry?.trim() ? { quarry: d.quarry.trim() } : {}),
      length: d.length,
      width: d.width,
      height: d.height,
      volume,
      itemId,
      purchaseInvoiceId: invoice.id,
      cuts: [],
      ...(d.notes?.trim() ? { notes: d.notes.trim() } : {}),
    };
    this.emit({ type: 'stoneblock.saved', block });
    return block;
  }

  /**
   * قص من الكتلة: عملية إنتاج بتصرف حجم من الكتل الخام وبتدخل الألواح والبلاط بالمخزون بتكلفتها
   * (التكلفة بتتوزع حسب حجم كل منتج إذا انكتب، وإلا حسب الكمية). close: الكتلة خلصت، والباقي هدر بينحسب عالمنتجات.
   */
  cutStoneBlock(blockId: string, d: { date: string; volume?: number; outputs: { itemId: string; qty: number; weight?: number }[]; close?: boolean; memo?: string; warehouseId?: string }): StoneBlock {
    const b = this.state.stoneBlocks?.[blockId] ?? fail('الكتلة غير موجودة');
    if (b.closed) fail('الكتلة خالصة');
    const { left } = stoneBlockUsage(b);
    const volume = d.close ? left : Math.round((d.volume ?? left) * 1000) / 1000;
    if (!(volume > 0)) fail('ما بقي شي من الكتلة');
    if (volume > left + 1e-6) fail(`الباقي من الكتلة ${left} م³ بس`);
    const production = this.postProduction({
      date: d.date,
      ...(d.warehouseId ? { warehouseId: d.warehouseId } : {}),
      inputs: [{ itemId: b.itemId, qty: volume }],
      outputs: d.outputs,
      memo: d.memo?.trim() || `قص الكتلة رقم ${b.number} (${b.stone})`,
    });
    const cuts = [...b.cuts, { productionId: production.id, date: d.date, volume }];
    const block: StoneBlock = { ...b, cuts, ...(d.close || left - volume < 0.001 ? { closed: true } : {}) };
    this.emit({ type: 'stoneblock.saved', block });
    return block;
  }

  // ───────────── توزيع الفروج: تسعيرة اليوم والقطعيات ─────────────

  /**
   * تسعيرة اليوم: بتغيّر سعر المستهلك والجملة لكل صنف دفعة وحدة، وبتنحفظ بتاريخها لنرجع نشوف أسعار كل يوم.
   * prices: سعر المستهلك (price) والجملة (wholesale) بأصغر وحدة من عملة المادة.
   */
  savePriceBoard(date: string, prices: Record<string, { price: number; wholesale?: number }>): PriceBoard {
    const board: PriceBoard = { date, prices, by: this.actor, at: new Date().toISOString() };
    this.emit({ type: 'priceboard.saved', board });
    for (const [id, p] of Object.entries(prices)) {
      const item = this.state.items[id]!;
      const wholesale = p.wholesale || undefined;
      if (item.price === p.price && (item.wholesalePrice || undefined) === wholesale) continue;
      const { wholesalePrice: _w, ...rest } = item;
      this.emit({ type: 'item.saved', item: { ...rest, price: p.price, ...(wholesale ? { wholesalePrice: wholesale } : {}) } });
    }
    return board;
  }

  /** بيضيف قطعيات الفروج المعتادة (فروج، وردة، جناح، شرحات...) اللي مش موجودة، بالكيلو. */
  addPoultryCuts(): number {
    const names = new Set(Object.values(this.state.items).filter((i) => !i.archived).map((i) => i.name.trim()));
    const codes = new Set(Object.values(this.state.items).filter((i) => !i.archived).map((i) => i.code));
    const currency = this.state.info?.baseCurrency ?? 'SYP';
    let n = 0;
    POULTRY_CUTS.forEach((c, i) => {
      if (names.has(c.name) || this.state.items[c.id]) return;
      let code = `D${String(i + 1).padStart(2, '0')}`;
      while (codes.has(code)) code += '1';
      codes.add(code);
      this.emit({ type: 'item.saved', item: { id: c.id, code, name: c.name, kind: 'stock', unit: 'كيلو', price: 0, priceCurrency: currency, category: c.category } });
      n++;
    });
    return n;
  }

  /** تعبئة شركة فاضية ببيانات تجريبية للعرض. */
  loadDemoData(): void {
    loadDemo(this);
  }

  // ───────────── التقسيط ─────────────

  /** خطة أقساط: المبلغ المقسّط + زيادة التقسيط (إيراد) موزّع على أقساط. */
  createInstallmentPlan(d: InstallmentDraft): InstallmentPlan {
    const party = this.state.parties[d.partyId] ?? fail('الزبون غير موجود');
    if (!(d.principal > 0)) fail('اكتب المبلغ المقسّط');
    const currency = d.currency ?? this.base.code;
    if (d.invoiceId) {
      const inv = this.state.invoices.find((i) => i.id === d.invoiceId) ?? fail('الفاتورة غير موجودة');
      if (inv.voidEntryId) fail('الفاتورة ملغاة');
      if (inv.partyId !== d.partyId) fail('الفاتورة لزبون تاني');
      if (Object.values(this.state.installments).some((p) => p.invoiceId === inv.id && p.status !== 'cancelled')) fail('على الفاتورة خطة أقساط مسبقاً');
      if (d.principal > inv.total - inv.paid) fail('المبلغ المقسّط أكبر من الباقي على الفاتورة');
    }
    const markup = d.markup ?? Math.round((d.principal * (d.markupPercent ?? 0)) / 100);
    const number = (this.state.counters['installment'] ?? 0) + 1;
    let markupEntryId: string | undefined;
    if (markup > 0) {
      const entry = this.postEntry({
        date: d.date,
        memo: `زيادة تقسيط — خطة رقم ${number} — ${party.name}`,
        lines: [
          { accountId: SYSTEM_ACCOUNTS.customers, debit: markup, currency, partyId: party.id },
          { accountId: SYSTEM_ACCOUNTS.serviceRevenue, credit: markup, currency },
        ],
        source: { type: 'installment', id: crypto.randomUUID() },
        createdBy: this.actor,
      });
      markupEntryId = entry.id;
    }
    const plan: InstallmentPlan = {
      id: d.id ?? crypto.randomUUID(),
      number,
      partyId: party.id,
      date: d.date,
      currency,
      ...(d.invoiceId ? { invoiceId: d.invoiceId } : {}),
      principal: d.principal,
      markup,
      ...(markupEntryId ? { markupEntryId } : {}),
      schedule: d.schedule ?? buildSchedule(d.principal + markup, d.count ?? 1, d.firstDue ?? d.date, d.everyMonths ?? 1),
      payments: [],
      ...(d.guarantor ? { guarantor: d.guarantor } : {}),
      ...(d.guarantorPhone ? { guarantorPhone: d.guarantorPhone } : {}),
      ...(d.notes ? { notes: d.notes } : {}),
      status: 'active',
    };
    this.emit({ type: 'installment.saved', plan });
    return plan;
  }

  /** قبض قسط (أو أكثر): سند قبض على حساب الزبون، وبيتوزع على الأقساط بالترتيب. */
  collectInstallment(planId: string, p: { date: string; amount: number; cashAccountId?: string }): InstallmentPlan {
    const plan = this.state.installments[planId] ?? fail('الخطة غير موجودة');
    if (plan.status !== 'active') fail('الخطة مو فعّالة');
    const st = installmentState(this.state, plan, p.date);
    if (p.amount > st.remaining) fail(`الباقي على الخطة ${(st.remaining / 100).toLocaleString('en')} فقط`);
    const entry = this.postVoucher({
      kind: 'receipt',
      date: p.date,
      amount: p.amount,
      currency: plan.currency,
      partyId: plan.partyId,
      memo: `قسط — خطة تقسيط رقم ${plan.number}`,
      ...(p.cashAccountId ? { cashAccountId: p.cashAccountId } : {}),
      createdBy: this.actor,
    });
    const next: InstallmentPlan = { ...plan, payments: [...plan.payments, { entryId: entry.id, date: p.date, amount: p.amount }] };
    if (installmentState(this.state, next, p.date).remaining === 0) next.status = 'done';
    this.emit({ type: 'installment.saved', plan: next });
    return next;
  }

  /** إلغاء خطة ما انقبض منها شي: بترجع زيادة التقسيط. */
  cancelInstallmentPlan(planId: string, date: string): InstallmentPlan {
    const plan = this.state.installments[planId] ?? fail('الخطة غير موجودة');
    if (plan.payments.some((p) => !this.state.voided[p.entryId])) fail('على الخطة أقساط مقبوضة؛ ألغِ سنداتها أولاً');
    if (plan.markupEntryId && !this.state.voided[plan.markupEntryId]) {
      const original = this.state.entries.find((e) => e.id === plan.markupEntryId) ?? fail('قيد الزيادة غير موجود');
      this.emit({ type: 'entry.posted', entry: this.reversal(original, date) });
    }
    const next: InstallmentPlan = { ...plan, status: 'cancelled' };
    this.emit({ type: 'installment.saved', plan: next });
    return next;
  }

  // ───────────── الاستبدال (جهاز مستعمل مقابل جديد) ─────────────

  /** شراء الجهاز القديم من الزبون وبيعه الجديد بنفس العملية، والفرق نقداً. */
  tradeIn(d: TradeInDraft): { sale: Invoice; purchase: Invoice; entry?: JournalEntry } {
    const party = this.state.parties[d.partyId] ?? fail('اختار الزبون');
    if (!d.sale.length || !d.tradeIn.length) fail('حدد الجهاز الجديد والجهاز القديم');
    // الزبون صار كمان مورّد للجهاز المستعمل
    if (party.kind === 'customer') this.emit({ type: 'party.saved', party: { ...party, kind: 'both' } });
    const currency = d.currency ?? this.base.code;
    const common = { date: d.date, partyId: d.partyId, currency, ...(d.rate ? { rate: d.rate } : {}), ...(d.warehouseId ? { warehouseId: d.warehouseId } : {}) };
    const purchase = this.postInvoice({ ...common, kind: 'purchase', lines: d.tradeIn, paid: 0, notes: 'جهاز مستعمل مستلم بالاستبدال' });
    const sale = this.postInvoice({ ...common, kind: 'sale', lines: d.sale, paid: 0, notes: `بيع مع استبدال — مقابل فاتورة شراء رقم ${purchase.number}` });
    let entry: JournalEntry | undefined;
    if (d.received) {
      entry = this.postVoucher({
        kind: d.received > 0 ? 'receipt' : 'payment',
        date: d.date,
        amount: Math.abs(d.received),
        currency,
        partyId: d.partyId,
        memo: `فرق استبدال — مبيع ${sale.number} / شراء ${purchase.number}`,
        ...(d.cashAccountId ? { cashAccountId: d.cashAccountId } : {}),
        createdBy: this.actor,
      });
    }
    return { sale, purchase, ...(entry ? { entry } : {}) };
  }

  // ───────────── ورشة الإنتاج ─────────────

  /** استلام أتواب قماش من زبون بسند واحد. */
  receiveRolls(input: { partyId: string; date: string; unit?: LengthUnit; rolls: (Omit<FabricRoll, 'id' | 'partyId' | 'date' | 'receiptNo' | 'returns' | 'unit'> & { unit?: LengthUnit })[] }): FabricRoll[] {
    const receiptNo = (this.state.counters['rollReceipt'] ?? 0) + 1;
    const rolls: FabricRoll[] = input.rolls.map((r) => ({
      ...r,
      unit: r.unit ?? input.unit ?? 'm',
      code: r.code.trim(),
      fabric: r.fabric.trim(),
      id: crypto.randomUUID(),
      partyId: input.partyId,
      date: input.date,
      receiptNo,
      returns: [],
    }));
    this.emit({ type: 'rolls.saved', rolls });
    return rolls;
  }

  /** تعديل بيانات توب (الرقم، النوع، اللون، الطول...). */
  updateRoll(roll: Omit<FabricRoll, 'returns' | 'receiptNo' | 'partyId'>): FabricRoll {
    const prev = this.state.rolls[roll.id] ?? fail('التوب غير موجود');
    const next: FabricRoll = { ...prev, ...roll, code: roll.code.trim(), fabric: roll.fabric.trim(), partyId: prev.partyId, receiptNo: prev.receiptNo, returns: prev.returns };
    this.emit({ type: 'rolls.saved', rolls: [next] });
    return next;
  }

  /** إرجاع بواقي توب للزبون. بدون طول = كل الباقي. */
  returnRoll(rollId: string, opts: { date: string; length?: number; note?: string }): FabricRoll {
    const roll = this.state.rolls[rollId] ?? fail('التوب غير موجود');
    const left = rollRemaining(this.state, roll);
    const length = opts.length ?? left;
    if (!(length > 0)) fail('ما في باقي بهالتوب');
    if (length > left) fail(`الباقي بالتوب ${(left / 100).toLocaleString('en')} ${UNIT_NAMES[roll.unit]} فقط`);
    const next: FabricRoll = { ...roll, returns: [...roll.returns, { date: opts.date, length, ...(opts.note ? { note: opts.note } : {}) }] };
    this.emit({ type: 'rolls.saved', rolls: [next] });
    return next;
  }

  saveWorkOrder(draft: WorkOrderDraft): WorkOrder {
    const prev = this.state.workOrders[draft.id];
    const order: WorkOrder = {
      ...draft,
      number: prev?.number ?? (this.state.counters['workorder'] ?? 0) + 1,
      cuts: prev?.cuts ?? [],
      stages: prev?.stages ?? [],
      expenses: prev?.expenses ?? [],
      deliveries: prev?.deliveries ?? [],
    };
    if (prev) {
      const p = workOrderProgress(this.state, prev);
      for (const z of prev.sizes) if (!order.sizes.includes(z) && ((p.cutBySize[z] ?? 0) > 0 || (p.deliveredBySize[z] ?? 0) > 0)) fail(`النمرة ${z} عليها قص؛ ما فيك تشيلها`);
    }
    if (order.status === 'cancelled' && order.deliveries.some((d) => d.invoiceId)) fail('على الطلبية تسليمات مفوترة');
    this.emit({ type: 'workorder.saved', order });
    return order;
  }

  private workOrder(id: string): WorkOrder {
    const o = this.state.workOrders[id] ?? fail('الطلبية غير موجودة');
    if (o.status === 'cancelled') fail('الطلبية ملغاة');
    return o;
  }

  /** تسجيل مدّ وقص: كم مدة أعطى كل توب وكم انقص منه، وعدد القطع لكل نمرة. */
  addCut(orderId: string, cut: Omit<WorkCut, 'id'>): WorkOrder {
    const o = this.workOrder(orderId);
    if (piecesTotal(cut.pieces) <= 0) fail('اكتب عدد القطع المقصوصة');
    if (cut.rolls.length === 0) fail('اختار التوب اللي انمدّ');
    const order: WorkOrder = { ...o, cuts: [...o.cuts, { ...cut, id: crypto.randomUUID() }] };
    this.emit({ type: 'workorder.saved', order });
    return order;
  }

  removeCut(orderId: string, cutId: string): WorkOrder {
    const o = this.state.workOrders[orderId] ?? fail('الطلبية غير موجودة');
    const order: WorkOrder = { ...o, cuts: o.cuts.filter((c) => c.id !== cutId) };
    this.emit({ type: 'workorder.saved', order });
    return order;
  }

  /** حركة مرحلة: دخل الخياطة، خلص، أو تالف. */
  addStage(orderId: string, stage: Omit<WorkStage, 'id'>): WorkOrder {
    const o = this.workOrder(orderId);
    if (piecesTotal(stage.pieces) <= 0) fail('اكتب عدد القطع');
    const order: WorkOrder = { ...o, stages: [...o.stages, { ...stage, id: crypto.randomUUID() }] };
    this.emit({ type: 'workorder.saved', order });
    return order;
  }

  removeStage(orderId: string, stageId: string): WorkOrder {
    const o = this.state.workOrders[orderId] ?? fail('الطلبية غير موجودة');
    const order: WorkOrder = { ...o, stages: o.stages.filter((s) => s.id !== stageId) };
    this.emit({ type: 'workorder.saved', order });
    return order;
  }

  /** مصروف على الطلبية: سند دفع من الصندوق، على حساب الزبون (زيادة عليه) أو على الورشة. */
  addWorkExpense(orderId: string, e: { date: string; kind: string; description?: string; amount: number; billTo: 'customer' | 'workshop'; cashAccountId?: string }): WorkOrder {
    const o = this.workOrder(orderId);
    if (!e.kind.trim()) fail('اكتب نوع المصروف');
    const entry = this.postVoucher({
      kind: 'payment',
      date: e.date,
      amount: e.amount,
      currency: o.currency,
      ...(e.billTo === 'customer' ? { partyId: o.partyId } : { accountId: SYSTEM_ACCOUNTS.consumption }),
      memo: `${e.kind}${e.description ? ` — ${e.description}` : ''} (طلبية إنتاج ${o.number}${e.billTo === 'customer' ? '، على الزبون' : ''})`,
      ...(e.cashAccountId ? { cashAccountId: e.cashAccountId } : {}),
      createdBy: this.actor,
    });
    const fresh = this.state.workOrders[orderId]!;
    const order: WorkOrder = {
      ...fresh,
      expenses: [...fresh.expenses, { id: crypto.randomUUID(), date: e.date, kind: e.kind.trim(), ...(e.description ? { description: e.description } : {}), amount: e.amount, billTo: e.billTo, entryId: entry.id }],
    };
    this.emit({ type: 'workorder.saved', order });
    return order;
  }

  /** إلغاء مصروف: سند عكسي ويضل ظاهر كملغى. */
  removeWorkExpense(orderId: string, expenseId: string, date: string): WorkOrder {
    const o = this.state.workOrders[orderId] ?? fail('الطلبية غير موجودة');
    const e = o.expenses.find((x) => x.id === expenseId) ?? fail('المصروف غير موجود');
    if (!this.state.voided[e.entryId]) this.voidEntry(e.entryId, date);
    return this.state.workOrders[orderId]!;
  }

  /** إضافة أو خصم على حساب صاحب الشغل حسب الاتفاق. */
  addWorkAdjustment(partyId: string, a: { date: string; amount: number; direction: 'add' | 'deduct'; note: string; orderId?: string; currency?: string }): JournalEntry {
    const party = this.state.parties[partyId] ?? fail('الزبون غير موجود');
    if (!(a.amount > 0) || !Number.isSafeInteger(a.amount)) fail('المبلغ يجب أن يكون أكبر من صفر');
    if (!a.note.trim()) fail('اكتب سبب الإضافة أو الخصم');
    const o = a.orderId ? this.state.workOrders[a.orderId] : undefined;
    const fx = { currency: a.currency ?? o?.currency ?? this.base.code };
    const add = a.direction === 'add';
    return this.postEntry({
      date: a.date,
      memo: `${add ? 'إضافة' : 'خصم'} على حساب الشغل: ${a.note.trim()}${o ? ` (طلبية ${o.number})` : ''}`,
      lines: [
        { accountId: SYSTEM_ACCOUNTS.customers, ...(add ? { debit: a.amount } : { credit: a.amount }), ...fx, partyId: party.id },
        { accountId: SYSTEM_ACCOUNTS.serviceRevenue, ...(add ? { credit: a.amount } : { debit: a.amount }), ...fx },
      ],
      source: { type: 'work-adjust', id: crypto.randomUUID() },
      createdBy: this.actor,
    });
  }

  private workInvoice(o: WorkOrder, pieces: Record<string, number>, number: number, opts: { date: string; paid?: number; cashAccountId?: string; rate?: number }): Invoice {
    const qty = piecesTotal(pieces);
    const sizes = o.sizes.filter((z) => (pieces[z] ?? 0) > 0).map((z) => `${z}: ${pieces[z]}`).join('، ');
    return this.postInvoice({
      kind: 'sale',
      date: opts.date,
      partyId: o.partyId,
      currency: o.currency,
      lines: [{ description: `أجرة خياطة ${o.model}${o.modelCode ? ` (${o.modelCode})` : ''} — ${sizes}`, qty, price: o.pieceRate }],
      paid: opts.paid ?? 0,
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      ...(opts.rate ? { rate: opts.rate } : {}),
      notes: `طلبية إنتاج رقم ${o.number} — تسليم رقم ${number}`,
      source: { type: 'workorder', id: o.id },
    });
  }

  /** تسليم دفعة قطع للزبون، ومعها فاتورة بالأجرة إذا بدك. */
  deliverWork(orderId: string, opts: WorkDeliverOptions): { order: WorkOrder; invoice?: Invoice } {
    const o = this.workOrder(orderId);
    if (piecesTotal(opts.pieces) <= 0) fail('اكتب عدد القطع المسلّمة');
    const number = (this.state.counters['workDelivery'] ?? 0) + 1;
    const invoice = opts.invoice ? this.workInvoice(o, opts.pieces, number, opts) : undefined;
    const fresh = this.state.workOrders[orderId]!;
    const order: WorkOrder = {
      ...fresh,
      deliveries: [...fresh.deliveries, { id: crypto.randomUUID(), number, date: opts.date, pieces: opts.pieces, ...(invoice ? { invoiceId: invoice.id } : {}), ...(opts.notes ? { notes: opts.notes } : {}) }],
    };
    const p = workOrderProgress(this.state, order);
    if (opts.close || (p.planned > 0 && p.delivered >= p.planned)) order.status = 'done';
    this.emit({ type: 'workorder.saved', order });
    return { order, ...(invoice ? { invoice } : {}) };
  }

  /** فوترة دفعة تسليم سابقة ما انفوترت. */
  invoiceDelivery(orderId: string, deliveryId: string, opts: { date: string; paid?: number; cashAccountId?: string; rate?: number }): Invoice {
    const o = this.state.workOrders[orderId] ?? fail('الطلبية غير موجودة');
    const d = o.deliveries.find((x) => x.id === deliveryId) ?? fail('الدفعة غير موجودة');
    if (d.invoiceId && !this.state.invoices.find((i) => i.id === d.invoiceId)?.voidEntryId) fail('الدفعة مفوترة مسبقاً');
    const invoice = this.workInvoice(o, d.pieces, d.number, opts);
    const fresh = this.state.workOrders[orderId]!;
    this.emit({ type: 'workorder.saved', order: { ...fresh, deliveries: fresh.deliveries.map((x) => (x.id === deliveryId ? { ...x, invoiceId: invoice.id } : x)) } });
    return invoice;
  }
}

export interface InstallmentDraft {
  id?: string;
  partyId: string;
  date: string;
  currency?: string;
  invoiceId?: string;
  principal: number;
  markup?: number;
  markupPercent?: number;
  count?: number;
  firstDue?: string;
  everyMonths?: number;
  schedule?: { due: string; amount: number }[];
  guarantor?: string;
  guarantorPhone?: string;
  notes?: string;
}

export interface TradeInDraft {
  date: string;
  partyId: string;
  currency?: string;
  rate?: number;
  warehouseId?: string;
  sale: InvoiceLineDraft[];
  tradeIn: InvoiceLineDraft[];
  received?: number; // المقبوض من الزبون (سالب = دفعنا له)
  cashAccountId?: string;
}

export type WorkOrderDraft = Omit<WorkOrder, 'number' | 'cuts' | 'stages' | 'expenses' | 'deliveries'> & { number?: number };

export interface WorkDeliverOptions {
  date: string;
  pieces: Record<string, number>;
  invoice?: boolean;
  paid?: number;
  cashAccountId?: string;
  rate?: number;
  notes?: string;
  close?: boolean;
}

export type QuoteDraft = Omit<Quote, 'number' | 'invoiceId' | 'createdBy'> & { number?: number };

export type TailorOrderDraft = Omit<TailorOrder, 'number' | 'deposits' | 'invoiceId'> & { number?: number };

export type SiteJobDraft = Omit<SiteJob, 'number' | 'deposits' | 'invoiceId' | 'costs'> & { number?: number; costs?: SiteJob['costs'] };

export interface TailorDeliverOptions {
  date: string;
  paid?: number; // الافتراضي: المتبقي بعد العربون
  cashAccountId?: string;
  warehouseId?: string;
  discount?: number;
  taxIds?: string[];
  rate?: number;
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
  // نعدّل فقط أسطر العملة الأجنبية (أسطر العملة الأساسية مبالغها دقيقة)
  const foreign = lines.filter((l) => l.rate !== 1);
  const grow = diff > 0 ? 'baseCredit' : 'baseDebit';
  const shrink = diff > 0 ? 'baseDebit' : 'baseCredit';
  const target = foreign.filter((l) => l[grow] > 0).sort((a, b) => b[grow] - a[grow])[0];
  if (target) {
    target[grow] += Math.abs(diff);
    return;
  }
  const other = foreign.filter((l) => l[shrink] > Math.abs(diff)).sort((a, b) => b[shrink] - a[shrink])[0];
  if (other) other[shrink] -= Math.abs(diff);
}
