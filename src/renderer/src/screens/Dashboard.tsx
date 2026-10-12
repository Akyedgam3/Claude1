import { useMemo } from 'react';
import { accountBalance, balancesByCurrency, expiringBatches, findRate, incomeStatement, stockReport } from '../../../core';
import { dateText, money, qtyText, today, useCompany } from '../api';
import { Stat } from '../components/ui';
import { STATUS_NAMES } from './Repairs';
import { TAILOR_STATUS } from './Tailor';
import { Icon } from '../components/icons';

export function Dashboard() {
  const { state, navigate, can, feature, profile, user } = useCompany();
  const d = today();
  const month = d.slice(0, 8) + '01';
  const base = state.info!.baseCurrency;

  const data = useMemo(() => {
    const toBase = (minor: number, cur: string, rate: number) => Math.round(minor * rate * 10 ** (state.currencies[base]!.decimals - state.currencies[cur]!.decimals));
    const salesOf = (from: string) =>
      state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date >= from && i.date <= d).reduce((s, i) => s + toBase(i.total, i.currency, i.rate), 0);
    return {
      todaySales: salesOf(d),
      monthSales: salesOf(month),
      monthProfit: incomeStatement(state, { from: month, to: d }).netProfit,
      cash: Object.values(state.accounts)
        .filter((a) => /^110[18]$/.test(a.id))
        .flatMap((a) => Object.entries(balancesByCurrency(state, a.id)).filter(([, v]) => v !== 0)),
      receivables: accountBalance(state, '1103').balance,
      payables: -accountBalance(state, '2101').balance,
      low: stockReport(state).filter((r) => r.low).slice(0, 15),
      expiring: expiringBatches(state, d, 30).slice(0, 15),
      openRepairs: Object.values(state.repairs).filter((r) => r.status !== 'invoiced' && r.status !== 'cancelled'),
      openOrders: Object.values(state.orders).filter((o) => o.status === 'open'),
      tailor: Object.values(state.tailorOrders)
        .filter((o) => !o.invoiceId && o.status !== 'cancelled' && o.status !== 'delivered')
        .sort((a, b) => (a.fittingDate && a.fittingDate >= d ? a.fittingDate : a.dueDate ?? '9999').localeCompare(b.fittingDate && b.fittingDate >= d ? b.fittingDate : b.dueDate ?? '9999')),
      tailorCounts: (() => {
        const active = Object.values(state.tailorOrders).filter((o) => !o.invoiceId && o.status !== 'cancelled' && o.status !== 'delivered');
        return {
          active: active.length,
          late: active.filter((o) => o.dueDate && o.dueDate < d).length,
          today: active.filter((o) => o.dueDate === d || o.fittingDate === d).length,
          ready: active.filter((o) => o.status === 'ready').length,
        };
      })(),
      appointments: Object.values(state.appointments).filter((a) => a.date === d && a.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time)),
      usd: base === 'USD' ? 1 : findRate(state, 'USD', d),
    };
  }, [state, d, month, base]);

  const fin = can('reports.financial');

  return (
    <div className="page">
      <div className="activity-hero">
        <span className="activity-badge">
          <Icon name={profile.icon} size={30} />
        </span>
        <div>
          <h1>أهلاً {user.displayName}</h1>
          <div className="muted">
            {state.info?.name} · {profile.name} · {dateText(d)}
          </div>
        </div>
      </div>

      <div className="quick-actions">
        {feature('pos') && can('pos.use') && (
          <button className="primary big" onClick={() => navigate('pos')}>
            <Icon name="pos" size={20} /> نقطة البيع
          </button>
        )}
        {feature('tables') && can('restaurant.use') && (
          <button className="primary big" onClick={() => navigate('restaurant')}>
            <Icon name="utensils" size={20} /> الطاولات
          </button>
        )}
        {feature('tailoring') && can('tailoring.manage') && (
          <button className="primary big accent" onClick={() => navigate('tailor-order')}>
            <Icon name="scissors" size={20} /> طلب تفصيل جديد
          </button>
        )}
        {can('sales.create') && (
          <button className="primary big" onClick={() => navigate('sale')}>
            <Icon name="plus" size={20} /> فاتورة مبيع
          </button>
        )}
        {feature('repairs') && can('repairs.manage') && (
          <button className="primary big accent" onClick={() => navigate('repair')}>
            <Icon name="wrench" size={20} /> أمر صيانة
          </button>
        )}
        {feature('appointments') && can('appointments.manage') && (
          <button className="primary big accent" onClick={() => navigate('appointments')}>
            <Icon name="calendar" size={20} /> المواعيد
          </button>
        )}
        {can('sales.create') && (
          <button className="big" onClick={() => navigate('quote')}>
            <Icon name="file" size={20} /> عرض سعر
          </button>
        )}
        {can('purchases.create') && (
          <button className="big" onClick={() => navigate('purchase')}>
            <Icon name="purchase" size={20} /> فاتورة شراء
          </button>
        )}
        {can('vouchers.create') && (
          <button className="big" onClick={() => navigate('vouchers')}>
            <Icon name="wallet" size={20} /> سند قبض / دفع
          </button>
        )}
      </div>

      {feature('tailoring') && can('tailoring.manage') && (
        <div className="stats">
          <div className="stat clickable" onClick={() => navigate('tailor')}>
            <span>الطلبات الجارية</span>
            <strong>{data.tailorCounts.active}</strong>
          </div>
          <div className="stat clickable" onClick={() => navigate('tailor')}>
            <span>متأخرة عن موعدها</span>
            <strong className={data.tailorCounts.late ? 'bad' : ''}>{data.tailorCounts.late}</strong>
          </div>
          <div className="stat clickable" onClick={() => navigate('tailor')}>
            <span>تسليم أو بروفة اليوم</span>
            <strong>{data.tailorCounts.today}</strong>
          </div>
          <div className="stat clickable" onClick={() => navigate('tailor')}>
            <span>جاهزة للتسليم</span>
            <strong className="good">{data.tailorCounts.ready}</strong>
          </div>
        </div>
      )}

      {fin && (
        <div className="stats">
          <Stat label="مبيعات اليوم" value={money(state, data.todaySales)} />
          <Stat label="مبيعات الشهر" value={money(state, data.monthSales)} />
          {can('costs.view') && <Stat label="ربح الشهر" value={money(state, data.monthProfit)} tone={data.monthProfit >= 0 ? 'good' : 'bad'} />}
          <Stat label="ديون لنا على العملاء" value={money(state, data.receivables)} />
          <Stat label="ديون علينا للموردين" value={money(state, data.payables)} />
          <div className="stat">
            <span>النقد في الصناديق</span>
            {data.cash.length === 0 ? <strong>0</strong> : data.cash.map(([c, v], i) => <strong key={i}>{money(state, v, c)}</strong>)}
          </div>
          <div className="stat clickable" onClick={() => can('rates.manage') && navigate('rates')}>
            <span>سعر الدولار</span>
            <strong>{data.usd ? `${data.usd.toLocaleString('en')} ${state.currencies[base]?.symbol}` : 'غير مسجّل'}</strong>
          </div>
        </div>
      )}

      <div className="two-col">
        {feature('repairs') && (
          <section className="card">
            <h3>
              {feature('vehicles') ? 'السيارات في الورشة' : 'الأجهزة في الصيانة'} ({data.openRepairs.length})
            </h3>
            {data.openRepairs.length === 0 ? (
              <p className="muted">لا يوجد حالياً</p>
            ) : (
              <table className="table compact">
                <tbody>
                  {data.openRepairs.map((r) => {
                    const v = state.vehicles[r.vehicleId];
                    return (
                      <tr key={r.id} className="clickable" onClick={() => navigate('repair', r.id)}>
                        <td>{v?.plate || v?.vin}</td>
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
        {feature('tailoring') && (
          <section className="card">
            <h3>طلبات التفصيل الجارية ({data.tailor.length})</h3>
            {data.tailor.length === 0 ? (
              <p className="muted">لا توجد طلبات جارية</p>
            ) : (
              <table className="table compact">
                <tbody>
                  {data.tailor.slice(0, 12).map((o) => (
                    <tr key={o.id} className={`clickable ${o.dueDate && o.dueDate < d ? 'late' : ''}`} onClick={() => navigate('tailor-order', o.id)}>
                      <td className="mono">{o.number}</td>
                      <td>{state.parties[o.partyId]?.name}</td>
                      <td>{o.fittingDate && o.fittingDate >= d ? `بروفة ${dateText(o.fittingDate)}` : o.dueDate ? `تسليم ${dateText(o.dueDate)}` : ''}</td>
                      <td>
                        <span className={`status ${o.status === 'ready' ? 'done' : o.status === 'received' ? 'open' : 'in_progress'}`}>{TAILOR_STATUS[o.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {feature('tables') && (
          <section className="card clickable" onClick={() => navigate('restaurant')}>
            <h3>الطلبات المفتوحة ({data.openOrders.length})</h3>
            {data.openOrders.slice(0, 10).map((o) => (
              <div key={o.id}>
                {o.tableId ? state.tables[o.tableId]?.name : 'سفري'} — طلب {o.number}
              </div>
            ))}
          </section>
        )}
        {feature('appointments') && (
          <section className="card">
            <h3>مواعيد اليوم ({data.appointments.length})</h3>
            <table className="table compact">
              <tbody>
                {data.appointments.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => navigate('appointments')}>
                    <td className="mono">{a.time}</td>
                    <td>{state.parties[a.partyId]?.name}</td>
                    <td>{a.itemId ? state.items[a.itemId]?.name : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {can('reports.stock') && (
          <section className="card">
            <h3>نواقص {profile.itemsLabel} ({data.low.length})</h3>
            {data.low.length === 0 ? (
              <p className="muted">لا توجد نواقص</p>
            ) : (
              <table className="table compact">
                <tbody>
                  {data.low.map((r) => (
                    <tr key={r.item.id}>
                      <td>{r.item.name}</td>
                      <td className="mono muted">{r.item.code}</td>
                      <td className="num bad">
                        {qtyText(r.qty)} / {r.item.minStock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {data.expiring.length > 0 && (
          <section className="card clickable" onClick={() => navigate('stock', 'expiry')}>
            <h3>تنتهي صلاحيتها خلال 30 يوماً ({data.expiring.length})</h3>
            <table className="table compact">
              <tbody>
                {data.expiring.map((r) => (
                  <tr key={`${r.item.id}-${r.batch}`} className={r.expired ? 'warn-row' : ''}>
                    <td>{r.item.name}</td>
                    <td className={r.expired ? 'bad' : ''}>{dateText(r.expiry)}</td>
                    <td className="num">{qtyText(r.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
      {!data.usd && can('rates.manage') && (
        <div className="banner">
          لم يُسجّل سعر الدولار بعد.{' '}
          <button className="link" onClick={() => navigate('rates')}>
            سجّله الآن
          </button>
        </div>
      )}
    </div>
  );
}
