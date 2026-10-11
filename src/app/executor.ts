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
  if (method === 'postInvoice' || method === 'closeOrder') {
    const d = args[method === 'postInvoice' ? 0 : 1] as Partial<InvoiceDraft> | undefined;
    const discounted = !!d?.discount || !!d?.lines?.some((l) => !!l.discount);
    if (discounted) requirePermission(user, 'discount.give');
  }
  const fn = (store.ledger as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  if (typeof fn !== 'function') fail(`عملية غير معروفة: ${method}`);
  const value = fn.apply(store.ledger, args);
  return { value, seq: store.lastSeq };
}
