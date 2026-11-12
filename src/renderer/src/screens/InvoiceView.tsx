import { amountInWords, partyBalance, partyDebts, findRate, INVOICE_KIND_NAMES, invoicePartyBalance, invoiceProfit, lineAmount, weighingText, type CompanyState, type Invoice } from '../../../core';
import { api, dateText, IS_MOBILE, money, plainMoney, qtyText, qtyTotalText, rateLine, today, useCompany } from '../api';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CommercialDoc, type DocModel } from '../components/CommercialDoc';
import { ThermalReceipt, type ReceiptData } from '../components/ThermalReceipt';
import { PAPER_NAMES, PrintButtons, usePrinter } from '../components/print';
import { Icon } from '../components/icons';
import type { Paper } from '../../../core';
import { ConfirmButton, Empty, PageHeader } from '../components/ui';
import { canEditInvoice } from './Invoices';
import { PayForm } from './Debts';

/** عنوان الفاتورة المطبوعة: فاتورة المبيع فيك تغيّر عنوانها أو تشيله من الإعدادات. */
function docTitle(state: CompanyState, inv: Invoice): string {
  if (inv.kind !== 'sale') return INVOICE_KIND_NAMES[inv.kind];
  const p = state.info?.print;
  return p?.hideSaleTitle ? '' : p?.saleTitle?.trim() || INVOICE_KIND_NAMES.sale;
}

export function InvoiceView({ id }: { id: string }) {
  const { state, call, notify, navigate, can } = useCompany();
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return <Empty>الفاتورة غير موجودة</Empty>;
  if (IS_MOBILE) return <MobileInvoiceView inv={inv} />;

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
      <InvoiceInfoBar inv={inv} />
      <div className="paper-preview">
        <InvoiceDocument inv={inv} />
      </div>
    </div>
  );
}

/** الباقي من هالفاتورة هلق (بعد كل الدفعات اللي إجت بعدها، بالأقدم أول) بعملتها. */
export function invoiceRemaining(state: CompanyState, inv: Invoice): number {
  if (inv.voidEntryId) return 0;
  if (!inv.partyId) return Math.max(0, inv.total - inv.paid);
  const d = partyDebts(state, inv.partyId).find((x) => x.currency === inv.currency);
  const m = d?.movements.find((x) => x.entryId === inv.entryId);
  return m ? Math.abs(m.remaining) : 0;
}

/** شريط فوق الفاتورة: حالتها، المقبوض والباقي هلق، رصيد الزبون، قبض دفعة، واتساب، كشف الحساب، والفاتورة السابقة/التالية. */
function InvoiceInfoBar({ inv }: { inv: Invoice }) {
  const { state, navigate, can, notify } = useCompany();
  const [paying, setPaying] = useState(false);
  const party = inv.partyId ? state.parties[inv.partyId] : null;
  const m = (v: number, c = inv.currency) => money(state, v, c);
  const remaining = invoiceRemaining(state, inv);
  const paidNow = inv.total - remaining;
  const status = inv.voidEntryId
    ? { t: inv.deleted ? 'محذوفة' : 'ملغاة', c: 'void' }
    : remaining <= 0
      ? { t: 'مدفوعة بالكامل', c: 'paid' }
      : paidNow > 0
        ? { t: 'مدفوع جزء منها', c: 'partial' }
        : { t: 'آجل (ما انقبض شي)', c: 'credit' };
  const sameKind = state.invoices.filter((x) => x.kind === inv.kind && !x.deleted).sort((a, b) => a.number - b.number);
  const idx = sameKind.findIndex((x) => x.id === inv.id);
  const prev = idx > 0 ? sameKind[idx - 1] : undefined;
  const next = idx >= 0 && idx < sameKind.length - 1 ? sameKind[idx + 1] : undefined;
  const bal = party ? Object.entries(partyBalance(state, party.id).byCurrency).filter(([, v]) => v !== 0) : [];
  const saleSide = inv.kind === 'sale' || inv.kind === 'purchase_return';
  const user = state.users?.[inv.createdBy]?.displayName;
  return (
    <section className="card invoice-info no-print">
      <div className="invoice-info-row">
        <span className={`inv-status ${status.c}`}>{status.t}</span>
        <span>
          <small>الإجمالي</small>
          <b>{m(inv.total)}</b>
        </span>
        <span>
          <small>{saleSide ? 'انقبض' : 'اندفع'}</small>
          <b className="good">{m(paidNow)}</b>
        </span>
        <span>
          <small>الباقي من هالفاتورة</small>
          <b className={remaining > 0 ? 'bad' : ''}>{m(remaining)}</b>
        </span>
        {party && (
          <span>
            <small>حساب {party.name} كله</small>
            <b>{bal.length ? bal.map(([c, v]) => `${v > 0 ? 'عليه' : 'إلو'} ${m(Math.abs(v), c)}`).join(' + ') : 'مصفّى'}</b>
          </span>
        )}
        <span className="muted inv-meta">
          {dateText(inv.date)}
          {user ? ` · سجّلها ${user}` : ''}
        </span>
      </div>
      <div className="button-row">
        {party && remaining > 0 && can('vouchers.create') && (
          <button className="primary small" onClick={() => setPaying(true)}>
            {saleSide ? 'قبض دفعة' : 'دفع دفعة'}
          </button>
        )}
        {party?.phone && (
          <button className="ghost small" onClick={() => void api.whatsapp(party.phone!, invoiceText(state, inv)).catch((e: Error) => notify(e.message, 'error'))}>
            إرسال واتساب
          </button>
        )}
        {party && (can('reports.financial') || can('vouchers.create')) && (
          <button className="ghost small" onClick={() => navigate('statement', `party:${party.id}`)}>
            كشف حسابه
          </button>
        )}
        <span className="inv-nav">
          <button className="ghost small" disabled={!prev} onClick={() => prev && navigate('invoice', prev.id)} title="الفاتورة السابقة">
            ‹ السابقة
          </button>
          <button className="ghost small" disabled={!next} onClick={() => next && navigate('invoice', next.id)} title="الفاتورة التالية">
            التالية ›
          </button>
        </span>
      </div>
      {paying && party && <PayForm party={party} direction={saleSide ? 'in' : 'out'} onClose={() => setPaying(false)} />}
    </section>
  );
}

