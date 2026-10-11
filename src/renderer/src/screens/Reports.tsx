import { useMemo, useState } from 'react';
import { accountStatement, balancesByCurrency, incomeStatement, stockReport, trialBalance, type Period } from '../../../core';
import { money, qtyText, today, useCompany, dateText } from '../api';
import { Empty, Field, PageHeader, Stat } from '../components/ui';
import { printDocument } from './InvoiceView';

type Tab = 'trial' | 'statement' | 'income' | 'stock' | 'cash';

const TABS: { key: Tab; label: string }[] = [
  { key: 'income', label: 'الأرباح والخسائر' },
  { key: 'cash', label: 'الصناديق' },
  { key: 'stock', label: 'المخزون' },
  { key: 'statement', label: 'كشف حساب' },
  { key: 'trial', label: 'ميزان المراجعة' },
];

export function Reports() {
  const { state } = useCompany();
  const [tab, setTab] = useState<Tab>('income');
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const period: Period = { from, to };

  return (
    <div className="page">
      <PageHeader title="التقارير">
        <button onClick={() => printDocument('a4')}>طباعة</button>
      </PageHeader>
      <div className="toolbar">
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'stock' && tab !== 'cash' && (
          <div className="period">
            <Field label="من">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="إلى">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
      <div className="print-area report">
        <div className="print-only report-head">
          <h2>
            {state.info?.name} — {TABS.find((t) => t.key === tab)?.label}
          </h2>
          {tab !== 'stock' && tab !== 'cash' && (
            <div>
              من {from} إلى {to}
            </div>
          )}
        </div>
        {tab === 'trial' && <TrialBalance period={period} />}
        {tab === 'statement' && <Statement period={period} />}
        {tab === 'income' && <Income period={period} />}
        {tab === 'stock' && <Stock />}
        {tab === 'cash' && <Cash />}
      </div>
    </div>
  );
}

function TrialBalance({ period }: { period: Period }) {
  const { state } = useCompany();
  const tb = useMemo(() => trialBalance(state, period), [state, period.from, period.to]);
  if (tb.rows.length === 0) return <Empty>لا توجد حركات في هذه الفترة</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>الرمز</th>
          <th>الحساب</th>
          <th className="num">مدين</th>
          <th className="num">دائن</th>
          <th className="num">الرصيد</th>
        </tr>
      </thead>
      <tbody>
        {tb.rows.map((r) => (
          <tr key={r.account.id} className={r.account.isGroup ? 'group-row' : ''}>
            <td className="mono">{r.account.id}</td>
            <td style={{ paddingInlineStart: 12 + r.level * 18 }}>{r.account.name}</td>
            <td className="num">{money(state, r.debit)}</td>
            <td className="num">{money(state, r.credit)}</td>
            <td className="num">{money(state, r.balance)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td />
          <td>المجموع</td>
          <td className="num">{money(state, tb.totalDebit)}</td>
          <td className="num">{money(state, tb.totalCredit)}</td>
          <td className={`num ${tb.totalDebit === tb.totalCredit ? 'good' : 'bad'}`}>{tb.totalDebit === tb.totalCredit ? 'متوازن ✓' : 'غير متوازن'}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function Statement({ period }: { period: Period }) {
  const { state } = useCompany();
  const [accountId, setAccountId] = useState('1101');
  const accounts = Object.values(state.accounts).sort((a, b) => a.id.localeCompare(b.id));
  const st = useMemo(() => accountStatement(state, accountId, period), [state, accountId, period.from, period.to]);
  return (
    <>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} — {a.name}
            </option>
          ))}
        </select>
      </div>
      <h3 className="print-only">{state.accounts[accountId]?.name}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>رقم القيد</th>
            <th>البيان</th>
            <th className="num">مدين</th>
            <th className="num">دائن</th>
            <th className="num">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          <tr className="group-row">
            <td colSpan={5}>رصيد أول المدة</td>
            <td className="num">{money(state, st.opening)}</td>
          </tr>
          {st.rows.map((r) => (
            <tr key={r.entryId}>
              <td>{dateText(r.date)}</td>
              <td className="mono">{r.number}</td>
              <td>{r.memo}</td>
              <td className="num">{r.debit ? money(state, r.debit) : ''}</td>
              <td className="num">{r.credit ? money(state, r.credit) : ''}</td>
              <td className="num">{money(state, r.running)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>الرصيد الختامي</td>
            <td className="num">{money(state, st.closing)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function Income({ period }: { period: Period }) {
  const { state } = useCompany();
  const inc = useMemo(() => incomeStatement(state, period), [state, period.from, period.to]);
  const tb = useMemo(() => trialBalance(state, period), [state, period.from, period.to]);
  const leaf = (type: 'revenue' | 'expense') => tb.rows.filter((r) => r.account.type === type && !r.account.isGroup && r.balance !== 0);
  return (
    <>
      <div className="stats">
        <Stat label="الإيرادات" value={money(state, inc.revenue)} />
        <Stat label="المصاريف (مع تكلفة البضاعة)" value={money(state, inc.expenses)} />
        <Stat label={inc.netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'} value={money(state, Math.abs(inc.netProfit))} tone={inc.netProfit >= 0 ? 'good' : 'bad'} />
      </div>
      <div className="two-col">
        <table className="table">
          <thead>
            <tr>
              <th>الإيرادات</th>
              <th className="num">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {leaf('revenue').map((r) => (
              <tr key={r.account.id}>
                <td>{r.account.name}</td>
                <td className="num">{money(state, -r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="table">
          <thead>
            <tr>
              <th>المصاريف</th>
              <th className="num">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {leaf('expense').map((r) => (
              <tr key={r.account.id}>
                <td>{r.account.name}</td>
                <td className="num">{money(state, r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stock() {
  const { state } = useCompany();
  const rows = useMemo(() => stockReport(state), [state]);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (rows.length === 0) return <Empty>لا توجد مواد مخزنية</Empty>;
  return (
    <>
      <div className="stats">
        <Stat label="قيمة المخزون (بالتكلفة)" value={money(state, total)} />
        <Stat label="مواد تحت الحد الأدنى" value={String(rows.filter((r) => r.low).length)} tone={rows.some((r) => r.low) ? 'bad' : 'good'} />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>الرمز</th>
            <th>المادة</th>
            <th>المكان</th>
            <th className="num">الكمية</th>
            <th className="num">متوسط التكلفة</th>
            <th className="num">القيمة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item.id} className={r.low ? 'warn-row' : ''}>
              <td className="mono">{r.item.code}</td>
              <td>
                {r.item.name} {r.item.partNumber && <small className="mono muted">{r.item.partNumber}</small>}
              </td>
              <td>{r.item.location}</td>
              <td className={`num ${r.low ? 'bad' : ''}`}>
                {qtyText(r.qty)} {r.item.unit}
              </td>
              <td className="num">{money(state, r.avgCost)}</td>
              <td className="num">{money(state, r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Cash() {
  const { state } = useCompany();
  const boxes = Object.values(state.accounts).filter((a) => !a.isGroup && (a.id.startsWith('1101') || a.id.startsWith('1102') || a.parentId === '1101' || a.parentId === '1102'));
  return (
    <table className="table">
      <thead>
        <tr>
          <th>الصندوق / البنك</th>
          <th>الرصيد بكل عملة</th>
        </tr>
      </thead>
      <tbody>
        {boxes.map((a) => {
          const bal = balancesByCurrency(state, a.id);
          const entries = Object.entries(bal).filter(([, v]) => v !== 0);
          return (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{entries.length === 0 ? <span className="muted">0</span> : entries.map(([c, v]) => <div key={c}>{money(state, v, c)}</div>)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
