// قائمة شاشات البرنامج (القائمة الجانبية)، ومنها بيختار المستخدم أزرار الشاشة الرئيسية كمان.
import type { Feature, Permission } from '../../core';

/** شاشات بتنفتح من شاشات تانية (مش من القائمة) ومربوطة بشاشة بالقائمة: إذا الأصل مخفي هي كمان مخفية. */
export const SCREEN_PARENT: Record<string, string> = { invoice: 'invoices', sale_return: 'sale', purchase_return: 'purchase', quote: 'quotes' };

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  feature?: Feature;
  features?: Feature[]; // أي واحدة منها
  perm?: Permission;
  perms?: Permission[]; // أي واحدة منها
  also?: Permission; // وكمان هي (فوق perm/perms)
}

export const NAV: (NavItem | string)[] = [
  { key: 'dashboard', label: 'الرئيسية', icon: 'home' },
  { key: 'management', label: 'لوحة الإدارة', icon: 'chart', perm: 'reports.financial' },
  { key: 'learn', label: 'تعلّم وزن', icon: 'learn' },
  { key: 'alerts', label: 'التنبيهات', icon: 'bell' },
  // الصندوق فوق كل شي حتى يلتقى بسرعة (F10)
  { key: 'cashbox', label: 'الصندوق', icon: 'wallet', perms: ['reports.financial', 'vouchers.create'] },
  'الصرافة والحوالات',
  { key: 'fx', label: 'الصرافة', icon: 'transfer', feature: 'fxdesk', perms: ['fx.manage', 'fx.rates'] },
  { key: 'remittances', label: 'الحوالات', icon: 'wallet', feature: 'remittances', perm: 'fx.manage' },
  'الأجهزة والإلكترونيات',
  { key: 'devices', label: 'سجل الأجهزة (السيريال)', icon: 'laptop', feature: 'serials' },
  { key: 'netsubs', label: 'الاشتراكات', icon: 'wifi', feature: 'netsubs', perms: ['netsubs.manage', 'sales.create'] },
  { key: 'installments', label: 'التقسيط', icon: 'calendar', feature: 'installments', perms: ['sales.create', 'vouchers.create'] },
  { key: 'trade-in', label: 'بيع مع استبدال', icon: 'transfer', feature: 'tradeIn', perm: 'sales.create' },
  { key: 'pc-build', label: 'تجميعة كمبيوتر', icon: 'cpu', feature: 'pcBuild', perm: 'sales.create' },
  'الخياطة',
  { key: 'workshop', label: 'ورشة الخياطة (الجملة)', icon: 'factory', feature: 'workshop', perm: 'tailoring.manage' },
  { key: 'tailor', label: 'طلبات التفصيل', icon: 'scissors', feature: 'tailoring', perm: 'tailoring.manage' },
  'الورشة',
  { key: 'sitejobs', label: 'المشاريع والكشوفات', icon: 'roller', feature: 'sitejobs', perm: 'sitejobs.manage' },
  { key: 'shipments', label: 'الشحنات والتخليص', icon: 'container', feature: 'shipments', perm: 'shipments.manage' },
  { key: 'stoneblocks', label: 'الكتل والقص', icon: 'mountain', feature: 'stoneblocks', perms: ['production.manage', 'purchases.create'] },
  { key: 'poultry', label: 'الفروج والتوزيع', icon: 'drumstick', feature: 'poultry' },
  { key: 'bookings', label: 'حجوزات الصالة', icon: 'calendar', feature: 'hallbookings', perm: 'bookings.manage' },
  { key: 'dealers', label: 'الموردين', icon: 'users', feature: 'dealers', perm: 'dealers.manage' },
  { key: 'printjobs', label: 'طلبات الطباعة', icon: 'printer', feature: 'printjobs', perm: 'printjobs.manage' },
  { key: 'solar', label: 'منظومات الطاقة الشمسية', icon: 'sun', feature: 'solar', perm: 'solar.manage' },
  'العمليات',
  { key: 'pos', label: 'نقطة البيع', icon: 'pos', feature: 'pos', perm: 'pos.use' },
  { key: 'restaurant', label: 'الطاولات والطلبات', icon: 'utensils', feature: 'tables', perm: 'restaurant.use' },
  { key: 'kitchen', label: 'شاشة المطبخ', icon: 'beef', feature: 'tables', perm: 'restaurant.use' },
  { key: 'restaurant-live', label: 'لوحة الإدارة المباشرة', icon: 'live', feature: 'tables', perm: 'reports.financial' },
  { key: 'sale', label: 'فاتورة مبيع', icon: 'plus', perm: 'sales.create' },
  { key: 'quotes', label: 'عروض الأسعار', icon: 'file', perm: 'sales.create' },
  { key: 'repairs', label: 'أوامر الصيانة', icon: 'wrench', feature: 'repairs', perm: 'repairs.manage' },
  { key: 'appointments', label: 'المواعيد', icon: 'calendar', feature: 'appointments', perm: 'appointments.manage' },
  { key: 'purchase', label: 'فاتورة شراء', icon: 'purchase', perm: 'purchases.create' },
  { key: 'debts', label: 'الديون', icon: 'debts', perm: 'vouchers.create', also: 'balances.view' },
  { key: 'statement', label: 'كشف الحساب', icon: 'file', perms: ['reports.financial', 'vouchers.create'], also: 'balances.view' },
  { key: 'marketers', label: 'المسوّقين', icon: 'users', perm: 'reports.financial' },
  { key: 'vouchers', label: 'سندات القبض والدفع', icon: 'wallet', perm: 'vouchers.create' },
  { key: 'cashjournal', label: 'يومية الصندوق', icon: 'journal', perm: 'vouchers.create' },
  { key: 'recurring', label: 'المصاريف الثابتة', icon: 'calendar', perm: 'accounts.manage' },
  { key: 'invoices', label: 'سجل الفواتير', icon: 'receipt' },
  'المخزون والبطاقات',
  { key: 'items', label: 'المواد', icon: 'package' },
  { key: 'itemwatch', label: 'مراقبة المواد', icon: 'eye', perms: ['reports.stock', 'reports.financial'] },
  { key: 'pricing', label: 'حاسبة التسعير', icon: 'trend', perms: ['costs.view', 'items.manage', 'price.edit'] },
  { key: 'pricelists', label: 'قوائم الأسعار', icon: 'dollar', feature: 'priceTiers', perms: ['items.manage', 'price.edit'] },
  { key: 'pricelist', label: 'نشرة الأسعار', icon: 'file', feature: 'priceList' },
  { key: 'lists', label: 'النشرات والحسومات', icon: 'file', feature: 'listPricing', perm: 'items.manage' },
  { key: 'stock', label: 'الجرد وعمليات المخزون', icon: 'transfer', perms: ['stock.adjust', 'stock.transfer'] },
  { key: 'woodlots', label: 'حمولات الحطب', icon: 'tree', feature: 'woodlots', perms: ['purchases.create', 'sales.create', 'vouchers.create'] },
  { key: 'formulas', label: 'الخلطات والوصفات', icon: 'flask', feature: 'production', perms: ['production.manage', 'items.manage'] },
  { key: 'production', label: 'الإنتاج', icon: 'factory', feature: 'production', perm: 'production.manage' },
  { key: 'parties', label: 'العملاء والموردون', icon: 'users' },
  { key: 'vehicles', label: 'السيارات والأجهزة', icon: 'car', features: ['vehicles', 'devices'], perm: 'repairs.manage' },
  'المحاسبة',
  { key: 'reports', label: 'التقارير', icon: 'reports', perms: ['reports.financial', 'reports.stock', 'sales.create'] },
  { key: 'journal', label: 'القيود اليومية', icon: 'journal', perm: 'journal.create' },
  { key: 'rates', label: 'العملات وسعر الصرف', icon: 'dollar', perm: 'rates.manage' },
  { key: 'partners', label: 'الشركاء والموظفين', icon: 'users', perms: ['partners.manage', 'employees.manage'] },
  { key: 'accounts', label: 'دليل الحسابات', icon: 'accounts', perm: 'accounts.manage' },
  'الإدارة',
  { key: 'users', label: 'المستخدمون', icon: 'user-cog', perm: 'users.manage' },
  { key: 'settings', label: 'الإعدادات', icon: 'settings' },
];

/** الشاشة مسموحة لهالمستخدم وهالنشاط؟ */
export function navAllowed(n: NavItem, ctx: { feature: (f: Feature) => boolean; can: (p: Permission) => boolean; user?: { role: string; hiddenScreens?: string[] } }): boolean {
  if (n.key !== 'dashboard' && ctx.user && ctx.user.role !== 'owner' && ctx.user.hiddenScreens?.includes(n.key)) return false;
  if (n.feature && !ctx.feature(n.feature)) return false;
  if (n.features && !n.features.some(ctx.feature)) return false;
  if (n.perm && !ctx.can(n.perm)) return false;
  if (n.perms && !n.perms.some(ctx.can)) return false;
  if (n.also && !ctx.can(n.also)) return false;
  return true;
}
