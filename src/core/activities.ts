import type { Activity, CompanyInfo } from './types';

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
  | 'salesmen' // مندوبو مبيعات
  | 'tailoring' // طلبات تفصيل وقياسات الزبائن
  | 'workshop' // ورشة إنتاج: أتواب قماش الزبون، قصّات وتسليمات بالقطعة
  | 'installments' // تقسيط: خطط أقساط وتحصيل ومتأخرات
  | 'tradeIn' // شراء أجهزة مستعملة والبيع مع الاستبدال
  | 'pcBuild' // تجميعات كمبيوتر من القطع
  | 'shipments' // نقل وتخليص جمركي: شحنات بسائق وسيارة ووجهة وأجور
  | 'stoneblocks' // منشرة حجر: كتل بالمتر المكعب بتنقص لألواح وبلاط
  | 'sitejobs'; // مشاريع تنفيذ عند الزبون: كشف بالغرف والأمتار وسعر المتر (جبسين، ديكور، دهان...)

export interface ActivityProfile {
  id: Activity;
  name: string;
  description: string;
  icon: string; // اسم أيقونة (تُرسم في الواجهة)
  color: string; // لون مميز لواجهة هذا النشاط
  features: Feature[];
  itemLabel: string; // المادة / القطعة / الصنف / الدواء
  itemsLabel: string;
  units: string[]; // وحدات مقترحة
  categories: string[]; // تصنيفات مقترحة
  attributes?: string[]; // خصائص إضافية للمادة
  attributeSets?: { match: RegExp; attributes: string[] }[]; // خصائص حسب التصنيف (لابتوب، موبايل...)
  accountNames: Record<string, string>; // تسميات خاصة في دليل الحسابات
  /** ملاحظات جاهزة بكبسة على سطر البيع (طعمات البوظة مثلاً). */
  quickNotes?: string[];
}

