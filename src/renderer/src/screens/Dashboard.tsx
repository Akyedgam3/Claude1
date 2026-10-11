import { useMemo } from 'react';
import { accountBalance, balancesByCurrency, findRate, incomeStatement, stockReport } from '../../../core';
import { money, qtyText, today, useCompany } from '../api';
import { PageHeader, Stat } from '../components/ui';
import { STATUS_NAMES } from './Repairs';

export function Dashboard() {
  const { state, navigate } = useCompany();
  const isAuto = state.info?.activity === 'auto';
  const d = today();
  const month = d.slice(0, 8) + '01';

  const data = useMemo(() => {
    const salesOf = (from: string) =>
      state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date >= from && i.date <= d).reduce((s, i) => s + Math.round(i.total * i.rate * 10 ** (state.currencies[state.info!.baseCurrency]!.decimals - state.currencies[i.currency]!.decimals)), 0);
    return {
      todaySales: salesOf(d),
      monthSales: salesOf(month),
      monthProfit: incomeStatement(state, { from: month, to: d }).netProfit,
      cash: balancesByCurrency(state, '1101'),
      receivables: accountBalance(state, '1103').balance,
      payables: -accountBalance(state, '2101').balance,
      low: stockReport(state).filter((r) => r.low),
      openRepairs: Object.values(state.repairs).filter((r) => r.status !== 'invoiced' && r.status !== 'cancelled'),
      usd: findRate(state, 'USD', d),
    };
  }, [state, d, month]);

  return (
    <div className="page">
      <PageHeader title={`أهلاً — ${state.info?.name}`}>
        <span className="muted">{d}</span>
      </PageHeader>

      <div className="quick-actions">
        <button className="primary big" onClick={() => navigate('sale')}>
          + فاتورة مبيع
        </button>
        {isAuto && (
          <button className="primary big accent" onClick={() => navigate('repair')}>
            + أمر إصلاح
          </button>
        )}
        <button className="big" onClick={() => navigate('purchase')}>
          + فاتورة شراء
        </button>
        <button className="big" onClick={() => navigate('vouchers')}>
          سند قبض / دفع
        </button>
      </div>

      <div className="stats">
        <Stat label="مبيعات اليوم" value={money(state, data.todaySales)} />
        <Stat label="مبيعات الشهر" value={money(state, data.monthSales)} />
        <Stat label="ربح الشهر" value={money(state, data.monthProfit)} tone={data.monthProfit >= 0 ? 'good' : 'bad'} />
        <Stat label="ديون لنا على العملاء" value={money(state, data.receivables)} />
        <Stat label="ديون علينا للموردين" value={money(state, data.payables)} />
        <div className="stat">
          <span>الصندوق</span>
          {Object.keys(data.cash).length === 0 ? (
            <strong>0</strong>
          ) : (
            Object.entries(data.cash).map(([c, v]) => <strong key={c}>{money(state, v, c)}</strong>)
          )}
        </div>
      </div>

      {!data.usd && Object.keys(state.currencies).includes('USD') && state.info?.baseCurrency !== 'USD' && (
        <div className="banner">
          لم يُسجّل سعر صرف الدولار بعد.{' '}
          <button className="link" onClick={() => navigate('rates')}>
            سجّله الآن
          </button>
        </div>
      )}

      <div className="two-col">
        {isAuto && (
          <section className="card">
            <h3>السيارات في الورشة ({data.openRepairs.length})</h3>
            {data.openRepairs.length === 0 ? (
              <p className="muted">لا توجد سيارات حالياً</p>
            ) : (
              <table className="table compact">
                <tbody>
                  {data.openRepairs.map((r) => {
                    const v = state.vehicles[r.vehicleId];
                    return (
                      <tr key={r.id} className="clickable" onClick={() => navigate('repair', r.id)}>
                        <td>{v?.plate}</td>
                        <td>
                          {v?.make} {v?.model}
                        </td>
                        <td>{state.parties[r.partyId]?.name}</td>
                        <td>
                          <span className={`status ${r.status}`}>{STATUS_NAMES[r.status]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}
        <section className="card">
          <h3>نواقص المخزون ({data.low.length})</h3>
          {data.low.length === 0 ? (
            <p className="muted">لا توجد نواقص</p>
          ) : (
            <table className="table compact">
              <tbody>
                {data.low.map((r) => (
                  <tr key={r.item.id}>
                    <td>{r.item.name}</td>
                    <td className="mono muted">{r.item.partNumber}</td>
                    <td className="num bad">
                      {qtyText(r.qty)} / {r.item.minStock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
