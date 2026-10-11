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

// ───────────── الشركة والإعدادات ─────────────

/** نوع النشاط يحدد الوحدات الظاهرة في البرنامج وقالب دليل الحسابات. */
export type Activity =
  | 'general'
  | 'auto'
  | 'supermarket'
  | 'pharmacy'
  | 'restaurant'
  | 'clothing'
  | 'mobile'
  | 'building'
  | 'butcher'
  | 'bakery'
  | 'wholesale'
  | 'clinic';

export type Paper = 'a4' | 'a5' | '80mm' | '58mm';

export interface PrintSettings {
  logo?: string; // data URL (صغير)
  header?: string; // سطر إضافي تحت اسم الشركة
  footer?: string; // نص أسفل الفاتورة
  showUsdEquivalent?: boolean; // إظهار المقابل بالدولار
  showAmountInWords?: boolean; // التفقيط
  invoicePaper?: Paper;
  receiptPaper?: Paper;
  copies?: number;
  printers?: Partial<Record<'invoice' | 'receipt' | 'kitchen' | 'label', string>>;
}

/** إعدادات باركود الميزان (مواد الوزن): 2 + رمز المادة + الوزن/السعر + رقم تحقق. */
export interface ScaleSettings {
  prefix: string; // مثلاً "21"
  itemDigits: number; // عدد خانات رمز المادة
  valueDigits: number; // عدد خانات القيمة
  valueType: 'weight' | 'price';
  valueDecimals: number; // 3 للوزن بالغرام ← كيلو
}

export interface CompanyInfo {
  name: string;
  activity?: Activity;
  baseCurrency: string;
  fiscalYearStart: string; // MM-DD
  taxNumber?: string;
  address?: string;
  phone?: string;
  lockedUntil?: string; // لا تُقبل أي حركة بتاريخ أقدم أو يساوي هذا التاريخ (فترة مقفلة)
  allowNegativeStock?: boolean;
  print?: PrintSettings;
  scale?: ScaleSettings;
}

// ───────────── المستخدمون والصلاحيات ─────────────

export type Role = 'owner' | 'manager' | 'accountant' | 'cashier' | 'storekeeper' | 'technician' | 'viewer';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  extra?: string[]; // صلاحيات إضافية فوق الدور
  denied?: string[]; // صلاحيات محجوبة من الدور
  active: boolean;
}

// ───────────── التجارة: العملاء والموردون، المواد، المستودعات، الفواتير ─────────────

export type PartyKind = 'customer' | 'supplier' | 'both';
export type PriceTier = 'retail' | 'wholesale' | 'special';

export interface Party {
  id: string;
  kind: PartyKind;
  name: string;
  phone?: string;
  address?: string;
  creditLimit?: number; // بأصغر وحدة من العملة الأساسية
  priceTier?: PriceTier;
  notes?: string;
  archived?: boolean;
}

/**
 * stock: مادة لها مخزون. service: خدمة بدون مخزون.
 * composite: صنف يُحضَّر عند البيع من مكوّنات (وجبة، مشروب) — يُنقص المكوّنات من المخزون.
 */
export type ItemKind = 'stock' | 'service' | 'composite';

export interface ItemUnit {
  name: string; // كرتونة، علبة، كيس...
  factor: number; // كم وحدة أساسية فيها
  price?: number; // سعر مبيع خاص بهذه الوحدة (بعملة سعر المادة)
  barcode?: string;
}

export interface RecipeLine {
  itemId: string;
  qty: number; // بالوحدة الأساسية للمكوّن، لكل وحدة واحدة من الصنف
}

