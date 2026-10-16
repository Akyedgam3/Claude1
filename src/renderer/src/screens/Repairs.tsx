import { useMemo, useState } from 'react';
import type { RepairOrder, RepairStatus } from '../../../core';
import { money, useCompany, dateText } from '../api';
import { Empty, matches, PageHeader, SearchBox } from '../components/ui';
import { useAssetKind } from './Vehicles';

export const STATUS_NAMES: Record<RepairStatus, string> = {
  open: 'مفتوح',
  in_progress: 'قيد العمل',
  done: 'جاهز للتسليم',
  invoiced: 'مفوتر',
  cancelled: 'ملغى',
};

export function repairTotal(r: RepairOrder): number {
  return r.parts.reduce((s, p) => s + Math.round(p.qty * p.price), 0) + r.labor.reduce((s, l) => s + l.amount, 0);
}

export function Repairs() {
  const { state, navigate } = useCompany();
  const asset = useAssetKind();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | RepairStatus | 'all'>('active');

  const rows = useMemo(
    () =>
      Object.values(state.repairs)
        .filter((r) => {
          if (status === 'active' && (r.status === 'invoiced' || r.status === 'cancelled')) return false;
          if (status !== 'active' && status !== 'all' && r.status !== status) return false;
          const v = state.vehicles[r.vehicleId];
          return matches(query, r.number, v?.plate, v?.vin, v?.make, v?.model, state.parties[r.partyId]?.name, r.complaint, r.technician);
        })
        .sort((a, b) => b.number - a.number),
    [state, query, status],
  );

  return (
    <div className="page">
      <PageHeader title="أوامر الإصلاح">
        <button className="primary" onClick={() => navigate('repair')}>
          + أمر صيانة جديد
        </button>
      </PageHeader>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder={asset.kind === 'vehicle' ? 'ابحث برقم اللوحة، اسم الزبون، أو الفني...' : 'ابحث بالجهاز، IMEI، اسم الزبون، أو الفني...'} />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">الأوامر الجارية</option>
          <option value="all">الكل</option>
          {Object.entries(STATUS_NAMES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>لا توجد أوامر إصلاح</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>{asset.kind === 'vehicle' ? 'السيارة' : 'الجهاز'}</th>
              <th>الزبون</th>
              <th>الشكوى</th>
              <th>الفني</th>
              <th>الحالة</th>
              <th className="num">القيمة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = state.vehicles[r.vehicleId];
              return (
                <tr key={r.id} className="clickable" onClick={() => navigate('repair', r.id)}>
                  <td className="mono">{r.number}</td>
                  <td>{dateText(r.date)}</td>
                  <td>
                    {v?.make} {v?.model} <span className="muted">{v?.plate}</span>
                  </td>
                  <td>{state.parties[r.partyId]?.name}</td>
                  <td className="ellipsis">{r.complaint}</td>
                  <td>{r.technician}</td>
                  <td>
                    <span className={`status ${r.status}`}>{STATUS_NAMES[r.status]}</span>
                  </td>
                  <td className="num">{money(state, repairTotal(r), r.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