export const ACTIVITIES: Record<Activity, ActivityProfile> = {
  general: {
    id: 'general',
    name: 'تجارة عامة / خدمات',
    description: 'محل أو شركة تبيع مواد وخدمات بدون ميزات خاصة',
    icon: 'store',
    color: '#0f6e5c',
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
    icon: 'car',
    color: '#1f5fa8',
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
    icon: 'shopping-cart',
    color: '#2f8f3a',
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
    icon: 'pill',
    color: '#0e8a8a',
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
    icon: 'utensils',
    color: '#b5531c',
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
    icon: 'shirt',
    color: '#8a3fa0',
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
    name: 'موبايلات وكمبيوتر وإلكترونيات',
    description: 'موبايلات ولابتوبات وكمبيوترات: IMEI والرقم التسلسلي، كفالات، تقسيط، شراء مستعمل واستبدال، تجميعات كمبيوتر، صيانة',
    icon: 'laptop',
    color: '#3a4fb8',
    features: ['serials', 'tradeIn', 'installments', 'pcBuild', 'repairs', 'devices', 'pos', 'priceTiers'],
    itemLabel: 'صنف',
    itemsLabel: 'الأجهزة والإكسسوارات',
    units: ['قطعة', 'علبة'],
    categories: [
      'موبايلات',
      'موبايلات مستعملة',
      'تابلت',
      'لابتوب',
      'لابتوب مستعمل',
      'كمبيوتر مكتبي',
      'شاشات',
      'معالجات',
      'رامات',
      'هاردات و SSD',
      'كروت شاشة',
      'مازربورد',
      'باور وكيسات',
      'طابعات',
      'شبكات وراوترات',
      'كاميرات مراقبة',
      'إكسسوارات',
      'شواحن',
      'سماعات',
      'قطع صيانة',
    ],
    attributes: ['الحالة', 'اللون'],
    attributeSets: [
      { match: /موبايل|تابلت/, attributes: ['الذاكرة', 'الرام', 'اللون', 'الحالة', 'البطارية'] },
      { match: /لابتوب|كمبيوتر/, attributes: ['المعالج', 'الرام', 'التخزين', 'كرت الشاشة', 'الشاشة', 'النظام', 'الحالة', 'البطارية'] },
      { match: /شاشات/, attributes: ['القياس', 'الدقة', 'التردد', 'الحالة'] },
      { match: /معالجات|رامات|هاردات|كروت شاشة|مازربورد|باور/, attributes: ['الموديل', 'السعة / السرعة', 'المقبس / النوع', 'الحالة'] },
    ],
    accountNames: { '4101': 'مبيعات الأجهزة', '4201': 'إيرادات الصيانة' },
  },
  building: {
    id: 'building',
    name: 'مواد بناء وحديد',
    description: 'وحدات طن/كيس/متر، أسعار جملة، بيع بالدين للمتعهدين',
    icon: 'brick-wall',
    color: '#8a5a2b',
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
    icon: 'beef',
    color: '#a52a2a',
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
    icon: 'croissant',
    color: '#c07a12',
    features: ['production', 'recipes', 'scale', 'pos', 'batches', 'units'],
    itemLabel: 'صنف',
    itemsLabel: 'المنتجات والمواد الأولية',
    units: ['كيلو', 'قطعة', 'ربطة', 'صينية', 'علبة'],
    categories: ['خبز', 'معجنات', 'حلويات عربية', 'كاتو', 'مواد أولية'],
    accountNames: { '1104': 'مخزون المواد الأولية والمنتجات' },
  },
  sweets: {
    id: 'sweets',
    name: 'حلويات وبوظة (أيس كريم)',
    description: 'بيع بالوزن والقطعة والعلبة، كاسات بوظة بأحجام وطعمات، تصنيع بوصفات وصلاحية قصيرة',
    icon: 'ice-cream',
    color: '#d6457a',
    features: ['pos', 'scale', 'units', 'recipes', 'production', 'batches'],
    itemLabel: 'صنف',
    itemsLabel: 'الأصناف والمواد الأولية',
    units: ['كيلو', 'قطعة', 'علبة', 'صينية', 'كاسة', 'كونو', 'بولة'],
    categories: ['حلويات عربية', 'حلويات غربية', 'كاتو وتورتات', 'بوظة', 'شوكولا وسكاكر', 'مشروبات', 'مواد أولية'],
    quickNotes: ['فانيلا', 'شوكولا', 'فريز', 'فستق حلبي', 'مانجا', 'ليمون', 'قشطة', 'كراميل', 'زيادة فستق', 'بدون مكسرات', 'علبة هدية'],
    accountNames: { '1104': 'مخزون الحلويات والمواد الأولية' },
  },
  wholesale: {
    id: 'wholesale',
    name: 'توزيع وتجارة جملة',
    description: 'مندوبو مبيعات، أسعار جملة وخاصة، كرتونة وقطعة، ذمم العملاء',
    icon: 'truck',
    color: '#44617a',
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
    icon: 'stethoscope',
    color: '#1a7f9c',
    features: ['appointments', 'pos'],
    itemLabel: 'خدمة',
    itemsLabel: 'الخدمات والمواد',
    units: ['جلسة', 'خدمة', 'قطعة'],
    categories: ['معاينة', 'جلسات', 'تحاليل', 'قص وتصفيف', 'عناية', 'مواد'],
    accountNames: { '4201': 'إيرادات الخدمات والمعاينات' },
  },
  tailor: {
    id: 'tailor',
    name: 'خياطة وتفصيل',
    description: 'قياسات الزبائن وطلبات التفصيل، وورشة إنتاج بالجملة: أتواب قماش الزبون، قصّات وتسليمات بالقطعة',
    icon: 'scissors',
    color: '#9c3d6b',
    features: ['tailoring', 'workshop', 'pos', 'units'],
    itemLabel: 'مادة',
    itemsLabel: 'الأقمشة واللوازم',
    units: ['متر', 'قطعة', 'ثوب', 'بكرة', 'علبة'],
    categories: ['أقمشة', 'بطانة', 'أزرار وسحابات', 'خيوط', 'جاهز', 'خدمات خياطة'],
    accountNames: { '1104': 'مخزون الأقمشة واللوازم', '4101': 'مبيعات الأقمشة', '4201': 'إيرادات الخياطة والتفصيل' },
  },
  gypsum: {
    id: 'gypsum',
    name: 'جبسين وديكور (ورشة تنفيذ)',
    description: 'كشف عند الزبون بالغرف والأمتار (سقف، مرد، اسرب...)، سعر المتر، دفعات، فاتورة، وسجل كل زبون لبعد سنين',
    icon: 'roller',
    color: '#7a6a4f',
    features: ['sitejobs', 'units'],
    itemLabel: 'مادة',
    itemsLabel: 'المواد',
    units: ['لوح', 'متر', 'قطعة', 'كيس', 'علبة', 'كيلو'],
    categories: ['ألواح جبس بورد', 'بروفيلات', 'براغي ومثبتات', 'معجونة وشريط', 'كرانيش وديكورات', 'دهانات', 'إنارة'],
    accountNames: { '1104': 'مخزون المواد', '4101': 'مبيعات المواد', '4201': 'إيرادات أعمال الجبسين والديكور' },
  },
  customs: {
    id: 'customs',
    name: 'نقل وتخليص جمركي',
    description: 'شحنات بسائق ورقم سيارة ووجهة وبضاعة، أجار سيارة وتخليص ورسوم، نقل مبرّد، وفاتورة لكل شحنة',
    icon: 'container',
    color: '#1f5f8b',
    features: ['shipments'],
    itemLabel: 'خدمة',
    itemsLabel: 'الخدمات',
    units: ['شحنة', 'سيارة', 'بيان', 'طن', 'كرتونة'],
    categories: ['نقل', 'تخليص', 'رسوم', 'تبريد'],
    accountNames: { '4101': 'إيرادات النقل', '4201': 'إيرادات التخليص الجمركي' },
  },
  stone: {
    id: 'stone',
    name: 'منشرة حجر ورخام',
    description: 'كتل بالمتر المكعب، قص لألواح وبلاط بالمتر المربع وكورنيش بالمتر الطولي، الهدر وتكلفة كل متر، وبيع بالمتر',
    icon: 'mountain',
    color: '#7d6b5a',
    features: ['stoneblocks', 'production', 'units', 'priceTiers'],
    itemLabel: 'صنف',
    itemsLabel: 'الأصناف',
    units: ['م²', 'م.ط', 'م³', 'قطعة', 'طن'],
    categories: ['كتل خام', 'ألواح', 'بلاط', 'كورنيش وحواف', 'درج وعتبات', 'بقايا وكسر'],
    attributes: ['السماكة (سم)', 'نوع الحجر', 'التشطيب'],
    accountNames: { '1104': 'مخزون الحجر والكتل', '4101': 'مبيعات الحجر' },
  },
};

