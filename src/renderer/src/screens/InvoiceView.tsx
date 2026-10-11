import { useState } from 'react';
import { INVOICE_KIND_NAMES, type Invoice } from '../../../core';
import { api, money, qtyText, today, useCompany, dateText } from '../api';
import { Empty, PageHeader } from '../components/ui';

type Paper = 'a4' | '80mm' | '58mm';

const PAGE_CSS: Record<Paper, string> = {
  a4: '@page { size: A4; margin: 12mm; }',
  '80mm': '@page { size: 80mm auto; margin: 3mm; }',
  '58mm': '@page { size: 58mm auto; margin: 2mm; }',
};

/** يطبع العنصر المعلَّم بـ print-area فقط بحجم الورق المطلوب. */
export async function printDocument(paper: Paper): Promise<void> {
  const style = document.createElement('style');
  style.textContent = PAGE_CSS[paper];
  document.head.appendChild(style);
  document.body.dataset['paper'] = paper;
  try {
    await api.print();
  } finally {
    style.remove();
    delete document.body.dataset['paper'];
  }
}

export function InvoiceView({ id }: { id: string }) {
  const { state, call, notify, navigate } = useCompany();
  const [confirmVoid, setConfirmVoid] = useState(false);
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return <Empty>الفاتورة غير موجودة</Empty>;

  return (
    <div className="page">
      <PageHeader title={`${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`}>
        <button onClick={() => printDocument('a4')}>طباعة A4</button>
        <button onClick={() => printDocument('80mm')}>طباعة حرارية 80mm</button>
        <button onClick={() => printDocument('58mm')}>58mm</button>
        {!inv.voidEntryId &&
          (confirmVoid ? (
            <button
              className="danger"
              onClick={async () => {
                if (await call('voidInvoice', inv.id, today())) notify('تم إلغاء الفاتورة وإرجاع المخزون');
                setConfirmVoid(false);
              }}
            >
              تأكيد الإلغاء
            </button>
          ) : (
            <button className="danger ghost" onClick={() => setConfirmVoid(true)}>
              إلغاء الفاتورة
            </button>
          ))}
        <button className="primary" onClick={() => navigate(inv.kind)}>
          + جديدة
        </button>
      </PageHeader>
      {inv.voidEntryId && <div className="banner bad">هذه الفاتورة ملغاة</div>}
      <div className="paper-preview">
        <InvoicePrint inv={inv} />
      </div>
    </div>
  );
}

export function InvoicePrint({ inv }: { inv: Invoice }) {
  const { state } = useCompany();
  const company = state.info!;
  const party = inv.partyId ? state.parties[inv.partyId] : null;
  const repair = inv.source?.type === 'repair' ? state.repairs[inv.source.id] : undefined;
  const vehicle = repair ? state.vehicles[repair.vehicleId] : undefined;
  const m = (v: number) => money(state, v, inv.currency);

  return (
    <div className="print-area invoice-doc">
      <header className="doc-header">
        <div>
          <h1>{company.name}</h1>
          {company.address && <div>{company.address}</div>}
          {company.phone && <div dir="ltr">{company.phone}</div>}
          {company.taxNumber && <div>رقم السجل: {company.taxNumber}</div>}
        </div>
        <div className="doc-title">
          <h2>{INVOICE_KIND_NAMES[inv.kind]}</h2>
          <div>رقم: {inv.number}</div>
          <div>التاريخ: <span className="ltr">{dateText(inv.date)}</span></div>
          {inv.voidEntryId && <div className="bad">ملغاة</div>}
        </div>
      </header>
      <div className="doc-party">
        <div>
          <span>{inv.kind.startsWith('sale') ? 'السيد/ة:' : 'المورد:'}</span> <strong>{party?.name ?? 'نقدي'}</strong>
          {party?.phone && (
            <>
              {' · '}
              <span className="ltr">{party.phone}</span>
            </>
          )}
        </div>
        {vehicle && (
          <div>
            <span>السيارة:</span>{' '}
            <strong>
              {vehicle.make} {vehicle.model} {vehicle.year ?? ''} — {vehicle.plate}
            </strong>
            {repair?.odometer ? <span> · العداد: {repair.odometer.toLocaleString('en')} كم</span> : null}
          </div>
        )}
      </div>
      <table className="doc-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>البيان</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => {
            const item = l.itemId ? state.items[l.itemId] : null;
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {l.description}
                  {item?.partNumber && <small className="mono"> {item.partNumber}</small>}
                </td>
                <td>{qtyText(l.qty)}</td>
                <td>{m(l.price)}</td>
                <td>
                  {m(Math.round(l.qty * l.price) - l.discount)}
                  {l.discount > 0 && <small> (خصم {m(l.discount)})</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="doc-totals">
        <div>
          <span>المجموع</span>
          <strong>{m(inv.subtotal)}</strong>
        </div>
        {inv.discount > 0 && (
          <div>
            <span>الخصم</span>
            <strong>{m(inv.discount)}</strong>
          </div>
        )}
        {inv.taxLines.map((t) => (
          <div key={t.taxId}>
            <span>{state.taxes[t.taxId]?.name}</span>
            <strong>{m(t.amount)}</strong>
          </div>
        ))}
        <div className="grand">
          <span>الإجمالي</span>
          <strong>{m(inv.total)}</strong>
        </div>
        <div>
          <span>المدفوع</span>
          <strong>{m(inv.paid)}</strong>
        </div>
        {inv.total - inv.paid > 0 && (
          <div>
            <span>الباقي</span>
            <strong>{m(inv.total - inv.paid)}</strong>
          </div>
        )}
        {inv.currency !== company.baseCurrency && (
          <div className="muted">
            <span>سعر الصرف</span>
            <strong>{inv.rate}</strong>
          </div>
        )}
      </div>
      {inv.notes && <p className="doc-notes">{inv.notes}</p>}
      <footer className="doc-footer">شكراً لتعاملكم معنا</footer>
    </div>
  );
}
