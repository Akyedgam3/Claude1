import { ACTIVITIES } from './activities';
import type { Account, AccountType, Activity, Tax, Warehouse } from './types';

// دليل حسابات عام لنشاط تجاري/خدمي، بترقيم شجري (رقم الأب بادئة لرقم الابن).
// ملاحظة: يحتاج مراجعة من محاسب قبل اعتماده كمطابق للنظام المحاسبي الموحد السوري.
type Row = [id: string, name: string, type: AccountType, isGroup?: boolean, currency?: string];

const TRADING: Row[] = [
  ['1', 'الأصول', 'asset', true],
  ['11', 'الأصول المتداولة', 'asset', true],
  ['1101', 'الصندوق (ليرة)', 'asset'],
  ['1102', 'البنك', 'asset'],
  ['1103', 'العملاء', 'asset'],
  ['1104', 'المخزون', 'asset'],
  ['1105', 'شيكات برسم التحصيل', 'asset'],
  ['1106', 'سلف الموظفين', 'asset'],
  ['1108', 'صندوق الدولار', 'asset', false, 'USD'],
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
  ['2106', 'عربون ودفعات مقدمة من العملاء', 'liability'],
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
  ['5402', 'فروقات الجرد', 'expense'],
  ['5403', 'بضاعة تالفة ومنتهية الصلاحية', 'expense'],
  ['5404', 'مواد مستهلكة داخلياً', 'expense'],
];

function parentOf(id: string, ids: Set<string>): string | null {
  for (let len = id.length - 1; len > 0; len--) {
    const candidate = id.slice(0, len);
    if (ids.has(candidate)) return candidate;
  }
  return null;
}

export function tradingChart(): Account[] {
  const ids = new Set(TRADING.map(([id]) => id));
  return TRADING.map(([id, name, type, isGroup = false, currency]) => ({
    id,
    name,
    type,
    parentId: parentOf(id, ids),
    isGroup,
    currency: currency ?? null,
  }));
}

/** الدليل العام مع تسميات خاصة بكل نشاط. */
export function chartFor(activity: Activity = 'general'): Account[] {
  const names = ACTIVITIES[activity].accountNames;
  return tradingChart().map((a) => ({ ...a, name: names[a.id] ?? a.name }));
}

export function defaultWarehouses(): Warehouse[] {
  return [{ id: 'main', name: 'المستودع الرئيسي' }];
}

// نسب الضرائب تختلف حسب نوع السلعة/النشاط، لذلك تبدأ معطّلة ويحددها المستخدم.
export function defaultTaxes(): Tax[] {
  return [
    { id: 'consumption', name: 'ضريبة الإنفاق الاستهلاكي', percent: 0, accountId: '2103', active: false },
    { id: 'other', name: 'رسوم أخرى', percent: 0, accountId: '2104', active: false },
  ];
}

/** صندوق العملة: صندوق الدولار للدولار، صندوق العملة المضافة إذا موجود، وإلا الصندوق الرئيسي. */
export function cashAccountFor(state: { accounts: Record<string, Account> }, currency: string): string {
  if (currency === 'USD' && state.accounts[SYSTEM_ACCOUNTS.usdCash]) return SYSTEM_ACCOUNTS.usdCash;
  const own = Object.values(state.accounts).find((a) => a.currency === currency && !a.isGroup && !a.archived && a.type === 'asset' && a.id.startsWith('11') && a.id !== SYSTEM_ACCOUNTS.usdCash);
  return own?.id ?? SYSTEM_ACCOUNTS.cash;
}

// حسابات النظام التي تعتمد عليها العمليات التلقائية (الفواتير، السندات...)
export const SYSTEM_ACCOUNTS = {
  cash: '1101',
  usdCash: '1108',
  bank: '1102',
  customers: '1103',
  inventory: '1104',
  suppliers: '2101',
  deposits: '2106',
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
  countDifferences: '5402',
  damaged: '5403',
  consumption: '5404',
} as const;
