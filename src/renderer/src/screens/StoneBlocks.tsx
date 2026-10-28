import { useMemo, useState } from 'react';
import { stoneBlockUsage, type StoneBlock } from '../../../core';
import { dateText, money, parseAmount, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { CurrencySelect, Empty, Field, itemOptions, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { ItemForm } from './Items';

/** رقم من نص: بيقبل الأرقام العربية والفاصلة. */
const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫،,]/g, '.').trim() || 0);
const m3 = (v: number) => `${v.toLocaleString('en', { maximumFractionDigits: 3 })} م³`;
export const STONE_TYPES = ['حلبي', 'كركوكي', 'بازلت', 'قدسي', 'صخري', 'معراوي', 'رخام', 'جرانيت'];

/** منشرة الحجر: سجل الكتل (أبعاد وحجم وتكلفة)، والقص لألواح وبلاط، والباقي والهدر. */
export function StoneBlocks() {
  const { state, can } = useCompany();
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [adding, setAdding] = useState(false);
  const [cutting, setCutting] = useState<StoneBlock | null>(null);
  const all = useMemo(() => Object.values(state.stoneBlocks ?? {}), [state.stoneBlocks]);
  const rows = useMemo(
    () =>
      all
        .filter((b) => show === 'all' || !b.closed)
        .filter((b) => matches(query, b.number, b.stone, b.quarry, b.partyId ? state.parties[b.partyId]?.name : '', b.notes))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number),
    [all, show, query, state.parties],
  );
  const stats = useMemo(() => {
    const open = all.filter((b) => !b.closed);
    return { count: open.length, left: open.reduce((s, b) => s + stoneBlockUsage(b).left, 0), cut: all.reduce((s, b) => s + stoneBlockUsage(b).used, 0) };
  }, [all]);
  const costOf = (b: StoneBlock) => state.invoices.find((i) => i.id === b.purchaseInvoiceId);

  return (
    <div className="page">
      <PageHeader title="الكتل والقص">
        {can('purchases.create') && (
          <button className="primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> كتلة جديدة
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat clickable" onClick={() => setShow('open')}>
          <span>كتل بالمنشرة</span>
          <strong>{stats.count}</strong>
        </div>
        <div className="stat">
          <span>الحجم الباقي</span>
          <strong>{m3(stats.left)}</strong>
        </div>
        <div className="stat clickable" onClick={() => setShow('all')}>
          <span>انقصّ لحد هلق</span>
          <strong>{m3(stats.cut)}</strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم الكتلة، نوع الحجر، المقلع، المورد..." />
        <select value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')}>
          <option value="open">الكتل اللي لسا ما خلصت</option>
          <option value="all">كل الكتل</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>{query ? 'ما في كتل بهالبحث.' : 'ما في كتل بعد. اكبس «كتلة جديدة» وسجّل أبعادها وسعر المتر المكعب.'}</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الحجر</th>
              <th>الأبعاد (م)</th>
              <th className="num">الحجم</th>
              <th className="num">انقصّ</th>
              <th className="num">الباقي</th>
              <th className="num">التكلفة</th>
              <th>التاريخ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const u = stoneBlockUsage(b);
              const inv = costOf(b);
              return (
                <tr key={b.id}>
                  <td className="mono">{b.number}</td>
                  <td>
                    {b.stone}
                    <div className="muted">{[b.quarry, b.partyId ? state.parties[b.partyId]?.name : ''].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="mono">{b.length && b.width && b.height ? <span className="ltr">{`${b.length} × ${b.width} × ${b.height}`}</span> : '—'}</td>
                  <td className="num">{m3(b.volume)}</td>
                  <td className="num">{m3(u.used)}</td>
                  <td className="num">
                    {b.closed ? <span className="tag">{u.used < b.volume - 0.001 && !b.cuts.length ? 'ملغاة' : 'خلصت'}</span> : <strong>{m3(u.left)}</strong>}
                  </td>
                  <td className="num">{inv ? money(state, inv.total, inv.currency) : '—'}</td>
                  <td>{dateText(b.date)}</td>
                  <td>
                    {!b.closed && can('production.manage') && (
                      <button className="small primary" onClick={() => setCutting(b)}>
                        قص
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {adding && <BlockForm onClose={() => setAdding(false)} />}
      {cutting && <CutForm block={cutting} onClose={() => setCutting(null)} />}
    </div>
  );
}

function BlockForm({ onClose }: { onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [f, setF] = useState({ date: today(), partyId: '', stone: STONE_TYPES[0]!, quarry: '', length: '', width: '', height: '', volume: '', price: '', currency: state.info!.baseCurrency, pay: 'credit' as 'credit' | 'cash', notes: '' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const dims = num(f.length) * num(f.width) * num(f.height);
  const volume = Math.round((num(f.volume) || dims) * 1000) / 1000;
  let total = 0;
  try {
    total = f.price ? Math.round(volume * parseAmount(state, f.price, f.currency)) : 0;
  } catch {
    total = 0;
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(volume > 0)) return notify('اكتب أبعاد الكتلة (طول × عرض × ارتفاع) أو حجمها', 'error');
    if (f.pay === 'credit' && !f.partyId) return notify('اختار المورد لتسجّل الكتلة بالدين، أو اختار «نقدي»', 'error');
    let price: number;
    try {
      price = parseAmount(state, f.price, f.currency);
    } catch (err) {
      return notify((err as Error).message, 'error');
    }
    const res = await call<StoneBlock>('addStoneBlock', {
      date: f.date,
      ...(f.partyId ? { partyId: f.partyId } : {}),
      stone: f.stone,
      quarry: f.quarry,
      length: num(f.length),
      width: num(f.width),
      height: num(f.height),
      ...(num(f.volume) ? { volume: num(f.volume) } : {}),
      pricePerM3: price,
      currency: f.currency,
      paid: f.pay === 'cash' ? Math.round(volume * price) : 0,
      notes: f.notes,
    });
    if (res) {
      notify(`انسجّلت الكتلة رقم ${res.value.number} (${m3(res.value.volume)}) ودخلت المخزون`);
      onClose();
    }
  };
  return (
    <Modal title="كتلة جديدة" onClose={onClose} width={720}>
      <form className="form-grid" onSubmit={save}>
        <Field label="نوع الحجر">
          <input list="stone-types" value={f.stone} onChange={(e) => set('stone', e.target.value)} />
          <datalist id="stone-types">
            {STONE_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="المقلع (اختياري)">
          <input value={f.quarry} onChange={(e) => set('quarry', e.target.value)} />
        </Field>
        <Field label="المورد">
          <Picker options={partyOptions(state, 'supplier')} value={f.partyId || null} onChange={(id) => set('partyId', id ?? '')} placeholder="اختار المورد / المقلع..." />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <h3 className="wide form-section">الأبعاد بالمتر</h3>
        <Field label="الطول">
          <input inputMode="decimal" placeholder="2.50" value={f.length} onChange={(e) => set('length', e.target.value)} />
        </Field>
        <Field label="العرض">
          <input inputMode="decimal" placeholder="1.60" value={f.width} onChange={(e) => set('width', e.target.value)} />
        </Field>
        <Field label="الارتفاع">
          <input inputMode="decimal" placeholder="1.50" value={f.height} onChange={(e) => set('height', e.target.value)} />
        </Field>
        <Field label="أو الحجم مباشرة (م³)">
          <input inputMode="decimal" placeholder={dims ? String(Math.round(dims * 1000) / 1000) : ''} value={f.volume} onChange={(e) => set('volume', e.target.value)} />
        </Field>
        <h3 className="wide form-section">السعر والدفع</h3>
        <Field label="سعر المتر المكعب">
          <input inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => set('currency', c)} />
        </Field>
        <Field label="الدفع">
          <select value={f.pay} onChange={(e) => set('pay', e.target.value as 'credit' | 'cash')}>
            <option value="credit">دين للمورد</option>
            <option value="cash">نقدي من الصندوق</option>
          </select>
        </Field>
        <div className="kv wide">
          <span>حجم الكتلة</span>
          <strong>{m3(volume)}</strong>
          <span>قيمة الكتلة</span>
          <strong>{money(state, total, f.currency)}</strong>
        </div>
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ الكتلة</button>
        </div>
      </form>
    </Modal>
  );
}

type OutLine = { itemId: string | null; qty: string; thick: string };

/** القص: كم متر مكعب انصرف من الكتلة، وشو طلع منها (ألواح بالمتر المربع وسماكتها، كورنيش بالمتر الطولي...). */
function CutForm({ block, onClose }: { block: StoneBlock; onClose: () => void }) {
  const { state, call, notify, can } = useCompany();
  const { left } = stoneBlockUsage(block);
  const [date, setDate] = useState(today());
  const [volume, setVolume] = useState('');
  const [close, setClose] = useState(false);
  const [lines, setLines] = useState<OutLine[]>([{ itemId: null, qty: '', thick: '' }]);
  const [newItem, setNewItem] = useState<number | null>(null);
  const products = useMemo(() => itemOptions(state, (i) => i.kind === 'stock' && i.id !== block.itemId), [state, block.itemId]);
  const thickOf = (itemId: string | null) => {
    const a = itemId ? state.items[itemId]?.attributes?.['السماكة (سم)'] : '';
    return a ? String(num(a)) : '';
  };
  const used = close ? left : Math.min(num(volume), left);
  const remainsAfter = Math.max(0, Math.round((left - used) * 1000) / 1000);
  // حجم كل منتج: م² × السماكة، وإذا ما في سماكة منوزّع حسب الكمية
  const outVol = lines.reduce((s, l) => s + (l.itemId && num(l.thick) > 0 ? num(l.qty) * (num(l.thick) / 100) : 0), 0);
  const waste = used > 0 && outVol > 0 ? Math.max(0, Math.round((1 - outVol / used) * 100)) : null;
  const unitCost = block.purchaseInvoiceId ? (state.stock[block.itemId]?.totalQty ? state.stock[block.itemId]!.value / state.stock[block.itemId]!.totalQty : 0) : 0;
  const cost = Math.round(unitCost * used);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const outputs = lines
      .filter((l) => l.itemId && num(l.qty) > 0)
      .map((l) => ({ itemId: l.itemId!, qty: num(l.qty), ...(num(l.thick) > 0 ? { weight: num(l.qty) * (num(l.thick) / 100) } : {}) }));
    if (!outputs.length) return notify('اختار شو طلع من القص وكميته', 'error');
    if (!close && !(num(volume) > 0)) return notify('اكتب كم متر مكعب انقصّ', 'error');
    const res = await call<StoneBlock>('cutStoneBlock', block.id, { date, ...(close ? { close: true } : { volume: num(volume) }), outputs });
    if (res) {
      notify(res.value.closed ? 'انسجّل القص وخلصت الكتلة' : 'انسجّل القص ودخلت المنتجات المخزون');
      onClose();
    }
  };
  return (
    <Modal title={`قص الكتلة رقم ${block.number} (${block.stone})`} onClose={onClose} width={760}>
      <form className="form-grid" onSubmit={save}>
        <div className="kv wide">
          <span>الباقي من الكتلة</span>
          <strong>{m3(left)}</strong>
        </div>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="الحجم اللي انقصّ (م³)">
          <input inputMode="decimal" placeholder={`لحد ${left}`} value={close ? String(left) : volume} disabled={close} onChange={(e) => setVolume(e.target.value)} />
        </Field>
        <label className="check wide">
          <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> خلصت الكتلة (الباقي هدر وكسر، وتكلفته بتنحسب عالمنتجات)
        </label>
        <h3 className="wide form-section">شو طلع من القص</h3>
        <div className="wide">
          {lines.map((l, i) => {
            const it = l.itemId ? state.items[l.itemId] : null;
            return (
              <div key={i} className="with-button" style={{ marginBottom: 6, alignItems: 'center' }}>
                <div style={{ flex: 2 }}>
                  <Picker options={products} value={l.itemId} onChange={(id) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: id, thick: x.thick || thickOf(id) } : x)))} placeholder="ألواح 3 سم، بلاط 40×40، كورنيش..." />
                </div>
                <input className="num-input" style={{ maxWidth: 120 }} inputMode="decimal" placeholder={`الكمية${it ? ` (${it.unit})` : ''}`} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                <input className="num-input" style={{ maxWidth: 110 }} inputMode="decimal" placeholder="السماكة سم" title="للألواح والبلاط بالمتر المربع: بتحدد حصة المنتج من تكلفة الكتلة" value={l.thick} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, thick: e.target.value } : x)))} />
                {can('items.manage') && (
                  <button type="button" className="icon" title="صنف جديد" onClick={() => setNewItem(i)}>
                    <Icon name="plus" size={16} />
                  </button>
                )}
                <button type="button" className="icon" title="حذف" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            );
          })}
          <button type="button" className="small" onClick={() => setLines([...lines, { itemId: null, qty: '', thick: '' }])}>
            + منتج تاني
          </button>
        </div>
        <div className="kv wide">
          <span>بيضل من الكتلة</span>
          <strong>{m3(remainsAfter)}</strong>
          <span>تكلفة الحجم المقصوص</span>
          <strong>{money(state, cost)}</strong>
          {waste !== null && (
            <>
              <span>الهدر التقريبي</span>
              <strong className={waste > 40 ? 'bad' : ''}>{waste}%</strong>
            </>
          )}
        </div>
        <p className="muted wide">التكلفة بتتوزع عالمنتجات حسب حجم كل واحد (الكمية × السماكة). إذا ما كتبت سماكة بتتوزع حسب الكمية.</p>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ القص</button>
        </div>
      </form>
      {newItem !== null && (
        <ItemForm
          item={null}
          onClose={() => setNewItem(null)}
          onSaved={(item) => setLines((ls) => ls.map((x, j) => (j === newItem ? { ...x, itemId: item.id, thick: thickOf(item.id) || x.thick } : x)))}
        />
      )}
    </Modal>
  );
}
