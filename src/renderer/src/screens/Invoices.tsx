import { useMemo, useState } from 'react';
import { INVOICE_KIND_NAMES, type InvoiceKind } from '../../../core';
import { dateText, major, money, useCompany } from '../api';
import { ExportButtons } from '../components/print';
import { Empty, Field, matches, PageHeader, SearchBox } from '../components/ui';

export function Invoices() {
  const { state, navigate, can } = useCompany();
  const users = state.users;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<InvoiceKind | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rows = useMemo(
    () =>
      state.invoices
        .filter(
          (i) =>
            (kind === 'all' || i.kind === kind) &&
            (!from || i.date >= from) &&
            (!to || i.date <= to) &&
            matches(query, i.number, i.partyId ? state.parties[i.partyId]?.name : 'نقدي', i.notes, i.salesman, ...i.lines.flatMap((l) => l.serials ?? [])),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 1000),
    [state, query, kind, from, to],
  );

  return (
    <div className="page">
      <PageHeader title="سجل الفواتير">
        {can('returns.create') && <button onClick={() => navigate('sale_return')}>مرتجع مبيع</button>}
        {can('purchases.create') && <button onClick={() => navigate('purchase_return')}>مرتجع شراء</button>}
        <ExportButtons
          name="الفواتير"
          sheets={() => [
            {
              name: 'الفواتير',
              columns: [
                { header: 'النوع', key: 'kind' },
                { header: 'الرقم', key: 'number', type: 'number' },
                { header: 'التاريخ', key: 'date' },
                { header: 'العميل / المورد', key: 'party' },
                { header: 'العملة', key: 'currency' },
                { header: 'الإجمالي', key: 'total', type: 'money' },
                { header: 'المدفوع', key: 'paid', type: 'money' },
                { header: 'الباقي', key: 'rest', type: 'money' },
                { header: 'المستخدم', key: 'user' },
                { header: 'الحالة', key: 'status' },
              ],
              rows: rows.map((i) => ({
                kind: INVOICE_KIND_NAMES[i.kind],
                number: i.number,
                date: dateText(i.date),
                party: i.partyId ? state.parties[i.partyId]?.name : 'نقدي',
                currency: i.currency,
                total: major(state, i.total, i.currency),
                paid: major(state, i.paid, i.currency),
                rest: major(state, i.total - i.paid, i.currency),
                user: users[i.createdBy]?.displayName ?? i.createdBy,
                status: i.voidEntryId ? 'ملغاة' : '',
              })),
            },
          ]}
        />
      </PageHeader>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم الفاتورة، اسم العميل، المندوب، أو رقم IMEI..." />
        <select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind | 'all')}>
          <option value="all">كل الأنواع</option>
          {Object.entries(INVOICE_KIND_NAMES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="period">
          <Field label="من">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty>لا توجد فواتير</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>النوع</th>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>العميل / المورد</th>
              <th className="num">الإجمالي</th>
              <th className="num">المدفوع</th>
              <th>المستخدم</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className={`clickable ${i.voidEntryId ? 'voided' : ''}`} onClick={() => navigate('invoice', i.id)}>
                <td>{INVOICE_KIND_NAMES[i.kind]}</td>
                <td className="mono">{i.number}</td>
                <td>{dateText(i.date)}</td>
                <td>{i.partyId ? state.parties[i.partyId]?.name : 'نقدي'}</td>
                <td className="num">{money(state, i.total, i.currency)}</td>
                <td className="num">{money(state, i.paid, i.currency)}</td>
                <td className="muted">{users[i.createdBy]?.displayName}</td>
                <td>{i.voidEntryId && <span className="tag bad">ملغاة</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
