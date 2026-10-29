import { can, permissionFor, PERMISSIONS, type Permission } from '../core/permissions';
import type { InvoiceDraft } from '../core/commerce';
import type { User } from '../core/types';
import type { CompanyStore } from '../storage/company-store';

// كل عملية من الواجهة (أو من جهاز على الشبكة) تمر من هنا:
// نتحقق من أن المستخدم فعّال ومن صلاحيته، ثم ننفذ العملية باسمه.

function fail(message: string): never {
  throw new Error(message);
}

function requirePermission(user: User, p: Permission): void {
  if (!can(user, p)) fail(`لا تملك صلاحية: ${PERMISSIONS[p]}`);
}

type Special = (store: CompanyStore, user: User, args: unknown[]) => unknown;

/** عمليات تمس كلمات السر وسلسلة المفاتيح (خارج دفتر الشركة). */
const SPECIAL: Record<string, Special> = {
  createUser(store, user, [data, password]) {
    requirePermission(user, 'users.manage');
    const u = data as User;
    if (typeof password !== 'string') fail('كلمة السر مطلوبة');
    if (store.ledger.state.users[u.id]) fail('المستخدم موجود مسبقاً');
    if (u.role === 'owner' && user.role !== 'owner') fail('فقط المالك يضيف مالكاً');
    if (password.length < 6) fail('كلمة السر يجب أن تكون 6 أحرف على الأقل');
    store.ledger.saveUser(u);
    store.setPassword(u.id, password);
    return u;
  },
  updateUser(store, user, [data, password]) {
    requirePermission(user, 'users.manage');
    const u = data as User;
    const existing = store.ledger.state.users[u.id] ?? fail('المستخدم غير موجود');
    if ((existing.role === 'owner' || u.role === 'owner') && user.role !== 'owner') fail('فقط المالك يعدّل حساب مالك');
    if (typeof password === 'string' && password && password.length < 6) fail('كلمة السر يجب أن تكون 6 أحرف على الأقل');
    store.ledger.saveUser(u);
    store.syncUser(u.id);
    if (typeof password === 'string' && password) store.setPassword(u.id, password);
    return u;
  },
  changeMyPassword(store, user, [oldPassword, newPassword]) {
    if (typeof newPassword !== 'string' || newPassword.length < 6) fail('كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل');
    // بعد الدخول برمز الاسترداد لا نطلب كلمة السر القديمة
    if (!store.viaRecovery || store.user.id !== user.id) {
      if (!store.verify(user.username, String(oldPassword ?? ''))) fail('كلمة السر الحالية غير صحيحة');
    }
    store.setPassword(user.id, newPassword);
    return true;
  },
  rotateRecoveryCode(store, user) {
    if (user.role !== 'owner') fail('فقط المالك يستطيع إصدار رمز استرداد جديد');
    return store.rotateRecoveryCode();
  },
};

/** عمليات بتحتاج الجهاز الرئيسي نفسه (كلمات السر): ما بتنعمل عالجوال وهو مطفي. */
export const isSpecialMethod = (method: string): boolean => Object.prototype.hasOwnProperty.call(SPECIAL, method);

export const EXECUTOR_METHODS = new Set(Object.keys(SPECIAL));

