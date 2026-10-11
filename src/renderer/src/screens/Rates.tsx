import { useState } from 'react';
import { findRate, type RateKind } from '../../../core';
import { today, useCompany, dateText } from '../api';
import { Empty, Field, PageHeader } from '../components/ui';

export function Rates() {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const foreign = Object.values(state.currencies).filter((c) => c.code !== base);
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<RateKind>('market');
  const [values, setValues] = useState<Record<string, string>>({});

  const history = [...state.rates].sort((a, b) => b.date.localeCompare(a.date) || a.currency.localeCompare(b.currency)).slice(0, 200);

  return (
    <div className="page">
      <PageHeader title="أسعار الصرف" />
      <section className="card">
        <p className="muted">
          سعر الوحدة الواحدة بـ{state.currencies[base]?.nameAr}. الفواتير والسندات تستخدم آخر سعر مسجّل بتاريخها أو قبله.
        </p>
        <form
          className="form-grid four"
          onSubmit={async (e) => {
            e.preventDefault();
            let saved = 0;
            for (const c of foreign) {
              const v = Number(values[c.code]);
              if (!v) continue;
              if (await call('setRate', { date, currency: c.code, kind, rate: v })) saved++;
            }
            if (saved) {
              notify('تم حفظ الأسعار');
              setValues({});
            }
          }}
        >
          <Field label="التاريخ">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="نوع السعر">
            <select value={kind} onChange={(e) => setKind(e.target.value as RateKind)}>
              <option value="market">سعر السوق (المستخدم في الفواتير)</option>
              <option value="official">السعر الرسمي (للمرجعية)</option>
            </select>
          </Field>
          {foreign.map((c) => (
            <Field key={c.code} label={`${c.nameAr} (${c.symbol})`}>
              <input
                value={values[c.code] ?? ''}
                placeholder={String(findRate(state, c.code, date, kind) ?? '')}
                onChange={(e) => setValues({ ...values, [c.code]: e.target.value })}
                inputMode="decimal"
              />
            </Field>
          ))}
          <div className="form-actions wide">
            <button className="primary">حفظ</button>
          </div>
        </form>
      </section>
      <section className="card">
        <h3>السجل</h3>
        {history.length === 0 ? (
          <Empty>لم تُسجّل أسعار بعد</Empty>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>العملة</th>
                <th>النوع</th>
                <th className="num">السعر</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={`${r.date}-${r.currency}-${r.kind}`}>
                  <td>{dateText(r.date)}</td>
                  <td>{state.currencies[r.currency]?.nameAr}</td>
                  <td>{r.kind === 'market' ? 'سوق' : 'رسمي'}</td>
                  <td className="num">{r.rate.toLocaleString('en')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
