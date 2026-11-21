// «المصاريف الثابتة»: إيجار، كهربا، رواتب، إنترنت... بتنعرّف مرة وحدة، وكل شهر بتبيّن شو انسجّل وشو باقي،
// و«دفعتها» بيسجّل سند دفع عادي على حساب المصروف (بيطلع بالسندات والصندوق والتقارير والربح).
import { useMemo, useState } from 'react';
import { isCashBox, recurringStatus, type RecurringExpense, type RecurringRow } from '../../../core';
import { dateText, money, parseAmount, toInput, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { askConfirm, CurrencySelect, Empty, Field, Modal, PageHeader, Stat } from '../components/ui';

const STATUS: Record<RecurringRow['status'], { label: string; cls: string }> = {
  paid: { label: 'مدفوع', cls: 'good' },
  overdue: { label: 'فات موعده', cls: 'bad' },
  'due-soon': { label: 'قرب موعده', cls: 'warn' },
  upcoming: { label: 'لسا', cls: '' },
};

const monthName = (m: string) => {
  const [y, mm] = m.split('-').map(Number) as [number, number];
  return new Date(y, mm - 1, 1).toLocaleDateString('ar-SY-u-nu-latn', { month: 'long', year: 'numeric' });
};
const shiftMonth = (m: string, n: number) => {
  const [y, mm] = m.split('-').map(Number) as [number, number];
  const d = new Date(y, mm - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function Recurring() {
  const { state, call, notify, can, navigate } = useCompany();
  const d = today();
  const [month, setMonth] = useState(d.slice(0, 7));
  const [edit, setEdit] = useState<RecurringExpense | 'new' | null>(null);
  const [paying, setPaying] = useState<RecurringRow | null>(null);
  const rows = useMemo(() => recurringStatus(state, month, d), [state, month, d]);
  const manage = can('accounts.manage');
  const base = state.info!.baseCurrency;

  // المجاميع بالعملة الأساسية بس (العملات التانية لحالها بكل سطر)
  const inBase = rows.filter((r) => r.def.currency === base);
  const total = inBase.reduce((t, r) => t + r.def.amount, 0);
  const paid = inBase.reduce((t, r) => t + r.paidAmount, 0);
  const left = inBase.filter((r) => !r.paid).reduce((t, r) => t + r.def.amount, 0);

  return (
    <div className="page recurring">
      <PageHeader title="المصاريف الثابتة">
        {manage && (
          <button className="primary" onClick={() => setEdit('new')}>
            <Icon name="plus" size={16} /> مصروف ثابت
          </button>
        )}
      </PageHeader>
      <p className="muted">الإيجار والكهربا والرواتب والإنترنت... عرّفها مرة وحدة، وكل شهر بتشوف شو انسجّل وشو باقي، و«دفعتها» بيسجّل سند دفع بكبسة وبينزل بالصندوق والأرباح.</p>

      <div className="month-nav">
        <button className="icon" aria-label="الشهر اللي قبل" onClick={() => setMonth(shiftMonth(month, -1))}>
          <Icon name="prev" size={16} />
        </button>
        <strong>{monthName(month)}</strong>
        <button className="icon" aria-label="الشهر الجاي" onClick={() => setMonth(shiftMonth(month, 1))}>
          <Icon name="next" size={16} />
        </button>
        {month !== d.slice(0, 7) && (
          <button className="ghost small" onClick={() => setMonth(d.slice(0, 7))}>
            هالشهر
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty>{manage ? 'ما في مصاريف ثابتة لسا. اكبس «مصروف ثابت» وضيف الإيجار مثلاً: المبلغ ويوم الدفع بالشهر.' : 'ما في مصاريف ثابتة معرّفة.'}</Empty>
      ) : (
        <>
          <div className="stats">
            <Stat label="مصاريف الشهر الثابتة" value={money(state, total)} hint={`${rows.length} مصروف`} />
            <Stat label="انسجّل" value={money(state, paid)} tone="good" />
            <Stat label="باقي" value={money(state, left)} {...(left ? { tone: 'bad' as const } : {})} />
          </div>
          <div className="recurring-list">
            {rows.map((r) => (
              <article key={r.def.id} className={`card recurring-card ${r.status}`}>
                <div className="recurring-main">
                  <h4>{r.def.name}</h4>
                  <small className="muted">
                    {state.accounts[r.def.accountId]?.name ?? '—'} · يوم {r.def.day} بالشهر
                  </small>
                </div>
                <div className="recurring-amount">
                  <b>{money(state, r.paid ? r.paidAmount : r.def.amount, r.def.currency)}</b>
                  <span className={`tag ${STATUS[r.status].cls}`}>{r.paid ? `${STATUS.paid.label} ${dateText(r.paid.date)}` : STATUS[r.status].label}</span>
                </div>
                <div className="recurring-actions">
                  {!r.paid && can('vouchers.create') && (
                    <button className="primary small" onClick={() => setPaying(r)}>
                      دفعتها
                    </button>
                  )}
                  {r.paid && (
                    <button className="ghost small" onClick={() => navigate('vouchers', `edit:${r.paid!.id}`)}>
                      السند
                    </button>
                  )}
                  {manage && (
                    <button className="ghost small" onClick={() => setEdit(r.def)}>
                      تعديل
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {edit && <RecurringForm def={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {paying && <PayForm row={paying} month={month} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PayForm({ row, month: m, onClose }: { row: RecurringRow; month: string; onClose: () => void }) {
  const { state, call, notify, user } = useCompany();
  const d = today();
  const lockedBox = user.role !== 'owner' && user.cashAccountId && state.accounts[user.cashAccountId] ? user.cashAccountId : null;
  const boxes = Object.values(state.accounts).filter((a) => isCashBox(a) && !a.archived && !a.hidden && (!a.currency || a.currency === row.def.currency));
  const [amount, setAmount] = useState(toInput(state, row.def.amount, row.def.currency));
  const [date, setDate] = useState(m === d.slice(0, 7) ? d : row.due);
  const [box, setBox] = useState(lockedBox ?? boxes.find((b) => b.currency === row.def.currency)?.id ?? boxes[0]?.id ?? '');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`دفع ${row.def.name} — ${monthName(m)}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let minor: number;
          try {
            minor = parseAmount(state, amount, row.def.currency);
          } catch (err) {
            return notify((err as Error).message, 'error');
          }
          setBusy(true);
          const r = await call('payRecurring', { id: row.def.id, month: m, date, amount: minor, ...(box ? { cashAccountId: box } : {}), ...(memo.trim() ? { memo } : {}) });
          setBusy(false);
          if (r !== null) {
            notify(`انسجّل ${row.def.name}`);
            onClose();
          }
        }}
      >
        <Field label="المبلغ">
          <input className="num-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="من صندوق">
          <select value={box} disabled={!!lockedBox} onChange={(e) => setBox(e.target.value)}>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ملاحظة (اختياري)">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="مثلاً: فاتورة رقم…" />
        </Field>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy}>
            تسجيل الدفع
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecurringForm({ def, onClose }: { def: RecurringExpense | null; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const accounts = Object.values(state.accounts)
    .filter((a) => a.type === 'expense' && !a.isGroup && !a.archived)
    .sort((a, b) => a.id.localeCompare(b.id));
  const guess = (name: string) => accounts.find((a) => name && a.name.includes(name.trim().split(/\s+/)[0]!))?.id;
  const [name, setName] = useState(def?.name ?? '');
  const [currency, setCurrency] = useState(def?.currency ?? base);
  const [amount, setAmount] = useState(def ? toInput(state, def.amount, def.currency) : '');
  const [accountId, setAccountId] = useState(def?.accountId ?? '');
  const [day, setDay] = useState(String(def?.day ?? 1));
  const acc = accountId || guess(name) || accounts.find((a) => /عامة|متفرقة|أخرى/.test(a.name))?.id || accounts[0]?.id || '';
  return (
    <Modal title={def ? `تعديل ${def.name}` : 'مصروف ثابت جديد'} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let minor: number;
          try {
            minor = parseAmount(state, amount, currency);
          } catch (err) {
            return notify((err as Error).message, 'error');
          }
          const r = await call('saveRecurring', { ...(def ? { id: def.id } : {}), name, amount: minor, currency, accountId: acc, day: Number(day) });
          if (r !== null) {
            notify('تم الحفظ');
            onClose();
          }
        }}
      >
        <Field label="الاسم" wide>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="إيجار المحل، كهربا، راتب أحمد…" autoFocus />
        </Field>
        <Field label="المبلغ كل شهر">
          <input className="num-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <Field label="يوم الدفع بالشهر">
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </Field>
        <Field label="حساب المصروف">
          <select value={acc} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions wide">
          {def && (
            <button
              type="button"
              className="ghost danger push-start"
              onClick={async () => {
                if (!(await askConfirm(`حذف «${def.name}»؟ السندات اللي انسجّلت بتضل.`))) return;
                if ((await call('deleteRecurring', def.id)) !== null) onClose();
              }}
            >
              حذف
            </button>
          )}
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}
