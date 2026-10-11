import { amountInWords, findRate, INVOICE_KIND_NAMES, lineAmount, type Invoice } from '../../../core';
import { dateText, money, qtyText, today, useCompany } from '../api';
import { DocHeader, PrintButtons } from '../components/print';
import { ConfirmButton, Empty, PageHeader } from '../components/ui';

export function InvoiceView({ id }: { id: string }) {
  const { state, call, notify, navigate, can } = useCompany();
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return <Empty>الفاتورة غير موجودة</Empty>;

  return (
    <div className="page">
      <PageHeader title={`${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`}>
        <PrintButtons kind={inv.kind === 'sale' || inv.kind === 'sale_return' ? 'invoice' : 'report'} name={`${INVOICE_KIND_NAMES[inv.kind]} ${inv.number}`} />
        {!inv.voidEntryId && can('sales.void') && (
          <ConfirmButton
            label="إلغاء الفاتورة"
            confirmLabel="تأكيد الإلغاء"
            onConfirm={async () => {
              if (await call('voidInvoice', inv.id, today())) notify('تم إلغاء الفاتورة وإرجاع المخزون');
            }}
          />
        )}
        {(can('sales.create') || can('purchases.create')) && (
          <button className="primary" onClick={() => navigate(inv.kind)}>
            + جديدة
          </button>
        )}
      </PageHeader>
      {inv.voidEntryId && <div className="banner bad">هذه الفاتورة ملغاة</div>}
      <div className="paper-preview">
        <InvoiceDocument inv={inv} />
      </div>
    </div>
  );
}

export function InvoiceDocument({ inv }: { inv: Invoice }) {
  const { state } = useCompany();
  const company = state.info!;
  const print = company.print ?? {};
  const party = inv.partyId ? state.parties[inv.partyId] : null;
  const src = inv.source;
  const repair = src?.type === 'repair' ? state.repairs[src.id] : undefined;
  const vehicle = repair ? state.vehicles[repair.vehicleId] : undefined;
  const order = src?.type === 'order' ? state.orders[src.id] : undefined;
  const table = order?.tableId ? state.tables[order.tableId] : undefined;
  const m = (v: number) => money(state, v, inv.currency);
  const remaining = inv.total - inv.paid;
  const usdRate = inv.currency === 'USD' ? null : findRate(state, 'USD', inv.date);
  const showUsd = print.showUsdEquivalent && inv.currency !== 'USD' && usdRate;
  const decimals = state.currencies[inv.currency]?.decimals ?? 2;

  return (
    <div className="print-area invoice-doc">
      <DocHeader title={INVOICE_KIND_NAMES[inv.kind]}>
        <div>رقم: {inv.number}</div>
        <div>
          التاريخ: <span className="ltr">{dateText(inv.date)}</span>
        </div>
        {inv.voidEntryId && <div className="bad">ملغاة</div>}
      </DocHeader>
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
            <span>{vehicle.kind === 'device' ? 'الجهاز:' : 'السيارة:'}</span>{' '}
            <strong>
              {vehicle.make} {vehicle.model} {vehicle.year ?? ''} {vehicle.plate ? `— ${vehicle.plate}` : ''}
            </strong>
            {repair?.odometer ? <span> · العداد: {repair.odometer.toLocaleString('en')} كم</span> : null}
          </div>
        )}
        {order && (
          <div>
            طلب رقم {order.number}
            {table ? ` · ${table.name}` : order.type === 'takeaway' ? ' · سفري' : order.type === 'delivery' ? ' · توصيل' : ''}
          </div>
        )}
        {inv.salesman && <div>المندوب: {inv.salesman}</div>}
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
                  {l.batches?.some((b) => b.batch) && <div className="doc-sub">الدفعة: {l.batches.map((b) => `${b.batch}${b.expiry ? ` (${dateText(b.expiry)})` : ''}`).join('، ')}</div>}
                  {l.serials?.length ? <div className="doc-sub mono">{l.serials.join(' · ')}</div> : null}
                  {item?.warrantyMonths && inv.kind === 'sale' ? <div className="doc-sub">كفالة {item.warrantyMonths} شهراً</div> : null}
                  {l.note && <div className="doc-sub">{l.note}</div>}
                </td>
                <td>
                  {qtyText(l.qty)} {l.unit ?? item?.unit ?? ''}
                </td>
                <td>{m(l.price)}</td>
                <td>
                  {m(lineAmount(l))}
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
          <span>{inv.kind === 'sale' || inv.kind === 'purchase_return' ? 'المقبوض' : 'المدفوع'}</span>
          <strong>{m(inv.paid)}</strong>
        </div>
        {remaining > 0 && (
          <div>
            <span>الباقي</span>
            <strong>{m(remaining)}</strong>
          </div>
        )}
        {inv.currency !== company.baseCurrency && (
          <div className="muted">
            <span>سعر الصرف</span>
            <strong>{inv.rate.toLocaleString('en')}</strong>
          </div>
        )}
        {showUsd && (
          <div className="muted">
            <span>المقابل بالدولار</span>
            <strong>{money(state, Math.round((inv.total * inv.rate) / usdRate * 10 ** (2 - decimals)), 'USD')}</strong>
          </div>
        )}
      </div>
      {print.showAmountInWords !== false && <p className="doc-words">{amountInWords(inv.total, inv.currency, decimals)}</p>}
      {inv.notes && <p className="doc-notes">{inv.notes}</p>}
      <footer className="doc-footer">{print.footer || 'شكراً لتعاملكم معنا'}</footer>
    </div>
  );
}