/**
 * الفاتورة عالجوال: ملخص مرتب (المواد كبطاقات والإجماليات واضحة) مع أزرار «معاينة» و«طباعة».
 * المعاينة بتعرض الورقة نفسها مصغّرة لتساع الشاشة (متل ما رح تنطبع)، والطباعة بتطبع الورقة الأصلية.
 */
function MobileInvoiceView({ inv }: { inv: Invoice }) {
  const { state, call, notify, navigate, can } = useCompany();
  const printer = usePrinter();
  const kind = inv.kind === 'sale' || inv.kind === 'sale_return' ? 'invoice' : 'report';
  const [paper, setPaper] = useState<Paper>(printer.defaultPaper(kind));
  const [preview, setPreview] = useState(false);
  const [more, setMore] = useState(false);
  const party = inv.partyId ? state.parties[inv.partyId] : null;
  const saleSide = inv.kind === 'sale' || inv.kind === 'sale_return';
  const moneyIn = inv.kind === 'sale' || inv.kind === 'purchase_return';
  const m = (v: number) => money(state, v, inv.currency);
  const remaining = inv.total - inv.paid;
  const status = inv.voidEntryId ? { t: inv.deleted ? 'محذوفة' : 'ملغاة', c: 'void' } : invoiceRemaining(state, inv) > 0 ? { t: 'آجل', c: 'credit' } : { t: 'مدفوعة', c: 'paid' };
  const name = `${INVOICE_KIND_NAMES[inv.kind]} ${inv.number}`;
  const doPrint = (pdf: boolean) => {
    setPreview(false);
    // نسكّر المعاينة أول (الورقة بترجع لمكانها) وبعدين منطبع
    setTimeout(() => void (pdf ? printer.pdf(name, paper) : printer.print(kind, paper)), 60);
  };
  const next = inv.voidEntryId ? state.invoices.find((x) => x.replaces === inv.id) : undefined;
  // الفاتورة بتفتح من فوق (مش من مكان ما كنا نازلين بالسجل)
  useLayoutEffect(() => {
    document.querySelector('.content')?.scrollTo({ top: 0 });
  }, [inv.id]);
  const profit = inv.kind === 'sale' && !inv.voidEntryId && can('costs.view') && state.info!.print?.showInvoiceProfit !== false ? invoiceProfit(state, inv) : null;

  return (
    <div className="page m-inv-page">
      <section className={`m-inv-hero s-${status.c}`}>
        <div className="m-inv-top">
          <span className="m-inv-kind">
            {state.info!.print?.logo && <img src={state.info!.print.logo} alt="" className="m-inv-logo" />}
            {INVOICE_KIND_NAMES[inv.kind]}
          </span>
          <span className={`m-inv-chip ${status.c}`}>{status.t}</span>
        </div>
        <div className="m-inv-num">
          رقم <b className="ltr">{inv.number}</b> · <span className="ltr">{dateText(inv.date)}</span>
        </div>
        <div className="m-inv-total ltr">{m(inv.total)}</div>
        <div className="m-inv-party">{party?.name ?? (saleSide ? 'زبون نقدي' : 'مورد نقدي')}</div>
      </section>

      {inv.voidEntryId && next && (
        <div className="banner bad">
          انعدّلت هالفاتورة —{' '}
          <button className="link" onClick={() => navigate('invoice', next.id)}>
            افتح النسخة الجديدة
          </button>
        </div>
      )}

      <div className="m-inv-actions">
        <button className="primary" onClick={() => setPreview(true)}>
          <Icon name="eye" size={18} /> معاينة
        </button>
        <button onClick={() => doPrint(false)}>
          <Icon name="printer" size={18} /> طباعة
        </button>
        <button onClick={() => setMore((v) => !v)}>{more ? 'أقل' : 'المزيد'}</button>
      </div>
      {more && (
        <div className="m-inv-more">
          <select className="paper-select" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
            {(['a4', 'a5', '80mm', '58mm'] as Paper[]).map((p) => (
              <option key={p} value={p}>
                ورق {PAPER_NAMES[p]}
              </option>
            ))}
          </select>
          <button onClick={() => doPrint(true)}>PDF / مشاركة</button>
          <button onClick={() => void navigator.clipboard.writeText(invoiceText(state, inv)).then(() => notify('تم نسخ نص الفاتورة، الصقه في واتساب'))}>نسخ كنص</button>
          {canEditInvoice(inv, can as never) && <button onClick={() => navigate(inv.kind, inv.id)}>تعديل</button>}
          {inv.replaces && <button onClick={() => navigate('invoice', inv.replaces!)}>النسخة القديمة</button>}
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
        </div>
      )}

      <section className="card m-inv-lines">
        <h3>المواد ({inv.lines.length})</h3>
        {inv.lines.map((l, i) => {
          const item = l.itemId ? state.items[l.itemId] : null;
          return (
            <div className="m-inv-line" key={i}>
              <div className="m-inv-line-main">
                <b>{l.description}</b>
                <small>
                  <span className="ltr">{qtyText(l.qty)}</span> {l.unit ?? item?.unit ?? ''} × <span className="ltr">{m(l.price)}</span>
                  {l.discount > 0 && <> · خصم <span className="ltr">{m(l.discount)}</span></>}
                </small>
                {l.costParts && (
                  <small className="cost-line">
                    معمل {plainMoney(state, l.costParts.factory, inv.currency)} + شحن {plainMoney(state, l.costParts.shipping, inv.currency)} + ضريبة {plainMoney(state, l.costParts.tax, inv.currency)} + جمارك{' '}
                    {plainMoney(state, l.costParts.customs, inv.currency)}
                  </small>
                )}
                {l.note && <small>{l.note}</small>}
              </div>
              <strong className="ltr">{m(lineAmount(l))}</strong>
            </div>
          );
        })}
      </section>

      <section className="card m-inv-sums">
        <div>
          <span>المجموع</span>
          <b className="ltr">{m(inv.subtotal)}</b>
        </div>
        {inv.discount > 0 && (
          <div>
            <span>الخصم</span>
            <b className="ltr">{m(inv.discount)}</b>
          </div>
        )}
        {inv.taxLines.map((t) => (
          <div key={t.taxId}>
            <span>{state.taxes[t.taxId]?.name ?? 'ضريبة'}</span>
            <b className="ltr">{m(t.amount)}</b>
          </div>
        ))}
        <div className="grand">
          <span>الإجمالي</span>
          <b className="ltr">{m(inv.total)}</b>
        </div>
        <div>
          <span>{moneyIn ? 'المقبوض' : 'المدفوع'}</span>
          <b className="ltr">{m(inv.paid + (invoicePartyBalance(state, inv)?.extraPaid ?? 0))}</b>
        </div>
        {remaining > 0 && (
          <div className="rest">
            <span>الباقي</span>
            <b className="ltr">{m(remaining)}</b>
          </div>
        )}
        {profit && (
          <div className={profit.profit < 0 ? 'loss' : 'gain'}>
            <span>{profit.profit < 0 ? 'خسارة هالفاتورة' : 'ربح هالفاتورة'}</span>
            <b className="ltr">{money(state, Math.abs(profit.profit))}</b>
          </div>
        )}
        {inv.notes && <p className="muted">{inv.notes}</p>}
      </section>

      {/* الورقة الحقيقية: مخفية عالشاشة (بتطلع بالمعاينة) وبتنطبع متل ما هي */}
      {preview ? (
        <div className="m-preview no-print" role="dialog">
          <div className="m-preview-bar">
            <button className="m-preview-close" onClick={() => setPreview(false)}>
              ✕ إغلاق
            </button>
            <span>{name}</span>
            <button className="primary" onClick={() => doPrint(false)}>
              <Icon name="printer" size={16} /> طباعة
            </button>
          </div>
          <FitPage>
            <div className="paper-preview m-paper">
              <InvoiceDocument inv={inv} />
            </div>
          </FitPage>
        </div>
      ) : (
        <div className="paper-preview m-doc-hidden">
          <InvoiceDocument inv={inv} />
        </div>
      )}
    </div>
  );
}

