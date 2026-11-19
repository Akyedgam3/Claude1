import { useState } from 'react';
import { ALL_PERMISSIONS, permissionsOf, PERMISSIONS, ROLE_NAMES, type Permission, type Role, type User } from '../../../core';
import { uid, useCompany } from '../api';
import { Field, Modal, PageHeader } from '../components/ui';
import { DealerBoxSetup } from '../components/DealerBox';
import { cashAccounts } from './InvoiceEditor';
import { NAV, type NavItem } from '../nav';

/** الصلاحيات مقسومة لمجموعات لحتى تنقرا بسهولة */
const PERM_GROUPS: { title: string; perms: Permission[] }[] = [
  { title: 'شو بيشوف (الأسعار والأرقام الحساسة)', perms: ['costs.view', 'profits.view', 'purchases.view', 'stock.qty', 'balances.view', 'invoices.all', 'items.hidden'] },
  { title: 'البيع والفواتير', perms: ['sales.create', 'pos.use', 'price.edit', 'discount.give', 'sales.credit', 'returns.create', 'sales.void'] },
  { title: 'التقارير', perms: ['reports.financial', 'reports.stock'] },
  { title: 'المواد والمخزون', perms: ['items.manage', 'purchases.create', 'stock.adjust', 'stock.transfer', 'production.manage'] },
  { title: 'المال والحسابات', perms: ['vouchers.create', 'vouchers.void', 'parties.manage', 'journal.create', 'accounts.manage', 'rates.manage'] },
  { title: 'الإدارة', perms: ['settings.manage', 'users.manage', 'backup.manage', 'period.close', 'partners.manage', 'employees.manage'] },
];
const GROUPED = new Set(PERM_GROUPS.flatMap((g) => g.perms));
const PERM_HINTS: Partial<Record<Permission, string>> = {
  'costs.view': 'بدونها ما بيشوف سعر الشراء ولا التكلفة ولا قيمة البضاعة، بأي شاشة',
  'profits.view': 'بدونها ما بيشوف ربح الفاتورة ولا ربح اليوم ولا تقارير الأرباح',
  'purchases.view': 'بدونها ما بتطلع فواتير الشراء بالسجل ولا بتنفتح (فيها أسعار الشراء)',
  'stock.qty': 'بدونها ما بيشوف كمية المواد الموجودة، لا بالمواد ولا بالبيع',
  'balances.view': 'بدونها ما بيشوف ديون الزباين والموردين ولا كشوف حساباتهم',
  'invoices.all': 'بدونها بسجل الفواتير بيشوف فواتيره هو بس',
  'price.edit': 'بدونها السعر بيطلع من بطاقة المادة وما بيقدر يغيّره',
  'sales.credit': 'بدونها كل فاتورة مبيع لازم تندفع كاملة (وبيختفي زر «على الحساب» بنقطة البيع)',
};

/** قوالب جاهزة بكبسة: الدور + سحب صلاحيات حساسة */
const PRESETS: { label: string; role: Role; denied: Permission[]; hint: string }[] = [
  { label: 'كاشير ما بيشوف أسعار الشراء والأرباح', role: 'cashier', denied: ['costs.view', 'profits.view', 'purchases.view'], hint: 'بيبيع وبيقبض، وما بيعرف بشو اشتريت ولا قديش ربحت' },
  { label: 'كاشير بيع نقدي بس', role: 'cashier', denied: ['costs.view', 'profits.view', 'purchases.view', 'sales.credit', 'price.edit', 'discount.give', 'balances.view', 'invoices.all'], hint: 'بيع نقدي بسعر المادة، بدون دين ولا خصم ولا تغيير سعر، وبيشوف فواتيره بس' },
  { label: 'أمين مستودع بدون أسعار', role: 'storekeeper', denied: ['costs.view', 'profits.view'], hint: 'بيستلم البضاعة وبيجرد، وما بيشوف التكلفة' },
];

