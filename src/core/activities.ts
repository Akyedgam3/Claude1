import type { Activity } from './types';

/** الميزات التي يمكن تفعيلها حسب النشاط. كل ميزة تُظهر شاشات وحقولاً إضافية. */
export type Feature =
  | 'pos' // شاشة بيع سريع (كاشير)
  | 'repairs' // أوامر صيانة
  | 'vehicles' // بطاقات سيارات
  | 'devices' // بطاقات أجهزة (موبايلات، إلكترونيات)
  | 'partNumbers' // رقم القطعة والتوافق
  | 'batches' // دفعات وتواريخ صلاحية
  | 'serials' // أرقام تسلسلية / IMEI
  | 'variants' // مقاسات وألوان
  | 'scale' // مواد بالوزن وباركود الميزان
  | 'recipes' // أصناف مركّبة من مكوّنات
  | 'production' // تصنيع منتجات من مواد أولية
  | 'tables' // طاولات وطلبات مطعم
  | 'appointments' // مواعيد
  | 'priceTiers' // أسعار مفرق/جملة/خاص حسب العميل
  | 'units' // وحدات متعددة (قطعة/كرتونة/طن)
  | 'salesmen'; // مندوبو مبيعات

export interface ActivityProfile {
  id: Activity;
  name: string;
  description: string;
  icon: string;
  features: Feature[];
  itemLabel: string; // المادة / القطعة / الصنف / الدواء
  itemsLabel: string;
  units: string[]; // وحدات مقترحة
  categories: string[]; // تصنيفات مقترحة
  attributes?: string[]; // خصائص إضافية للمادة
  accountNames: Record<string, string>; // تسميات خاصة في دليل الحسابات
}

