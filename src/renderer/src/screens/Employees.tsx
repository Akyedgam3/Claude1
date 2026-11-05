import { useMemo, useState } from 'react';
import { EMPLOYEE_MOVE_NAMES, PAY_PERIOD_NAMES, accruedFor, employeeBalance, employeeMoves, monthOf, type Employee, type EmployeeMoveKind } from '../../../core';
import { dateText, major, money, parseAmount, today, toInput, uid, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { askConfirm, Empty, Field, Modal } from '../components/ui';
import { Icon } from '../components/icons';
import { cashAccounts } from './InvoiceEditor';

// الموظفين والرواتب: بطاقة لكل موظف، استحقاق الراتب كل شهر، الدفع والسلف والمكافآت والخصومات،
// وسجل عمليات لكل موظف برصيده بعد كل حركة. كل حركة قيد بينزل عالصندوق والحسابات لحالها.

const KINDS: EmployeeMoveKind[] = ['accrual', 'payment', 'advance', 'advance_deduct', 'bonus', 'deduction'];

const HINTS: Record<EmployeeMoveKind, string> = {
  accrual: 'تسجيل راتب الفترة كمستحق إلو (مصروف رواتب، وبيصير إلو علينا لحد ما ينصرف).',
  payment: 'دفعتلو من راتبه المستحق: بتطلع من الصندوق.',
  advance: 'سلفة على الراتب: بتطلع من الصندوق وبتنسجل عليه لحد ما تنخصم.',
  advance_deduct: 'خصم السلفة من راتبه المستحق (بدون ما يطلع شي من الصندوق).',
  bonus: 'مكافأة أو إضافي: بتزيد مستحقه.',
  deduction: 'خصم أو غياب: بينقص مستحقه.',
};

/** إشارة الحركة على صافي الموظف: موجب = بيزيد اللي إلو. */
const SIGN: Record<EmployeeMoveKind, 1 | -1 | 0> = { accrual: 1, bonus: 1, deduction: -1, payment: -1, advance: -1, advance_deduct: 0 };

export function Employees() {
  const { state, call, notify, can } = useCompany();
  const canWrite = can('employees.manage');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [moving, setMoving] = useState<{ emp: Employee; kind: EmployeeMoveKind } | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const [accruing, setAccruing] = useState(false);
  const all = Object.values(state.employees ?? {}).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ar'));
  const list = all.filter((e) => showInactive || e.active);
  const rows = useMemo(() => list.map((e) => ({ emp: e, bal: employeeBalance(state, e.id) })), [state, list.length, showInactive]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = all.filter((e) => e.active);
  const monthly = active.filter((e) => e.payPeriod === 'monthly').reduce((s, e) => s + e.salary, 0);
  const totalDue = rows.reduce((s, r) => s + Math.max(0, r.bal.salaryDue), 0);
  const totalAdv = rows.reduce((s, r) => s + Math.max(0, r.bal.advances), 0);
  const month = monthOf(today());
  const pendingThisMonth = active.filter((e) => e.payPeriod === 'monthly' && e.salary > 0 && !accruedFor(state, e.id, month)).length;

  return (
    <div className="employees">
      <div className="toolbar">
        {canWrite && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> موظف جديد
          </button>
        )}
        {canWrite && active.length > 0 && (
          <button onClick={() => setAccruing(true)}>
            استحقاق رواتب الشهر{pendingThisMonth > 0 && <span className="badge">{pendingThisMonth}</span>}
          </button>
        )}
        <ExportButtons
          name="الموظفين"
          sheets={() => [
            {
              name: 'الموظفين',
              columns: [
                { header: 'الموظف', key: 'name' },
                { header: 'العمل', key: 'job' },
                { header: 'الهاتف', key: 'phone' },
                { header: 'الراتب', key: 'salary', type: 'money' },
                { header: 'الفترة', key: 'period' },
                { header: 'راتب مستحق', key: 'due', type: 'money' },
                { header: 'سلف', key: 'adv', type: 'money' },
                { header: 'الصافي إلو', key: 'net', type: 'money' },
              ],
              rows: rows.map(({ emp, bal }) => ({
                name: emp.name,
                job: emp.jobTitle ?? '',
                phone: emp.phone ?? '',
                salary: major(state, emp.salary),
                period: PAY_PERIOD_NAMES[emp.payPeriod],
                due: major(state, bal.salaryDue),
                adv: major(state, bal.advances),
                net: major(state, bal.net),
              })),
            },
          ]}
        />
        {all.length > active.length && (
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> إظهار المتوقفين ({all.length - active.length})
          </label>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <span>
            <Icon name="users" size={16} /> الموظفين
          </span>
          <strong>{active.length}</strong>
          <small className="muted">على رأس عملهم</small>
        </div>
        <div className="stat">
          <span>
            <Icon name="wallet" size={16} /> الرواتب الشهرية
          </span>
          <strong>{money(state, monthly)}</strong>
          <small className="muted">مجموع رواتب الشهريين</small>
        </div>
        <div className="stat">
          <span>
            <Icon name="calendar" size={16} /> رواتب مستحقة ما انصرفت
          </span>
          <strong className={totalDue > 0 ? 'bad' : ''}>{money(state, totalDue)}</strong>
          <small className="muted">سلف قائمة: {money(state, totalAdv)}</small>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty>ما في موظفين لسا. ضيف أول موظف وراتبه.</Empty>
      ) : (
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th className="num">الراتب</th>
                <th className="num">راتب مستحق</th>
                <th className="num">سلف</th>
                <th className="num">الصافي إلو</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp, bal }) => (
                <tr key={emp.id} className={`clickable ${emp.active ? '' : 'voided'}`} onClick={() => setShowing(emp.id)}>
                  <td>
                    <strong>{emp.name}</strong>
                    {!emp.active && <small className="muted"> (متوقف)</small>}
                    <div className="muted">
                      {emp.jobTitle}
                      {emp.jobTitle && emp.phone && ' · '}
                      {emp.phone && <span className="ltr">{emp.phone}</span>}
                    </div>
                  </td>
                  <td className="num">
                    {money(state, emp.salary)} <small className="muted">{PAY_PERIOD_NAMES[emp.payPeriod]}</small>
                  </td>
                  <td className="num">{money(state, bal.salaryDue)}</td>
                  <td className="num">{bal.advances ? money(state, bal.advances) : '—'}</td>
                  <td className={`num ${bal.net > 0 ? 'bad' : bal.net < 0 ? 'good' : ''}`}>
                    <strong>{money(state, bal.net)}</strong>
                  </td>
                  {canWrite && (
                    <td className="button-row" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setMoving({ emp, kind: 'payment' })}>دفع راتب</button>
                      <button className="ghost" onClick={() => setMoving({ emp, kind: 'advance' })}>
                        سلفة
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {editing && <EmployeeForm emp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {moving && <MoveForm emp={moving.emp} kind={moving.kind} onClose={() => setMoving(null)} />}
      {accruing && <AccrueForm onClose={() => setAccruing(false)} />}
      {showing && state.employees?.[showing] && (
        <EmployeeDetails
          emp={state.employees[showing]!}
          onClose={() => setShowing(null)}
          onEdit={() => {
            setEditing(state.employees![showing]!);
            setShowing(null);
          }}
          onMove={(kind) => setMoving({ emp: state.employees![showing]!, kind })}
          onVoid={async (entryId) => {
            if (!(await askConfirm('تلغي هالحركة؟ بينعمل قيد عكسي بتاريخ اليوم، وبتضل بالسجل ملغاة.'))) return;
            if (await call('voidEmployeeMove', entryId, today())) notify('تم إلغاء الحركة');
          }}
        />
      )}
    </div>
  );
}

function EmployeeForm({ emp, onClose }: { emp: Employee | null; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const [f, setF] = useState({
    name: emp?.name ?? '',
    phone: emp?.phone ?? '',
    jobTitle: emp?.jobTitle ?? '',
    nationalId: emp?.nationalId ?? '',
    address: emp?.address ?? '',
    salary: emp ? toInput(state, emp.salary, base) : '',
    payPeriod: emp?.payPeriod ?? ('monthly' as Employee['payPeriod']),
    startDate: emp?.startDate ?? today(),
    notes: emp?.notes ?? '',
    active: emp?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={emp ? `تعديل: ${emp.name}` : 'موظف جديد'} onClose={onClose} width={620}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const salary = f.salary.trim() ? parseAmount(state, f.salary, base) : 0;
            if (await call('saveEmployee', { ...f, id: emp?.id ?? uid(), salary })) {
              notify(emp ? 'تم حفظ التعديل' : `تمت إضافة ${f.name}`);
              onClose();
            }
          } catch (err) {
            notify((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="الاسم">
          <input value={f.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="رقم الهاتف">
          <input className="ltr" value={f.phone} onChange={set('phone')} inputMode="tel" />
        </Field>
        <Field label="العمل / الوظيفة">
          <input value={f.jobTitle} onChange={set('jobTitle')} placeholder="بائع، محاسب، سائق..." />
        </Field>
        <Field label="الرقم الوطني (اختياري)">
          <input className="ltr" value={f.nationalId} onChange={set('nationalId')} />
        </Field>
        <Field label={`الراتب (${state.currencies[base]?.symbol})`}>
          <input value={f.salary} onChange={set('salary')} inputMode="decimal" required />
        </Field>
        <Field label="كل">
          <select value={f.payPeriod} onChange={set('payPeriod')}>
            {(Object.keys(PAY_PERIOD_NAMES) as Employee['payPeriod'][]).map((k) => (
              <option key={k} value={k}>
                {PAY_PERIOD_NAMES[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="تاريخ بداية العمل">
          <input type="date" value={f.startDate} onChange={set('startDate')} />
        </Field>
        <Field label="العنوان">
          <input value={f.address} onChange={set('address')} />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={set('notes')} />
        </Field>
        {emp && (
          <label className="check wide">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> على رأس عمله (شيلها إذا ترك الشغل، سجله بيضل محفوظ)
          </label>
        )}
        <div className="button-row wide">
          <button className="primary" disabled={busy}>
            حفظ
          </button>
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MoveForm({ emp, kind: kind0, onClose }: { emp: Employee; kind: EmployeeMoveKind; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const boxes = cashAccounts(state, base);
  const bal = employeeBalance(state, emp.id);
  const suggest = (k: EmployeeMoveKind) =>
    k === 'accrual' ? emp.salary : k === 'payment' ? Math.max(0, bal.salaryDue) : k === 'advance_deduct' ? Math.max(0, Math.min(bal.advances, bal.salaryDue)) : 0;
  const [kind, setKindState] = useState(kind0);
  const [f, setF] = useState({ amount: suggest(kind0) > 0 ? toInput(state, suggest(kind0), base) : '', date: today(), period: monthOf(today()), memo: '', cash: boxes[0]?.id ?? '1101' });
  const setKind = (k: EmployeeMoveKind) => {
    setKindState(k);
    setF((x) => ({ ...x, amount: suggest(k) > 0 ? toInput(state, suggest(k), base) : '' }));
  };
  const [busy, setBusy] = useState(false);
  const usesCash = kind === 'payment' || kind === 'advance';
  return (
    <Modal title={`${EMPLOYEE_MOVE_NAMES[kind]} — ${emp.name}`} onClose={onClose} width={520}>
      <div className="emp-mini">
        <span>
          راتب مستحق <b>{money(state, bal.salaryDue)}</b>
        </span>
        <span>
          سلف <b>{money(state, bal.advances)}</b>
        </span>
        <span>
          الصافي إلو <b>{money(state, bal.net)}</b>
        </span>
      </div>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const amount = parseAmount(state, f.amount, base);
            const args = { employeeId: emp.id, kind, amount, date: f.date, memo: f.memo, ...(kind === 'accrual' ? { period: f.period } : {}), ...(usesCash ? { cashAccountId: f.cash } : {}) };
            if (await call('employeeMove', args)) {
              notify(`تم تسجيل ${EMPLOYEE_MOVE_NAMES[kind]}`);
              onClose();
            }
          } catch (err) {
            notify((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="الحركة" wide>
          <select value={kind} onChange={(e) => setKind(e.target.value as EmployeeMoveKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {EMPLOYEE_MOVE_NAMES[k]}
              </option>
            ))}
          </select>
          <small className="muted">{HINTS[kind]}</small>
        </Field>
        <Field label={`المبلغ (${state.currencies[base]?.symbol})`}>
          <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" required autoFocus />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        {kind === 'accrual' && (
          <Field label="عن شهر">
            <input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
          </Field>
        )}
        {usesCash && (
          <Field label="طلع من الصندوق">
            <select value={f.cash} onChange={(e) => setF({ ...f, cash: e.target.value })}>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="ملاحظة">
          <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} />
        </Field>
        <div className="button-row wide">
          <button className="primary" disabled={busy}>
            تسجيل
          </button>
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** استحقاق رواتب شهر لكل الموظفين الشهريين مرة وحدة (اللي انسجّللهم ما بيتكرروا). */
function AccrueForm({ onClose }: { onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [period, setPeriod] = useState(monthOf(today()));
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const list = Object.values(state.employees ?? {}).filter((e) => e.active && e.payPeriod === 'monthly' && e.salary > 0);
  const todo = list.filter((e) => !accruedFor(state, e.id, period));
  const others = Object.values(state.employees ?? {}).filter((e) => e.active && e.payPeriod !== 'monthly');
  return (
    <Modal title="استحقاق رواتب الشهر" onClose={onClose} width={560}>
      <p className="muted">بيسجّل راتب كل موظف شهري كمستحق إلو عن هالشهر (مصروف رواتب). اللي انسجّللو قبل ما بيتكرر. بعدها بتدفعلو من «دفع راتب».</p>
      <div className="form-grid">
        <Field label="الشهر">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <Field label="تاريخ القيد">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <table className="table compact">
        <tbody>
          {list.map((e) => (
            <tr key={e.id} className={todo.includes(e) ? '' : 'voided'}>
              <td>{e.name}</td>
              <td className="num">{money(state, e.salary)}</td>
              <td>{todo.includes(e) ? '' : <small className="muted">مسجّل</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {others.length > 0 && <p className="muted">الموظفين الأسبوعيين واليوميين ({others.length}) بتسجّللهم من بطاقتهم ← «استحقاق راتب».</p>}
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || todo.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await call<number>('accrueSalaries', { period, date });
              if (r) {
                notify(`تم استحقاق رواتب ${r.value} موظف`);
                onClose();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          استحقاق {todo.length} راتب ({money(state, todo.reduce((s, e) => s + e.salary, 0))})
        </button>
        <button onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

function EmployeeDetails({ emp, onClose, onEdit, onMove, onVoid }: { emp: Employee; onClose: () => void; onEdit: () => void; onMove: (k: EmployeeMoveKind) => void; onVoid: (entryId: string) => void }) {
  const { state, can } = useCompany();
  const canWrite = can('employees.manage');
  const bal = employeeBalance(state, emp.id);
  const moves = employeeMoves(state, emp.id);
  let net = 0;
  const log = moves.map((m) => {
    if (!m.voided) net += SIGN[m.kind] * m.amount;
    return { ...m, net };
  });
  return (
    <Modal title={emp.name} onClose={onClose} width={860}>
      <div className="toolbar no-print">
        {canWrite && (
          <>
            <button className="primary" onClick={() => onMove('payment')}>
              دفع راتب
            </button>
            <button onClick={() => onMove('accrual')}>استحقاق راتب</button>
            <button onClick={() => onMove('advance')}>سلفة</button>
            <button onClick={() => onMove('bonus')}>مكافأة / خصم</button>
            <button className="ghost" onClick={onEdit}>
              تعديل البيانات
            </button>
          </>
        )}
        <PrintButtons kind="report" name={`كشف الموظف ${emp.name}`} papers={['a4', 'a5']} />
      </div>
      <div className="print-area">
        <DocHeader title={`كشف حساب الموظف: ${emp.name}`}>{emp.jobTitle && <div>{emp.jobTitle}</div>}</DocHeader>
        <div className="emp-card">
          <div className="kv">
            {emp.jobTitle && (
              <>
                <span>العمل</span>
                <strong>{emp.jobTitle}</strong>
              </>
            )}
            {emp.phone && (
              <>
                <span>الهاتف</span>
                <strong className="ltr">{emp.phone}</strong>
              </>
            )}
            {emp.nationalId && (
              <>
                <span>الرقم الوطني</span>
                <strong className="ltr">{emp.nationalId}</strong>
              </>
            )}
            <span>الراتب</span>
            <strong>
              {money(state, emp.salary)} {PAY_PERIOD_NAMES[emp.payPeriod]}
            </strong>
            {emp.startDate && (
              <>
                <span>بداية العمل</span>
                <strong>{dateText(emp.startDate)}</strong>
              </>
            )}
            {emp.address && (
              <>
                <span>العنوان</span>
                <strong>{emp.address}</strong>
              </>
            )}
          </div>
          <div className="emp-balance">
            <div>
              <span>اللي استحقلو</span>
              <b>{money(state, bal.earned)}</b>
            </div>
            <div>
              <span>اللي استلمه</span>
              <b>{money(state, bal.received)}</b>
            </div>
            <div>
              <span>راتب مستحق</span>
              <b>{money(state, bal.salaryDue)}</b>
            </div>
            <div>
              <span>سلف عليه</span>
              <b>{money(state, bal.advances)}</b>
            </div>
            <div className={`net ${bal.net < 0 ? 'neg' : ''}`}>
              <span>{bal.net >= 0 ? 'الصافي إلو' : 'الصافي عليه'}</span>
              <b>{money(state, Math.abs(bal.net))}</b>
            </div>
          </div>
        </div>
        {emp.notes && <p className="muted">{emp.notes}</p>}
        <h3>سجل العمليات</h3>
        {moves.length === 0 ? (
          <Empty>ما في عمليات لسا</Empty>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>العملية</th>
                <th className="num">المبلغ</th>
                <th className="num">الصافي إلو بعدها</th>
                <th>البيان</th>
                <th>بواسطة</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {log
                .slice()
                .reverse()
                .map((m) => (
                  <tr key={m.entryId} className={m.voided ? 'voided' : ''}>
                    <td>{dateText(m.date)}</td>
                    <td>
                      {EMPLOYEE_MOVE_NAMES[m.kind]}
                      {m.period && <small className="muted"> {m.period}</small>}
                      {m.voided && <small className="bad"> (ملغاة)</small>}
                    </td>
                    <td className={`num ${SIGN[m.kind] > 0 ? 'good' : SIGN[m.kind] < 0 ? 'bad' : ''}`}>{money(state, m.amount)}</td>
                    <td className="num">{money(state, m.net)}</td>
                    <td className="muted">{m.memo.replace(/^[^—]*— [^:]*:?\s*/, '')}</td>
                    <td className="muted">{state.users[m.createdBy]?.displayName ?? ''}</td>
                    <td className="no-print">
                      {!m.voided && canWrite && (
                        <button className="ghost" onClick={() => onVoid(m.entryId)}>
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
