import type { Ledger } from './ledger';
import type { Item, PrintJobLine } from './types';

// بيانات تجريبية جاهزة لعرض البرنامج حسب النشاط (مطعم، خياطة، محل عام).
// الأسعار بالليرة السورية الجديدة (منزلتين عشريتين).

const P = (major: number) => Math.round(major * 100);
const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

function item(l: Ledger, it: Omit<Item, 'priceCurrency'> & { priceCurrency?: string }): void {
  l.saveItem({ priceCurrency: 'SYP', ...it });
}

function restaurant(l: Ledger): void {
  const raw: [string, string, string, number, number][] = [
    ['r-chicken', 'صدر دجاج', 'كيلو', 300, 60],
    ['r-lamb', 'لحم غنم', 'كيلو', 1500, 30],
    ['r-bread', 'خبز صاج', 'ربطة', 30, 200],
    ['r-chickpea', 'حمص حب', 'كيلو', 150, 20],
    ['r-tahini', 'طحينة', 'كيلو', 400, 10],
    ['r-potato', 'بطاطا', 'كيلو', 60, 50],
    ['r-lemon', 'ليمون', 'كيلو', 100, 15],
    ['r-veg', 'خضرة سلطة', 'كيلو', 80, 25],
    ['r-eggplant', 'باذنجان', 'كيلو', 60, 20],
  ];
  for (const [id, name, unit] of raw) item(l, { id, code: id.toUpperCase(), name, kind: 'stock', unit, price: 0, category: 'مواد أولية', minStock: 5 });
  item(l, { id: 'm-cola', code: 'D1', name: 'كولا', kind: 'stock', unit: 'علبة', price: P(80), category: 'مشروبات', minStock: 24 });
  item(l, { id: 'm-water', code: 'D2', name: 'مياه معدنية', kind: 'stock', unit: 'عبوة', price: P(40), category: 'مشروبات', minStock: 24 });
  l.adjustStock({
    kind: 'opening',
    date: day(-7),
    lines: [...raw.map(([id, , , cost, qty]) => ({ itemId: id, qty, unitCost: P(cost) })), { itemId: 'm-cola', qty: 120, unitCost: P(50) }, { itemId: 'm-water', qty: 120, unitCost: P(20) }],
    memo: 'بضاعة أول المدة (تجريبي)',
  });
  const menu: [string, string, string, number, [string, number][]][] = [
    ['m-taouk', 'شيش طاووق', 'مشاوي', 650, [['r-chicken', 0.3], ['r-bread', 0.1], ['r-potato', 0.1]]],
    ['m-kabab', 'كباب حلبي', 'مشاوي', 750, [['r-lamb', 0.25], ['r-bread', 0.1]]],
    ['m-mix', 'مشاوي مشكلة', 'مشاوي', 1200, [['r-lamb', 0.25], ['r-chicken', 0.25], ['r-bread', 0.15], ['r-potato', 0.15]]],
    ['m-shawarma', 'شاورما دجاج سندويش', 'سندويش', 250, [['r-chicken', 0.12], ['r-bread', 0.1]]],
    ['m-shawarma-plate', 'صحن شاورما', 'سندويش', 550, [['r-chicken', 0.25], ['r-bread', 0.1], ['r-potato', 0.15]]],
    ['m-falafel', 'فلافل سندويش', 'سندويش', 100, [['r-chickpea', 0.08], ['r-bread', 0.1]]],
    ['m-hummus', 'حمص', 'مقبلات', 200, [['r-chickpea', 0.15], ['r-tahini', 0.04], ['r-lemon', 0.02]]],
    ['m-mutabal', 'متبل', 'مقبلات', 200, [['r-eggplant', 0.3], ['r-tahini', 0.04]]],
    ['m-fattoush', 'فتوش', 'مقبلات', 220, [['r-veg', 0.25], ['r-bread', 0.05], ['r-lemon', 0.02]]],
    ['m-fries', 'بطاطا مقلية', 'مقبلات', 180, [['r-potato', 0.3]]],
    ['m-lemonade', 'ليمون بالنعنع', 'مشروبات', 150, [['r-lemon', 0.1]]],
  ];
  for (const [id, name, category, price, recipe] of menu) {
    item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'composite', unit: 'صحن', price: P(price), category, recipe: recipe.map(([itemId, qty]) => ({ itemId, qty })) });
  }
  item(l, { id: 'm-tea', code: 'TEA', name: 'شاي', kind: 'service', unit: 'كاسة', price: P(50), category: 'مشروبات' });
  item(l, { id: 'm-coffee', code: 'COF', name: 'قهوة عربية', kind: 'service', unit: 'فنجان', price: P(70), category: 'مشروبات' });
  item(l, { id: 'm-kunafa', code: 'KUN', name: 'كنافة نابلسية', kind: 'service', unit: 'صحن', price: P(300), category: 'حلويات' });

  const areas: [string, number, number][] = [
    ['الصالة', 8, 4],
    ['التراس', 4, 4],
    ['عائلي', 3, 6],
  ];
  for (const [area, n, seats] of areas) for (let i = 1; i <= n; i++) l.saveTable({ id: `t-${area}-${i}`, name: `${area === 'الصالة' ? 'طاولة' : area} ${i}`, area, seats });

  l.saveParty({ id: 'c-company', kind: 'customer', name: 'شركة الأمل (حساب شهري)', phone: '0933 444 555' });
  l.saveParty({ id: 's-meat', kind: 'supplier', name: 'ملحمة الشام', phone: '0944 777 888' });

  // طلبين انسكّروا اليوم (مبيعات)، وطلبات مفتوحة بحالات مختلفة
  const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const line = (itemId: string, qty: number, price: number, extra: object = {}) => ({ id: crypto.randomUUID(), itemId, qty, price: P(price), ...extra });
  const done1 = l.saveOrder({ id: crypto.randomUUID(), type: 'dine_in', tableId: 't-الصالة-5', status: 'open', guests: 2, lines: [line('m-taouk', 2, 650, { sent: true, ready: true }), line('m-hummus', 1, 200, { sent: true, ready: true }), line('m-cola', 2, 80, { sent: true, ready: true })] });
  l.closeOrder(done1.id, { date: day() });
  const done2 = l.saveOrder({ id: crypto.randomUUID(), type: 'takeaway', tableId: null, status: 'open', lines: [line('m-shawarma', 4, 250, { sent: true, ready: true }), line('m-fries', 2, 180, { sent: true, ready: true })] });
  l.closeOrder(done2.id, { date: day() });

  l.saveOrder({
    id: crypto.randomUUID(),
    type: 'dine_in',
    tableId: 't-الصالة-2',
    status: 'open',
    guests: 4,
    waiter: 'كابتن سامر',
    servicePercent: 10,
    openedAt: at(35),
    lines: [line('m-mix', 1, 1200, { sent: true, sentAt: at(30), ready: true }), line('m-fattoush', 2, 220, { sent: true, sentAt: at(30), ready: true }), line('m-lemonade', 4, 150, { sent: true, sentAt: at(30), ready: true })],
  });
  l.saveOrder({
    id: crypto.randomUUID(),
    type: 'dine_in',
    tableId: 't-التراس-1',
    status: 'open',
    guests: 3,
    waiter: 'كابتن سامر',
    openedAt: at(14),
    lines: [line('m-kabab', 2, 750, { sent: true, sentAt: at(12), note: 'بدون بصل' }), line('m-mutabal', 1, 200, { sent: true, sentAt: at(12), ready: true }), line('m-cola', 3, 80, { sent: true, sentAt: at(12), ready: true })],
  });
  l.saveOrder({
    id: crypto.randomUUID(),
    type: 'dine_in',
    tableId: 't-عائلي-1',
    status: 'open',
    guests: 6,
    openedAt: at(4),
    lines: [line('m-taouk', 3, 650), line('m-hummus', 2, 200), line('m-water', 6, 40)],
  });
  l.saveOrder({
    id: crypto.randomUUID(),
    type: 'delivery',
    tableId: null,
    status: 'open',
    customerName: 'أبو خالد',
    phone: '0955 123 456',
    address: 'المزة — جانب الجامع',
    deliveryFee: P(50),
    openedAt: at(9),
    lines: [line('m-shawarma-plate', 2, 550, { sent: true, sentAt: at(8) }), line('m-falafel', 3, 100, { sent: true, sentAt: at(8), note: 'زيادة صوص' })],
  });
}

function tailor(l: Ledger): void {
  l.saveParty({ id: 'c-samer', kind: 'customer', name: 'أبو سامر', phone: '0944 123 789', measurements: { 'الطول الكامل': '178', الكتف: '47', الصدر: '104', الخصر: '92', 'طول الكم': '63', الرقبة: '41' } });
  l.saveParty({ id: 'c-reem', kind: 'customer', name: 'أم ريم', phone: '0933 778 120', measurements: { 'الطول الكامل': '160', الصدر: '92', الخصر: '76', الورك: '100', 'طول التنورة / الفستان': '120' } });
  l.saveParty({ id: 'c-factory', kind: 'customer', name: 'معمل النور للألبسة', phone: '0955 300 400' });
  l.saveParty({ id: 'c-trader', kind: 'customer', name: 'تاجر الجملة أبو أحمد', phone: '0988 600 700' });
  l.saveParty({ id: 's-fabric', kind: 'supplier', name: 'مستودع الأقمشة', phone: '0944 500 600' });
  item(l, { id: 'f-jokh', code: 'F1', name: 'جوخ إنكليزي كحلي', kind: 'stock', unit: 'متر', price: P(120), category: 'أقمشة', minStock: 10 });
  item(l, { id: 'f-lining', code: 'F2', name: 'بطانة ساتان', kind: 'stock', unit: 'متر', price: P(40), category: 'بطانة', minStock: 10 });
  item(l, { id: 'f-buttons', code: 'F3', name: 'أزرار بدلة', kind: 'stock', unit: 'قطعة', price: P(5), category: 'أزرار وسحابات', minStock: 50 });
  l.adjustStock({ kind: 'opening', date: day(-30), lines: [{ itemId: 'f-jokh', qty: 60, unitCost: P(85) }, { itemId: 'f-lining', qty: 80, unitCost: P(25) }, { itemId: 'f-buttons', qty: 500, unitCost: P(3) }] });
  l.saveTailorOrder({
    id: 'to-1',
    partyId: 'c-samer',
    date: day(-6),
    dueDate: day(4),
    fittingDate: day(),
    status: 'fitting',
    currency: 'SYP',
    garments: [{ description: 'بدلة رجالية', qty: 1, price: P(600) }],
    fabrics: [{ itemId: 'f-jokh', qty: 3, price: P(120) }],
    measurements: { 'الطول الكامل': '178', الكتف: '47', الصدر: '104' },
    tailor: 'أبو فادي',
  });
  l.saveTailorOrder({ id: 'to-2', partyId: 'c-reem', date: day(-9), dueDate: day(-1), status: 'sewing', currency: 'SYP', garments: [{ description: 'فستان سهرة', qty: 1, price: P(900) }], fabrics: [], measurements: {}, ownFabric: '4 متر كريب زيتي', tailor: 'أم فادي' });

  // ورشة الإنتاج: متل دفتر الخياط — رسمة 5 يارد، كل مدة قطعة من كل نمرة
  const rolls = l.receiveRolls({
    partyId: 'c-factory',
    date: day(-10),
    unit: 'yd',
    rolls: [
      { code: '120', fabric: 'جوخ صوف', color: 'كحلي', length: 11000 },
      { code: '140', fabric: 'جوخ صوف', color: 'كحلي', length: 12000 },
      { code: '141', fabric: 'جوخ صوف', color: 'كحلي', length: 9500 },
      { code: '142', fabric: 'جوخ صوف', color: 'أسود', length: 10500 },
    ],
  });
  l.receiveRolls({
    partyId: 'c-trader',
    date: day(-3),
    unit: 'yd',
    rolls: [
      { code: '7781', fabric: 'جينز 12 أونصة', color: 'أزرق غامق', length: 6500 },
      { code: '7782', fabric: 'جينز 12 أونصة', color: 'أزرق غامق', length: 6400 },
    ],
  });
  l.saveWorkOrder({
    id: 'wo-1',
    partyId: 'c-factory',
    date: day(-9),
    dueDate: day(5),
    model: 'جلابية رجالي',
    modelCode: 'J-38',
    sizes: ['38', '40', '42'],
    planned: { '38': 46, '40': 46, '42': 46 },
    unit: 'yd',
    markerLength: 500,
    ratio: { '38': 1, '40': 1, '42': 1 },
    pieceRate: P(40),
    currency: 'SYP',
    status: 'open',
  });
  l.addCut('wo-1', {
    date: day(-7),
    rolls: [
      { rollId: rolls[0]!.id, lays: 22, used: 11000 },
      { rollId: rolls[1]!.id, lays: 24, used: 12000 },
    ],
    pieces: { '38': 46, '40': 46, '42': 46 },
  });
  l.addStage('wo-1', { date: day(-6), stage: 'sewing', pieces: { '38': 46, '40': 46, '42': 46 } });
  l.addStage('wo-1', { date: day(-3), stage: 'done', pieces: { '38': 40, '40': 42, '42': 38 } });
  l.addStage('wo-1', { date: day(-3), stage: 'damaged', pieces: { '42': 2 }, note: 'غلط بالقص' });
  l.addWorkExpense('wo-1', { date: day(-6), kind: 'خيط', amount: P(150), billTo: 'customer' });
  l.addWorkExpense('wo-1', { date: day(-5), kind: 'استيك', description: '3 لفات', amount: P(90), billTo: 'customer' });
  l.addWorkExpense('wo-1', { date: day(-5), kind: 'نقل', amount: P(40), billTo: 'workshop' });
  l.deliverWork('wo-1', { date: day(-2), pieces: { '38': 40, '40': 40, '42': 30 }, invoice: true });
  l.postVoucher({ kind: 'receipt', date: day(-1), amount: P(3000), partyId: 'c-factory', memo: 'دفعة على حساب الشغل' });
  l.saveWorkOrder({
    id: 'wo-2',
    partyId: 'c-trader',
    date: day(-2),
    dueDate: day(12),
    model: 'بنطال جينز رجالي',
    modelCode: 'JN-05',
    sizes: ['30', '32', '34', '36'],
    planned: { '30': 30, '32': 30, '34': 30, '36': 30 },
    unit: 'yd',
    markerLength: 600,
    ratio: { '30': 1, '32': 1, '34': 1, '36': 1 },
    pieceRate: P(45),
    currency: 'SYP',
    status: 'open',
  });
}

