import { useMemo, useState } from 'react';
import type { AssetKind, Vehicle } from '../../../core';
import { dateText, uid, useCompany } from '../api';
import { Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { PartyForm } from './Parties';
import { Icon } from '../components/icons';
import { STATUS_NAMES } from './Repairs';

/** نوع البطاقة حسب النشاط: سيارات (ورش) أو أجهزة (موبايلات وإلكترونيات). */
export function useAssetKind(): { kind: AssetKind; one: string; many: string; owner: string } {
  const { feature } = useCompany();
  return feature('vehicles') ? { kind: 'vehicle', one: 'سيارة', many: 'السيارات', owner: 'صاحب السيارة' } : { kind: 'device', one: 'جهاز', many: 'الأجهزة', owner: 'صاحب الجهاز' };
}

export function assetLabel(v: Vehicle | undefined): string {
  if (!v) return '';
  return [v.make, v.model, v.year, v.plate || v.vin].filter(Boolean).join(' ');
}

export function Vehicles() {
  const { state, navigate } = useCompany();
  const asset = useAssetKind();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);

  const rows = useMemo(
    () =>
      Object.values(state.vehicles)
        .filter((v) => matches(query, v.plate, v.make, v.model, v.vin, state.parties[v.partyId]?.name, state.parties[v.partyId]?.phone))
        .sort((a, b) => (a.plate || a.make).localeCompare(b.plate || b.make, 'ar')),
    [state, query],
  );

  return (
    <div className="page">
      <PageHeader title={asset.many}>
        <button className="primary" onClick={() => setEditing('new')}>
          + {asset.one} جديد{asset.kind === 'vehicle' ? 'ة' : ''}
        </button>
      </PageHeader>
      <SearchBox value={query} onChange={setQuery} placeholder={asset.kind === 'vehicle' ? 'ابحث برقم اللوحة، النوع، الشاسيه، أو اسم صاحبها...' : 'ابحث بالماركة، الموديل، IMEI، أو اسم صاحبه...'} />
      {rows.length === 0 ? (
        <Empty>لا يوجد</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{asset.kind === 'vehicle' ? 'اللوحة' : 'IMEI / الرقم'}</th>
              <th>{asset.one}</th>
              <th>الموديل</th>
              <th>{asset.owner}</th>
              <th>آخر زيارة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const last = Object.values(state.repairs)
                .filter((r) => r.vehicleId === v.id)
                .sort((a, b) => b.date.localeCompare(a.date))[0];
              return (
                <tr key={v.id} className="clickable" onClick={() => setEditing(v)}>
                  <td className={v.plate ? '' : 'mono'}>{v.plate || v.vin}</td>
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
                      أمر صيانة
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

export function VehicleForm({ vehicle, onClose, onSaved, partyId }: { vehicle: Vehicle | null; onClose: () => void; onSaved?: (v: Vehicle) => void; partyId?: string | null }) {
  const { state, call, notify, navigate, can } = useCompany();
  const asset = useAssetKind();
  const kind = vehicle?.kind ?? asset.kind;
  const isCar = kind === 'vehicle';
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
    <Modal title={vehicle ? assetLabel(vehicle) : `${asset.one} ${asset.kind === 'vehicle' ? 'جديدة' : 'جديد'}`} onClose={onClose} width={720}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.partyId) return notify(`اختر ${asset.owner}`, 'error');
          const data: Vehicle = {
            id: vehicle?.id ?? uid(),
            partyId: f.partyId,
            kind,
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
        <Field label={asset.owner} wide>
          <div className="with-button">
            <Picker options={partyOptions(state, 'customer')} value={f.partyId} onChange={(id) => setF({ ...f, partyId: id })} placeholder="اختر العميل..." />
            {can('parties.manage') && (
              <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
        </Field>
        {isCar && (
          <Field label="رقم اللوحة">
            <input value={f.plate} onChange={set('plate')} placeholder="دمشق 123456" />
          </Field>
        )}
        <Field label={isCar ? 'الشركة الصانعة' : 'الماركة'}>
          <input value={f.make} onChange={set('make')} placeholder={isCar ? 'كيا، هيونداي، تويوتا...' : 'Samsung، Apple، Xiaomi...'} list="makes" />
          <datalist id="makes">
            {[...new Set(Object.values(state.vehicles).map((v) => v.make))].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="الطراز">
          <input value={f.model} onChange={set('model')} />
        </Field>
        {isCar && (
          <Field label="سنة الصنع">
            <input value={f.year} onChange={set('year')} inputMode="numeric" />
          </Field>
        )}
        <Field label={isCar ? 'رقم الشاسيه (VIN)' : 'IMEI / الرقم التسلسلي'}>
          <input value={f.vin} onChange={set('vin')} dir="ltr" className="mono" />
        </Field>
        {isCar && (
          <Field label="المحرك">
            <input value={f.engine} onChange={set('engine')} placeholder="1.4 بنزين" />
          </Field>
        )}
        <Field label="اللون">
          <input value={f.color} onChange={set('color')} />
        </Field>
        <Field label="ملاحظات" wide>
          <textarea value={f.notes} onChange={set('notes')} rows={2} />
        </Field>
        <div className="form-actions wide">
          {vehicle && (
            <button type="button" onClick={() => navigate('repair', `new:${vehicle.id}`)}>
              أمر صيانة جديد
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
                {isCar && <th>العداد</th>}
                <th>الشكوى</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => navigate('repair', r.id)}>
                  <td>{dateText(r.date)}</td>
                  {isCar && <td>{r.odometer?.toLocaleString('en')}</td>}
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