export interface Item {
  id: string;
  code: string; // رمز داخلي
  name: string;
  kind: ItemKind;
  unit: string; // الوحدة الأساسية: قطعة، كيلو، لتر...
  units?: ItemUnit[]; // وحدات إضافية بمعامل تحويل
  barcode?: string;
  category?: string;
  brand?: string; // الماركة/المنشأ
  partNumber?: string; // رقم القطعة (OEM)
  compat?: string; // السيارات/الأجهزة المتوافقة
  location?: string; // مكان المادة في المحل/المستودع
  price: number; // سعر المبيع (مفرق) بأصغر وحدة من priceCurrency
  wholesalePrice?: number;
  specialPrice?: number;
  priceCurrency: string;
  minStock?: number;
  trackExpiry?: boolean; // دفعات وتواريخ صلاحية (صيدلية، مواد غذائية)
  trackSerial?: boolean; // أرقام تسلسلية / IMEI (موبايلات وإلكترونيات)
  weighed?: boolean; // يُباع بالوزن عبر باركود الميزان
  recipe?: RecipeLine[]; // مكوّنات الصنف المركّب أو وصفة الإنتاج
  group?: string; // موديل يجمع المقاسات والألوان (ألبسة)
  attributes?: Record<string, string>; // مقاس، لون، مادة فعالة، شكل صيدلاني...
  warrantyMonths?: number;
  archived?: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
}

export interface Batch {
  batch: string;
  expiry?: string; // YYYY-MM-DD
  warehouseId: string;
  qty: number;
}

export interface StockLevel {
  qty: Record<string, number>; // الكمية في كل مستودع (بالوحدة الأساسية)
  totalQty: number;
  value: number; // قيمة المخزون بالعملة الأساسية (للتكلفة الوسطية)
  lastCost: number; // آخر تكلفة للوحدة بالعملة الأساسية
  batches?: Record<string, Batch>; // المفتاح: مستودع|دفعة
  serials?: Record<string, string>; // الرقم التسلسلي ← المستودع
}

export type InvoiceKind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return';

/** كمية مسحوبة من دفعة معيّنة (تُحسب عند الترحيل لتُعكس بدقة عند الإلغاء). */
export interface BatchMove {
  batch: string;
  expiry?: string;
  qty: number; // بالوحدة الأساسية
}

export interface ComponentMove {
  itemId: string;
  qty: number; // بالوحدة الأساسية للمكوّن
  cost: number; // بالعملة الأساسية
}

export interface InvoiceLine {
  itemId: string | null; // null = خدمة/أجور بدون مادة
  description: string;
  qty: number; // بالوحدة المختارة
  unit?: string; // اسم الوحدة إن لم تكن الأساسية
  factor?: number; // معامل التحويل للوحدة الأساسية (1 افتراضياً)
  price: number; // سعر الوحدة المختارة بأصغر وحدة من عملة الفاتورة
  discount: number; // خصم السطر بأصغر وحدة
  cost?: number; // تكلفة السطر بالعملة الأساسية (تُحسب عند الترحيل)
  batches?: BatchMove[];
  serials?: string[];
  components?: ComponentMove[]; // للأصناف المركّبة
  note?: string;
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
  salesman?: string;
  notes?: string;
  source?: { type: string; id: string };
  entryId: string;
  voidEntryId?: string;
  createdAt: string;
  createdBy: string;
}

// ───────────── عمليات المخزون ─────────────

export type AdjustmentKind = 'opening' | 'count' | 'damage' | 'consumption';

export interface AdjustmentLine {
  itemId: string;
  qty: number; // فرق الكمية بالوحدة الأساسية (موجب = زيادة)
  cost: number; // فرق القيمة بالعملة الأساسية (بنفس الإشارة)
  batch?: string;
  expiry?: string;
  serials?: string[];
}

export interface StockAdjustment {
  id: string;
  number: number;
  kind: AdjustmentKind;
  date: string;
  warehouseId: string;
  lines: AdjustmentLine[];
  memo: string;
  entryId?: string;
  createdBy: string;
}

export interface StockTransfer {
  id: string;
  number: number;
  date: string;
  from: string;
  to: string;
  lines: { itemId: string; qty: number; batches?: BatchMove[]; serials?: string[] }[];
  memo: string;
  createdBy: string;
}