/** بتصغّر ورقة A4 (794px) لتساع عرض الشاشة، وكبسة عليها بتكبّرها للحجم الحقيقي. */
function FitPage({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [zoom, setZoom] = useState(false);
  const PAGE = 794;
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 24) / PAGE));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  const s = zoom ? 1 : scale;
  return (
    <div className="m-fit" onClick={() => setZoom((z) => !z)}>
      <div style={{ width: PAGE * s, height: height * s, margin: '0 auto', position: 'relative' }}>
        <div ref={inner} style={{ width: PAGE, transform: `scale(${s})`, transformOrigin: 'top right', position: 'absolute', top: 0, right: 0 }}>
          {children}
        </div>
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
    title: docTitle(state, inv),
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
      ...((inv.vatNumber ?? party?.vatNumber) ? { vatNumber: inv.vatNumber ?? party!.vatNumber! } : {}),
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
      if (l.costParts) {
        const cp = l.costParts;
        const pm = (v: number) => plainMoney(state, v, inv.currency);
        sub.push(
          <span className="cost-line">
            {[['معمل', cp.factory], ['شحن', cp.shipping], ['ضريبة', cp.tax], ['جمارك', cp.customs]].map(([k, v], i) => (
              <span key={k as string}>{i > 0 ? '+ ' : ''}{k} {pm(v as number)} </span>
            ))}
          </span>,
        );
      }
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
      { label: 'مجموع الكمية', value: qtyTotalText(inv.lines.map((l) => ({ qty: l.qty, unit: l.unit ?? (l.itemId ? state.items[l.itemId]?.unit : undefined) }))) },
      { label: 'المجموع', value: m(inv.subtotal) },
      ...(inv.discount > 0 ? [{ label: 'الخصم', value: m(inv.discount) }] : []),
      ...inv.taxLines.map((t) => ({ label: state.taxes[t.taxId]?.name ?? 'ضريبة', value: m(t.amount) })),
    ],
    grand: { label: 'الإجمالي', value: m(inv.total) },
    after: [
      ...(account?.before ?? []),
      // المدفوع كله مع الفاتورة: إذا دفع أكتر من قيمتها، الزيادة نزلت من حسابه القديم وبتبيّن هون
      { label: moneyIn ? 'المقبوض' : 'المدفوع', value: m(inv.paid + (invoicePartyBalance(state, inv)?.extraPaid ?? 0)) },
      ...(account ? account.after : remaining > 0 ? [{ label: 'الباقي', value: m(remaining) }] : []),
      ...(inv.currency !== company.baseCurrency ? [{ label: 'سعر الصرف', value: rateLine(state, inv.currency, inv.rate) }] : []),
      ...(showUsd ? [{ label: 'المقابل بالدولار', value: money(state, Math.round(((inv.total * inv.rate) / usdRate) * 10 ** (2 - decimals)), 'USD') }] : []),
    ],
    ...(print.showAmountInWords !== false ? { words: amountInWords(inv.total, inv.currency, decimals) } : {}),
    ...(inv.notes && !shipment ? { notes: inv.notes } : shipment?.notes ? { notes: shipment.notes } : {}),
    // الختم حسب الوضع هلق: إذا انقبض الباقي بعدين بيصير «مدفوعة»
    stamp: inv.voidEntryId ? 'void' : invoiceRemaining(state, inv) > 0 ? 'credit' : 'paid',
    qrText: [company.name, `${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`, dateText(inv.date), `الإجمالي: ${m(inv.total)}`, party ? party.name : ''].filter(Boolean).join('\n'),
  };
  // نسخة الطابعة الحرارية: أرقام بدون رمز العملة حتى تساع الأعمدة، وتفاصيل الطلب (طاولة، كابتن...) إذا الفاتورة من مطعم
  const plain = (v: number) => plainMoney(state, v, inv.currency);
  const created = new Date(inv.createdAt);
  const receipt: ReceiptData = {
    title: docTitle(state, inv),
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
    ...((inv.vatNumber ?? party?.vatNumber) ? { customerVat: inv.vatNumber ?? party!.vatNumber! } : {}),
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