/** بنود الكشف الجاهزة: الاسم وطريقة القياس والمعامل (المرد الجالس بينحسب نص). */
export const SITE_JOB_PRESETS: { name: string; kind: 'area' | 'length' | 'count'; factor: number }[] = [
  { name: 'سقف', kind: 'area', factor: 1 },
  { name: 'جدار', kind: 'area', factor: 1 },
  { name: 'مرد جالس', kind: 'length', factor: 0.5 },
  { name: 'مرد لف', kind: 'length', factor: 1 },
  { name: 'اسرب', kind: 'length', factor: 0.5 },
  { name: 'كرنيش', kind: 'length', factor: 1 },
  { name: 'إنارة مخفية', kind: 'length', factor: 1 },
  { name: 'وردة سقف', kind: 'count', factor: 1 },
];

/** أسماء الغرف المقترحة. */
export const SITE_JOB_ROOMS = ['صالون', 'غرفة الضيوف', 'غرفة نوم', 'غرفة أولاد', 'مطبخ', 'حمام', 'ممر', 'مدخل', 'شرفة', 'محل'];

/** القياسات المعتادة عند الخياط (بالسنتيمتر). يمكن إضافة غيرها لكل زبون. */
export const TAILOR_MEASUREMENTS = [
  'الطول الكامل',
  'الكتف',
  'الصدر',
  'الخصر',
  'الورك',
  'طول الكم',
  'محيط الزند',
  'الرسغ',
  'الرقبة',
  'طول البنطال',
  'محيط الفخذ',
  'فتحة الرجل',
  'طول التنورة / الفستان',
];

/** أنواع القطع المقترحة في طلب التفصيل. */
export const TAILOR_GARMENTS = ['ثوب', 'جلابية', 'بدلة رجالية', 'جاكيت', 'بنطال', 'قميص', 'فستان', 'عباية', 'تنورة', 'تقصير', 'تضييق', 'تصليح'];

export const ACTIVITY_LIST = Object.values(ACTIVITIES);

export function hasFeature(activity: Activity | undefined, feature: Feature): boolean {
  return ACTIVITIES[activity ?? 'general'].features.includes(feature);
}

