import { useMemo, useState } from 'react';
import { INVOICE_KIND_NAMES, type InvoiceKind } from '../../../core';
import { money, useCompany, dateText } from '../api';
import { Empty, matches, PageHeader, SearchBox } from '../components/ui';

export function Invoices() {
  const { state, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<InvoiceKind | 'all'>('all');

  const rows = useMemo(
    () =>
      state.invoices
        .filter((i) => (kind === 'all' || i.kind === kind) && matches(query, i.number, i.partyId ? state.parties[i.partyId]?.name : 'نقدي', i.notes))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [state, query, kind],
  );

  return (
    <div className="page">
      <PageHeader title="سجل الفواتير">
        <button onClick={() => navigate('sale_return')}>مرتجع مبيع</button>
        <button onClick={() => navigate('purchase_return')}>مرتجع شراء</button>
      </PageHeader>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم الفاتورة أو اسم العميل..." />
        <select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind | 'all')}>
          <option value="all">كل الأنواع</option>
          {Object.entries(INVOICE_KIND_NAMES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
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
                <td>{i.voidEntryId && <span className="tag bad">ملغاة</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
