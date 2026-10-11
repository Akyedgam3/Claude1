import { useMemo, useState } from 'react';
import { TAILOR_GARMENTS, TAILOR_MEASUREMENTS, tailorDeposits, tailorSubtotal, type Invoice, type Party, type TailorOrder, type TailorStatus } from '../../../core';
import { addDays, money, parseAmount, toInput, today, uid, useCompany, dateText } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, PrintButtons } from '../components/print';
import { CurrencySelect, Empty, Field, itemOptions, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';
import { PartyForm } from './Parties';

export const TAILOR_STATUS: Record<TailorStatus, string> = {
  received: 'مستلم',
  cutting: 'قص',
  sewing: 'خياطة',
  fitting: 'بروفة',
  ready: 'جاهز للتسليم',
  delivered: 'مسلّم',
  cancelled: 'ملغى',
};

const STATUS_TONE: Record<TailorStatus, string> = {
  received: 'open',
  cutting: 'in_progress',
  sewing: 'in_progress',
  fitting: 'in_progress',
  ready: 'done',
  delivered: 'invoiced',
  cancelled: 'cancelled',
};

const ACTIVE: TailorStatus[] = ['received', 'cutting', 'sewing', 'fitting', 'ready'];

export function TailorOrders() {
  const { state, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'late' | TailorStatus | 'all'>('active');
  const now = today();

  const rows = useMemo(
    () =>
      Object.values(state.tailorOrders)
        .filter((o) => {
          if (status === 'active' && !ACTIVE.includes(o.status)) return false;
          if (status === 'late' && !(ACTIVE.includes(o.status) && o.dueDate && o.dueDate < now)) return false;
          if (status !== 'active' && status !== 'late' && status !== 'all' && o.status !== status) return false;
          const p = state.parties[o.partyId];
          return matches(query, o.number, p?.name, p?.phone, o.tailor, ...o.garments.map((g) => g.description));
        })
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.number - a.number),
    [state, query, status, now],
  );

  const counts = useMemo(() => {
    const all = Object.values(state.tailorOrders);
    return {
      active: all.filter((o) => ACTIVE.includes(o.status)).length,
      ready: all.filter((o) => o.status === 'ready').length,
      late: all.filter((o) => ACTIVE.includes(o.status) && o.dueDate && o.dueDate < now).length,
      today: all.filter((o) => ACTIVE.includes(o.status) && (o.dueDate === now || o.fittingDate === now)).length,
    };
  }, [state.tailorOrders, now]);

  return (
    <div className="page">
      <PageHeader title="طلبات التفصيل">
        <button className="primary" onClick={() => navigate('tailor-order')}>
          <Icon name="plus" size={16} /> طلب تفصيل جديد
        </button>
      </PageHeader>
      <div className="stats">
        <div className="stat clickable" onClick={() => setStatus('active')}>
          <span>طلبات جارية</span>
          <strong>{counts.active}</strong>
        </div>
        <div className="stat clickable" onClick={() => setStatus('ready')}>
          <span>جاهزة للتسليم</span>
          <strong className="good">{counts.ready}</strong>
        </div>
        <div className="stat">
          <span>تسليم أو بروفة اليوم</span>
          <strong>{counts.today}</strong>
        </div>
        <div className="stat clickable" onClick={() => setStatus('late')}>
          <span>متأخرة عن موعدها</span>
          <strong className={counts.late ? 'bad' : ''}>{counts.late}</strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم الطلب، اسم الزبون، الهاتف، أو نوع القطعة..." />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">الطلبات الجارية</option>
          <option value="late">المتأخرة</option>
          <option value="all">الكل</option>
          {Object.entries(TAILOR_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>لا توجد طلبات</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الزبون</th>
              <th>القطع</th>
              <th>الاستلام</th>
              <th>البروفة</th>
              <th>التسليم</th>
              <th>الحالة</th>
              <th className="num">القيمة</th>
              <th className="num">العربون</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const late = ACTIVE.includes(o.status) && !!o.dueDate && o.dueDate < now;
              return (
                <tr key={o.id} className={`clickable ${late ? 'late' : ''}`} onClick={() => navigate('tailor-order', o.id)}>
                  <td className="mono">{o.number}</td>
                  <td>{state.parties[o.partyId]?.name}</td>
                  <td className="ellipsis">{o.garments.map((g) => `${g.description}${g.qty > 1 ? ` ×${g.qty}` : ''}`).join('، ')}</td>
                  <td>{dateText(o.date)}</td>
                  <td>{dateText(o.fittingDate)}</td>
                  <td className={late ? 'bad' : ''}>{dateText(o.dueDate)}</td>
                  <td>
                    <span className={`status ${STATUS_TONE[o.status]}`}>{TAILOR_STATUS[o.status]}</span>
                  </td>
                  <td className="num">{money(state, tailorSubtotal(o), o.currency)}</td>
                  <td className="num">{money(state, tailorDeposits(state, o), o.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface GarmentRow {
  key: string;
  description: string;
  qty: string;
  price: string;
  notes: string;
}
interface FabricRow {
  key: string;
  itemId: string;
  qty: string;
  price: string;
}

/** محرر القياسات: الحقول المعتادة + أي حقل يضيفه الخياط. */
export function MeasurementsEditor({ value, onChange, disabled }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; disabled?: boolean }) {
  const [extra, setExtra] = useState('');
  const names = [...TAILOR_MEASUREMENTS, ...Object.keys(value).filter((k) => !TAILOR_MEASUREMENTS.includes(k))];
  return (
    <div className="measurements">
      {names.map((n) => (
        <label key={n} className="measure">
          <span>{n}</span>
          <input
            value={value[n] ?? ''}
            disabled={disabled}
            inputMode="decimal"
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value.trim()) next[n] = e.target.value;
              else delete next[n];
              onChange(next);
            }}
          />
        </label>
      ))}
      {!disabled && (
        <label className="measure add">
          <span>قياس آخر</span>
          <span className="with-button">
            <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="اسم القياس" />
            <button
              type="button"
              className="icon"
              title="إضافة"
              disabled={!extra.trim()}
              onClick={() => {
                onChange({ ...value, [extra.trim()]: value[extra.trim()] ?? '-' });
                setExtra('');
              }}
            >
              <Icon name="plus" size={16} />
            </button>
          </span>
        </label>
      )}
    </div>
  );
}

export function TailorEditor({ id }: { id?: string }) {
  const { state, call, notify, navigate, can } = useCompany();
  const base = state.info!.baseCurrency;
  const existing = id ? state.tailorOrders[id] : undefined;
  const locked = !!existing?.invoiceId;

  const [partyId, setPartyId] = useState<string | null>(existing?.partyId ?? null);
  const [date, setDate] = useState(existing?.date ?? today());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today(), 7));
  const [fittingDate, setFittingDate] = useState(existing?.fittingDate ?? '');
  const [status, setStatus] = useState<TailorStatus>(existing?.status ?? 'received');
  const [currency, setCurrency] = useState(existing?.currency ?? base);
  const [tailor, setTailor] = useState(existing?.tailor ?? '');
  const [ownFabric, setOwnFabric] = useState(existing?.ownFabric ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [measurements, setMeasurements] = useState<Record<string, string>>(existing?.measurements ?? {});
  const [garments, setGarments] = useState<GarmentRow[]>(
    existing?.garments.map((g) => ({ key: uid(), description: g.description, qty: String(g.qty), price: toInput(state, g.price, existing.currency), notes: g.notes ?? '' })) ?? [
      { key: uid(), description: '', qty: '1', price: '', notes: '' },
    ],
  );
  const [fabrics, setFabrics] = useState<FabricRow[]>(
    existing?.fabrics.map((f) => ({ key: uid(), itemId: f.itemId, qty: String(f.qty), price: toInput(state, f.price, existing.currency) })) ?? [],
  );
  const [newParty, setNewParty] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [delivering, setDelivering] = useState(false);

  const party = partyId ? state.parties[partyId] : undefined;
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const items = useMemo(() => itemOptions(state, (i) => i.kind !== 'composite'), [state]);
  const tailors = useMemo(() => [...new Set(Object.values(state.tailorOrders).map((o) => o.tailor).filter(Boolean))] as string[], [state.tailorOrders]);

  const pickParty = (pid: string | null, p?: Party) => {
    setPartyId(pid);
    const m = (p ?? (pid ? state.parties[pid] : undefined))?.measurements;
    // عند اختيار زبون نأخذ قياساته المحفوظة إن لم تُكتب قياسات للطلب بعد
    if (m && Object.keys(measurements).length === 0) setMeasurements(m);
  };

  const build = () => {
    if (!party) throw new Error('اختر الزبون');
    return {
      id: existing?.id ?? uid(),
      partyId: party.id,
      date,
      status,
      currency,
      garments: garments
        .filter((g) => g.description.trim())
        .map((g) => ({
          description: g.description.trim(),
          qty: Number(g.qty) || 0,
          price: parseAmount(state, g.price, currency),
          ...(g.notes.trim() ? { notes: g.notes.trim() } : {}),
        })),
      fabrics: fabrics.map((f) => ({ itemId: f.itemId, qty: Number(f.qty) || 0, price: parseAmount(state, f.price, currency) })),
      measurements,
      ...(dueDate ? { dueDate } : {}),
      ...(fittingDate ? { fittingDate } : {}),
      ...(tailor.trim() ? { tailor: tailor.trim() } : {}),
      ...(ownFabric.trim() ? { ownFabric: ownFabric.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  };

  const save = async (quiet = false): Promise<TailorOrder | null> => {
    let data;
    try {
      data = build();
    } catch (e) {
      notify((e as Error).message, 'error');
      return null;
    }
    const res = await call<TailorOrder>('saveTailorOrder', data);
    if (!res) return null;
    if (!quiet) notify(`تم حفظ الطلب رقم ${res.value.number}`);
    if (!existing) navigate('tailor-order', res.value.id);
    return res.value;
  };

  const subtotal = (() => {
    try {
      return tailorSubtotal(build());
    } catch {
      return 0;
    }
  })();
  const deposits = existing ? tailorDeposits(state, existing) : 0;

  return (
    <div className="page">
      <PageHeader title={existing ? `طلب تفصيل رقم ${existing.number}` : 'طلب تفصيل جديد'}>
        {existing && <PrintButtons kind="receipt" name={`طلب تفصيل ${existing.number}`} papers={['80mm', 'a5', 'a4', '58mm']} />}
        {existing && party && (status === 'ready' || status === 'fitting') && (
          <button
            title="نص جاهز لإرساله للزبون عبر واتساب أو رسالة"
            onClick={() => {
              const remaining = Math.max(0, subtotal - deposits);
              const msg =
                status === 'ready'
                  ? `مرحباً ${party.name}، طلبك رقم ${existing.number} جاهز للاستلام لدى ${state.info!.name}.${remaining ? ` المبلغ المتبقي: ${money(state, remaining, currency)}.` : ''}`
                  : `مرحباً ${party.name}، نذكّرك بموعد البروفة لطلبك رقم ${existing.number}${fittingDate ? ` بتاريخ ${dateText(fittingDate)}` : ''} لدى ${state.info!.name}.`;
              void navigator.clipboard.writeText(msg).then(() => notify('تم نسخ الرسالة، الصقها في واتساب'));
            }}
          >
            نسخ رسالة للزبون
          </button>
        )}
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
            {existing && status !== 'cancelled' && can('vouchers.create') && (
              <button onClick={() => setDepositing(true)}>
                <Icon name="wallet" size={16} /> قبض عربون
              </button>
            )}
            {status !== 'cancelled' && can('sales.create') && (
              <button className="primary accent" onClick={() => setDelivering(true)}>
                <Icon name="check" size={16} /> تسليم وفوترة
              </button>
            )}
          </>
        )}
      </PageHeader>
      {locked && <div className="banner">هذا الطلب مسلّم ومفوتر. لتعديله ألغِ الفاتورة (يعود الطلب جاهزاً للتسليم).</div>}

      <fieldset disabled={locked} className="plain">
        <section className="card form-grid four">
          <Field label="الزبون" wide>
            <div className="with-button">
              <Picker options={customers} value={partyId} onChange={(v) => pickParty(v)} placeholder="ابحث بالاسم أو الهاتف..." />
              {can('parties.manage') && (
                <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
                  <Icon name="plus" size={16} />
                </button>
              )}
            </div>
          </Field>
          <Field label="الهاتف">
            <input readOnly value={party?.phone ?? ''} dir="ltr" />
          </Field>
          <Field label="الحالة">
            <select value={status} onChange={(e) => setStatus(e.target.value as TailorStatus)}>
              {(['received', 'cutting', 'sewing', 'fitting', 'ready', 'cancelled'] as const).map((s) => (
                <option key={s} value={s}>
                  {TAILOR_STATUS[s]}
                </option>
              ))}
              {status === 'delivered' && <option value="delivered">{TAILOR_STATUS.delivered}</option>}
            </select>
          </Field>
          <Field label="تاريخ الاستلام">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="موعد البروفة">
            <input type="date" value={fittingDate} onChange={(e) => setFittingDate(e.target.value)} />
          </Field>
          <Field label="موعد التسليم">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="الخياط">
            <input value={tailor} onChange={(e) => setTailor(e.target.value)} list="tailors" />
            <datalist id="tailors">
              {tailors.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="العملة">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
          <Field label="قماش الزبون (إن أحضره)" wide>
            <input value={ownFabric} onChange={(e) => setOwnFabric(e.target.value)} placeholder="مثلاً: 3 متر جوخ كحلي" />
          </Field>
          <Field label="ملاحظات وتفاصيل الموديل" wide>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </section>

        <section className="card">
          <header className="panel-header">
            <h3>
              <Icon name="ruler" size={18} /> القياسات (سم)
            </h3>
            {party && can('parties.manage') && (
              <button
                type="button"
                onClick={async () => {
                  if (await call('saveParty', { ...party, measurements })) notify('تم حفظ القياسات في ملف الزبون');
                }}
              >
                حفظ القياسات في ملف الزبون
              </button>
            )}
          </header>
          <MeasurementsEditor value={measurements} onChange={setMeasurements} disabled={locked} />
        </section>

        <div className="two-col">
          <section className="card">
            <h3>القطع المطلوبة وأجور الخياطة</h3>
            <table className="table lines">
              <thead>
                <tr>
                  <th>القطعة</th>
                  <th>العدد</th>
                  <th>الأجرة للقطعة</th>
                  <th>تفاصيل</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {garments.map((g) => {
                  const upd = (k: keyof GarmentRow) => (e: { target: { value: string } }) => setGarments(garments.map((x) => (x.key === g.key ? { ...x, [k]: e.target.value } : x)));
                  return (
                    <tr key={g.key}>
                      <td>
                        <input value={g.description} onChange={upd('description')} list="garment-types" placeholder="ثوب، بدلة، تقصير..." />
                      </td>
                      <td>
                        <input className="num-input" value={g.qty} onChange={upd('qty')} />
                      </td>
                      <td>
                        <input className="num-input" value={g.price} onChange={upd('price')} />
                      </td>
                      <td>
                        <input value={g.notes} onChange={upd('notes')} />
                      </td>
                      <td>
                        <button type="button" className="icon" title="حذف" onClick={() => setGarments(garments.filter((x) => x.key !== g.key))}>
                          <Icon name="close" size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="garment-types">
              {TAILOR_GARMENTS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button type="button" onClick={() => setGarments([...garments, { key: uid(), description: '', qty: '1', price: '', notes: '' }])}>
              <Icon name="plus" size={16} /> أضف قطعة
            </button>
          </section>

          <section className="card">
            <h3>أقمشة ولوازم من المحل</h3>
            <table className="table lines">
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fabrics.map((f) => {
                  const item = state.items[f.itemId];
                  const upd = (k: keyof FabricRow) => (e: { target: { value: string } }) => setFabrics(fabrics.map((x) => (x.key === f.key ? { ...x, [k]: e.target.value } : x)));
                  return (
                    <tr key={f.key}>
                      <td>
                        <div className="line-item">
                          <strong>{item?.name}</strong>
                          <small>
                            الرصيد: {state.stock[f.itemId]?.totalQty ?? 0} {item?.unit}
                          </small>
                        </div>
                      </td>
                      <td>
                        <input className="num-input" value={f.qty} onChange={upd('qty')} />
                      </td>
                      <td>
                        <input className="num-input" value={f.price} onChange={upd('price')} />
                      </td>
                      <td>
                        <button type="button" className="icon" title="حذف" onClick={() => setFabrics(fabrics.filter((x) => x.key !== f.key))}>
                          <Icon name="close" size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4}>
                    <Picker
                      options={items}
                      value={null}
                      placeholder="+ أضف قماشاً أو لوازم (أزرار، سحاب، بطانة...)"
                      onChange={(itemId) => {
                        if (!itemId) return;
                        const it = state.items[itemId]!;
                        setFabrics([...fabrics, { key: uid(), itemId, qty: '1', price: it.priceCurrency === currency ? toInput(state, it.price, currency) : '' }]);
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </fieldset>

      <section className="card totals-bar">
        <span>قيمة الطلب</span>
        <strong>{money(state, subtotal, currency)}</strong>
        {existing && (
          <>
            <span>العربون المقبوض</span>
            <strong className="good">{money(state, deposits, currency)}</strong>
            <span>المتبقي</span>
            <strong>{money(state, Math.max(0, subtotal - deposits), currency)}</strong>
          </>
        )}
      </section>

      {existing && existing.deposits.length > 0 && (
        <section className="card">
          <h3>العربون</h3>
          <table className="table compact">
            <tbody>
              {existing.deposits.map((d) => (
                <tr key={d.entryId} className={state.voided[d.entryId] ? 'muted' : ''}>
                  <td>{dateText(d.date)}</td>
                  <td className="num">{money(state, d.amount, existing.currency)}</td>
                  <td>{state.voided[d.entryId] ? 'ملغى (مُرجع للزبون)' : 'مقبوض'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {existing && <TailorTicket order={existing} />}
      {newParty && <PartyForm party={null} onClose={() => setNewParty(false)} onSaved={(p) => pickParty(p.id, p)} />}
      {depositing && existing && (
        <DepositDialog
          currency={currency}
          suggested={Math.max(0, Math.round(subtotal / 2) - deposits)}
          onClose={() => setDepositing(false)}
          onConfirm={async (amount, cashAccountId) => {
            const saved = await save(true);
            if (!saved) return;
            if (await call('addTailorDeposit', saved.id, { date: today(), amount, cashAccountId })) {
              notify('تم قبض العربون');
              setDepositing(false);
            }
          }}
        />
      )}
      {delivering && (
        <DeliverDialog
          subtotal={subtotal}
          deposits={deposits}
          currency={currency}
          onClose={() => setDelivering(false)}
          onConfirm={async (opts) => {
            const saved = await save(true);
            if (!saved) return;
            const res = await call<Invoice>('deliverTailorOrder', saved.id, { date: today(), ...opts });
            if (res) {
              notify(`تم التسليم وإصدار فاتورة رقم ${res.value.number}`);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </div>
  );
}

function DepositDialog({ currency, suggested, onClose, onConfirm }: { currency: string; suggested: number; onClose: () => void; onConfirm: (amount: number, cash: string) => Promise<void> }) {
  const { state, notify } = useCompany();
  const [amount, setAmount] = useState(suggested > 0 ? toInput(state, suggested, currency) : '');
  const cashes = cashAccounts(state).filter((a) => !a.currency || a.currency === currency);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  return (
    <Modal title="قبض عربون" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const v = parseAmount(state, amount, currency);
            if (v <= 0) throw new Error('اكتب مبلغ العربون');
            await onConfirm(v, cash);
          } catch (err) {
            notify((err as Error).message, 'error');
          }
        }}
      >
        <Field label={`المبلغ (${state.currencies[currency]?.symbol ?? currency})`}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus inputMode="decimal" />
        </Field>
        <Field label="الصندوق">
          <select value={cash} onChange={(e) => setCash(e.target.value)}>
            {cashes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted wide">يُسجَّل سند قبض باسم الزبون، ويُخصم تلقائياً من المطلوب عند التسليم.</p>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">قبض</button>
        </div>
      </form>
    </Modal>
  );
}

function DeliverDialog({
  subtotal,
  deposits,
  currency,
  onClose,
  onConfirm,
}: {
  subtotal: number;
  deposits: number;
  currency: string;
  onClose: () => void;
  onConfirm: (opts: { paid?: number; cashAccountId: string; taxIds: string[] }) => Promise<void>;
}) {
  const { state, notify } = useCompany();
  const cashes = cashAccounts(state).filter((a) => !a.currency || a.currency === currency);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  const [taxIds, setTaxIds] = useState<string[]>([]);
  // بدون ضرائب نعرف المتبقي مباشرة؛ مع الضرائب يحسبه البرنامج بعد إضافتها
  const [paid, setPaid] = useState(toInput(state, Math.max(0, subtotal - deposits), currency));
  const [auto, setAuto] = useState(true);
  return (
    <Modal title="تسليم الطلب وإصدار الفاتورة" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onConfirm({ ...(auto ? {} : { paid: parseAmount(state, paid, currency) }), cashAccountId: cash, taxIds });
          } catch (err) {
            notify((err as Error).message, 'error');
          }
        }}
      >
        <div className="kv wide">
          <span>قيمة الطلب</span>
          <strong>{money(state, subtotal, currency)}</strong>
          <span>العربون المقبوض</span>
          <strong>{money(state, deposits, currency)}</strong>
        </div>
        <label className="check wide">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          الزبون يدفع كل المتبقي الآن
        </label>
        {!auto && (
          <Field label="المقبوض الآن (الباقي دين على الزبون)">
            <input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" />
          </Field>
        )}
        <Field label="الصندوق">
          <select value={cash} onChange={(e) => setCash(e.target.value)}>
            {cashes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {Object.values(state.taxes)
          .filter((t) => t.percent > 0)
          .map((t) => (
            <label key={t.id} className="check wide">
              <input type="checkbox" checked={taxIds.includes(t.id)} onChange={(e) => setTaxIds(e.target.checked ? [...taxIds, t.id] : taxIds.filter((x) => x !== t.id))} />
              {t.name} ({t.percent}%)
            </label>
          ))}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">تسليم وإصدار الفاتورة</button>
        </div>
      </form>
    </Modal>
  );
}

/** وصل استلام للزبون مع بطاقة الورشة (القياسات) — يظهر عند الطباعة فقط. */
function TailorTicket({ order }: { order: TailorOrder }) {
  const { state } = useCompany();
  const party = state.parties[order.partyId];
  const deposits = tailorDeposits(state, order);
  const total = tailorSubtotal(order);
  const measures = Object.entries(order.measurements);
  return (
    <div className="print-area print-only invoice-doc">
      <DocHeader title="وصل طلب تفصيل">
        <div>رقم: {order.number}</div>
        <div>
          الاستلام: <span className="ltr">{dateText(order.date)}</span>
        </div>
      </DocHeader>
      <div className="doc-party">
        <div>
          الزبون: <strong>{party?.name}</strong>
          {party?.phone && (
            <>
              {' · '}
              <span className="ltr">{party.phone}</span>
            </>
          )}
        </div>
        {order.fittingDate && (
          <div>
            موعد البروفة: <strong className="ltr">{dateText(order.fittingDate)}</strong>
          </div>
        )}
        {order.dueDate && (
          <div>
            موعد التسليم: <strong className="ltr">{dateText(order.dueDate)}</strong>
          </div>
        )}
      </div>
      <table className="doc-lines">
        <thead>
          <tr>
            <th>البيان</th>
            <th>العدد</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {order.garments.map((g, i) => (
            <tr key={i}>
              <td>
                {g.description}
                {g.notes && <div className="muted">{g.notes}</div>}
              </td>
              <td>{g.qty}</td>
              <td>{money(state, Math.round(g.qty * g.price), order.currency)}</td>
            </tr>
          ))}
          {order.fabrics.map((f, i) => (
            <tr key={`f${i}`}>
              <td>{state.items[f.itemId]?.name}</td>
              <td>
                {f.qty} {state.items[f.itemId]?.unit}
              </td>
              <td>{money(state, Math.round(f.qty * f.price), order.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.ownFabric && <p>قماش الزبون: {order.ownFabric}</p>}
      <div className="doc-totals">
        <div>
          <span>الإجمالي</span>
          <strong>{money(state, total, order.currency)}</strong>
        </div>
        <div>
          <span>العربون</span>
          <strong>{money(state, deposits, order.currency)}</strong>
        </div>
        <div className="grand">
          <span>المتبقي</span>
          <strong>{money(state, Math.max(0, total - deposits), order.currency)}</strong>
        </div>
      </div>
      {measures.length > 0 && (
        <>
          <h4>القياسات (سم)</h4>
          <div className="doc-measures">
            {measures.map(([k, v]) => (
              <span key={k}>
                {k}: <strong>{v}</strong>
              </span>
            ))}
          </div>
        </>
      )}
      {order.notes && <p>ملاحظات: {order.notes}</p>}
      <p className="muted">يرجى إحضار هذا الوصل عند الاستلام.</p>
    </div>
  );
}
