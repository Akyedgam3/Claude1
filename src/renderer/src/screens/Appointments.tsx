import { useMemo, useState } from 'react';
import type { Appointment, AppointmentStatus, Invoice } from '../../../core';
import { addDays, dateText, money, parseAmount, today, toInput, uid, useCompany } from '../api';
import { Empty, Field, itemOptions, Modal, PageHeader, partyOptions, Picker } from '../components/ui';
import { PartyForm } from './Parties';
import { Icon } from '../components/icons';
import { itemPrice } from './InvoiceEditor';

const STATUS: Record<AppointmentStatus, string> = { booked: 'محجوز', arrived: 'حضر', done: 'منتهٍ', cancelled: 'ملغى', no_show: 'لم يحضر' };

export function Appointments() {
  const { state, call, notify, navigate } = useCompany();
  const [day, setDay] = useState(today());
  const [editing, setEditing] = useState<Appointment | 'new' | null>(null);
  const list = useMemo(() => Object.values(state.appointments).filter((a) => a.date === day).sort((a, b) => a.time.localeCompare(b.time)), [state.appointments, day]);
  const upcoming = useMemo(() => Object.values(state.appointments).filter((a) => a.date > day && a.status === 'booked').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 20), [state.appointments, day]);

  const setStatus = (a: Appointment, status: AppointmentStatus) => call('saveAppointment', { ...a, status });

  return (
    <div className="page">
      <PageHeader title="المواعيد">
        <button onClick={() => setDay(addDays(day, -1))}><Icon name="prev" size={16} /> السابق</button>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <button onClick={() => setDay(addDays(day, 1))}>التالي <Icon name="next" size={16} /></button>
        <button onClick={() => setDay(today())}>اليوم</button>
        <button className="primary" onClick={() => setEditing('new')}>
          + موعد
        </button>
      </PageHeader>
      {list.length === 0 ? (
        <Empty>لا مواعيد في {dateText(day)}</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>المراجع</th>
              <th>الخدمة</th>
              <th>المختص</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const p = state.parties[a.partyId];
              return (
                <tr key={a.id}>
                  <td className="mono">{a.time}</td>
                  <td>
                    {p?.name} {p?.phone && <small className="ltr muted">{p.phone}</small>}
                    {a.notes && <div className="muted">{a.notes}</div>}
                  </td>
                  <td>{a.itemId ? state.items[a.itemId]?.name : ''}</td>
                  <td>{a.staff}</td>
                  <td>
                    <span className={`status ${a.status === 'done' ? 'done' : a.status === 'arrived' ? 'in_progress' : a.status === 'booked' ? 'open' : 'cancelled'}`}>{STATUS[a.status]}</span>
                  </td>
                  <td className="button-row">
                    {a.invoiceId ? (
                      <button className="ghost" onClick={() => navigate('invoice', a.invoiceId)}>
                        الفاتورة
                      </button>
                    ) : (
                      <>
                        {a.status === 'booked' && <button onClick={() => setStatus(a, 'arrived')}>حضر</button>}
                        <InvoiceButton appointment={a} onDone={(inv) => notify(`تم إصدار فاتورة ${inv.number}`)} />
                        {a.status === 'booked' && <button className="ghost" onClick={() => setStatus(a, 'no_show')}>لم يحضر</button>}
                        <button className="ghost" onClick={() => setEditing(a)}>
                          تعديل
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {upcoming.length > 0 && (
        <section className="card">
          <h3>المواعيد القادمة</h3>
          <table className="table compact">
            <tbody>
              {upcoming.map((a) => (
                <tr key={a.id} className="clickable" onClick={() => setDay(a.date)}>
                  <td>{dateText(a.date)}</td>
                  <td className="mono">{a.time}</td>
                  <td>{state.parties[a.partyId]?.name}</td>
                  <td>{a.itemId ? state.items[a.itemId]?.name : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {editing && <AppointmentForm appointment={editing === 'new' ? null : editing} day={day} onClose={() => setEditing(null)} />}
    </div>
  );
}

function InvoiceButton({ appointment, onDone }: { appointment: Appointment; onDone: (inv: Invoice) => void }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [open, setOpen] = useState(false);
  const service = appointment.itemId ? state.items[appointment.itemId] : undefined;
  // السعر يُحوَّل لعملة الشركة (خدمة مسعّرة بالدولار مثلاً)
  const [price, setPrice] = useState(service ? itemPrice(state, service, { currency: base, date: today() }) : '');
  const [paid, setPaid] = useState(price);
  if (!can('sales.create')) return null;
  if (!open) return <button onClick={() => setOpen(true)}>إنهاء وفوترة</button>;
  return (
    <Modal title="فوترة الموعد" onClose={() => setOpen(false)}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const p = parseAmount(state, price, base);
            const lines = service ? [{ itemId: service.id, qty: 1, price: p }] : [{ itemId: null, description: 'خدمة', qty: 1, price: p }];
            const res = await call<Invoice>('invoiceAppointment', appointment.id, { date: today(), lines, paid: Math.min(parseAmount(state, paid || '0', base), p) });
            if (res) {
              onDone(res.value);
              setOpen(false);
            }
          } catch (err) {
            notify((err as Error).message, 'error');
          }
        }}
      >
        <Field label={`السعر (${service?.name ?? 'خدمة'})`}>
          <input value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
        </Field>
        <Field label="المقبوض">
          <input value={paid} onChange={(e) => setPaid(e.target.value)} />
        </Field>
        <p className="muted wide">الإجمالي: {price ? money(state, (() => { try { return parseAmount(state, price, base); } catch { return 0; } })()) : '—'}</p>
        <div className="form-actions wide">
          <button className="primary">إصدار الفاتورة</button>
        </div>
      </form>
    </Modal>
  );
}

function AppointmentForm({ appointment, day, onClose }: { appointment: Appointment | null; day: string; onClose: () => void }) {
  const { state, call, notify, can } = useCompany();
  const [f, setF] = useState({
    partyId: appointment?.partyId ?? null as string | null,
    date: appointment?.date ?? day,
    time: appointment?.time ?? '10:00',
    minutes: String(appointment?.minutes ?? 30),
    itemId: appointment?.itemId ?? null as string | null,
    staff: appointment?.staff ?? '',
    notes: appointment?.notes ?? '',
    status: appointment?.status ?? ('booked' as AppointmentStatus),
  });
  const [newParty, setNewParty] = useState(false);
  const services = useMemo(() => itemOptions(state, (i) => i.kind !== 'stock'), [state]);
  const staff = [...new Set(Object.values(state.appointments).map((a) => a.staff).filter(Boolean))] as string[];
  const clash = Object.values(state.appointments).find(
    (a) => a.id !== appointment?.id && a.date === f.date && a.time === f.time && a.status !== 'cancelled' && (!f.staff || a.staff === f.staff),
  );
  return (
    <Modal title={appointment ? 'تعديل الموعد' : 'موعد جديد'} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.partyId) return notify('اختر المراجع', 'error');
          const data: Appointment = {
            id: appointment?.id ?? uid(),
            partyId: f.partyId,
            date: f.date,
            time: f.time,
            minutes: Number(f.minutes) || 30,
            status: f.status,
            ...(f.itemId ? { itemId: f.itemId } : {}),
            ...(f.staff.trim() ? { staff: f.staff.trim() } : {}),
            ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
          };
          if (await call('saveAppointment', data)) {
            notify('تم الحفظ');
            onClose();
          }
        }}
      >
        <Field label="المراجع" wide>
          <div className="with-button">
            <Picker options={partyOptions(state, 'customer')} value={f.partyId} onChange={(id) => setF({ ...f, partyId: id })} />
            {can('parties.manage') && (
              <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="الوقت">
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </Field>
        <Field label="الخدمة">
          <Picker options={services} value={f.itemId} onChange={(id) => setF({ ...f, itemId: id })} />
        </Field>
        <Field label="المدة (دقيقة)">
          <input type="number" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />
        </Field>
        <Field label="الطبيب / المختص">
          <input value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })} list="staff" />
          <datalist id="staff">
            {staff.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        {appointment && (
          <Field label="الحالة">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AppointmentStatus })}>
              {Object.entries(STATUS)
                .filter(([k]) => k !== 'done')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="ملاحظات" wide>
          <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {clash && <p className="bad wide">يوجد موعد آخر بنفس الوقت: {state.parties[clash.partyId]?.name}</p>}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
      {newParty && <PartyForm party={null} onClose={() => setNewParty(false)} onSaved={(p) => setF((x) => ({ ...x, partyId: p.id }))} />}
    </Modal>
  );
}
