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
  | 'sweets'
  | 'wholesale'
  | 'clinic'
  | 'tailor'
  | 'gypsum';

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
  template?: 'modern' | 'classic' | 'minimal'; // تصميم الفاتورة
  color?: string; // لون الشركة في الفواتير (#rrggbb)
  showQr?: boolean; // رمز QR بملخص الفاتورة (افتراضياً نعم)
  showStamp?: boolean; // ختم مدفوعة / آجل / ملغاة (افتراضياً نعم)
  showSignatures?: boolean; // خانات التوقيع
  terms?: string; // الشروط والأحكام أسفل الفاتورة
  showPreviousBalance?: boolean; // الحساب السابق والرصيد بعد الفاتورة (افتراضياً نعم)
  showInvoiceProfit?: boolean; // مربع ربح الفاتورة وقت البيع، لأصحاب صلاحية التكلفة (افتراضياً نعم)
  receipt?: ReceiptSettings; // تصميم الإيصال الحراري (80/58mm)
}

/** تصميم الإيصال الحراري: كل خانة إلها مفتاح إظهار/إخفاء، والافتراضي إظهار. */
export interface ReceiptSettings {
  logo?: 'none' | 'small' | 'banner'; // بانر = الشعار بعرض الورقة متل المطاعم
  showName?: boolean;
  showContact?: boolean; // العنوان والهاتف
  header?: string; // أسطر تحت الاسم
  title?: string; // بدل «فاتورة مبيع»
  showNumber?: boolean;
  showDate?: boolean;
  showTime?: boolean;
  showTable?: boolean;
  showOrderType?: boolean; // سفري / توصيل
  showCaptain?: boolean;
  showGuests?: boolean;
  showCashier?: boolean;
  showCustomer?: boolean;
  showPrice?: boolean; // عمود سعر الوحدة
  grid?: boolean; // جدول بخطوط متل الإيصالات الكلاسيكية
  fontSize?: 'sm' | 'md' | 'lg';
  contactLabel?: string; // «للتوصيات والاستفسار»
  contactPhone?: string;
  thanks?: string; // «نشكر لكم زيارتكم»
  footer?: string; // نص حر بالآخر
  showQr?: boolean; // افتراضياً لا
  displayWelcome?: string; // رسالة شاشة الزبون وقت ما في طلب
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
  customize?: ActivityCustomization;
}

