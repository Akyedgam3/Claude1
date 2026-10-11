import type { Currency } from './money';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string; // رمز الحساب، مثلاً "1101"
  name: string;
  type: AccountType;
  parentId: string | null;
  isGroup: boolean; // حساب تجميعي (لا يُرحَّل عليه مباشرة)
  currency: string | null; // عملة ثابتة للحساب، أو null لأي عملة
  archived?: boolean;
}

export type RateKind = 'official' | 'market';

export interface ExchangeRate {
  date: string; // YYYY-MM-DD
  currency: string;
  kind: RateKind;
  rate: number; // كم وحدة من العملة الأساسية تساوي وحدة واحدة
}

export interface Tax {
  id: string;
  name: string;
  percent: number; // النسبة المئوية، مثلاً 5 تعني 5%
  accountId: string; // حساب الضريبة المستحقة
  active: boolean;
}

export interface JournalLine {
  accountId: string;
  currency: string;
  rate: number; // سعر الصرف المستخدم وقت الحركة
  debit: number; // بأصغر وحدة من عملة السطر
  credit: number;
  baseDebit: number; // المقابل بالعملة الأساسية
  baseCredit: number;
  memo?: string;
  costCenter?: string;
  partyId?: string; // العميل/المورد المرتبط بالسطر (لكشوف الحساب والذمم)
}

export interface JournalEntry {
  id: string;
  number: number; // رقم القيد التسلسلي
  date: string;
  memo: string;
  lines: JournalLine[];
  source?: { type: string; id: string }; // المستند الذي ولّد القيد (فاتورة، سند...)
  voidOf?: string; // إن كان قيداً عكسياً لإلغاء قيد آخر
  createdAt: string;
  createdBy: string;
}

/** نوع النشاط يحدد الوحدات الظاهرة في البرنامج وقالب دليل الحسابات. */
export type Activity = 'general' | 'auto';

export interface CompanyInfo {
  name: string;
  activity?: Activity;
  baseCurrency: string;
  fiscalYearStart: string; // MM-DD
  taxNumber?: string;
  address?: string;
  phone?: string;
}

// ───────────── التجارة: العملاء والموردون، المواد، المستودعات، الفواتير ─────────────

export type PartyKind = 'customer' | 'supplier' | 'both';

export interface Party {
  id: string;
  kind: PartyKind;
  name: string;
  phone?: string;
  address?: string;
  creditLimit?: number; // بأصغر وحدة من العملة الأساسية
  notes?: string;
  archived?: boolean;
}

export type ItemKind = 'stock' | 'service';

export interface Item {
  id: string;
  code: string; // رمز داخلي
  name: string;
  kind: ItemKind;
  unit: string; // قطعة، لتر، طقم...
  barcode?: string;
  category?: string;
  brand?: string; // الماركة/المنشأ
  partNumber?: string; // رقم القطعة (OEM)
  compat?: string; // السيارات المتوافقة، مثلاً "كيا ريو 2012-2016"
  location?: string; // مكان القطعة في المحل/المستودع (رف A3)
  price: number; // سعر المبيع بأصغر وحدة من priceCurrency
  wholesalePrice?: number;
  priceCurrency: string;
  minStock?: number;
  archived?: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
}

export interface StockLevel {
  qty: Record<string, number>; // الكمية في كل مستودع
  totalQty: number;
  value: number; // قيمة المخزون بالعملة الأساسية (للتكلفة الوسطية)
  lastCost: number; // آخر تكلفة للوحدة بالعملة الأساسية
}

export type InvoiceKind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return';

export interface InvoiceLine {
  itemId: string | null; // null = خدمة/أجور بدون مادة
  description: string;
  qty: number;
  price: number; // سعر الوحدة بأصغر وحدة من عملة الفاتورة
  discount: number; // خصم السطر بأصغر وحدة
  cost?: number; // تكلفة السطر بالعملة الأساسية (تُحسب عند الترحيل)
}

export interface Invoice {
  id: string;
  kind: InvoiceKind;
  number: number;
  date: string;
  partyId: string | null; // null = زبون نقدي
  currency: string;
  rate: number;
  warehouseId: string;
  lines: InvoiceLine[];
  discount: number; // خصم على الفاتورة
  taxIds: string[];
  taxLines: { taxId: string; amount: number }[];
  subtotal: number;
  taxTotal: number;
  total: number;
  paid: number; // المدفوع نقداً عند الفاتورة
  cashAccountId: string;
  notes?: string;
  source?: { type: string; id: string };
  entryId: string;
  voidEntryId?: string;
  createdAt: string;
  createdBy: string;
}

// ───────────── وحدة السيارات: المركبات وأوامر الإصلاح ─────────────

export interface Vehicle {
  id: string;
  partyId: string;
  plate: string; // رقم اللوحة
  make: string; // الشركة الصانعة
  model: string;
  year?: number;
  vin?: string; // رقم الشاسيه
  engine?: string;
  color?: string;
  notes?: string;
}

export type RepairStatus = 'open' | 'in_progress' | 'done' | 'invoiced' | 'cancelled';

export interface RepairOrder {
  id: string;
  number: number;
  vehicleId: string;
  partyId: string;
  date: string;
  status: RepairStatus;
  odometer?: number; // العدّاد
  complaint: string; // شكوى الزبون
  diagnosis?: string; // التشخيص
  technician?: string;
  currency: string;
  parts: { itemId: string; qty: number; price: number }[];
  labor: { description: string; amount: number }[];
  invoiceId?: string;
}

export interface CompanyState {
  info: CompanyInfo | null;
  currencies: Record<string, Currency>;
  accounts: Record<string, Account>;
  rates: ExchangeRate[];
  taxes: Record<string, Tax>;
  entries: JournalEntry[];
  voided: Record<string, string>; // معرّف القيد الأصلي ← معرّف القيد العكسي
  parties: Record<string, Party>;
  items: Record<string, Item>;
  warehouses: Record<string, Warehouse>;
  stock: Record<string, StockLevel>;
  invoices: Invoice[];
  vehicles: Record<string, Vehicle>;
  repairs: Record<string, RepairOrder>;
  counters: Record<string, number>; // آخر رقم لكل نوع مستند
}

// كل تغيير على بيانات الشركة يُسجَّل كحدث في سجل لا يُعدَّل (append-only).
export type CompanyEvent =
  | { type: 'company.created'; info: CompanyInfo; currencies: Currency[] }
  | { type: 'company.updated'; info: Partial<CompanyInfo> }
  | { type: 'currency.saved'; currency: Currency }
  | { type: 'account.saved'; account: Account }
  | { type: 'rate.set'; rate: ExchangeRate }
  | { type: 'tax.saved'; tax: Tax }
  | { type: 'entry.posted'; entry: JournalEntry }
  | { type: 'party.saved'; party: Party }
  | { type: 'item.saved'; item: Item }
  | { type: 'warehouse.saved'; warehouse: Warehouse }
  | { type: 'invoice.posted'; invoice: Invoice; entry: JournalEntry }
  | { type: 'invoice.voided'; invoiceId: string; entry: JournalEntry }
  | { type: 'vehicle.saved'; vehicle: Vehicle }
  | { type: 'repair.saved'; repair: RepairOrder };
