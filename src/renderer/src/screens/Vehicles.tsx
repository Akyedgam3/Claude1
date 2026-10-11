import { useMemo, useState } from 'react';
import type { Vehicle } from '../../../core';
import { uid, useCompany, dateText } from '../api';
import { Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { PartyForm } from './Parties';
import { STATUS_NAMES } from './Repairs';

export function Vehicles() {
  const { state, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);

  const rows = useMemo(
    () =>
      Object.values(state.vehicles)
        .filter((v) => matches(query, v.plate, v.make, v.model, v.vin, state.parties[v.partyId]?.name, state.parties[v.partyId]?.phone))
        .sort((a, b) => a.plate.localeCompare(b.plate, 'ar')),
    [state, query],
  );

  return (
    <div className="page">
      <PageHeader title="السيارات">
        <button className="primary" onClick={() => setEditing('new')}>
          + سيارة جديدة
        </button>
      </PageHeader>
      <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم اللوحة، النوع، الشاسيه، أو اسم صاحبها..." />
      {rows.length === 0 ? (
        <Empty>لا توجد سيارات</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>اللوحة</th>
              <th>السيارة</th>
              <th>الموديل</th>
              <th>صاحبها</th>
              <th>آخر زيارة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const repairs = Object.values(state.repairs)
                .filter((r) => r.vehicleId === v.id)
                .sort((a, b) => b.date.localeCompare(a.date));
              const last = repairs[0];
              return (
                <tr key={v.id} className="clickable" onClick={() => setEditing(v)}>
                  <td>{v.plate}</td>
                  <td>
                    {v.make} {v.model}
                  </td>
                  <td>{v.year}</td>
                  <td>{state.parties[v.partyId]?.name}</td>
                  <td>{last ? `${dateText(last.date)} — ${STATUS_NAMES[last.status]}` : '—'}</td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('repair', `new:${v.id}`);
                      }}
                    >
                      أمر إصلاح
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && <VehicleForm vehicle={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function VehicleForm({
  vehicle,
  onClose,
  onSaved,
  partyId,
}: {
  vehicle: Vehicle | null;
  onClose: () => void;
  onSaved?: (v: Vehicle) => void;
  partyId?: string | null;
}) {
  const { state, call, notify, navigate } = useCompany();
  const [f, setF] = useState({
    partyId: vehicle?.partyId ?? partyId ?? null,
    plate: vehicle?.plate ?? '',
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    year: vehicle?.year ? String(vehicle.year) : '',
    vin: vehicle?.vin ?? '',
    engine: vehicle?.engine ?? '',
    color: vehicle?.color ?? '',
    notes: vehicle?.notes ?? '',
  });
  const [newParty, setNewParty] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const history = vehicle
    ? Object.values(state.repairs)
        .filter((r) => r.vehicleId === vehicle.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <Modal title={vehicle ? `${vehicle.make} ${vehicle.model} — ${vehicle.plate}` : 'سيارة جديدة'} onClose={onClose} width={720}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.partyId) return notify('اختر صاحب السيارة', 'error');
          const data: Vehicle = {
            id: vehicle?.id ?? uid(),
            partyId: f.partyId,
            plate: f.plate.trim(),
            make: f.make.trim(),
            model: f.model.trim(),
            ...(f.year ? { year: Number(f.year) } : {}),
            ...Object.fromEntries((['vin', 'engine', 'color', 'notes'] as const).filter((k) => f[k].trim()).map((k) => [k, f[k].trim()])),
          };
          if (await call('saveVehicle', data)) {
            notify('تم الحفظ');
            onSaved?.(data);
            onClose();
          }
        }}
      >
        <Field label="صاحب السيارة" wide>
          <div className="with-button">
            <Picker options={partyOptions(state, 'customer')} value={f.partyId} onChange={(id) => setF({ ...f, partyId: id })} placeholder="اختر العميل..." />
            <button type="button" className="icon" onClick={() => setNewParty(true)}>
              +
            </button>
          </div>
        </Field>
        <Field label="رقم اللوحة">
          <input value={f.plate} onChange={set('plate')} autoFocus={!!partyId} placeholder="دمشق 123456" />
        </Field>
        <Field label="الشركة الصانعة">
          <input value={f.make} onChange={set('make')} placeholder="كيا، هيونداي، تويوتا..." list="makes" />
          <datalist id="makes">
            {[...new Set(Object.values(state.vehicles).map((v) => v.make))].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="الطراز">
          <input value={f.model} onChange={set('model')} placeholder="ريو، أكسنت..." />
        </Field>
        <Field label="سنة الصنع">
          <input value={f.year} onChange={set('year')} inputMode="numeric" />
        </Field>
        <Field label="رقم الشاسيه (VIN)">
          <input value={f.vin} onChange={set('vin')} dir="ltr" className="mono" />
        </Field>
        <Field label="المحرك">
          <input value={f.engine} onChange={set('engine')} placeholder="1.4 بنزين" />
        </Field>
        <Field label="اللون">
          <input value={f.color} onChange={set('color')} />
        </Field>
        <Field label="ملاحظات" wide>
          <textarea value={f.notes} onChange={set('notes')} rows={2} />
        </Field>
        <div className="form-actions wide">
          {vehicle && (
            <button type="button" onClick={() => navigate('repair', `new:${vehicle.id}`)}>
              أمر إصلاح جديد
            </button>
          )}
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
      {history.length > 0 && (
        <>
          <h4>سجل الصيانة</h4>
          <table className="table compact">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>العداد</th>
                <th>الشكوى</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => navigate('repair', r.id)}>
                  <td>{dateText(r.date)}</td>
                  <td>{r.odometer?.toLocaleString('en')}</td>
                  <td>{r.complaint}</td>
                  <td>{STATUS_NAMES[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {newParty && <PartyForm party={null} onClose={() => setNewParty(false)} onSaved={(p) => setF((x) => ({ ...x, partyId: p.id }))} />}
    </Modal>
  );
}
