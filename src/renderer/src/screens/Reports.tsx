import { useEffect, useMemo, useState } from 'react';
import {
  accountStatement,
  balanceSheet,
  cashMovement,
  dailySummary,
  incomeStatement,
  itemPlacesText,
  receivablesAging,
  salesByItem,
  salesByPerson,
  stockReport,
  trialBalance,
  type Period,
} from '../../../core';
import type { ExportSheet } from '../api';
import { dateText, major, money, qtyText, today, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { Empty, Field, PageHeader, Stat, Tabs } from '../components/ui';

type Tab = 'daily' | 'income' | 'balance' | 'cash' | 'items' | 'people' | 'aging' | 'stock' | 'statement' | 'trial';

const TITLES: Record<Tab, string> = {
  daily: 'إغلاق اليوم',
  income: 'الأرباح والخسائر',
  balance: 'الميزانية',
  cash: 'حركة الصناديق',
  items: 'أرباح المواد',
  people: 'المبيعات حسب البائع',
  aging: 'أعمار الديون',
  stock: 'المخزون',
  statement: 'كشف حساب',
  trial: 'ميزان المراجعة',
};

export function Reports({ tab: initial }: { tab?: string }) {
  const { state, can } = useCompany();
  const fin = can('reports.financial');
  const [tab, setTab] = useState<Tab>((initial as Tab) ?? (fin ? 'income' : can('reports.stock') ? 'stock' : 'daily'));
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const period = useMemo<Period>(() => ({ from, to }), [from, to]);
  const [sheet, setSheet] = useState<ExportSheet | null>(null);
  const usesPeriod = !['daily', 'balance', 'aging', 'stock'].includes(tab);

  return (
    <div className="page">
      <PageHeader title="التقارير">
        <PrintButtons kind="report" name={TITLES[tab]} papers={['a4', 'a5', '80mm']} />
        {sheet && <ExportButtons name={TITLES[tab]} sheets={() => [sheet]} />}
      </PageHeader>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={(Object.keys(TITLES) as Tab[]).map((k) => ({ key: k, label: TITLES[k], hidden: k === 'daily' ? !(fin || can('sales.create')) : k === 'stock' ? !can('reports.stock') : !fin || (k === 'items' && !can('costs.view')) }))}
      />
      {usesPeriod && (
        <div className="toolbar period">
          <Field label="من">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="print-area report">
        <div className="print-only">
          <DocHeader title={TITLES[tab]}>{usesPeriod ? <div className="ltr">{`${dateText(from)} - ${dateText(to)}`}</div> : <div className="ltr">{dateText(today())}</div>}</DocHeader>
        </div>
        {tab === 'daily' && <Daily onSheet={setSheet} />}
        {tab === 'income' && <Income period={period} onSheet={setSheet} />}
        {tab === 'balance' && <Balance onSheet={setSheet} />}
        {tab === 'cash' && <Cash period={period} onSheet={setSheet} />}
        {tab === 'items' && <ItemsProfit period={period} onSheet={setSheet} />}
        {tab === 'people' && <People period={period} onSheet={setSheet} />}
        {tab === 'aging' && <Aging onSheet={setSheet} />}
        {tab === 'stock' && <Stock onSheet={setSheet} />}
        {tab === 'statement' && <Statement period={period} onSheet={setSheet} />}
        {tab === 'trial' && <Trial period={period} onSheet={setSheet} />}
      </div>
      <p className="muted no-print">المبالغ بالعملة الأساسية ({state.currencies[state.info!.baseCurrency]?.nameAr}).</p>
    </div>
  );
}

type SheetProps = { onSheet: (s: ExportSheet) => void };

/** يحدّث جدول التصدير عند تغيّر البيانات. */
function useSheet(onSheet: (s: ExportSheet) => void, sheet: ExportSheet) {
  const key = JSON.stringify(sheet);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onSheet(sheet), [key]);
}

function Income({ period, onSheet }: { period: Period } & SheetProps) {
  const { state } = useCompany();
  const inc = useMemo(() => incomeStatement(state, period), [state, period]);
  const tb = useMemo(() => trialBalance(state, period), [state, period]);
  const leaf = (type: 'revenue' | 'expense') => tb.rows.filter((r) => r.account.type === type && !r.account.isGroup && r.balance !== 0);
  const rev = leaf('revenue');
  const exp = leaf('expense');
  useSheet(onSheet, {
    name: 'الأرباح والخسائر',
    columns: [
      { header: 'البند', key: 'name' },
      { header: 'المبلغ', key: 'amount', type: 'money' },
    ],
    rows: [
      ...rev.map((r) => ({ name: r.account.name, amount: major(state, -r.balance) })),
      ...exp.map((r) => ({ name: r.account.name, amount: -major(state, r.balance) })),
      { name: 'صافي الربح', amount: major(state, inc.netProfit) },
    ],
  });
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
            {rev.map((r) => (
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
            {exp.map((r) => (
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

function Balance({ onSheet }: SheetProps) {
  const { state } = useCompany();
  const bs = useMemo(() => balanceSheet(state), [state]);
  const tb = useMemo(() => trialBalance(state), [state]);
  const rows = (type: 'asset' | 'liability' | 'equity') => tb.rows.filter((r) => r.account.type === type && !r.account.isGroup && r.balance !== 0);
  const sign = (t: string) => (t === 'asset' ? 1 : -1);
  useSheet(onSheet, {
    name: 'الميزانية',
    columns: [
      { header: 'القسم', key: 'section' },
      { header: 'الحساب', key: 'name' },
      { header: 'الرصيد', key: 'amount', type: 'money' },
    ],
    rows: (['asset', 'liability', 'equity'] as const).flatMap((t) => rows(t).map((r) => ({ section: t === 'asset' ? 'الأصول' : t === 'liability' ? 'الخصوم' : 'حقوق الملكية', name: r.account.name, amount: major(state, sign(t) * r.balance) }))),
  });
  return (
    <>
      <div className="stats">
        <Stat label="الأصول" value={money(state, bs.assets)} />
        <Stat label="الخصوم" value={money(state, bs.liabilities)} />
        <Stat label="حقوق الملكية (مع ربح الفترة)" value={money(state, bs.equity)} />
        <Stat label="التوازن" value={bs.assets === bs.liabilities + bs.equity ? 'متوازنة ✓' : 'غير متوازنة'} tone={bs.assets === bs.liabilities + bs.equity ? 'good' : 'bad'} />
      </div>
      <div className="two-col">
        <table className="table">
          <thead>
            <tr>
              <th>الأصول</th>
              <th className="num">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {rows('asset').map((r) => (
              <tr key={r.account.id}>
                <td>{r.account.name}</td>
                <td className="num">{money(state, r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="table">
          <thead>
            <tr>
              <th>الخصوم وحقوق الملكية</th>
              <th className="num">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {[...rows('liability'), ...rows('equity')].map((r) => (
              <tr key={r.account.id}>
                <td>{r.account.name}</td>
                <td className="num">{money(state, -r.balance)}</td>
              </tr>
            ))}
            <tr className="group-row">
              <td>ربح الفترة غير المقفل</td>
              <td className="num">{money(state, bs.currentProfit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Cash({ period, onSheet }: { period: Period } & SheetProps) {
  const { state } = useCompany();
  const rows = useMemo(() => cashMovement(state, period), [state, period]);
  const flat = rows.flatMap((r) => Object.entries(r.byCurrency).map(([c, v]) => ({ name: r.account.name, c, ...v })));
  useSheet(onSheet, {
    name: 'الصناديق',
    columns: [
      { header: 'الصندوق', key: 'name' },
      { header: 'العملة', key: 'c' },
      { header: 'أول المدة', key: 'opening', type: 'money' },
      { header: 'الداخل', key: 'inflow', type: 'money' },
      { header: 'الخارج', key: 'outflow', type: 'money' },
      { header: 'آخر المدة', key: 'closing', type: 'money' },
    ],
    rows: flat.map((r) => ({ ...r, opening: major(state, r.opening, r.c), inflow: major(state, r.inflow, r.c), outflow: major(state, r.outflow, r.c), closing: major(state, r.closing, r.c) })),
  });
  if (!flat.length) return <Empty>لا توجد حركات</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>الصندوق</th>
          <th className="num">أول المدة</th>
          <th className="num">الداخل</th>
          <th className="num">الخارج</th>
          <th className="num">آخر المدة</th>
        </tr>
      </thead>
      <tbody>
        {flat.map((r) => (
          <tr key={r.name + r.c}>
            <td>{r.name}</td>
            <td className="num">{money(state, r.opening, r.c)}</td>
            <td className="num good">{money(state, r.inflow, r.c)}</td>
            <td className="num bad">{money(state, r.outflow, r.c)}</td>
            <td className="num">
              <strong>{money(state, r.closing, r.c)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ItemsProfit({ period, onSheet }: { period: Period } & SheetProps) {
  const { state } = useCompany();
  const rows = useMemo(() => salesByItem(state, period), [state, period]);
  const total = rows.reduce((s, r) => ({ revenue: s.revenue + r.revenue, cost: s.cost + r.cost, profit: s.profit + r.profit }), { revenue: 0, cost: 0, profit: 0 });
  useSheet(onSheet, {
    name: 'أرباح المواد',
    columns: [
      { header: 'المادة', key: 'name' },
      { header: 'الكمية', key: 'qty', type: 'number' },
      { header: 'المبيعات', key: 'revenue', type: 'money' },
      { header: 'التكلفة', key: 'cost', type: 'money' },
      { header: 'الربح', key: 'profit', type: 'money' },
      { header: 'نسبة الربح %', key: 'margin', type: 'number' },
    ],
    rows: rows.map((r) => ({ name: r.item.name, qty: r.qty, revenue: major(state, r.revenue), cost: major(state, r.cost), profit: major(state, r.profit), margin: r.revenue ? Math.round((r.profit / r.revenue) * 1000) / 10 : null })),
    totals: { revenue: major(state, total.revenue), cost: major(state, total.cost), profit: major(state, total.profit) },
  });
  if (!rows.length) return <Empty>لا مبيعات في هذه الفترة</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>المادة</th>
          <th className="num">الكمية</th>
          <th className="num">المبيعات</th>
          <th className="num">التكلفة</th>
          <th className="num">الربح</th>
          <th className="num">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.item.id}>
            <td>{r.item.name}</td>
            <td className="num">
              {qtyText(r.qty)} {r.item.unit}
            </td>
            <td className="num">{money(state, r.revenue)}</td>
            <td className="num">{money(state, r.cost)}</td>
            <td className={`num ${r.profit < 0 ? 'bad' : ''}`}>{money(state, r.profit)}</td>
            <td className="num">{r.revenue ? `${Math.round((r.profit / r.revenue) * 100)}%` : ''}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>المجموع</td>
          <td />
          <td className="num">{money(state, total.revenue)}</td>
          <td className="num">{money(state, total.cost)}</td>
          <td className="num">{money(state, total.profit)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

function People({ period, onSheet }: { period: Period } & SheetProps) {
  const { state, feature } = useCompany();
  const [by, setBy] = useState<'createdBy' | 'salesman'>('createdBy');
  const rows = useMemo(() => salesByPerson(state, period, by), [state, period, by]);
  useSheet(onSheet, {
    name: 'المبيعات حسب البائع',
    columns: [
      { header: 'الاسم', key: 'name' },
      { header: 'عدد الفواتير', key: 'count', type: 'number' },
      { header: 'صافي المبيعات', key: 'total', type: 'money' },
    ],
    rows: rows.map((r) => ({ ...r, total: major(state, r.total) })),
  });
  return (
    <>
      {feature('salesmen') && (
        <div className="segmented no-print">
          <button className={by === 'createdBy' ? 'active' : ''} onClick={() => setBy('createdBy')}>
            حسب المستخدم
          </button>
          <button className={by === 'salesman' ? 'active' : ''} onClick={() => setBy('salesman')}>
            حسب المندوب
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>لا مبيعات</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th className="num">عدد الفواتير</th>
              <th className="num">صافي المبيعات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{r.count}</td>
                <td className="num">{money(state, r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Aging({ onSheet }: SheetProps) {
  const { state, navigate } = useCompany();
  const rows = useMemo(() => receivablesAging(state, today()), [state]);
  const labels = ['حتى 30 يوماً', '31 - 60', '61 - 90', 'أكثر من 90'];
  useSheet(onSheet, {
    name: 'أعمار الديون',
    columns: [{ header: 'العميل', key: 'name' }, ...labels.map((l, i) => ({ header: l, key: `b${i}`, type: 'money' as const })), { header: 'الإجمالي', key: 'total', type: 'money' }],
    rows: rows.map((r) => ({ name: r.name, b0: major(state, r.buckets[0]), b1: major(state, r.buckets[1]), b2: major(state, r.buckets[2]), b3: major(state, r.buckets[3]), total: major(state, r.balance) })),
  });
  if (!rows.length) return <Empty>لا توجد ديون على العملاء</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>العميل</th>
          {labels.map((l) => (
            <th key={l} className="num">
              {l}
            </th>
          ))}
          <th className="num">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.partyId} className="clickable" onClick={() => navigate('parties', r.partyId)}>
            <td>{r.name}</td>
            {r.buckets.map((b, i) => (
              <td key={i} className={`num ${i >= 2 && b > 0 ? 'bad' : ''}`}>
                {b ? money(state, b) : ''}
              </td>
            ))}
            <td className="num">
              <strong>{money(state, r.balance)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stock({ onSheet }: SheetProps) {
  const { state, can } = useCompany();
  const showCost = can('costs.view');
  const rows = useMemo(() => stockReport(state), [state]);
  const total = rows.reduce((s, r) => s + r.value, 0);
  useSheet(onSheet, {
    name: 'المخزون',
    columns: [
      { header: 'الرمز', key: 'code' },
      { header: 'المادة', key: 'name' },
      { header: 'الكمية', key: 'qty', type: 'number' },
      { header: 'الوحدة', key: 'unit' },
      ...(showCost ? [{ header: 'متوسط التكلفة', key: 'avg', type: 'money' as const }, { header: 'القيمة', key: 'value', type: 'money' as const }] : []),
    ],
    rows: rows.map((r) => ({ code: r.item.code, name: r.item.name, qty: r.qty, unit: r.item.unit, avg: major(state, r.avgCost), value: major(state, r.value) })),
  });
  if (!rows.length) return <Empty>لا توجد مواد مخزنية</Empty>;
  return (
    <>
      <div className="stats">
        {showCost && <Stat label="قيمة المخزون (بالتكلفة)" value={money(state, total)} />}
        <Stat label="مواد تحت الحد الأدنى" value={String(rows.filter((r) => r.low).length)} tone={rows.some((r) => r.low) ? 'bad' : 'good'} />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>الرمز</th>
            <th>المادة</th>
            <th>المكان</th>
            <th className="num">الكمية</th>
            {showCost && <th className="num">متوسط التكلفة</th>}
            {showCost && <th className="num">القيمة</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item.id} className={r.low ? 'warn-row' : ''}>
              <td className="mono">{r.item.code}</td>
              <td>{r.item.name}</td>
              <td>{itemPlacesText(state, r.item)}</td>
              <td className={`num ${r.low ? 'bad' : ''}`}>
                {qtyText(r.qty)} {r.item.unit}
              </td>
              {showCost && <td className="num">{money(state, r.avgCost)}</td>}
              {showCost && <td className="num">{money(state, r.value)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Statement({ period, onSheet }: { period: Period } & SheetProps) {
  const { state } = useCompany();
  const [accountId, setAccountId] = useState('1101');
  const accounts = Object.values(state.accounts).sort((a, b) => a.id.localeCompare(b.id));
  const st = useMemo(() => accountStatement(state, accountId, period), [state, accountId, period]);
  useSheet(onSheet, {
    name: 'كشف حساب',
    title: `${state.accounts[accountId]?.name}`,
    columns: [
      { header: 'التاريخ', key: 'date' },
      { header: 'القيد', key: 'n', type: 'number' },
      { header: 'البيان', key: 'memo' },
      { header: 'مدين', key: 'debit', type: 'money' },
      { header: 'دائن', key: 'credit', type: 'money' },
      { header: 'الرصيد', key: 'running', type: 'money' },
    ],
    rows: [{ memo: 'رصيد أول المدة', running: major(state, st.opening) }, ...st.rows.map((r) => ({ date: dateText(r.date), n: r.number, memo: r.memo, debit: r.debit ? major(state, r.debit) : null, credit: r.credit ? major(state, r.credit) : null, running: major(state, r.running) }))],
  });
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
            <th>القيد</th>
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

function Trial({ period, onSheet }: { period: Period } & SheetProps) {
  const { state } = useCompany();
  const tb = useMemo(() => trialBalance(state, period), [state, period]);
  useSheet(onSheet, {
    name: 'ميزان المراجعة',
    columns: [
      { header: 'الرمز', key: 'id' },
      { header: 'الحساب', key: 'name' },
      { header: 'مدين', key: 'debit', type: 'money' },
      { header: 'دائن', key: 'credit', type: 'money' },
      { header: 'الرصيد', key: 'balance', type: 'money' },
    ],
    rows: tb.rows.map((r) => ({ id: r.account.id, name: r.account.name, debit: major(state, r.debit), credit: major(state, r.credit), balance: major(state, r.balance) })),
    totals: { debit: major(state, tb.totalDebit), credit: major(state, tb.totalCredit) },
  });
  if (!tb.rows.length) return <Empty>لا توجد حركات في هذه الفترة</Empty>;
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

/** تقرير إغلاق اليوم: لكل موظف أو للمحل كله، يُطبع على الطابعة الحرارية آخر الدوام. */
function Daily({ onSheet }: { onSheet: (s: ExportSheet | null) => void }) {
  const { state, can, user } = useCompany();
  const fin = can('reports.financial');
  const [date, setDate] = useState(today());
  const [who, setWho] = useState<string>(fin ? '' : user.id);
  const d = useMemo(() => dailySummary(state, date, fin ? who || undefined : user.id), [state, date, who, fin, user.id]);
  const users = Object.values(state.users).filter((u) => u.active);
  const cur = (c: string) => state.currencies[c]?.nameAr ?? c;
  useEffect(() => {
    onSheet({
      name: 'إغلاق اليوم',
      columns: [
        { header: 'العملة', key: 'c' },
        { header: 'المبيعات', key: 'sales', type: 'money' },
        { header: 'نقداً', key: 'cash', type: 'money' },
        { header: 'آجل', key: 'credit', type: 'money' },
        { header: 'المرتجعات', key: 'ret', type: 'money' },
        { header: 'سندات القبض', key: 'rec', type: 'money' },
        { header: 'سندات الدفع', key: 'pay', type: 'money' },
        { header: 'صافي حركة الصندوق', key: 'net', type: 'money' },
      ],
      rows: d.rows.map((r) => ({
        c: cur(r.currency),
        sales: major(state, r.sales, r.currency),
        cash: major(state, r.salesCash, r.currency),
        credit: major(state, r.salesCredit, r.currency),
        ret: major(state, r.returns, r.currency),
        rec: major(state, r.receipts, r.currency),
        pay: major(state, r.payments, r.currency),
        net: major(state, r.cashIn, r.currency),
      })),
    });
  }, [d, onSheet, state]);
  return (
    <>
      <div className="toolbar no-print">
        <Field label="اليوم">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {fin && (
          <Field label="الموظف">
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">كل الموظفين</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="print-only daily-head">
        <div>اليوم: <span className="ltr">{dateText(date)}</span></div>
        <div>الموظف: {who || !fin ? (state.users[who || user.id]?.displayName ?? '') : 'الكل'}</div>
      </div>
      <div className="stats">
        <Stat label="عدد فواتير المبيع" value={String(d.invoices)} />
        <Stat label="فواتير ملغاة" value={String(d.voided)} tone={d.voided ? 'bad' : undefined} />
        <Stat label="الخصومات الممنوحة" value={money(state, d.discounts)} />
      </div>
      {d.rows.length === 0 ? (
        <Empty>لا توجد حركات في هذا اليوم</Empty>
      ) : (
        d.rows.map((r) => (
          <section key={r.currency} className="card daily-card">
            <h3>{cur(r.currency)}</h3>
            <div className="kv">
              <span>المبيعات</span>
              <strong>{money(state, r.sales, r.currency)}</strong>
              <span>منها نقداً</span>
              <strong>{money(state, r.salesCash, r.currency)}</strong>
              <span>منها آجل (دين)</span>
              <strong>{money(state, r.salesCredit, r.currency)}</strong>
              <span>مرتجعات المبيع</span>
              <strong>{money(state, r.returns, r.currency)}</strong>
              <span>سندات القبض</span>
              <strong>{money(state, r.receipts, r.currency)}</strong>
              <span>سندات الدفع</span>
              <strong>{money(state, r.payments, r.currency)}</strong>
              {r.purchases > 0 && (
                <>
                  <span>المشتريات</span>
                  <strong>{money(state, r.purchases, r.currency)}</strong>
                </>
              )}
              <span className="grand">صافي حركة الصندوق</span>
              <strong className={`grand ${r.cashIn < 0 ? 'bad' : 'good'}`}>{money(state, r.cashIn, r.currency)}</strong>
            </div>
          </section>
        ))
      )}
      {d.topItems.length > 0 && (
        <section className="card">
          <h3>الأكثر مبيعاً اليوم</h3>
          <table className="table compact">
            <tbody>
              {d.topItems.map((t) => (
                <tr key={t.itemId}>
                  <td>{t.name}</td>
                  <td className="num">{qtyText(t.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <div className="print-only daily-sign">توقيع الكاشير: ............ &nbsp; توقيع المدير: ............</div>
    </>
  );
}