function mobile(l: Ledger): void {
  l.setRate({ date: day(-40), currency: 'USD', rate: 120, kind: 'market' });
  l.saveParty({ id: 's-agent', kind: 'supplier', name: 'الوكيل الدولي للاتصالات', phone: '0944 100 200' });
  l.saveParty({ id: 'c-ali', kind: 'customer', name: 'أبو علي', phone: '0933 456 789' });
  l.saveParty({ id: 'c-rana', kind: 'customer', name: 'رنا الحسن', phone: '0955 222 111' });
  l.saveParty({ id: 'c-samer', kind: 'customer', name: 'سامر يوسف', phone: '0988 333 444' });
  const phones: [string, string, number, number, Record<string, string>][] = [
    ['p-a15', 'Samsung Galaxy A15 128GB', 150, 4, { الذاكرة: '128GB', الرام: '6GB', الحالة: 'جديد' }],
    ['p-a55', 'Samsung Galaxy A55 256GB', 380, 3, { الذاكرة: '256GB', الرام: '8GB', الحالة: 'جديد' }],
    ['p-ip13', 'iPhone 13 128GB', 520, 2, { الذاكرة: '128GB', الحالة: 'جديد' }],
    ['p-redmi', 'Redmi Note 13 256GB', 190, 4, { الذاكرة: '256GB', الرام: '8GB', الحالة: 'جديد' }],
  ];
  let imei = 356_700_000_000_100;
  const serialsOf: Record<string, string[]> = {};
  for (const [id, name, usd, qty, attributes] of phones) {
    item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit: 'قطعة', price: P(usd), priceCurrency: 'USD', category: 'موبايلات', trackSerial: true, warrantyMonths: 12, attributes, minStock: 2 });
    serialsOf[id] = Array.from({ length: qty }, () => String((imei += 17)));
  }
  item(l, { id: 'p-used', code: 'USED', name: 'موبايل مستعمل', kind: 'stock', unit: 'قطعة', price: 0, category: 'موبايلات مستعملة', trackSerial: true, attributes: { الحالة: 'مستعمل' } });
  const acc: [string, string, string, number, number][] = [
    ['x-charger', 'شاحن سريع 25W', 'شواحن', 250, 30],
    ['x-cable', 'كبل Type-C', 'شواحن', 80, 50],
    ['x-buds', 'سماعات بلوتوث', 'سماعات', 600, 15],
    ['x-cover', 'كفر سيليكون', 'إكسسوارات', 60, 80],
    ['x-glass', 'لزقة شاشة زجاج', 'إكسسوارات', 40, 100],
  ];
  for (const [id, name, category, price] of acc) item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit: 'قطعة', price: P(price), category, minStock: 10 });
  l.postInvoice({
    kind: 'purchase',
    date: day(-30),
    partyId: 's-agent',
    currency: 'USD',
    lines: phones.map(([id, , usd, qty]) => ({ itemId: id, qty, price: P(Math.round(usd * 0.85)), serials: serialsOf[id]! })),
    paid: 0,
  });
  l.adjustStock({ kind: 'opening', date: day(-30), lines: acc.map(([id, , , price, qty]) => ({ itemId: id, qty, unitCost: P(price * 0.5) })) });
  // لابتوبات وكمبيوترات وقطع
  const laptops: [string, string, number, number, Record<string, string>][] = [
    ['l-dell', 'Dell Latitude 5440', 650, 3, { المعالج: 'Core i5-1335U', الرام: '16GB', التخزين: 'SSD 512GB', الشاشة: '14 FHD', النظام: 'Windows 11', الحالة: 'جديد' }],
    ['l-hp', 'HP ProBook 450 G10', 720, 2, { المعالج: 'Core i7-1355U', الرام: '16GB', التخزين: 'SSD 512GB', الشاشة: '15.6 FHD', الحالة: 'جديد' }],
    ['l-lenovo', 'Lenovo IdeaPad 3', 430, 3, { المعالج: 'Ryzen 5 7520U', الرام: '8GB', التخزين: 'SSD 256GB', الشاشة: '15.6 FHD', الحالة: 'جديد' }],
  ];
  let sn = 0;
  for (const [id, name, usd, qty, attributes] of laptops) {
    item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit: 'قطعة', price: P(usd), priceCurrency: 'USD', category: 'لابتوب', trackSerial: true, warrantyMonths: 12, attributes, minStock: 1 });
    serialsOf[id] = Array.from({ length: qty }, () => `${id.slice(2, 4).toUpperCase()}${String(48201 + sn++).padStart(7, '0')}`);
  }
  item(l, { id: 'l-used', code: 'LUSED', name: 'لابتوب مستعمل', kind: 'stock', unit: 'قطعة', price: 0, category: 'لابتوب مستعمل', trackSerial: true, attributes: { الحالة: 'مستعمل' } });
  const parts: [string, string, string, number, number, boolean][] = [
    ['c-cpu', 'Intel Core i5-12400F', 'معالجات', 140, 4, false],
    ['c-board', 'MSI PRO B760M-E DDR4', 'مازربورد', 115, 4, false],
    ['c-ram', 'RAM 16GB DDR4 3200', 'رامات', 38, 10, false],
    ['c-ssd', 'SSD NVMe 512GB', 'هاردات و SSD', 42, 10, false],
    ['c-gpu', 'RTX 3060 12GB', 'كروت شاشة', 290, 2, true],
    ['c-psu', 'باور 650W + كيس', 'باور وكيسات', 75, 4, false],
    ['c-mon', 'شاشة 24 بوصة IPS 75Hz', 'شاشات', 115, 4, false],
  ];
  for (const [id, name, category, usd, , serial] of parts) item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit: 'قطعة', price: P(usd), priceCurrency: 'USD', category, ...(serial ? { trackSerial: true, warrantyMonths: 24 } : {}), minStock: 2 });
  serialsOf['c-gpu'] = ['RTX3060-77120', 'RTX3060-77121'];
  l.postInvoice({
    kind: 'purchase',
    date: day(-28),
    partyId: 's-agent',
    currency: 'USD',
    lines: [
      ...laptops.map(([id, , usd, qty]) => ({ itemId: id, qty, price: P(Math.round(usd * 0.85)), serials: serialsOf[id]! })),
      ...parts.map(([id, , , usd, qty, serial]) => ({ itemId: id, qty, price: P(Math.round(usd * 0.8)), ...(serial ? { serials: serialsOf[id]! } : {}) })),
    ],
    paid: 0,
  });
  // تجميعة كمبيوتر مبيوعة
  const usd = (n: number) => P(n * 121);
  l.postInvoice({
    kind: 'sale',
    date: day(-4),
    partyId: 'c-samer',
    lines: [
      { itemId: 'c-cpu', qty: 1, price: usd(140) },
      { itemId: 'c-board', qty: 1, price: usd(115) },
      { itemId: 'c-ram', qty: 2, price: usd(38) },
      { itemId: 'c-ssd', qty: 1, price: usd(42) },
      { itemId: 'c-gpu', qty: 1, price: usd(290), serials: ['RTX3060-77120'] },
      { itemId: 'c-psu', qty: 1, price: usd(75) },
      { description: 'أجور تجميع وتنصيب', qty: 1, price: P(1500) },
    ],
    paid: usd(738) + P(1500),
    notes: 'تجميعة جيمنج i5 — معالج i5-12400F · RTX 3060 · 32GB',
  });
  // بيع نقدي بالليرة
  l.postInvoice({ kind: 'sale', date: day(-6), partyId: 'c-rana', lines: [{ itemId: 'p-a15', qty: 1, price: P(150 * 121), serials: [serialsOf['p-a15']![0]!] }, { itemId: 'x-cover', qty: 1, price: P(60) }, { itemId: 'x-glass', qty: 1, price: P(40) }], paid: P(150 * 121 + 100) });
  // بيع بالتقسيط: دفعة أولى والباقي على 6 أشهر
  const inst = l.postInvoice({ kind: 'sale', date: day(-65), partyId: 'c-ali', lines: [{ itemId: 'p-a55', qty: 1, price: P(380 * 120), serials: [serialsOf['p-a55']![0]!] }], paid: P(10000) });
  const plan = l.createInstallmentPlan({ partyId: 'c-ali', date: day(-65), invoiceId: inst.id, principal: inst.total - inst.paid, markupPercent: 10, count: 6, firstDue: day(-35), guarantor: 'أبو محمد', guarantorPhone: '0944 999 888' });
  l.collectInstallment(plan.id, { date: day(-34), amount: plan.schedule[0]!.amount });
  // بيع مع استبدال
  l.tradeIn({
    date: day(-2),
    partyId: 'c-samer',
    sale: [{ itemId: 'p-ip13', qty: 1, price: P(520 * 121), serials: [serialsOf['p-ip13']![0]!] }],
    tradeIn: [{ itemId: 'p-used', description: 'iPhone 11 64GB مستعمل', qty: 1, price: P(230 * 121), serials: ['353999000011122'], note: 'بطارية 84% — نظيف' }],
    received: P(290 * 121),
  });
}

