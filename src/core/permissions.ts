import type { Role, User } from './types';

// كل صلاحية تحمي مجموعة عمليات. الفحص يتم في العملية الرئيسية قبل تنفيذ أي عملية،
// والواجهة تستخدم نفس القائمة لإخفاء ما لا يحق للمستخدم.
export const PERMISSIONS = {
  'sales.create': 'إنشاء فواتير المبيع',
  'sales.void': 'إلغاء الفواتير',
  'returns.create': 'المرتجعات',
  'discount.give': 'إعطاء خصم',
  'purchases.create': 'فواتير الشراء',
  'vouchers.create': 'سندات القبض والدفع',
  'vouchers.void': 'إلغاء السندات',
  'journal.create': 'القيود اليدوية',
  'items.manage': 'إدارة المواد والأسعار',
  'costs.view': 'رؤية التكاليف والأرباح',
  'parties.manage': 'إدارة العملاء والموردين',
  'stock.adjust': 'الجرد والتالف والأرصدة الافتتاحية',
  'stock.transfer': 'التحويل بين المستودعات',
  'production.manage': 'الإنتاج والتصنيع',
  'repairs.manage': 'أوامر الصيانة',
  'pos.use': 'شاشة البيع السريع',
  'restaurant.use': 'الطاولات والطلبات',
  'appointments.manage': 'المواعيد',
  'tailoring.manage': 'طلبات التفصيل والقياسات',
  'sitejobs.manage': 'مشاريع التنفيذ والكشوفات',
  'shipments.manage': 'الشحنات والتخليص',
  'printjobs.manage': 'طلبات الطباعة',
  'dealers.manage': 'الموردين المستقلين',
  'bookings.manage': 'حجوزات الصالة',
  'solar.manage': 'منظومات الطاقة الشمسية',
  'reports.financial': 'التقارير المالية',
  'reports.stock': 'تقارير المخزون',
  'accounts.manage': 'دليل الحسابات',
  'rates.manage': 'أسعار الصرف',
  'settings.manage': 'إعدادات الشركة والطباعة',
  'users.manage': 'المستخدمون والصلاحيات',
  'period.close': 'إقفال الفترات والسنة المالية',
  'backup.manage': 'النسخ الاحتياطي والتصدير',
  'partners.manage': 'الشركاء ورأس المال والأرباح',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_NAMES: Record<Role, string> = {
  owner: 'المالك',
  manager: 'مدير',
  accountant: 'محاسب',
  cashier: 'كاشير / بائع',
  storekeeper: 'أمين مستودع',
  technician: 'فني',
  viewer: 'اطلاع فقط',
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter((p) => p !== 'users.manage' && p !== 'period.close'),
  accountant: [
    'sales.create', 'sales.void', 'returns.create', 'discount.give', 'purchases.create', 'vouchers.create', 'vouchers.void',
    'journal.create', 'costs.view', 'parties.manage', 'reports.financial', 'reports.stock', 'accounts.manage', 'rates.manage',
    'stock.adjust', 'backup.manage',
  ],
  cashier: ['sales.create', 'returns.create', 'pos.use', 'restaurant.use', 'appointments.manage', 'tailoring.manage', 'printjobs.manage', 'dealers.manage', 'bookings.manage', 'solar.manage', 'vouchers.create', 'parties.manage'],
  storekeeper: ['items.manage', 'stock.adjust', 'stock.transfer', 'production.manage', 'purchases.create', 'reports.stock'],
  technician: ['repairs.manage', 'appointments.manage', 'tailoring.manage', 'sitejobs.manage', 'shipments.manage', 'printjobs.manage', 'solar.manage', 'parties.manage'],
  viewer: ['reports.stock'],
};

export function permissionsOf(user: User): Set<Permission> {
  if (!user.active) return new Set();
  const set = new Set<Permission>(ROLE_PERMISSIONS[user.role]);
  for (const p of user.extra ?? []) if (p in PERMISSIONS) set.add(p as Permission);
  if (user.role !== 'owner') for (const p of user.denied ?? []) set.delete(p as Permission);
  return set;
}

export function can(user: User | null | undefined, permission: Permission): boolean {
  return !!user && permissionsOf(user).has(permission);
}

/** الصلاحية المطلوبة لكل عملية على الدفتر. العمليات غير المذكورة هنا ممنوعة على الواجهة. */
export const METHOD_PERMISSIONS: Record<string, Permission | ((args: unknown[]) => Permission)> = {
  updateCompany: 'settings.manage',
  saveAccount: 'accounts.manage',
  saveTax: 'settings.manage',
  setRate: 'rates.manage',
  saveCurrency: 'rates.manage',
  postEntry: 'journal.create',
  voidEntry: 'vouchers.void',
  lockPeriod: 'period.close',
  closeYear: 'period.close',
  saveParty: 'parties.manage',
  saveItem: 'items.manage',
  saveItems: 'items.manage',
  deleteItem: 'items.manage',
  saveWarehouse: 'stock.transfer',
  postInvoice: (args) => {
    const kind = (args[0] as { kind?: string } | undefined)?.kind;
    if (kind === 'purchase' || kind === 'purchase_return') return 'purchases.create';
    if (kind === 'sale_return') return 'returns.create';
    return 'sales.create';
  },
  voidInvoice: 'sales.void',
  deleteInvoice: 'sales.void',
  replaceInvoice: 'sales.void',
  postVoucher: 'vouchers.create',
  postDebt: 'vouchers.create',
  settleDebt: 'vouchers.create',
  // أرصدة الحسابات والذمم الافتتاحية قيد مالي؛ أرصدة المخزون وحدها لأمين المستودع
  postOpeningBalances: (args) => {
    const d = args[0] as { accounts?: unknown[]; parties?: unknown[] } | undefined;
    return d?.accounts?.length || d?.parties?.length ? 'journal.create' : 'stock.adjust';
  },
  adjustStock: 'stock.adjust',
  countStock: 'stock.adjust',
  transferStock: 'stock.transfer',
  voidTransfer: 'stock.transfer',
  postProduction: 'production.manage',
  saveVehicle: 'repairs.manage',
  saveRepair: 'repairs.manage',
  invoiceRepair: 'sales.create',
  saveTable: 'settings.manage',
  saveOrder: 'restaurant.use',
  closeOrder: 'restaurant.use',
  moveOrder: 'restaurant.use',
  mergeOrders: 'restaurant.use',
  saveAppointment: 'appointments.manage',
  invoiceAppointment: 'sales.create',
  saveQuote: 'sales.create',
  convertQuote: 'sales.create',
  saveTailorOrder: 'tailoring.manage',
  saveSiteJob: 'sitejobs.manage',
  saveShipment: 'shipments.manage',
  invoiceShipment: 'sales.create',
  addStoneBlock: 'purchases.create',
  cutStoneBlock: 'production.manage',
  savePriceBoard: 'items.manage',
  addPoultryCuts: 'items.manage',
  savePartner: 'partners.manage',
  partnerMove: 'partners.manage',
  voidPartnerMove: 'partners.manage',
  addSiteJobDeposit: 'vouchers.create',
  deliverSiteJob: 'sales.create',
  savePrintJob: 'printjobs.manage',
  addPrintDeposit: 'vouchers.create',
  deliverPrintJob: 'sales.create',
  saveBooking: 'bookings.manage',
  deleteBooking: (args) => ((args[1] as { voidDeposits?: boolean } | undefined)?.voidDeposits ? 'vouchers.void' : 'bookings.manage'),
  addBookingDeposit: 'vouchers.create',
  invoiceBooking: 'sales.create',
  saveSolarProject: 'solar.manage',
  addSolarDeposit: 'vouchers.create',
  invoiceSolarProject: 'sales.create',
  saveDealer: 'dealers.manage',
  postDealerSale: 'dealers.manage',
  voidDealerSale: 'dealers.manage',
  postDealerMove: 'dealers.manage',
  voidDealerMove: 'dealers.manage',
  addTailorDeposit: 'vouchers.create',
  deliverTailorOrder: 'sales.create',
  loadDemoData: 'settings.manage',
  createInstallmentPlan: 'sales.create',
  collectInstallment: 'vouchers.create',
  cancelInstallmentPlan: 'sales.void',
  tradeIn: 'sales.create',
  receiveRolls: 'tailoring.manage',
  updateRoll: 'tailoring.manage',
  returnRoll: 'tailoring.manage',
  saveWorkOrder: 'tailoring.manage',
  addCut: 'tailoring.manage',
  removeCut: 'tailoring.manage',
  addStage: 'tailoring.manage',
  removeStage: 'tailoring.manage',
  addWorkExpense: 'vouchers.create',
  removeWorkExpense: 'vouchers.void',
  addWorkAdjustment: 'vouchers.create',
  deliverWork: (args) => ((args[1] as { invoice?: boolean } | undefined)?.invoice ? 'sales.create' : 'tailoring.manage'),
  invoiceDelivery: 'sales.create',
};

export function permissionFor(method: string, args: unknown[]): Permission | null {
  // نقبل فقط الأسماء المعرّفة صراحة (لا constructor ولا toString ولا غيرها من خصائص الكائنات)
  if (!Object.prototype.hasOwnProperty.call(METHOD_PERMISSIONS, method)) return null;
  const p = METHOD_PERMISSIONS[method];
  if (!p) return null;
  return typeof p === 'function' ? p(args) : p;
}
