import { useState } from 'react';
import { findRate, type RateKind } from '../../../core';
import { dateText, today, useCompany } from '../api';
import { Empty, Field, PageHeader } from '../components/ui';

export function Rates() {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const foreign = base === 'USD' ? 'SYP' : 'USD';
  const [date, setDate] = useState(today());
  const [market, setMarket] = useState('');
  const [official, setOfficial] = useState('');
  const history = state.rates.filter((r) => r.currency === foreign).sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind)).slice(0, 300);
  const current = findRate(state, foreign, today());

  const save = async () => {
    let saved = 0;
    for (const [kind, v] of [['market', market], ['official', official]] as [RateKind, string][]) {
      const n = Number(v);
      if (!v.trim()) continue;
      if (!(n > 0)) return notify('سعر غير صالح', 'error');
      if (await call('setRate', { date, currency: foreign, kind, rate: n })) saved++;
    }
    if (saved) {
      notify('تم حفظ السعر');
      setMarket('');
      setOfficial('');
    }
  };

  return (
    <div className="page">
      <PageHeader title={foreign === 'USD' ? 'سعر الدولار' : 'سعر الليرة'} />
      <div className="stats">
        <div className="stat">
          <span>سعر السوق الحالي</span>
          <strong>{current ? `${current.toLocaleString('en')} ${state.currencies[base]?.symbol}` : 'غير مسجّل'}</strong>
        </div>
      </div>
      <section className="card">
        <p className="muted">
          كم {state.currencies[base]?.nameAr} يساوي 1 {state.currencies[foreign]?.nameAr}. الفواتير والسندات تستخدم سعر السوق المسجّل بتاريخها أو قبله.
        </p>
        <form
          className="form-grid four"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="التاريخ">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="سعر السوق (المستخدم في الفواتير)">
            <input value={market} placeholder={String(findRate(state, foreign, date, 'market') ?? '')} onChange={(e) => setMarket(e.target.value)} inputMode="decimal" autoFocus />
          </Field>
          <Field label="السعر الرسمي (للمرجعية)">
            <input value={official} placeholder={String(findRate(state, foreign, date, 'official') ?? '')} onChange={(e) => setOfficial(e.target.value)} inputMode="decimal" />
          </Field>
          <div className="form-actions">
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
                <th>النوع</th>
                <th className="num">السعر</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={`${r.date}-${r.kind}`}>
                  <td>{dateText(r.date)}</td>
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