function general(l: Ledger): void {
  l.saveParty({ id: 'c-1', kind: 'customer', name: 'أبو خالد', phone: '0933 111 222' });
  l.saveParty({ id: 'c-2', kind: 'customer', name: 'ميني ماركت الريان', phone: '0944 555 666', priceTier: 'wholesale' });
  l.saveParty({ id: 's-1', kind: 'supplier', name: 'شركة النجمة للتوزيع', phone: '0944 222 333' });
  const goods: [string, string, string, number, number, number][] = [
    ['g-rice', 'رز مصري 1 كغ', 'مواد غذائية', 1800, 1650, 60],
    ['g-sugar', 'سكر 1 كغ', 'مواد غذائية', 1200, 1100, 80],
    ['g-tea', 'شاي أسود 400غ', 'مواد غذائية', 3800, 3500, 30],
    ['g-oil', 'زيت دوار الشمس 1 لتر', 'مواد غذائية', 2200, 2050, 40],
    ['g-milk', 'حليب طويل الأجل 1 لتر', 'ألبان', 1500, 1350, 36],
    ['g-soap', 'مسحوق غسيل 3 كغ', 'منظفات', 6500, 6000, 15],
  ];
  for (const [id, name, category, price, whole] of goods) item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit: 'قطعة', price: P(price), wholesalePrice: P(whole), category, minStock: 10 });
  l.postInvoice({ kind: 'purchase', date: day(-5), partyId: 's-1', lines: goods.map(([id, , , price, , qty]) => ({ itemId: id, qty, price: P(price * 0.75) })), paid: 0 });
  l.postInvoice({ kind: 'sale', date: day(), partyId: 'c-2', lines: [{ itemId: 'g-rice', qty: 10, price: P(1650) }, { itemId: 'g-oil', qty: 6, price: P(2050) }], paid: P(20000) });
}

function sweets(l: Ledger): void {
  l.saveParty({ id: 'c-1', kind: 'customer', name: 'أم سامر', phone: '0933 222 444' });
  l.saveParty({ id: 'c-2', kind: 'customer', name: 'صالة أفراح الياسمين', phone: '0944 777 888' });
  l.saveParty({ id: 's-1', kind: 'supplier', name: 'مؤسسة الشام للمواد الغذائية', phone: '0944 333 111' });
  // حلويات بالكيلو، ومعها علب جاهزة بسعرها
  const box = (half: number, kilo: number) => [
    { name: 'علبة نص كيلو', factor: 0.5, price: P(half) },
    { name: 'علبة كيلو', factor: 1, price: P(kilo) },
  ];
  item(l, { id: 'sw-baklava', code: 'SW1', name: 'بقلاوة بالفستق', kind: 'stock', unit: 'كيلو', price: P(1800), category: 'حلويات عربية', units: box(950, 1850), trackExpiry: true, minStock: 3 });
  item(l, { id: 'sw-mabrouma', code: 'SW2', name: 'مبرومة', kind: 'stock', unit: 'كيلو', price: P(1700), category: 'حلويات عربية', units: box(900, 1750), trackExpiry: true, minStock: 3 });
  item(l, { id: 'sw-maamoul', code: 'SW3', name: 'معمول بالتمر', kind: 'stock', unit: 'كيلو', price: P(600), category: 'حلويات عربية', units: box(320, 620), minStock: 3 });
  item(l, { id: 'sw-knafeh', code: 'SW4', name: 'كنافة نابلسية', kind: 'stock', unit: 'كيلو', price: P(900), category: 'حلويات عربية', units: [{ name: 'صحن', factor: 0.25, price: P(240) }], minStock: 2 });
  item(l, { id: 'sw-cake', code: 'SW5', name: 'قطعة كاتو شوكولا', kind: 'stock', unit: 'قطعة', price: P(120), category: 'كاتو وتورتات', minStock: 10 });
  item(l, { id: 'sw-torte', code: 'SW6', name: 'تورتة عيد ميلاد', kind: 'stock', unit: 'قطعة', price: P(1500), category: 'كاتو وتورتات', minStock: 1 });
  // البوظة بالكيلو، والكاسات والكونو وحدات بسعرها
  item(l, {
    id: 'sw-icecream', code: 'IC1', name: 'بوظة عربية', kind: 'stock', unit: 'كيلو', price: P(700), category: 'بوظة', minStock: 4,
    units: [
      { name: 'كاسة صغيرة', factor: 0.1, price: P(80) },
      { name: 'كاسة وسط', factor: 0.15, price: P(120) },
      { name: 'كاسة كبيرة', factor: 0.25, price: P(180) },
      { name: 'كونو', factor: 0.1, price: P(90) },
    ],
  });
  item(l, { id: 'sw-juice', code: 'D1', name: 'عصير برتقال طازج', kind: 'stock', unit: 'كاسة', price: P(100), category: 'مشروبات', minStock: 10 });
  const raw: [string, string, number, number][] = [
    ['sw-ghee', 'سمنة عربية', 450, 20],
    ['sw-pistachio', 'فستق حلبي', 1100, 10],
    ['sw-sugar', 'سكر', 120, 50],
    ['sw-flour', 'طحين', 70, 50],
  ];
  for (const [id, name] of raw) item(l, { id, code: id.slice(3).toUpperCase(), name, kind: 'stock', unit: 'كيلو', price: 0, category: 'مواد أولية', minStock: 5 });
  l.adjustStock({
    kind: 'opening',
    date: day(-3),
    lines: [
      ...raw.map(([id, , cost, qty]) => ({ itemId: id, qty, unitCost: P(cost) })),
      { itemId: 'sw-baklava', qty: 12, unitCost: P(1100), batch: 'B-' + day(-1).slice(5), expiry: day(10) },
      { itemId: 'sw-mabrouma', qty: 10, unitCost: P(1050), batch: 'M-' + day(-1).slice(5), expiry: day(10) },
      { itemId: 'sw-maamoul', qty: 15, unitCost: P(350) },
      { itemId: 'sw-knafeh', qty: 6, unitCost: P(500) },
      { itemId: 'sw-cake', qty: 40, unitCost: P(60) },
      { itemId: 'sw-torte', qty: 3, unitCost: P(800) },
      { itemId: 'sw-icecream', qty: 20, unitCost: P(300) },
      { itemId: 'sw-juice', qty: 50, unitCost: P(40) },
    ],
    memo: 'بضاعة أول المدة (تجريبي)',
  });
  l.postInvoice({
    kind: 'sale', date: day(), partyId: null, paid: P(1850 + 240 + 2 * 120),
    lines: [
      { itemId: 'sw-baklava', qty: 1, unit: 'علبة كيلو', price: P(1850), note: 'علبة هدية' },
      { itemId: 'sw-knafeh', qty: 1, unit: 'صحن', price: P(240) },
      { itemId: 'sw-icecream', qty: 2, unit: 'كاسة وسط', price: P(120), note: 'فستق حلبي، قشطة' },
    ],
  });
  l.postInvoice({ kind: 'sale', date: day(), partyId: 'c-2', paid: P(5000), lines: [{ itemId: 'sw-mabrouma', qty: 4, price: P(1700) }, { itemId: 'sw-torte', qty: 1, price: P(1500) }] });
}

