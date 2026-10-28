import { useMemo } from 'react';
import { balancesByCurrency, partyBalance, expiringBatches, findRate, incomeStatement, installmentState, stockReport } from '../../../core';
import type { CompanyState } from '../../../core';
import { addDays, dateText, money, qtyText, today, useCompany } from '../api';
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
    // آخر 7 أيام: مبيعات كل يوم بعملة الشركة
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6)).map((day) => ({ day, total: 0, count: 0 }));
    const byDay = Object.fromEntries(week.map((w) => [w.day, w]));
    const top: Record<string, { qty: number; total: number }> = {};
    for (const i of state.invoices) {
      if (i.kind !== 'sale' || i.voidEntryId) continue;
      const w = byDay[i.date];
      if (w) {
        w.total += toBase(i.total, i.currency, i.rate);
        w.count++;
      }
      if (i.date >= month && i.date <= d)
        for (const l of i.lines) {
          if (!l.itemId) continue;
          const t = (top[l.itemId] ??= { qty: 0, total: 0 });
          t.qty += l.qty;
          t.total += toBase(Math.round(l.qty * l.price) - (l.discount ?? 0), i.currency, i.rate);
        }
    }
    // الديون صافية لكل شخص (متل قسم الديون)
    let receivables = 0;
    let payables = 0;
    const dueDebts: { id: string; name: string; due: string; amount: number }[] = [];
    for (const p of Object.values(state.parties)) {
      const b = partyBalance(state, p.id).base;
      if (b > 0) receivables += b;
      else payables -= b;
      if (p.debtDue && b !== 0 && p.debtDue <= addDays(d, 3)) dueDebts.push({ id: p.id, name: p.name, due: p.debtDue, amount: b });
    }
    return {
      week,
      top: Object.entries(top)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5),
      dueDebts: dueDebts.sort((a, b) => a.due.localeCompare(b.due)),
      todayProfit: incomeStatement(state, { from: d, to: d }).netProfit,
      todayCount: state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date === d).length,
      todaySales: salesOf(d),
      monthSales: salesOf(month),
      monthProfit: incomeStatement(state, { from: month, to: d }).netProfit,
      cash: Object.values(state.accounts)
        .filter((a) => /^110[18]$/.test(a.id))
        .flatMap((a) => Object.entries(balancesByCurrency(state, a.id)).filter(([, v]) => v !== 0)),
      receivables,
      payables,
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
        {feature('sitejobs') && can('sitejobs.manage') && (
          <button className="primary big accent" onClick={() => navigate('sitejob')}>
            <Icon name="roller" size={20} /> كشف جديد
          </button>
        )}
        {feature('sitejobs') && can('sitejobs.manage') && (
          <button className="primary big" onClick={() => navigate('sitejobs')}>
            <Icon name="ruler" size={20} /> المشاريع
          </button>
        )}
        {feature('shipments') && can('shipments.manage') && (
          <button className="primary big accent" onClick={() => navigate('shipments')}>
            <Icon name="container" size={20} /> الشحنات
          </button>
        )}
        {feature('stoneblocks') && (can('production.manage') || can('purchases.create')) && (
          <button className="primary big accent" onClick={() => navigate('stoneblocks')}>
            <Icon name="mountain" size={20} /> الكتل والقص
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
          <button className="big" onClick={() => navigate('debts')}>
            <Icon name="debts" size={20} /> الديون
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

      {feature('installments') && (() => {
        const plans = Object.values(state.installments).filter((p) => p.status === 'active').map((p) => installmentState(state, p, d));
        const week = addDays(d, 7);
        return (
          <div className="stats">
            <div className="stat clickable" onClick={() => navigate('installments')}>
              <span>خطط تقسيط فعّالة</span>
              <strong>{plans.length}</strong>
            </div>
            <div className="stat clickable" onClick={() => navigate('installments')}>
              <span>أقساط مستحقة هالأسبوع</span>
              <strong>{money(state, plans.reduce((t, s) => t + s.rows.filter((r) => r.remaining > 0 && r.due >= d && r.due <= week).reduce((x, r) => x + r.remaining, 0), 0))}</strong>
            </div>
            <div className="stat clickable" onClick={() => navigate('installments')}>
              <span>أقساط متأخرة</span>
              <strong className={plans.some((s) => s.overdueCount) ? 'bad' : ''}>{money(state, plans.reduce((t, s) => t + s.overdueAmount, 0))}</strong>
            </div>
            <div className="stat clickable" onClick={() => navigate('installments')}>
              <span>الباقي عند الزبائن</span>
              <strong>{money(state, plans.reduce((t, s) => t + s.remaining, 0))}</strong>
            </div>
          </div>
        );
      })()}

      {fin && (
        <div className="stats">
          <Stat label="مبيعات اليوم" value={money(state, data.todaySales)} hint={`${data.todayCount} فاتورة`} onClick={() => navigate('reports', 'daily')} />
          {can('costs.view') && <Stat label="ربح اليوم" value={money(state, data.todayProfit)} tone={data.todayProfit >= 0 ? 'good' : 'bad'} onClick={() => navigate('reports', 'income')} />}
          <Stat label="مبيعات الشهر" value={money(state, data.monthSales)} onClick={() => navigate('reports', 'income')} />
          {can('costs.view') && <Stat label="ربح الشهر" value={money(state, data.monthProfit)} tone={data.monthProfit >= 0 ? 'good' : 'bad'} hint="المبيعات − التكلفة − المصاريف" onClick={() => navigate('reports', 'income')} />}
          <Stat label="ديون لنا على الناس" value={money(state, data.receivables)} onClick={() => navigate('debts')} />
          <Stat label="ديون علينا للناس" value={money(state, data.payables)} onClick={() => navigate('debts')} />
          <div className="stat clickable" onClick={() => navigate('reports', 'cash')}>
            <span>النقد في الصناديق</span>
            {data.cash.length === 0 ? <strong>0</strong> : data.cash.map(([c, v], i) => <strong key={i}>{money(state, v, c)}</strong>)}
          </div>
          <div className="stat clickable" onClick={() => can('rates.manage') && navigate('rates')}>
            <span>سعر الدولار</span>
            <strong>{data.usd ? `${data.usd.toLocaleString('en')} ${state.currencies[base]?.symbol}` : 'غير مسجّل'}</strong>
          </div>
        </div>
      )}

      {fin && (
        <div className="two-col">
          <section className="card clickable" onClick={() => navigate('reports', 'daily')}>
            <h3>
              <Icon name="chart" size={16} /> مبيعات آخر 7 أيام
            </h3>
            <WeekBars state={state} week={data.week} today={d} />
          </section>
          <section className="card">
            <h3>
              <Icon name="trend" size={16} /> الأكثر مبيعاً هالشهر
            </h3>
            {data.top.length === 0 ? (
              <p className="muted">لسا ما في مبيعات هالشهر</p>
            ) : (
              <table className="table compact">
                <tbody>
                  {data.top.map(([id, t], n) => (
                    <tr key={id}>
                      <td className="muted">{n + 1}</td>
                      <td>{state.items[id]?.name ?? '—'}</td>
                      <td className="num muted">{qtyText(t.qty)}</td>
                      <td className="num">{money(state, t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {data.dueDebts.length > 0 && (
            <section className="card clickable" onClick={() => navigate('debts')}>
              <h3>
                <Icon name="bell" size={16} /> ديون حان موعد سدادها ({data.dueDebts.length})
              </h3>
              <table className="table compact">
                <tbody>
                  {data.dueDebts.slice(0, 8).map((x) => (
                    <tr key={x.id} className={x.due < d ? 'late' : ''}>
                      <td>{x.name}</td>
                      <td className={x.due < d ? 'bad' : ''}>{x.due < d ? `متأخر — ${dateText(x.due)}` : dateText(x.due)}</td>
                      <td className={`num ${x.amount > 0 ? 'good' : 'bad'}`}>
                        {money(state, Math.abs(x.amount))} {x.amount > 0 ? 'لنا' : 'علينا'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
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

/** أعمدة مبيعات آخر أسبوع (سلسلة وحدة، فما في داعي لمفتاح ألوان). */
function WeekBars({ state, week, today }: { state: CompanyState; week: { day: string; total: number; count: number }[]; today: string }) {
  const max = Math.max(1, ...week.map((w) => w.total));
  const sum = week.reduce((s, w) => s + w.total, 0);
  const names = ['أحد', 'اثنين', 'تلاتا', 'أربعا', 'خميس', 'جمعة', 'سبت'];
  return (
    <div className="week-bars">
      <div className="bars">
        {week.map((w) => (
          <div key={w.day} className={`bar-col ${w.day === today ? 'today' : ''}`} title={`${dateText(w.day)}: ${money(state, w.total)} · ${w.count} فاتورة`}>
            <div className="bar-track">
              <div className="bar" style={{ height: `${Math.max(w.total ? 4 : 0, (w.total / max) * 100)}%` }} />
            </div>
            <small>{names[new Date(w.day + 'T12:00:00').getDay()]}</small>
          </div>
        ))}
      </div>
      <div className="muted week-sum">مجموع الأسبوع: <strong>{money(state, sum)}</strong></div>
    </div>
  );
}