/** وصف كل ميزة ليختار المستخدم ما يناسبه بحرية مهما كان نشاطه. */
export const FEATURE_INFO: Record<Feature, { name: string; description: string }> = {
  pos: { name: 'نقطة البيع (كاشير)', description: 'شاشة بيع سريع بالباركود والبحث' },
  repairs: { name: 'أوامر الصيانة', description: 'استلام أعطال، قطع وأجور يد، تسليم وفوترة' },
  vehicles: { name: 'بطاقات السيارات', description: 'سجل سيارات الزبائن ولوحاتها وتاريخ صيانتها' },
  devices: { name: 'بطاقات الأجهزة', description: 'سجل أجهزة الزبائن (موبايل، لابتوب) بالـ IMEI' },
  partNumbers: { name: 'أرقام القطع والتوافق', description: 'رقم القطعة الأصلي والسيارات/الأجهزة المتوافقة' },
  batches: { name: 'الدفعات والصلاحية', description: 'تتبع تواريخ الانتهاء والبيع من الأقرب انتهاءً' },
  serials: { name: 'الأرقام التسلسلية', description: 'تسجيل IMEI أو الرقم التسلسلي لكل قطعة' },
  variants: { name: 'المقاسات والألوان', description: 'توليد مواد بكل المقاسات والألوان من موديل واحد' },
  scale: { name: 'البيع بالوزن', description: 'قراءة باركود الميزان الإلكتروني' },
  recipes: { name: 'الأصناف المركّبة (مكوّنات)', description: 'صنف يتكون من مواد أخرى تنقص من المخزون عند بيعه' },
  production: { name: 'الإنتاج والتصنيع', description: 'تحويل مواد أولية إلى منتجات بتكلفتها' },
  tables: { name: 'الطاولات والطلبات', description: 'طلبات صالة وسفري وتوصيل وطباعة للمطبخ' },
  appointments: { name: 'المواعيد', description: 'حجز مواعيد للزبائن والمراجعين وفوترتها' },
  priceTiers: { name: 'شرائح الأسعار', description: 'سعر مفرق وجملة وخاص حسب الزبون' },
  units: { name: 'وحدات متعددة', description: 'بيع وشراء بالقطعة والعلبة والكرتونة' },
  salesmen: { name: 'مندوبو المبيعات', description: 'تسجيل المندوب على الفاتورة وتقرير مبيعاته' },
  tailoring: { name: 'طلبات التفصيل والقياسات', description: 'قياسات الزبائن، طلبات بموعد تسليم وبروفة، عربون' },
  installments: { name: 'التقسيط', description: 'خطط أقساط شهرية مع زيادة تقسيط وكفيل، تحصيل الأقساط ومتابعة المتأخر' },
  pcBuild: { name: 'تجميعات كمبيوتر', description: 'تجميع كمبيوتر من القطع (معالج، رام، هارد، كرت...) مع أجور التجميع، كعرض سعر أو بيع مباشر' },
  tradeIn: { name: 'شراء مستعمل واستبدال', description: 'شراء أجهزة مستعملة من الزبائن برقمها وحالتها، والبيع مع استبدال الجهاز القديم' },
  sitejobs: { name: 'مشاريع التنفيذ (كشف بالأمتار)', description: 'كشف عند الزبون بالغرف: طول × عرض، مرد ومتر جر، سعر المتر، دفعات وفاتورة، وسجل لكل زبون' },
  shipments: { name: 'الشحنات والتخليص الجمركي', description: 'كل سيارة بسائقها ورقمها ووجهتها وبضاعتها، أجار وتخليص ورسوم، حالة الشحنة، وفاتورة للزبون' },
  stoneblocks: { name: 'الكتل والقص (منشرة حجر)', description: 'كتل حجر بالأبعاد والمتر المكعب، قص لألواح وبلاط بالمتر المربع، الباقي والهدر وتكلفة كل متر' },
  workshop: { name: 'ورشة الخياطة (قص وخياطة بالجملة)', description: 'استلام أتواب قماش الزبون برقم وطول، قصّات بالمقاسات، تسليم دفعات وفوترة بالقطعة' },
};

export const ALL_FEATURES = Object.keys(FEATURE_INFO) as Feature[];

/** ملف النشاط بعد تطبيق تخصيصات المستخدم. */
export function effectiveProfile(info: Pick<CompanyInfo, 'activity' | 'customize'> | null | undefined): ActivityProfile {
  const base = ACTIVITIES[info?.activity ?? 'general'] ?? ACTIVITIES.general;
  const c = info?.customize;
  if (!c) return base;
  const on = (c.featuresOn ?? []).filter((f): f is Feature => f in FEATURE_INFO);
  const off = new Set(c.featuresOff ?? []);
  return {
    ...base,
    features: [...new Set([...base.features, ...on])].filter((f) => !off.has(f)),
    categories: c.categories ?? base.categories,
    units: c.units?.length ? c.units : base.units,
    attributes: c.attributes ?? base.attributes ?? [],
    itemLabel: c.itemLabel?.trim() || base.itemLabel,
    quickNotes: base.quickNotes ?? [],
    itemsLabel: c.itemsLabel?.trim() || base.itemsLabel,
  };
}

/** لون المادة (خاصية «اللون»)، متل لون الموبايل. */
export function itemColor(item: { attributes?: Record<string, string> } | undefined | null): string {
  return item?.attributes?.['اللون']?.trim() ?? '';
}

/** اسم المادة مع لونها (Redmi A5 3/64 — أزرق)، إلا إذا الاسم فيه اللون أصلاً. */
export function itemTitle(item: { name: string; attributes?: Record<string, string> }): string {
  const c = itemColor(item);
  return c && !item.name.includes(c) ? `${item.name} — ${c}` : item.name;
}

/** خصائص المادة المقترحة حسب تصنيفها ضمن النشاط. */
export function attributesFor(profile: ActivityProfile, category?: string): string[] {
  const set = category ? profile.attributeSets?.find((x) => x.match.test(category)) : undefined;
  return set ? set.attributes : (profile.attributes ?? []);
}
