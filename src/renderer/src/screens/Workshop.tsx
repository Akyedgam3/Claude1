import { useMemo, useState } from 'react';
import { piecesTotal, rollRemainingCm, rollReturnedCm, rollUsedCm, workOrderProgress, type FabricRoll, type Invoice, type WorkDelivery, type WorkOrder } from '../../../core';
import { dateText, money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, usePrinter } from '../components/print';
import { ConfirmButton, CurrencySelect, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox, Tabs } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';

// الأطوال مخزنة بالسنتيمتر وتنعرض بالمتر
export const meters = (cm: number): string => (cm / 100).toLocaleString('en', { maximumFractionDigits: 2 });
const parseMeters = (text: string): number => {
  const v = Number(text.replace(/[,،]/g, '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(v) ? Math.round(v * 100) : NaN;
};

const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: 'S → XXL', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: '36 → 46', sizes: ['36', '38', '40', '42', '44', '46'] },
  { label: 'أطفال 2 → 12', sizes: ['2', '4', '6', '8', '10', '12'] },
  { label: 'مقاس واحد', sizes: ['واحد'] },
];

const STATUS_NAMES: Record<WorkOrder['status'], string> = { open: 'قيد العمل', done: 'منتهية', cancelled: 'ملغاة' };

type Doc = { kind: 'receipt'; rolls: FabricRoll[] } | { kind: 'delivery'; order: WorkOrder; delivery: WorkDelivery } | { kind: 'statement'; partyId: string } | null;