export const ACTIVITIES: Record<Activity, ActivityProfile> = {
  general: {
    id: 'general',
    name: 'تجارة عامة / خدمات',
    description: 'محل أو شركة تبيع مواد وخدمات بدون ميزات خاصة',
    icon: '🏪',
    features: ['pos', 'units', 'priceTiers'],
    itemLabel: 'مادة',
    itemsLabel: 'المواد والخدمات',
    units: ['قطعة', 'علبة', 'كرتونة', 'كيلو', 'متر', 'لتر'],
    categories: [],
    accountNames: {},
  },
  auto: {
    id: 'auto',
    name: 'قطع غيار وصيانة سيارات',
    description: 'بيع قطع، ورشة صيانة، أوامر إصلاح وبطاقات سيارات',
    icon: '🚗',
    features: ['repairs', 'vehicles', 'partNumbers', 'pos', 'units', 'priceTiers'],
    itemLabel: 'قطعة',
    itemsLabel: 'القطع والمواد',
    units: ['قطعة', 'طقم', 'لتر', 'علبة'],
    categories: ['فلاتر', 'زيوت', 'فرامل', 'كهرباء', 'تعليق', 'محرك', 'بودي', 'إطارات'],
    accountNames: { '1104': 'مخزون قطع الغيار', '4101': 'مبيعات قطع الغيار', '4201': 'إيرادات الصيانة (أجور اليد)' },
  },
  supermarket: {
    id: 'supermarket',
    name: 'سوبرماركت وبقالية',
    description: 'كاشير سريع بالباركود، مواد بالوزن، تواريخ صلاحية',
    icon: '🛒',
    features: ['pos', 'batches', 'scale', 'units', 'priceTiers'],
    itemLabel: 'صنف',
    itemsLabel: 'الأصناف',
    units: ['قطعة', 'كيلو', 'علبة', 'كرتونة', 'ربطة', 'لتر'],
    categories: ['مواد غذائية', 'ألبان وأجبان', 'منظفات', 'مشروبات', 'معلبات', 'خضار وفواكه', 'سكاكر'],
    accountNames: { '4101': 'مبيعات المواد الغذائية' },
  },
  pharmacy: {
    id: 'pharmacy',
    name: 'صيدلية',
    description: 'أدوية بدفعات وتواريخ صلاحية، اسم علمي، تنبيه انتهاء الصلاحية',
    icon: '💊',
    features: ['pos', 'batches', 'units'],
    itemLabel: 'دواء',
    itemsLabel: 'الأدوية والمستحضرات',
    units: ['علبة', 'ظرف', 'شريط', 'عبوة', 'أمبولة', 'قطعة'],
    categories: ['أدوية', 'مستحضرات تجميل', 'مكملات غذائية', 'مستلزمات طبية', 'حليب أطفال'],
    attributes: ['الاسم العلمي', 'الشكل الصيدلاني', 'التركيز', 'الشركة المصنعة'],
    accountNames: { '1104': 'مخزون الأدوية', '4101': 'مبيعات الأدوية' },
  },
  restaurant: {
    id: 'restaurant',
    name: 'مطعم وكافيه',
    description: 'طاولات وطلبات، تذاكر مطبخ، وجبات تُنقص مكوّناتها من المخزون',
    icon: '🍽',
    features: ['tables', 'recipes', 'pos', 'units'],
    itemLabel: 'صنف',
    itemsLabel: 'قائمة الطعام والمواد',
    units: ['قطعة', 'وجبة', 'كأس', 'كيلو', 'غرام', 'لتر'],
    categories: ['مقبلات', 'وجبات رئيسية', 'مشاوي', 'سندويش', 'مشروبات ساخنة', 'مشروبات باردة', 'حلويات', 'مواد أولية'],
    accountNames: { '1104': 'مخزون المواد الأولية', '4101': 'مبيعات المطعم' },
  },
  clothing: {
    id: 'clothing',
    name: 'ألبسة وأحذية',
    description: 'موديلات بمقاسات وألوان، كاشير، تبديل ومرتجعات',
    icon: '👕',
    features: ['variants', 'pos', 'priceTiers'],
    itemLabel: 'قطعة',
    itemsLabel: 'الموديلات والقطع',
    units: ['قطعة', 'طقم', 'جوز'],
    categories: ['رجالي', 'نسائي', 'ولادي', 'أحذية', 'إكسسوارات'],
    attributes: ['المقاس', 'اللون'],
    accountNames: { '4101': 'مبيعات الألبسة' },
  },
  mobile: {
    id: 'mobile',
    name: 'موبايلات وإلكترونيات',
    description: 'أرقام IMEI وكفالات، صيانة أجهزة، إكسسوارات',
    icon: '📱',
    features: ['serials', 'repairs', 'devices', 'pos', 'priceTiers'],
    itemLabel: 'صنف',
    itemsLabel: 'الأجهزة والإكسسوارات',
    units: ['قطعة', 'علبة'],
    categories: ['موبايلات', 'تابلت', 'إكسسوارات', 'شواحن', 'سماعات', 'قطع صيانة'],
    accountNames: { '4101': 'مبيعات الأجهزة', '4201': 'إيرادات الصيانة' },
  },
  building: {
    id: 'building',
    name: 'مواد بناء وحديد',
    description: 'وحدات طن/كيس/متر، أسعار جملة، بيع بالدين للمتعهدين',
    icon: '🧱',
    features: ['units', 'priceTiers', 'salesmen'],
    itemLabel: 'مادة',
    itemsLabel: 'مواد البناء',
    units: ['كيس', 'طن', 'كيلو', 'متر', 'متر مربع', 'متر مكعب', 'قطعة', 'لوح'],
    categories: ['إسمنت', 'حديد', 'بلوك', 'رمل وبحص', 'بلاط وسيراميك', 'أدوات صحية', 'دهانات'],
    accountNames: {},
  },
  butcher: {
    id: 'butcher',
    name: 'لحوم وخضار وفواكه',
    description: 'بيع بالوزن وباركود الميزان، تالف يومي',
    icon: '🥩',
    features: ['scale', 'pos', 'units'],
    itemLabel: 'صنف',
    itemsLabel: 'الأصناف',
    units: ['كيلو', 'غرام', 'قطعة', 'ربطة', 'صندوق'],
    categories: ['لحم غنم', 'لحم عجل', 'دجاج', 'خضار', 'فواكه'],
    accountNames: {},
  },
  bakery: {
    id: 'bakery',
    name: 'أفران وحلويات',
    description: 'تصنيع من مواد أولية بوصفات، بيع بالوزن والقطعة',
    icon: '🥐',
    features: ['production', 'recipes', 'scale', 'pos', 'batches', 'units'],
    itemLabel: 'صنف',
    itemsLabel: 'المنتجات والمواد الأولية',
    units: ['كيلو', 'قطعة', 'ربطة', 'صينية', 'علبة'],
    categories: ['خبز', 'معجنات', 'حلويات عربية', 'كاتو', 'مواد أولية'],
    accountNames: { '1104': 'مخزون المواد الأولية والمنتجات' },
  },
  wholesale: {
    id: 'wholesale',
    name: 'توزيع وتجارة جملة',
    description: 'مندوبو مبيعات، أسعار جملة وخاصة، كرتونة وقطعة، ذمم العملاء',
    icon: '🚚',
    features: ['salesmen', 'priceTiers', 'units', 'batches'],
    itemLabel: 'صنف',
    itemsLabel: 'الأصناف',
    units: ['قطعة', 'علبة', 'كرتونة', 'شوال', 'باليت'],
    categories: [],
    accountNames: { '4101': 'مبيعات الجملة' },
  },
  clinic: {
    id: 'clinic',
    name: 'عيادة / صالون / مركز خدمات',
    description: 'مواعيد، خدمات، ملفات المراجعين',
    icon: '🩺',
    features: ['appointments', 'pos'],
    itemLabel: 'خدمة',
    itemsLabel: 'الخدمات والمواد',
    units: ['جلسة', 'خدمة', 'قطعة'],
    categories: ['معاينة', 'جلسات', 'تحاليل', 'قص وتصفيف', 'عناية', 'مواد'],
    accountNames: { '4201': 'إيرادات الخدمات والمعاينات' },
  },
};

export const ACTIVITY_LIST = Object.values(ACTIVITIES);

export function hasFeature(activity: Activity | undefined, feature: Feature): boolean {
  return ACTIVITIES[activity ?? 'general'].features.includes(feature);
}