/** يعبّي شركة فاضية ببيانات تجريبية مناسبة لنشاطها. */
function supermarket(l: Ledger): void {
  l.saveParty({ id: 'c-1', kind: 'customer', name: 'أبو خالد', phone: '0933 111 222' });
  l.saveParty({ id: 'c-2', kind: 'customer', name: 'أم محمد', phone: '0955 333 444' });
  l.saveParty({ id: 'c-3', kind: 'customer', name: 'مطعم الضيعة', phone: '0944 555 666', priceTier: 'wholesale' });
  l.saveParty({ id: 's-1', kind: 'supplier', name: 'شركة النجمة للتوزيع', phone: '0944 222 333' });
  l.saveParty({ id: 's-2', kind: 'supplier', name: 'ألبان الشام', phone: '0933 444 777' });
  // [id، الاسم، التصنيف، المفرق، الجملة، الباركود، الكرتونة/الشدّة، عدد القطع فيها، الحد الأدنى، صلاحية]
  const goods: [string, string, string, number, number, string, string, number, number, boolean][] = [
    ['g-rice', 'رز مصري 1 كغ', 'مواد غذائية', 1800, 1650, '6210001000017', 'كرتونة', 10, 10, false],
    ['g-sugar', 'سكر 1 كغ', 'مواد غذائية', 1200, 1100, '6210001000024', 'كرتونة', 10, 10, false],
    ['g-tea', 'شاي أسود 400غ', 'مواد غذائية', 3800, 3500, '6210001000031', 'كرتونة', 24, 10, false],
    ['g-oil', 'زيت دوار الشمس 1 لتر', 'مواد غذائية', 2200, 2050, '6210001000048', 'كرتونة', 12, 12, false],
    ['g-pasta', 'معكرونة 500غ', 'مواد غذائية', 650, 590, '6210001000055', 'كرتونة', 20, 20, false],
    ['g-tuna', 'تونة 160غ', 'معلبات', 1400, 1300, '6210001000062', 'شدّة', 4, 12, false],
    ['g-milk', 'حليب طويل الأجل 1 لتر', 'ألبان وأجبان', 1500, 1350, '6210002000016', 'كرتونة', 12, 12, true],
    ['g-yogurt', 'لبن رايب 1 كغ', 'ألبان وأجبان', 1300, 1200, '6210002000023', 'كرتونة', 6, 6, true],
    ['g-water', 'مياه معدنية 1.5 لتر', 'مشروبات', 400, 350, '6210003000015', 'شدّة', 6, 24, false],
    ['g-cola', 'مشروب غازي 330مل', 'مشروبات', 450, 400, '6210003000022', 'شدّة', 24, 24, false],
    ['g-biscuit', 'بسكويت بالشوكولا', 'سكاكر', 300, 270, '6210004000014', 'علبة', 12, 12, false],
    ['g-soap', 'مسحوق غسيل 3 كغ', 'منظفات', 6500, 6000, '6210005000013', 'كرتونة', 4, 4, false],
  ];
  for (const [id, name, category, price, whole, barcode, box, n, minStock, expiry] of goods) {
    item(l, {
      id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit: 'قطعة', price: P(price), wholesalePrice: P(whole), barcode, category, minStock,
      units: [{ name: box, factor: n, price: P(whole * n), barcode: barcode.slice(0, 11) + '9' + barcode[12] }],
      ...(expiry ? { trackExpiry: true } : {}),
    });
  }
  // بالوزن: رمز المادة هو اللي بيطبعه الميزان بالباركود (21 + رمز من 5 أرقام + الوزن)
  const weighed: [string, string, string, string, number][] = [
    ['w-cheese', '101', 'جبنة بلدية', 'ألبان وأجبان', 9000],
    ['w-labneh', '102', 'لبنة', 'ألبان وأجبان', 6000],
    ['w-tomato', '201', 'بندورة', 'خضار وفواكه', 900],
    ['w-cucumber', '202', 'خيار', 'خضار وفواكه', 800],
    ['w-banana', '203', 'موز', 'خضار وفواكه', 1600],
    ['w-potato', '204', 'بطاطا', 'خضار وفواكه', 700],
  ];
  for (const [id, code, name, category, price] of weighed) {
    item(l, { id, code, name, kind: 'stock', unit: 'كيلو', price: P(price), category, weighed: true, minStock: 5, ...(category === 'ألبان وأجبان' ? { trackExpiry: true } : {}) });
  }
  item(l, { id: 'g-bread', code: 'BREAD', name: 'خبز', kind: 'stock', unit: 'ربطة', price: P(500), category: 'مواد غذائية', minStock: 10 });
  // بضاعة أول المدة: الشاي والزيت قرّبوا يخلصوا، والألبان قرّبت صلاحيتها
  const qty: Record<string, number> = { 'g-rice': 60, 'g-sugar': 80, 'g-tea': 6, 'g-oil': 8, 'g-pasta': 100, 'g-tuna': 48, 'g-water': 120, 'g-cola': 96, 'g-biscuit': 60, 'g-soap': 15, 'g-bread': 40 };
  l.adjustStock({
    kind: 'opening',
    date: day(-5),
    lines: [
      ...goods.filter(([id]) => qty[id]).map(([id, , , price]) => ({ itemId: id, qty: qty[id]!, unitCost: P(price * 0.78) })),
      { itemId: 'g-bread', qty: 40, unitCost: P(400) },
      { itemId: 'g-milk', qty: 24, unitCost: P(1150), batch: 'MK-' + day(-20).slice(5), expiry: day(4) },
      { itemId: 'g-milk', qty: 36, unitCost: P(1150), batch: 'MK-' + day(-2).slice(5), expiry: day(80) },
      { itemId: 'g-yogurt', qty: 12, unitCost: P(1000), batch: 'YG-' + day(-6).slice(5), expiry: day(2) },
      { itemId: 'w-cheese', qty: 18, unitCost: P(7000), batch: 'CH-' + day(-8).slice(5), expiry: day(6) },
      { itemId: 'w-labneh', qty: 10, unitCost: P(4500), batch: 'LB-' + day(-3).slice(5), expiry: day(9) },
      { itemId: 'w-tomato', qty: 40, unitCost: P(650) },
      { itemId: 'w-cucumber', qty: 30, unitCost: P(550) },
      { itemId: 'w-banana', qty: 3, unitCost: P(1200) },
      { itemId: 'w-potato', qty: 50, unitCost: P(500) },
    ],
    memo: 'بضاعة أول المدة (تجريبي)',
  });
  // مبيعات اليوم: كاش، ودين على الزباين، وجملة للمطعم
  const sale = (partyId: string | null, paidShare: number, lines: { itemId: string; qty: number; price: number; unit?: string }[]) => {
    const total = lines.reduce((a, x) => a + x.qty * x.price, 0);
    l.postInvoice({ kind: 'sale', date: day(), partyId, paid: P(total * paidShare), lines: lines.map((x) => ({ ...x, price: P(x.price) })) as never });
  };
  sale(null, 1, [{ itemId: 'g-rice', qty: 2, price: 1800 }, { itemId: 'g-milk', qty: 2, price: 1500 }, { itemId: 'w-tomato', qty: 1.5, price: 900 }, { itemId: 'g-bread', qty: 2, price: 500 }]);
  sale(null, 1, [{ itemId: 'w-cheese', qty: 0.75, price: 9000 }, { itemId: 'g-tea', qty: 1, price: 3800 }, { itemId: 'g-cola', qty: 6, price: 450 }]);
  sale('c-1', 0, [{ itemId: 'g-oil', qty: 2, price: 2200 }, { itemId: 'g-sugar', qty: 3, price: 1200 }, { itemId: 'w-labneh', qty: 0.5, price: 6000 }]);
  sale('c-2', 0.4, [{ itemId: 'g-soap', qty: 1, price: 6500 }, { itemId: 'g-pasta', qty: 4, price: 650 }, { itemId: 'w-banana', qty: 1, price: 1600 }]);
  sale('c-3', 0.5, [{ itemId: 'g-water', qty: 1, unit: 'شدّة', price: 350 * 6 }, { itemId: 'g-rice', qty: 1, unit: 'كرتونة', price: 1650 * 10 }, { itemId: 'w-potato', qty: 10, price: 700 }]);
  sale(null, 1, [{ itemId: 'g-biscuit', qty: 3, price: 300 }, { itemId: 'g-water', qty: 2, price: 400 }, { itemId: 'w-cucumber', qty: 1, price: 800 }]);
}

function gypsum(l: Ledger): void {
  if (!l.state.rates.some((r) => r.currency === 'USD' && r.date <= day(-200))) l.setRate({ date: day(-200), currency: 'USD', rate: 118, kind: 'market' });
  l.saveParty({ id: 'c-abuhasan', kind: 'customer', name: 'أبو حسن العاص', phone: '0944 210 330', notes: 'حماة — حي البعث، بناية الصيدلية، الطابق التاني' });
  l.saveParty({ id: 'c-umkhaled', kind: 'customer', name: 'أم خالد', phone: '0933 450 812', notes: 'حماة — الحاضر' });
  l.saveParty({ id: 'c-shop', kind: 'customer', name: 'محل الأمانة للألبسة', phone: '0988 711 205' });
  l.saveParty({ id: 's-gyps', kind: 'supplier', name: 'مستودع مواد الجبس', phone: '0955 100 220' });
  item(l, { id: 'g-board', code: 'G1', name: 'لوح جبس بورد 12مم', kind: 'stock', unit: 'لوح', price: P(6), priceCurrency: 'USD', category: 'ألواح جبس بورد', minStock: 20 });
  item(l, { id: 'g-profile', code: 'G2', name: 'بروفيل سقف 3م', kind: 'stock', unit: 'قطعة', price: P(1.5), priceCurrency: 'USD', category: 'بروفيلات', minStock: 50 });
  item(l, { id: 'g-paste', code: 'G3', name: 'معجونة جبس 20كغ', kind: 'stock', unit: 'كيس', price: P(4), priceCurrency: 'USD', category: 'معجونة وشريط', minStock: 10 });
  l.adjustStock({ kind: 'opening', date: day(-200), lines: [{ itemId: 'g-board', qty: 120, unitCost: P(560) }, { itemId: 'g-profile', qty: 300, unitCost: P(140) }, { itemId: 'g-paste', qty: 40, unitCost: P(380) }] });
  const L = (room: string, name: string, kind: 'area' | 'length' | 'count', length: number, width?: number, factor = 1) => ({ id: `${room}-${name}-${length}`, room, name, kind, length, ...(width ? { width } : {}), factor });
  // الكشف الورقي تبع أبو حسن (من 4 أشهر): مفوتر ومدفوع
  l.saveSiteJob({
    id: 'sj-1',
    partyId: 'c-abuhasan',
    date: day(-125),
    title: 'بيت أبو حسن — سقف وديكور',
    address: 'حي البعث، بناية الصيدلية، الطابق التاني',
    status: 'done',
    currency: 'USD',
    rate: P(6),
    startDate: day(-122),
    endDate: day(-110),
    lines: [
      L('صالون', 'سقف', 'area', 5.5, 3.94),
      L('صالون', 'سقف', 'area', 6.2, 3.99),
      L('صالون', 'مرد جالس', 'length', 68, undefined, 0.5),
      L('صالون', 'مرد لف', 'length', 29),
      L('غرفة الضيوف', 'سقف', 'area', 7.73, 3.98),
      L('غرفة الضيوف', 'مرد جالس', 'length', 41, undefined, 0.5),
      L('غرفة الضيوف', 'مرد لف', 'length', 23.5),
      L('غرفة نوم', 'سقف', 'area', 4.9, 4.78),
      L('غرفة نوم', 'مرد جالس', 'length', 21.3, undefined, 0.5),
      L('غرفة نوم', 'اسرب', 'length', 14.9, undefined, 0.5),
      L('مطبخ', 'سقف', 'area', 5.32, 3.73),
    ],
    extras: [{ description: 'إنارة مخفية (تركيب شريط LED)', amount: P(60) }],
    costs: [{ description: 'مواد (ألواح وبروفيلات ومعجونة)', amount: P(520) }, { description: 'أجور عمال 12 يوم', amount: P(360) }],
    notes: 'الزبون بدو نفس لون الدهان بالممر',
  });
  l.addSiteJobDeposit('sj-1', { date: day(-124), amount: P(500) });
  l.deliverSiteJob('sj-1', { date: day(-110) });
  // مشروع شغّال هلق بدفعة
  l.saveSiteJob({
    id: 'sj-2',
    partyId: 'c-umkhaled',
    date: day(-6),
    title: 'شقة أم خالد',
    address: 'الحاضر، جانب الجامع',
    status: 'working',
    currency: 'USD',
    rate: P(6.5),
    startDate: day(-3),
    lines: [L('صالون', 'سقف', 'area', 6, 4.2), L('صالون', 'مرد جالس', 'length', 40.4, undefined, 0.5), L('صالون', 'إنارة مخفية', 'length', 20.4), L('مدخل', 'سقف', 'area', 2.5, 1.6)],
    extras: [],
    costs: [{ description: 'مواد الدفعة الأولى', amount: P(180) }],
  });
  l.addSiteJobDeposit('sj-2', { date: day(-5), amount: P(150) });
  // كشف جديد لسا ما انعطى سعر
  l.saveSiteJob({ id: 'sj-3', partyId: 'c-shop', date: day(), title: 'محل الأمانة — سقف ثانوي', status: 'survey', currency: 'USD', rate: P(6), lines: [L('محل', 'سقف', 'area', 8, 5), L('محل', 'كرنيش', 'length', 26)], extras: [], costs: [] });
}

