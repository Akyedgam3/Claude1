import { useMemo, useState } from 'react';
import { SITE_JOB_PRESETS, SITE_JOB_ROOMS, siteJobDeposits, siteJobRooms, siteJobTotals, siteLineMeters, type Invoice, type MeasureKind, type SiteJob, type SiteJobLine, type SiteJobStatus } from '../../../core';
import { dateText, money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, PrintButtons } from '../components/print';
import { CurrencySelect, Empty, Field, matches, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { PartyForm } from './Parties';
import { DeliverDialog, DepositDialog } from './Tailor';

export const SITE_JOB_STATUS: Record<SiteJobStatus, string> = {
  survey: 'كشف',
  quoted: 'عرض سعر',
  working: 'قيد التنفيذ',
  done: 'منجز',
  invoiced: 'مفوتر',
  cancelled: 'ملغى',
};
const STATUS_TONE: Record<SiteJobStatus, string> = { survey: 'open', quoted: 'open', working: 'in_progress', done: 'done', invoiced: 'invoiced', cancelled: 'cancelled' };
const ACTIVE: SiteJobStatus[] = ['survey', 'quoted', 'working', 'done'];
const KIND_NAMES: Record<MeasureKind, string> = { area: 'طول × عرض', length: 'متر جر', count: 'عدد' };

/** رقم من نص: بيقبل الأرقام العربية والفاصلة. */
const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫،,]/g, '.').trim());
/** الأمتار متل ما بتنكتب بالورقة: لحد خانتين. */
export const meters = (m: number) => m.toLocaleString('en', { maximumFractionDigits: 2 });

