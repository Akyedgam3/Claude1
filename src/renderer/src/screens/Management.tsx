// «لوحة الإدارة» (2.0): صورة كاملة عن الشغل لأي فترة، مع مقارنة بالفترة اللي قبلها، وملاحظات مكتوبة لحالها،
// واتجاه المبيعات والربح، ساعات وأيام الذروة، الأفضل والأضعف، المصاريف، الصناديق والديون.
// قراءة بس: ما في ولا عملية بتتغيّر من هون، وكل رقم بيفتح تقريره.
import { useEffect, useMemo, useState } from 'react';
import {
  agingTotals,
  balancesByCurrency,
  cashBoxes,
  change,
  expenseBreakdown,
  kpis,
  paymentMix,
  positions,
  presetRange,
  previousRange,
  rangeDays,
  salesRhythm,
  slowItems,
  stockReport,
  topCustomers,
  topItems,
  topUsers,
  trend,
  type Kpis,
  type Range,
} from '../../../core';
import { dateText, money, qtyText, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, PrintButtons } from '../components/print';
import { PageHeader } from '../components/ui';
import { markSeen } from './Learn';

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'اليوم' },
  { id: 'yesterday', label: 'مبارح' },
  { id: 'week', label: '7 أيام' },
  { id: 'month', label: 'هالشهر' },
  { id: 'lastMonth', label: 'الشهر الماضي' },
  { id: 'quarter', label: '90 يوم' },
  { id: 'year', label: 'هالسنة' },
  { id: 'custom', label: 'فترة بتختارها' },
];
const WEEKDAYS = ['الأحد', 'الاتنين', 'التلاتا', 'الأربعا', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['كانون التاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين التاني', 'كانون الأول'];

function loadPreset(): Preset {
  try {
    const v = localStorage.getItem('wazn.mgmt.preset');
    return (PRESETS.some((p) => p.id === v) ? v : 'month') as Preset;
  } catch {
    return 'month';
  }
}

export function Management() {
  const { state, can, navigate, profile } = useCompany();
  const d = today();
  const [preset, setPreset] = useState<Preset>(loadPreset);
  useEffect(() => markSeen('management'), []);
  const [custom, setCustom] = useState<Range>(() => presetRange('month', d));
  const [compare, setCompare] = useState(true);
  const [itemsBy, setItemsBy] = useState<'revenue' | 'profit' | 'qty'>('revenue');
  const range: Range = preset === 'custom' ? (custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }) : presetRange(preset, d);
  const prev = previousRange(range);
  const pickPreset = (p: Preset) => {
    setPreset(p);
    try {
      localStorage.setItem('wazn.mgmt.preset', p);
    } catch {
      /* ما في تخزين */
    }
  };

  const profits = can('profits.view');
  const costs = can('costs.view');
  const balances = can('balances.view');
  const stockOk = can('reports.stock');

  const data = useMemo(() => {
    const now = kpis(state, range);
    const before = kpis(state, prev);
    const rhythm = salesRhythm(state, range);
    const sr = stockReport(state);
    return {
      now,
      before,
      pos: positions(state, range.to),
      posBefore: positions(state, prev.to),
      trend: trend(state, range),
      rhythm,
      items: { revenue: topItems(state, range, 'revenue'), profit: topItems(state, range, 'profit'), qty: topItems(state, range, 'qty') },
      customers: topCustomers(state, range),
      users: topUsers(state, range),
      slow: slowItems(state, range, 6),
      mix: paymentMix(state, range),
      expenses: expenseBreakdown(state, range),
      aging: agingTotals(state, d),
      boxes: cashBoxes(state).filter((a) => !a.hidden),
      low: sr.filter((r) => r.low).length,
      stockValue: sr.reduce((t, r) => t + r.value, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, range.from, range.to, d]);

  const m = (v: number) => money(state, v);
  const { now, before } = data;
  const notes = useMemo(() => insights(now, before, data.rhythm, data.aging.buckets[3], data.low, data.slow.length, { profits, compare }), [now, before, data, profits, compare]);

  return (
    <div className="page mgmt">
      <PageHeader title="لوحة الإدارة">
        <PrintButtons kind="report" name={`لوحة الإدارة ${dateText(range.from)} - ${dateText(range.to)}`} papers={['a4']} />
      </PageHeader>

      <section className="card mgmt-bar no-print">
        <div className="mgmt-presets" role="group" aria-label="الفترة">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={preset === p.id ? 'active' : ''} onClick={() => pickPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="mgmt-range">
          {preset === 'custom' ? (
            <>
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="من" />
              <span>لـ</span>
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="لـ" />
            </>
          ) : (
            <span className="muted">
              {dateText(range.from)} {range.from !== range.to && <>لـ {dateText(range.to)}</>} ({rangeDays(range)} يوم)
            </span>
          )}
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> قارن مع الفترة اللي قبلها
          </label>
        </div>
      </section>

      <div className="print-area">
        <DocHeader title="لوحة الإدارة">
          <div className="ltr">{`${dateText(range.from)} - ${dateText(range.to)}`}</div>
        </DocHeader>

        {notes.length > 0 && (
          <section className="card mgmt-notes">
            <h3>
              <Icon name="sparkles" size={18} /> شو بيقول شغلك بهالفترة
            </h3>
            <ul>
              {notes.map((n, i) => (
                <li key={i} className={n.tone}>
                  {n.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mgmt-kpis">
          <Kpi label="صافي المبيعات" value={m(now.netSales)} now={now.netSales} before={before.netSales} compare={compare} hint={now.returns ? `بعد مرتجعات ${m(now.returns)}` : `${now.invoices} فاتورة`} onClick={() => navigate('reports', 'daily')} />
          {profits && <Kpi label="صافي الربح" value={m(now.net)} now={now.net} before={before.net} compare={compare} tone={now.net >= 0 ? 'good' : 'bad'} hint={`هامش ${now.margin}%`} onClick={() => navigate('reports', 'income')} />}
          {profits && <Kpi label="مجمل الربح" value={m(now.gross)} now={now.gross} before={before.gross} compare={compare} hint="المبيعات − تكلفة البضاعة" onClick={() => navigate('reports', 'income')} />}
          <Kpi label="عدد الفواتير" value={String(now.invoices)} now={now.invoices} before={before.invoices} compare={compare} onClick={() => navigate('invoices')} />
          <Kpi label="متوسط الفاتورة" value={m(now.avgInvoice)} now={now.avgInvoice} before={before.avgInvoice} compare={compare} />
          <Kpi label="زباين اشتروا" value={String(now.customers)} now={now.customers} before={before.customers} compare={compare} hint={now.newCustomers ? `منهن ${now.newCustomers} جداد` : undefined} onClick={() => navigate('parties')} />
          {profits && <Kpi label="المصاريف" value={m(now.expenses + now.losses)} now={now.expenses + now.losses} before={before.expenses + before.losses} compare={compare} invert hint={now.losses ? `منها تالف ${m(now.losses)}` : undefined} onClick={() => navigate('reports', 'income')} />}
          {can('purchases.view') && <Kpi label="المشتريات" value={m(now.purchases)} now={now.purchases} before={before.purchases} compare={compare} neutral onClick={() => navigate('invoices')} />}
          <Kpi label="داخل للصناديق" value={m(now.cashIn)} now={now.cashIn} before={before.cashIn} compare={compare} hint={`طالع ${m(now.cashOut)}`} onClick={() => navigate('cashbox')} />
          {balances && <Kpi label="الأموال الجاهزة" value={m(data.pos.cash)} now={data.pos.cash} before={data.posBefore.cash} compare={compare} hint="الصناديق والبنك بآخر الفترة" onClick={() => navigate('cashbox')} />}
          {balances && <Kpi label="لنا عند الزباين" value={m(data.pos.receivables)} now={data.pos.receivables} before={data.posBefore.receivables} compare={compare} invert hint="بآخر الفترة" onClick={() => navigate('debts')} />}
          {balances && <Kpi label="علينا للموردين" value={m(data.pos.payables)} now={data.pos.payables} before={data.posBefore.payables} compare={compare} invert hint="بآخر الفترة" onClick={() => navigate('debts')} />}
          {balances && <Kpi label="انباع بالدين" value={m(now.credit)} now={now.credit} before={before.credit} compare={compare} invert onClick={() => navigate('debts')} />}
        </div>

        <section className="card">
          <div className="mgmt-head">
            <h3>{profits ? 'المبيعات وصافي الربح' : 'المبيعات'}</h3>
            <div className="mgmt-legend">
              <span className="lg-rev">المبيعات</span>
              {profits && <span className="lg-net">صافي الربح</span>}
            </div>
          </div>
          <TrendChart points={data.trend} showNet={profits} fmt={m} />
        </section>

        <div className="mgmt-grid">
          <section className="card">
            <div className="mgmt-head">
              <h3>الأكتر مبيعاً</h3>
              <div className="mgmt-seg">
                <button type="button" className={itemsBy === 'revenue' ? 'active' : ''} onClick={() => setItemsBy('revenue')}>
                  بالمبلغ
                </button>
                {profits && (
                  <button type="button" className={itemsBy === 'profit' ? 'active' : ''} onClick={() => setItemsBy('profit')}>
                    بالربح
                  </button>
                )}
                <button type="button" className={itemsBy === 'qty' ? 'active' : ''} onClick={() => setItemsBy('qty')}>
                  بالكمية
                </button>
              </div>
            </div>
            <Bars rows={data.items[itemsBy].map((r) => ({ id: r.id, name: r.name, value: r.value, label: itemsBy === 'qty' ? qtyText(r.value) : m(r.value), sub: itemsBy !== 'profit' && profits ? `ربح ${m(r.profit)}` : undefined }))} empty="ما في مبيعات بهالفترة" onRow={() => navigate('reports', 'items')} />
          </section>

          <section className="card">
            <h3>أفضل الزباين</h3>
            <Bars rows={data.customers.map((r) => ({ id: r.id, name: r.name, value: r.value, label: m(r.value), sub: `${r.extra} فاتورة` }))} empty="ما في مبيعات لزباين بأسماءهن" onRow={() => navigate('parties')} />
          </section>

          <section className="card">
            <h3>ساعات الذروة</h3>
            <HourChart hours={data.rhythm.hours} fmt={m} />
          </section>

          <section className="card">
            <h3>أيام الأسبوع</h3>
            <Bars rows={data.rhythm.weekdays.map((v, i) => ({ id: String(i), name: WEEKDAYS[i]!, value: v, label: m(v) })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value)} empty="ما في مبيعات بهالفترة" />
          </section>

          <section className="card">
            <h3>طرق الدفع</h3>
            <Split
              parts={[
                { label: 'نقدي كامل', value: data.mix.cash, cls: 'p-cash' },
                { label: 'جزء نقدي', value: data.mix.partial, cls: 'p-part' },
                { label: 'دين كامل', value: data.mix.credit, cls: 'p-credit' },
              ]}
              fmt={m}
            />
          </section>

          {profits && (
            <section className="card">
              <h3>وين راحت المصاريف</h3>
              <Bars rows={data.expenses.map((r) => ({ id: r.id, name: r.name, value: r.value, label: m(r.value) }))} empty="ما في مصاريف مسجّلة بهالفترة" onRow={() => navigate('reports', 'income')} />
            </section>
          )}

          {data.users.length > 1 && (
            <section className="card">
              <h3>مبيعات الموظفين</h3>
              <Bars rows={data.users.map((r) => ({ id: r.id, name: r.name, value: r.value, label: m(r.value), sub: `${r.extra} فاتورة` }))} empty="" />
            </section>
          )}

          {balances && (
            <section className="card clickable" onClick={() => navigate('debts')}>
              <h3>أعمار ديون الزباين</h3>
              {data.aging.total === 0 ? (
                <p className="muted">ما في ديون على حدا.</p>
              ) : (
                <>
                  <Split
                    parts={[
                      { label: 'لحد شهر', value: data.aging.buckets[0], cls: 'a0' },
                      { label: 'شهر لشهرين', value: data.aging.buckets[1], cls: 'a1' },
                      { label: 'شهرين لتلاتة', value: data.aging.buckets[2], cls: 'a2' },
                      { label: 'أكتر من 3 أشهر', value: data.aging.buckets[3], cls: 'a3' },
                    ]}
                    fmt={m}
                  />
                  <p className="muted">
                    المجموع {m(data.aging.total)} على {data.aging.parties} زبون.
                  </p>
                </>
              )}
            </section>
          )}

          {balances && (
            <section className="card clickable" onClick={() => navigate('cashbox')}>
              <h3>الصناديق هلق</h3>
              <ul className="mgmt-boxes">
                {data.boxes.map((b) =>
                  Object.entries(balancesByCurrency(state, b.id)).map(([cur, v]) => (
                    <li key={b.id + cur}>
                      <span>{b.name}</span>
                      <b className={v < 0 ? 'bad' : ''}>{money(state, v, cur)}</b>
                    </li>
                  )),
                )}
              </ul>
            </section>
          )}

          {stockOk && (
            <section className="card clickable" onClick={() => navigate('stock')}>
              <h3>{profile.itemsLabel} ما انباعت بهالفترة</h3>
              {data.slow.length === 0 ? (
                <p className="muted">كل البضاعة اللي عندك تحرّكت.</p>
              ) : (
                <ul className="mgmt-boxes">
                  {data.slow.map((s) => (
                    <li key={s.id}>
                      <span>
                        {s.name} <small className="muted">({qtyText(s.qty)}، آخر بيع {s.lastSale ? dateText(s.lastSale) : 'ولا مرة'})</small>
                      </span>
                      {costs && <b>{m(s.value)}</b>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted">
                {data.low ? `${data.low} ${profile.itemsLabel} تحت الحد الأدنى. ` : ''}
                {costs ? `قيمة البضاعة كلها ${m(data.stockValue)}.` : ''}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, now, before, compare, hint, tone, invert, neutral, onClick }: { label: string; value: string; now: number; before: number; compare: boolean; hint?: string | undefined; tone?: 'good' | 'bad'; invert?: boolean; neutral?: boolean; onClick?: () => void }) {
  const ch = change(now, before);
  const up = ch !== null && ch > 0;
  const good = neutral || ch === null || ch === 0 ? '' : up !== !!invert ? 'up' : 'down';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag {...(onClick ? { type: 'button' as const, onClick } : {})} className={`mgmt-kpi ${onClick ? 'clickable' : ''}`}>
      <small>{label}</small>
      <b className={tone ?? ''}>{value}</b>
      <span className="mgmt-kpi-foot">
        {compare && ch !== null && (
          <em className={`delta ${good}`}>
            {up ? '▲' : ch < 0 ? '▼' : '='} {Math.abs(ch)}%
          </em>
        )}
        {compare && ch === null && now !== 0 && <em className="delta">جديد</em>}
        {hint && <span className="muted">{hint}</span>}
      </span>
    </Tag>
  );
}

function TrendChart({ points, showNet, fmt }: { points: { key: string; revenue: number; net: number }[]; showNet: boolean; fmt: (v: number) => string }) {
  const W = 760;
  const H = 220;
  const pad = 8;
  const max = Math.max(1, ...points.map((p) => p.revenue), ...(showNet ? points.map((p) => p.net) : []));
  const min = Math.min(0, ...(showNet ? points.map((p) => p.net) : [0]));
  const span = max - min || 1;
  const y = (v: number) => pad + (H - 2 * pad) * (1 - (v - min) / span);
  const n = points.length;
  const bw = (W - 2 * pad) / Math.max(1, n);
  const x = (i: number) => W - pad - bw * (i + 0.5); // من اليمين لليسار
  const label = (k: string) => (k.length === 7 ? MONTHS[Number(k.slice(5)) - 1]! : String(Number(k.slice(8))));
  const every = Math.max(1, Math.ceil(n / 12));
  if (!points.some((p) => p.revenue || p.net)) return <p className="muted">ما في حركة بهالفترة.</p>;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ');
  return (
    <div className="mgmt-chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="المبيعات وصافي الربح">
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} className="axis" />
        {points.map((p, i) => (
          <g key={p.key}>
            <rect x={x(i) - bw * 0.36} width={bw * 0.72} y={Math.min(y(p.revenue), y(0))} height={Math.abs(y(0) - y(p.revenue))} rx={Math.min(4, bw * 0.2)} className="bar-rev">
              <title>{`${p.key.length === 7 ? label(p.key) : dateText(p.key)}: مبيعات ${fmt(p.revenue)}${showNet ? `، ربح ${fmt(p.net)}` : ''}`}</title>
            </rect>
            {i % every === 0 && (
              <text x={x(i)} y={H + 16} className="tick" textAnchor="middle">
                {label(p.key)}
              </text>
            )}
          </g>
        ))}
        {showNet && n > 1 && <path d={line} className="line-net" />}
        {showNet &&
          points.map((p, i) => (
            <circle key={p.key} cx={x(i)} cy={y(p.net)} r={n > 40 ? 1.8 : 3} className={p.net < 0 ? 'dot-neg' : 'dot-net'}>
              <title>{`ربح ${fmt(p.net)}`}</title>
            </circle>
          ))}
      </svg>
    </div>
  );
}

function HourChart({ hours, fmt }: { hours: number[]; fmt: (v: number) => string }) {
  const max = Math.max(...hours);
  if (!max) return <p className="muted">ما في مبيعات بهالفترة.</p>;
  const peak = hours.indexOf(max);
  return (
    <>
      <div className="mgmt-hours">
        {hours.map((v, h) => (
          <i key={h} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} className={h === peak ? 'peak' : ''} title={`${h}:00 — ${fmt(v)}`} />
        ))}
      </div>
      <div className="mgmt-hours-axis">
        <span>12 الليل</span>
        <span>6 الصبح</span>
        <span>12 الضهر</span>
        <span>6 المسا</span>
      </div>
      <p className="muted">أكتر ساعة بيع: {hourText(peak)}</p>
    </>
  );
}

function Bars({ rows, empty, onRow }: { rows: { id: string; name: string; value: number; label: string; sub?: string | undefined }[]; empty: string; onRow?: () => void }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className={`mgmt-bars ${onRow ? 'clickable' : ''}`} onClick={onRow}>
      {rows.map((r) => (
        <li key={r.id}>
          <div className="mgmt-bar-top">
            <span>{r.name}</span>
            <b>{r.label}</b>
          </div>
          <i style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          {r.sub && <small className="muted">{r.sub}</small>}
        </li>
      ))}
    </ol>
  );
}

function Split({ parts, fmt }: { parts: { label: string; value: number; cls: string }[]; fmt: (v: number) => string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (!total) return <p className="muted">ما في حركة بهالفترة.</p>;
  return (
    <>
      <div className="mgmt-split">
        {parts.map((p) => (p.value > 0 ? <i key={p.label} className={p.cls} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${fmt(p.value)}`} /> : null))}
      </div>
      <ul className="mgmt-split-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i className={p.cls} />
            <span>{p.label}</span>
            <b>{fmt(p.value)}</b>
            <small className="muted">{Math.round((p.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </>
  );
}

function hourText(h: number): string {
  const part = h < 5 ? 'بالليل' : h < 12 ? 'الصبح' : h < 15 ? 'الضهر' : h < 18 ? 'العصر' : 'المسا';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const n = (h + 1) % 12 === 0 ? 12 : (h + 1) % 12;
  return `من ${h12} لـ ${n} ${part}`;
}

/** ملاحظات مكتوبة: أهم شي لازم ينتبهلو صاحب المحل بالفترة */
function insights(now: Kpis, before: Kpis, rhythm: { hours: number[]; weekdays: number[] }, oldDebts: number, low: number, slow: number, o: { profits: boolean; compare: boolean }): { text: string; tone: 'good' | 'bad' | '' }[] {
  const out: { text: string; tone: 'good' | 'bad' | '' }[] = [];
  const pct = (v: number | null) => (v === null ? '' : `${Math.abs(v)}%`);
  if (o.compare) {
    const s = change(now.netSales, before.netSales);
    if (s !== null && Math.abs(s) >= 5) out.push({ text: `المبيعات ${s > 0 ? 'طلعت' : 'نزلت'} ${pct(s)} عن الفترة اللي قبل.`, tone: s > 0 ? 'good' : 'bad' });
    if (o.profits) {
      const p = change(now.net, before.net);
      if (p !== null && Math.abs(p) >= 5) out.push({ text: `صافي الربح ${p > 0 ? 'زاد' : 'قل'} ${pct(p)}.`, tone: p > 0 ? 'good' : 'bad' });
    }
    const a = change(now.avgInvoice, before.avgInvoice);
    if (a !== null && Math.abs(a) >= 10) out.push({ text: `الزبون صار يشتري ${a > 0 ? 'أكتر' : 'أقل'} بالفاتورة الوحدة (${pct(a)}).`, tone: a > 0 ? 'good' : '' });
  }
  if (o.profits && now.revenue > 0 && now.net < 0) out.push({ text: 'الفترة خسرانة: المصاريف والتكلفة أكتر من المبيعات. شوف «وين راحت المصاريف».', tone: 'bad' });
  const wd = rhythm.weekdays.indexOf(Math.max(...rhythm.weekdays));
  if (rhythm.weekdays[wd]! > 0 && rhythm.weekdays.filter((v) => v > 0).length > 2) out.push({ text: `أقوى يوم بيع عندك: ${WEEKDAYS[wd]}.`, tone: '' });
  const hp = rhythm.hours.indexOf(Math.max(...rhythm.hours));
  if (rhythm.hours[hp]! > 0) out.push({ text: `الذروة ${hourText(hp)}: خلّي الكاشير والبضاعة جاهزين بهالوقت.`, tone: '' });
  if (now.newCustomers > 0) out.push({ text: `${now.newCustomers} زبون جديد اشترى لأول مرة.`, tone: 'good' });
  if (now.sales > 0 && now.credit / now.sales > 0.4) out.push({ text: `${Math.round((now.credit / now.sales) * 100)}% من المبيعات انباعت بالدين. انتبه للتحصيل.`, tone: 'bad' });
  if (oldDebts > 0) out.push({ text: 'في ديون صرلها أكتر من 3 أشهر. ذكّر أصحابها من «الديون».', tone: 'bad' });
  if (low > 0) out.push({ text: `${low} مادة تحت الحد الأدنى بالمخزون.`, tone: 'bad' });
  if (slow > 0) out.push({ text: 'في بضاعة ما انباعت ولا مرة بهالفترة: فكّر بعرض أو تخفيض.', tone: '' });
  return out.slice(0, 7);
}
