import { useMemo, useState } from 'react';
import { amountInWords, quoteTotals, type Invoice, type Quote, type QuoteStatus } from '../../../core';
import { addDays, dateText, money, parseAmount, qtyText, toInput, today, uid, useCompany } from '../api';
import { CommercialDoc, type DocModel } from '../components/CommercialDoc';
import { Icon } from '../components/icons';
import { PrintButtons } from '../components/print';
import { CurrencySelect, Empty, Field, itemMatches, itemOptions, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { cashAccounts, itemPrice } from './InvoiceEditor';

export const QUOTE_STATUS: Record<QuoteStatus, string> = { open: 'مفتوح', accepted: 'مقبول', rejected: 'مرفوض', converted: 'تحوّل لفاتورة' };
const TONE: Record<QuoteStatus, string> = { open: 'open', accepted: 'done', rejected: 'cancelled', converted: 'invoiced' };

export function Quotes() {
  const { state, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | QuoteStatus>('all');
  const now = today();
  const rows = useMemo(
    () =>
      Object.values(state.quotes)
        .filter((q) => (status === 'all' || q.status === status) && matches(query, q.number, q.customerName, q.partyId ? state.parties[q.partyId]?.name : ''))
        .sort((a, b) => b.number - a.number),
    [state, query, status],
  );
  return (
    <div className="page">
      <PageHeader title="عروض الأسعار">
        <button className="primary" onClick={() => navigate('quote')}>
          <Icon name="plus" size={16} /> عرض سعر جديد
        </button>
      </PageHeader>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم العرض أو اسم الزبون..." />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">الكل</option>
          {Object.entries(QUOTE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>لا توجد عروض أسعار. اعمل عرضاً واطبعه للزبون، وحوّله لفاتورة بكبسة زر عندما يوافق.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>الزبون</th>
              <th>صالح حتى</th>
              <th>الحالة</th>
              <th className="num">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const expired = q.status === 'open' && !!q.validUntil && q.validUntil < now;
              return (
                <tr key={q.id} className="clickable" onClick={() => navigate('quote', q.id)}>
                  <td className="mono">{q.number}</td>
                  <td>{dateText(q.date)}</td>
                  <td>{q.partyId ? state.parties[q.partyId]?.name : (q.customerName ?? '—')}</td>
                  <td className={expired ? 'bad' : ''}>{dateText(q.validUntil)}</td>
                  <td>
                    <span className={`status ${TONE[q.status]}`}>{expired ? 'منتهي' : QUOTE_STATUS[q.status]}</span>
                  </td>
                  <td className="num">{money(state, quoteTotals(state, q).total, q.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface Row {
  key: string;
  itemId: string | null;
  description: string;
  qty: string;
  price: string;
  discount: string;
}

export function QuoteEditor({ id }: { id?: string }) {
  const { state, call, notify, navigate, can } = useCompany();
  const base = state.info!.baseCurrency;
  const existing = id ? state.quotes[id] : undefined;
  const locked = !!existing?.invoiceId;
  const [partyId, setPartyId] = useState<string | null>(existing?.partyId ?? null);
  const [customerName, setCustomerName] = useState(existing?.customerName ?? '');
  const [date, setDate] = useState(existing?.date ?? today());
  const [validUntil, setValidUntil] = useState(existing?.validUntil ?? addDays(today(), 14));
  const [currency, setCurrency] = useState(existing?.currency ?? base);
  const [status, setStatus] = useState<QuoteStatus>(existing?.status ?? 'open');
  const [discount, setDiscount] = useState(existing?.discount ? toInput(state, existing.discount, existing.currency) : '');
  const [taxIds, setTaxIds] = useState<string[]>(existing?.taxIds ?? Object.values(state.taxes).filter((t) => t.active && t.percent > 0).map((t) => t.id));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [rows, setRows] = useState<Row[]>(
    existing?.lines.map((l) => ({
      key: uid(),
      itemId: l.itemId ?? null,
      description: l.description,
      qty: String(l.qty),
      price: toInput(state, l.price, existing.currency),
      discount: l.discount ? toInput(state, l.discount, existing.currency) : '',
    })) ?? [],
  );
  const [converting, setConverting] = useState(false);
  const items = useMemo(() => itemOptions(state), [state]);
  const party = partyId ? state.parties[partyId] : null;

  const build = (): Omit<Quote, 'number' | 'invoiceId' | 'createdBy'> => ({
    id: existing?.id ?? uid(),
    date,
    partyId,
    currency,
    status: status === 'converted' ? 'accepted' : status,
    lines: rows
      .filter((r) => r.itemId || r.description.trim())
      .map((r) => ({
        ...(r.itemId ? { itemId: r.itemId } : {}),
        description: r.description.trim(),
        qty: Number(r.qty) || 0,
        price: parseAmount(state, r.price, currency),
        ...(r.discount ? { discount: parseAmount(state, r.discount, currency) } : {}),
      })),
    discount: discount ? parseAmount(state, discount, currency) : 0,
    taxIds,
    ...(validUntil ? { validUntil } : {}),
    ...(!partyId && customerName.trim() ? { customerName: customerName.trim() } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  });

  const totals = (() => {
    try {
      return quoteTotals(state, build());
    } catch {
      return null;
    }
  })();

  const save = async (quiet = false): Promise<Quote | null> => {
    let data;
    try {
      data = build();
    } catch (e) {
      notify((e as Error).message, 'error');
      return null;
    }
    const res = await call<Quote>('saveQuote', data);
    if (!res) return null;
    if (!quiet) notify(`تم حفظ عرض السعر رقم ${res.value.number}`);
    if (!existing) navigate('quote', res.value.id);
    return res.value;
  };

  const addItem = (itemId: string | null) => {
    if (!itemId) return;
    const item = state.items[itemId]!;
    setRows((rs) => [...rs, { key: uid(), itemId, description: item.name, qty: '1', price: itemPrice(state, item, { party, currency, date }), discount: '' }]);
  };

  return (
    <div className="page">
      <PageHeader title={existing ? `عرض سعر رقم ${existing.number}` : 'عرض سعر جديد'}>
        {existing && <PrintButtons kind="invoice" name={`عرض سعر ${existing.number}`} papers={['a4', 'a5', '80mm']} />}
        {existing?.invoiceId && (
          <button className="primary" onClick={() => navigate('invoice', existing.invoiceId)}>
            عرض الفاتورة
          </button>
        )}
        {!locked && (
          <>
            <button className="primary" onClick={() => save()}>
              حفظ
            </button>
            {existing && status !== 'rejected' && (
              <button className="primary accent" onClick={() => setConverting(true)}>
                <Icon name="receipt" size={16} /> تحويل إلى فاتورة
              </button>
            )}
          </>
        )}
      </PageHeader>
      {locked && <div className="banner">هذا العرض تحوّل إلى فاتورة. لتعديله ألغِ الفاتورة.</div>}
      <fieldset disabled={locked} className="plain">
        <section className="card form-grid four">
          <Field label="الزبون" wide>
            <Picker options={partyOptions(state, 'customer')} value={partyId} onChange={setPartyId} placeholder="اختر زبوناً مسجّلاً (اختياري)" />
          </Field>
          {!partyId && (
            <Field label="أو اسم الزبون">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="شركة ... / السيد ..." />
            </Field>
          )}
          <Field label="الحالة">
            <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
              {(['open', 'accepted', 'rejected'] as const).map((s) => (
                <option key={s} value={s}>
                  {QUOTE_STATUS[s]}
                </option>
              ))}
              {status === 'converted' && <option value="converted">{QUOTE_STATUS.converted}</option>}
            </select>
          </Field>
          <Field label="التاريخ">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="صالح حتى">
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
          <Field label="العملة">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
        </section>

        <section className="card">
          <table className="table lines">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>المادة / البيان</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الخصم</th>
                <th className="num">المجموع</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const upd = (k: keyof Row) => (e: { target: { value: string } }) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, [k]: e.target.value } : x)));
                let total = '';
                try {
                  total = money(state, Math.round((Number(r.qty) || 0) * parseAmount(state, r.price, currency)) - (r.discount ? parseAmount(state, r.discount, currency) : 0), currency);
                } catch {
                  total = '—';
                }
                return (
                  <tr key={r.key}>
                    <td>{r.itemId ? <strong>{r.description}</strong> : <input value={r.description} onChange={upd('description')} placeholder="بيان (خدمة، تركيب...)" />}</td>
                    <td>
                      <input className="num-input" value={r.qty} onChange={upd('qty')} />
                    </td>
                    <td>
                      <input className="num-input" value={r.price} onChange={upd('price')} />
                    </td>
                    <td>
                      <input className="num-input" value={r.discount} onChange={upd('discount')} disabled={!can('discount.give')} />
                    </td>
                    <td className="num">{total}</td>
                    <td>
                      <button type="button" className="icon" title="حذف" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                        <Icon name="close" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={6}>
                  <div className="with-button">
                    <Picker options={items} value={null} placeholder="+ أضف مادة من المخزون" filter={(o, q) => itemMatches((o as (typeof items)[number]).item, q)} onChange={addItem} />
                    <button type="button" onClick={() => setRows((rs) => [...rs, { key: uid(), itemId: null, description: '', qty: '1', price: '', discount: '' }])}>
                      + بيان حر
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="two-col">
          <section className="card form-grid">
            <Field label="ملاحظات تظهر على العرض" wide>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مدة التسليم، طريقة الدفع..." />
            </Field>
            {Object.values(state.taxes)
              .filter((t) => t.percent > 0)
              .map((t) => (
                <label key={t.id} className="check wide">
                  <input type="checkbox" checked={taxIds.includes(t.id)} onChange={(e) => setTaxIds(e.target.checked ? [...taxIds, t.id] : taxIds.filter((x) => x !== t.id))} />
                  {t.name} ({t.percent}%)
                </label>
              ))}
          </section>
          <section className="card totals">
            <Field label="خصم على العرض">
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={!can('discount.give')} inputMode="decimal" />
            </Field>
            {totals && (
              <div className="kv">
                <span>المجموع</span>
                <strong>{money(state, totals.subtotal, currency)}</strong>
                {totals.taxes.map((t) => (
                  <span key={t.tax.id} style={{ display: 'contents' }}>
                    <span>{t.tax.name}</span>
                    <strong>{money(state, t.amount, currency)}</strong>
                  </span>
                ))}
                <span>الإجمالي</span>
                <strong className="grand">{money(state, totals.total, currency)}</strong>
              </div>
            )}
          </section>
        </div>
      </fieldset>

      {existing && (
        <div className="print-only">
          <QuoteDocument quote={existing} />
        </div>
      )}
      {converting && existing && totals && (
        <ConvertDialog
          total={totals.total}
          currency={currency}
          hasParty={!!partyId}
          onClose={() => setConverting(false)}
          onConfirm={async (opts) => {
            const saved = await save(true);
            if (!saved) return;
            const res = await call<Invoice>('convertQuote', saved.id, { date: today(), ...opts });
            if (res) {
              notify(`تم إنشاء فاتورة رقم ${res.value.number}`);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </div>
  );
}

function ConvertDialog({ total, currency, hasParty, onClose, onConfirm }: { total: number; currency: string; hasParty: boolean; onClose: () => void; onConfirm: (o: { paid: number; cashAccountId: string }) => Promise<void> }) {
  const { state, notify } = useCompany();
  const boxes = cashAccounts(state, currency);
  const [cash, setCash] = useState(boxes[0]?.id ?? '1101');
  const [paid, setPaid] = useState(toInput(state, total, currency));
  return (
    <Modal title="تحويل العرض إلى فاتورة مبيع" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onConfirm({ paid: parseAmount(state, paid, currency), cashAccountId: cash });
          } catch (err) {
            notify((err as Error).message, 'error');
          }
        }}
      >
        <p className="wide">
          الإجمالي: <strong>{money(state, total, currency)}</strong>. البضاعة ستنقص من المخزون وتُسجَّل الفاتورة بالحسابات.
        </p>
        <Field label={hasParty ? 'المقبوض الآن (الباقي دين على الزبون)' : 'المقبوض (زبون نقدي: كامل المبلغ)'}>
          <input value={paid} onChange={(e) => setPaid(e.target.value)} disabled={!hasParty} inputMode="decimal" />
        </Field>
        <Field label="الصندوق">
          <select value={cash} onChange={(e) => setCash(e.target.value)}>
            {boxes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">إصدار الفاتورة</button>
        </div>
      </form>
    </Modal>
  );
}

export function QuoteDocument({ quote: q }: { quote: Quote }) {
  const { state } = useCompany();
  const party = q.partyId ? state.parties[q.partyId] : null;
  const m = (v: number) => money(state, v, q.currency);
  const t = quoteTotals(state, q);
  const decimals = state.currencies[q.currency]?.decimals ?? 2;
  const model: DocModel = {
    title: 'عرض سعر',
    number: q.number,
    meta: [
      { label: 'التاريخ', value: <span className="ltr">{dateText(q.date)}</span> },
      ...(q.validUntil ? [{ label: 'صالح حتى', value: <span className="ltr">{dateText(q.validUntil)}</span> }] : []),
    ],
    party: { label: 'مقدَّم إلى', name: party?.name ?? q.customerName ?? '—', ...(party?.phone ? { phone: party.phone } : {}), ...(party?.address ? { address: party.address } : {}) },
    lines: q.lines.map((l) => {
      const item = l.itemId ? state.items[l.itemId] : null;
      return {
        description: l.description,
        sub: item?.partNumber ? [<span className="mono">{item.partNumber}</span>] : [],
        qty: `${qtyText(l.qty)} ${l.unit ?? item?.unit ?? ''}`,
        price: m(l.price),
        total: m(Math.round(l.qty * l.price) - (l.discount ?? 0)),
        ...(l.discount ? { discount: m(l.discount) } : {}),
      };
    }),
    totals: [{ label: 'المجموع', value: m(t.subtotal) }, ...(t.discount ? [{ label: 'الخصم', value: m(t.discount) }] : []), ...t.taxes.map((x) => ({ label: x.tax.name, value: m(x.amount) }))],
    grand: { label: 'الإجمالي', value: m(t.total) },
    words: amountInWords(t.total, q.currency, decimals),
    ...(q.notes ? { notes: q.notes } : {}),
    stamp: 'quote',
    qrText: [state.info!.name, `عرض سعر رقم ${q.number}`, dateText(q.date), `الإجمالي: ${m(t.total)}`].join('\n'),
  };
  return <CommercialDoc model={model} />;
}
