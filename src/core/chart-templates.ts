import type { Account, AccountType, Activity, Tax, Warehouse } from './types';

// دليل حسابات عام لنشاط تجاري/خدمي، بترقيم شجري (رقم الأب بادئة لرقم الابن).
// ملاحظة: يحتاج مراجعة من محاسب قبل اعتماده كمطابق للنظام المحاسبي الموحد السوري.
type Row = [id: string, name: string, type: AccountType, isGroup?: boolean];

const TRADING: Row[] = [
  ['1', 'الأصول', 'asset', true],
  ['11', 'الأصول المتداولة', 'asset', true],
  ['1101', 'الصندوق', 'asset'],
  ['1102', 'البنك', 'asset'],
  ['1103', 'العملاء', 'asset'],
  ['1104', 'المخزون', 'asset'],
  ['1105', 'شيكات برسم التحصيل', 'asset'],
  ['1106', 'سلف الموظفين', 'asset'],
  ['12', 'الأصول الثابتة', 'asset', true],
  ['1201', 'أثاث ومفروشات', 'asset'],
  ['1202', 'أجهزة ومعدات', 'asset'],
  ['1203', 'سيارات', 'asset'],
  ['1209', 'مجمع الاستهلاك', 'asset'],

  ['2', 'الخصوم', 'liability', true],
  ['21', 'الخصوم المتداولة', 'liability', true],
  ['2101', 'الموردون', 'liability'],
  ['2102', 'شيكات برسم الدفع', 'liability'],
  ['2103', 'ضريبة الإنفاق الاستهلاكي المستحقة', 'liability'],
  ['2104', 'ضرائب ورسوم أخرى مستحقة', 'liability'],
  ['2105', 'رواتب مستحقة', 'liability'],
  ['22', 'الخصوم طويلة الأجل', 'liability', true],
  ['2201', 'قروض', 'liability'],

  ['3', 'حقوق الملكية', 'equity', true],
  ['3101', 'رأس المال', 'equity'],
  ['3102', 'جاري المالك / الشركاء', 'equity'],
  ['3103', 'الأرباح المدوّرة', 'equity'],
  ['3104', 'الأرصدة الافتتاحية', 'equity'],

  ['4', 'الإيرادات', 'revenue', true],
  ['4101', 'المبيعات', 'revenue'],
  ['4102', 'مردودات المبيعات', 'revenue'],
  ['4103', 'الخصم المسموح به', 'revenue'],
  ['4201', 'إيرادات الخدمات', 'revenue'],
  ['4301', 'أرباح فروقات الصرف', 'revenue'],
  ['4901', 'إيرادات أخرى', 'revenue'],

  ['5', 'المصاريف', 'expense', true],
  ['5101', 'تكلفة البضاعة المباعة', 'expense'],
  ['52', 'المصاريف التشغيلية', 'expense', true],
  ['5201', 'رواتب وأجور', 'expense'],
  ['5202', 'إيجار', 'expense'],
  ['5203', 'كهرباء ومياه', 'expense'],
  ['5204', 'محروقات ومولّدات (أمبيرات)', 'expense'],
  ['5205', 'اتصالات وإنترنت', 'expense'],
  ['5206', 'نقل ومواصلات', 'expense'],
  ['5207', 'صيانة', 'expense'],
  ['5208', 'ضرائب ورسوم', 'expense'],
  ['5209', 'مصاريف متنوعة', 'expense'],
  ['5301', 'خسائر فروقات الصرف', 'expense'],
  ['5401', 'استهلاك الأصول الثابتة', 'expense'],
];

function parentOf(id: string, ids: Set<string>): string | null {
  for (let len = id.length - 1; len > 0; len--) {
    const candidate = id.slice(0, len);
    if (ids.has(candidate)) return candidate;
  }
  return null;
}

// تسميات خاصة بكل نشاط فوق الدليل العام
const ACTIVITY_NAMES: Record<Activity, Record<string, string>> = {
  general: {},
  auto: {
    '1104': 'مخزون قطع الغيار',
    '4101': 'مبيعات قطع الغيار',
    '4201': 'إيرادات الصيانة (أجور اليد)',
  },
};

export function chartFor(activity: Activity = 'general'): Account[] {
  const names = ACTIVITY_NAMES[activity];
  return tradingChart().map((a) => ({ ...a, name: names[a.id] ?? a.name }));
}

export function defaultWarehouses(): Warehouse[] {
  return [{ id: 'main', name: 'المستودع الرئيسي' }];
}

export function tradingChart(): Account[] {
  const ids = new Set(TRADING.map(([id]) => id));
  return TRADING.map(([id, name, type, isGroup = false]) => ({
    id,
    name,
    type,
    parentId: parentOf(id, ids),
    isGroup,
    currency: null,
  }));
}

// نسب الضرائب تختلف حسب نوع السلعة/النشاط، لذلك تبدأ معطّلة ويحددها المستخدم.
export function defaultTaxes(): Tax[] {
  return [
    { id: 'consumption', name: 'ضريبة الإنفاق الاستهلاكي', percent: 0, accountId: '2103', active: false },
    { id: 'other', name: 'رسوم أخرى', percent: 0, accountId: '2104', active: false },
  ];
}

// حسابات النظام التي تعتمد عليها العمليات التلقائية (الفواتير، السندات...)
export const SYSTEM_ACCOUNTS = {
  cash: '1101',
  bank: '1102',
  customers: '1103',
  inventory: '1104',
  suppliers: '2101',
  sales: '4101',
  salesReturns: '4102',
  discountAllowed: '4103',
  serviceRevenue: '4201',
  miscExpenses: '5209',
  cogs: '5101',
  fxGain: '4301',
  fxLoss: '5301',
  openingBalances: '3104',
  retainedEarnings: '3103',
} as const;
