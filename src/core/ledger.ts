import { randomUUID } from 'node:crypto';
import { convertMinor, type Currency } from './money';
import type {
  Account,
  CompanyEvent,
  CompanyInfo,
  CompanyState,
  ExchangeRate,
  JournalEntry,
  JournalLine,
  RateKind,
  Tax,
} from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyState(): CompanyState {
  return { info: null, currencies: {}, accounts: {}, rates: [], taxes: {}, entries: [], voided: {} };
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
}

function validateEntry(state: CompanyState, entry: JournalEntry): void {
  const base = state.info?.baseCurrency ?? fail('يجب إنشاء الشركة أولاً');
  if (!DATE_RE.test(entry.date)) fail(`تاريخ غير صالح: ${entry.date}`);
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
    if (line.currency === base && line.rate !== 1) fail(`السطر ${n}: سعر صرف العملة الأساسية يجب أن يكون 1`);
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

export function validateEvent(state: CompanyState, event: CompanyEvent): void {
  if (event.type !== 'company.created' && !state.info) fail('يجب إنشاء الشركة أولاً');
  switch (event.type) {
    case 'company.created':
      if (state.info) fail('الشركة منشأة مسبقاً');
      if (!event.info.name.trim()) fail('اسم الشركة مطلوب');
      if (!event.currencies.some((c) => c.code === event.info.baseCurrency)) fail('العملة الأساسية غير موجودة');
      return;
    case 'company.updated':
      if (event.info.baseCurrency && event.info.baseCurrency !== state.info!.baseCurrency) {
        fail('لا يمكن تغيير العملة الأساسية بعد إنشاء الشركة');
      }
      return;
    case 'currency.saved':
      if (!/^[A-Z]{3}$/.test(event.currency.code)) fail('رمز العملة يجب أن يكون 3 أحرف لاتينية كبيرة');
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
  }
  return state;
}

function hasMovements(state: CompanyState, accountId: string): boolean {
  return state.entries.some((e) => e.lines.some((l) => l.accountId === accountId));
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
}

export interface EntryDraft {
  date: string;
  memo: string;
  lines: LineDraft[];
  source?: { type: string; id: string };
  createdBy?: string;
}

/** يستقبل الحدث ليحفظه (على الملف مثلاً) قبل اعتماده في الذاكرة. */
export type EventSink = (event: CompanyEvent) => void;

export class Ledger {
  constructor(
    private readonly sink: EventSink,
    public readonly state: CompanyState = emptyState(),
  ) {}

  /** يتحقق من الحدث، ثم يحفظه، ثم يطبّقه. إن فشل الحفظ تبقى الحالة كما هي. */
  private emit(event: CompanyEvent): void {
    validateEvent(this.state, event);
    this.sink(event);
    applyEvent(this.state, event);
  }

  get base(): Currency {
    const code = this.state.info?.baseCurrency ?? fail('يجب إنشاء الشركة أولاً');
    return this.state.currencies[code]!;
  }

  createCompany(info: CompanyInfo, currencies: Currency[], accounts: Account[] = [], taxes: Tax[] = []): void {
    this.emit({ type: 'company.created', info, currencies });
    // الآباء قبل الأبناء
    const sorted = [...accounts].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
    for (const account of sorted) this.saveAccount(account);
    for (const tax of taxes) this.saveTax(tax);
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

  /** آخر سعر صرف مسجّل بتاريخ القيد أو قبله. */
  rateFor(currency: string, date: string, kind: RateKind = 'market'): number | undefined {
    if (currency === this.base.code) return 1;
    let best: ExchangeRate | undefined;
    for (const r of this.state.rates) {
      if (r.currency === currency && r.kind === kind && r.date <= date && (!best || r.date > best.date)) best = r;
    }
    return best?.rate;
  }

  postEntry(draft: EntryDraft): JournalEntry {
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
      };
    });
    absorbRounding(lines);

    const entry: JournalEntry = {
      id: randomUUID(),
      number: this.state.entries.length + 1,
      date: draft.date,
      memo: draft.memo,
      lines,
      ...(draft.source ? { source: draft.source } : {}),
      createdAt: new Date().toISOString(),
      createdBy: draft.createdBy ?? 'system',
    };
    this.emit({ type: 'entry.posted', entry });
    return entry;
  }

  /** لا يُحذف أي قيد؛ الإلغاء يكون بقيد عكسي يحفظ أثر العملية. */
  voidEntry(entryId: string, date: string, createdBy = 'system'): JournalEntry {
    const original = this.state.entries.find((e) => e.id === entryId) ?? fail('القيد غير موجود');
    const entry: JournalEntry = {
      id: randomUUID(),
      number: this.state.entries.length + 1,
      date,
      memo: `إلغاء القيد رقم ${original.number}`,
      lines: original.lines.map((l) => ({
        ...l,
        debit: l.credit,
        credit: l.debit,
        baseDebit: l.baseCredit,
        baseCredit: l.baseDebit,
      })),
      voidOf: original.id,
      createdAt: new Date().toISOString(),
      createdBy,
    };
    this.emit({ type: 'entry.posted', entry });
    return entry;
  }
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
