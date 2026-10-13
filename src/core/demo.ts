import type { Ledger } from './ledger';
import type { Item } from './types';

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

/** يعبّي شركة فاضية ببيانات تجريبية مناسبة لنشاطها. */
export function loadDemo(l: Ledger): void {
  const s = l.state;
  if (s.invoices.length > 0 || Object.keys(s.items).length > 0 || Object.keys(s.parties).length > 0) throw new Error('البيانات التجريبية بتنضاف لشركة فاضية بس');
  const activity = s.info?.activity ?? 'general';
  const today = day();
  if (!s.rates.some((r) => r.currency === 'USD') && s.info?.baseCurrency === 'SYP') l.setRate({ date: today, currency: 'USD', rate: 121, kind: 'market' });
  if (activity === 'restaurant') restaurant(l);
  else if (activity === 'tailor') tailor(l);
  else general(l);
}
