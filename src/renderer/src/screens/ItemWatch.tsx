// مراقبة المواد: لكل مادة كم انباع منها وكم ربحت أو خسرت فيها بالفترة، وبالكبس عليها كل حركاتها
// (فواتير بيع وشراء ومرتجعات وجرد وتالف) بالتاريخ مع الرصيد بعد كل حركة.
import { useMemo, useState } from 'react';
import { itemMovements, itemsSummary, type ItemSummary } from '../../../core';
import { dateText, major, money, qtyText, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { Empty, ItemName, itemMatches, PageHeader, SearchBox, Stat } from '../components/ui';
import { asPeriod, PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { Icon } from '../components/icons';

type Sort = 'profit' | 'loss' | 'sales' | 'qty' | 'name' | 'stock';
type Show = 'all' | 'sold' | 'loss' | 'nocost';

const pct = (profit: number, revenue: number) => (revenue ? `${Math.round((profit / revenue) * 1000) / 10}%` : '—');

export function ItemWatch({ initialItem }: { initialItem?: string } = {}) {
  const { state, can } = useCompany();
  const [period, setPeriod] = usePeriod('month');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('profit');
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(initialItem && state.items[initialItem] ? initialItem : null);
  const showCost = can('costs.view');
  const p = asPeriod(period);
  const all = useMemo(() => itemsSummary(state, p), [state, p.from, p.to]);
  const categories = useMemo(() => [...new Set(Object.values(state.items).map((i) => i.category).filter(Boolean) as string[])].sort(), [state.items]);

  const rows = useMemo(() => {
    const list = all.filter((r) => itemMatches(r.item, query) && (!category || r.item.category === category)).filter((r) => (show === 'sold' ? r.soldQty !== 0 : show === 'loss' ? r.profit < 0 : show === 'nocost' ? r.noCost : true));
    const by: Record<Sort, (a: ItemSummary, b: ItemSummary) => number> = {
      profit: (a, b) => b.profit - a.profit,
      loss: (a, b) => a.profit - b.profit,
      sales: (a, b) => b.revenue - a.revenue,
      qty: (a, b) => b.soldQty - a.soldQty,
      stock: (a, b) => b.closing - a.closing,
      name: (a, b) => a.item.name.localeCompare(b.item.name, 'ar'),
    };
    return list.sort(by[sort]);
  }, [all, query, category, sort, show]);

  const t = rows.reduce((s, r) => ({ revenue: s.revenue + r.revenue, cost: s.cost + r.cost, profit: s.profit + r.profit }), { revenue: 0, cost: 0, profit: 0 });
  const losing = all.filter((r) => r.profit < 0).length;
  const noCost = all.filter((r) => r.noCost).length;

  if (open && state.items[open]) return <ItemDetail itemId={open} onBack={() => setOpen(null)} period={period} setPeriod={setPeriod} />;

  return (
    <div className="page">
      <PageHeader title="مراقبة المواد" />
      <p className="muted">كل مادة: قديش انباع منها، وقديش ربحت أو خسرت فيها (البيع بعد الخصم ناقص تكلفة البضاعة)، ورصيدها. اكبس على أي مادة لتشوف كل فواتيرها وحركاتها.</p>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="stats">
        <Stat label="المبيعات" value={money(state, t.revenue)} hint={`${rows.filter((r) => r.soldQty).length} مادة انباعت`} />
        {showCost && <Stat label="تكلفة البضاعة المباعة" value={money(state, t.cost)} />}
        {showCost && <Stat label="الربح" value={money(state, t.profit)} tone={t.profit >= 0 ? 'good' : 'bad'} hint={`نسبة الربح ${pct(t.profit, t.revenue)}`} />}
        {showCost && <Stat label="مواد عم تخسر فيها" value={String(losing)} tone={losing ? 'bad' : undefined} onClick={() => setShow('loss')} />}
        {showCost && noCost > 0 && <Stat label="مواد انباعت بلا تكلفة" value={String(noCost)} tone="bad" hint="ربحها مش دقيق، حط سعر الشراء" onClick={() => setShow('nocost')} />}
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث عن مادة أو امسح الباركود..." />
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="التصنيف">
            <option value="">كل التصنيفات</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="عرض">
          <option value="all">كل المواد</option>
          <option value="sold">اللي انباعت بس</option>
          {showCost && <option value="loss">اللي عم تخسر فيها</option>}
          {showCost && <option value="nocost">انباعت بلا تكلفة</option>}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="الترتيب">
          {showCost && <option value="profit">الأكثر ربحاً</option>}
          {showCost && <option value="loss">الأكثر خسارة</option>}
          <option value="sales">الأكثر مبيعاً (بالقيمة)</option>
          <option value="qty">الأكثر مبيعاً (بالكمية)</option>
          <option value="stock">الأكثر رصيداً</option>
          <option value="name">بالاسم</option>
        </select>
        <ExportButtons
          name="مراقبة المواد"
          sheets={() => [
            {
              name: 'مراقبة المواد',
              columns: [
                { header: 'المادة', key: 'name' },
                { header: 'الرمز', key: 'code' },
                { header: 'أول المدة', key: 'opening', type: 'number' },
                { header: 'داخل', key: 'in', type: 'number' },
                { header: 'خارج', key: 'out', type: 'number' },
                { header: 'الرصيد', key: 'closing', type: 'number' },
                { header: 'المبيوع', key: 'sold', type: 'number' },
                { header: 'المبيعات', key: 'revenue', type: 'money' },
                ...(showCost ? [{ header: 'التكلفة', key: 'cost', type: 'money' as const }, { header: 'الربح', key: 'profit', type: 'money' as const }] : []),
              ],
              rows: rows.map((r) => ({ name: r.item.name, code: r.item.code, opening: r.opening, in: r.inQty, out: r.outQty, closing: r.closing, sold: r.soldQty, revenue: major(state, r.revenue), cost: major(state, r.cost), profit: major(state, r.profit) })),
            },
          ]}
        />
      </div>
      {!rows.length ? (
        <Empty>ما في مواد بهالفترة أو بهالبحث.</Empty>
      ) : (
        <table className="table item-watch">
          <thead>
            <tr>
              <th>المادة</th>
              <th className="num">أول المدة</th>
              <th className="num">داخل</th>
              <th className="num">خارج</th>
              <th className="num">الرصيد</th>
              <th className="num">المبيوع</th>
              <th className="num">المبيعات</th>
              {showCost && <th className="num">الربح</th>}
              {showCost && <th className="num">%</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item.id} className="clickable" onClick={() => setOpen(r.item.id)}>
                <td>
                  <ItemName item={r.item} />
                  {showCost && r.profit < 0 && <span className="tag bad">خسارة</span>}
                  {showCost && r.noCost && <span className="tag bad">بلا تكلفة</span>}
                  <small className="muted"> {r.item.code}</small>
                </td>
                <td className="num">{qtyText(r.opening)}</td>
                <td className="num good">{r.inQty ? qtyText(r.inQty) : ''}</td>
                <td className="num bad">{r.outQty ? qtyText(r.outQty) : ''}</td>
                <td className={`num ${r.closing < 0 ? 'bad' : ''}`}>
                  <b>{qtyText(r.closing)}</b> {r.item.unit}
                </td>
                <td className="num">{r.soldQty ? qtyText(r.soldQty) : ''}</td>
                <td className="num">{r.revenue ? money(state, r.revenue) : ''}</td>
                {showCost && <td className={`num ${r.profit < 0 ? 'bad' : r.profit > 0 ? 'good' : ''}`}>{r.revenue || r.profit ? money(state, r.profit) : ''}</td>}
                {showCost && <td className="num">{r.revenue ? pct(r.profit, r.revenue) : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ItemDetail({ itemId, onBack, period, setPeriod }: { itemId: string; onBack: () => void; period: ReturnType<typeof usePeriod>[0]; setPeriod: ReturnType<typeof usePeriod>[1] }) {
  const { state, can, navigate } = useCompany();
  const item = state.items[itemId]!;
  const showCost = can('costs.view');
  const p = asPeriod(period);
  const { opening, moves, closing } = useMemo(() => itemMovements(state, itemId, p), [state, itemId, p.from, p.to]);
  const s = useMemo(() => itemsSummary(state, p).find((r) => r.item.id === itemId), [state, itemId, p.from, p.to]);
  const lvl = state.stock[itemId];
  const avg = lvl && lvl.totalQty > 0 ? lvl.value / lvl.totalQty : (lvl?.lastCost ?? 0);
  return (
    <div className="page">
      <PageHeader title={`مراقبة: ${item.name}`}>
        <button className="ghost" onClick={onBack}>
          <Icon name="prev" size={16} /> كل المواد
        </button>
      </PageHeader>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="stats">
        <Stat label="الرصيد الآن" value={`${qtyText(lvl?.totalQty ?? 0)} ${item.unit}`} hint={showCost && avg ? `متوسط التكلفة ${money(state, Math.round(avg))}` : undefined} />
        <Stat label="المبيوع بالفترة" value={`${qtyText(s?.soldQty ?? 0)} ${item.unit}`} hint={`${s?.invoices ?? 0} فاتورة`} />
        <Stat label="المبيعات" value={money(state, s?.revenue ?? 0)} />
        {showCost && <Stat label="الربح" value={money(state, s?.profit ?? 0)} tone={(s?.profit ?? 0) >= 0 ? 'good' : 'bad'} hint={`نسبة الربح ${pct(s?.profit ?? 0, s?.revenue ?? 0)}`} />}
        <Stat label="المشترى بالفترة" value={`${qtyText(s?.purchasedQty ?? 0)} ${item.unit}`} hint={showCost && s?.purchaseValue ? money(state, s.purchaseValue) : undefined} />
      </div>
      {showCost && s?.noCost && <p className="bad-note">في مبيعات لهالمادة بدون تكلفة (ما إلها سعر شراء)، فالربح طالع أكبر من الحقيقي. حط سعر الشراء بفاتورة شراء أو «إضافة بضاعة».</p>}
      <div className="toolbar">
        <PrintButtons kind="report" name={`مراقبة ${item.name}`} papers={['a4']} />
        <ExportButtons
          name={`مراقبة ${item.name}`}
          sheets={() => [
            {
              name: item.name,
              columns: [
                { header: 'التاريخ', key: 'date' },
                { header: 'الحركة', key: 'type' },
                { header: 'الرقم', key: 'ref' },
                { header: 'الزبون / المورد / البيان', key: 'party' },
                { header: 'داخل', key: 'in', type: 'number' },
                { header: 'خارج', key: 'out', type: 'number' },
                { header: 'الرصيد', key: 'balance', type: 'number' },
                { header: 'سعر الوحدة', key: 'price', type: 'money' },
                ...(showCost ? [{ header: 'الربح', key: 'profit', type: 'money' as const }] : []),
              ],
              rows: [
                { date: '', type: 'رصيد أول المدة', balance: opening },
                ...moves.map((m) => ({ date: dateText(m.date), type: m.type, ref: m.ref, party: m.party, in: m.qty > 0 ? m.qty : null, out: m.qty < 0 ? -m.qty : null, balance: m.balance, price: m.unitPrice ? major(state, m.unitPrice) : null, profit: m.sold ? major(state, m.profit) : null })),
              ],
            },
          ]}
        />
      </div>
      <div className="print-area">
        <div className="print-only">
          <DocHeader title={`حركة المادة: ${item.name}`}>{period.key !== 'all' && <div className="ltr">{`${dateText(period.from)} — ${dateText(period.to)}`}</div>}</DocHeader>
        </div>
        {!moves.length && opening === 0 ? (
          <Empty>ما في حركات لهالمادة بهالفترة.</Empty>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الحركة</th>
                <th>الرقم</th>
                <th>الزبون / المورد / البيان</th>
                <th className="num">داخل</th>
                <th className="num">خارج</th>
                <th className="num">الرصيد</th>
                <th className="num">سعر الوحدة</th>
                {showCost && <th className="num">الربح</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="muted">
                <td colSpan={6}>رصيد أول المدة</td>
                <td className="num">
                  <b>{qtyText(opening)}</b>
                </td>
                <td colSpan={showCost ? 2 : 1} />
              </tr>
              {moves.map((m, i) => (
                <tr key={i} className={m.invoiceId ? 'clickable' : ''} onClick={() => m.invoiceId && navigate('invoice', m.invoiceId)}>
                  <td>{dateText(m.date)}</td>
                  <td>{m.type}</td>
                  <td className="mono">{m.ref}</td>
                  <td>{m.party}</td>
                  <td className="num good">{m.qty > 0 ? qtyText(m.qty) : ''}</td>
                  <td className="num bad">{m.qty < 0 ? qtyText(-m.qty) : ''}</td>
                  <td className={`num ${m.balance < 0 ? 'bad' : ''}`}>{qtyText(m.balance)}</td>
                  <td className="num">{m.unitPrice ? money(state, m.unitPrice) : ''}</td>
                  {showCost && <td className={`num ${m.profit < 0 ? 'bad' : m.profit > 0 ? 'good' : ''}`}>{m.sold ? money(state, m.profit) : ''}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <b>رصيد آخر المدة</b>
                </td>
                <td className="num good">{qtyText(s?.inQty ?? 0)}</td>
                <td className="num bad">{qtyText(s?.outQty ?? 0)}</td>
                <td className="num">
                  <b>
                    {qtyText(closing)} {item.unit}
                  </b>
                </td>
                <td />
                {showCost && <td className="num">{money(state, s?.profit ?? 0)}</td>}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