export function Users() {
  const { state, user: me } = useCompany();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const users = Object.values(state.users).sort((a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName, 'ar'));
  return (
    <div className="page">
      <PageHeader title="المستخدمون والصلاحيات">
        <button className="primary" onClick={() => setEditing('new')}>
          + مستخدم
        </button>
      </PageHeader>
      <DealerBoxSetup />
      <p className="muted">كل مستخدم يدخل باسمه وكلمة سره، وكل عملية تُسجّل باسم من نفذها. الصلاحيات تُطبَّق على هذا الجهاز وعلى أجهزة الشبكة.</p>
      <table className="table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>اسم الدخول</th>
            <th>الدور</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={`clickable ${u.active ? '' : 'voided'}`} onClick={() => setEditing(u)}>
              <td>
                {u.displayName} {u.id === me.id && <span className="tag">أنت</span>}
              </td>
              <td className="mono">{u.username}</td>
              <td>{ROLE_NAMES[u.role]}</td>
              <td>{u.active ? 'فعّال' : 'موقوف'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { call, notify, user: me, state, feature } = useCompany();
  const boxes = cashAccounts(state);
  const [hidden, setHidden] = useState<Set<string>>(new Set(user?.hiddenScreens ?? []));
  // الأقسام الموجودة بنشاط المحل (من غير الرئيسية)
  const sections = NAV.filter((n): n is NavItem => typeof n !== 'string' && n.key !== 'dashboard' && (!n.feature || feature(n.feature)) && (!n.features || n.features.some(feature)));
  const [f, setF] = useState({
    // مع صندوق المورد: الحساب الجديد (الصيدلية) افتراضياً عالصندوق المشترك
    cashAccountId: user ? (user.cashAccountId ?? '') : state.accounts['11019'] ? (boxes.find((b) => !b.hidden)?.id ?? '') : '',
    displayName: user?.displayName ?? '',
    username: user?.username ?? '',
    role: user?.role ?? ('cashier' as Role),
    active: user?.active ?? true,
    password: '',
    extra: new Set(user?.extra ?? []),
    denied: new Set(user?.denied ?? []),
  });
  const draft: User = { id: user?.id ?? '', username: f.username, displayName: f.displayName, role: f.role, active: f.active, extra: [...f.extra], denied: [...f.denied], ...(f.cashAccountId ? { cashAccountId: f.cashAccountId } : {}) };
  const effective = permissionsOf({ ...draft, active: true });
  const base = permissionsOf({ ...draft, extra: [], denied: [], active: true });
  const roles = (Object.keys(ROLE_NAMES) as Role[]).filter((r) => r !== 'owner' || me.role === 'owner');

  const toggle = (p: Permission, on: boolean) => {
    const extra = new Set(f.extra);
    const denied = new Set(f.denied);
    extra.delete(p);
    denied.delete(p);
    if (on && !base.has(p)) extra.add(p);
    if (!on && base.has(p)) denied.add(p);
    setF({ ...f, extra, denied });
  };

  return (
    <Modal title={user ? `تعديل: ${user.displayName}` : 'مستخدم جديد'} onClose={onClose} width={760}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const data: User = {
            id: user?.id ?? uid(),
            username: f.username.trim(),
            displayName: f.displayName.trim(),
            role: f.role,
            active: f.active,
            ...(f.extra.size ? { extra: [...f.extra] } : {}),
            ...(f.denied.size ? { denied: [...f.denied] } : {}),
            ...(f.cashAccountId ? { cashAccountId: f.cashAccountId } : {}),
            ...(f.role !== 'owner' && hidden.size ? { hiddenScreens: [...hidden] } : {}),
          };
          if (!user && f.password.length < 6) return notify('كلمة السر 6 أحرف على الأقل', 'error');
          const res = user ? await call('updateUser', data, f.password || undefined) : await call('createUser', data, f.password);
          if (res) {
            notify('تم الحفظ');
            onClose();
          }
        }}
      >
        <Field label="الاسم">
          <input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} autoFocus />
        </Field>
        <Field label="اسم الدخول">
          <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} dir="ltr" />
        </Field>
        <Field label="الدور">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role, extra: new Set(), denied: new Set() })} disabled={user?.role === 'owner' && me.role !== 'owner'}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="صندوق المستخدم">
          <select value={f.cashAccountId} onChange={(e) => setF({ ...f, cashAccountId: e.target.value })}>
            <option value="">— حسب الفاتورة —</option>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.hidden ? ' (خاص)' : ''}
              </option>
            ))}
          </select>
          <small className="muted">{f.role === 'owner' ? 'مبيعاتك بتنزل فيه افتراضياً (وفيك تغيّر بالفاتورة).' : 'كل مبيعاته وسنداته بتنزل فيه، وما بيقدر يغيّره.'}</small>
        </Field>
        <Field label={user ? 'كلمة سر جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة السر'}>
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        {user && user.id !== me.id && (
          <label className="check wide">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            فعّال (إلغاء التفعيل يمنعه من الدخول فوراً)
          </label>
        )}
        {f.role !== 'owner' && (
          <div className="field wide presets">
            <span>قوالب جاهزة (بتقدر تعدّل بعدها)</span>
            <div className="button-row">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="ghost small" title={p.hint} onClick={() => setF({ ...f, role: p.role, extra: new Set(), denied: new Set(p.denied) })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {f.role !== 'owner' && (
          <div className="field wide">
            <span>الصلاحيات (يمكنك إضافة أو سحب صلاحيات من الدور)</span>
            {[...PERM_GROUPS, { title: 'أقسام النشاط', perms: ALL_PERMISSIONS.filter((p) => !GROUPED.has(p)) }].map((g) => (
              <div key={g.title} className="perm-group">
                <h4>{g.title}</h4>
                <div className="perm-grid">
                  {g.perms.map((p) => (
                    <label key={p} className={`check ${f.extra.has(p) ? 'good' : f.denied.has(p) ? 'bad' : ''}`} title={PERM_HINTS[p]}>
                      <input type="checkbox" checked={effective.has(p)} onChange={(e) => toggle(p, e.target.checked)} />
                      {PERMISSIONS[p]}
                      {PERM_HINTS[p] && <small className="muted perm-hint">{PERM_HINTS[p]}</small>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {f.role !== 'owner' && (
          <div className="field wide">
            <span>الأقسام اللي بيشوفها (شيل الإشارة عن أي قسم لتخبّيه عنه حتى لو معه صلاحيته)</span>
            <div className="button-row">
              <button type="button" className="ghost" onClick={() => setHidden(new Set())}>
                إظهار الكل
              </button>
              <button type="button" className="ghost" onClick={() => setHidden(new Set(sections.map((n) => n.key)))}>
                إخفاء الكل
              </button>
            </div>
            <div className="perm-grid">
              {sections.map((n) => (
                <label key={n.key} className={`check ${hidden.has(n.key) ? 'bad' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!hidden.has(n.key)}
                    onChange={(e) => {
                      const next = new Set(hidden);
                      if (e.target.checked) next.delete(n.key);
                      else next.add(n.key);
                      setHidden(next);
                    }}
                  />
                  {n.label}
                </label>
              ))}
            </div>
            <small className="muted">القسم بيضل مخفي حتى لو إجت صلاحيته من الدور. الرئيسية بتضل ظاهرة دايماً.</small>
          </div>
        )}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}
