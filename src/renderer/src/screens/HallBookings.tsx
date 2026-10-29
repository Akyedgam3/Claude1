import { useEffect, useMemo, useState } from 'react';
import {
  BOOKING_STATUS_NAMES,
  EVENT_TYPES,
  HALL_EXPENSES,
  bookingHours,
  compareBookings,
  monthExpenses,
  HALL_PERIODS,
  HALL_SERVICES,
  bookingConflicts,
  bookingDeposits,
  bookingTotals,
  hallNames,
  type BookingStatus,
  type HallBooking,
  type HallPeriod,
  type Invoice,
} from '../../../core';
import { addDays, api, dateText, IS_MOBILE, major, money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { cashAccounts } from './InvoiceEditor';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { Icon } from '../components/icons';
import { ConfirmButton, CurrencySelect, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox, Tabs } from '../components/ui';
import { PartyForm } from './Parties';
import { DeliverDialog, DepositDialog } from './Tailor';
import { bookingImage, bookingsTableImage, type ShareImage } from './hall-images';

const EDIT_STATUS: BookingStatus[] = ['tentative', 'confirmed', 'done', 'cancelled'];
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫،,]/g, '.').trim() || 0);

type View = 'calendar' | 'list' | 'expenses';

/** صالة الأفراح: تقويم الحجوزات، قائمة المناسبات، والحجز بخدماته وعربونه. */
export function HallBookings() {
  const { state, can } = useCompany();
  const [view, setView] = useState<View>('calendar');
  const [editing, setEditing] = useState<{ booking: HallBooking | null; date?: string } | null>(null);
  const [hallsOpen, setHallsOpen] = useState(false);
  const all = useMemo(() => Object.values(state.bookings ?? {}), [state.bookings]);
  const d = today();
  const upcoming = all.filter((b) => b.status !== 'cancelled' && b.date >= d);
  const month = d.slice(0, 7);
  const monthRows = all.filter((b) => b.status !== 'cancelled' && b.date.startsWith(month));
  const deposits = upcoming.reduce((s, b) => s + bookingDeposits(state, b), 0);
  const manage = can('bookings.manage');

  return (
    <div className="page">
      <PageHeader title="حجوزات الصالة">
        {can('settings.manage') && <button onClick={() => setHallsOpen(true)}>الصالات</button>}
        {manage && (
          <button className="primary" onClick={() => setEditing({ booking: null })}>
            <Icon name="plus" size={16} /> حجز جديد
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat">
          <span>مناسبات جاية</span>
          <strong>{upcoming.length}</strong>
          {upcoming[0] && <small className="muted">أقربها {dateText(upcoming.sort((a, b) => a.date.localeCompare(b.date))[0]!.date)}</small>}
        </div>
        <div className="stat">
          <span>حجوزات هالشهر</span>
          <strong>{monthRows.length}</strong>
        </div>
        <div className="stat">
          <span>قيمة حجوزات الشهر</span>
          <strong>{money(state, monthRows.filter((b) => b.currency === state.info!.baseCurrency).reduce((s, b) => s + bookingTotals(b).total, 0))}</strong>
        </div>
        <div className="stat">
          <span>عربون مقبوض (الجاية)</span>
          <strong className="good">{money(state, deposits)}</strong>
        </div>
      </div>
      <div className="toolbar">
        <Tabs<View>
          tabs={[
            { key: 'calendar', label: 'التقويم' },
            { key: 'list', label: 'جدول الحجوزات' },
            { key: 'expenses', label: 'المصاريف وربح الشهر', hidden: !can('vouchers.create') },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'calendar' && <Calendar onOpen={(b, date) => setEditing({ booking: b, ...(date ? { date } : {}) })} />}
      {view === 'list' && <BookingList onOpen={(b) => setEditing({ booking: b })} />}
      {view === 'expenses' && <HallExpenses />}
      {editing && <BookingForm booking={editing.booking} date={editing.date} onClose={() => setEditing(null)} />}
      {hallsOpen && <HallsForm onClose={() => setHallsOpen(false)} />}
    </div>
  );
}

function Calendar({ onOpen }: { onOpen: (b: HallBooking | null, date?: string) => void }) {
  const { state, can } = useCompany();
  const [ym, setYm] = useState(() => today().slice(0, 7));
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 1) % 7; // السبت أول الأسبوع
  const byDate = useMemo(() => {
    const map: Record<string, HallBooking[]> = {};
    for (const b of Object.values(state.bookings ?? {})) if (b.status !== 'cancelled' && b.date.startsWith(ym)) (map[b.date] ??= []).push(b);
    return map;
  }, [state.bookings, ym]);
  const shift = (k: number) => {
    const dt = new Date(Date.UTC(y, m - 1 + k, 1));
    setYm(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const halls = hallNames(state);
  const t = today();
  return (
    <section className="card hall-cal">
      <div className="cal-head">
        <button className="icon" onClick={() => shift(-1)} title="الشهر اللي قبل">
          <Icon name="prev" size={18} />
        </button>
        <strong>
          {MONTHS[m - 1]} <span className="ltr">{y}</span>
        </strong>
        <button className="icon" onClick={() => shift(1)} title="الشهر اللي بعد">
          <Icon name="next" size={18} />
        </button>
      </div>
      <div className="cal-grid">
        {DAYS.map((x) => (
          <div key={x} className="cal-dow">
            {x}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={'e' + i} className="cal-day empty" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${ym}-${String(i + 1).padStart(2, '0')}`;
          const list = (byDate[date] ?? []).sort(compareBookings);
          const full = halls.every((h) => list.some((b) => b.hall === h && (b.period === 'full' || (list.some((x) => x.hall === h && x.period === 'morning') && list.some((x) => x.hall === h && x.period === 'evening')))));
          return (
            <div key={date} className={`cal-day${date === t ? ' today' : ''}${date < t ? ' past' : ''}${full ? ' full' : ''}`} onClick={() => can('bookings.manage') && date >= t && onOpen(null, date)}>
              <span className="cal-n">{i + 1}</span>
              {list.map((b) => (
                <button
                  key={b.id}
                  className={`cal-ev ${b.status}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(b);
                  }}
                  title={`${b.hall} · ${HALL_PERIODS[b.period]}`}
                >
                  {b.eventType} {b.title ? `· ${b.title}` : ''}
                  <small>
                    {halls.length > 1 ? `${b.hall} · ` : ''}
                    {HALL_PERIODS[b.period]}
                    {b.startTime ? ` · ${bookingHours(b)}` : ''}
                  </small>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted">اكبس على يوم فاضي لتعمل حجز جديد فيه. الأحمر يعني كل الصالات محجوزة بهاليوم.</p>
    </section>
  );
}

function BookingList({ onOpen }: { onOpen: (b: HallBooking) => void }) {
  const { state, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(addDays(today(), 60));
  const [hall, setHall] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [prices, setPrices] = useState(false);
  const halls = hallNames(state);
  const rows = useMemo(
    () =>
      Object.values(state.bookings ?? {})
        .filter((b) => (!from || b.date >= from) && (!to || b.date <= to) && (!hall || b.hall === hall) && (cancelled || b.status !== 'cancelled'))
        .filter((b) => matches(query, b.number, b.title, b.eventType, b.hall, state.parties[b.partyId]?.name, state.parties[b.partyId]?.phone, b.groomPhone))
        .sort(compareBookings),
    [state, from, to, hall, cancelled, query],
  );
  const sum = rows.filter((b) => b.status !== 'cancelled' && b.currency === state.info!.baseCurrency);
  const range = `${from ? dateText(from) : 'البداية'} — ${to ? dateText(to) : 'النهاية'}`;
  return (
    <>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم، الهاتف، نوع المناسبة..." />
        <label className="inline-field">
          من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inline-field">
          لـ <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {halls.length > 1 && (
          <select value={hall} onChange={(e) => setHall(e.target.value)}>
            <option value="">كل الصالات</option>
            {halls.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        )}
        <label className="check">
          <input type="checkbox" checked={cancelled} onChange={(e) => setCancelled(e.target.checked)} /> مع الملغاة
        </label>
        <label className="check">
          <input type="checkbox" checked={prices} onChange={(e) => setPrices(e.target.checked)} /> إظهار الأسعار
        </label>
        <div className="spacer" />
        {rows.length > 0 && <ShareTableButton rows={rows} title={`جدول الحجوزات ${range}${hall ? ` · ${hall}` : ''}`} />}
        <PrintButtons kind="report" name={`جدول الحجوزات ${range}`} papers={['a4']} />
        <ExportButtons
          name="جدول الحجوزات"
          sheets={() => [
            {
              name: 'الحجوزات',
              title: `جدول الحجوزات ${range}`,
              columns: [
                { header: 'الرقم', key: 'n', type: 'number' },
                { header: 'التاريخ', key: 'date', type: 'date' },
                { header: 'الفترة', key: 'period' },
                { header: 'الساعة', key: 'hours' },
                { header: 'الصالة', key: 'hall' },
                { header: 'المناسبة', key: 'event' },
                { header: 'الزبون', key: 'party' },
                { header: 'الهاتف', key: 'phone' },
                { header: 'رقم العريس', key: 'groom' },
                { header: 'الضيوف', key: 'guests', type: 'number' },
                { header: 'الحالة', key: 'status' },
                ...(prices
                  ? [
                      { header: 'القيمة', key: 'total', type: 'money' as const },
                      { header: 'العربون', key: 'dep', type: 'money' as const },
                      { header: 'الباقي', key: 'left', type: 'money' as const },
                    ]
                  : []),
              ],
              rows: rows.map((b) => {
                const t = bookingTotals(b).total, dep = bookingDeposits(state, b);
                return { n: b.number, date: b.date, period: HALL_PERIODS[b.period], hours: bookingHours(b), hall: b.hall, event: `${b.eventType}${b.title ? ` — ${b.title}` : ''}`, party: state.parties[b.partyId]?.name, phone: state.parties[b.partyId]?.phone, groom: b.groomPhone ?? '', guests: b.guests ?? null, status: BOOKING_STATUS_NAMES[b.status], total: major(state, t, b.currency), dep: major(state, dep, b.currency), left: major(state, Math.max(0, t - dep), b.currency) };
              }),
            },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <Empty>ما في حجوزات بهالفترة.</Empty>
      ) : (
        <div className="print-area">
        <div className="print-only">
          <DocHeader title="جدول الحجوزات">
            <div>{range}{hall ? ` · ${hall}` : ''}</div>
          </DocHeader>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>المناسبة</th>
              <th>الصالة</th>
              <th className="num">الضيوف</th>
              <th>الحالة</th>
              {prices && <th className="num">القيمة</th>}
              {prices && <th className="num">العربون</th>}
              <th className="no-print" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id} className="clickable" onClick={() => onOpen(b)}>
                <td className="mono" title={`حجز رقم ${b.number}`}>{i + 1}</td>
                <td>
                  {dateText(b.date)}
                  <div className="muted">
                    {HALL_PERIODS[b.period]}
                    {b.startTime || b.endTime ? ` · ${bookingHours(b)}` : ''}
                  </div>
                </td>
                <td>
                  <strong>
                    {b.eventType}
                    {b.title ? ` — ${b.title}` : ''}
                  </strong>
                  <div className="muted">{state.parties[b.partyId]?.name}</div>
                </td>
                <td>{b.hall}</td>
                <td className="num">{b.guests ?? '—'}</td>
                <td>
                  <span className={`tag bk-${b.status}`}>{BOOKING_STATUS_NAMES[b.status]}</span>
                </td>
                {prices && <td className="num">{money(state, bookingTotals(b).total, b.currency)}</td>}
                {prices && <td className="num">{money(state, bookingDeposits(state, b), b.currency)}</td>}
                <td onClick={(e) => e.stopPropagation()} className="no-print">
                  <WhatsAppButton booking={b} small />
                  {b.invoiceId && (
                    <button className="small" onClick={() => navigate('invoice', b.invoiceId)}>
                      الفاتورة
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>{sum.length} حجز</th>
              <th className="num">{sum.reduce((a, b) => a + (b.guests ?? 0), 0)}</th>
              <th />
              {prices && <th className="num">{money(state, sum.reduce((a, b) => a + bookingTotals(b).total, 0))}</th>}
              {prices && <th className="num">{money(state, sum.reduce((a, b) => a + bookingDeposits(state, b), 0))}</th>}
              <th className="num">{prices ? `الباقي ${money(state, sum.reduce((a, b) => a + Math.max(0, bookingTotals(b).total - bookingDeposits(state, b)), 0))}` : ''}</th>
            </tr>
          </tfoot>
        </table>
        </div>
      )}
    </>
  );
}

type LineForm = { id: string; name: string; perGuest: boolean; qty: string; price: string };

function BookingForm({ booking: initial, date: initDate, onClose }: { booking: HallBooking | null; date?: string | undefined; onClose: () => void }) {
  const { state, call, notify, navigate, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [id] = useState(() => initial?.id ?? uid());
  const booking = state.bookings?.[id] ?? initial;
  const halls = hallNames(state);
  const [f, setF] = useState({
    partyId: booking?.partyId ?? '',
    hall: booking?.hall ?? halls[0]!,
    date: booking?.date ?? initDate ?? addDays(today(), 7),
    period: booking?.period ?? ('evening' as HallPeriod),
    eventType: booking?.eventType ?? 'عرس',
    title: booking?.title ?? '',
    guests: booking?.guests ? String(booking.guests) : '',
    groomPhone: booking?.groomPhone ?? '',
    startTime: booking?.startTime ?? '',
    endTime: booking?.endTime ?? '',
    status: booking?.status ?? ('tentative' as BookingStatus),
    currency: booking?.currency ?? base,
    discount: booking?.discount ? toInput(state, booking.discount, booking.currency) : '',
    notes: booking?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [lines, setLines] = useState<LineForm[]>(() => booking?.lines.map((l) => ({ id: l.id, name: l.name, perGuest: !!l.perGuest, qty: String(l.qty), price: toInput(state, l.price, booking.currency) })) ?? [{ id: uid(), name: 'أجار الصالة', perGuest: false, qty: '1', price: '' }]);
  const [newParty, setNewParty] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const locked = !!booking?.invoiceId;
  const guests = Math.round(num(f.guests));
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  // عدد الضيوف بيتعبّى لحالو ببنود «بالراس»
  const setGuests = (v: string) => {
    set('guests', v);
    setLines((ls) => ls.map((l) => (l.perGuest ? { ...l, qty: String(Math.round(num(v))) } : l)));
  };

  const build = (): Omit<HallBooking, 'number' | 'deposits' | 'invoiceId' | 'createdAt'> | string => {
    if (!f.partyId) return 'اختار الزبون (أو ضيف زبون جديد)';
    try {
      const discount = parseAmount(state, f.discount, f.currency);
      return {
        id,
        partyId: f.partyId,
        hall: f.hall.trim() || halls[0]!,
        date: f.date,
        period: f.period,
        eventType: f.eventType.trim() || 'مناسبة',
        ...(f.title.trim() ? { title: f.title.trim() } : {}),
        ...(guests > 0 ? { guests } : {}),
        ...(f.groomPhone.trim() ? { groomPhone: f.groomPhone.trim() } : {}),
        ...(f.startTime ? { startTime: f.startTime } : {}),
        ...(f.endTime ? { endTime: f.endTime } : {}),
        status: booking?.invoiceId ? booking.status : f.status,
        currency: f.currency,
        lines: lines.filter((l) => l.name.trim()).map((l) => ({ id: l.id, name: l.name.trim(), ...(l.perGuest ? { perGuest: true } : {}), qty: num(l.qty), price: parseAmount(state, l.price, f.currency) })),
        ...(discount ? { discount } : {}),
        ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
      };
    } catch (e) {
      return (e as Error).message;
    }
  };
  const preview = build();
  const totals = typeof preview === 'string' ? null : bookingTotals(preview);
  const deposits = booking ? bookingDeposits(state, booking) : 0;
  const clash = typeof preview === 'string' ? undefined : bookingConflicts(state, preview)[0];

  const save = async (quiet = false): Promise<HallBooking | null> => {
    const d = build();
    if (typeof d === 'string') {
      notify(d, 'error');
      return null;
    }
    const res = await call<HallBooking>('saveBooking', d);
    if (!res) return null;
    if (!quiet) {
      notify(`انحفظ الحجز رقم ${res.value.number}`);
      onClose();
    }
    return res.value;
  };

  return (
    <Modal title={booking ? `حجز رقم ${booking.number}` : 'حجز جديد'} onClose={onClose} width={980}>
      <div className="form-grid">
        <Field label="الزبون">
          <div className="with-button">
            <Picker options={partyOptions(state, 'customer')} value={f.partyId || null} onChange={(v) => set('partyId', v ?? '')} placeholder="اختار الزبون..." />
            {can('parties.manage') && !locked && (
              <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
        </Field>
        <Field label="المناسبة">
          <input list="event-types" value={f.eventType} onChange={(e) => set('eventType', e.target.value)} disabled={locked} />
          <datalist id="event-types">
            {EVENT_TYPES.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field label="أسماء العرسان / اسم المناسبة">
          <input placeholder="أحمد ♥ سلمى" value={f.title} onChange={(e) => set('title', e.target.value)} disabled={locked} />
        </Field>
        <Field label="الصالة">
          <select value={f.hall} onChange={(e) => set('hall', e.target.value)} disabled={locked}>
            {halls.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} disabled={locked} />
        </Field>
        <Field label="الفترة">
          <select value={f.period} onChange={(e) => set('period', e.target.value as HallPeriod)} disabled={locked}>
            {(Object.keys(HALL_PERIODS) as HallPeriod[]).map((p) => (
              <option key={p} value={p}>
                {HALL_PERIODS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ساعة بداية الحفل">
          <input type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} disabled={locked} />
        </Field>
        <Field label="ساعة انتهاء الحفل">
          <input type="time" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} disabled={locked} />
        </Field>
        <Field label="رقم العريس">
          <input type="tel" dir="ltr" placeholder="09xx xxx xxx" value={f.groomPhone} onChange={(e) => set('groomPhone', e.target.value)} disabled={locked} />
        </Field>
        <Field label="عدد الضيوف">
          <input inputMode="numeric" value={f.guests} onChange={(e) => setGuests(e.target.value)} disabled={locked} />
        </Field>
        <Field label="الحالة">
          <select value={f.status} onChange={(e) => set('status', e.target.value as BookingStatus)} disabled={locked}>
            {(locked ? [f.status] : EDIT_STATUS).map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_NAMES[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => set('currency', c)} />
        </Field>
        {clash && f.status !== 'cancelled' && (
          <div className="banner wide bad">
            {f.hall} محجوزة بهاليوم ({HALL_PERIODS[clash.period]}): {clash.eventType}
            {clash.title ? ` — ${clash.title}` : ''}، حجز رقم {clash.number}. اختار يوم أو فترة أو صالة تانية.
          </div>
        )}

        <h3 className="wide form-section">الخدمات</h3>
        {!locked && (
          <div className="wide preset-row">
            {HALL_SERVICES.map((p) => (
              <button key={p.name} type="button" className="small" onClick={() => setLines((ls) => [...ls, { id: uid(), name: p.name, perGuest: !!p.perGuest, qty: p.perGuest ? String(guests || '') : '1', price: '' }])}>
                + {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="wide">
          <table className="table compact">
            <thead>
              <tr>
                <th>الخدمة</th>
                <th>بالراس؟</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th className="num">المجموع</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                let amount = 0;
                try {
                  amount = Math.round(num(l.qty) * parseAmount(state, l.price, f.currency));
                } catch {
                  amount = 0;
                }
                return (
                  <tr key={l.id}>
                    <td>
                      <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} disabled={locked} />
                    </td>
                    <td>
                      <input type="checkbox" checked={l.perGuest} onChange={(e) => setLine(i, { perGuest: e.target.checked, ...(e.target.checked && guests ? { qty: String(guests) } : {}) })} disabled={locked} />
                    </td>
                    <td>
                      <input className="num-input" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} disabled={locked} />
                    </td>
                    <td>
                      <input className="num-input" inputMode="decimal" placeholder={l.perGuest ? 'سعر الشخص' : 'السعر'} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} disabled={locked} />
                    </td>
                    <td className="num">{money(state, amount, f.currency)}</td>
                    <td>
                      {!locked && (
                        <button type="button" className="icon" title="حذف" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                          <Icon name="close" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Field label="خصم">
          <input inputMode="decimal" value={f.discount} onChange={(e) => set('discount', e.target.value)} disabled={locked} />
        </Field>
        <Field label="ملاحظات">
          <input placeholder="طلبات خاصة، توقيت الزفة..." value={f.notes} onChange={(e) => set('notes', e.target.value)} disabled={locked} />
        </Field>
        {totals && (
          <div className="kv wide">
            <span>قيمة الحجز</span>
            <strong>{money(state, totals.total, f.currency)}</strong>
            {deposits > 0 && (
              <>
                <span>العربون المقبوض</span>
                <strong className="good">{money(state, deposits, f.currency)}</strong>
                <span>الباقي</span>
                <strong className="bad">{money(state, Math.max(0, totals.total - deposits), f.currency)}</strong>
              </>
            )}
          </div>
        )}
        <div className="form-actions wide">
          {booking && <WhatsAppButton booking={booking} />}
          {booking?.invoiceId ? (
            <button type="button" className="primary" onClick={() => navigate('invoice', booking.invoiceId)}>
              عرض الفاتورة
            </button>
          ) : (
            <>
              {can('vouchers.create') && f.status !== 'cancelled' && (
                <button type="button" className="push-start" onClick={() => setDepositing(true)}>
                  <Icon name="wallet" size={16} /> قبض عربون
                </button>
              )}
              {can('sales.create') && f.status !== 'cancelled' && (
                <button type="button" onClick={() => setInvoicing(true)}>
                  <Icon name="receipt" size={16} /> فاتورة الحجز
                </button>
              )}
              <button type="button" onClick={onClose}>
                إلغاء
              </button>
              {can('bookings.manage') && (
                <button type="button" className="primary" onClick={() => void save()}>
                  حفظ الحجز
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {newParty && <PartyForm party={null} defaultKind="customer" onClose={() => setNewParty(false)} onSaved={(p) => set('partyId', p.id)} />}
      {depositing && totals && (
        <DepositDialog
          title="قبض عربون الحجز"
          hint="بيتسجّل سند قبض باسم الزبون، وبينخصم من الفاتورة. والحجز المبدئي بيصير مؤكد."
          currency={f.currency}
          suggested={Math.max(0, Math.round(totals.total / 3) - deposits)}
          onClose={() => setDepositing(false)}
          onConfirm={async (amount, cashAccountId) => {
            const saved = await save(true);
            if (!saved) return;
            if (await call('addBookingDeposit', saved.id, { date: today(), amount, cashAccountId })) {
              notify('تم قبض العربون');
              set('status', saved.status === 'tentative' ? 'confirmed' : saved.status);
              setDepositing(false);
            }
          }}
        />
      )}
      {invoicing && totals && (
        <DeliverDialog
          title="فاتورة الحجز"
          totalLabel="قيمة الحجز"
          depositsLabel="العربون المقبوض"
          submitLabel="إصدار الفاتورة"
          subtotal={totals.total}
          deposits={deposits}
          currency={f.currency}
          onClose={() => setInvoicing(false)}
          onConfirm={async (opts) => {
            const saved = await save(true);
            if (!saved) return;
            const res = await call<Invoice>('invoiceBooking', saved.id, { date: today(), ...opts });
            if (res) {
              notify(`انعملت الفاتورة رقم ${res.value.number}`);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </Modal>
  );
}

/** زر واتساب للحجز: صورة الحجز (تأكيد أو تذكير، مع القيمة والعربون والباقي) لرقم العريس. */
function WhatsAppButton({ booking, small }: { booking: HallBooking; small?: boolean }) {
  const { state } = useCompany();
  const [open, setOpen] = useState(false);
  const phone = booking.groomPhone;
  if (!phone) return small ? null : <span className="muted">حط رقم العريس واحفظ لتبعتلو واتساب</span>;
  return (
    <>
      <button type="button" className={`whatsapp${small ? ' small' : ''}`} title={`صورة الحجز بالواتساب للعريس ${phone}`} onClick={() => setOpen(true)}>
        <Icon name="message" size={small ? 14 : 16} /> واتساب{small ? '' : ' العريس'}
      </button>
      {open && (
        <ImageShareDialog
          title={`صورة الحجز رقم ${booking.number}`}
          phone={phone}
          fileName={`حجز ${booking.number}`}
          caption={`${booking.eventType}${booking.title ? ` — ${booking.title}` : ''}`}
          make={(amounts) => bookingImage(state, booking, { today: today(), amounts, fmt: (m) => money(state, m, booking.currency) })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** إرسال جدول الحجوزات (المعروض، مرتّب بالتاريخ) كصورة بالواتساب. */
function ShareTableButton({ rows, title }: { rows: HallBooking[]; title: string }) {
  const { state } = useCompany();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="whatsapp" title="صورة الجدول للواتساب" onClick={() => setOpen(true)}>
        <Icon name="message" size={16} /> إرسال الجدول بالواتس
      </button>
      {open && (
        <ImageShareDialog
          title="صورة جدول الحجوزات"
          phone=""
          fileName="جدول الحجوزات"
          caption={title}
          make={(amounts) => bookingsTableImage(state, rows, { title, amounts, fmt: (b, m) => money(state, m, b.currency) })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** معاينة الصورة قبل الإرسال، مع خيار المبالغ. بالكمبيوتر بتنتسخ وبينفتح الواتساب، وبالجوال قائمة المشاركة. */
function ImageShareDialog(p: { title: string; phone: string; fileName: string; caption: string; amountsDefault?: boolean; make: (amounts: boolean) => Promise<ShareImage>; onClose: () => void }) {
  const { notify } = useCompany();
  const [amounts, setAmounts] = useState(p.amountsDefault ?? true);
  const [img, setImg] = useState<ShareImage | null>(null);
  useEffect(() => {
    let live = true;
    setImg(null);
    p.make(amounts).then((x) => live && setImg(x), (e: Error) => notify(e.message, 'error'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amounts]);
  const send = async () => {
    if (!img) return;
    try {
      const r = await api.whatsappImage(p.phone, img.png, p.fileName, p.caption);
      if (r === 'clipboard') notify('نسخت الصورة وفتحت الواتساب: الصقها بالمحادثة (Ctrl+V) وابعت');
      if (r) p.onClose();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <Modal title={p.title} onClose={p.onClose} width={720}>
      <label className="check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={amounts} onChange={(e) => setAmounts(e.target.checked)} /> مع المبالغ (القيمة والعربون المدفوع والباقي)
      </label>
      <div className="share-preview">{img ? <img src={img.dataUrl} alt="" /> : <p className="muted">عم جهّز الصورة...</p>}</div>
      <div className="form-actions">
        <button type="button" onClick={p.onClose}>
          إلغاء
        </button>
        <button type="button" className="whatsapp" disabled={!img} onClick={() => void send()}>
          <Icon name="message" size={16} /> {IS_MOBILE ? 'مشاركة بالواتساب' : 'إرسال بالواتساب'}
        </button>
      </div>
    </Modal>
  );
}

/** مصاريف الصالة بالشهر (مازوت، قهوة، سكر...) وربح الشهر: الحجوزات ناقص المصاريف. */
function HallExpenses() {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [ym, setYm] = useState(today().slice(0, 7));
  const [name, setName] = useState(HALL_EXPENSES[0]!.name);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const boxes = cashAccounts(state, base);
  const [cash, setCash] = useState(boxes[0]?.id ?? '');
  const rows = monthExpenses(state, ym);
  const groups = new Map<string, number>();
  for (const r of rows) groups.set(r.name, (groups.get(r.name) ?? 0) + r.amount);
  const totalExp = rows.reduce((s, r) => s + r.amount, 0);
  const books = Object.values(state.bookings ?? {}).filter((b) => b.status !== 'cancelled' && b.date.startsWith(ym) && b.currency === base);
  const revenue = books.reduce((s, b) => s + bookingTotals(b).total, 0);
  const add = async () => {
    try {
      const a = parseAmount(state, amount, base);
      if (!(a > 0)) return notify('اكتب المبلغ', 'error');
      const accountId = HALL_EXPENSES.find((x) => x.name === name)?.accountId ?? '5209';
      const res = await call('postVoucher', { kind: 'payment', date, amount: a, accountId: state.accounts[accountId] ? accountId : '5209', ...(cash ? { cashAccountId: cash } : {}), memo: `${name.trim() || 'مصروف'}${note.trim() ? `: ${note.trim()}` : ''}` });
      if (res) {
        notify(`انسجّل مصروف ${name}`);
        setAmount('');
        setNote('');
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return (
    <>
      <section className="card form-grid">
        <h3 className="wide form-section">مصروف جديد</h3>
        <div className="wide preset-row">
          {HALL_EXPENSES.map((x) => (
            <button key={x.name} type="button" className={`small${name === x.name ? ' primary' : ''}`} onClick={() => setName(x.name)}>
              {x.name}
            </button>
          ))}
        </div>
        <Field label="البند">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="المبلغ">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {boxes.length > 1 && (
          <Field label="من صندوق">
            <select value={cash} onChange={(e) => setCash(e.target.value)}>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="ملاحظة (اختياري)">
          <input placeholder="مثلاً: 20 ليتر، كيلو..." value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="form-actions wide">
          <button type="button" className="primary" onClick={() => void add()}>
            تسجيل المصروف
          </button>
        </div>
      </section>

      <div className="toolbar">
        <strong>
          شهر {MONTHS[m - 1]} <span className="ltr">{y}</span>
        </strong>
        <input type="month" style={{ width: 200 }} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
        <div className="spacer" />
        <PrintButtons kind="report" name={`مصاريف وربح ${MONTHS[m - 1]} ${y}`} papers={['a4']} />
      </div>
      <div className="print-area">
        <div className="print-only">
          <DocHeader title="مصاريف وربح الشهر">
            <div>
              {MONTHS[m - 1]} {y}
            </div>
          </DocHeader>
        </div>
        <div className="stats">
          <div className="stat">
            <span>حجوزات الشهر ({books.length})</span>
            <strong>{money(state, revenue)}</strong>
          </div>
          <div className="stat">
            <span>المصاريف</span>
            <strong className="bad">{money(state, totalExp)}</strong>
          </div>
          <div className="stat">
            <span>الصافي</span>
            <strong className={revenue - totalExp >= 0 ? 'good' : 'bad'}>{money(state, revenue - totalExp)}</strong>
          </div>
        </div>
        {groups.size > 0 && (
          <table className="table compact">
            <thead>
              <tr>
                <th>البند</th>
                <th className="num">المجموع</th>
              </tr>
            </thead>
            <tbody>
              {[...groups].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{money(state, v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length === 0 ? (
          <Empty>ما في مصاريف بهالشهر.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>البند</th>
                <th>ملاحظة</th>
                <th className="num">المبلغ</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entry.id}>
                  <td>{dateText(r.entry.date)}</td>
                  <td>{r.name}</td>
                  <td className="muted">{r.note}</td>
                  <td className="num">{money(state, r.amount)}</td>
                  <td className="no-print">{can('vouchers.void') && <ConfirmButton label="إلغاء" confirmLabel="أكيد؟" onConfirm={() => call('voidEntry', r.entry.id, today())} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">الصافي هون = قيمة حجوزات الشهر ناقص المصاريف المسجّلة. الربح الكامل (مع المواد والفواتير) بالتقارير ← الأرباح والخسائر.</p>
      </div>
    </>
  );
}

function HallsForm({ onClose }: { onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [text, setText] = useState(hallNames(state).join('\n'));
  const save = async () => {
    const halls = [...new Set(text.split('\n').map((x) => x.trim()).filter(Boolean))];
    if (!halls.length) return notify('اكتب اسم صالة وحدة عالأقل', 'error');
    if (await call('updateCompany', { halls })) {
      notify('انحفظت الصالات');
      onClose();
    }
  };
  return (
    <Modal title="الصالات" onClose={onClose} width={480}>
      <div className="form-grid">
        <Field label="اسم كل صالة بسطر" wide>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <p className="muted wide">إذا عندك أكتر من صالة (الكبرى، الحديقة...)، كل وحدة إلها حجوزاتها، وفيك تحجز التنتين بنفس اليوم.</p>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="primary" onClick={() => void save()}>
            حفظ
          </button>
        </div>
      </div>
    </Modal>
  );
}
