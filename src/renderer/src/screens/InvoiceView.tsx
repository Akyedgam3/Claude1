import { amountInWords, findRate, INVOICE_KIND_NAMES, invoicePartyBalance, invoiceProfit, lineAmount, weighingText, type CompanyState, type Invoice } from '../../../core';
import { dateText, money, plainMoney, qtyText, rateLine, today, useCompany } from '../api';
import type { ReactNode } from 'react';
import { CommercialDoc, type DocModel } from '../components/CommercialDoc';
import { ThermalReceipt, type ReceiptData } from '../components/ThermalReceipt';
import { PrintButtons } from '../components/print';
import { ConfirmButton, Empty, PageHeader } from '../components/ui';
import { canEditInvoice } from './Invoices';

export function InvoiceView({ id }: { id: string }) {
  const { state, call, notify, navigate, can } = useCompany();
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return <Empty>الفاتورة غير موجودة</Empty>;

  return (
    <div className="page">
      <PageHeader title={`${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`}>
        <PrintButtons kind={inv.kind === 'sale' || inv.kind === 'sale_return' ? 'invoice' : 'report'} name={`${INVOICE_KIND_NAMES[inv.kind]} ${inv.number}`} />
        {canEditInvoice(inv, can as never) && <button onClick={() => navigate(inv.kind, inv.id)}>تعديل</button>}
        {!inv.voidEntryId && can('sales.void') && (
          <ConfirmButton
            label="حذف الفاتورة"
            confirmLabel="تأكيد الحذف"
            onConfirm={async () => {
              if (await call('deleteInvoice', inv.id, today())) {
                notify('انحذفت الفاتورة ورجع المخزون والحسابات متل ما كانوا');
                navigate('invoices');
              }
            }}
          />
        )}
        <button title="نص جاهز للإرسال عبر واتساب" onClick={() => void navigator.clipboard.writeText(invoiceText(state, inv)).then(() => notify('تم نسخ نص الفاتورة، الصقه في واتساب'))}>
          نسخ كنص
        </button>
        {(can('sales.create') || can('purchases.create')) && (
          <button className="primary" onClick={() => navigate(inv.kind)}>
            + جديدة
          </button>
        )}
      </PageHeader>
      {inv.voidEntryId && (() => {
        const next = state.invoices.find((x) => x.replaces === inv.id);
        return (
          <div className="banner bad">
            {inv.deleted ? 'هذه الفاتورة محذوفة' : 'هذه الفاتورة ملغاة'}
            {next && (
              <>
                {' '}— انعدّلت، والنسخة الجديدة{' '}
                <button className="link" onClick={() => navigate('invoice', next.id)}>
                  من هون
                </button>
              </>
            )}
          </div>
        );
      })()}
      {inv.replaces && (
        <div className="banner info">
          فاتورة معدّلة.{' '}
          <button className="link" onClick={() => navigate('invoice', inv.replaces!)}>
            شوف النسخة القديمة
          </button>
        </div>
      )}
      {inv.kind === 'sale' && !inv.voidEntryId && can('costs.view') && state.info!.print?.showInvoiceProfit !== false && (() => {
        const p = invoiceProfit(state, inv);
        return (
          <div className={`profit-box no-print ${p.profit < 0 ? 'loss' : ''}`} style={{ maxWidth: 420 }}>
            <span>{p.profit < 0 ? 'خسارة هالفاتورة' : 'ربح هالفاتورة'}</span>
            <strong>{money(state, Math.abs(p.profit))}</strong>
            {p.revenue > 0 && <small>{Math.round((p.profit / p.revenue) * 100)}% · المبيع بدون الضريبة {money(state, p.revenue)} · التكلفة {money(state, p.cost)}</small>}
          </div>
        );
      })()}
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
  const saleSide = inv.kind === 'sale' || inv.kind === 'sale_return';
  const moneyIn = inv.kind === 'sale' || inv.kind === 'purchase_return';
  const account = partyAccountRows(state, inv);

  const refs: ReactNode[] = [];
  if (vehicle) {
    refs.push(
      <>
        {vehicle.kind === 'device' ? 'الجهاز: ' : 'السيارة: '}
        <strong>
          {vehicle.make} {vehicle.model} {vehicle.year ?? ''} {vehicle.plate ? `— ${vehicle.plate}` : ''}
        </strong>
        {repair?.odometer ? ` · العداد: ${repair.odometer.toLocaleString('en')} كم` : ''}
      </>,
    );
  }
  const shipment = src?.type === 'shipment' ? state.shipments?.[src.id] : undefined;
  if (shipment) {
    const row = (label: string, v?: string | number) => (v ? <>{label}: <strong>{v}</strong></> : null);
    for (const r of [
      row('اسم السائق', shipment.driver),
      row('رقم السيارة', shipment.plate),
      row('رقم البراد', shipment.trailer),
      shipment.driverPhone ? <>رقم السائق: <strong className="ltr">{shipment.driverPhone}</strong></> : null,
      row('من', shipment.origin),
      row('الوجهة', shipment.destination),
      row('المعبر', shipment.border),
      row('نوع البضاعة', shipment.goods ? `${shipment.goods}${shipment.refrigerated ? ' (مبرّد)' : ''}` : ''),
      row('عدد الطرود', shipment.packages),
      row('الوزن', shipment.weight ? `${shipment.weight} كغ` : ''),
      row('رقم البيان', shipment.declaration),
      row('رقم الحاوية', shipment.container),
    ])
      if (r) refs.push(r);
  }
  if (order) refs.push(`طلب رقم ${order.number}${table ? ` · ${table.name}` : order.type === 'takeaway' ? ' · سفري' : order.type === 'delivery' ? ' · توصيل' : ''}`);

  const model: DocModel = {
    title: INVOICE_KIND_NAMES[inv.kind],
    number: inv.number,
    meta: [
      { label: 'التاريخ', value: <span className="ltr">{dateText(inv.date)}</span> },
      ...(inv.salesman ? [{ label: 'المندوب', value: inv.salesman }] : []),
      ...(inv.currency !== company.baseCurrency ? [{ label: 'العملة', value: state.currencies[inv.currency]?.nameAr ?? inv.currency }] : []),
    ],
    party: {
      label: saleSide ? 'السيد/ة' : 'المورد',
      name: party?.name ?? (saleSide ? 'زبون نقدي' : 'مورد نقدي'),
      ...(party?.phone ? { phone: party.phone } : {}),
      ...(party?.address ? { address: party.address } : {}),
    },
    refs,
    lines: inv.lines.map((l) => {
      const item = l.itemId ? state.items[l.itemId] : null;
      const sub: ReactNode[] = [];
      if (item?.partNumber) sub.push(<span className="mono">{item.partNumber}</span>);
      if (l.batches?.some((b) => b.batch)) sub.push(`الدفعة: ${l.batches.map((b) => `${b.batch}${b.expiry ? ` (${dateText(b.expiry)})` : ''}`).join('، ')}`);
      if (l.serials?.length) sub.push(<span className="mono">{l.serials.join(' · ')}</span>);
      if (item?.warrantyMonths && inv.kind === 'sale') sub.push(`كفالة ${item.warrantyMonths} شهراً`);
      if (l.weighing) sub.push(weighingText(l.weighing, l.unit ?? item?.unit ?? 'كغ'));
      if (l.note) sub.push(l.note);
      return {
        description: l.description,
        sub,
        qty: `${qtyText(l.qty)} ${l.unit ?? item?.unit ?? ''}`,
        price: m(l.price),
        total: m(lineAmount(l)),
        ...(l.discount > 0 ? { discount: m(l.discount) } : {}),
      };
    }),
    totals: [
      { label: 'المجموع', value: m(inv.subtotal) },
      ...(inv.discount > 0 ? [{ label: 'الخصم', value: m(inv.discount) }] : []),
      ...inv.taxLines.map((t) => ({ label: state.taxes[t.taxId]?.name ?? 'ضريبة', value: m(t.amount) })),
    ],
    grand: { label: 'الإجمالي', value: m(inv.total) },
    after: [
      ...(account?.before ?? []),
      { label: moneyIn ? 'المقبوض' : 'المدفوع', value: m(inv.paid) },
      ...(account ? account.after : remaining > 0 ? [{ label: 'الباقي', value: m(remaining) }] : []),
      ...(inv.currency !== company.baseCurrency ? [{ label: 'سعر الصرف', value: rateLine(state, inv.currency, inv.rate) }] : []),
      ...(showUsd ? [{ label: 'المقابل بالدولار', value: money(state, Math.round(((inv.total * inv.rate) / usdRate) * 10 ** (2 - decimals)), 'USD') }] : []),
    ],
    ...(print.showAmountInWords !== false ? { words: amountInWords(inv.total, inv.currency, decimals) } : {}),
    ...(inv.notes && !shipment ? { notes: inv.notes } : shipment?.notes ? { notes: shipment.notes } : {}),
    stamp: inv.voidEntryId ? 'void' : remaining > 0 ? 'credit' : 'paid',
    qrText: [company.name, `${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`, dateText(inv.date), `الإجمالي: ${m(inv.total)}`, party ? party.name : ''].filter(Boolean).join('\n'),
  };
  // نسخة الطابعة الحرارية: أرقام بدون رمز العملة حتى تساع الأعمدة، وتفاصيل الطلب (طاولة، كابتن...) إذا الفاتورة من مطعم
  const plain = (v: number) => plainMoney(state, v, inv.currency);
  const created = new Date(inv.createdAt);
  const receipt: ReceiptData = {
    title: INVOICE_KIND_NAMES[inv.kind],
    number: inv.number,
    date: dateText(inv.date),
    time: Number.isNaN(created.getTime()) ? '' : created.toLocaleString('en-GB'),
    ...(table ? { table: table.name } : {}),
    ...(order && !table ? { orderType: order.type === 'delivery' ? 'توصيل' : 'سفري' } : {}),
    ...(order ? { orderNo: order.number } : {}),
    ...(order?.waiter ? { captain: order.waiter } : {}),
    ...(order?.guests ? { guests: order.guests } : {}),
    ...(state.users[inv.createdBy] ? { cashier: state.users[inv.createdBy]!.displayName } : {}),
    ...(party ? { customer: party.name } : {}),
    lines: inv.lines.map((l, i) => ({ name: l.description, sub: model.lines[i]!.sub!, qty: qtyText(l.qty), price: plain(l.price), total: plain(lineAmount(l)) })),
    totals: model.totals,
    grand: { label: 'الصافي', value: m(inv.total) },
    after: model.after!.filter((a) => a.label !== 'المقبوض' || remaining > 0 || !!account),
    ...(inv.notes && !order ? { note: inv.notes } : {}),
    qrText: model.qrText!,
  };
  return (
    <>
      <CommercialDoc model={model} className="has-thermal" />
      <ThermalReceipt data={receipt} />
    </>
  );
}

/**
 * الحساب السابق للزبون أو المورد على الفاتورة: «حساب سابق» و«الإجمالي مع السابق» قبل المقبوض،
 * و«الباقي بذمته» بعده. بيظهر بس إذا كان عليه أو إله شي قبل الفاتورة (ومنطفّيه من الإعدادات).
 */
export function partyAccountRows(state: CompanyState, inv: Invoice): { before: { label: string; value: string }[]; after: { label: string; value: string }[] } | null {
  if (state.info!.print?.showPreviousBalance === false || inv.voidEntryId) return null;
  const bal = invoicePartyBalance(state, inv);
  if (!bal || bal.previous === 0) return null;
  const m = (v: number) => money(state, v, inv.currency);
  const sale = inv.kind === 'sale' || inv.kind === 'sale_return';
  const s = sale ? 1 : -1; // موجب = بالاتجاه الطبيعي: الزبون مديون إلنا، أو نحنا مديونين للمورد
  const prev = s * bal.previous;
  const after = s * bal.after;
  const adds = inv.kind === 'sale' || inv.kind === 'purchase';
  return {
    before: [
      { label: prev > 0 ? 'حساب سابق' : sale ? 'رصيد سابق إله' : 'رصيد سابق إلنا', value: m(Math.abs(prev)) },
      ...(adds && prev > 0 ? [{ label: 'الإجمالي مع الحساب السابق', value: m(prev + inv.total) }] : []),
    ],
    after: [{ label: after >= 0 ? (sale ? 'الباقي بذمته' : 'الباقي علينا') : sale ? 'رصيد إله عندنا' : 'رصيد إلنا عنده', value: m(Math.abs(after)) }],
  };
}

/** نص مختصر للفاتورة يُرسل للزبون برسالة. */
export function invoiceText(state: CompanyState, inv: Invoice): string {
  const m = (v: number) => money(state, v, inv.currency);
  const party = inv.partyId ? state.parties[inv.partyId] : null;
  const lines = inv.lines.map((l) => `• ${l.description} × ${qtyText(l.qty)} = ${m(lineAmount(l))}`);
  return [
    `*${state.info!.name}*`,
    `${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number} — ${dateText(inv.date)}`,
    party ? `السيد/ة: ${party.name}` : '',
    '',
    ...lines,
    '',
    inv.discount ? `الخصم: ${m(inv.discount)}` : '',
    `*الإجمالي: ${m(inv.total)}*`,
    inv.total - inv.paid > 0 ? `المدفوع: ${m(inv.paid)} — الباقي: ${m(inv.total - inv.paid)}` : 'مدفوعة بالكامل',
    ...((acc) => (acc ? [...acc.before, ...acc.after].map((r) => `${r.label}: ${r.value}`) : []))(partyAccountRows(state, inv)),
    '',
    state.info!.print?.footer || 'شكراً لتعاملكم معنا',
  ]
    .filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0))
    .join('\n');
}
