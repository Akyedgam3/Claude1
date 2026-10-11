import { useState } from 'react';
import { accountBalance, type Account } from '../../../core';
import { money, useCompany } from '../api';
import { Field, Modal, PageHeader } from '../components/ui';

const TYPE_NAMES: Record<Account['type'], string> = {
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصاريف',
};

export function Accounts() {
  const { state } = useCompany();
  const [adding, setAdding] = useState<Account | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const roots = Object.values(state.accounts)
    .filter((a) => !a.parentId)
    .sort((a, b) => a.id.localeCompare(b.id));

  const render = (a: Account, level: number) => {
    const children = Object.values(state.accounts)
      .filter((c) => c.parentId === a.id)
      .sort((x, y) => x.id.localeCompare(y.id));
    const bal = accountBalance(state, a.id).balance;
    return (
      <div key={a.id}>
        <div className={`tree-row ${a.isGroup ? 'group' : ''} ${a.archived ? 'muted' : ''}`} style={{ paddingInlineStart: level * 22 }}>
          <span className="mono">{a.id}</span>
          <span className="tree-name" onClick={() => setEditing(a)}>
            {a.name}
            {a.currency && <span className="tag">{a.currency}</span>}
          </span>
          <span className="num">{bal !== 0 ? money(state, bal) : ''}</span>
          {a.isGroup && (
            <button className="ghost small" onClick={() => setAdding(a)}>
              + فرعي
            </button>
          )}
        </div>
        {children.map((c) => render(c, level + 1))}
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader title="دليل الحسابات" />
      <p className="muted">
        يمكنك إضافة صناديق إضافية (صندوق الدولار مثلاً) تحت "الأصول المتداولة"، أو أنواع مصاريف جديدة تحت "المصاريف التشغيلية".
      </p>
      <section className="card tree">{roots.map((r) => render(r, 0))}</section>
      {adding && <AccountForm parent={adding} onClose={() => setAdding(null)} />}
      {editing && <AccountForm account={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountForm({ parent, account, onClose }: { parent?: Account; account?: Account; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const p = parent ?? (account?.parentId ? state.accounts[account.parentId] : undefined);
  const suggest = () => {
    if (!parent) return '';
    const siblings = Object.values(state.accounts)
      .filter((a) => a.parentId === parent.id)
      .map((a) => Number(a.id))
      .filter(Number.isFinite);
    const prefix = parent.id;
    const next = siblings.length ? Math.max(...siblings) + 1 : Number(prefix + (prefix.length >= 2 ? '01' : '1'));
    return String(next);
  };
  const [f, setF] = useState({
    id: account?.id ?? suggest(),
    name: account?.name ?? '',
    isGroup: account?.isGroup ?? false,
    currency: account?.currency ?? '',
    archived: account?.archived ?? false,
  });
  return (
    <Modal title={account ? `تعديل: ${account.name}` : `حساب فرعي تحت: ${parent?.name}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const data: Account = {
            id: f.id.trim(),
            name: f.name.trim(),
            type: account?.type ?? parent!.type,
            parentId: account?.parentId ?? parent!.id,
            isGroup: f.isGroup,
            currency: f.currency || null,
            ...(f.archived ? { archived: true } : {}),
          };
          if (!account && state.accounts[data.id]) return notify('الرمز مستخدم لحساب آخر', 'error');
          if (await call('saveAccount', data)) {
            notify('تم الحفظ');
            onClose();
          }
        }}
      >
        <Field label="الرمز">
          <input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} disabled={!!account} className="mono" />
        </Field>
        <Field label="النوع">
          <input value={TYPE_NAMES[account?.type ?? p?.type ?? 'asset']} readOnly />
        </Field>
        <Field label="الاسم" wide>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="عملة ثابتة (اختياري)">
          <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            <option value="">أي عملة</option>
            {Object.values(state.currencies).map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameAr}
              </option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.isGroup} onChange={(e) => setF({ ...f, isGroup: e.target.checked })} />
          حساب تجميعي (له حسابات فرعية)
        </label>
        {account && (
          <label className="check">
            <input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} />
            مؤرشف (إيقاف الاستخدام)
          </label>
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
