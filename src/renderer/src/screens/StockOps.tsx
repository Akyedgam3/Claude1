import { useMemo, useState } from 'react';
import { ADJUSTMENT_NAMES, expiringBatches, type Item } from '../../../core';
import { dateText, major, money, parseAmount, qtyText, today, uid, useCompany } from '../api';
import { ExportButtons, PrintButtons, DocHeader } from '../components/print';
import { CurrencySelect, Empty, Field, itemMatches, itemOptions, PageHeader, partyOptions, Picker, SearchBox, Tabs } from '../components/ui';

type Tab = 'opening' | 'count' | 'damage' | 'transfer' | 'expiry' | 'history';

export function StockOps({ tab: initial }: { tab?: string }) {
  const { can, feature, state } = useCompany();
  const [tab, setTab] = useState<Tab>((initial as Tab) ?? (can('stock.adjust') ? 'count' : 'transfer'));
  return (
    <div className="page">
      <PageHeader title="عمليات المخزون" />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'count', label: 'الجرد', hidden: !can('stock.adjust') },
          { key: 'damage', label: 'تالف / استهلاك', hidden: !can('stock.adjust') },
          { key: 'transfer', label: 'تحويل بين المستودعات', hidden: !can('stock.transfer') },
          { key: 'expiry', label: 'الصلاحية', hidden: !feature('batches') && !Object.values(state.items).some((i) => i.trackExpiry) },
          { key: 'opening', label: 'الأرصدة الافتتاحية', hidden: !can('stock.adjust') },
          { key: 'history', label: 'السجل' },
        ]}
      />
      {tab === 'opening' && <Opening />}
      {tab === 'count' && <Count />}
      {tab === 'damage' && <Damage />}
      {tab === 'transfer' && <Transfer />}
      {tab === 'expiry' && <Expiry />}
      {tab === 'history' && <History />}
    </div>
  );
}