/** ينفذ عملية باسم مستخدم. يعيد نتيجة العملية ورقم آخر حدث بعدها. */
export function execute(store: CompanyStore, actor: User, method: string, args: unknown[]): { value: unknown; seq: number } {
  if (typeof method !== 'string' || !Array.isArray(args)) fail('طلب غير صالح');
  const user = store.ledger.state.users[actor.id];
  if (!user || !user.active) fail('هذا المستخدم موقوف أو محذوف');
  store.ledger.actor = user.id;

  const special = Object.prototype.hasOwnProperty.call(SPECIAL, method) ? SPECIAL[method] : undefined;
  if (special) return { value: special(store, user, args), seq: store.lastSeq };

  const permission = permissionFor(method, args) ?? fail(`عملية غير معروفة: ${method}`);
  requirePermission(user, permission);
  if (method === 'postEntry') {
    // القيود اليدوية لا يمكن أن تنتحل صفة مستند (فاتورة، سند...)
    const src = (args[0] as { source?: { type?: string } } | undefined)?.source;
    if (src && src.type !== 'manual') fail('نوع القيد غير مسموح');
  }
  // الرقم والربط بفاتورة قديمة داخليين (تعديل الفاتورة بس)
  if (method === 'postInvoice') args = args.slice(0, 1);
  if (method === 'replaceInvoice') {
    // التعديل = إلغاء + فاتورة جديدة: بدو صلاحية النوع كمان
    requirePermission(user, permissionFor('postInvoice', [args[1]])!);
    const d = args[1] as Partial<InvoiceDraft> | undefined;
    if (d?.discount || d?.lines?.some((l) => !!l.discount)) requirePermission(user, 'discount.give');
  }
  if (['postInvoice', 'saveQuote', 'closeOrder', 'invoiceRepair', 'deliverTailorOrder', 'deliverSiteJob', 'invoiceAppointment'].includes(method)) {
    const d = args[method === 'postInvoice' || method === 'saveQuote' ? 0 : 1] as Partial<InvoiceDraft> | undefined;
    const discounted = !!d?.discount || !!d?.lines?.some((l) => !!l.discount);
    if (discounted) requirePermission(user, 'discount.give');
  }
  if (method === 'saveSiteJob') {
    // خصم المشروع بيحتاج صلاحية الخصم (إذا تغيّر)
    const j = args[0] as { id?: string; discount?: number } | undefined;
    const before = j?.id ? store.ledger.state.siteJobs[j.id]?.discount : undefined;
    if (j?.discount && j.discount !== before) requirePermission(user, 'discount.give');
  }
  // المواد المخفية: اللي ما معه صلاحيتها ما بيبيعها ولا بيعدّلها (حتى لو بعت طلب يدوي)
  if (!can(user, 'items.hidden')) {
    const hidden = (id: unknown) => typeof id === 'string' && !!store.ledger.state.items[id]?.hidden;
    const lines = (x: unknown) => ((x as { lines?: { itemId?: unknown }[] } | undefined)?.lines ?? []);
    if (method === 'saveItem' && hidden((args[0] as { id?: unknown } | undefined)?.id)) fail('المادة غير موجودة');
    if (['deleteItem', 'archiveItem'].includes(method) && hidden(args[0])) fail('المادة غير موجودة');
    if ((method === 'saveItem' && (args[0] as { hidden?: unknown } | undefined)?.hidden) || args.some((a) => lines(a).some((l) => hidden(l.itemId)))) fail('المادة غير موجودة');
  }
  // صندوق المستخدم: مبيعاته وسنداته بتنزل فيه (لغير المالك إجباري، وللمالك افتراضي)
  const box = user.cashAccountId && store.ledger.state.accounts[user.cashAccountId] ? user.cashAccountId : undefined;
  if (box) {
    const draft = (method === 'postInvoice' || method === 'postVoucher' ? args[0] : method === 'replaceInvoice' ? args[1] : undefined) as { cashAccountId?: string; kind?: string; accountId?: string } | undefined;
    if (draft && typeof draft === 'object' && (draft.kind !== 'purchase' || user.role !== 'owner')) {
      if (user.role !== 'owner' || !draft.cashAccountId) draft.cashAccountId = box;
    }
  }
  // الصناديق المخفية (صندوق المورد): اللي ما معه الصلاحية ما بيلمسها
  if (!can(user, 'items.hidden')) {
    const st = store.ledger.state;
    const touches = (x: unknown) => x && typeof x === 'object' && ['cashAccountId', 'from', 'to', 'accountId'].some((k) => { const v = (x as Record<string, unknown>)[k]; return typeof v === 'string' && !!st.accounts[v]?.hidden; });
    if (args.some(touches)) fail('الصندوق غير موجود');
  }
  // الاستبدال فيه شراء كمان
  if (method === 'tradeIn') requirePermission(user, 'purchases.create');
  if (method === 'saveOrder') {
    // خصم الطلب بالمطعم بيحتاج نفس صلاحية الخصم (إذا تغيّر)
    const o = args[0] as { id?: string; discount?: number } | undefined;
    const before = o?.id ? store.ledger.state.orders[o.id]?.discount : undefined;
    if (o?.discount && o.discount !== before) requirePermission(user, 'discount.give');
  }
  // المنفّذ يُسجَّل دائماً باسم المستخدم الحالي؛ لا يُقبل createdBy من الواجهة أو الشبكة
  args = args.map((a) => {
    if (!a || typeof a !== 'object' || Array.isArray(a) || !('createdBy' in a)) return a;
    const copy = { ...(a as Record<string, unknown>) };
    delete copy['createdBy'];
    return copy;
  });
  const fn = (store.ledger as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  if (typeof fn !== 'function') fail(`عملية غير معروفة: ${method}`);
  const value = fn.apply(store.ledger, args);
  return { value, seq: store.lastSeq };
}
