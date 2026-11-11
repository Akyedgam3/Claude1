import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { balancesByCurrency, dailyProfit, partyBalance, expiringBatches, findRate, incomeStatement, installmentState, stockReport } from '../../../core';
import type { CompanyState } from '../../../core';
import { addDays, dateText, money, qtyText, today, useCompany } from '../api';
import { Stat } from '../components/ui';
import { STATUS_NAMES } from './Repairs';
import { TAILOR_STATUS } from './Tailor';
import { Icon } from '../components/icons';
import { DealerBoxCard } from '../components/DealerBox';
import { Modal } from '../components/ui';
import { DASH_CARDS, useDashLayout, type DashLayout } from './dashboard-layout';
import { NAV, navAllowed, type NavItem } from '../nav';

export function Dashboard() {
  const ctx = useCompany();
  const { state, navigate, can, feature, profile, user } = ctx;
  const d = today();
  const month = d.slice(0, 8) + '01';
  const base = state.info!.baseCurrency;

  const data = useMemo(() => {
    const toBase = (minor: number, cur: string, rate: number) => Math.round(minor * rate * 10 ** (state.currencies[base]!.decimals - state.currencies[cur]!.decimals));
    const sumOf = (kind: string, from: string, to = d) =>
      state.invoices.filter((i) => i.kind === kind && !i.voidEntryId && i.date >= from && i.date <= to).reduce((s, i) => s + toBase(i.total, i.currency, i.rate), 0);
    const salesOf = (from: string) => sumOf('sale', from);
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
      yesterdaySales: sumOf('sale', addDays(d, -1), addDays(d, -1)),
      monthPurchases: sumOf('purchase', month),
      monthCount: state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date >= month && i.date <= d).length,
      customers: Object.values(state.parties).filter((p) => p.kind !== 'supplier').length,
      ...(() => {
        const sr = stockReport(state);
        return { low: sr.filter((r) => r.low).slice(0, 15), lowCount: sr.filter((r) => r.low).length, stockValue: sr.reduce((t, r) => t + r.value, 0) };
      })(),
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
  const [layout, setLayout] = useDashLayout(`${state.info?.name ?? ''}:${user.id}`);
  const [customizing, setCustomizing] = useState(false);
  const shown = (card: string) => !layout.hidden.includes(card);
  const weekSales = data.week.reduce((t, w) => t + w.total, 0);
  // كل مربعات الإحصائيات الممكنة (المستخدم بيختار منها)
  const STATS: { id: string; label: string; ok: boolean; el: () => ReactNode }[] = [
    { id: 'todaySales', label: 'مبيعات اليوم', ok: true, el: () => <Stat label="مبيعات اليوم" value={money(state, data.todaySales)} hint={`${data.todayCount} فاتورة`} onClick={() => navigate('reports', 'daily')} /> },
    { id: 'todayProfit', label: 'ربح اليوم', ok: can('costs.view'), el: () => <Stat label="ربح اليوم" value={money(state, data.todayProfit)} tone={data.todayProfit >= 0 ? 'good' : 'bad'} onClick={() => navigate('reports', 'income')} /> },
    { id: 'yesterdaySales', label: 'مبيعات مبارح', ok: true, el: () => <Stat label="مبيعات مبارح" value={money(state, data.yesterdaySales)} onClick={() => navigate('reports', 'daily')} /> },
    { id: 'weekSales', label: 'مبيعات آخر 7 أيام', ok: true, el: () => <Stat label="مبيعات آخر 7 أيام" value={money(state, weekSales)} onClick={() => navigate('reports', 'daily')} /> },
    { id: 'monthSales', label: 'مبيعات الشهر', ok: true, el: () => <Stat label="مبيعات الشهر" value={money(state, data.monthSales)} hint={`${data.monthCount} فاتورة`} onClick={() => navigate('reports', 'income')} /> },
    { id: 'monthProfit', label: 'ربح الشهر', ok: can('costs.view'), el: () => <Stat label="ربح الشهر" value={money(state, data.monthProfit)} tone={data.monthProfit >= 0 ? 'good' : 'bad'} hint="المبيعات − التكلفة − المصاريف" onClick={() => navigate('reports', 'income')} /> },
    { id: 'avgInvoice', label: 'متوسط الفاتورة اليوم', ok: true, el: () => <Stat label="متوسط الفاتورة اليوم" value={money(state, data.todayCount ? Math.round(data.todaySales / data.todayCount) : 0)} onClick={() => navigate('reports', 'daily')} /> },
    { id: 'monthPurchases', label: 'مشتريات الشهر', ok: true, el: () => <Stat label="مشتريات الشهر" value={money(state, data.monthPurchases)} onClick={() => navigate('invoices')} /> },
    { id: 'receivables', label: 'ديون لنا على الناس', ok: true, el: () => <Stat label="ديون لنا على الناس" value={money(state, data.receivables)} onClick={() => navigate('debts')} /> },
    { id: 'payables', label: 'ديون علينا للناس', ok: true, el: () => <Stat label="ديون علينا للناس" value={money(state, data.payables)} onClick={() => navigate('debts')} /> },
    {
      id: 'cash', label: 'النقد في الصناديق', ok: true,
      el: () => (
        <div className="stat clickable" onClick={() => navigate('reports', 'cash')}>
          <span>النقد في الصناديق</span>
          {data.cash.length === 0 ? <strong>0</strong> : data.cash.map(([c, v], i) => <strong key={i}>{money(state, v, c)}</strong>)}
        </div>
      ),
    },
    {
      id: 'usd', label: 'سعر الدولار', ok: true,
      el: () => (
        <div className="stat clickable" onClick={() => can('rates.manage') && navigate('rates')}>
          <span>سعر الدولار</span>
          <strong>{data.usd ? `${data.usd.toLocaleString('en')} ${state.currencies[base]?.symbol}` : 'غير مسجّل'}</strong>
        </div>
      ),
    },
    { id: 'stockValue', label: 'قيمة البضاعة بالمستودع', ok: can('costs.view') && can('reports.stock'), el: () => <Stat label="قيمة البضاعة بالمستودع" value={money(state, data.stockValue)} hint="بسعر التكلفة" onClick={() => navigate('stock')} /> },
    { id: 'lowCount', label: `عدد ${profile.itemsLabel} الناقصة`, ok: can('reports.stock'), el: () => <Stat label={`${profile.itemsLabel} ناقصة`} value={String(data.lowCount)} tone={data.lowCount ? 'bad' : undefined} onClick={() => navigate('stock')} /> },
    { id: 'customers', label: 'عدد الزبائن', ok: true, el: () => <Stat label="عدد الزبائن" value={String(data.customers)} onClick={() => navigate('parties')} /> },
  ];
  const avail = STATS.filter((x) => x.ok);
  // أزرار الشاشة الرئيسية: الافتراضية حسب النشاط، والمستخدم بيضيف أي شاشة تانية أو بيشيل وبيرتّب
  const ACTIONS: { id: string; label: string; icon: string; cls: string; ok: boolean; go: () => void; extra?: boolean }[] = [
    { id: 'pos', label: 'نقطة البيع', icon: 'pos', cls: 'primary big', ok: feature('pos') && can('pos.use'), go: () => navigate('pos') },
    { id: 'restaurant', label: 'الطاولات', icon: 'utensils', cls: 'primary big', ok: feature('tables') && can('restaurant.use'), go: () => navigate('restaurant') },
    { id: 'sitejob', label: 'كشف جديد', icon: 'roller', cls: 'primary big accent', ok: feature('sitejobs') && can('sitejobs.manage'), go: () => navigate('sitejob') },
    { id: 'sitejobs', label: 'المشاريع', icon: 'ruler', cls: 'primary big', ok: feature('sitejobs') && can('sitejobs.manage'), go: () => navigate('sitejobs') },
    { id: 'shipments', label: 'الشحنات', icon: 'container', cls: 'primary big accent', ok: feature('shipments') && can('shipments.manage'), go: () => navigate('shipments') },
    { id: 'stoneblocks', label: 'الكتل والقص', icon: 'mountain', cls: 'primary big accent', ok: feature('stoneblocks') && (can('production.manage') || can('purchases.create')), go: () => navigate('stoneblocks') },
    { id: 'woodlots', label: 'حمولات الحطب', icon: 'tree', cls: 'primary big accent', ok: feature('woodlots'), go: () => navigate('woodlots') },
    { id: 'formulas', label: 'الخلطات والتصنيع', icon: 'flask', cls: 'primary big accent', ok: feature('production') && feature('recipes') && (can('production.manage') || can('items.manage')), go: () => navigate('formulas') },
    { id: 'bookings', label: 'حجوزات الصالة', icon: 'calendar', cls: 'primary big accent', ok: feature('hallbookings') && can('bookings.manage'), go: () => navigate('bookings') },
    { id: 'dealers', label: 'الموردين', icon: 'users', cls: 'primary big accent', ok: feature('dealers') && can('dealers.manage'), go: () => navigate('dealers') },
    { id: 'lists', label: 'النشرات والحسومات', icon: 'file', cls: 'primary big accent', ok: feature('listPricing') && can('items.manage'), go: () => navigate('lists') },
    { id: 'pricelist', label: 'نشرة الأسعار', icon: 'file', cls: 'primary big accent', ok: feature('priceList'), go: () => navigate('pricelist') },
    { id: 'solar', label: 'منظومات الطاقة الشمسية', icon: 'sun', cls: 'primary big accent', ok: feature('solar') && can('solar.manage'), go: () => navigate('solar') },
    { id: 'printjobs', label: 'طلبات الطباعة', icon: 'printer', cls: 'primary big accent', ok: feature('printjobs') && can('printjobs.manage'), go: () => navigate('printjobs') },
    { id: 'poultry', label: 'تسعيرة اليوم والحمولات', icon: 'drumstick', cls: 'primary big accent', ok: feature('poultry'), go: () => navigate('poultry') },
    { id: 'tailor-order', label: 'طلب تفصيل جديد', icon: 'scissors', cls: 'primary big accent', ok: feature('tailoring') && can('tailoring.manage'), go: () => navigate('tailor-order') },
    { id: 'sale', label: 'فاتورة مبيع', icon: 'plus', cls: 'primary big', ok: can('sales.create'), go: () => navigate('sale') },
    { id: 'repair', label: 'أمر صيانة', icon: 'wrench', cls: 'primary big accent', ok: feature('repairs') && can('repairs.manage'), go: () => navigate('repair') },
    { id: 'appointments', label: 'المواعيد', icon: 'calendar', cls: 'primary big accent', ok: feature('appointments') && can('appointments.manage'), go: () => navigate('appointments') },
    { id: 'quote', label: 'عرض سعر', icon: 'file', cls: 'big', ok: can('sales.create'), go: () => navigate('quote') },
    { id: 'purchase', label: 'فاتورة شراء', icon: 'purchase', cls: 'big', ok: can('purchases.create'), go: () => navigate('purchase') },
    { id: 'cashbox', label: 'الصندوق', icon: 'wallet', cls: 'big', ok: can('reports.financial') || can('vouchers.create'), go: () => navigate('cashbox') },
    { id: 'debts', label: 'الديون', icon: 'debts', cls: 'big', ok: can('vouchers.create'), go: () => navigate('debts') },
    { id: 'vouchers', label: 'سند قبض / دفع', icon: 'wallet', cls: 'big', ok: can('vouchers.create'), go: () => navigate('vouchers') },
    { id: 'addStock', label: 'إضافة بضاعة', icon: 'package', cls: 'big', ok: can('stock.adjust'), go: () => navigate('stock', 'add'), extra: true },
    { id: 'count', label: 'الجرد', icon: 'check', cls: 'big', ok: can('stock.adjust'), go: () => navigate('stock', 'count'), extra: true },
    ...NAV.filter((n): n is NavItem => typeof n !== 'string' && n.key !== 'dashboard' && navAllowed(n, ctx)).map((n) => ({ id: `nav:${n.key}`, label: n.label, icon: n.icon, cls: 'big', ok: true, go: () => navigate(n.key), extra: true })),
  ];
  const availActions = ACTIONS.filter((x) => x.ok).filter((x, i, arr) => !x.id.startsWith('nav:') || !arr.some((y) => !y.extra && y.id === x.id.slice(4)));
  const visibleActions = (layout.actions ?? availActions.filter((x) => !x.extra).map((x) => x.id)).map((id) => availActions.find((x) => x.id === id)).filter((x): x is (typeof ACTIONS)[number] => !!x);
  const visibleStats = layout.stats.map((id) => avail.find((x) => x.id === id)).filter((x): x is (typeof STATS)[number] => !!x);

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
        <button className="ghost dash-customize" onClick={() => setCustomizing(true)} title="اختار الأزرار والإحصائيات اللي بدك ياها بالشاشة الرئيسية">
          <Icon name="customize" size={18} /> تخصيص الشاشة
        </button>
      </div>

      <div className="quick-actions">
        {visibleActions.map((x) => (
          <button key={x.id} className={x.cls} onClick={x.go}>
            <Icon name={x.icon} size={20} /> {x.label}
          </button>
        ))}
      </div>

      <DealerBoxCard />

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
        <>
          {visibleStats.length > 0 && <div className="stats">{visibleStats.map((x) => <Fragment key={x.id}>{x.el()}</Fragment>)}</div>}
        </>
      )}
      {customizing && <CustomizeDash fin={fin} actions={availActions} avail={avail} layout={layout} cards={DASH_CARDS} defaultActions={availActions.filter((x) => !x.extra).map((x) => x.id)} onSave={(l) => setLayout(l)} onReset={() => setLayout(null)} onClose={() => setCustomizing(false)} />}

      {fin && can('costs.view') && shown('dailyProfit') && <DailyProfitCard />}

      {fin && (
        <div className="two-col">
          {shown('week') && <section className="card clickable" onClick={() => navigate('reports', 'daily')}>
            <h3>
              <Icon name="chart" size={16} /> مبيعات آخر 7 أيام
            </h3>
            <WeekBars state={state} week={data.week} today={d} />
          </section>}
          {shown('top') && <section className="card">
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
          </section>}
          {shown('dueDebts') && data.dueDebts.length > 0 && (
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
        {can('reports.stock') && shown('low') && (
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
        {shown('expiring') && data.expiring.length > 0 && (
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
/** نافذة التخصيص: تعليم المربعات وترتيبها، وإخفاء البطاقات. */
/** قائمة بتختار منها شو يبين وبأي ترتيب (أزرار أو إحصائيات). */
function PickList({ avail, on, onChange }: { avail: { id: string; label: string }[]; on: string[]; onChange: (ids: string[]) => void }) {
  const ids = avail.map((a) => a.id);
  const shown = on.filter((s) => ids.includes(s));
  const off = avail.filter((a) => !shown.includes(a.id));
  const label = (id: string) => avail.find((a) => a.id === id)?.label ?? id;
  const move = (i: number, dir: number) => {
    const n = [...shown];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    onChange(n);
  };
  return (
    <>
      {shown.length === 0 && <p className="muted">ما في شي ظاهر.</p>}
      <ul className="dash-pick">
        {shown.map((id, i) => (
          <li key={id}>
            <label className="check">
              <input type="checkbox" checked onChange={() => onChange(shown.filter((x) => x !== id))} /> {label(id)}
            </label>
            <span className="dash-move">
              <button type="button" className="ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="لفوق">▲</button>
              <button type="button" className="ghost small" disabled={i === shown.length - 1} onClick={() => move(i, 1)} aria-label="لتحت">▼</button>
            </span>
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <details className="dash-more" open={off.length <= 12}>
          <summary>تقدر تضيف ({off.length})</summary>
          <ul className="dash-pick">
            {off.map((a) => (
              <li key={a.id}>
                <label className="check">
                  <input type="checkbox" checked={false} onChange={() => onChange([...shown, a.id])} /> {a.label}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function CustomizeDash({ fin, actions, defaultActions, avail, layout, cards, onSave, onReset, onClose }: { fin: boolean; actions: { id: string; label: string }[]; defaultActions: string[]; avail: { id: string; label: string }[]; layout: DashLayout; cards: { id: string; label: string }[]; onSave: (l: DashLayout) => void; onReset: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<'actions' | 'stats' | 'cards'>('actions');
  const statIds = avail.map((a) => a.id);
  return (
    <Modal title="تخصيص الشاشة الرئيسية" onClose={onClose}>
      <p className="muted">اختار شو بدك تشوف بالشاشة الرئيسية ورتّبه بالأسهم. التخصيص إلك إنت بس وعلى هالجهاز.</p>
      <div className="segmented">
        <button type="button" className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>الأزرار السريعة</button>
        {fin && <button type="button" className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>الإحصائيات</button>}
        {fin && <button type="button" className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>البطاقات</button>}
      </div>
      {tab === 'actions' && <PickList avail={actions} on={layout.actions ?? defaultActions} onChange={(ids) => onSave({ ...layout, actions: ids })} />}
      {tab === 'stats' && fin && <PickList avail={avail} on={layout.stats} onChange={(ids) => onSave({ ...layout, stats: [...ids, ...layout.stats.filter((s) => !statIds.includes(s))] })} />}
      {tab === 'cards' && fin && (
        <ul className="dash-pick">
          {cards.map((c) => (
            <li key={c.id}>
              <label className="check">
                <input type="checkbox" checked={!layout.hidden.includes(c.id)} onChange={(e) => onSave({ ...layout, hidden: e.target.checked ? layout.hidden.filter((h) => h !== c.id) : [...layout.hidden, c.id] })} /> {c.label}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="form-actions">
        <button type="button" onClick={onReset}>رجّع الافتراضي</button>
        <button type="button" className="primary" onClick={onClose}>تم</button>
      </div>
    </Modal>
  );
}

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

/** الربح اليومي: كل يوم شقد بعت، شقد كلّفت البضاعة، المصاريف والتالف، وصافي الربح أو الخسارة. من القيود نفسها فبيشمل كل الأقسام. */
function DailyProfitCard() {
  const { state, navigate } = useCompany();
  const d = today();
  const [day, setDay] = useState(d);
  const days = useMemo(() => dailyProfit(state, addDays(d, -29), d), [state, d]);
  const sel = days.find((x) => x.date === day) ?? { date: day, revenue: 0, cogs: 0, losses: 0, expenses: 0, gross: 0, net: 0 };
  const loss = sel.net < 0;
  const max = Math.max(1, ...days.slice(0, 14).map((x) => Math.abs(x.net)));
  const row = (label: string, v: number, cls = '', sign = '') => (
    <>
      <span>{label}</span>
      <strong className={cls}>
        {sign}
        {money(state, Math.abs(v))}
      </strong>
    </>
  );
  return (
    <section className="card daily-profit">
      <div className="dp-head">
        <h3>
          <Icon name="trend" size={16} /> الربح اليومي
        </h3>
        <div className="dp-nav">
          <button className="icon" title="اليوم اللي قبل" onClick={() => setDay(addDays(day, -1))}>
            <Icon name="prev" size={16} />
          </button>
          <input type="date" value={day} max={d} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button className="icon" title="اليوم اللي بعد" disabled={day >= d} onClick={() => setDay(addDays(day, 1))}>
            <Icon name="next" size={16} />
          </button>
        </div>
      </div>
      <div className="dp-body">
        <div className={`dp-net ${loss ? 'bad' : 'good'}`} onClick={() => navigate('reports', 'income')}>
          <span>{day === d ? (loss ? 'خسارة اليوم' : 'ربح اليوم') : `${loss ? 'خسارة' : 'ربح'} ${dateText(day)}`}</span>
          <b>{money(state, Math.abs(sel.net))}</b>
          {sel.revenue > 0 && <small>{Math.round((sel.net / sel.revenue) * 100)}% من المبيعات</small>}
        </div>
        <div className="kv dp-kv">
          {row('المبيعات والإيرادات', sel.revenue)}
          {row('تكلفة البضاعة', sel.cogs, '', '− ')}
          {row('الربح الإجمالي', sel.gross, sel.gross < 0 ? 'bad' : 'good')}
          {sel.losses !== 0 && row('تالف وفروقات جرد', sel.losses, 'bad', '− ')}
          {row('المصاريف', sel.expenses, '', '− ')}
          {row(loss ? 'صافي الخسارة' : 'صافي الربح', sel.net, loss ? 'bad' : 'good')}
        </div>
      </div>
      <div className="dp-days">
        {days.slice(0, 14).map((x) => (
          <button key={x.date} className={`dp-day ${x.date === day ? 'on' : ''}`} onClick={() => setDay(x.date)} title={`${dateText(x.date)}: ${money(state, x.net)}`}>
            <i className={x.net < 0 ? 'bad' : 'good'} style={{ height: `${Math.max(4, (Math.abs(x.net) / max) * 46)}px` }} />
            <small>{x.date.slice(8)}/{x.date.slice(5, 7)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
