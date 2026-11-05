import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, Ledger, chartFor, defaultTaxes } from '../src/core';
import { ask } from '../src/renderer/src/assistant/answer';
import { Brain, tokens } from '../src/renderer/src/assistant/engine';
import { TOPICS } from '../src/renderer/src/assistant/knowledge';

// أسئلة بصياغات مختلفة (فصحى وشامي وأخطاء) ← الموضوع المتوقع
const CASES: [string, string][] = [
  ['كيف بعمل فاتورة', 'sale'],
  ['بدي بيع لزبون', 'sale'],
  ['شلون بسجل بيعة', 'sale'],
  ['كيف ادفع فاتورة الكهربا', 'expense'],
  ['وين بحط الايجار', 'expense'],
  ['دفعت امبيرات وين سجلها', 'expense'],
  ['الزبون رجعلي غرض', 'return-sale'],
  ['بدي رجع بضاعة للتاجر', 'return-purchase'],
  ['كيف بضيف صنف', 'add-item'],
  ['ضيف منتج جديد', 'add-item'],
  ['عندي بضاعة من قبل بدون فاتورة', 'item-no-purchase'],
  ['كيف بعمل جرد', 'stock-count'],
  ['في اغراض خربت', 'damage'],
  ['بدي اطبع ستيكرات', 'labels'],
  ['كيف بطبع الفاتوره', 'print-invoice'],
  ['بدي ابعت الفاتورة عالواتس', 'print-invoice'],
  ['وين الديون', 'debts'],
  ['زبون جابلي مصاري من دينو', 'collect'],
  ['كيف بدفع للمورد', 'pay-supplier'],
  ['عندي ديون بالدفتر كيف دخلها', 'opening-debt'],
  ['كشف حساب زبون', 'statement'],
  ['قديش ربحت', 'profit'],
  ['كيف بعرف ارباحي', 'profit'],
  ['تقرير اخر الدوام', 'daily'],
  ['كيف بضيف عامل', 'add-employee'],
  ['بدي سجل معاشات الشهر', 'salaries'],
  ['الموظف اخد سلفه', 'advance'],
  ['كيف بعمل نسخه احتياطيه', 'backup'],
  ['بدي غير مكان الباك اب', 'backup'],
  ['نسيت الباسورد', 'password'],
  ['بدي ضيف كاشير', 'users'],
  ['كيف بربط كمبيوترين', 'lan'],
  ['بدي شوف المحل من البيت', 'cloud'],
  ['كيف بغير سعر الدولار', 'currency'],
  ['بدي غير لون الفاتورة', 'invoice-design'],
  ['بدي حط اللوغو', 'invoice-design'],
  ['كيف بستورد من اكسل', 'excel-import'],
  ['الكرتونة فيها 24 قطعة', 'units'],
  ['كيف بعطي حسم', 'discount'],
  ['غلطت بفاتورة كيف عدلها', 'edit-invoice'],
  ['بدي امسح فاتوره', 'edit-invoice'],
  ['عرض اسعار لزبون', 'quote'],
  ['عندي مسوق بياخد نسبة', 'marketer'],
  ['معمل وشحن وجمارك', 'cost-breakdown'],
  ['كيف بشتري بضاعه', 'purchase'],
  ['جبت بضاعة من التاجر', 'purchase'],
  ['بدي فعل نقطة البيع', 'pos'],
  ['شو الاختصارات', 'shortcuts'],
  ['كيف بصفر البرنامج', 'reset'],
  ['كيف بجدد الاشتراك', 'license'],
  ['الشركاء ورأس المال', 'partners'],
  ['طاولات المطعم', 'restaurant'],
  ['بيع بالتقسيط', 'installments'],
  ['اكتر شي عم ينباع', 'best-items'],
  ['صندوق دولار', 'cash-boxes'],
  ['وين بلاقي فاتورة قديمة', 'invoices'],
  ['كيف بضيف تصنيف', 'categories'],
  ['بدي نقل بضاعة للفرع التاني', 'transfer'],
  ['كيف بعمل خلطة', 'production'],
  ['بدي ضيف ضريبه', 'taxes'],
  ['كيف بغير اسم المحل', 'company-info'],
  ['ازاي اعمل فاتورة بيع', 'sale'],
  ['كيفية انشاء فاتورة مبيعات', 'sale'],
  ['فين اسجل المصروفات', 'expense'],
  ['اين اسجل مصاريف المحل', 'expense'],
  ['بدي سجل فاتورة المي', 'expense'],
  ['زبون مابدو يدفع هلأ بدو يدفع بعدين', 'sale-credit'],
  ['زبون اشترى بالدين', 'sale-credit'],
  ['المورد بدو مصاريه', 'pay-supplier'],
  ['سددت للتاجر', 'pay-supplier'],
  ['كيف اعرف المكسب', 'profit'],
  ['كم كسبت هالشهر', 'profit'],
  ['اريد اضافة مستخدم جديد', 'users'],
  ['بدي اعطي الموظف حساب يفوت عالبرنامج', 'users'],
  ['الكاشير ما بدي ياه يشوف الارباح', 'users'],
  ['كيف بحفظ البيانات عالفلاشة', 'backup'],
  ['انضربت الكمبيوتر بدي رجع البيانات', 'restore'],
  ['غيرت الكمبيوتر', 'restore'],
  ['البضاعة خلصت كيف بعرف', 'stock-report'],
  ['كم باقي بالمستودع', 'stock-report'],
  ['بدي اعرف شو ناقصني', 'stock-report'],
  ['بيع بالكيلو والميزان', 'barcode'],
  ['السكانر ما عم يقرا', 'barcode'],
  ['حطيت سعر غلط', 'price-change'],
  ['غلا السعر بدي غير الاسعار', 'price-change'],
  ['تقرير يومي', 'daily'],
  ['كم دخل اليوم', 'daily'],
  ['الوضع الليلي', 'dark'],
  ['كيف بقلب للاسود', 'dark'],
  ['رقم تسلسلي للموبايلات', 'serials'],
  ['بدي سجل موعد لزبون', 'appointments'],
  ['ورشة تصليح سيارات', 'repairs'],
  ['ابيع اقساط', 'installments'],
  ['حطلي الشعار عالفواتير', 'invoice-design'],
  ['بدي ارسل تذكير للزبون', 'reminder'],
  ['زبون متأخر بالدفع', 'aging'],
  ['قيد محاسبي', 'journal'],
  ['بدي سكر السنة', 'close-year'],
  ['الموظف غاب بدي اخصم عليه', 'employee-log'],
  ['بدي اعطي مكافأة للعامل', 'employee-log'],
  ['تحديث البرنامج', 'update'],
  ['خلص الاشتراك', 'license'],
  ['بدي اعمل حساب صندوق بالدولار', 'cash-boxes'],
  ['شو الربح من كل مادة', 'best-items'],
  ['نسيت كلمة المرور', 'password'],
  ['ما بعرف من وين ابلش', 'tour'],
  ['دورلي على زبون', 'search'],
];