function customs(l: Ledger): void {
  // أجور الشحن للخليج غالباً بالريال السعودي
  if (!l.state.currencies['SAR']) l.saveCurrency({ code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', decimals: 2 });
  l.setRate({ date: day(-30), currency: 'SAR', rate: 32.3, kind: 'market' });
  l.saveParty({ id: 'c-madani', kind: 'customer', name: 'أحمد مداني', phone: '0982 359 366' });
  l.saveParty({ id: 'c-fruit', kind: 'customer', name: 'شركة الشام لتصدير الفواكه', phone: '0944 120 330' });
  l.saveParty({ id: 'c-olive', kind: 'customer', name: 'معصرة الزيتون الذهبي', phone: '0933 777 410' });
  const base = { charges: [] as { description: string; amount: number }[], costs: [] as { description: string; amount: number }[] };
  l.saveShipment({
    ...base,
    id: 'sh-1',
    partyId: 'c-madani',
    date: day(-6),
    status: 'delivered',
    driver: 'أحمد مداني بغار',
    driverPhone: '+963 982 359 366',
    plate: '81/41923',
    origin: 'دمشق',
    destination: 'جدة',
    border: 'نصيب',
    goods: 'تفاح',
    packages: 1400,
    refrigerated: true,
    temperature: '+2°',
    currency: 'SAR',
    charges: [{ description: 'أجار سيارة + تخليص', amount: P(16000) }],
    costs: [{ description: 'أجرة السائق والمازوت', amount: P(9000) }, { description: 'رسوم المعبر', amount: P(2500) }],
  });
  l.invoiceShipment('sh-1', { date: day(-5), paid: P(6000) });
  l.saveShipment({
    ...base,
    id: 'sh-2',
    partyId: 'c-fruit',
    date: day(-2),
    status: 'transit',
    driver: 'خالد الحسن',
    driverPhone: '+963 944 555 102',
    plate: '72/55810',
    trailer: 'براد 13م',
    origin: 'اللاذقية',
    destination: 'الرياض',
    border: 'نصيب',
    goods: 'برتقال',
    packages: 1800,
    weight: 24000,
    refrigerated: true,
    currency: 'SAR',
    charges: [{ description: 'أجار سيارة', amount: P(12000) }, { description: 'تخليص جمركي', amount: P(3500) }],
    costs: [],
  });
  l.saveShipment({
    ...base,
    id: 'sh-3',
    partyId: 'c-olive',
    date: day(-1),
    status: 'customs',
    driver: 'محمود العلي',
    plate: '45/10277',
    origin: 'إدلب',
    destination: 'عمّان',
    border: 'نصيب',
    goods: 'زيت زيتون',
    packages: 600,
    declaration: 'SY-2026-88412',
    currency: 'USD',
    charges: [{ description: 'أجار سيارة + تخليص', amount: P(2200) }],
    costs: [],
  });
}

function stone(l: Ledger): void {
  l.saveParty({ id: 'q-aleppo', kind: 'supplier', name: 'مقلع الشيخ سعيد — حلب', phone: '0944 800 120' });
  l.saveParty({ id: 'c-contractor', kind: 'customer', name: 'المتعهد أبو سامر', phone: '0933 402 118', priceTier: 'wholesale' });
  l.saveParty({ id: 'c-villa', kind: 'customer', name: 'فيلا أبو فراس', phone: '0988 640 225' });
  const T = (thick: string) => ({ 'السماكة (سم)': thick, 'نوع الحجر': 'حلبي' });
  item(l, { id: 'st-3', code: 'H3', name: 'حجر حلبي ألواح 3 سم', kind: 'stock', unit: 'م²', price: P(1500), wholesalePrice: P(1350), category: 'ألواح', attributes: T('3') });
  item(l, { id: 'st-5', code: 'H5', name: 'حجر حلبي ألواح 5 سم', kind: 'stock', unit: 'م²', price: P(2300), wholesalePrice: P(2100), category: 'ألواح', attributes: T('5') });
  item(l, { id: 'st-tile', code: 'B40', name: 'بلاط حلبي 40×40', kind: 'stock', unit: 'م²', price: P(1800), category: 'بلاط', attributes: T('2') });
  item(l, { id: 'st-kor', code: 'K15', name: 'كورنيش حلبي 15 سم', kind: 'stock', unit: 'م.ط', price: P(700), category: 'كورنيش وحواف' });
  item(l, { id: 'st-step', code: 'D', name: 'درجة حلبي', kind: 'stock', unit: 'م.ط', price: P(1200), category: 'درج وعتبات' });
  const b1 = l.addStoneBlock({ date: day(-40), partyId: 'q-aleppo', stone: 'حلبي', quarry: 'الشيخ سعيد', length: 2.6, width: 1.5, height: 1.4, pricePerM3: P(9000) });
  l.cutStoneBlock(b1.id, { date: day(-35), volume: 3, outputs: [{ itemId: 'st-3', qty: 60, weight: 1.8 }, { itemId: 'st-5', qty: 15, weight: 0.75 }, { itemId: 'st-kor', qty: 30, weight: 0.15 }] });
  l.cutStoneBlock(b1.id, { date: day(-20), outputs: [{ itemId: 'st-tile', qty: 50, weight: 1 }, { itemId: 'st-step', qty: 12, weight: 0.36 }], close: true });
  l.addStoneBlock({ date: day(-8), partyId: 'q-aleppo', stone: 'حلبي', quarry: 'الشيخ سعيد', length: 2.4, width: 1.6, height: 1.5, pricePerM3: P(9000) });
  l.addStoneBlock({ date: day(-3), stone: 'كركوكي', length: 2, width: 1.2, height: 1.2, pricePerM3: P(7500) });
  l.postInvoice({ kind: 'sale', date: day(-15), partyId: 'c-contractor', lines: [{ itemId: 'st-3', qty: 35, price: P(1350) }, { itemId: 'st-kor', qty: 20, price: P(650) }], paid: P(30000) });
  l.postInvoice({ kind: 'sale', date: day(-4), partyId: 'c-villa', lines: [{ itemId: 'st-tile', qty: 22, price: P(1800) }, { itemId: 'st-step', qty: 6, price: P(1200) }] });
}

function poultry(l: Ledger): void {
  l.addPoultryCuts();
  l.saveParty({ id: 'p-farm', kind: 'supplier', name: 'مدجنة رابعة — صحنايا', phone: '0933 832 575' });
  l.saveParty({ id: 'c-koki', kind: 'customer', name: 'كوكي للدواجن', phone: '0959 513 222', priceTier: 'wholesale' });
  l.saveParty({ id: 'c-abuali', kind: 'customer', name: 'محل أبو علي', phone: '0944 210 377', priceTier: 'wholesale' });
  l.saveParty({ id: 'c-rest', kind: 'customer', name: 'مطعم الشام', phone: '0988 112 450', priceTier: 'wholesale' });
  // تسعيرة: [معرّف، جملة، مستهلك] بالليرة الجديدة للكيلو
  const prices: [string, number, number][] = [
    ['pl-whole', 285, 300], ['pl-wardeh', 280, 300], ['pl-wings', 230, 250], ['pl-fillet', 560, 600], ['pl-drum', 300, 330],
    ['pl-kasta', 320, 350], ['pl-shawarma', 450, 480], ['pl-breast', 400, 430], ['pl-thigh', 290, 310], ['pl-thigh-neck', 260, 280],
    ['pl-back', 80, 100], ['pl-liver', 250, 280], ['pl-gizzard', 280, 300], ['pl-liver-free', 300, 330], ['pl-gizzard-free', 330, 360],
  ];
  const board = (bump: number) => Object.fromEntries(prices.map(([id, w, p]) => [id, { price: P(p + bump), wholesale: P(w + bump) }]));
  l.savePriceBoard(day(-1), board(-10));
  // حمولة مبارح: 3 وزنات، 6 أقفاص فاضية، 75 طير
  l.postInvoice({
    kind: 'purchase', date: day(-1), partyId: 'p-farm', paid: P(40000),
    lines: [
      { itemId: 'pl-whole', qty: 0, price: P(240), weighing: { weights: [99, 110, 114], boxes: 6, tare: 42, count: 75, dead: 1 } },
      { itemId: 'pl-liver', qty: 10, price: P(200) },
      { itemId: 'pl-gizzard', qty: 5, price: P(220) },
    ],
  });
  // تقطيع جزء من الفروج لقطعيات
  l.postProduction({ date: day(-1), inputs: [{ itemId: 'pl-whole', qty: 60 }], outputs: [{ itemId: 'pl-fillet', qty: 15, weight: 30 }, { itemId: 'pl-wings', qty: 8, weight: 7 }, { itemId: 'pl-thigh', qty: 22, weight: 22 }, { itemId: 'pl-back', qty: 12, weight: 3 }], memo: 'تقطيع (تجريبي)' });
  l.postInvoice({ kind: 'sale', date: day(-1), partyId: 'c-koki', lines: [{ itemId: 'pl-whole', qty: 0, price: P(275), weighing: { weights: [48.5, 52], boxes: 3, tare: 21 } }, { itemId: 'pl-liver', qty: 3, price: P(240) }], paid: P(10000) });
  l.savePriceBoard(day(), board(0));
  l.postInvoice({ kind: 'sale', date: day(), partyId: 'c-koki', lines: [{ itemId: 'pl-whole', qty: 0, price: P(285), weighing: { weights: [40, 38.5], boxes: 2, tare: 14 } }, { itemId: 'pl-wings', qty: 7, price: P(230) }, { itemId: 'pl-liver', qty: 2, price: P(250) }], paid: P(15000) });
  l.postInvoice({ kind: 'sale', date: day(), partyId: 'c-abuali', lines: [{ itemId: 'pl-fillet', qty: 6, price: P(560) }, { itemId: 'pl-thigh', qty: 10, price: P(290) }, { itemId: 'pl-whole', qty: 25, price: P(285) }], paid: 0 });
  l.postInvoice({ kind: 'sale', date: day(), partyId: 'c-rest', lines: [{ itemId: 'pl-fillet', qty: 5, price: P(560) }, { itemId: 'pl-gizzard', qty: 2, price: P(280) }], paid: P(3360) });
}

function printshop(l: Ledger): void {
  l.saveParty({ id: 'c-school', kind: 'customer', name: 'مدرسة الأمل الخاصة', phone: '0944 330 120', priceTier: 'wholesale' });
  l.saveParty({ id: 'c-resto', kind: 'customer', name: 'مطعم السلطان', phone: '0933 210 455' });
  l.saveParty({ id: 'c-student', kind: 'customer', name: 'رنا الأحمد', phone: '0988 640 902' });
  l.saveParty({ id: 's-paper', kind: 'supplier', name: 'شركة الورّاق للقرطاسية', phone: '0955 222 870' });
  // قرطاسية وأدوات مدرسية: [id، الاسم، التصنيف، المفرق، الجملة، الباركود، الكمية، التكلفة، الحد الأدنى، الوحدة]
  const goods: [string, string, string, number, number, string, number, number, number, string][] = [
    ['p-pen-blue', 'قلم حبر أزرق', 'أقلام', 50, 40, '6290100000011', 300, 28, 50, 'قطعة'],
    ['p-pen-red', 'قلم حبر أحمر', 'أقلام', 50, 40, '6290100000028', 150, 28, 30, 'قطعة'],
    ['p-pencil', 'قلم رصاص', 'أقلام', 30, 22, '6290100000035', 400, 15, 60, 'قطعة'],
    ['p-colors', 'ألوان خشبية 12 لون', 'أقلام', 450, 400, '6290100000042', 60, 300, 10, 'علبة'],
    ['p-eraser', 'ممحاة', 'قرطاسية', 25, 18, '6290100000059', 250, 12, 40, 'قطعة'],
    ['p-sharpener', 'برّاية', 'قرطاسية', 30, 22, '6290100000066', 200, 15, 30, 'قطعة'],
    ['p-ruler', 'مسطرة 30 سم', 'قرطاسية', 60, 50, '6290100000073', 120, 35, 20, 'قطعة'],
    ['p-nb60', 'دفتر 60 ورقة', 'دفاتر', 150, 130, '6290100000080', 500, 95, 80, 'دفتر'],
    ['p-nb100', 'دفتر 100 ورقة سلك', 'دفاتر', 300, 260, '6290100000097', 200, 190, 40, 'دفتر'],
    ['p-bag', 'حقيبة مدرسية', 'حقائب مدرسية', 4500, 4000, '6290100000103', 25, 3000, 5, 'قطعة'],
    ['p-a4', 'ورق A4 رزمة 500', 'ورق', 1800, 1650, '6290100000110', 40, 1400, 10, 'رزمة'],
  ];
  for (const [id, name, category, price, whole, barcode, , , minStock, unit] of goods) {
    item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit, price: P(price), wholesalePrice: P(whole), barcode, category, minStock });
  }
  item(l, { id: 'p-flex', code: 'FLEX', name: 'رول فلكس 3.2 م', kind: 'stock', unit: 'م²', price: P(0), category: 'مواد طباعة', minStock: 30 });
  item(l, { id: 'p-vinyl', code: 'VINYL', name: 'رول ستيكر فينيل', kind: 'stock', unit: 'م²', price: P(0), category: 'مواد طباعة', minStock: 20 });
  l.adjustStock({
    kind: 'opening',
    date: day(-30),
    lines: [...goods.map(([id, , , , , , qty, cost]) => ({ itemId: id, qty, unitCost: P(cost) })), { itemId: 'p-flex', qty: 160, unitCost: P(450) }, { itemId: 'p-vinyl', qty: 50, unitCost: P(700) }],
    memo: 'بضاعة أول المدة (تجريبي)',
  });
  // خدمات التصوير بالكاشير (بالوجه)
  item(l, { id: 'p-copy-bw', code: 'C1', name: 'تصوير A4 أبيض وأسود', kind: 'service', unit: 'وجه', price: P(25), category: 'خدمات طباعة وتصوير' });
  item(l, { id: 'p-copy-color', code: 'C2', name: 'تصوير A4 ملون', kind: 'service', unit: 'وجه', price: P(100), category: 'خدمات طباعة وتصوير' });
  item(l, { id: 'p-bind', code: 'C3', name: 'تجليد حلزوني', kind: 'service', unit: 'قطعة', price: P(300), category: 'خدمات طباعة وتصوير' });
  // طقم مدرسي جاهز: بيعة وحدة بتنقّص كل مكوّناته
  item(l, {
    id: 'p-kit1', code: 'KIT1', name: 'طقم الصف الأول', kind: 'composite', unit: 'طقم', price: P(6500), category: 'حقائب مدرسية',
    recipe: [{ itemId: 'p-bag', qty: 1 }, { itemId: 'p-nb60', qty: 6 }, { itemId: 'p-pencil', qty: 4 }, { itemId: 'p-eraser', qty: 2 }, { itemId: 'p-sharpener', qty: 1 }, { itemId: 'p-colors', qty: 1 }, { itemId: 'p-ruler', qty: 1 }],
  });
  // مبيعات قرطاسية
  l.postInvoice({ kind: 'sale', date: day(-2), lines: [{ itemId: 'p-nb60', qty: 5, price: P(150) }, { itemId: 'p-pen-blue', qty: 3, price: P(50) }, { itemId: 'p-copy-bw', qty: 40, price: P(25) }] });
  l.postInvoice({ kind: 'sale', date: day(-1), lines: [{ itemId: 'p-kit1', qty: 1, price: P(6500) }] });
  l.postInvoice({ kind: 'sale', date: day(-1), partyId: 'c-school', lines: [{ itemId: 'p-a4', qty: 10, price: P(1650) }, { itemId: 'p-nb100', qty: 50, price: P(260) }], paid: P(15000) });
  l.postInvoice({ kind: 'sale', date: day(), lines: [{ itemId: 'p-colors', qty: 2, price: P(450) }, { itemId: 'p-copy-color', qty: 6, price: P(100) }] });
  // طلبات الطباعة
  const ln = (id: string, x: Partial<PrintJobLine> & Pick<PrintJobLine, 'kind' | 'name' | 'qty' | 'price'>): PrintJobLine => ({ id, ...x });
  l.savePrintJob({
    id: 'pj-1', partyId: 'c-resto', date: day(-6), due: day(-3), title: 'آرمة واجهة المطعم', status: 'ready', currency: 'SYP',
    lines: [ln('a', { kind: 'area', name: 'فلكس', width: 4, height: 1.5, qty: 1, price: P(1200), material: { itemId: 'p-flex', qty: 6.4 } })],
    extras: [{ description: 'تصميم', amount: P(2000) }, { description: 'تركيب وشاسيه', amount: P(3500) }],
  });
  l.addPrintDeposit('pj-1', { date: day(-6), amount: P(5000) });
  l.deliverPrintJob('pj-1', { date: day(-2) });
  l.savePrintJob({
    id: 'pj-2', partyId: 'c-student', date: day(-1), due: day(1), title: 'مشروع تخرج', status: 'printing', currency: 'SYP',
    lines: [ln('a', { kind: 'pages', name: 'طباعة ليزر', pages: 120, qty: 3, price: P(30) }), ln('b', { kind: 'pages', name: 'تصوير ملون', pages: 12, qty: 3, price: P(100) }), ln('c', { kind: 'count', name: 'تجليد حراري / كرتون', qty: 3, price: P(800) })],
    extras: [],
  });
  l.addPrintDeposit('pj-2', { date: day(-1), amount: P(5000) });
  l.savePrintJob({
    id: 'pj-3', partyId: 'c-school', date: day(), due: day(3), title: 'رول أب + كروت المدرسة', status: 'design', currency: 'SYP',
    lines: [ln('a', { kind: 'count', name: 'رول أب', qty: 2, price: P(9000) }), ln('b', { kind: 'count', name: 'كروت شخصية (1000)', qty: 1, price: P(12000) }), ln('c', { kind: 'area', name: 'ستيكر / فينيل', width: 1, height: 0.5, qty: 10, price: P(1500), material: { itemId: 'p-vinyl', qty: 5.5 } })],
    extras: [{ description: 'تصميم', amount: P(3000) }],
  });
}