function WarehouseSelect({ value, onChange, label = 'المستودع' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { state } = useCompany();
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.values(state.warehouses).map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

const firstWarehouse = (state: ReturnType<typeof useCompany>['state']) => Object.keys(state.warehouses)[0] ?? 'main';

interface StockRow {
  key: string;
  itemId: string;
  qty: string;
  cost: string;
  batch: string;
  expiry: string;
  serials: string;
}

function ItemRows({ rows, setRows, withCost, withBatch }: { rows: StockRow[]; setRows: (r: StockRow[]) => void; withCost?: boolean; withBatch?: 'in' | 'out' }) {
  const { state } = useCompany();
  const opts = useMemo(() => itemOptions(state, (i) => i.kind === 'stock'), [state]);
  const set = (key: string, patch: Partial<StockRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <>
      <table className="table lines">
        <thead>
          <tr>
            <th style={{ width: '35%' }}>المادة</th>
            <th>الكمية</th>
            {withCost && <th>تكلفة الوحدة ({state.currencies[state.info!.baseCurrency]?.symbol})</th>}
            <th>الدفعة / الأرقام</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const item = state.items[r.itemId]!;
            return (
              <tr key={r.key}>
                <td>
                  <div className="line-item">
                    <strong>{item.name}</strong>
                    <small>
                      {item.code} · الرصيد: {qtyText(state.stock[item.id]?.totalQty ?? 0)} {item.unit}
                    </small>
                  </div>
                </td>
                <td>
                  <input className="num-input" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} inputMode="decimal" />
                </td>
                {withCost && (
                  <td>
                    <input className="num-input" value={r.cost} onChange={(e) => set(r.key, { cost: e.target.value })} inputMode="decimal" />
                  </td>
                )}
                <td>
                  {item.trackExpiry && (
                    <span className="line-extra">
                      <input placeholder="الدفعة" value={r.batch} onChange={(e) => set(r.key, { batch: e.target.value })} />
                      {withBatch === 'in' && <input type="date" value={r.expiry} onChange={(e) => set(r.key, { expiry: e.target.value })} />}
                    </span>
                  )}
                  {item.trackSerial && <textarea className="mono" rows={1} placeholder="الأرقام التسلسلية" value={r.serials} onChange={(e) => set(r.key, { serials: e.target.value })} />}
                </td>
                <td>
                  <button className="icon" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Picker
        options={opts}
        value={null}
        placeholder="+ أضف مادة"
        filter={(o, q) => itemMatches((o as (typeof opts)[number]).item, q)}
        onChange={(id) => {
          if (!id) return;
          const lc = state.stock[id]?.lastCost ?? 0;
          setRows([...rows, { key: uid(), itemId: id, qty: '1', cost: lc ? String(major(state, lc)) : '', batch: '', expiry: '', serials: '' }]);
        }}
      />
    </>
  );
}

const serialList = (s: string) => s.split(/[\s,،]+/).map((x) => x.trim()).filter(Boolean);

function Opening() {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const [date, setDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState(firstWarehouse(state));
  const [rows, setRows] = useState<StockRow[]>([]);
  const [parties, setParties] = useState<{ key: string; partyId: string | null; amount: string; currency: string }[]>([]);
  const [cash, setCash] = useState<{ key: string; accountId: string; amount: string }[]>([
    { key: 'c1', accountId: '1101', amount: '' },
    ...(state.accounts['1108'] ? [{ key: 'c2', accountId: '1108', amount: '' }] : []),
  ]);

  const save = async () => {
    try {
      const draft = {
        date,
        warehouseId,
        accounts: cash
          .filter((c) => c.amount.trim())
          .map((c) => {
            const cur = state.accounts[c.accountId]?.currency ?? base;
            const v = parseAmount(state, c.amount, cur);
            return { accountId: c.accountId, ...(v >= 0 ? { debit: v } : { credit: -v }), currency: cur };
          }),
        parties: parties.filter((p) => p.partyId && p.amount.trim()).map((p) => ({ partyId: p.partyId!, amount: parseAmount(state, p.amount, p.currency), currency: p.currency })),
        stock: rows.map((r) => ({
          itemId: r.itemId,
          qty: Number(r.qty),
          unitCost: parseAmount(state, r.cost || '0', base),
          ...(r.batch ? { batch: r.batch } : {}),
          ...(r.expiry ? { expiry: r.expiry } : {}),
          ...(r.serials ? { serials: serialList(r.serials) } : {}),
        })),
      };
      if (!draft.accounts.length && !draft.parties.length && !draft.stock.length) return notify('لا يوجد ما يُحفظ', 'error');
      if (await call('postOpeningBalances', draft)) {
        notify('تم تسجيل الأرصدة الافتتاحية');
        setRows([]);
        setParties([]);
        setCash(cash.map((c) => ({ ...c, amount: '' })));
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <section className="card">
      <p className="muted">عند بدء استخدام البرنامج: سجّل النقد الموجود، وديون العملاء والموردين، والبضاعة الموجودة بتكلفتها. الفرق يذهب إلى حساب "الأرصدة الافتتاحية".</p>
      <div className="form-grid four">
        <Field label="تاريخ البداية">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <WarehouseSelect value={warehouseId} onChange={setWarehouseId} />
      </div>
      <h4>النقد في الصناديق</h4>
      <div className="form-grid four">
        {cash.map((c) => (
          <Field key={c.key} label={state.accounts[c.accountId]?.name ?? c.accountId}>
            <input value={c.amount} onChange={(e) => setCash(cash.map((x) => (x.key === c.key ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" />
          </Field>
        ))}
      </div>
      <h4>ديون العملاء والموردين (موجب = عليه لنا، سالب = له علينا)</h4>
      <table className="table lines">
        <tbody>
          {parties.map((p) => (
            <tr key={p.key}>
              <td style={{ width: '40%' }}>
                <Picker options={partyOptions(state)} value={p.partyId} onChange={(id) => setParties(parties.map((x) => (x.key === p.key ? { ...x, partyId: id } : x)))} />
              </td>
              <td>
                <input className="num-input" value={p.amount} onChange={(e) => setParties(parties.map((x) => (x.key === p.key ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" />
              </td>
              <td>
                <CurrencySelect value={p.currency} onChange={(c) => setParties(parties.map((x) => (x.key === p.key ? { ...x, currency: c } : x)))} />
              </td>
              <td>
                <button className="icon" onClick={() => setParties(parties.filter((x) => x.key !== p.key))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setParties([...parties, { key: uid(), partyId: null, amount: '', currency: base }])}>+ دين</button>
      <h4>بضاعة أول المدة</h4>
      <ItemRows rows={rows} setRows={setRows} withCost withBatch="in" />
      <div className="form-actions">
        <button className="primary" onClick={save}>
          حفظ الأرصدة الافتتاحية
        </button>
      </div>
    </section>
  );
}

function Count() {
  const { state, call, notify, can } = useCompany();
  const [date, setDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState(firstWarehouse(state));
  const [query, setQuery] = useState('');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const items = useMemo(() => Object.values(state.items).filter((i) => i.kind === 'stock' && !i.archived && !i.trackSerial && itemMatches(i, query)).sort((a, b) => a.code.localeCompare(b.code, 'ar', { numeric: true })), [state.items, query]);
  const changed = Object.entries(counted).filter(([, v]) => v.trim() !== '');
  const showCost = can('costs.view');

  return (
    <section className="card">
      <p className="muted">اكتب الكمية الفعلية الموجودة على الرف فقط للمواد التي جردتها. الفرق يُسجّل تلقائياً بالتكلفة الوسطية في حساب "فروقات الجرد".</p>
      <div className="toolbar">
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <WarehouseSelect value={warehouseId} onChange={setWarehouseId} />
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث أو امسح الباركود..." />
        <PrintButtons kind="report" name="ورقة جرد" papers={['a4']} />
      </div>
      <div className="print-area">
        <div className="print-only">
          <DocHeader title="ورقة جرد">
            <div>{state.warehouses[warehouseId]?.name}</div>
            <div className="ltr">{dateText(date)}</div>
          </DocHeader>
        </div>
        <table className="table compact">
          <thead>
            <tr>
              <th>الرمز</th>
              <th>المادة</th>
              <th>المكان</th>
              <th className="num">الدفتري</th>
              <th className="num">الفعلي</th>
              <th className="num">الفرق</th>
              {showCost && <th className="num no-print">قيمة الفرق</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i: Item) => {
              const book = state.stock[i.id]?.qty[warehouseId] ?? 0;
              const v = counted[i.id] ?? '';
              const diff = v.trim() === '' ? null : Number(v) - book;
              const lvl = state.stock[i.id];
              const unit = lvl && lvl.totalQty > 0 ? lvl.value / lvl.totalQty : (lvl?.lastCost ?? 0);
              return (
                <tr key={i.id}>
                  <td className="mono">{i.code}</td>
                  <td>{i.name}</td>
                  <td>{i.location}</td>
                  <td className="num">{qtyText(book)}</td>
                  <td className="num">
                    <input className="num-input no-print" value={v} onChange={(e) => setCounted({ ...counted, [i.id]: e.target.value })} inputMode="decimal" />
                    <span className="print-only">______</span>
                  </td>
                  <td className={`num ${diff ? (diff < 0 ? 'bad' : 'good') : ''}`}>{diff === null ? '' : qtyText(diff)}</td>
                  {showCost && <td className="num no-print">{diff ? money(state, Math.round(diff * unit)) : ''}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button
          className="primary"
          disabled={!changed.length}
          onClick={async () => {
            const res = await call('countStock', { date, warehouseId, lines: changed.map(([itemId, v]) => ({ itemId, counted: Number(v) })) });
            if (res) {
              notify('تم تسجيل الجرد');
              setCounted({});
            }
          }}
        >
          اعتماد الجرد ({changed.length})
        </button>
      </div>
    </section>
  );
}

function Damage() {
  const { state, call, notify } = useCompany();
  const [kind, setKind] = useState<'damage' | 'consumption'>('damage');
  const [date, setDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState(firstWarehouse(state));
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<StockRow[]>([]);
  return (
    <section className="card">
      <div className="form-grid four">
        <Field label="النوع">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="damage">تالف / منتهي الصلاحية</option>
            <option value="consumption">استهلاك داخلي (للمحل نفسه)</option>
          </select>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <WarehouseSelect value={warehouseId} onChange={setWarehouseId} />
        <Field label="السبب">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
      <ItemRows rows={rows} setRows={setRows} withBatch="out" />
      <div className="form-actions">
        <button
          className="primary"
          disabled={!rows.length}
          onClick={async () => {
            const res = await call('adjustStock', {
              kind,
              date,
              warehouseId,
              memo,
              lines: rows.map((r) => ({ itemId: r.itemId, qty: Number(r.qty), ...(r.batch ? { batch: r.batch } : {}), ...(r.serials ? { serials: serialList(r.serials) } : {}) })),
            });
            if (res) {
              notify('تم الحفظ');
              setRows([]);
              setMemo('');
            }
          }}
        >
          حفظ
        </button>
      </div>
    </section>
  );
}

function Transfer() {
  const { state, call, notify, can } = useCompany();
  const ids = Object.keys(state.warehouses);
  const [from, setFrom] = useState(ids[0] ?? 'main');
  const [to, setTo] = useState(ids[1] ?? ids[0] ?? 'main');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<StockRow[]>([]);
  const [newName, setNewName] = useState('');
  return (
    <section className="card">
      <h4>المستودعات / الفروع</h4>
      <div className="chips-row">
        <ul className="chips">
          {Object.values(state.warehouses).map((w) => (
            <li key={w.id}>{w.name}</li>
          ))}
        </ul>
        {can('stock.transfer') && (
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (newName.trim() && (await call('saveWarehouse', { id: uid(), name: newName.trim() }))) {
                notify('تمت إضافة المستودع');
                setNewName('');
              }
            }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مستودع / فرع جديد" />
            <button>إضافة</button>
          </form>
        )}
      </div>
      {ids.length < 2 ? (
        <Empty>أضف مستودعاً ثانياً لتتمكن من التحويل</Empty>
      ) : (
        <>
          <div className="form-grid four">
            <WarehouseSelect label="من" value={from} onChange={setFrom} />
            <WarehouseSelect label="إلى" value={to} onChange={setTo} />
            <Field label="التاريخ">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <ItemRows rows={rows} setRows={setRows} withBatch="out" />
          <div className="form-actions">
            <button
              className="primary"
              disabled={!rows.length}
              onClick={async () => {
                const res = await call('transferStock', {
                  date,
                  from,
                  to,
                  lines: rows.map((r) => ({ itemId: r.itemId, qty: Number(r.qty), ...(r.batch ? { batch: r.batch } : {}), ...(r.serials ? { serials: serialList(r.serials) } : {}) })),
                });
                if (res) {
                  notify('تم التحويل');
                  setRows([]);
                }
              }}
            >
              تحويل
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Expiry() {
  const { state } = useCompany();
  const [days, setDays] = useState(60);
  const rows = expiringBatches(state, today(), days);
  return (
    <section className="card">
      <div className="toolbar">
        <Field label="خلال (يوم)">
          <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>
        <ExportButtons
          name="الصلاحية"
          sheets={() => [
            {
              name: 'قريبة الانتهاء',
              columns: [
                { header: 'المادة', key: 'name' },
                { header: 'الدفعة', key: 'batch' },
                { header: 'تاريخ الانتهاء', key: 'expiry' },
                { header: 'الكمية', key: 'qty', type: 'number' },
                { header: 'المستودع', key: 'wh' },
              ],
              rows: rows.map((r) => ({ name: r.item.name, batch: r.batch, expiry: dateText(r.expiry), qty: r.qty, wh: state.warehouses[r.warehouseId]?.name })),
            },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <Empty>لا توجد دفعات قريبة من الانتهاء</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>المادة</th>
              <th>الدفعة</th>
              <th>تاريخ الانتهاء</th>
              <th className="num">الكمية</th>
              <th>المستودع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.item.id}-${r.warehouseId}-${r.batch}`} className={r.expired ? 'warn-row' : ''}>
                <td>{r.item.name}</td>
                <td className="mono">{r.batch}</td>
                <td className={r.expired ? 'bad' : ''}>
                  {dateText(r.expiry)} {r.expired && '(منتهية)'}
                </td>
                <td className="num">{qtyText(r.qty)}</td>
                <td>{state.warehouses[r.warehouseId]?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function History() {
  const { state, can } = useCompany();
  const showCost = can('costs.view');
  const rows = [
    ...state.adjustments.map((a) => ({ id: a.id, date: a.date, type: ADJUSTMENT_NAMES[a.kind], memo: a.memo, count: a.lines.length, value: a.lines.reduce((s, l) => s + l.cost, 0), by: a.createdBy })),
    ...state.transfers.map((t) => ({ id: t.id, date: t.date, type: `تحويل: ${state.warehouses[t.from]?.name} ← ${state.warehouses[t.to]?.name}`, memo: t.memo, count: t.lines.length, value: 0, by: t.createdBy })),
    ...state.productions.map((p) => ({ id: p.id, date: p.date, type: 'إنتاج', memo: p.memo, count: p.outputs.length, value: p.outputs.reduce((s, o) => s + o.cost, 0), by: p.createdBy })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) return <Empty>لا توجد عمليات</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>العملية</th>
          <th>البيان</th>
          <th className="num">عدد المواد</th>
          {showCost && <th className="num">القيمة</th>}
          <th>المستخدم</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{dateText(r.date)}</td>
            <td>{r.type}</td>
            <td>{r.memo}</td>
            <td className="num">{r.count}</td>
            {showCost && <td className="num">{r.value ? money(state, r.value) : ''}</td>}
            <td className="muted">{state.users[r.by]?.displayName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