/** مستند الطباعة الحالي (وصل استلام أقمشة، إشعار تسليم، كشف أقمشة). */
function PrintDoc({ doc }: { doc: Doc }) {
  const { state } = useCompany();
  if (!doc) return null;
  if (doc.kind === 'receipt') {
    const first = doc.rolls[0]!;
    const party = state.parties[first.partyId];
    const total = doc.rolls.reduce((t, r) => t + r.lengthCm, 0);
    return (
      <div className="print-only">
        <div className="print-area invoice-doc">
          <DocHeader title="سند استلام أقمشة">
            <div>رقم: {first.receiptNo}</div>
            <div className="ltr">{dateText(first.date)}</div>
          </DocHeader>
          <p>
            استلمنا من: <strong>{party?.name}</strong> الأقمشة التالية للتشغيل لديه:
          </p>
          <table className="doc-lines">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>رقم التوب</th>
                <th>القماش</th>
                <th>الطول (م)</th>
              </tr>
            </thead>
            <tbody>
              {doc.rolls.map((r, i) => (
                <tr key={r.id}>
                  <td className="n">{i + 1}</td>
                  <td className="mono">{r.code}</td>
                  <td>
                    {r.fabric}
                    {r.color ? ` — ${r.color}` : ''}
                  </td>
                  <td>{meters(r.lengthCm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="doc-totals">
            <div>
              <span>عدد الأتواب</span>
              <strong>{doc.rolls.length}</strong>
            </div>
            <div className="grand">
              <span>مجموع الأمتار</span>
              <strong>{meters(total)} م</strong>
            </div>
          </div>
          <div className="doc-signatures">
            <div>توقيع المستلم</div>
            <div>توقيع صاحب القماش</div>
          </div>
        </div>
      </div>
    );
  }
  if (doc.kind === 'delivery') {
    const { order: o, delivery: d } = doc;
    const party = state.parties[o.partyId];
    return (
      <div className="print-only">
        <div className="print-area invoice-doc">
          <DocHeader title="إشعار تسليم بضاعة">
            <div>رقم: {d.number}</div>
            <div className="ltr">{dateText(d.date)}</div>
          </DocHeader>
          <p>
            السادة: <strong>{party?.name}</strong> — طلبية رقم {o.number}: <strong>{o.model}</strong>
            {o.modelCode ? ` (${o.modelCode})` : ''}
          </p>
          <table className="doc-lines">
            <thead>
              <tr>
                <th>المقاس</th>
                <th>العدد</th>
              </tr>
            </thead>
            <tbody>
              {o.sizes
                .filter((z) => (d.pieces[z] ?? 0) > 0)
                .map((z) => (
                  <tr key={z}>
                    <td>{z}</td>
                    <td>{d.pieces[z]}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="doc-totals">
            <div className="grand">
              <span>مجموع القطع</span>
              <strong>{piecesTotal(d.pieces)}</strong>
            </div>
          </div>
          {d.notes && <p>ملاحظات: {d.notes}</p>}
          <div className="doc-signatures">
            <div>توقيع المسلّم</div>
            <div>توقيع المستلم</div>
          </div>
        </div>
      </div>
    );
  }
  const party = state.parties[doc.partyId];
  const rolls = Object.values(state.rolls)
    .filter((r) => r.partyId === doc.partyId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code, 'ar', { numeric: true }));
  const sum = (f: (r: FabricRoll) => number) => rolls.reduce((t, r) => t + f(r), 0);
  return (
    <div className="print-only">
      <div className="print-area invoice-doc">
        <DocHeader title="كشف أقمشة زبون">
          <div>{party?.name}</div>
          <div className="ltr">{dateText(today())}</div>
        </DocHeader>
        <table className="doc-lines">
          <thead>
            <tr>
              <th>رقم التوب</th>
              <th>القماش</th>
              <th>الوارد</th>
              <th>المستعمل</th>
              <th>المرتجع</th>
              <th>الباقي</th>
            </tr>
          </thead>
          <tbody>
            {rolls.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.code}</td>
                <td>
                  {r.fabric}
                  {r.color ? ` — ${r.color}` : ''}
                </td>
                <td>{meters(r.lengthCm)}</td>
                <td>{meters(rollUsedCm(state, r.id))}</td>
                <td>{meters(rollReturnedCm(r))}</td>
                <td>{meters(rollRemainingCm(state, r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="doc-totals">
          <div>
            <span>الوارد</span>
            <strong>{meters(sum((r) => r.lengthCm))} م</strong>
          </div>
          <div>
            <span>المستعمل</span>
            <strong>{meters(sum((r) => rollUsedCm(state, r.id)))} م</strong>
          </div>
          <div>
            <span>المرتجع</span>
            <strong>{meters(sum(rollReturnedCm))} م</strong>
          </div>
          <div className="grand">
            <span>الباقي عندنا</span>
            <strong>{meters(sum((r) => rollRemainingCm(state, r)))} م</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function usePrintDoc() {
  const printer = usePrinter();
  const [doc, setDoc] = useState<Doc>(null);
  const print = (d: Doc) => {
    setDoc(d);
    setTimeout(() => void printer.print('invoice'), 60);
  };
  return { doc, print };
}

function Bar({ value, max, tone }: { value: number; max: number; tone?: 'good' | 'warn' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span className={`meter ${tone ?? ''}`} title={`${pct}%`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Workshop({ tab: initialTab }: { tab?: string }) {
  const [tab, setTab] = useState<'orders' | 'rolls' | 'statement'>((initialTab as 'orders') ?? 'orders');
  return (
    <div className="page">
      <PageHeader title="ورشة الإنتاج" />
      <Tabs
        tabs={[
          { key: 'orders', label: 'طلبيات الإنتاج' },
          { key: 'rolls', label: 'أتواب القماش' },
          { key: 'statement', label: 'كشف أقمشة زبون' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'orders' && <OrdersTab />}
      {tab === 'rolls' && <RollsTab />}
      {tab === 'statement' && <StatementTab />}
    </div>
  );
}

// ───────────── الطلبيات ─────────────

function OrdersTab() {
  const { state, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'open' | 'all' | WorkOrder['status']>('open');
  const rows = Object.values(state.workOrders)
    .filter((o) => (status === 'all' || o.status === status) && matches(query, o.number, o.model, o.modelCode, state.parties[o.partyId]?.name))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.number - a.number);
  const open = Object.values(state.workOrders).filter((o) => o.status === 'open');
  const totals = open.reduce(
    (t, o) => {
      const p = workOrderProgress(state, o);
      return { planned: t.planned + p.planned, cut: t.cut + p.cut, delivered: t.delivered + p.delivered, ready: t.ready + (p.cut - p.delivered) };
    },
    { planned: 0, cut: 0, delivered: 0, ready: 0 },
  );
  return (
    <>
      <div className="stats">
        <div className="stat">
          <span>طلبيات قيد العمل</span>
          <strong>{open.length}</strong>
        </div>
        <div className="stat">
          <span>قطع مطلوبة</span>
          <strong>{totals.planned.toLocaleString('en')}</strong>
        </div>
        <div className="stat">
          <span>مقصوص</span>
          <strong>{totals.cut.toLocaleString('en')}</strong>
        </div>
        <div className="stat">
          <span>جاهز للتسليم</span>
          <strong className="good">{totals.ready.toLocaleString('en')}</strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم الطلبية، الموديل، أو الزبون..." />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">قيد العمل</option>
          <option value="done">منتهية</option>
          <option value="cancelled">ملغاة</option>
          <option value="all">الكل</option>
        </select>
        <button className="primary" onClick={() => navigate('work-order')}>
          <Icon name="plus" size={16} /> طلبية جديدة
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty>لا توجد طلبيات. ابدأ باستلام أتواب القماش من الزبون، بعدين اعمل طلبية بالموديل والمقاسات.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الزبون</th>
              <th>الموديل</th>
              <th>التسليم</th>
              <th className="num">المطلوب</th>
              <th>القص</th>
              <th>التسليم</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const p = workOrderProgress(state, o);
              const late = o.status === 'open' && o.dueDate && o.dueDate < today();
              return (
                <tr key={o.id} className={`clickable ${late ? 'late' : ''}`} onClick={() => navigate('work-order', o.id)}>
                  <td className="mono">{o.number}</td>
                  <td>{state.parties[o.partyId]?.name}</td>
                  <td>
                    {o.model}
                    {o.modelCode && <small className="muted"> {o.modelCode}</small>}
                  </td>
                  <td className={late ? 'bad' : ''}>{dateText(o.dueDate)}</td>
                  <td className="num">{p.planned.toLocaleString('en')}</td>
                  <td>
                    <div className="meter-row">
                      <Bar value={p.cut} max={p.planned || p.cut} />
                      <small>{p.cut.toLocaleString('en')}</small>
                    </div>
                  </td>
                  <td>
                    <div className="meter-row">
                      <Bar value={p.delivered} max={p.planned || p.cut} tone="good" />
                      <small>{p.delivered.toLocaleString('en')}</small>
                    </div>
                  </td>
                  <td>
                    <span className={`status ${o.status === 'done' ? 'done' : o.status === 'cancelled' ? 'cancelled' : 'in_progress'}`}>{STATUS_NAMES[o.status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ───────────── الأتواب ─────────────

function RollsTab() {
  const { state, can } = useCompany();
  const [partyId, setPartyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'available' | 'finished' | 'all'>('available');
  const [receiving, setReceiving] = useState(false);
  const [editing, setEditing] = useState<FabricRoll | null>(null);
  const [returning, setReturning] = useState<FabricRoll | null>(null);
  const { doc, print } = usePrintDoc();
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const all = Object.values(state.rolls);
  const rows = all
    .filter((r) => !partyId || r.partyId === partyId)
    .map((r) => ({ r, left: rollRemainingCm(state, r), used: rollUsedCm(state, r.id), ret: rollReturnedCm(r) }))
    .filter(({ left }) => status === 'all' || (status === 'available' ? left > 0 : left <= 0))
    .filter(({ r }) => matches(query, r.code, r.fabric, r.color, r.receiptNo, state.parties[r.partyId]?.name))
    .sort((a, b) => b.r.date.localeCompare(a.r.date) || a.r.code.localeCompare(b.r.code, 'ar', { numeric: true }));
  const sum = (f: (x: (typeof rows)[number]) => number) => rows.reduce((t, x) => t + f(x), 0);
  return (
    <>
      <div className="stats">
        <div className="stat">
          <span>عدد الأتواب</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="stat">
          <span>الوارد (م)</span>
          <strong>{meters(sum((x) => x.r.lengthCm))}</strong>
        </div>
        <div className="stat">
          <span>المستعمل (م)</span>
          <strong>{meters(sum((x) => x.used))}</strong>
        </div>
        <div className="stat">
          <span>الباقي عندنا (م)</span>
          <strong className="good">{meters(sum((x) => x.left))}</strong>
        </div>
      </div>
      <div className="toolbar">
        <div style={{ minWidth: 240 }}>
          <Picker options={[{ id: '', label: 'كل الزبائن' }, ...customers]} value={partyId ?? ''} onChange={(v) => setPartyId(v || null)} placeholder="كل الزبائن" />
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم التوب، نوع القماش، اللون، أو رقم السند..." />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="available">فيها باقي</option>
          <option value="finished">خلصت</option>
          <option value="all">الكل</option>
        </select>
        {can('tailoring.manage') && (
          <button className="primary" onClick={() => setReceiving(true)}>
            <Icon name="plus" size={16} /> استلام أتواب
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty>ما في أتواب. لما يجيبلك الزبون قماش، اضغط «استلام أتواب» وسجّل رقم وطول كل توب.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>رقم التوب</th>
              <th>الزبون</th>
              <th>القماش</th>
              <th>السند</th>
              <th className="num">الطول</th>
              <th className="num">المستعمل</th>
              <th className="num">المرتجع</th>
              <th>الباقي</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, left, used, ret }) => (
              <tr key={r.id}>
                <td className="mono">
                  <strong>{r.code}</strong>
                </td>
                <td>{state.parties[r.partyId]?.name}</td>
                <td>
                  {r.fabric}
                  {r.color && <small className="muted"> — {r.color}</small>}
                </td>
                <td>
                  <button className="link" onClick={() => print({ kind: 'receipt', rolls: all.filter((x) => x.receiptNo === r.receiptNo) })}>
                    {r.receiptNo} · {dateText(r.date)}
                  </button>
                </td>
                <td className="num">{meters(r.lengthCm)}</td>
                <td className="num">{meters(used)}</td>
                <td className="num">{ret ? meters(ret) : '—'}</td>
                <td>
                  <div className="meter-row">
                    <Bar value={left} max={r.lengthCm} tone={left > 0 ? 'good' : undefined} />
                    <strong>{meters(left)}</strong>
                  </div>
                </td>
                <td className="row-actions">
                  {can('tailoring.manage') && (
                    <>
                      <button className="ghost" onClick={() => setEditing(r)}>
                        تعديل
                      </button>
                      {left > 0 && (
                        <button className="ghost" onClick={() => setReturning(r)}>
                          إرجاع الباقي
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {receiving && (
        <ReceiveRolls
          onClose={() => setReceiving(false)}
          onSaved={(rolls) => {
            setReceiving(false);
            print({ kind: 'receipt', rolls });
          }}
          {...(partyId ? { partyId } : {})}
        />
      )}
      {editing && <EditRoll roll={editing} onClose={() => setEditing(null)} />}
      {returning && <ReturnRoll roll={returning} onClose={() => setReturning(null)} />}
      <PrintDoc doc={doc} />
    </>
  );
}

interface RollRow {
  key: string;
  code: string;
  fabric: string;
  color: string;
  length: string;
  width: string;
}

function ReceiveRolls({ partyId: initialParty, onClose, onSaved }: { partyId?: string; onClose: () => void; onSaved: (rolls: FabricRoll[]) => void }) {
  const { state, call, notify } = useCompany();
  const [partyId, setPartyId] = useState<string | null>(initialParty ?? null);
  const [date, setDate] = useState(today());
  const [fabric, setFabric] = useState('');
  const [color, setColor] = useState('');
  const [rows, setRows] = useState<RollRow[]>([{ key: uid(), code: '', fabric: '', color: '', length: '', width: '' }]);
  const [paste, setPaste] = useState('');
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const valid = rows.filter((r) => r.code.trim() && parseMeters(r.length) > 0);
  const total = valid.reduce((t, r) => t + parseMeters(r.length), 0);
  const upd = (key: string, k: keyof RollRow, v: string) => setRows(rows.map((r) => (r.key === key ? { ...r, [k]: v } : r)));

  // لصق قائمة: كل سطر "رقم التوب  الطول" (من إكسل أو ورقة الزبون)
  const applyPaste = () => {
    const parsed = paste
      .split(/\r?\n/)
      .map((line) => line.trim().split(/[\t;|]+|\s{2,}|\s+(?=[\d.,]+\s*$)/))
      .filter((p) => p.length >= 2 && p[0])
      .map((p) => ({ key: uid(), code: p[0]!.trim(), fabric: '', color: '', length: p[p.length - 1]!.trim(), width: '' }));
    if (!parsed.length) return notify('ما قدرت إقرأ القائمة. كل سطر: رقم التوب ثم الطول', 'error');
    setRows([...rows.filter((r) => r.code.trim() || r.length.trim()), ...parsed]);
    setPaste('');
  };

  const save = async () => {
    if (!partyId) return notify('اختار صاحب القماش', 'error');
    if (!valid.length) return notify('اكتب رقم وطول توب واحد على الأقل', 'error');
    const res = await call<FabricRoll[]>('receiveRolls', {
      partyId,
      date,
      rolls: valid.map((r) => ({
        code: r.code.trim(),
        fabric: (r.fabric || fabric).trim() || 'قماش',
        ...((r.color || color).trim() ? { color: (r.color || color).trim() } : {}),
        lengthCm: parseMeters(r.length),
        ...(parseMeters(r.width) > 0 ? { widthCm: Math.round(parseMeters(r.width) / 100) } : {}),
      })),
    });
    if (res) {
      notify(`تم استلام ${res.value.length} توب — سند رقم ${res.value[0]!.receiptNo}`);
      onSaved(res.value);
    }
  };

  return (
    <Modal title="استلام أتواب قماش من زبون" onClose={onClose} width={900}>
      <div className="form-grid four">
        <Field label="صاحب القماش" wide>
          <Picker options={customers} value={partyId} onChange={setPartyId} placeholder="ابحث بالاسم أو الهاتف..." />
        </Field>
        <Field label="تاريخ الاستلام">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="نوع القماش (للكل)">
          <input value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="قطن بوبلين، جينز..." />
        </Field>
        <Field label="اللون (للكل)">
          <input value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
      </div>
      <table className="table lines">
        <thead>
          <tr>
            <th>رقم التوب</th>
            <th>الطول (متر)</th>
            <th>النوع (إذا مختلف)</th>
            <th>اللون (إذا مختلف)</th>
            <th>العرض (سم)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td>
                <input value={r.code} onChange={(e) => upd(r.key, 'code', e.target.value)} autoFocus={i === rows.length - 1 && i > 0} />
              </td>
              <td>
                <input
                  className="num-input"
                  value={r.length}
                  inputMode="decimal"
                  onChange={(e) => upd(r.key, 'length', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setRows([...rows, { key: uid(), code: nextCode(r.code), fabric: '', color: '', length: '', width: '' }]);
                    }
                  }}
                />
              </td>
              <td>
                <input value={r.fabric} placeholder={fabric} onChange={(e) => upd(r.key, 'fabric', e.target.value)} />
              </td>
              <td>
                <input value={r.color} placeholder={color} onChange={(e) => upd(r.key, 'color', e.target.value)} />
              </td>
              <td>
                <input className="num-input" value={r.width} onChange={(e) => upd(r.key, 'width', e.target.value)} />
              </td>
              <td>
                <button type="button" className="icon" title="حذف" onClick={() => setRows(rows.length > 1 ? rows.filter((x) => x.key !== r.key) : rows)}>
                  <Icon name="close" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        <button type="button" onClick={() => setRows([...rows, { key: uid(), code: nextCode(rows[rows.length - 1]?.code ?? ''), fabric: '', color: '', length: '', width: '' }])}>
          <Icon name="plus" size={16} /> توب
        </button>
        <span className="muted">Enter بخانة الطول بيضيف سطر جديد ورقم التوب التالي</span>
      </div>
      <details className="paste-box">
        <summary>عندك قائمة طويلة؟ الصقها مرة وحدة</summary>
        <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'A-101  52.5\nA-102  48\nA-103  50.25'} dir="ltr" />
        <button type="button" onClick={applyPaste} disabled={!paste.trim()}>
          إضافة القائمة
        </button>
      </details>
      <div className="kv">
        <span>عدد الأتواب</span>
        <strong>{valid.length}</strong>
        <span>مجموع الأمتار</span>
        <strong>{meters(total)}</strong>
      </div>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button className="primary" onClick={save}>
          حفظ وطباعة السند
        </button>
      </div>
    </Modal>
  );
}

/** A-101 ← A-102 ، 7 ← 8 */
function nextCode(code: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(code.trim());
  if (!m) return '';
  const n = String(Number(m[2]) + 1).padStart(m[2]!.length, '0');
  return `${m[1]}${n}${m[3]}`;
}

function EditRoll({ roll, onClose }: { roll: FabricRoll; onClose: () => void }) {
  const { call, notify } = useCompany();
  const [f, setF] = useState({ code: roll.code, fabric: roll.fabric, color: roll.color ?? '', length: meters(roll.lengthCm), notes: roll.notes ?? '' });
  return (
    <Modal title={`تعديل التوب ${roll.code}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await call('updateRoll', {
            id: roll.id,
            code: f.code,
            fabric: f.fabric,
            date: roll.date,
            lengthCm: parseMeters(f.length),
            ...(f.color.trim() ? { color: f.color.trim() } : {}),
            ...(roll.widthCm ? { widthCm: roll.widthCm } : {}),
            ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
          });
          if (res) {
            notify('تم الحفظ');
            onClose();
          }
        }}
      >
        <Field label="رقم التوب">
          <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        </Field>
        <Field label="الطول (متر)">
          <input value={f.length} onChange={(e) => setF({ ...f, length: e.target.value })} inputMode="decimal" />
        </Field>
        <Field label="القماش">
          <input value={f.fabric} onChange={(e) => setF({ ...f, fabric: e.target.value })} />
        </Field>
        <Field label="اللون">
          <input value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function ReturnRoll({ roll, onClose }: { roll: FabricRoll; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const left = rollRemainingCm(state, roll);
  const [length, setLength] = useState(meters(left));
  const [note, setNote] = useState('');
  return (
    <Modal title={`إرجاع بواقي التوب ${roll.code}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const cm = parseMeters(length);
          if (await call('returnRoll', roll.id, { date: today(), cm, ...(note.trim() ? { note: note.trim() } : {}) })) {
            notify('تم تسجيل الإرجاع');
            onClose();
          }
        }}
      >
        <p className="muted wide">
          الباقي بالتوب: <strong>{meters(left)} متر</strong>
        </p>
        <Field label="الطول المرتجع (متر)">
          <input value={length} onChange={(e) => setLength(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="ملاحظة">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="قصاقيص، بواقي..." />
        </Field>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">تسجيل الإرجاع</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────── كشف الأقمشة ─────────────

function StatementTab() {
  const { state } = useCompany();
  const [partyId, setPartyId] = useState<string | null>(null);
  const { doc, print } = usePrintDoc();
  const owners = useMemo(() => {
    const ids = new Set(Object.values(state.rolls).map((r) => r.partyId));
    return partyOptions(state).filter((o) => ids.has(o.id));
  }, [state]);
  const rolls = partyId ? Object.values(state.rolls).filter((r) => r.partyId === partyId) : [];
  const orders = partyId ? Object.values(state.workOrders).filter((o) => o.partyId === partyId) : [];
  const sum = (f: (r: FabricRoll) => number) => rolls.reduce((t, r) => t + f(r), 0);
  const pieces = orders.reduce((t, o) => t + workOrderProgress(state, o).cut, 0);
  const used = sum((r) => rollUsedCm(state, r.id));
  return (
    <>
      <div className="toolbar">
        <div style={{ minWidth: 300 }}>
          <Picker options={owners} value={partyId} onChange={setPartyId} placeholder="اختار الزبون..." />
        </div>
        {partyId && (
          <button onClick={() => print({ kind: 'statement', partyId })}>
            <Icon name="printer" size={16} /> طباعة الكشف
          </button>
        )}
      </div>
      {!partyId ? (
        <Empty>اختار زبون لتشوف كل أقمشته: شو وصل، شو انقص، شو رجع، وشو باقي عندك.</Empty>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <span>الوارد</span>
              <strong>{meters(sum((r) => r.lengthCm))} م</strong>
            </div>
            <div className="stat">
              <span>المستعمل بالقص</span>
              <strong>{meters(used)} م</strong>
            </div>
            <div className="stat">
              <span>المرتجع للزبون</span>
              <strong>{meters(sum(rollReturnedCm))} م</strong>
            </div>
            <div className="stat">
              <span>الباقي عندنا</span>
              <strong className="good">{meters(sum((r) => rollRemainingCm(state, r)))} م</strong>
            </div>
            <div className="stat">
              <span>قطع مقصوصة</span>
              <strong>
                {pieces.toLocaleString('en')}
                {pieces > 0 && <small className="muted"> · {meters(Math.round(used / pieces))} م/قطعة</small>}
              </strong>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>رقم التوب</th>
                <th>القماش</th>
                <th>تاريخ الاستلام</th>
                <th className="num">الطول</th>
                <th className="num">المستعمل</th>
                <th className="num">المرتجع</th>
                <th className="num">الباقي</th>
              </tr>
            </thead>
            <tbody>
              {rolls
                .sort((a, b) => a.code.localeCompare(b.code, 'ar', { numeric: true }))
                .map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.code}</td>
                    <td>
                      {r.fabric}
                      {r.color && <small className="muted"> — {r.color}</small>}
                    </td>
                    <td>{dateText(r.date)}</td>
                    <td className="num">{meters(r.lengthCm)}</td>
                    <td className="num">{meters(rollUsedCm(state, r.id))}</td>
                    <td className="num">{meters(rollReturnedCm(r))}</td>
                    <td className="num">
                      <strong>{meters(rollRemainingCm(state, r))}</strong>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
      <PrintDoc doc={doc} />
    </>
  );
}

// ───────────── محرر الطلبية ─────────────

export function WorkOrderEditor({ id }: { id?: string }) {
  const { state, call, notify, navigate, can } = useCompany();
  const existing = id ? state.workOrders[id] : undefined;
  const [partyId, setPartyId] = useState<string | null>(existing?.partyId ?? null);
  const [model, setModel] = useState(existing?.model ?? '');
  const [modelCode, setModelCode] = useState(existing?.modelCode ?? '');
  const [date, setDate] = useState(existing?.date ?? today());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? state.info!.baseCurrency);
  const [rate, setRate] = useState(existing ? toInput(state, existing.pieceRate, existing.currency) : '');
  const [sizes, setSizes] = useState<string[]>(existing?.sizes ?? ['S', 'M', 'L', 'XL', 'XXL']);
  const [planned, setPlanned] = useState<Record<string, string>>(Object.fromEntries(Object.entries(existing?.planned ?? {}).map(([k, v]) => [k, String(v)])));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [status, setStatus] = useState<WorkOrder['status']>(existing?.status ?? 'open');
  const [newSize, setNewSize] = useState('');
  const [cutting, setCutting] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [billing, setBilling] = useState<WorkDelivery | null>(null);
  const { doc, print } = usePrintDoc();
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const p = existing ? workOrderProgress(state, existing) : null;
  const plannedTotal = sizes.reduce((t, z) => t + (Number(planned[z]) || 0), 0);

  const save = async () => {
    if (!partyId) return notify('اختار الزبون', 'error');
    let pieceRate = 0;
    try {
      pieceRate = rate.trim() ? parseAmount(state, rate, currency) : 0;
    } catch {
      return notify('أجرة القطعة غير صالحة', 'error');
    }
    const res = await call<WorkOrder>('saveWorkOrder', {
      id: existing?.id ?? uid(),
      partyId,
      date,
      model: model.trim(),
      sizes,
      planned: Object.fromEntries(sizes.map((z) => [z, Math.max(0, Math.round(Number(planned[z]) || 0))])),
      pieceRate,
      currency,
      status,
      ...(modelCode.trim() ? { modelCode: modelCode.trim() } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    if (res) {
      notify(`تم حفظ الطلبية رقم ${res.value.number}`);
      if (!existing) navigate('work-order', res.value.id);
    }
  };

  const addSize = (z: string) => {
    const v = z.trim();
    if (v && !sizes.includes(v)) setSizes([...sizes, v]);
    setNewSize('');
  };

  return (
    <div className="page">
      <PageHeader title={existing ? `طلبية إنتاج رقم ${existing.number}` : 'طلبية إنتاج جديدة'}>
        <button onClick={() => navigate('workshop')}>
          <Icon name="prev" size={16} /> الطلبيات
        </button>
        {can('tailoring.manage') && (
          <button className="primary" onClick={save}>
            حفظ
          </button>
        )}
        {existing && existing.status !== 'cancelled' && can('tailoring.manage') && (
          <>
            <button onClick={() => setCutting(true)}>
              <Icon name="scissors" size={16} /> قصّة جديدة
            </button>
            <button className="primary accent" onClick={() => setDelivering(true)} disabled={!p || p.cut - p.delivered <= 0}>
              <Icon name="truck" size={16} /> تسليم دفعة
            </button>
          </>
        )}
      </PageHeader>

      <section className="card form-grid four">
        <Field label="الزبون (صاحب القماش)" wide>
          <Picker options={customers} value={partyId} onChange={setPartyId} placeholder="ابحث بالاسم أو الهاتف..." />
        </Field>
        <Field label="الموديل">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="قميص رجالي، بنطال جينز..." />
        </Field>
        <Field label="رقم الموديل">
          <input value={modelCode} onChange={(e) => setModelCode(e.target.value)} dir="ltr" />
        </Field>
        <Field label="تاريخ الطلبية">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="موعد التسليم">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="أجرة القطعة">
          <input className="num-input" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        {existing && (
          <Field label="الحالة">
            <select value={status} onChange={(e) => setStatus(e.target.value as WorkOrder['status'])}>
              {(['open', 'done', 'cancelled'] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_NAMES[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="ملاحظات" wide>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="تفاصيل الموديل، الخيط، التطريز..." />
        </Field>
      </section>

      <section className="card">
        <header className="panel-header">
          <h3>
            <Icon name="ruler" size={18} /> المقاسات والكميات
          </h3>
          <div className="button-row">
            {SIZE_PRESETS.map((s) => (
              <button key={s.label} type="button" className="ghost" onClick={() => setSizes(s.sizes)} disabled={!!p && p.cut > 0}>
                {s.label}
              </button>
            ))}
          </div>
        </header>
        <table className="table size-matrix">
          <thead>
            <tr>
              <th />
              {sizes.map((z) => (
                <th key={z}>
                  {z}
                  {(!p || ((p.cutBySize[z] ?? 0) === 0 && (p.deliveredBySize[z] ?? 0) === 0)) && (
                    <button type="button" className="icon tiny" title="حذف المقاس" onClick={() => setSizes(sizes.filter((x) => x !== z))}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </th>
              ))}
              <th>
                <span className="with-button">
                  <input
                    className="size-add"
                    value={newSize}
                    placeholder="مقاس"
                    onChange={(e) => setNewSize(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSize(newSize);
                      }
                    }}
                  />
                  <button type="button" className="icon" title="إضافة مقاس" onClick={() => addSize(newSize)} disabled={!newSize.trim()}>
                    <Icon name="plus" size={14} />
                  </button>
                </span>
              </th>
              <th className="num">المجموع</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>المطلوب</th>
              {sizes.map((z) => (
                <td key={z}>
                  <input className="num-input" value={planned[z] ?? ''} onChange={(e) => setPlanned({ ...planned, [z]: e.target.value.replace(/[^\d]/g, '') })} />
                </td>
              ))}
              <td />
              <td className="num">
                <strong>{plannedTotal.toLocaleString('en')}</strong>
              </td>
            </tr>
            {p && existing && (
              <>
                <tr>
                  <th>المقصوص</th>
                  {sizes.map((z) => (
                    <td key={z} className="num">
                      {p.cutBySize[z] ?? 0}
                    </td>
                  ))}
                  <td />
                  <td className="num">{p.cut.toLocaleString('en')}</td>
                </tr>
                <tr>
                  <th>المسلّم</th>
                  {sizes.map((z) => (
                    <td key={z} className="num">
                      {p.deliveredBySize[z] ?? 0}
                    </td>
                  ))}
                  <td />
                  <td className="num">{p.delivered.toLocaleString('en')}</td>
                </tr>
                <tr className="highlight">
                  <th>جاهز للتسليم</th>
                  {sizes.map((z) => (
                    <td key={z} className="num">
                      <strong>{p.readyBySize[z] ?? 0}</strong>
                    </td>
                  ))}
                  <td />
                  <td className="num">
                    <strong>{(p.cut - p.delivered).toLocaleString('en')}</strong>
                  </td>
                </tr>
                <tr>
                  <th>باقي للقص</th>
                  {sizes.map((z) => (
                    <td key={z} className="num muted">
                      {Math.max(0, (existing.planned[z] ?? 0) - (p.cutBySize[z] ?? 0))}
                    </td>
                  ))}
                  <td />
                  <td className="num muted">{Math.max(0, p.planned - p.cut).toLocaleString('en')}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      {p && existing && (
        <>
          <div className="stats">
            <div className="stat">
              <span>الأمتار المستهلكة</span>
              <strong>{meters(p.usedCm)} م</strong>
            </div>
            <div className="stat">
              <span>متوسط القماش للقطعة</span>
              <strong>{p.cmPerPiece ? `${meters(Math.round(p.cmPerPiece))} م` : '—'}</strong>
            </div>
            <div className="stat">
              <span>قيمة المسلّم</span>
              <strong>{money(state, p.delivered * existing.pieceRate, existing.currency)}</strong>
            </div>
            <div className="stat">
              <span>قيمة الطلبية كاملة</span>
              <strong>{money(state, p.planned * existing.pieceRate, existing.currency)}</strong>
            </div>
          </div>

          <div className="two-col">
            <section className="card">
              <h3>القصّات ({existing.cuts.length})</h3>
              {existing.cuts.length === 0 ? (
                <p className="muted">اضغط «قصّة جديدة» وسجّل الأتواب اللي انقص منها وعدد القطع لكل مقاس.</p>
              ) : (
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الأتواب</th>
                      <th>القطع</th>
                      <th className="num">م</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {existing.cuts.map((c) => (
                      <tr key={c.id}>
                        <td>{dateText(c.date)}</td>
                        <td>
                          {c.rolls.map((r) => (
                            <span key={r.rollId} className="chip">
                              {state.rolls[r.rollId]?.code}: {meters(r.cm)}
                            </span>
                          ))}
                        </td>
                        <td>
                          <strong>{piecesTotal(c.pieces)}</strong>
                          <small className="muted">
                            {' '}
                            (
                            {existing.sizes
                              .filter((z) => (c.pieces[z] ?? 0) > 0)
                              .map((z) => `${z}:${c.pieces[z]}`)
                              .join(' ')}
                            )
                          </small>
                        </td>
                        <td className="num">{meters(c.rolls.reduce((t, r) => t + r.cm, 0))}</td>
                        <td>
                          {can('tailoring.manage') && (
                            <ConfirmButton
                              label="حذف"
                              onConfirm={async () => {
                                if (await call('removeCut', existing.id, c.id)) notify('تم حذف القصّة وإرجاع الأمتار للأتواب');
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card">
              <h3>التسليمات ({existing.deliveries.length})</h3>
              {existing.deliveries.length === 0 ? (
                <p className="muted">لما تخلص دفعة، اضغط «تسليم دفعة» وطبعلها إشعار تسليم وفاتورة.</p>
              ) : (
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>رقم</th>
                      <th>التاريخ</th>
                      <th>القطع</th>
                      <th>الفاتورة</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {existing.deliveries.map((d) => {
                      const inv = d.invoiceId ? state.invoices.find((i) => i.id === d.invoiceId) : undefined;
                      return (
                        <tr key={d.id}>
                          <td className="mono">{d.number}</td>
                          <td>{dateText(d.date)}</td>
                          <td>
                            <strong>{piecesTotal(d.pieces)}</strong>
                          </td>
                          <td>
                            {inv && !inv.voidEntryId ? (
                              <button className="link" onClick={() => navigate('invoice', inv.id)}>
                                فاتورة {inv.number}
                              </button>
                            ) : can('sales.create') ? (
                              <button className="ghost" onClick={() => setBilling(d)}>
                                فوترة
                              </button>
                            ) : (
                              <span className="muted">بدون فاتورة</span>
                            )}
                          </td>
                          <td>
                            <button className="ghost" title="طباعة إشعار التسليم" onClick={() => print({ kind: 'delivery', order: existing, delivery: d })}>
                              <Icon name="printer" size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
      {cutting && existing && <CutDialog order={existing} onClose={() => setCutting(false)} />}
      {delivering && existing && (
        <DeliverDialog
          order={existing}
          onClose={() => setDelivering(false)}
          onDone={(order, delivery) => {
            setDelivering(false);
            print({ kind: 'delivery', order, delivery });
          }}
        />
      )}
      {billing && existing && <BillDialog order={existing} delivery={billing} onClose={() => setBilling(null)} />}
      <PrintDoc doc={doc} />
    </div>
  );
}

function CutDialog({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [date, setDate] = useState(today());
  const [used, setUsed] = useState<Record<string, string>>({});
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const rolls = Object.values(state.rolls)
    .filter((r) => r.partyId === order.partyId)
    .map((r) => ({ r, left: rollRemainingCm(state, r) }))
    .filter(({ left, r }) => left > 0 && matches(query, r.code, r.fabric, r.color))
    .sort((a, b) => a.r.code.localeCompare(b.r.code, 'ar', { numeric: true }));
  const chosen = Object.entries(used)
    .map(([rollId, t]) => ({ rollId, cm: parseMeters(t) }))
    .filter((x) => x.cm > 0);
  const cm = chosen.reduce((t, x) => t + x.cm, 0);
  const count = order.sizes.reduce((t, z) => t + (Number(pieces[z]) || 0), 0);
  return (
    <Modal title={`قصّة جديدة — ${order.model}`} onClose={onClose} width={900}>
      <div className="form-grid four">
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="عدد الطبقات، طول المدّة..." />
        </Field>
      </div>
      <h4>الأتواب اللي انقص منها</h4>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم التوب..." />
      </div>
      {rolls.length === 0 ? (
        <Empty>ما في أتواب فيها باقي لهالزبون. سجّل استلام الأتواب أولاً من «أتواب القماش».</Empty>
      ) : (
        <div className="roll-pick">
          {rolls.map(({ r, left }) => {
            const on = used[r.id] !== undefined;
            return (
              <label key={r.id} className={`roll-chip ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    const next = { ...used };
                    if (e.target.checked) next[r.id] = meters(left);
                    else delete next[r.id];
                    setUsed(next);
                  }}
                />
                <span className="mono">
                  <strong>{r.code}</strong>
                </span>
                <small>
                  {r.fabric}
                  {r.color ? ` · ${r.color}` : ''} · باقي {meters(left)} م
                </small>
                {on && <input className="num-input" value={used[r.id]} onChange={(e) => setUsed({ ...used, [r.id]: e.target.value })} onClick={(e) => e.preventDefault()} title="الأمتار المستعملة" />}
              </label>
            );
          })}
        </div>
      )}
      <h4>عدد القطع المقصوصة</h4>
      <div className="size-inputs">
        {order.sizes.map((z) => (
          <label key={z} className="measure">
            <span>{z}</span>
            <input value={pieces[z] ?? ''} onChange={(e) => setPieces({ ...pieces, [z]: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" />
          </label>
        ))}
      </div>
      <div className="kv">
        <span>الأمتار</span>
        <strong>{meters(cm)}</strong>
        <span>القطع</span>
        <strong>{count}</strong>
        <span>متر للقطعة</span>
        <strong>{count > 0 ? meters(Math.round(cm / count)) : '—'}</strong>
      </div>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button
          className="primary"
          onClick={async () => {
            const res = await call('addCut', order.id, {
              date,
              rolls: chosen,
              pieces: Object.fromEntries(order.sizes.map((z) => [z, Number(pieces[z]) || 0]).filter(([, v]) => (v as number) > 0)),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            });
            if (res) {
              notify(`تم تسجيل القصّة: ${count} قطعة من ${meters(cm)} متر`);
              onClose();
            }
          }}
        >
          حفظ القصّة
        </button>
      </div>
    </Modal>
  );
}

function DeliverDialog({ order, onClose, onDone }: { order: WorkOrder; onClose: () => void; onDone: (o: WorkOrder, d: WorkDelivery) => void }) {
  const { state, call, notify, can } = useCompany();
  const p = workOrderProgress(state, order);
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [invoice, setInvoice] = useState(can('sales.create'));
  const [paid, setPaid] = useState('');
  const cashes = cashAccounts(state, order.currency);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  const [notes, setNotes] = useState('');
  const count = order.sizes.reduce((t, z) => t + (Number(pieces[z]) || 0), 0);
  return (
    <Modal title={`تسليم دفعة — ${order.model}`} onClose={onClose} width={760}>
      <div className="button-row">
        <button type="button" onClick={() => setPieces(Object.fromEntries(order.sizes.map((z) => [z, String(p.readyBySize[z] ?? 0)])))}>
          كل الجاهز ({p.cut - p.delivered})
        </button>
      </div>
      <div className="size-inputs">
        {order.sizes.map((z) => (
          <label key={z} className="measure">
            <span>
              {z} <small className="muted">(جاهز {p.readyBySize[z] ?? 0})</small>
            </span>
            <input value={pieces[z] ?? ''} onChange={(e) => setPieces({ ...pieces, [z]: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" />
          </label>
        ))}
      </div>
      <div className="form-grid">
        <Field label="ملاحظات" wide>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {can('sales.create') && (
          <label className="check wide">
            <input type="checkbox" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} />
            اعمل فاتورة بالأجرة: {count} × {money(state, order.pieceRate, order.currency)} = <strong>{money(state, count * order.pieceRate, order.currency)}</strong>
          </label>
        )}
        {invoice && (
          <>
            <Field label="المقبوض الآن (الباقي دين)">
              <input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="الصندوق">
              <select value={cash} onChange={(e) => setCash(e.target.value)}>
                {cashes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button
          className="primary"
          disabled={count <= 0}
          onClick={async () => {
            let paidMinor = 0;
            try {
              paidMinor = paid.trim() ? parseAmount(state, paid, order.currency) : 0;
            } catch {
              return notify('مبلغ غير صالح', 'error');
            }
            const res = await call<{ order: WorkOrder; invoice?: Invoice }>('deliverWork', order.id, {
              date: today(),
              pieces: Object.fromEntries(order.sizes.map((z) => [z, Number(pieces[z]) || 0]).filter(([, v]) => (v as number) > 0)),
              invoice,
              ...(invoice ? { paid: paidMinor, cashAccountId: cash } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            });
            if (res) {
              notify(res.value.invoice ? `تم التسليم وإصدار فاتورة رقم ${res.value.invoice.number}` : 'تم تسجيل التسليم');
              onDone(res.value.order, res.value.order.deliveries[res.value.order.deliveries.length - 1]!);
            }
          }}
        >
          تسليم وطباعة الإشعار
        </button>
      </div>
    </Modal>
  );
}

function BillDialog({ order, delivery, onClose }: { order: WorkOrder; delivery: WorkDelivery; onClose: () => void }) {
  const { state, call, notify, navigate } = useCompany();
  const [paid, setPaid] = useState('');
  const count = piecesTotal(delivery.pieces);
  return (
    <Modal title={`فوترة دفعة التسليم رقم ${delivery.number}`} onClose={onClose}>
      <div className="kv">
        <span>القطع</span>
        <strong>{count}</strong>
        <span>الأجرة</span>
        <strong>{money(state, count * order.pieceRate, order.currency)}</strong>
      </div>
      <Field label="المقبوض الآن (الباقي دين)">
        <input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder="0" autoFocus />
      </Field>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button
          className="primary"
          onClick={async () => {
            let paidMinor = 0;
            try {
              paidMinor = paid.trim() ? parseAmount(state, paid, order.currency) : 0;
            } catch {
              return notify('مبلغ غير صالح', 'error');
            }
            const res = await call<Invoice>('invoiceDelivery', order.id, delivery.id, { date: today(), paid: paidMinor });
            if (res) {
              notify(`تم إصدار فاتورة رقم ${res.value.number}`);
              navigate('invoice', res.value.id);
            }
          }}
        >
          إصدار الفاتورة
        </button>
      </div>
    </Modal>
  );
}