function pharmacyDealers(l: Ledger): void {
  l.saveParty({ id: 's-pharma', kind: 'supplier', name: 'مستودع الشفاء للأدوية', phone: '0944 515 300' });
  // [id، الاسم، الاسم العلمي، الشراء، سعر الصيدلية، سعر المورّد، الكمية، الحد الأدنى]
  const meds: [string, string, string, number, number, number, number, number][] = [
    ['m-panadol', 'بنادول 500 ملغ', 'باراسيتامول', 1000, 1500, 1800, 120, 20],
    ['m-augmentin', 'أوغمنتين 1 غ', 'أموكسيسيلين + كلافولانيك', 6500, 8500, 10000, 40, 10],
    ['m-brufen', 'بروفين 400', 'إيبوبروفين', 1200, 1700, 2000, 80, 15],
    ['m-omeprazole', 'أوميبرازول 20', 'أوميبرازول', 2000, 2800, 3300, 60, 10],
    ['m-vitc', 'فيتامين C فوار', 'حمض الأسكوربيك', 1800, 2500, 3000, 50, 10],
    ['m-zyrtec', 'زيرتك شراب', 'سيتريزين', 2500, 3500, 4200, 30, 6],
  ];
  for (const [id, name, sci, , price, dealer, , min] of meds) {
    item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit: 'علبة', price: P(price), dealerPrice: P(dealer), category: 'أدوية', minStock: min, attributes: { 'الاسم العلمي': sci } });
  }
  l.postInvoice({ kind: 'purchase', date: day(-20), partyId: 's-pharma', lines: meds.map(([id, , , cost, , , qty]) => ({ itemId: id, qty, price: P(cost) })), paid: P(300000) });
  l.updateCompany({ pricing: { retailMargin: 40, dealerMargin: 65 } });
  // موردين مستقلين
  const d1 = l.saveDealer({ id: 'd-samer', name: 'أبو سامر', phone: '0933 220 418' });
  const d2 = l.saveDealer({ id: 'd-rami', name: 'رامي الحلبي', phone: '0988 410 772' });
  // بضاعة أبو سامر الخاصة (غير الأدوية)
  item(l, { id: 'x-diapers', code: 'X1', name: 'حفاضات أطفال', kind: 'stock', unit: 'كيس', price: 0, dealerPrice: P(6500), category: 'مواد المورّد', dealerId: d1.id });
  item(l, { id: 'x-cream', code: 'X2', name: 'كريم مرطب', kind: 'stock', unit: 'قطعة', price: 0, dealerPrice: P(3500), category: 'مواد المورّد', dealerId: d1.id });
  l.postDealerMove({ dealerId: d1.id, date: day(-10), kind: 'deposit', amount: P(80000), note: 'رأس مال المورّد' });
  l.postDealerMove({ dealerId: d1.id, date: day(-10), kind: 'purchase', lines: [{ itemId: 'x-diapers', qty: 10, unitCost: P(5000) }, { itemId: 'x-cream', qty: 12, unitCost: P(2200) }], note: 'بضاعة خاصة' });
  l.postDealerSale({ dealerId: d1.id, date: day(-3), lines: [{ itemId: 'm-panadol', qty: 10, price: P(1800) }, { itemId: 'm-augmentin', qty: 2, price: P(10000) }, { itemId: 'x-diapers', qty: 3, price: P(6500) }] });
  l.postDealerSale({ dealerId: d1.id, date: day(-1), lines: [{ itemId: 'm-brufen', qty: 6, price: P(2000) }, { itemId: 'x-cream', qty: 4, price: P(3500) }] });
  l.postDealerMove({ dealerId: d1.id, date: day(-1), kind: 'payment', amount: P(25000), note: 'دفعة' });
  l.postDealerSale({ dealerId: d2.id, date: day(-2), lines: [{ itemId: 'm-omeprazole', qty: 5, price: P(3300) }, { itemId: 'm-vitc', qty: 4, price: P(3000) }] });
  l.postDealerSale({ dealerId: d2.id, date: day(), lines: [{ itemId: 'm-zyrtec', qty: 3, price: P(4200) }, { itemId: 'm-panadol', qty: 8, price: P(1800) }] });
  // مبيعات الصيدلية العادية
  l.postInvoice({ kind: 'sale', date: day(-1), lines: [{ itemId: 'm-panadol', qty: 6, price: P(1500) }, { itemId: 'm-vitc', qty: 2, price: P(2500) }] });
  l.postInvoice({ kind: 'sale', date: day(), lines: [{ itemId: 'm-augmentin', qty: 1, price: P(8500) }, { itemId: 'm-brufen', qty: 3, price: P(1700) }] });
}

function weddingHall(l: Ledger): void {
  l.updateCompany({ halls: ['الصالة الكبرى', 'صالة الحديقة'] });
  l.saveParty({ id: 'c-ahmad', kind: 'customer', name: 'أحمد الخطيب', phone: '0944 512 300' });
  l.saveParty({ id: 'c-samer', kind: 'customer', name: 'سامر الحلبي', phone: '0933 801 742' });
  l.saveParty({ id: 'c-uni', kind: 'customer', name: 'جامعة الشام — دفعة الهندسة', phone: '0988 210 115' });
  l.saveParty({ id: 'c-rima', kind: 'customer', name: 'ريما العلي', phone: '0955 640 318' });
  const L = (name: string, qty: number, price: number, perGuest = false) => ({ id: name, name, qty, price: P(price), ...(perGuest ? { perGuest: true } : {}) });
  const b1 = l.saveBooking({
    id: 'b-1', partyId: 'c-ahmad', hall: 'الصالة الكبرى', date: day(-5), period: 'evening', eventType: 'عرس', title: 'أحمد ♥ سلمى', guests: 300, status: 'confirmed', currency: 'SYP',
    lines: [L('أجار الصالة', 1, 15000), L('ضيافة (بالراس)', 300, 75, true), L('كوشة وتزيين', 1, 4000), L('DJ وصوت', 1, 2500), L('تصوير فوتو وفيديو', 1, 3500)],
  });
  l.addBookingDeposit(b1.id, { date: day(-40), amount: P(10000) });
  l.invoiceBooking(b1.id, { date: day(-5) });
  const b2 = l.saveBooking({
    id: 'b-2', partyId: 'c-samer', hall: 'الصالة الكبرى', date: day(3), period: 'evening', eventType: 'خطوبة', title: 'سامر ♥ نور', extras: 'جلسة تصوير وكيك', groomPhone: '0944 318 552', startTime: '19:30', endTime: '23:00', guests: 150, status: 'confirmed', currency: 'SYP',
    lines: [L('أجار الصالة', 1, 10000), L('ضيافة (بالراس)', 150, 75, true), L('كيك', 1, 1500), L('DJ وصوت', 1, 2500)],
  });
  l.addBookingDeposit(b2.id, { date: day(-10), amount: P(5000) });
  l.saveBooking({
    id: 'b-3', partyId: 'c-uni', hall: 'صالة الحديقة', date: day(7), period: 'morning', eventType: 'تخرج', title: 'حفلة تخرج الهندسة', startTime: '10:00', endTime: '13:00', guests: 220, status: 'tentative', currency: 'SYP',
    lines: [L('أجار الصالة', 1, 8000), L('عشاء (بالراس)', 220, 120, true), L('إضاءة وليزر', 1, 2000)],
  });
  const b4 = l.saveBooking({
    id: 'b-4', partyId: 'c-rima', hall: 'الصالة الكبرى', date: day(12), period: 'full', eventType: 'عرس', title: 'عرس ريما', extras: 'زفة وفرقة', startTime: '20:00', endTime: '01:00', guests: 400, status: 'confirmed', currency: 'SYP',
    lines: [L('أجار الصالة', 1, 20000), L('عشاء (بالراس)', 400, 120, true), L('فرقة / زفة', 1, 6000), L('ورد طبيعي', 1, 3000)],
  });
  l.addBookingDeposit(b4.id, { date: day(-2), amount: P(20000) });
}

