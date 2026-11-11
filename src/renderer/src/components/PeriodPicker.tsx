// اختيار الفترة (اليوم، هالشهر، الشهر الماضي، هالسنة، الكل، أو من تاريخ لتاريخ) لشاشات المراقبة والكشوفات والصندوق.
import { useState } from 'react';
import { today } from '../api';

export type PeriodKey = 'today' | 'month' | 'last' | 'year' | 'all' | 'custom';
export interface PeriodValue {
  key: PeriodKey;
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

export function periodRange(key: PeriodKey, from = '', to = ''): { from: string; to: string } {
  const d = today();
  const [y, m] = d.split('-').map(Number) as [number, number];
  if (key === 'today') return { from: d, to: d };
  if (key === 'month') return { from: `${y}-${pad(m)}-01`, to: d };
  if (key === 'last') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
  }
  if (key === 'year') return { from: `${y}-01-01`, to: d };
  if (key === 'custom') return { from: from || `${y}-01-01`, to: to || d };
  return { from: '', to: '' };
}

const LABELS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'month', label: 'هالشهر' },
  { key: 'last', label: 'الشهر الماضي' },
  { key: 'year', label: 'هالسنة' },
  { key: 'all', label: 'الكل' },
  { key: 'custom', label: 'من تاريخ لتاريخ' },
];

export function usePeriod(initial: PeriodKey = 'month'): [PeriodValue, (key: PeriodKey, from?: string, to?: string) => void] {
  const [v, setV] = useState<PeriodValue>(() => ({ key: initial, ...periodRange(initial) }));
  return [v, (key, from, to) => setV({ key, ...periodRange(key, from ?? v.from, to ?? v.to) })];
}

export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (key: PeriodKey, from?: string, to?: string) => void }) {
  return (
    <div className="period-picker">
      <div className="segmented">
        {LABELS.map((p) => (
          <button key={p.key} type="button" className={value.key === p.key ? 'active' : ''} onClick={() => onChange(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {value.key === 'custom' && (
        <span className="period-dates">
          <label>
            من <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange('custom', e.target.value, value.to)} />
          </label>
          <label>
            لـ <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange('custom', value.from, e.target.value)} />
          </label>
        </span>
      )}
    </div>
  );
}

/** {from,to} للدوال الأساسية (الكل = بدون حدود). */
export const asPeriod = (v: PeriodValue) => (v.key === 'all' ? {} : { from: v.from, to: v.to });