export function SiteJobs() {
  const { state, navigate, can } = useCompany();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'all' | SiteJobStatus>('active');

  const rows = useMemo(
    () =>
      Object.values(state.siteJobs)
        .filter((j) => {
          if (status === 'active' && !ACTIVE.includes(j.status)) return false;
          if (status !== 'active' && status !== 'all' && j.status !== status) return false;
          const p = state.parties[j.partyId];
          return matches(query, j.number, p?.name, p?.phone, p?.notes, j.title, j.address, ...j.lines.map((l) => l.room));
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number),
    [state, query, status],
  );
  const counts = useMemo(() => {
    const all = Object.values(state.siteJobs);
    const open = all.filter((j) => j.status !== 'cancelled');
    return {
      survey: all.filter((j) => j.status === 'survey' || j.status === 'quoted').length,
      working: all.filter((j) => j.status === 'working').length,
      done: all.filter((j) => j.status === 'done').length,
      meters: open.filter((j) => j.date.slice(0, 7) === today().slice(0, 7)).reduce((s, j) => s + siteJobTotals(j).meters, 0),
    };
  }, [state.siteJobs]);

  return (
    <div className="page">
      <PageHeader title="المشاريع والكشوفات">
        {can('sitejobs.manage') && (
          <button className="primary" onClick={() => navigate('sitejob')}>
            <Icon name="plus" size={16} /> كشف جديد
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat clickable" onClick={() => setStatus('survey')}>
          <span>كشوفات وعروض</span>
          <strong>{counts.survey}</strong>
        </div>
        <div className="stat clickable" onClick={() => setStatus('working')}>
          <span>قيد التنفيذ</span>
          <strong>{counts.working}</strong>
        </div>
        <div className="stat clickable" onClick={() => setStatus('done')}>
          <span>منجزة بانتظار الفاتورة</span>
          <strong className={counts.done ? 'good' : ''}>{counts.done}</strong>
        </div>
        <div className="stat">
          <span>أمتار هالشهر</span>
          <strong>{meters(counts.meters)} م</strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث باسم الزبون، الهاتف، العنوان، أو رقم المشروع..." />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">المشاريع المفتوحة</option>
          <option value="all">الكل (مع القديمة)</option>
          {Object.entries(SITE_JOB_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>{query ? 'ما في مشاريع بهالبحث. جرّب «الكل» لتشوف القديمة.' : 'ما في مشاريع بعد. اكبس «كشف جديد».'}</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الزبون</th>
              <th>المشروع</th>
              <th>التاريخ</th>
              <th className="num">الأمتار</th>
              <th className="num">القيمة</th>
              <th className="num">المقبوض</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              const t = siteJobTotals(j);
              const paid = siteJobDeposits(state, j) + (j.invoiceId ? (state.invoices.find((i) => i.id === j.invoiceId)?.paid ?? 0) : 0);
              return (
                <tr key={j.id} className="clickable" onClick={() => navigate('sitejob', j.id)}>
                  <td className="mono">{j.number}</td>
                  <td>
                    {state.parties[j.partyId]?.name}
                    <div className="muted">{state.parties[j.partyId]?.phone}</div>
                  </td>
                  <td className="ellipsis">
                    {j.title || siteJobRooms(j).map((r) => r.room).join('، ')}
                    {j.address && <div className="muted">{j.address}</div>}
                  </td>
                  <td>{dateText(j.date)}</td>
                  <td className="num">{meters(t.meters)}</td>
                  <td className="num">{money(state, t.total, j.currency)}</td>
                  <td className="num">{money(state, paid, j.currency)}</td>
                  <td>
                    <span className={`status ${STATUS_TONE[j.status]}`}>{SITE_JOB_STATUS[j.status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface LineRow {
  key: string;
  name: string;
  kind: MeasureKind;
  length: string;
  width: string;
  factor: string;
  price: string;
  note: string;
}
interface RoomRow {
  key: string;
  name: string;
  lines: LineRow[];
}
interface MoneyRow {
  key: string;
  description: string;
  amount: string;
}

const newLine = (name = '', kind: MeasureKind = 'area', factor = 1): LineRow => ({ key: uid(), name, kind, length: '', width: '', factor: String(factor), price: '', note: '' });

export function SiteJobEditor({ id }: { id?: string }) {
  const { state, call, notify, navigate, can } = useCompany();
  const base = state.info!.baseCurrency;
  const existing = id ? state.siteJobs[id] : undefined;
  const locked = !!existing?.invoiceId;
  // آخر سعر متر وعملة مستعملة، حتى ما ينكتبوا كل مرة
  const last = useMemo(() => Object.values(state.siteJobs).sort((a, b) => b.number - a.number)[0], [state.siteJobs]);

  const [partyId, setPartyId] = useState<string | null>(existing?.partyId ?? null);
  const [date, setDate] = useState(existing?.date ?? today());
  const [title, setTitle] = useState(existing?.title ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [status, setStatus] = useState<SiteJobStatus>(existing?.status ?? 'survey');
  const [currency, setCurrency] = useState(existing?.currency ?? last?.currency ?? base);
  const [rate, setRate] = useState(existing ? toInput(state, existing.rate, existing.currency) : last ? toInput(state, last.rate, last.currency) : '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [discount, setDiscount] = useState(existing?.discount ? toInput(state, existing.discount, existing.currency) : '');
  const [rooms, setRooms] = useState<RoomRow[]>(() =>
    existing
      ? siteJobRooms(existing).map((r) => ({
          key: uid(),
          name: r.room,
          lines: r.lines.map((l) => ({ key: uid(), name: l.name, kind: l.kind, length: String(l.length), width: l.width ? String(l.width) : '', factor: String(l.factor), price: l.price !== undefined ? toInput(state, l.price, existing.currency) : '', note: l.note ?? '' })),
        }))
      : [{ key: uid(), name: 'صالون', lines: [newLine('سقف')] }],
  );
  const toRows = (xs: { description: string; amount: number }[] | undefined, cur: string): MoneyRow[] => (xs ?? []).map((x) => ({ key: uid(), description: x.description, amount: toInput(state, x.amount, cur) }));
  const [extras, setExtras] = useState<MoneyRow[]>(toRows(existing?.extras, existing?.currency ?? base));
  const [costs, setCosts] = useState<MoneyRow[]>(toRows(existing?.costs, existing?.currency ?? base));
  const [newParty, setNewParty] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [delivering, setDelivering] = useState(false);

  const party = partyId ? state.parties[partyId] : undefined;
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const history = useMemo(() => (partyId ? Object.values(state.siteJobs).filter((j) => j.partyId === partyId && j.id !== existing?.id).sort((a, b) => b.number - a.number) : []), [state.siteJobs, partyId, existing?.id]);

  const amount = (v: string) => (v.trim() ? parseAmount(state, v, currency) : 0);
  const lineOf = (room: string, l: LineRow): SiteJobLine | null => {
    const length = num(l.length);
    const width = num(l.width);
    if (!l.name.trim() && !l.length.trim()) return null;
    return {
      id: l.key,
      room: room.trim(),
      name: l.name.trim(),
      kind: l.kind,
      length,
      ...(l.kind === 'area' ? { width } : {}),
      factor: num(l.factor) || 1,
      ...(l.price.trim() ? { price: amount(l.price) } : {}),
      ...(l.note.trim() ? { note: l.note.trim() } : {}),
    };
  };
  const build = () => {
    if (!party) throw new Error('اختر الزبون');
    const lines = rooms.flatMap((r) => r.lines.map((l) => lineOf(r.name, l)).filter((x): x is SiteJobLine => !!x));
    const money2 = (xs: MoneyRow[]) => xs.filter((x) => x.description.trim() || x.amount.trim()).map((x) => ({ description: x.description.trim(), amount: amount(x.amount) }));
    return {
      id: existing?.id ?? uid(),
      partyId: party.id,
      date,
      status,
      currency,
      rate: amount(rate),
      lines,
      extras: money2(extras),
      costs: money2(costs),
      ...(discount.trim() ? { discount: amount(discount) } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  };
  const preview = (() => {
    try {
      return build();
    } catch {
      return null;
    }
  })();
  const totals = preview ? siteJobTotals(preview) : null;
  const deposits = existing ? siteJobDeposits(state, existing) : 0;

  const save = async (quiet = false): Promise<SiteJob | null> => {
    let data;
    try {
      data = build();
    } catch (e) {
      notify((e as Error).message, 'error');
      return null;
    }
    const res = await call<SiteJob>('saveSiteJob', data);
    if (!res) return null;
    if (!quiet) notify(`تم حفظ المشروع رقم ${res.value.number}`);
    if (!existing) navigate('sitejob', res.value.id);
    return res.value;
  };

  const setRoom = (key: string, patch: Partial<RoomRow>) => setRooms((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setLine = (room: RoomRow, key: string, patch: Partial<LineRow>) => setRoom(room.key, { lines: room.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const usedRooms = new Set(rooms.map((r) => r.name));

  return (
    <div className="page site-job">
      <PageHeader title={existing ? `مشروع رقم ${existing.number}${existing.title ? ` — ${existing.title}` : ''}` : 'كشف جديد'}>
        {existing && <PrintButtons kind="invoice" name={`كشف ${existing.number} ${party?.name ?? ''}`} papers={['a4', 'a5', '80mm']} />}
        {existing && party && totals && (
          <button
            title="نص الكشف جاهز لإرساله للزبون عبر واتساب"
            onClick={() => {
              const lines = siteJobRooms(preview!).map((r) => `${r.room}: ${meters(r.meters)} م`);
              const msg = [`مرحباً ${party.name}، هاد كشف ${title || 'الشغل'} من ${state.info!.name}:`, ...lines, `المجموع: ${meters(totals.meters)} م × ${money(state, amount(rate), currency)} = ${money(state, totals.total, currency)}`, deposits ? `المقبوض: ${money(state, deposits, currency)} · الباقي: ${money(state, Math.max(0, totals.total - deposits), currency)}` : ''].filter(Boolean).join('\n');
              void navigator.clipboard.writeText(msg).then(() => notify('تم نسخ الكشف، الصقه في واتساب'));
            }}
          >
            نسخ الكشف للزبون
          </button>
        )}
        {existing?.invoiceId && (
          <button className="primary" onClick={() => navigate('invoice', existing.invoiceId)}>
            عرض الفاتورة
          </button>
        )}
        {!locked && can('sitejobs.manage') && (
          <>
            <button className="primary" onClick={() => save()}>
              حفظ
            </button>
            {existing && status !== 'cancelled' && can('vouchers.create') && (
              <button onClick={() => setDepositing(true)}>
                <Icon name="wallet" size={16} /> قبض دفعة
              </button>
            )}
            {status !== 'cancelled' && can('sales.create') && (
              <button className="primary accent" onClick={() => setDelivering(true)}>
                <Icon name="check" size={16} /> فوترة
              </button>
            )}
          </>
        )}
      </PageHeader>
      {locked && <div className="banner">هذا المشروع مفوتر. لتعديله ألغِ الفاتورة (بيرجع المشروع «منجز»).</div>}

      <fieldset disabled={locked} className="plain">
        <section className="card form-grid four">
          <Field label="الزبون" wide>
            <div className="with-button">
              <Picker options={customers} value={partyId} onChange={setPartyId} placeholder="ابحث بالاسم أو الهاتف..." />
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
            <select value={status} onChange={(e) => setStatus(e.target.value as SiteJobStatus)}>
              {(['survey', 'quoted', 'working', 'done', 'cancelled'] as const).map((s) => (
                <option key={s} value={s}>
                  {SITE_JOB_STATUS[s]}
                </option>
              ))}
              {status === 'invoiced' && <option value="invoiced">{SITE_JOB_STATUS.invoiced}</option>}
            </select>
          </Field>
          <Field label="اسم المشروع">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="بيت أبو حسن، محل..." />
          </Field>
          <Field label="العنوان" wide>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="الحي، البناية، الطابق" />
          </Field>
          <Field label="تاريخ الكشف">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="سعر المتر">
            <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="0" />
          </Field>
          <Field label="العملة">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
          <Field label="بداية الشغل">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="التسليم">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="ملاحظات" wide>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="لون الدهان، نوع الإنارة، طلبات الزبون..." />
          </Field>
        </section>

        {history.length > 0 && (
          <div className="banner info">
            {party?.name} اشتغلنالو قبل:{' '}
            {history.slice(0, 4).map((j) => (
              <button key={j.id} type="button" className="link" onClick={() => navigate('sitejob', j.id)}>
                {j.title || `مشروع ${j.number}`} ({dateText(j.date)} · {meters(siteJobTotals(j).meters)} م)
              </button>
            ))}
          </div>
        )}

        {rooms.map((room, ri) => {
          const roomLines = room.lines.map((l) => lineOf(room.name, l));
          const roomMeters = roomLines.reduce((s, l) => s + (l ? siteLineMeters(l) : 0), 0);
          return (
            <section key={room.key} className="card room-card">
              <header className="panel-header">
                <h3 className="room-name">
                  <span className="room-no">{ri + 1}</span>
                  <input value={room.name} onChange={(e) => setRoom(room.key, { name: e.target.value })} list="site-rooms" placeholder="اسم الغرفة" />
                </h3>
                <span className="room-total">
                  {meters(roomMeters)} م{amount(rate) > 0 && <small> · {money(state, roomLines.reduce((s, l) => s + (l ? Math.round(siteLineMeters(l) * (l.price ?? amount(rate))) : 0), 0), currency)}</small>}
                </span>
                <button type="button" className="icon" title="حذف الغرفة" onClick={() => setRooms(rooms.filter((r) => r.key !== room.key))}>
                  <Icon name="close" size={16} />
                </button>
              </header>
              <table className="table lines">
                <thead>
                  <tr>
                    <th>البند</th>
                    <th>القياس</th>
                    <th>الطول</th>
                    <th>العرض</th>
                    <th>الحساب</th>
                    <th className="num">= أمتار</th>
                    <th>سعر خاص</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {room.lines.map((l) => {
                    const sl = lineOf(room.name, l);
                    const m = sl ? siteLineMeters(sl) : 0;
                    return (
                      <tr key={l.key}>
                        <td>
                          <input value={l.name} onChange={(e) => setLine(room, l.key, { name: e.target.value })} list="site-items" placeholder="سقف، مرد..." />
                        </td>
                        <td>
                          <select value={l.kind} onChange={(e) => setLine(room, l.key, { kind: e.target.value as MeasureKind })}>
                            {Object.entries(KIND_NAMES).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input className="num-input" value={l.length} onChange={(e) => setLine(room, l.key, { length: e.target.value })} inputMode="decimal" placeholder={l.kind === 'count' ? 'العدد' : 'م'} />
                        </td>
                        <td>{l.kind === 'area' ? <input className="num-input" value={l.width} onChange={(e) => setLine(room, l.key, { width: e.target.value })} inputMode="decimal" placeholder="م" /> : <span className="muted">—</span>}</td>
                        <td>
                          <select value={['1', '0.5'].includes(l.factor) ? l.factor : 'x'} onChange={(e) => setLine(room, l.key, { factor: e.target.value === 'x' ? '0.75' : e.target.value })}>
                            <option value="1">كامل</option>
                            <option value="0.5">÷ 2 (نص)</option>
                            <option value="x">معامل تاني</option>
                          </select>
                          {!['1', '0.5'].includes(l.factor) && <input className="num-input factor" value={l.factor} onChange={(e) => setLine(room, l.key, { factor: e.target.value })} inputMode="decimal" />}
                        </td>
                        <td className="num">
                          <strong>{m ? meters(m) : ''}</strong>
                        </td>
                        <td>
                          <input className="num-input" value={l.price} onChange={(e) => setLine(room, l.key, { price: e.target.value })} inputMode="decimal" placeholder="عام" />
                        </td>
                        <td>
                          <button type="button" className="icon" title="حذف" onClick={() => setRoom(room.key, { lines: room.lines.filter((x) => x.key !== l.key) })}>
                            <Icon name="close" size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="quick-cur">
                <span className="muted">أضف:</span>
                {SITE_JOB_PRESETS.map((p) => (
                  <button key={p.name} type="button" onClick={() => setRoom(room.key, { lines: [...room.lines, newLine(p.name, p.kind, p.factor)] })}>
                    {p.name}
                  </button>
                ))}
                <button type="button" onClick={() => setRoom(room.key, { lines: [...room.lines, newLine('', 'length')] })}>
                  بند تاني
                </button>
              </div>
            </section>
          );
        })}
        <div className="quick-cur add-room">
          <span className="muted">غرفة جديدة:</span>
          {SITE_JOB_ROOMS.filter((r) => !usedRooms.has(r) || r === 'غرفة نوم').map((r) => (
            <button key={r} type="button" onClick={() => setRooms([...rooms, { key: uid(), name: r, lines: [newLine('سقف')] }])}>
              + {r}
            </button>
          ))}
          <button type="button" onClick={() => setRooms([...rooms, { key: uid(), name: '', lines: [newLine('سقف')] }])}>
            + غرفة باسم تاني
          </button>
        </div>
        <datalist id="site-rooms">
          {SITE_JOB_ROOMS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <datalist id="site-items">
          {SITE_JOB_PRESETS.map((p) => (
            <option key={p.name} value={p.name} />
          ))}
        </datalist>

        <div className="two-col">
          <MoneyRows title="إضافات بمبلغ مقطوع" hint="إنارة، فك سقف قديم، نقل..." rows={extras} setRows={setExtras} />
          {can('costs.view') && <MoneyRows title="تكاليف المشروع (للربح بس)" hint="مواد، أجور عمال، نقل — ما بتطلع للزبون" rows={costs} setRows={setCosts} />}
        </div>
      </fieldset>

      {totals && (
        <section className="card totals-bar">
          <span>مجموع الأمتار</span>
          <strong>{meters(totals.meters)} م</strong>
          <span>القيمة</span>
          <strong>{money(state, totals.work + totals.extras, currency)}</strong>
          {!locked && (
            <>
              <span>خصم</span>
              <input className="num-input" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" />
            </>
          )}
          <span>الإجمالي</span>
          <strong>{money(state, totals.total, currency)}</strong>
          {existing && !locked && (
            <>
              <span>المقبوض</span>
              <strong className="good">{money(state, deposits, currency)}</strong>
              <span>الباقي</span>
              <strong>{money(state, Math.max(0, totals.total - deposits), currency)}</strong>
            </>
          )}
          {can('costs.view') && totals.costs > 0 && (
            <>
              <span>الربح</span>
              <strong className={totals.profit >= 0 ? 'good' : 'bad'}>{money(state, totals.profit, currency)}</strong>
            </>
          )}
        </section>
      )}

      {existing && existing.deposits.length > 0 && (
        <section className="card">
          <h3>الدفعات</h3>
          <table className="table compact">
            <tbody>
              {existing.deposits.map((d) => (
                <tr key={d.entryId} className={state.voided[d.entryId] ? 'muted' : ''}>
                  <td>{dateText(d.date)}</td>
                  <td className="num">{money(state, d.amount, existing.currency)}</td>
                  <td>{state.voided[d.entryId] ? 'ملغاة' : 'مقبوضة'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {existing && preview && <SiteJobSheet job={{ ...existing, ...preview }} />}
      {newParty && <PartyForm party={null} onClose={() => setNewParty(false)} onSaved={(p) => setPartyId(p.id)} />}
      {depositing && existing && totals && (
        <DepositDialog
          title="قبض دفعة على المشروع"
          hint="بيتسجّل سند قبض باسم الزبون، وبينخصم من المطلوب عند الفوترة."
          currency={currency}
          suggested={Math.max(0, Math.round(totals.total / 2) - deposits)}
          onClose={() => setDepositing(false)}
          onConfirm={async (amount, cashAccountId) => {
            const saved = await save(true);
            if (!saved) return;
            if (await call('addSiteJobDeposit', saved.id, { date: today(), amount, cashAccountId })) {
              notify('تم قبض الدفعة');
              setDepositing(false);
            }
          }}
        />
      )}
      {delivering && totals && (
        <DeliverDialog
          title="فوترة المشروع"
          totalLabel="قيمة المشروع"
          depositsLabel="الدفعات المقبوضة"
          submitLabel="فوترة المشروع"
          subtotal={totals.total}
          deposits={deposits}
          currency={currency}
          onClose={() => setDelivering(false)}
          onConfirm={async (opts) => {
            const saved = await save(true);
            if (!saved) return;
            const res = await call<Invoice>('deliverSiteJob', saved.id, { date: today(), ...opts });
            if (res) {
              notify(`تمت الفوترة: فاتورة رقم ${res.value.number}`);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </div>
  );
}

function MoneyRows({ title, hint, rows, setRows }: { title: string; hint: string; rows: MoneyRow[]; setRows: (r: MoneyRow[]) => void }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {rows.length > 0 && (
        <table className="table lines">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <input value={r.description} onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, description: e.target.value } : x)))} placeholder={hint} />
                </td>
                <td>
                  <input className="num-input" value={r.amount} onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" placeholder="المبلغ" />
                </td>
                <td>
                  <button type="button" className="icon" title="حذف" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                    <Icon name="close" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => setRows([...rows, { key: uid(), description: '', amount: '' }])}>
        <Icon name="plus" size={16} /> أضف
      </button>
    </section>
  );
}

/** الكشف المطبوع: نفس ترتيب الورقة (كل غرفة وبنودها ومجموعها)، وبالآخر الحساب. */
function SiteJobSheet({ job }: { job: SiteJob }) {
  const { state } = useCompany();
  const party = state.parties[job.partyId];
  const t = siteJobTotals(job);
  // بعد الفوترة: الدفعات + المقبوض مع الفاتورة
  const deposits = siteJobDeposits(state, job) + (job.invoiceId ? (state.invoices.find((i) => i.id === job.invoiceId)?.paid ?? 0) : 0);
  const dims = (l: SiteJobLine) => (l.kind === 'area' ? `${meters(l.length)} × ${meters(l.width ?? 0)}` : meters(l.length)) + (l.factor === 0.5 ? ' ÷ 2' : l.factor !== 1 ? ` × ${l.factor}` : '');
  return (
    <div className="print-area print-only invoice-doc site-sheet">
      <DocHeader title="كشف أعمال">
        <div>رقم: {job.number}</div>
        <div>
          التاريخ: <span className="ltr">{dateText(job.date)}</span>
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
        {job.title && <div>المشروع: {job.title}</div>}
        {job.address && <div>العنوان: {job.address}</div>}
      </div>
      {siteJobRooms(job).map((r) => (
        <table key={r.room} className="doc-lines">
          <thead>
            <tr>
              <th>{r.room}</th>
              <th>القياس</th>
              <th>الأمتار</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>
                  <span dir="ltr">{dims(l)}</span>
                </td>
                <td>{meters(siteLineMeters(l))}</td>
              </tr>
            ))}
            <tr className="room-sum">
              <td colSpan={2}>مجموع {r.room}</td>
              <td>
                <strong>{meters(r.meters)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      ))}
      {job.extras.length > 0 && (
        <table className="doc-lines">
          <tbody>
            {job.extras.map((x, i) => (
              <tr key={i}>
                <td>{x.description}</td>
                <td>{money(state, x.amount, job.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="doc-totals">
        <div>
          <span>مجموع الأمتار</span>
          <strong>{meters(t.meters)} م</strong>
        </div>
        <div>
          <span>سعر المتر</span>
          <strong>{money(state, job.rate, job.currency)}</strong>
        </div>
        {t.discount > 0 && (
          <div>
            <span>خصم</span>
            <strong>{money(state, t.discount, job.currency)}</strong>
          </div>
        )}
        <div className="grand">
          <span>الإجمالي</span>
          <strong>{money(state, t.total, job.currency)}</strong>
        </div>
        {deposits > 0 && (
          <>
            <div>
              <span>المقبوض</span>
              <strong>{money(state, deposits, job.currency)}</strong>
            </div>
            <div>
              <span>الباقي</span>
              <strong>{money(state, Math.max(0, t.total - deposits), job.currency)}</strong>
            </div>
          </>
        )}
      </div>
      {job.notes && <p>ملاحظات: {job.notes}</p>}
    </div>
  );
}