/** تخصيص النشاط من قبل المستخدم: تشغيل/إيقاف ميزات، وقوائم خاصة به. */
export interface ActivityCustomization {
  featuresOn?: string[]; // ميزات إضافية فوق ميزات النشاط
  featuresOff?: string[]; // ميزات النشاط التي لا يريدها
  categories?: string[]; // التصنيفات المقترحة (تحل محل قائمة النشاط)
  units?: string[]; // الوحدات المقترحة
  attributes?: string[]; // حقول إضافية للمادة (مقاس، لون، بلد المنشأ...)
  itemLabel?: string; // اسم المادة المفرد (قطعة، صنف، قماش...)
  itemsLabel?: string;
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
  measurements?: Record<string, string>; // قياسات الزبون (خياطة): اسم القياس ← القيمة
  debtDue?: string; // موعد السداد المتّفق عليه (قسم الديون)
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
  batches?: BatchMove[]; // دفعات المكوّن (للمكوّنات ذات الصلاحية)
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
  /** فاتورة معدّلة: رقم (id) الفاتورة الملغاة اللي حلّت محلها (بنفس الرقم). */
  replaces?: string;
  entryId: string;
  voidEntryId?: string;
  /** انحذفت لأنها انعملت بالغلط (إلغاء بتاريخها، وبتختفي من السجل). */
  deleted?: boolean;
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
  sentAt?: string; // وقت الإرسال للمطبخ
  ready?: boolean; // جهز بالمطبخ
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
  discount?: number; // خصم على الطلب بأصغر وحدة
  servicePercent?: number; // نسبة خدمة الصالة
  deliveryFee?: number; // أجور التوصيل
  customerName?: string; // للسفري والتوصيل بدون حساب
  phone?: string;
  address?: string;
  notes?: string;
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

// ───────────── الخياطة والتفصيل ─────────────

export type TailorStatus = 'received' | 'cutting' | 'sewing' | 'fitting' | 'ready' | 'delivered' | 'cancelled';

export interface TailorGarment {
  description: string; // ثوب، بدلة، فستان، تقصير بنطال...
  qty: number;
  price: number; // أجرة الخياطة للقطعة بأصغر وحدة من عملة الطلب
  notes?: string; // تفاصيل الموديل
}

export interface TailorOrder {
  id: string;
  number: number;
  partyId: string;
  date: string; // تاريخ الاستلام
  dueDate?: string; // موعد التسليم
  fittingDate?: string; // موعد البروفة
  status: TailorStatus;
  currency: string;
  garments: TailorGarment[];
  fabrics: { itemId: string; qty: number; price: number }[]; // أقمشة ولوازم من المحل تُباع للزبون
  ownFabric?: string; // وصف قماش الزبون إن أحضره معه
  measurements: Record<string, string>; // نسخة القياسات وقت الطلب
  tailor?: string; // الخياط المسؤول
  notes?: string;
  deposits: { entryId: string; amount: number; date: string }[]; // العربون (سندات قبض)
  invoiceId?: string;
}

// ───────────── مشاريع التنفيذ (جبسين وديكور وما شابه): كشف بالمتر عند الزبون ─────────────

/** طريقة القياس: مساحة (طول × عرض)، طول (متر جر)، أو عدد. */
export type MeasureKind = 'area' | 'length' | 'count';

/** بند بالكشف: سقف الصالون، مرد جالس، مرد لف... */
export interface SiteJobLine {
  id: string;
  room: string; // الصالون، غرفة الضيوف، المطبخ...
  name: string; // سقف، مرد جالس، مرد لف، اسرب...
  kind: MeasureKind;
  length: number; // متر (أو العدد إذا kind = count)
  width?: number; // متر (للمساحة بس)
  /** معامل الحساب: المرد الجالس بينحسب نص (0.5)، العادي 1. */
  factor: number;
  /** سعر خاص لهالبند بأصغر وحدة (وإلا سعر المتر العام للمشروع). */
  price?: number;
  note?: string;
}

export type SiteJobStatus = 'survey' | 'quoted' | 'working' | 'done' | 'invoiced' | 'cancelled';

/** شريك / مساهم برأس مال الشركة. حركاته (إيداع وسحب وتوزيع أرباح) قيود محاسبية مصدرها partner. */
export interface Partner {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  /** نسبة الأرباح المتفق عليها (٪). إذا فاضية بتنحسب من نسبة رأس ماله. */
  profitPercent?: number;
  active: boolean;
  createdAt: string;
}

export interface SiteJob {
  id: string;
  number: number;
  partyId: string;
  date: string; // تاريخ الكشف
  title?: string; // اسم المشروع: بيت أبو محمد، محل...
  address?: string; // عنوان الشغل
  status: SiteJobStatus;
  currency: string;
  rate: number; // سعر المتر بأصغر وحدة من عملة المشروع
  lines: SiteJobLine[];
  extras: { description: string; amount: number }[]; // إضافات مقطوعة (إنارة، نقل، فك قديم...)
  discount?: number;
  /** تكاليف المشروع (مواد، عمال، نقل) لحساب الربح بس، ما بتنقيد بالحسابات. */
  costs: { description: string; amount: number }[];
  startDate?: string;
  endDate?: string;
  notes?: string;
  deposits: { entryId: string; amount: number; date: string }[]; // دفعات قبل الفوترة (سندات قبض)
  invoiceId?: string;
}

// ───────────── ورشة الإنتاج (قص وخياطة بالجملة لقماش الزبون) ─────────────

/** وحدة طول القماش: ياردة أو متر. الأطوال مخزنة بأجزاء المئة من الوحدة (أعداد صحيحة). */
export type LengthUnit = 'yd' | 'm';

/** توب قماش يجيبه الزبون للورشة. */
export interface FabricRoll {
  id: string;
  code: string; // رقم التوب المكتوب عليه
  partyId: string; // صاحب القماش
  receiptNo: number; // رقم سند استلام الأقمشة
  date: string; // تاريخ الاستلام
  fabric: string; // نوع القماش
  color?: string;
  unit: LengthUnit;
  length: number; // الطول عند الاستلام × 100
  widthCm?: number;
  notes?: string;
  returns: { date: string; length: number; note?: string }[]; // بواقي مُرجعة للزبون (بنفس وحدة التوب × 100)
}

export type WorkOrderStatus = 'open' | 'done' | 'cancelled';

/** مدّ وقص: كم مدة أعطى كل توب وكم انقص منه، وكم قطعة طلعت من كل نمرة. */
export interface WorkCut {
  id: string;
  date: string;
  rolls: { rollId: string; lays?: number; used: number }[]; // used بوحدة التوب × 100
  pieces: Record<string, number>;
  notes?: string;
}

/** حركة مرحلة: دخل الخياطة، خلص، أو تالف. */
export interface WorkStage {
  id: string;
  date: string;
  stage: 'sewing' | 'done' | 'damaged';
  pieces: Record<string, number>;
  note?: string;
}

/** مصروف على الطلبية (استيك، خيط، بطانة...) — على الزبون أو على الورشة. */
export interface WorkExpense {
  id: string;
  date: string;
  kind: string;
  description?: string;
  amount: number; // بأصغر وحدة من عملة الطلبية
  billTo: 'customer' | 'workshop';
  entryId: string; // سند الدفع
}

/** دفعة تسليم للزبون (قد تُفوتر أجرتها). */
export interface WorkDelivery {
  id: string;
  number: number;
  date: string;
  pieces: Record<string, number>;
  invoiceId?: string;
  notes?: string;
}

/** طلبية إنتاج: موديل بنمر وكميات وأجرة للقطعة ورسمة قص. */
export interface WorkOrder {
  id: string;
  number: number;
  partyId: string;
  date: string;
  dueDate?: string;
  model: string;
  modelCode?: string;
  sizes: string[];
  planned: Record<string, number>;
  unit?: LengthUnit; // وحدة طول الرسمة
  markerLength?: number; // طول الرسمة × 100
  ratio?: Record<string, number>; // كم قطعة من كل نمرة بالمدة الوحدة
  pieceRate: number; // أجرة القطعة بأصغر وحدة من العملة
  currency: string;
  status: WorkOrderStatus;
  notes?: string;
  cuts: WorkCut[];
  stages: WorkStage[];
  expenses: WorkExpense[];
  deliveries: WorkDelivery[];
}

// ───────────── التقسيط ─────────────

export type InstallmentStatus = 'active' | 'done' | 'cancelled';

/** خطة أقساط على زبون: جدول دفعات، وكل قسط مقبوض بسند قبض. */
export interface InstallmentPlan {
  id: string;
  number: number;
  partyId: string;
  date: string;
  currency: string;
  invoiceId?: string; // الفاتورة اللي انقسّطت
  principal: number; // المبلغ المقسّط (بعد الدفعة الأولى)
  markup: number; // زيادة التقسيط
  markupEntryId?: string;
  schedule: { due: string; amount: number }[];
  payments: { entryId: string; date: string; amount: number }[];
  guarantor?: string; // الكفيل
  guarantorPhone?: string;
  notes?: string;
  status: InstallmentStatus;
}

// ───────────── عروض الأسعار ─────────────

export type QuoteStatus = 'open' | 'accepted' | 'rejected' | 'converted';

export interface QuoteLine {
  itemId?: string | null;
  description: string;
  qty: number;
  unit?: string;
  price: number; // بأصغر وحدة من عملة العرض
  discount?: number;
}

/** عرض سعر للزبون: لا يمس الحسابات ولا المخزون حتى يتحول إلى فاتورة. */
export interface Quote {
  id: string;
  number: number;
  date: string;
  validUntil?: string;
  partyId: string | null;
  customerName?: string; // لزبون غير مسجّل
  currency: string;
  lines: QuoteLine[];
  discount: number;
  taxIds: string[];
  notes?: string;
  status: QuoteStatus;
  invoiceId?: string;
  createdBy?: string;
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
  tailorOrders: Record<string, TailorOrder>;
  siteJobs: Record<string, SiteJob>;
  partners: Record<string, Partner>;
  quotes: Record<string, Quote>;
  rolls: Record<string, FabricRoll>;
  workOrders: Record<string, WorkOrder>;
  installments: Record<string, InstallmentPlan>;
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
  | { type: 'invoice.voided'; invoiceId: string; entry: JournalEntry; deleted?: boolean }
  | { type: 'stock.adjusted'; adjustment: StockAdjustment; entry?: JournalEntry }
  | { type: 'stock.transferred'; transfer: StockTransfer }
  | { type: 'production.posted'; production: Production }
  | { type: 'vehicle.saved'; vehicle: Vehicle }
  | { type: 'repair.saved'; repair: RepairOrder }
  | { type: 'table.saved'; table: DiningTable }
  | { type: 'order.saved'; order: Order }
  | { type: 'appointment.saved'; appointment: Appointment }
  | { type: 'tailor.saved'; order: TailorOrder }
  | { type: 'sitejob.saved'; job: SiteJob }
  | { type: 'partner.saved'; partner: Partner }
  | { type: 'quote.saved'; quote: Quote }
  | { type: 'rolls.saved'; rolls: FabricRoll[] }
  | { type: 'workorder.saved'; order: WorkOrder }
  | { type: 'installment.saved'; plan: InstallmentPlan };