/** تصنيع: تحويل مواد أولية إلى منتج جاهز (مخبز، حلويات). */
export interface Production {
  id: string;
  number: number;
  date: string;
  warehouseId: string;
  outputs: { itemId: string; qty: number; cost: number; batch?: string; expiry?: string }[];
  inputs: { itemId: string; qty: number; cost: number; batches?: BatchMove[] }[];
  memo: string;
  createdBy: string;
}

// ───────────── الصيانة: السيارات والأجهزة ─────────────

export type AssetKind = 'vehicle' | 'device';

export interface Vehicle {
  id: string;
  partyId: string;
  kind?: AssetKind; // الافتراضي: سيارة
  plate: string; // رقم اللوحة (للسيارات)
  make: string; // الشركة الصانعة / الماركة
  model: string;
  year?: number;
  vin?: string; // رقم الشاسيه أو IMEI/الرقم التسلسلي للجهاز
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

// ───────────── المطاعم ─────────────

export interface DiningTable {
  id: string;
  name: string;
  area?: string;
  seats?: number;
  archived?: boolean;
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'open' | 'closed' | 'cancelled';

export interface OrderLine {
  id: string;
  itemId: string;
  qty: number;
  price: number;
  note?: string;
  sent?: boolean; // أُرسل للمطبخ
}

export interface Order {
  id: string;
  number: number;
  type: OrderType;
  tableId: string | null;
  partyId?: string | null;
  status: OrderStatus;
  lines: OrderLine[];
  waiter?: string;
  guests?: number;
  openedAt: string;
  closedAt?: string;
  invoiceId?: string;
}

// ───────────── المواعيد (عيادات، صالونات) ─────────────

export type AppointmentStatus = 'booked' | 'arrived' | 'done' | 'cancelled' | 'no_show';

export interface Appointment {
  id: string;
  partyId: string;
  date: string;
  time: string; // HH:MM
  minutes: number;
  itemId?: string; // الخدمة
  staff?: string;
  status: AppointmentStatus;
  notes?: string;
  invoiceId?: string;
}

// ───────────── الحالة الكاملة والأحداث ─────────────

export interface CompanyState {
  info: CompanyInfo | null;
  currencies: Record<string, Currency>;
  accounts: Record<string, Account>;
  rates: ExchangeRate[];
  taxes: Record<string, Tax>;
  entries: JournalEntry[];
  voided: Record<string, string>; // معرّف القيد الأصلي ← معرّف القيد العكسي
  users: Record<string, User>;
  parties: Record<string, Party>;
  items: Record<string, Item>;
  warehouses: Record<string, Warehouse>;
  stock: Record<string, StockLevel>;
  invoices: Invoice[];
  adjustments: StockAdjustment[];
  transfers: StockTransfer[];
  productions: Production[];
  vehicles: Record<string, Vehicle>;
  repairs: Record<string, RepairOrder>;
  tables: Record<string, DiningTable>;
  orders: Record<string, Order>;
  appointments: Record<string, Appointment>;
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
  | { type: 'period.locked'; until: string; entry?: JournalEntry }
  | { type: 'user.saved'; user: User }
  | { type: 'party.saved'; party: Party }
  | { type: 'item.saved'; item: Item }
  | { type: 'warehouse.saved'; warehouse: Warehouse }
  | { type: 'invoice.posted'; invoice: Invoice; entry: JournalEntry }
  | { type: 'invoice.voided'; invoiceId: string; entry: JournalEntry }
  | { type: 'stock.adjusted'; adjustment: StockAdjustment; entry?: JournalEntry }
  | { type: 'stock.transferred'; transfer: StockTransfer }
  | { type: 'production.posted'; production: Production }
  | { type: 'vehicle.saved'; vehicle: Vehicle }
  | { type: 'repair.saved'; repair: RepairOrder }
  | { type: 'table.saved'; table: DiningTable }
  | { type: 'order.saved'; order: Order }
  | { type: 'appointment.saved'; appointment: Appointment };
