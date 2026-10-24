import { useMemo, useState } from 'react';
import { INVOICE_KIND_NAMES, type Invoice, type InvoiceKind } from '../../../core';
import { dateText, major, money, useCompany } from '../api';
import { ExportButtons } from '../components/print';
import { Empty, Field, matches, PageHeader, SearchBox } from '../components/ui';
import { Icon } from '../components/icons';

/** صلاحية تعديل الفاتورة: إلغاء + إنشاء من نفس النوع، ومش طالعة من طلب أو مشروع. */
export function canEditInvoice(inv: Invoice, can: (p: never) => boolean): boolean {
  const create = inv.kind === 'purchase' || inv.kind === 'purchase_return' ? 'purchases.create' : inv.kind === 'sale_return' ? 'returns.create' : 'sales.create';
  return !inv.voidEntryId && !inv.source && can('sales.void' as never) && can(create as never);
}

export function Invoices() {
  const { state, navigate, can } = useCompany();
  const users = state.users;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<InvoiceKind | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // قائمة الكبسة اليمين على الفاتورة
  const [menu, setMenu] = useState<{ inv: Invoice; x: number; y: number } | null>(null);

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
              <tr
                key={i.id}
                className={`clickable ${i.voidEntryId ? 'voided' : ''}`}
                onClick={() => navigate('invoice', i.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ inv: i, x: e.clientX, y: e.clientY });
                }}
              >
                <td>{INVOICE_KIND_NAMES[i.kind]}</td>
                <td className="mono">{i.number}</td>
                <td>{dateText(i.date)}</td>
                <td>{i.partyId ? state.parties[i.partyId]?.name : 'نقدي'}</td>
                <td className="num">{money(state, i.total, i.currency)}</td>
                <td className="num">{money(state, i.paid, i.currency)}</td>
                <td className="muted">{users[i.createdBy]?.displayName}</td>
                <td>
                  {i.voidEntryId && <span className="tag bad">ملغاة{state.invoices.some((x) => x.replaces === i.id) ? ' (معدّلة)' : ''}</span>}
                  {i.replaces && <span className="tag">معدّلة</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {menu && (
        <div className="ctx-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))}>
          <div className="ctx-menu" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 160) }} onClick={(e) => e.stopPropagation()}>
            <b>
              {INVOICE_KIND_NAMES[menu.inv.kind]} رقم {menu.inv.number}
            </b>
            <button onClick={() => (setMenu(null), navigate('invoice', menu.inv.id))}>
              <Icon name="file" size={16} /> فتح الفاتورة
            </button>
            {canEditInvoice(menu.inv, can as never) ? (
              <button onClick={() => (setMenu(null), navigate(menu.inv.kind, menu.inv.id))}>
                <Icon name="customize" size={16} /> تعديل الفاتورة
              </button>
            ) : (
              <span className="muted">{menu.inv.voidEntryId ? 'الفاتورة ملغاة' : menu.inv.source ? 'بتتعدّل من الطلب أو المشروع تبعها' : 'ما عندك صلاحية التعديل'}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