describe('assistant: understanding', () => {
  const brain = new Brain(TOPICS);
  it('normalizes dialect, prefixes and synonyms', () => {
    expect(tokens('بدي سجل فاتورة المي')).toEqual(['فاتوره', 'مصروف']);
    expect(tokens('كيف بشتري بضاعه')).toEqual(['شرا', 'ماده']);
    expect(tokens('زبون جابلي مصاري')[0]).toBe('عميل');
  });
  it('finds the right topic for most phrasings', () => {
    const misses = CASES.filter(([q, id]) => brain.search(q, 1)[0]?.topic.id !== id);
    // مسموح غلطات قليلة (أسئلة قريبة من موضوعين)
    expect(misses.length, misses.map((m) => m[0]).join(' / ')).toBeLessThanOrEqual(4);
  });
  it('every topic id is unique and every topic finds itself by its own question', () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    const lost = TOPICS.filter((t) => brain.search(t.q, 3).every((r) => r.topic.id !== t.id));
    expect(lost.map((t) => t.id)).toEqual([]);
  });
});

describe('assistant: answers from the company data', () => {
  const l = new Ledger(() => {});
  l.createCompany({ name: 'محل', activity: 'general', baseCurrency: 'USD', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, chartFor('general'), defaultTaxes());
  l.saveParty({ id: 'm', kind: 'customer', name: 'محمد الأحمد' });
  l.saveItem({ id: 'rice', code: 'R1', name: 'رز مصري', unit: 'كيس', cost: 0, active: true, price: 500, priceCurrency: 'USD', kind: 'stock' } as never);
  l.postInvoice({ kind: 'purchase', date: '2026-11-01', partyId: null, currency: 'USD', lines: [{ itemId: 'rice', description: 'رز مصري', qty: 10, price: 300 }], paid: 3000 });
  l.postInvoice({ kind: 'sale', date: '2026-11-05', partyId: 'm', currency: 'USD', lines: [{ itemId: 'rice', description: 'رز مصري', qty: 2, price: 500 }], paid: 400 });
  l.saveEmployee({ id: 's', name: 'سامي', salary: 30000, payPeriod: 'monthly' });
  const ctx = {
    state: l.state,
    can: () => true,
    screens: new Set(['sale', 'debts', 'parties', 'items', 'reports', 'invoices', 'partners', 'vouchers', 'accounts', 'settings']),
    today: '2026-11-05',
    fmt: (v: number) => (v / 100).toFixed(2),
  };
  it('sales today, profit, debts, item stock, customer balance, employee', () => {
    expect(ask('شقد بعت اليوم؟', ctx).text).toContain('10.00');
    expect(ask('قديش ربحت هالشهر', ctx).text).toContain('صافي الربح');
    expect(ask('كم باقي من الرز المصري', ctx).text).toContain('8');
    expect(ask('كم باقي من الرز؟', ctx).text).toContain('8 كيس');
    const m = ask('شو عليه محمد الأحمد', ctx);
    expect(m.text).toContain('6.00');
    expect(m.links.some((x) => x.screen === 'parties')).toBe(true);
    expect(ask('شقد الديون اللي النا', ctx).text).toContain('6.00');
    expect(ask('سامي شقد الو', ctx).text).toContain('سامي');
  });
  it('how-to answers carry shortcuts only to screens the user can open', () => {
    const r = ask('كيف بسجل مصروف كهربا؟', ctx);
    expect(r.text).toContain('سندات القبض والدفع');
    expect(r.links[0]).toMatchObject({ screen: 'vouchers', param: 'payment' });
    const hidden = ask('كيف بشتغل الطاولات بالمطعم', ctx);
    expect(hidden.links).toEqual([]);
    expect(hidden.text).toContain('مش ظاهر عندك');
    expect(ask('مرحبا', ctx).suggest.length).toBeGreaterThan(0);
    expect(ask('قثصيبلا', ctx).text).toContain('ما فهمت');
  });
});