function foodstuff(l: Ledger): void {
  l.saveParty({ id: 'c-shop1', kind: 'customer', name: 'سمانة أبو أحمد', phone: '0944 201 118', priceTier: 'wholesale' });
  l.saveParty({ id: 'c-shop2', kind: 'customer', name: 'ماركت الحارة', phone: '0933 774 205', priceTier: 'wholesale' });
  l.saveParty({ id: 'c-home', kind: 'customer', name: 'أم سليم', phone: '0955 310 660' });
  l.saveParty({ id: 's-grain', kind: 'supplier', name: 'تجار الحبوب — الهال', phone: '0944 100 900' });
  // [id، الاسم، التصنيف، الوحدة، المفرق، الجملة، الكمية، التكلفة، الحد الأدنى، الوحدة الكبيرة، كم فيها، صلاحية]
  const goods: [string, string, string, string, number, number, number, number, number, string, number, boolean][] = [
    ['f-rice', 'رز مصري', 'حبوب وبقوليات', 'كيلو', 1700, 1550, 900, 1350, 100, 'كيس 25 كغ', 25, false],
    ['f-rice-b', 'رز بسمتي', 'حبوب وبقوليات', 'كيلو', 2600, 2400, 400, 2100, 50, 'كيس 10 كغ', 10, false],
    ['f-bulgur', 'برغل ناعم', 'حبوب وبقوليات', 'كيلو', 1100, 980, 600, 820, 60, 'شوال 50 كغ', 50, false],
    ['f-lentil', 'عدس مجروش', 'حبوب وبقوليات', 'كيلو', 1500, 1380, 350, 1150, 40, 'شوال 50 كغ', 50, false],
    ['f-chickpea', 'حمص حب', 'حبوب وبقوليات', 'كيلو', 1800, 1650, 300, 1400, 40, 'شوال 50 كغ', 50, false],
    ['f-sugar', 'سكر', 'سكر وطحين', 'كيلو', 1150, 1060, 1200, 950, 150, 'شوال 50 كغ', 50, false],
    ['f-flour', 'طحين زيرو', 'سكر وطحين', 'كيلو', 900, 820, 800, 700, 100, 'كيس 25 كغ', 25, false],
    ['f-oil', 'زيت دوار الشمس 1 لتر', 'زيوت وسمون', 'قطعة', 2200, 2050, 240, 1800, 24, 'كرتونة 12', 12, false],
    ['f-ghee', 'سمنة نباتية 2 كغ', 'زيوت وسمون', 'قطعة', 5200, 4900, 60, 4300, 10, 'كرتونة 6', 6, true],
    ['f-tea', 'شاي سيلاني 400غ', 'شاي وقهوة', 'قطعة', 3800, 3550, 96, 3100, 24, 'كرتونة 24', 24, false],
    ['f-pasta', 'معكرونة 500غ', 'معكرونة وشعيرية', 'قطعة', 650, 590, 400, 480, 40, 'كرتونة 20', 20, false],
    ['f-tomato', 'رب بندورة 800غ', 'معلبات', 'قطعة', 1900, 1750, 120, 1500, 24, 'كرتونة 12', 12, true],
  ];
  for (const [id, name, category, unit, price, whole, , , minStock, box, n, expiry] of goods)
    item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit, price: P(price), wholesalePrice: P(whole), category, minStock, units: [{ name: box, factor: n }], ...(expiry ? { trackExpiry: true } : {}) });
  l.adjustStock({
    kind: 'opening',
    date: day(-30),
    lines: goods.map(([id, , , , , , qty, cost, , , , expiry]) => ({ itemId: id, qty, unitCost: P(cost), ...(expiry ? { batch: 'B1', expiry: day(200) } : {}) })),
    memo: 'بضاعة أول المدة (تجريبي)',
  });
  l.postInvoice({ kind: 'sale', date: day(-3), partyId: 'c-shop1', lines: [{ itemId: 'f-rice', qty: 50, price: P(1550) }, { itemId: 'f-sugar', qty: 100, price: P(1060) }], paid: P(100000) });
  l.postInvoice({ kind: 'sale', date: day(-1), partyId: 'c-shop2', lines: [{ itemId: 'f-oil', qty: 24, price: P(2050) }, { itemId: 'f-tea', qty: 24, price: P(3550) }, { itemId: 'f-bulgur', qty: 50, price: P(980) }] });
  l.postInvoice({ kind: 'sale', date: day(), lines: [{ itemId: 'f-rice', qty: 5, price: P(1700) }, { itemId: 'f-lentil', qty: 2, price: P(1500) }, { itemId: 'f-pasta', qty: 4, price: P(650) }] });
}

function electrical(l: Ledger): void {
  l.setRate({ date: day(-40), currency: 'USD', rate: 121, kind: 'market' });
  l.updateCompany({ listPricing: { buyDiscount: 15, masterDiscount: 10, retailMarkup: 5, brands: { 'نيوباور': 15 } } });
  l.saveParty({ id: 's-np', kind: 'supplier', name: 'نيوباور — الوكيل', phone: '0944 300 200' });
  l.saveParty({ id: 'c-m1', kind: 'customer', name: 'المعلم أبو سمير (كهربائي)', phone: '0944 518 220', priceTier: 'wholesale' });
  l.saveParty({ id: 'c-m2', kind: 'customer', name: 'المعلم خالد (مقاول)', phone: '0933 740 115', priceTier: 'wholesale', listDiscount: 12 });
  l.saveParty({ id: 'c-h', kind: 'customer', name: 'أبو فادي', phone: '0955 210 330' });
  // نشرة نيوباور 18/05/2025: [الكود، الصنف، التعبئة، السعر $]
  const list: [string, string, number, number][] = [
    ["2000", "مفتاح مفرد 16امبير", 480, 0.7],
    ["2010", "مفتاح مفرد بضوء 16امبير", 400, 1.5],
    ["2001", "مفتاح دركسيون 16امبير", 480, 1.0],
    ["2002", "مفتاح تربل 16امبير", 400, 2.6],
    ["2011", "كباسة جرس", 400, 1.0],
    ["2012", "كباسة جرس بضوء ليد", 400, 1.5],
    ["2013", "مفتاح سخان بضوء ليد", 400, 2.8],
    ["2003", "مفتاح اباجور", 400, 3.5],
    ["2004", "كباس اباجور", 400, 3.5],
    ["2028", "بريز عادي 10امبير", 480, 0.8],
    ["2020", "بريز امريكي 16امبير", 480, 0.9],
    ["2021", "بريز 16امبيرمشكل مؤمن", 480, 1.2],
    ["2023", "بريز شوكو 16امبير", 200, 2.4],
    ["2024", "بريز انجليزي MK", 200, 2.4],
    ["2022", "بريز باسونيك", 400, 1.4],
    ["2025", "بريز شبكة CAT6", 400, 3.0],
    ["2026", "بريز ابرة ستالايت", 400, 0.8],
    ["2027", "بريز مأخذ USB", 400, 6.0],
    ["2028", "بريز مأخذ TYPEC", 400, 6.0],
    ["2029", "بريز مأخذ TYPEC + USB", 200, 9.0],
    ["2050", "سدة مفتاح", 960, 0.1],
    ["2059", "قطعة جرس رنان مخفي", 400, 3.4],
    ["2068", "قطعة جرس بيانو مخفي", 400, 4.3],
    ["2069", "قطعة جرس بلبل مخفي", 400, 3.8],
    ["2000/2", "مفتاح ضيق مجوز", 400, 1.8],
    ["2050/3", "سدة بلاك ثلاثية", 336, 0.3],
    ["2017", "قطعة مفتاح مروحة 100وات", 120, 6.8],
    ["2014", "قطعة مفتاح تنويص 250وات", 160, 6.8],
    ["2015", "قطعة مفتاح تنويص 800وات", 160, 8.0],
    ["2065", "حساس حركة", 200, 7.5],
    ["2066", "حساس حركة مع لمبه", 60, 6.5],
    ["2052", "بريز 12فولت مع جاك", 400, 1.0],
    ["2054", "قطعة لمبة إشارة", 400, 1.2],
    ["مقياس", "فولت كامل", 50, 4.5],
    ["مقياس", "فولت +امبير كامل", 50, 6.3],
    ["2055", "نواصة ليد", 50, 3.0],
    ["2060", "كباس جرس كرت لوحة اسمية", 50, 1.8],
    ["2057", "بلاك كتيم مخفي", 100, 2.7],
    ["2058", "بلاك كتيم ظاهر", 50, 3.5],
    ["2033", "شاسيه مفتاح ثلاثية", 300, 0.2],
    ["2044", "شاسيه مفتاح رباعية", 240, 0.5],
    ["2066-T", "شاسيه مفتاح سداسية -معدن", 200, 1.3],
    ["064", "بلاك باريل عاجي ابيض رباعي", 140, 0.9],
    ["066", "بلاك باريل عاجي ابيض سداسي", 120, 1.4],
    ["200", "", 3, 1.0],
    ["", "", 4140, 1.8],
    ["", "", 6120, 2.5],
    ["114", "بلاك اوفال عاجي رباعي", 140, 0.6],
    ["116", "بلاك اوفال عاجي سداسي", 120, 1.0],
    ["124", "بلاك اوفال زهري رباعي", 140, 0.6],
    ["126", "بلاك اوفال زهري سداسي", 120, 1.0],
    ["134", "بلاك اوفال ازرق رباعي", 140, 0.6],
    ["136", "بلاك اوفال ازرق سداسي", 120, 1.0],
    ["301", "بلاك ظاهر مفرد", 150, 0.5],
    ["302", "بلاك ظاهر مجوز", 90, 0.6],
    ["303", "بلاك ظاهر ثلاثي", 102, 0.85],
    ["311", "علبة ظاهرة مفردة", 75, 1.1],
    ["312", "علبة ظاهرة مجوزة", 75, 1.2],
    ["313", "علبة ظاهرة ثلاثية", 90, 1.3],
    ["316", "علبة ظاهرة سداسية", 42, 2.4]
  ];
  const cat = (n: string) => (/بلاك|شاسيه/.test(n) ? 'بلاكات وشاسيهات' : /علبة|عﻠبة/.test(n) ? 'علب وتمديدات' : 'مفاتيح وأباريز');
  const usd = (x: number) => Math.round(x * 100);
  const seen = new Set<string>();
  const uniq = (c: string, i: number) => { const k = c && !seen.has(c) ? c : `${c || 'X'}-${i}`; seen.add(k); return k; };
  const items = list.filter(([, n]) => n.trim().length > 2).map(([code, name, pack, price], i) => ({
    id: `np-${uniq(code, i)}`, code: `NP${[...seen].pop()}`, name, kind: 'stock' as const, unit: 'قطعة', brand: 'نيوباور', category: cat(name), priceCurrency: 'USD',
    listPrice: usd(price), price: Math.round(usd(price) * 1.05), wholesalePrice: Math.round(usd(price) * 0.9), ...(pack > 1 ? { units: [{ name: `كرتونة ${pack}`, factor: pack }] } : {}),
  }));
  l.saveItems(items);
  // كبلات بالمتر والربطة، وإنارة
  l.saveItems([
    { id: 'cb-2', code: 'CB2', name: 'كبل نحاس 2 ملم', kind: 'stock', unit: 'متر', brand: 'كابلات الشرق', category: 'كبلات وأسلاك', priceCurrency: 'USD', listPrice: 40, price: 42, wholesalePrice: 36, units: [{ name: 'ربطة 100م', factor: 100 }] },
    { id: 'cb-4', code: 'CB4', name: 'كبل نحاس 4 ملم', kind: 'stock', unit: 'متر', brand: 'كابلات الشرق', category: 'كبلات وأسلاك', priceCurrency: 'USD', listPrice: 75, price: 79, wholesalePrice: 68, units: [{ name: 'ربطة 100م', factor: 100 }] },
    { id: 'led-12', code: 'LED12', name: 'لمبة ليد 12 واط', kind: 'stock', unit: 'قطعة', brand: 'نور', category: 'إنارة وليدات', priceCurrency: 'USD', listPrice: 120, price: 126, wholesalePrice: 108, units: [{ name: 'كرتونة 50', factor: 50 }] },
  ]);
  const rate = 121;
  const opening = [...items.slice(0, 30), { id: 'cb-2', listPrice: 40 }, { id: 'cb-4', listPrice: 75 }, { id: 'led-12', listPrice: 120 }].map((it) => ({ itemId: it.id, qty: it.id.startsWith('cb') ? 500 : 200, unitCost: Math.round(it.listPrice * 0.85 * rate) }));
  l.adjustStock({ kind: 'opening', date: day(-30), lines: opening, memo: 'بضاعة أول المدة (تجريبي)' });
  const s1 = items[0]!, s2 = items[9]!, s3 = items[3]!;
  l.postInvoice({ kind: 'sale', date: day(-2), partyId: 'c-m1', currency: 'USD', lines: [{ itemId: s1.id, qty: 40, price: s1.wholesalePrice }, { itemId: s2.id, qty: 30, price: s2.wholesalePrice }, { itemId: 'cb-2', qty: 100, price: 36 }], paid: 0 });
  l.postInvoice({ kind: 'sale', date: day(-1), partyId: 'c-m2', currency: 'USD', lines: [{ itemId: s3.id, qty: 20, price: Math.round(s3.listPrice * 0.88) }], paid: 0 });
  l.postInvoice({ kind: 'sale', date: day(), currency: 'USD', lines: [{ itemId: s1.id, qty: 3, price: s1.price }, { itemId: 'led-12', qty: 4, price: 126 }] });
}

