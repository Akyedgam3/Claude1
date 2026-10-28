import { useMemo, useState } from 'react';
import { birdAverage, lastPriceBoard, POULTRY_CUTS, poultryDay, priceBoardText, weighingNet, weighingText, type Invoice, type Item, type Weighing } from '../../../core';
import { addDays, dateText, money, parseAmount, qtyText, toInput, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { Empty, Field, itemOptions, PageHeader, partyOptions, Picker, Stat, Tabs } from '../components/ui';
import { WeighingModal } from '../components/Weighing';

type Tab = 'prices' | 'load' | 'day';
const kg = (n: number) => `${qtyText(Math.round(n * 1000) / 1000)} كغ`;
const CUT_CATS = new Set(POULTRY_CUTS.map((c) => c.category));

/** توزيع الفروج: تسعيرة اليوم (جملة ومستهلك) وإرسالها عالواتساب، استلام حمولة بالوزنات، وملخص اليوم بالكيلو. */
export function Poultry() {
  const { can } = useCompany();
  const [tab, setTab] = useState<Tab>(can('items.manage') ? 'prices' : 'day');
  return (
    <div className="page">
      <PageHeader title="الفروج والتوزيع" />
      <Tabs<Tab>
        tabs={[
          { key: 'prices', label: 'تسعيرة اليوم', hidden: !can('items.manage') },
          { key: 'load', label: 'استلام حمولة', hidden: !can('purchases.create') },
          { key: 'day', label: 'ملخص اليوم' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'prices' && <PriceBoardTab />}
      {tab === 'load' && <LoadTab />}
      {tab === 'day' && <DayTab />}
    </div>
  );
}

/** الأصناف اللي بتنعرض بالتسعيرة: تصنيفات الفروج أولاً، وإذا ما في، كل المواد المخزنية. */
function boardItems(items: Record<string, Item>): Item[] {
  const all = Object.values(items).filter((i) => !i.archived && i.kind !== 'composite');
  const cuts = all.filter((i) => i.id.startsWith('pl-') || (i.category && CUT_CATS.has(i.category)));
  const order = (i: Item) => {
    const k = POULTRY_CUTS.findIndex((c) => c.id === i.id || c.name === i.name);
    return k < 0 ? 999 : k;
  };
  return (cuts.length ? cuts : all.filter((i) => i.kind === 'stock')).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'ar'));
}

function PriceBoardTab() {
  const { state, call, notify } = useCompany();
  const items = useMemo(() => boardItems(state.items), [state.items]);
  const [date, setDate] = useState(today());
  const [edit, setEdit] = useState<Record<string, { price: string; wholesale: string }>>({});
  const prev = lastPriceBoard(state, addDays(date, -1));
  const cur = (it: Item) => edit[it.id] ?? { price: it.price ? toInput(state, it.price, it.priceCurrency) : '', wholesale: it.wholesalePrice ? toInput(state, it.wholesalePrice, it.priceCurrency) : '' };
  const set = (it: Item, k: 'price' | 'wholesale', v: string) => setEdit((e) => ({ ...e, [it.id]: { ...cur(it), [k]: v } }));
  const parsed = () => {
    const out: Record<string, { price: number; wholesale?: number }> = {};
    for (const it of items) {
      const c = cur(it);
      const price = parseAmount(state, c.price, it.priceCurrency);
      const wholesale = parseAmount(state, c.wholesale, it.priceCurrency);
      if (price || wholesale) out[it.id] = { price, ...(wholesale ? { wholesale } : {}) };
    }
    return out;
  };
  const save = async () => {
    let prices: ReturnType<typeof parsed>;
    try {
      prices = parsed();
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    if (!Object.keys(prices).length) return notify('اكتب سعر صنف واحد عالأقل', 'error');
    const res = await call('savePriceBoard', date, prices);
    if (res) {
      setEdit({});
      notify('انحفظت تسعيرة اليوم وصارت الأسعار الجديدة بالفواتير');
    }
  };
  const copy = () => {
    let prices: ReturnType<typeof parsed>;
    try {
      prices = parsed();
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    const shown = items.filter((i) => prices[i.id]);
    const text = priceBoardText({
      company: state.info!.name,
      date: dateText(date),
      items: shown,
      prices: shown.map((i) => prices[i.id]!),
      fmt: (m) => money(state, m, shown[0]?.priceCurrency),
      ...(state.info?.phone ? { phone: state.info.phone } : {}),
    });
    void navigator.clipboard.writeText(text).then(() => notify('تم نسخ التسعيرة، الصقها بالواتساب لزباينك'));
  };
  const addCuts = async () => {
    const res = await call<number>('addPoultryCuts');
    if (res) notify(res.value ? `انضافت ${res.value} أصناف (فروج، وردة، جناح، شرحات...)` : 'كل القطعيات موجودة');
  };
  const missing = POULTRY_CUTS.some((c) => !Object.values(state.items).some((i) => !i.archived && (i.id === c.id || i.name === c.name)));

  return (
    <>
      <div className="toolbar">
        <Field label="تاريخ التسعيرة">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="spacer" />
        {missing && (
          <button onClick={addCuts}>
            <Icon name="plus" size={16} /> أضف القطعيات الجاهزة
          </button>
        )}
        <button onClick={copy}>
          <Icon name="message" size={16} /> نسخ للواتساب
        </button>
        <button className="primary" onClick={save}>
          حفظ تسعيرة اليوم
        </button>
      </div>
      {items.length === 0 ? (
        <Empty>ما في أصناف لسا. اكبس «أضف القطعيات الجاهزة» وبتنضاف فروج، وردة، جناح، شرحات، دبوس، سودة، حواصل...</Empty>
      ) : (
        <table className="table price-board">
          <thead>
            <tr>
              <th>الصنف</th>
              <th>الوحدة</th>
              <th>سعر الجملة (للمحلات)</th>
              <th>سعر المستهلك</th>
              <th className="num">{prev ? `تسعيرة ${dateText(prev.date)} (جملة / مستهلك)` : 'التسعيرة السابقة'}</th>
              <th className="num">الكلفة</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const c = cur(it);
              const p = prev?.prices[it.id];
              const st = state.stock[it.id];
              const avgCost = st && st.totalQty > 0 ? Math.round(st.value / st.totalQty) : 0;
              return (
                <tr key={it.id}>
                  <td>
                    <strong>{it.name}</strong>
                    {it.category && <div className="muted">{it.category}</div>}
                  </td>
                  <td className="muted">{it.unit}</td>
                  <td>
                    <input className="num-input" inputMode="decimal" value={c.wholesale} onChange={(e) => set(it, 'wholesale', e.target.value)} />
                  </td>
                  <td>
                    <input className="num-input" inputMode="decimal" value={c.price} onChange={(e) => set(it, 'price', e.target.value)} />
                  </td>
                  <td className="num muted">{p ? [p.wholesale ? money(state, p.wholesale, it.priceCurrency) : '', money(state, p.price, it.priceCurrency)].filter(Boolean).join(' / ') : '—'}</td>
                  <td className="num muted">{avgCost ? money(state, avgCost) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted">
        المحل اللي حسابه «جملة» بتطلعله فاتورته بسعر الجملة لحالها، والباقي بسعر المستهلك. كل تسعيرة بتنحفظ بتاريخها، وبتشوف جنبها تسعيرة مبارح. الكلفة = وسطي كلفة الكيلو اللي بالمخزون.
      </p>
    </>
  );
}

type Extra = { itemId: string | null; qty: string; price: string };

/** استلام حمولة من المدجنة / المسلخ: الوزنات قفص قفص، الأقفاص الفاضية، عدد الطيور والنافق، وسعر الكيلو. */
function LoadTab() {
  const { state, call, notify, navigate } = useCompany();
  const base = state.info!.baseCurrency;
  const whole = state.items['pl-whole'] && !state.items['pl-whole'].archived ? 'pl-whole' : (boardItems(state.items)[0]?.id ?? null);
  const [date, setDate] = useState(today());
  const [partyId, setPartyId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(whole);
  const [weighing, setWeighing] = useState<Weighing | null>(null);
  const [weighOpen, setWeighOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [extras, setExtras] = useState<Extra[]>([]);
  const [pay, setPay] = useState<'credit' | 'cash' | 'part'>('credit');
  const [paidText, setPaidText] = useState('');
  const [notes, setNotes] = useState('');
  const options = useMemo(() => itemOptions(state, (i) => i.kind === 'stock'), [state]);
  const net = weighing ? weighingNet(weighing) : 0;
  let total = 0;
  try {
    total = Math.round(net * parseAmount(state, price, base)) + extras.reduce((s, x) => s + (x.itemId ? Math.round(Number(x.qty || 0) * parseAmount(state, x.price, base)) : 0), 0);
  } catch {
    total = 0;
  }
  const loads = useMemo(
    () =>
      state.invoices
        .filter((i) => i.kind === 'purchase' && !i.voidEntryId && !i.deleted && i.lines.some((l) => l.weighing))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
        .slice(0, 15),
    [state.invoices],
  );
  const save = async () => {
    if (!itemId) return notify('اختار الصنف (فروج)', 'error');
    if (!weighing) return notify('اكتب الوزنات', 'error');
    if (pay !== 'cash' && !partyId) return notify('اختار المدجنة / المورد لتسجّل الباقي دين', 'error');
    let draft;
    try {
      const paid = pay === 'cash' ? total : pay === 'part' ? parseAmount(state, paidText, base) : 0;
      draft = {
        kind: 'purchase' as const,
        date,
        partyId,
        lines: [
          { itemId, qty: net, price: parseAmount(state, price, base), weighing },
          ...extras.filter((x) => x.itemId && Number(x.qty) > 0).map((x) => ({ itemId: x.itemId, qty: Number(x.qty), price: parseAmount(state, x.price, base) })),
        ],
        paid,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    const res = await call<Invoice>('postInvoice', draft);
    if (res) {
      notify(`انسجّلت الحمولة: ${kg(net)} — فاتورة شراء رقم ${res.value.number}`);
      setWeighing(null);
      setPrice('');
      setExtras([]);
      setPaidText('');
      setNotes('');
    }
  };
  const avg = weighing ? birdAverage(weighing) : undefined;
  return (
    <>
      <div className="form-grid card">
        <Field label="المدجنة / المسلخ">
          <Picker options={partyOptions(state, 'supplier')} value={partyId} onChange={setPartyId} placeholder="اختار المورد..." />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="الصنف">
          <Picker options={options} value={itemId} onChange={setItemId} placeholder="فروج..." />
        </Field>
        <Field label="سعر الكيلو">
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <div className="wide weigh-summary">
          <button type="button" className="primary" onClick={() => setWeighOpen(true)}>
            <Icon name="weight" size={16} /> {weighing ? 'تعديل الوزنات' : 'الوزنات (قفص قفص)'}
          </button>
          {weighing ? <span>{weighingText(weighing)}</span> : <span className="muted">اكتب وزن كل دفعة عالقبان، وعدد الأقفاص الفاضية ووزنها، وعدد الطيور والنافق.</span>}
        </div>
        <h3 className="wide form-section">مع الحمولة (اختياري): سودة، حواصل...</h3>
        <div className="wide">
          {extras.map((x, i) => (
            <div key={i} className="with-button" style={{ marginBottom: 6 }}>
              <div style={{ flex: 2 }}>
                <Picker options={options} value={x.itemId} onChange={(id) => setExtras(extras.map((y, j) => (j === i ? { ...y, itemId: id } : y)))} placeholder="الصنف" />
              </div>
              <input className="num-input" style={{ maxWidth: 120 }} inputMode="decimal" placeholder="الكمية" value={x.qty} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
              <input className="num-input" style={{ maxWidth: 140 }} inputMode="decimal" placeholder="السعر" value={x.price} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, price: e.target.value } : y)))} />
              <button type="button" className="icon" title="حذف" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="small" onClick={() => setExtras([...extras, { itemId: null, qty: '', price: '' }])}>
            + صنف مع الحمولة
          </button>
        </div>
        <Field label="الدفع">
          <select value={pay} onChange={(e) => setPay(e.target.value as typeof pay)}>
            <option value="credit">دين للمدجنة</option>
            <option value="cash">نقدي كامل</option>
            <option value="part">دفعة جزئية</option>
          </select>
        </Field>
        {pay === 'part' && (
          <Field label="المدفوع">
            <input inputMode="decimal" value={paidText} onChange={(e) => setPaidText(e.target.value)} />
          </Field>
        )}
        <Field label="ملاحظات" wide>
          <input value={notes} placeholder="رقم السيارة، اسم السائق..." onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="kv wide">
          <span>الوزن الصافي</span>
          <strong>{kg(net)}</strong>
          {avg !== undefined && (
            <>
              <span>وسطي وزن الطير</span>
              <strong>{qtyText(avg)} كغ</strong>
            </>
          )}
          <span>قيمة الحمولة</span>
          <strong>{money(state, total)}</strong>
        </div>
        <div className="form-actions wide">
          <button className="primary" onClick={save}>
            حفظ الحمولة (فاتورة شراء)
          </button>
        </div>
      </div>
      <h3>آخر الحمولات</h3>
      {loads.length === 0 ? (
        <Empty>ما في حمولات بالوزنات لسا.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>المورد</th>
              <th className="num">الصافي</th>
              <th className="num">الطيور</th>
              <th className="num">وسطي الطير</th>
              <th className="num">القيمة</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((inv) => {
              const w = inv.lines.find((l) => l.weighing)!;
              const a = birdAverage(w.weighing!);
              return (
                <tr key={inv.id} className="clickable" onClick={() => navigate('invoice', inv.id)}>
                  <td className="mono">{inv.number}</td>
                  <td>{dateText(inv.date)}</td>
                  <td>{inv.partyId ? state.parties[inv.partyId]?.name : 'نقدي'}</td>
                  <td className="num">{kg(w.qty)}</td>
                  <td className="num">{w.weighing!.count ? `${w.weighing!.count}${w.weighing!.dead ? ` (نافق ${w.weighing!.dead})` : ''}` : '—'}</td>
                  <td className="num">{a ? `${qtyText(a)} كغ` : '—'}</td>
                  <td className="num">{money(state, inv.total, inv.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {weighOpen && (
        <WeighingModal
          {...(weighing ? { value: weighing } : {})}
          onClose={() => setWeighOpen(false)}
          onSave={(w) => {
            setWeighing(w);
            setWeighOpen(false);
          }}
        />
      )}
    </>
  );
}

function DayTab() {
  const { state, navigate, can } = useCompany();
  const [date, setDate] = useState(today());
  const items = useMemo(() => boardItems(state.items), [state.items]);
  const d = useMemo(() => poultryDay(state, date, items.map((i) => i.id)), [state, date, items]);
  const rows = d.items.filter((r) => r.boughtKg || r.soldKg || r.stock);
  return (
    <>
      <div className="toolbar">
        <div className="with-button" style={{ alignItems: 'center', flex: '0 1 auto' }}>
          <button className="icon" title="اليوم اللي قبل" onClick={() => setDate(addDays(date, -1))}>
            <Icon name="prev" size={16} />
          </button>
          <input type="date" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="icon" title="اليوم اللي بعد" onClick={() => setDate(addDays(date, 1))}>
            <Icon name="next" size={16} />
          </button>
        </div>
        <div className="spacer" />
        {can('sales.create') && (
          <button className="primary" onClick={() => navigate('sale')}>
            <Icon name="plus" size={16} /> فاتورة لمحل
          </button>
        )}
      </div>
      <div className="stats">
        <Stat label="اشترينا" value={kg(d.bought.kg)} hint={d.bought.birds ? `${d.bought.birds} طير${d.bought.dead ? `، نافق ${d.bought.dead}` : ''}` : `${d.bought.invoices} حمولة`} />
        <Stat label="بعنا" value={kg(d.sold.kg)} hint={`${d.sold.invoices} فاتورة`} />
        <Stat label="المبيعات" value={money(state, d.sold.revenue)} />
        <Stat label="الربح" value={money(state, d.sold.profit)} tone={d.sold.profit >= 0 ? 'good' : 'bad'} />
        <Stat label="ربح الكيلو" value={money(state, d.profitPerKg)} hint={d.avgSell ? `بيع ${money(state, d.avgSell)} — شراء ${money(state, d.avgBuy)}` : undefined} />
        <Stat label="بالدين اليوم" value={money(state, d.sold.credit)} tone={d.sold.credit ? 'bad' : undefined} onClick={() => navigate('debts')} />
      </div>
      {rows.length === 0 ? (
        <Empty>ما في حركة بهاليوم.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الصنف</th>
              <th className="num">اشترينا</th>
              <th className="num">بعنا</th>
              <th className="num">المبيعات</th>
              <th className="num">الربح</th>
              <th className="num">الباقي بالمخزون</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId}>
                <td>{r.name}</td>
                <td className="num">{r.boughtKg ? kg(r.boughtKg) : '—'}</td>
                <td className="num">{r.soldKg ? kg(r.soldKg) : '—'}</td>
                <td className="num">{r.revenue ? money(state, r.revenue) : '—'}</td>
                <td className={`num ${r.profit < 0 ? 'bad' : ''}`}>{r.revenue ? money(state, r.profit) : '—'}</td>
                <td className={`num ${r.stock < 0 ? 'bad' : ''}`}>{kg(r.stock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">نقص الوزن والتالف آخر النهار بتسجّله من «الجرد وعمليات المخزون» ← تالف، فبيطلع الربح الحقيقي. والتقطيع (فروج كامل ← قطعيات) من «الإنتاج».</p>
    </>
  );
}
