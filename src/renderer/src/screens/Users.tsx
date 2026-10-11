import { useState } from 'react';
import { ALL_PERMISSIONS, permissionsOf, PERMISSIONS, ROLE_NAMES, type Permission, type Role, type User } from '../../../core';
import { uid, useCompany } from '../api';
import { Field, Modal, PageHeader } from '../components/ui';

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
  const { call, notify, user: me } = useCompany();
  const [f, setF] = useState({
    displayName: user?.displayName ?? '',
    username: user?.username ?? '',
    role: user?.role ?? ('cashier' as Role),
    active: user?.active ?? true,
    password: '',
    extra: new Set(user?.extra ?? []),
    denied: new Set(user?.denied ?? []),
  });
  const draft: User = { id: user?.id ?? '', username: f.username, displayName: f.displayName, role: f.role, active: f.active, extra: [...f.extra], denied: [...f.denied] };
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
          <div className="field wide">
            <span>الصلاحيات (يمكنك إضافة أو سحب صلاحيات من الدور)</span>
            <div className="perm-grid">
              {ALL_PERMISSIONS.map((p) => (
                <label key={p} className={`check ${f.extra.has(p) ? 'good' : f.denied.has(p) ? 'bad' : ''}`}>
                  <input type="checkbox" checked={effective.has(p)} onChange={(e) => toggle(p, e.target.checked)} />
                  {PERMISSIONS[p]}
                </label>
              ))}
            </div>
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