function solar(l: Ledger): void {
  l.saveParty({ id: 'c-abuali', kind: 'customer', name: 'أبو علي الشامي', phone: '0944 610 225' });
  l.saveParty({ id: 'c-farm', kind: 'customer', name: 'مزرعة الريّان', phone: '0933 470 118' });
  l.saveParty({ id: 'c-clinic', kind: 'customer', name: 'عيادة د. سمر', phone: '0988 302 557' });
  l.saveParty({ id: 's-solar', kind: 'supplier', name: 'شركة الشمس للاستيراد', phone: '0955 100 300' });
  // [id، الاسم، التصنيف، السعر، الجملة، الكمية، التكلفة، الحد الأدنى، الوحدة]
  const goods: [string, string, string, number, number, number, number, number, string][] = [
    ['s-p550', 'لوح شمسي 550 واط', 'ألواح شمسية', 9000, 8500, 60, 7200, 12, 'لوح'],
    ['s-p620', 'لوح شمسي 620 واط', 'ألواح شمسية', 11000, 10400, 30, 8800, 8, 'لوح'],
    ['s-inv36', 'انفرتر هايبرد 3.6 كيلو', 'انفرترات', 36000, 34000, 8, 29000, 2, 'قطعة'],
    ['s-inv6', 'انفرتر هايبرد 6 كيلو', 'انفرترات', 60000, 57000, 5, 49000, 2, 'قطعة'],
    ['s-lith5', 'بطارية ليثيوم 5.12 كيلو', 'بطاريات', 90000, 86000, 10, 74000, 2, 'قطعة'],
    ['s-gel200', 'بطارية جل 200 أمبير', 'بطاريات', 25000, 23500, 12, 19500, 4, 'قطعة'],
    ['s-mount', 'حامل ألواح (للوح)', 'حوامل وقواعد', 1500, 1300, 120, 900, 20, 'قطعة'],
    ['s-cable6', 'كبل DC 6 ملم', 'كبلات', 150, 130, 600, 95, 100, 'متر'],
    ['s-breaker', 'قاطع DC وحماية', 'قواطع وحمايات', 1200, 1000, 40, 700, 10, 'قطعة'],
  ];
  for (const [id, name, category, price, whole, , , minStock, unit] of goods) item(l, { id, code: id.slice(2).toUpperCase(), name, kind: 'stock', unit, price: P(price), wholesalePrice: P(whole), category, minStock });
  item(l, { id: 's-install', code: 'INST', name: 'تركيب منظومة', kind: 'service', unit: 'قطعة', price: P(15000), category: 'تركيب وصيانة' });
  item(l, { id: 's-visit', code: 'VISIT', name: 'زيارة صيانة', kind: 'service', unit: 'قطعة', price: P(3000), category: 'تركيب وصيانة' });
  l.adjustStock({ kind: 'opening', date: day(-40), lines: goods.map(([id, , , , , qty, cost]) => ({ itemId: id, qty, unitCost: P(cost) })), memo: 'بضاعة أول المدة (تجريبي)' });
  const L = (id: string, name: string, watts: number, qty: number, dayHours: number, nightHours: number) => ({ id, name, watts, qty, dayHours, nightHours });
  const home = [L('1', 'براد', 150, 1, 8, 6), L('2', 'ليدات إنارة', 10, 12, 0, 6), L('3', 'تلفزيون', 100, 1, 3, 4), L('4', 'راوتر إنترنت', 15, 1, 12, 12), L('5', 'غسالة', 500, 1, 1, 0), L('6', 'مروحة', 60, 2, 6, 6)];
  const ln = (id: string, part: 'panel' | 'inverter' | 'battery' | 'other' | 'labor', itemId: string | undefined, name: string, qty: number, price: number, warrantyMonths?: number, serials?: string[]) => ({ id, part, ...(itemId ? { itemId } : {}), name, qty, price: P(price), ...(warrantyMonths ? { warrantyMonths } : {}), ...(serials ? { serials } : {}) });
  const p1 = l.saveSolarProject({
    id: 'sp-1', partyId: 'c-abuali', date: day(-20), title: 'بيت أبو علي — 3.6 كيلو', address: 'المزة، جانب الجامع', status: 'installed', installDate: day(-14), currency: 'SYP',
    loads: home, design: { sunHours: 5, panelWatts: 550, batteryKwh: 5.12 },
    lines: [ln('a', 'panel', 's-p550', 'لوح شمسي 550 واط', 4, 9000, 120), ln('b', 'inverter', 's-inv36', 'انفرتر هايبرد 3.6 كيلو', 1, 36000, 24, ['INV36-2410-0087']), ln('c', 'battery', 's-lith5', 'بطارية ليثيوم 5.12 كيلو', 1, 90000, 60, ['LB5-77120']), ln('d', 'other', 's-mount', 'حامل ألواح (للوح)', 4, 1500), ln('e', 'other', 's-cable6', 'كبل DC 6 ملم', 30, 150), ln('f', 'labor', undefined, 'تركيب وتشغيل', 1, 15000)],
  });
  l.addSolarDeposit(p1.id, { date: day(-19), amount: P(80000) });
  l.invoiceSolarProject(p1.id, { date: day(-14) });
  const p2 = l.saveSolarProject({
    id: 'sp-2', partyId: 'c-farm', date: day(-5), title: 'مضخة مي ومزرعة — 6 كيلو', address: 'الريّان، طريق المطار', status: 'accepted', currency: 'SYP',
    loads: [L('1', 'مضخة مي', 1500, 1, 5, 0), L('2', 'براد', 150, 1, 8, 6), L('3', 'ليدات إنارة', 10, 10, 0, 5)], design: { sunHours: 5, panelWatts: 620, batteryKwh: 5.12 },
    lines: [ln('a', 'panel', 's-p620', 'لوح شمسي 620 واط', 6, 11000, 120), ln('b', 'inverter', 's-inv6', 'انفرتر هايبرد 6 كيلو', 1, 60000, 24), ln('c', 'battery', 's-lith5', 'بطارية ليثيوم 5.12 كيلو', 1, 90000, 60), ln('d', 'other', 's-mount', 'حامل ألواح (للوح)', 6, 1500), ln('e', 'labor', undefined, 'تركيب وتشغيل', 1, 20000)],
  });
  l.addSolarDeposit(p2.id, { date: day(-4), amount: P(100000) });
  l.saveSolarProject({
    id: 'sp-3', partyId: 'c-clinic', date: day(-1), title: 'عيادة — تشغيل نهاري', status: 'quote', currency: 'SYP',
    loads: [L('1', 'مكيف 1 طن', 1000, 1, 6, 0), L('2', 'لابتوب / كمبيوتر', 100, 2, 7, 0), L('3', 'ليدات إنارة', 10, 8, 7, 0)], design: { sunHours: 5, panelWatts: 550, batteryKwh: 5.12 },
    lines: [ln('a', 'panel', 's-p550', 'لوح شمسي 550 واط', 4, 9000, 120), ln('b', 'inverter', 's-inv36', 'انفرتر هايبرد 3.6 كيلو', 1, 36000, 24), ln('c', 'battery', 's-gel200', 'بطارية جل 200 أمبير', 2, 25000, 12), ln('d', 'labor', undefined, 'تركيب وتشغيل', 1, 15000)],
  });
  l.postInvoice({ kind: 'sale', date: day(-2), lines: [{ itemId: 's-cable6', qty: 20, price: P(150) }, { itemId: 's-breaker', qty: 2, price: P(1200) }] });
  l.postInvoice({ kind: 'sale', date: day(), lines: [{ itemId: 's-p550', qty: 2, price: P(9000) }] });
}

export function loadDemo(l: Ledger): void {
  const s = l.state;
  if (s.invoices.length > 0 || Object.keys(s.items).length > 0 || Object.keys(s.parties).length > 0) throw new Error('البيانات التجريبية بتنضاف لشركة فاضية بس');
  const activity = s.info?.activity ?? 'general';
  const today = day();
  if (!s.rates.some((r) => r.currency === 'USD') && s.info?.baseCurrency === 'SYP') l.setRate({ date: today, currency: 'USD', rate: 121, kind: 'market' });
  if (activity === 'restaurant') restaurant(l);
  else if (activity === 'tailor') tailor(l);
  else if (activity === 'gypsum') gypsum(l);
  else if (activity === 'customs') customs(l);
  else if (activity === 'stone') stone(l);
  else if (activity === 'poultry') poultry(l);
  else if (activity === 'printshop') printshop(l);
  else if (activity === 'pharmacydealers') pharmacyDealers(l);
  else if (activity === 'weddinghall') weddingHall(l);
  else if (activity === 'solar') solar(l);
  else if (activity === 'foodstuff') foodstuff(l);
  else if (activity === 'electrical') electrical(l);
  else if (activity === 'mobile') mobile(l);
  else if (activity === 'sweets') sweets(l);
  else if (activity === 'supermarket') supermarket(l);
  else general(l);
}
