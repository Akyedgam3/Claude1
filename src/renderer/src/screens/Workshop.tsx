import { useMemo, useState } from 'react';
import {
  convertLength,
  laysFrom,
  normalizeRoll,
  partyStatement,
  piecesTotal,
  rollRemaining,
  rollReturned,
  rollUsed,
  UNIT_NAMES,
  workOrderProgress,
  type FabricRoll,
  type Invoice,
  type LengthUnit,
  type WorkDelivery,
  type WorkOrder,
  type WorkStage,
} from '../../../core';
import { addDays, dateText, money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, usePrinter } from '../components/print';
import { ConfirmButton, CurrencySelect, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox, Tabs } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';

// الأطوال مخزنة بأجزاء المئة من الوحدة (يارد أو متر)
export const len = (v: number): string => (v / 100).toLocaleString('en', { maximumFractionDigits: 2 });
const lenU = (v: number, u: LengthUnit) => `${len(v)} ${UNIT_NAMES[u]}`;
const parseLen = (text: string): number => {
  const v = Number(text.replace(/[,،]/g, '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(v) && text.trim() ? Math.round(v * 100) : NaN;
};
const int = (text: string | undefined) => Math.max(0, Math.round(Number(text) || 0));
const digits = (t: string) => t.replace(/[^\d]/g, '');

const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: '38 → 42', sizes: ['38', '40', '42'] },
  { label: '36 → 46', sizes: ['36', '38', '40', '42', '44', '46'] },
  { label: 'S → XXL', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'أطفال 2 → 12', sizes: ['2', '4', '6', '8', '10', '12'] },
  { label: 'نمرة وحدة', sizes: ['واحد'] },
];
const EXPENSE_KINDS = ['استيك', 'خيط', 'بطانة', 'أزرار', 'سحابات', 'تطريز', 'كبس', 'تغليف', 'نقل', 'أخرى'];
const STAGE_NAMES: Record<WorkStage['stage'], string> = { sewing: 'دخل الخياطة', done: 'خلص (منجز)', damaged: 'تالف' };
const STATUS_NAMES: Record<WorkOrder['status'], string> = { open: 'قيد العمل', done: 'منتهية', cancelled: 'ملغاة' };

/** أول يوم بالأسبوع (السبت). */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const back = (d.getDay() + 1) % 7; // السبت = 6
  return addDays(iso, -back);
}

// ───────────── ورقة الطلبية (متل دفتر الخياط بس مرتبة) ─────────────

function OrderSheet({ order }: { order: WorkOrder }) {
  const { state } = useCompany();
  const o = order;
  const unit = o.unit ?? 'm';
  const p = workOrderProgress(state, o);
  const party = state.parties[o.partyId];
  // كل توب انمد بهالطلبية: مداته ومستعمله
  const rollRows = new Map<string, { lays: number; used: number }>();
  for (const c of o.cuts)
    for (const r of c.rolls) {
      const x = rollRows.get(r.rollId) ?? { lays: 0, used: 0 };
      x.lays += r.lays ?? 0;
      x.used += r.used;
      rollRows.set(r.rollId, x);
    }
  const rolls = [...rollRows.entries()].map(([id, x]) => ({ roll: normalizeRoll(state.rolls[id]!), ...x }));
  const balance = partyStatement(state, o.partyId).closing;
  return (
    <div className="order-sheet">
      <div className="sheet-head">
        <div>
          <div className="sheet-kicker">طلبية إنتاج رقم {o.number}</div>
          <h2>
            {o.model}
            {o.modelCode && (
              <small dir="ltr"> {o.modelCode}</small>
            )}
          </h2>
          <div className="muted">
            {party?.name} · {dateText(o.date)}
            {o.dueDate ? ` · التسليم ${dateText(o.dueDate)}` : ''}
          </div>
        </div>
        {o.markerLength ? (
          <div className="sheet-marker">
            <span>طول الرسمة</span>
            <strong>{lenU(o.markerLength, unit)}</strong>
            {p.piecesPerLay > 0 && <small>{p.piecesPerLay} قطع بالمدة</small>}
          </div>
        ) : null}
      </div>
      <div className="sheet-tables">
        <table className="sheet-table">
          <thead>
            <tr>
              <th>النمرة</th>
              <th>المطلوب</th>
              <th>المقصوص</th>
              <th>المنجز</th>
              <th>المسلّم</th>
            </tr>
          </thead>
          <tbody>
            {o.sizes.map((z) => (
              <tr key={z}>
                <td className="strong">{z}</td>
                <td>{o.planned[z] ?? 0}</td>
                <td>{p.cutBySize[z] ?? 0}</td>
                <td>{p.usesDone ? (p.doneBySize[z] ?? 0) : '—'}</td>
                <td>{p.deliveredBySize[z] ?? 0}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>المجموع</td>
              <td>{p.planned}</td>
              <td>{p.cut}</td>
              <td>{p.usesDone ? p.done : '—'}</td>
              <td>{p.delivered}</td>
            </tr>
          </tfoot>
        </table>
        <table className="sheet-table">
          <thead>
            <tr>
              <th>رقم التوب</th>
              <th>الطول</th>
              <th>المدات</th>
              <th>الباقي</th>
            </tr>
          </thead>
          <tbody>
            {rolls.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  ما انمد قماش بعد
                </td>
              </tr>
            )}
            {rolls.map(({ roll, lays, used }) => (
              <tr key={roll.id}>
                <td className="strong">{roll.code}</td>
                <td>{len(convertLength(used, roll.unit, unit))}</td>
                <td>{lays || '—'}</td>
                <td>{len(convertLength(rollRemaining(state, roll), roll.unit, unit))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>المجموع</td>
              <td>{lenU(p.used, unit)}</td>
              <td>{p.lays || '—'}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="sheet-stats">
        {p.laysNeeded !== null && (
          <div>
            <span>المدات</span>
            <strong>
              {p.lays} / {p.laysNeeded}
            </strong>
          </div>
        )}
        <div>
          <span>مقصوص</span>
          <strong>{p.cut}</strong>
        </div>
        {p.usesSewing && (
          <div>
            <span>دخل الخياطة</span>
            <strong>{p.sewing}</strong>
          </div>
        )}
        {p.usesDone && (
          <div>
            <span>منجز</span>
            <strong>{p.done}</strong>
          </div>
        )}
        <div className={p.damaged ? 'bad' : ''}>
          <span>تالف</span>
          <strong>{p.damaged}</strong>
        </div>
        <div>
          <span>مسلّم</span>
          <strong>{p.delivered}</strong>
        </div>
        {p.cut > 0 && p.shortage > 0 && (
          <div className="bad">
            <span>ناقص عن المطلوب</span>
            <strong>{p.shortage}</strong>
          </div>
        )}
        {p.perPiece && (
          <div>
            <span>للقطعة</span>
            <strong>{lenU(Math.round(p.perPiece), unit)}</strong>
          </div>
        )}
      </div>
      <div className="sheet-money">
        <div>
          <span>
            أجرة المسلّم ({p.delivered} × {money(state, o.pieceRate, o.currency)})
          </span>
          <strong>{money(state, p.earned, o.currency)}</strong>
        </div>
        {p.expensesCustomer > 0 && (
          <div>
            <span>مصاريف على الزبون</span>
            <strong>{money(state, p.expensesCustomer, o.currency)}</strong>
          </div>
        )}
        <div className="grand">
          <span>{balance >= 0 ? 'رصيد الحساب لنا عند الزبون' : 'رصيد الحساب للزبون عندنا'}</span>
          <strong>{money(state, Math.abs(balance))}</strong>
        </div>
      </div>
    </div>
  );
}

type Doc =
  | { kind: 'receipt'; rolls: FabricRoll[] }
  | { kind: 'delivery'; order: WorkOrder; delivery: WorkDelivery }
  | { kind: 'sheet'; order: WorkOrder }
  | { kind: 'fabric'; partyId: string }
  | { kind: 'account'; partyId: string; from: string; to: string }
  | null;

function PrintDoc({ doc }: { doc: Doc }) {
  const { state } = useCompany();
  if (!doc) return null;
  let body: React.ReactNode = null;
  if (doc.kind === 'sheet') {
    body = (
      <>
        <DocHeader title="ورقة طلبية" />
        <OrderSheet order={state.workOrders[doc.order.id] ?? doc.order} />
      </>
    );
  } else if (doc.kind === 'receipt') {
    const first = normalizeRoll(doc.rolls[0]!);
    const total = doc.rolls.reduce((t, r) => t + normalizeRoll(r).length, 0);
    body = (
      <>
        <DocHeader title="سند استلام أقمشة">
          <div>رقم: {first.receiptNo}</div>
          <div className="ltr">{dateText(first.date)}</div>
        </DocHeader>
        <p>
          استلمنا من: <strong>{state.parties[first.partyId]?.name}</strong> الأقمشة التالية للتشغيل:
        </p>
        <table className="doc-lines">
          <thead>
            <tr>
              <th className="n">#</th>
              <th>رقم التوب</th>
              <th>القماش</th>
              <th>الطول ({UNIT_NAMES[first.unit]})</th>
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
                <td>{len(normalizeRoll(r).length)}</td>
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
            <span>مجموع الطول</span>
            <strong>{lenU(total, first.unit)}</strong>
          </div>
        </div>
        <div className="doc-signatures">
          <div>توقيع المستلم</div>
          <div>توقيع صاحب القماش</div>
        </div>
      </>
    );
  } else if (doc.kind === 'delivery') {
    const { order: o, delivery: d } = doc;
    body = (
      <>
        <DocHeader title="إشعار تسليم بضاعة">
          <div>رقم: {d.number}</div>
          <div className="ltr">{dateText(d.date)}</div>
        </DocHeader>
        <p>
          السادة: <strong>{state.parties[o.partyId]?.name}</strong> — طلبية رقم {o.number}: <strong>{o.model}</strong>
          {o.modelCode ? ` (${o.modelCode})` : ''}
        </p>
        <table className="doc-lines">
          <thead>
            <tr>
              <th>النمرة</th>
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
      </>
    );
  } else if (doc.kind === 'fabric') {
    const rolls = Object.values(state.rolls)
      .filter((r) => r.partyId === doc.partyId)
      .map(normalizeRoll)
      .sort((a, b) => a.code.localeCompare(b.code, 'ar', { numeric: true }));
    body = (
      <>
        <DocHeader title="كشف أقمشة زبون">
          <div>{state.parties[doc.partyId]?.name}</div>
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
                <td>{lenU(r.length, r.unit)}</td>
                <td>{len(rollUsed(state, r.id))}</td>
                <td>{len(rollReturned(r))}</td>
                <td>{len(rollRemaining(state, r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  } else {
    body = <AccountView partyId={doc.partyId} from={doc.from} to={doc.to} printing />;
  }
  return (
    <div className="print-only">
      <div className="print-area invoice-doc">{body}</div>
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
  const pdf = (d: Doc, name: string) => {
    setDoc(d);
    setTimeout(() => void printer.pdf(name), 60);
  };
  return { doc, print, pdf };
}

function Bar({ value, max, tone }: { value: number; max: number; tone?: 'good' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span className={`meter ${tone ?? ''}`} title={`${pct}%`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Workshop({ tab: initialTab }: { tab?: string }) {
  type T = 'orders' | 'rolls' | 'account' | 'fabric';
  const [tab, setTab] = useState<T>((['orders', 'rolls', 'account', 'fabric'].includes(initialTab ?? '') ? initialTab : 'orders') as T);
  return (
    <div className="page">
      <PageHeader title="ورشة الخياطة" />
      <Tabs
        tabs={[
          { key: 'orders', label: 'الطلبيات' },
          { key: 'rolls', label: 'أتواب القماش' },
          { key: 'account', label: 'حساب صاحب الشغل' },
          { key: 'fabric', label: 'كشف الأقمشة' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'orders' && <OrdersTab />}
      {tab === 'rolls' && <RollsTab />}
      {tab === 'account' && <AccountTab />}
      {tab === 'fabric' && <FabricTab />}
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
      return { planned: t.planned + p.planned, cut: t.cut + p.cut, done: t.done + (p.usesDone ? p.done : 0), ready: t.ready + Object.values(p.readyBySize).reduce((s, v) => s + v, 0) };
    },
    { planned: 0, cut: 0, done: 0, ready: 0 },
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
        <Empty>لا توجد طلبيات. ابدأ باستلام أتواب القماش من الزبون، بعدين اعمل طلبية بالموديل والنمر وطول الرسمة.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الزبون</th>
              <th>الموديل</th>
              <th>التسليم</th>
              <th className="num">المطلوب</th>
              <th>المدات</th>
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
                  <td>{p.laysNeeded !== null ? `${p.lays} / ${p.laysNeeded}` : p.lays || '—'}</td>
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
  const all = Object.values(state.rolls).map(normalizeRoll);
  const rows = all
    .filter((r) => !partyId || r.partyId === partyId)
    .map((r) => ({ r, left: rollRemaining(state, r), used: rollUsed(state, r.id), ret: rollReturned(r) }))
    .filter(({ left }) => status === 'all' || (status === 'available' ? left > 0 : left <= 0))
    .filter(({ r }) => matches(query, r.code, r.fabric, r.color, r.receiptNo, state.parties[r.partyId]?.name))
    .sort((a, b) => b.r.date.localeCompare(a.r.date) || a.r.code.localeCompare(b.r.code, 'ar', { numeric: true }));
  const units = new Set(rows.map((x) => x.r.unit));
  const u: LengthUnit | null = units.size === 1 ? [...units][0]! : null;
  const sum = (f: (x: (typeof rows)[number]) => number) => rows.reduce((t, x) => t + f(x), 0);
  return (
    <>
      <div className="stats">
        <div className="stat">
          <span>عدد الأتواب</span>
          <strong>{rows.length}</strong>
        </div>
        {u && (
          <>
            <div className="stat">
              <span>الوارد ({UNIT_NAMES[u]})</span>
              <strong>{len(sum((x) => x.r.length))}</strong>
            </div>
            <div className="stat">
              <span>المستعمل ({UNIT_NAMES[u]})</span>
              <strong>{len(sum((x) => x.used))}</strong>
            </div>
            <div className="stat">
              <span>الباقي عندنا ({UNIT_NAMES[u]})</span>
              <strong className="good">{len(sum((x) => x.left))}</strong>
            </div>
          </>
        )}
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
                <td className="num">{lenU(r.length, r.unit)}</td>
                <td className="num">{len(used)}</td>
                <td className="num">{ret ? len(ret) : '—'}</td>
                <td>
                  <div className="meter-row">
                    <Bar value={left} max={r.length} tone={left > 0 ? 'good' : undefined} />
                    <strong>{len(left)}</strong>
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
  length: string;
  fabric: string;
  color: string;
}

/** A-101 ← A-102 ، 120 ← 121 */
function nextCode(code: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(code.trim());
  if (!m) return '';
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2]!.length, '0')}${m[3]}`;
}

function ReceiveRolls({ partyId: initialParty, onClose, onSaved }: { partyId?: string; onClose: () => void; onSaved: (rolls: FabricRoll[]) => void }) {
  const { state, call, notify } = useCompany();
  const [partyId, setPartyId] = useState<string | null>(initialParty ?? null);
  const [date, setDate] = useState(today());
  const [unit, setUnit] = useState<LengthUnit>('yd');
  const [fabric, setFabric] = useState('');
  const [color, setColor] = useState('');
  const blank = (code = ''): RollRow => ({ key: uid(), code, length: '', fabric: '', color: '' });
  const [rows, setRows] = useState<RollRow[]>([blank()]);
  const [paste, setPaste] = useState('');
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const valid = rows.filter((r) => r.code.trim() && parseLen(r.length) > 0);
  const total = valid.reduce((t, r) => t + parseLen(r.length), 0);
  const upd = (key: string, k: keyof RollRow, v: string) => setRows(rows.map((r) => (r.key === key ? { ...r, [k]: v } : r)));

  // لصق قائمة: كل سطر "رقم التوب  الطول"
  const applyPaste = () => {
    const parsed = paste
      .split(/\r?\n/)
      .map((line) => line.trim().split(/[\t;|:]+|\s+/))
      .filter((p) => p.length >= 2 && p[0])
      .map((p) => ({ ...blank(p[0]!.trim()), length: p[p.length - 1]!.trim() }));
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
      unit,
      rolls: valid.map((r) => ({
        code: r.code.trim(),
        fabric: (r.fabric || fabric).trim() || 'قماش',
        ...((r.color || color).trim() ? { color: (r.color || color).trim() } : {}),
        length: parseLen(r.length),
      })),
    });
    if (res) {
      notify(`تم استلام ${res.value.length} توب — سند رقم ${res.value[0]!.receiptNo}`);
      onSaved(res.value);
    }
  };

  return (
    <Modal title="استلام أتواب قماش من زبون" onClose={onClose} width={860}>
      <div className="form-grid four">
        <Field label="صاحب القماش" wide>
          <Picker options={customers} value={partyId} onChange={setPartyId} placeholder="ابحث بالاسم أو الهاتف..." />
        </Field>
        <Field label="تاريخ الاستلام">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="وحدة الطول">
          <select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)}>
            <option value="yd">يارد</option>
            <option value="m">متر</option>
          </select>
        </Field>
        <Field label="نوع القماش (للكل)">
          <input value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="جوخ، قطن، جينز..." />
        </Field>
        <Field label="اللون (للكل)">
          <input value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
      </div>
      <table className="table lines">
        <thead>
          <tr>
            <th>رقم التوب</th>
            <th>الطول ({UNIT_NAMES[unit]})</th>
            <th>النوع (إذا مختلف)</th>
            <th>اللون (إذا مختلف)</th>
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
                      setRows([...rows, blank(nextCode(r.code))]);
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
                <button type="button" className="icon" title="حذف" onClick={() => setRows(rows.length > 1 ? rows.filter((x) => x.key !== r.key) : rows)}>
                  <Icon name="close" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        <button type="button" onClick={() => setRows([...rows, blank(nextCode(rows[rows.length - 1]?.code ?? ''))])}>
          <Icon name="plus" size={16} /> توب
        </button>
        <span className="muted">Enter بخانة الطول بيضيف سطر جديد ورقم التوب التالي</span>
      </div>
      <details className="paste-box">
        <summary>عندك قائمة طويلة؟ الصقها مرة وحدة</summary>
        <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'120  110\n140  120\n141  95'} dir="ltr" />
        <button type="button" onClick={applyPaste} disabled={!paste.trim()}>
          إضافة القائمة
        </button>
      </details>
      <div className="kv">
        <span>عدد الأتواب</span>
        <strong>{valid.length}</strong>
        <span>مجموع الطول</span>
        <strong>{lenU(total, unit)}</strong>
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

function EditRoll({ roll: raw, onClose }: { roll: FabricRoll; onClose: () => void }) {
  const { call, notify } = useCompany();
  const roll = normalizeRoll(raw);
  const [f, setF] = useState({ code: roll.code, fabric: roll.fabric, color: roll.color ?? '', length: len(roll.length), unit: roll.unit, notes: roll.notes ?? '' });
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
            unit: f.unit,
            length: parseLen(f.length),
            ...(f.color.trim() ? { color: f.color.trim() } : {}),
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
        <Field label={`الطول (${UNIT_NAMES[f.unit]})`}>
          <span className="with-button">
            <input value={f.length} onChange={(e) => setF({ ...f, length: e.target.value })} inputMode="decimal" />
            <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as LengthUnit })}>
              <option value="yd">يارد</option>
              <option value="m">متر</option>
            </select>
          </span>
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

function ReturnRoll({ roll: raw, onClose }: { roll: FabricRoll; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const roll = normalizeRoll(raw);
  const left = rollRemaining(state, roll);
  const [length, setLength] = useState(len(left));
  const [note, setNote] = useState('');
  return (
    <Modal title={`إرجاع بواقي التوب ${roll.code}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call('returnRoll', roll.id, { date: today(), length: parseLen(length), ...(note.trim() ? { note: note.trim() } : {}) })) {
            notify('تم تسجيل الإرجاع');
            onClose();
          }
        }}
      >
        <p className="muted wide">
          الباقي بالتوب: <strong>{lenU(left, roll.unit)}</strong>
        </p>
        <Field label={`الطول المرتجع (${UNIT_NAMES[roll.unit]})`}>
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

function FabricTab() {
  const { state } = useCompany();
  const [partyId, setPartyId] = useState<string | null>(null);
  const { doc, print } = usePrintDoc();
  const owners = useMemo(() => {
    const ids = new Set(Object.values(state.rolls).map((r) => r.partyId));
    return partyOptions(state).filter((o) => ids.has(o.id));
  }, [state]);
  const rolls = partyId
    ? Object.values(state.rolls)
        .filter((r) => r.partyId === partyId)
        .map(normalizeRoll)
    : [];
  const units = [...new Set(rolls.map((r) => r.unit))];
  return (
    <>
      <div className="toolbar">
        <div style={{ minWidth: 300 }}>
          <Picker options={owners} value={partyId} onChange={setPartyId} placeholder="اختار الزبون..." />
        </div>
        {partyId && (
          <button onClick={() => print({ kind: 'fabric', partyId })}>
            <Icon name="printer" size={16} /> طباعة الكشف
          </button>
        )}
      </div>
      {!partyId ? (
        <Empty>اختار زبون لتشوف كل أقمشته: شو وصل، شو انمدّ، شو رجع، وشو باقي عندك.</Empty>
      ) : (
        <>
          <div className="stats">
            {units.map((u) => {
              const rs = rolls.filter((r) => r.unit === u);
              const sum = (f: (r: FabricRoll) => number) => rs.reduce((t, r) => t + f(r), 0);
              return (
                <div key={u} className="stat">
                  <span>
                    {rs.length} توب — الوارد {lenU(sum((r) => r.length), u)}
                  </span>
                  <strong className="good">باقي {lenU(sum((r) => rollRemaining(state, r)), u)}</strong>
                  <small className="muted">
                    مستعمل {len(sum((r) => rollUsed(state, r.id)))} · مرتجع {len(sum(rollReturned))}
                  </small>
                </div>
              );
            })}
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
                    <td className="num">{lenU(r.length, r.unit)}</td>
                    <td className="num">{len(rollUsed(state, r.id))}</td>
                    <td className="num">{len(rollReturned(r))}</td>
                    <td className="num">
                      <strong>{len(rollRemaining(state, r))}</strong>
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

// ───────────── حساب صاحب الشغل ─────────────

/** يصنّف حركة الحساب حسب مصدرها (تسليم، مصروف، دفعة، إضافة/خصم). */
function kindOf(state: ReturnType<typeof useCompany>['state'], entryId: string): string {
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) return '';
  if (e.voidOf) return 'إلغاء';
  const t = e.source?.type;
  if (t === 'workorder' || (t && state.invoices.some((i) => i.id === e.source!.id && i.source?.type === 'workorder'))) return 'تسليم';
  if (t === 'receipt') return 'دفعة مقبوضة';
  if (t === 'payment') return e.memo.includes('طلبية إنتاج') ? 'مصروف' : 'دفعة له';
  if (t === 'work-adjust') return e.memo.startsWith('خصم') ? 'خصم' : 'إضافة';
  if (t === 'sale') return 'فاتورة';
  return '';
}

function AccountView({ partyId, from, to, printing }: { partyId: string; from: string; to: string; printing?: boolean }) {
  const { state } = useCompany();
  const st = partyStatement(state, partyId, { from, to });
  const party = state.parties[partyId];
  // إنتاج الفترة: القطع المسلّمة لكل طلبية
  const made = Object.values(state.workOrders)
    .filter((o) => o.partyId === partyId)
    .map((o) => {
      const ds = o.deliveries.filter((d) => d.date >= from && d.date <= to);
      const n = ds.reduce((t, d) => t + piecesTotal(d.pieces), 0);
      return { o, n };
    })
    .filter((x) => x.n > 0);
  const sumBy = (k: string, side: 'debit' | 'credit') => st.rows.filter((r) => kindOf(state, r.entryId) === k).reduce((t, r) => t + r[side], 0);
  const closing = st.closing;
  return (
    <div className="account-view">
      {printing && (
        <DocHeader title="كشف حساب الشغل">
          <div>{party?.name}</div>
          <div className="ltr">
            {dateText(from)} → {dateText(to)}
          </div>
        </DocHeader>
      )}
      <div className="sheet-money">
        <div>
          <span>رصيد سابق</span>
          <strong>{money(state, st.opening)}</strong>
        </div>
        <div>
          <span>+ قيمة القطع المسلّمة</span>
          <strong>{money(state, sumBy('تسليم', 'debit') + sumBy('فاتورة', 'debit'))}</strong>
        </div>
        <div>
          <span>+ مصاريف على الزبون</span>
          <strong>{money(state, sumBy('مصروف', 'debit'))}</strong>
        </div>
        <div>
          <span>+ إضافات / − خصومات</span>
          <strong>{money(state, sumBy('إضافة', 'debit') - sumBy('خصم', 'credit'))}</strong>
        </div>
        <div>
          <span>− الدفعات المستلمة</span>
          <strong>{money(state, sumBy('دفعة مقبوضة', 'credit'))}</strong>
        </div>
        <div className={`grand ${closing < 0 ? 'bad' : ''}`}>
          <span>{closing >= 0 ? 'الرصيد: لنا عند الزبون' : 'الرصيد: صار علينا للزبون (مقبوض زيادة)'}</span>
          <strong>{money(state, Math.abs(closing))}</strong>
        </div>
      </div>
      {made.length > 0 && (
        <>
          <h4>الإنتاج المسلّم بالفترة</h4>
          <table className={printing ? 'doc-lines' : 'table compact'}>
            <thead>
              <tr>
                <th>الموديل</th>
                <th>القطع</th>
                <th>سعر الخياطة</th>
                <th>القيمة</th>
              </tr>
            </thead>
            <tbody>
              {made.map(({ o, n }) => (
                <tr key={o.id}>
                  <td>
                    {o.model} <small className="muted">#{o.number}</small>
                  </td>
                  <td>{n}</td>
                  <td>{money(state, o.pieceRate, o.currency)}</td>
                  <td>{money(state, n * o.pieceRate, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h4>الحركات</h4>
      <table className={printing ? 'doc-lines' : 'table compact'}>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th>البيان</th>
            <th>لنا (+)</th>
            <th>علينا / مقبوض (−)</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {st.rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                ما في حركات بهالفترة
              </td>
            </tr>
          )}
          {st.rows.map((r) => (
            <tr key={r.entryId}>
              <td>{dateText(r.date)}</td>
              <td>{kindOf(state, r.entryId)}</td>
              <td>{r.memo}</td>
              <td className="num">{r.debit ? money(state, r.debit) : ''}</td>
              <td className="num">{r.credit ? money(state, r.credit) : ''}</td>
              <td className={`num ${r.running < 0 ? 'bad' : ''}`}>{money(state, r.running)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountTab() {
  const { state, can } = useCompany();
  const owners = useMemo(() => {
    const ids = new Set([...Object.values(state.workOrders).map((o) => o.partyId), ...Object.values(state.rolls).map((r) => r.partyId)]);
    return partyOptions(state, 'customer').filter((o) => ids.has(o.id));
  }, [state]);
  const [partyId, setPartyId] = useState<string | null>(owners[0]?.id ?? null);
  const [from, setFrom] = useState(weekStart(today()));
  const [to, setTo] = useState(today());
  const [dialog, setDialog] = useState<'receipt' | 'adjust' | null>(null);
  const { doc, print, pdf } = usePrintDoc();
  return (
    <>
      <div className="toolbar">
        <div style={{ minWidth: 260 }}>
          <Picker options={owners} value={partyId} onChange={setPartyId} placeholder="اختار صاحب الشغل..." />
        </div>
        <label className="inline-field">
          من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inline-field">
          إلى <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          className="ghost"
          onClick={() => {
            setFrom(weekStart(today()));
            setTo(today());
          }}
        >
          هالأسبوع
        </button>
        <button
          className="ghost"
          onClick={() => {
            const s = weekStart(today());
            setFrom(addDays(s, -7));
            setTo(addDays(s, -1));
          }}
        >
          الأسبوع الماضي
        </button>
      </div>
      {!partyId ? (
        <Empty>اختار صاحب الشغل لتشوف حسابه: القطع المنجزة، المصاريف، الإضافات والخصومات، والدفعات.</Empty>
      ) : (
        <>
          <div className="button-row">
            {can('vouchers.create') && (
              <>
                <button className="primary" onClick={() => setDialog('receipt')}>
                  <Icon name="wallet" size={16} /> قبض دفعة
                </button>
                <button onClick={() => setDialog('adjust')}>إضافة / خصم حسب الاتفاق</button>
              </>
            )}
            <button onClick={() => print({ kind: 'account', partyId, from, to })}>
              <Icon name="printer" size={16} /> طباعة الكشف
            </button>
            <button className="ghost" onClick={() => pdf({ kind: 'account', partyId, from, to }, `حساب ${state.parties[partyId]?.name ?? ''}`)}>
              PDF
            </button>
          </div>
          <section className="card">
            <AccountView partyId={partyId} from={from} to={to} />
          </section>
        </>
      )}
      {dialog && partyId && <MoneyDialog kind={dialog} partyId={partyId} onClose={() => setDialog(null)} />}
      <PrintDoc doc={doc} />
    </>
  );
}

function MoneyDialog({ kind, partyId, onClose }: { kind: 'receipt' | 'adjust'; partyId: string; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(kind === 'receipt' ? 'دفعة على حساب الشغل' : '');
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [date, setDate] = useState(today());
  const cashes = cashAccounts(state, base);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  return (
    <Modal title={kind === 'receipt' ? `قبض دفعة من ${state.parties[partyId]?.name}` : 'إضافة أو خصم على الحساب'} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let v = 0;
          try {
            v = parseAmount(state, amount, base);
          } catch {
            return notify('مبلغ غير صالح', 'error');
          }
          const res =
            kind === 'receipt'
              ? await call('postVoucher', { kind: 'receipt', date, amount: v, partyId, memo: note.trim() || 'دفعة على حساب الشغل', cashAccountId: cash })
              : await call('addWorkAdjustment', partyId, { date, amount: v, direction, note });
          if (res) {
            notify('تم التسجيل');
            onClose();
          }
        }}
      >
        {kind === 'adjust' && (
          <div className="segmented wide">
            <button type="button" className={direction === 'add' ? 'active' : ''} onClick={() => setDirection('add')}>
              إضافة على الزبون
            </button>
            <button type="button" className={direction === 'deduct' ? 'active' : ''} onClick={() => setDirection('deduct')}>
              خصم للزبون
            </button>
          </div>
        )}
        <Field label="المبلغ">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {kind === 'receipt' && (
          <Field label="الصندوق">
            <select value={cash} onChange={(e) => setCash(e.target.value)}>
              {cashes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={kind === 'receipt' ? 'البيان' : 'السبب'} wide>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'adjust' ? 'تطريز إضافي، تأخير بالتسليم، قطع تالفة...' : ''} />
        </Field>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">تسجيل</button>
        </div>
      </form>
    </Modal>
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
  const [unit, setUnit] = useState<LengthUnit>(existing?.unit ?? 'yd');
  const [marker, setMarker] = useState(existing?.markerLength ? len(existing.markerLength) : '');
  const [sizes, setSizes] = useState<string[]>(existing?.sizes ?? ['38', '40', '42']);
  const [planned, setPlanned] = useState<Record<string, string>>(Object.fromEntries(Object.entries(existing?.planned ?? {}).map(([k, v]) => [k, String(v)])));
  const [ratio, setRatio] = useState<Record<string, string>>(Object.fromEntries((existing?.sizes ?? ['38', '40', '42']).map((z) => [z, String(existing?.ratio?.[z] ?? (existing ? '' : 1))])));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [status, setStatus] = useState<WorkOrder['status']>(existing?.status ?? 'open');
  const [newSize, setNewSize] = useState('');
  const [dialog, setDialog] = useState<'cut' | 'stage' | 'expense' | 'deliver' | null>(null);
  const [billing, setBilling] = useState<WorkDelivery | null>(null);
  const { doc, print, pdf } = usePrintDoc();
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const p = existing ? workOrderProgress(state, existing) : null;

  // الخطة المحسوبة من الشاشة (قبل الحفظ)
  const plannedTotal = sizes.reduce((t, z) => t + int(planned[z]), 0);
  const perLay = sizes.reduce((t, z) => t + int(ratio[z]), 0);
  const laysNeeded = perLay > 0 ? Math.max(0, ...sizes.filter((z) => int(ratio[z]) > 0).map((z) => Math.ceil(int(planned[z]) / int(ratio[z])))) : 0;
  const markerLen = parseLen(marker);
  const needed = laysNeeded && markerLen > 0 ? laysNeeded * markerLen : 0;
  const available = partyId
    ? Object.values(state.rolls)
        .filter((r) => r.partyId === partyId)
        .reduce((t, r) => t + convertLength(rollRemaining(state, r), normalizeRoll(r).unit, unit), 0)
    : 0;
  const stillNeeded = Math.max(0, needed - (p?.used ?? 0));
  const fabricShort = needed > 0 && stillNeeded > available ? stillNeeded - available : 0;

  const save = async () => {
    if (!partyId) return notify('اختار الزبون', 'error');
    let pieceRate = 0;
    try {
      pieceRate = rate.trim() ? parseAmount(state, rate, currency) : 0;
    } catch {
      return notify('سعر الخياطة غير صالح', 'error');
    }
    if (marker.trim() && !(markerLen > 0)) return notify('طول الرسمة غير صالح', 'error');
    const r = Object.fromEntries(sizes.map((z) => [z, int(ratio[z])]));
    const res = await call<WorkOrder>('saveWorkOrder', {
      id: existing?.id ?? uid(),
      partyId,
      date,
      model: model.trim(),
      sizes,
      planned: Object.fromEntries(sizes.map((z) => [z, int(planned[z])])),
      unit,
      ...(markerLen > 0 ? { markerLength: markerLen } : {}),
      ...(piecesTotal(r) > 0 ? { ratio: r } : {}),
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
    if (v && !sizes.includes(v)) {
      setSizes([...sizes, v]);
      setRatio({ ...ratio, [v]: '1' });
    }
    setNewSize('');
  };
  const locked = (z: string) => !!p && ((p.cutBySize[z] ?? 0) > 0 || (p.deliveredBySize[z] ?? 0) > 0);
  const row = (label: string, rec: Record<string, number>, total: number, cls = '') => (
    <tr className={cls}>
      <th>{label}</th>
      {sizes.map((z) => (
        <td key={z} className="num">
          {rec[z] ?? 0}
        </td>
      ))}
      <td />
      <td className="num">
        <strong>{total.toLocaleString('en')}</strong>
      </td>
    </tr>
  );

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
        {existing && (
          <>
            <button onClick={() => print({ kind: 'sheet', order: existing })}>
              <Icon name="printer" size={16} /> ورقة الطلبية
            </button>
            <button className="ghost" onClick={() => pdf({ kind: 'sheet', order: existing }, `طلبية ${existing.number} ${existing.model}`)}>
              PDF
            </button>
          </>
        )}
      </PageHeader>

      <section className="card form-grid four">
        <Field label="صاحب الشغل" wide>
          <Picker options={customers} value={partyId} onChange={setPartyId} placeholder="ابحث بالاسم أو الهاتف..." />
        </Field>
        <Field label="الموديل">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="جلابية، قميص، بنطال..." />
        </Field>
        <Field label="رقم الموديل">
          <input value={modelCode} onChange={(e) => setModelCode(e.target.value)} dir="ltr" />
        </Field>
        <Field label="طول الرسمة">
          <span className="with-button">
            <input className="num-input" value={marker} onChange={(e) => setMarker(e.target.value)} inputMode="decimal" placeholder="5" />
            <select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)} disabled={!!p && p.lays > 0}>
              <option value="yd">يارد</option>
              <option value="m">متر</option>
            </select>
          </span>
        </Field>
        <Field label="سعر خياطة القطعة">
          <input className="num-input" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <Field label="موعد التسليم">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="تاريخ الطلبية">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
            <Icon name="ruler" size={18} /> النمر والكميات
          </h3>
          <div className="button-row">
            {SIZE_PRESETS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="ghost"
                onClick={() => {
                  setSizes(s.sizes);
                  setRatio(Object.fromEntries(s.sizes.map((z) => [z, '1'])));
                }}
                disabled={!!p && p.cut > 0}
              >
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
                  {!locked(z) && (
                    <button type="button" className="icon tiny" title="حذف النمرة" onClick={() => setSizes(sizes.filter((x) => x !== z))}>
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
                    placeholder="نمرة"
                    onChange={(e) => setNewSize(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSize(newSize);
                      }
                    }}
                  />
                  <button type="button" className="icon" title="إضافة نمرة" onClick={() => addSize(newSize)} disabled={!newSize.trim()}>
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
                  <input className="num-input" value={planned[z] ?? ''} onChange={(e) => setPlanned({ ...planned, [z]: digits(e.target.value) })} />
                </td>
              ))}
              <td />
              <td className="num">
                <strong>{plannedTotal.toLocaleString('en')}</strong>
              </td>
            </tr>
            <tr>
              <th title="كم قطعة من هالنمرة بتطلع من كل مدة">بالمدة</th>
              {sizes.map((z) => (
                <td key={z}>
                  <input className="num-input" value={ratio[z] ?? ''} onChange={(e) => setRatio({ ...ratio, [z]: digits(e.target.value) })} />
                </td>
              ))}
              <td />
              <td className="num">{perLay || ''}</td>
            </tr>
            {p && existing && (
              <>
                {row('المقصوص', p.cutBySize, p.cut)}
                {p.usesSewing && row('دخل الخياطة', p.sewingBySize, p.sewing)}
                {p.usesDone && row('منجز', p.doneBySize, p.done)}
                {p.damaged > 0 && row('تالف', p.damagedBySize, p.damaged, 'bad-row')}
                {row('المسلّم', p.deliveredBySize, p.delivered)}
                {row(
                  'جاهز للتسليم',
                  p.readyBySize,
                  Object.values(p.readyBySize).reduce((t, v) => t + v, 0),
                  'highlight',
                )}
              </>
            )}
          </tbody>
        </table>
        {perLay > 0 && (
          <div className="plan-strip">
            <div>
              <span>القطع بالمدة</span>
              <strong>{perLay}</strong>
            </div>
            <div>
              <span>المدات المطلوبة</span>
              <strong>
                {p ? `${p.lays} / ` : ''}
                {laysNeeded}
              </strong>
            </div>
            {needed > 0 && (
              <div>
                <span>القماش المطلوب</span>
                <strong>{lenU(needed, unit)}</strong>
              </div>
            )}
            {partyId && needed > 0 && (
              <div className={fabricShort ? 'bad' : 'good'}>
                <span>{fabricShort ? 'القماش ناقص' : 'القماش الباقي عندنا'}</span>
                <strong>
                  {fabricShort
                    ? `${lenU(fabricShort, unit)} ≈ ${Math.ceil(fabricShort / markerLen)} مدة`
                    : lenU(available, unit)}
                </strong>
              </div>
            )}
          </div>
        )}
      </section>

      {existing && p && (
        <>
          <div className="action-bar">
            {existing.status !== 'cancelled' && can('tailoring.manage') && (
              <>
                <button className="primary" onClick={() => setDialog('cut')}>
                  <Icon name="scissors" size={16} /> مدّ وقص
                </button>
                <button onClick={() => setDialog('stage')} disabled={p.cut === 0}>
                  <Icon name="check" size={16} /> تسجيل مرحلة
                </button>
              </>
            )}
            {existing.status !== 'cancelled' && can('vouchers.create') && (
              <button onClick={() => setDialog('expense')}>
                <Icon name="wallet" size={16} /> مصروف
              </button>
            )}
            {existing.status !== 'cancelled' && can('tailoring.manage') && (
              <button className="primary accent" onClick={() => setDialog('deliver')} disabled={Object.values(p.readyBySize).every((v) => v <= 0)}>
                <Icon name="truck" size={16} /> تسليم دفعة
              </button>
            )}
          </div>

          <OrderSheet order={existing} />

          <div className="two-col">
            <section className="card">
              <h3>المدات والقص ({existing.cuts.length})</h3>
              {existing.cuts.length === 0 ? (
                <p className="muted">اضغط «مدّ وقص» وسجّل كل توب كم مدة أعطى.</p>
              ) : (
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الأتواب</th>
                      <th>القطع</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {existing.cuts.map((c) => (
                      <tr key={c.id}>
                        <td>{dateText(c.date)}</td>
                        <td>
                          {c.rolls.map((r) => {
                            const roll = state.rolls[r.rollId] ? normalizeRoll(state.rolls[r.rollId]!) : undefined;
                            return (
                              <span key={r.rollId} className="chip">
                                {roll?.code}: {r.lays ? `${r.lays} مدة · ` : ''}
                                {roll ? lenU(r.used, roll.unit) : len(r.used)}
                              </span>
                            );
                          })}
                        </td>
                        <td>
                          <strong>{piecesTotal(c.pieces)}</strong>
                        </td>
                        <td>
                          {can('tailoring.manage') && (
                            <ConfirmButton
                              label="حذف"
                              onConfirm={async () => {
                                if (await call('removeCut', existing.id, c.id)) notify('تم الحذف ورجع القماش للأتواب');
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
              <h3>المراحل ({existing.stages?.length ?? 0})</h3>
              {(existing.stages ?? []).length === 0 ? (
                <p className="muted">سجّل كم قطعة دخلت الخياطة، كم خلصت، وكم تالفة.</p>
              ) : (
                <table className="table compact">
                  <tbody>
                    {existing.stages.map((s) => (
                      <tr key={s.id}>
                        <td>{dateText(s.date)}</td>
                        <td>
                          <span className={`tag ${s.stage === 'damaged' ? 'bad' : s.stage === 'done' ? 'good' : ''}`}>{STAGE_NAMES[s.stage]}</span>
                        </td>
                        <td>
                          <strong>{piecesTotal(s.pieces)}</strong>
                          <small className="muted">
                            {' '}
                            {existing.sizes
                              .filter((z) => (s.pieces[z] ?? 0) > 0)
                              .map((z) => `${z}:${s.pieces[z]}`)
                              .join(' ')}
                          </small>
                          {s.note && <small className="muted"> — {s.note}</small>}
                        </td>
                        <td>
                          {can('tailoring.manage') && (
                            <ConfirmButton
                              label="حذف"
                              onConfirm={async () => {
                                await call('removeStage', existing.id, s.id);
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
              <h3>المصاريف</h3>
              {(existing.expenses ?? []).length === 0 ? (
                <p className="muted">استيك، خيط، بطانة... كل مصروف بيتسجل هون مع تاريخه، وإذا على الزبون بينضاف لحسابه.</p>
              ) : (
                <table className="table compact">
                  <tbody>
                    {existing.expenses.map((e) => {
                      const voided = !!state.voided[e.entryId];
                      return (
                        <tr key={e.id} className={voided ? 'muted strike' : ''}>
                          <td>{dateText(e.date)}</td>
                          <td>
                            <strong>{e.kind}</strong>
                            {e.description && <small className="muted"> — {e.description}</small>}
                          </td>
                          <td>
                            <span className={`tag ${e.billTo === 'customer' ? 'bad' : ''}`}>{e.billTo === 'customer' ? 'على الزبون' : 'على الورشة'}</span>
                          </td>
                          <td className="num">{money(state, e.amount, existing.currency)}</td>
                          <td>
                            {!voided && can('vouchers.void') && (
                              <ConfirmButton
                                label="إلغاء"
                                onConfirm={async () => {
                                  if (await call('removeWorkExpense', existing.id, e.id, today())) notify('تم إلغاء المصروف');
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {(p.expensesCustomer > 0 || p.expensesWorkshop > 0) && (
                <div className="kv">
                  <span>على الزبون</span>
                  <strong>{money(state, p.expensesCustomer, existing.currency)}</strong>
                  <span>على الورشة</span>
                  <strong>{money(state, p.expensesWorkshop, existing.currency)}</strong>
                </div>
              )}
            </section>
            <section className="card">
              <h3>التسليمات ({existing.deliveries.length})</h3>
              {existing.deliveries.length === 0 ? (
                <p className="muted">لما تخلص دفعة، اضغط «تسليم دفعة» وطبعلها إشعار تسليم وفاتورة.</p>
              ) : (
                <table className="table compact">
                  <tbody>
                    {existing.deliveries.map((d) => {
                      const inv = d.invoiceId ? state.invoices.find((i) => i.id === d.invoiceId) : undefined;
                      return (
                        <tr key={d.id}>
                          <td className="mono">#{d.number}</td>
                          <td>{dateText(d.date)}</td>
                          <td>
                            <strong>{piecesTotal(d.pieces)}</strong> قطعة
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
      {dialog === 'cut' && existing && <CutDialog order={existing} onClose={() => setDialog(null)} />}
      {dialog === 'stage' && existing && <StageDialog order={existing} onClose={() => setDialog(null)} />}
      {dialog === 'expense' && existing && <ExpenseDialog order={existing} onClose={() => setDialog(null)} />}
      {dialog === 'deliver' && existing && (
        <DeliverDialog
          order={existing}
          onClose={() => setDialog(null)}
          onDone={(order, delivery) => {
            setDialog(null);
            print({ kind: 'delivery', order, delivery });
          }}
        />
      )}
      {billing && existing && <BillDialog order={existing} delivery={billing} onClose={() => setBilling(null)} />}
      <PrintDoc doc={doc} />
    </div>
  );
}

function SizeInputs({ order, value, onChange, hint }: { order: WorkOrder; value: Record<string, string>; onChange: (v: Record<string, string>) => void; hint?: (z: string) => string }) {
  return (
    <div className="size-inputs">
      {order.sizes.map((z) => (
        <label key={z} className="measure">
          <span>
            {z} {hint && <small className="muted">({hint(z)})</small>}
          </span>
          <input value={value[z] ?? ''} onChange={(e) => onChange({ ...value, [z]: digits(e.target.value) })} inputMode="numeric" />
        </label>
      ))}
    </div>
  );
}
const toPieces = (order: WorkOrder, v: Record<string, string>) => Object.fromEntries(order.sizes.map((z) => [z, int(v[z])]).filter(([, n]) => (n as number) > 0));

function CutDialog({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const unit = order.unit ?? 'm';
  const marker = order.markerLength ?? 0;
  const [date, setDate] = useState(today());
  const [chosen, setChosen] = useState<Record<string, { lays: string; used: string }>>({});
  const [pieces, setPieces] = useState<Record<string, string> | null>(null); // null = تلقائي من المدات
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const rolls = Object.values(state.rolls)
    .filter((r) => r.partyId === order.partyId)
    .map((r) => ({ r: normalizeRoll(r), left: rollRemaining(state, r) }))
    .filter(({ left, r }) => left > 0 && matches(query, r.code, r.fabric, r.color))
    .sort((a, b) => a.r.code.localeCompare(b.r.code, 'ar', { numeric: true }));
  const markerIn = (u: LengthUnit) => convertLength(marker, unit, u);
  const lines = Object.entries(chosen)
    .map(([rollId, x]) => ({ rollId, lays: int(x.lays), used: parseLen(x.used) }))
    .filter((x) => x.used > 0);
  const totalLays = lines.reduce((t, x) => t + x.lays, 0);
  const auto = Object.fromEntries(order.sizes.map((z) => [z, String(totalLays * (order.ratio?.[z] ?? 0))]));
  const shown = pieces ?? auto;
  const count = order.sizes.reduce((t, z) => t + int(shown[z]), 0);
  const p = workOrderProgress(state, order);
  const setRoll = (roll: FabricRoll, x: { lays: string; used: string } | null) => {
    const next = { ...chosen };
    if (x) next[roll.id] = x;
    else delete next[roll.id];
    setChosen(next);
  };
  return (
    <Modal title={`مدّ وقص — ${order.model}`} onClose={onClose} width={920}>
      <div className="form-grid four">
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="kv">
          <span>الرسمة</span>
          <strong>{marker ? lenU(marker, unit) : 'بدون'}</strong>
          {p.laysNeeded !== null && (
            <>
              <span>باقي مدات</span>
              <strong>{Math.max(0, p.laysNeeded - p.lays - totalLays)}</strong>
            </>
          )}
        </div>
      </div>
      <h4>الأتواب: كل توب كم مدة أعطى</h4>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم التوب..." />
      </div>
      {rolls.length === 0 ? (
        <Empty>ما في أتواب فيها باقي لهالزبون. سجّل استلام الأتواب أولاً من «أتواب القماش».</Empty>
      ) : (
        <div className="roll-pick">
          {rolls.map(({ r, left }) => {
            const x = chosen[r.id];
            const maxLays = marker ? Math.floor(left / markerIn(r.unit)) : 0;
            return (
              <div key={r.id} className={`roll-chip ${x ? 'on' : ''}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!x}
                    onChange={(e) => setRoll(r, e.target.checked ? { lays: String(maxLays), used: len(marker ? maxLays * markerIn(r.unit) : left) } : null)}
                  />
                  <strong className="mono">{r.code}</strong>
                </label>
                <small>
                  {r.fabric}
                  {r.color ? ` · ${r.color}` : ''} · باقي {lenU(left, r.unit)}
                  {marker ? ` = ${maxLays} مدة` : ''}
                </small>
                {x && (
                  <div className="roll-inputs">
                    {marker > 0 && (
                      <label>
                        مدات
                        <input
                          className="num-input"
                          value={x.lays}
                          onChange={(e) => {
                            const lays = digits(e.target.value);
                            setRoll(r, { lays, used: len(Math.min(left, int(lays) * markerIn(r.unit))) });
                          }}
                        />
                      </label>
                    )}
                    <label>
                      {UNIT_NAMES[r.unit]}
                      <input className="num-input" value={x.used} onChange={(e) => setRoll(r, { ...x, used: e.target.value })} />
                    </label>
                    <button type="button" className="ghost" title="سجّل كل الباقي مستعمل (بواقي وقصاقيص)" onClick={() => setRoll(r, { ...x, used: len(left) })}>
                      خلّص التوب
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <h4>
        القطع المقصوصة فعلياً
        {pieces && (
          <button type="button" className="link" onClick={() => setPieces(null)}>
            {' '}
            (رجّع للحساب التلقائي)
          </button>
        )}
      </h4>
      <SizeInputs order={order} value={shown} onChange={setPieces} />
      <div className="kv">
        <span>المدات</span>
        <strong>{totalLays}</strong>
        <span>القطع</span>
        <strong>{count}</strong>
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
              rolls: lines.map((x) => ({ rollId: x.rollId, used: x.used, ...(x.lays ? { lays: x.lays } : {}) })),
              pieces: toPieces(order, shown),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            });
            if (res) {
              notify(`تم تسجيل ${totalLays ? `${totalLays} مدة و` : ''}${count} قطعة`);
              onClose();
            }
          }}
        >
          حفظ
        </button>
      </div>
    </Modal>
  );
}

function StageDialog({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const p = workOrderProgress(state, order);
  const [stage, setStage] = useState<WorkStage['stage']>(p.usesSewing ? 'done' : 'sewing');
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const avail = (z: string) => {
    const cut = p.cutBySize[z] ?? 0;
    const dmg = p.damagedBySize[z] ?? 0;
    if (stage === 'sewing') return cut - (p.sewingBySize[z] ?? 0);
    if (stage === 'done') return (p.usesSewing ? (p.sewingBySize[z] ?? 0) : cut) - dmg - (p.doneBySize[z] ?? 0);
    return cut - dmg - (p.doneBySize[z] ?? 0);
  };
  return (
    <Modal title={`تسجيل مرحلة — ${order.model}`} onClose={onClose} width={720}>
      <div className="segmented">
        {(['sewing', 'done', 'damaged'] as const).map((s) => (
          <button key={s} type="button" className={stage === s ? 'active' : ''} onClick={() => setStage(s)}>
            {STAGE_NAMES[s]}
          </button>
        ))}
      </div>
      <div className="button-row">
        <button type="button" className="ghost" onClick={() => setPieces(Object.fromEntries(order.sizes.map((z) => [z, String(Math.max(0, avail(z)))])))}>
          الكل
        </button>
      </div>
      <SizeInputs order={order} value={pieces} onChange={setPieces} hint={(z) => `متاح ${Math.max(0, avail(z))}`} />
      <div className="form-grid">
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ملاحظة">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={stage === 'damaged' ? 'غلط بالقص، عيب بالقماش...' : 'اسم الخياط، الخط...'} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button
          className="primary"
          onClick={async () => {
            if (await call('addStage', order.id, { date, stage, pieces: toPieces(order, pieces), ...(note.trim() ? { note: note.trim() } : {}) })) {
              notify('تم التسجيل');
              onClose();
            }
          }}
        >
          حفظ
        </button>
      </div>
    </Modal>
  );
}

function ExpenseDialog({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [kind, setKind] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [billTo, setBillTo] = useState<'customer' | 'workshop'>('customer');
  const [date, setDate] = useState(today());
  const cashes = cashAccounts(state, order.currency);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  return (
    <Modal title={`مصروف على الطلبية — ${order.model}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let v = 0;
          try {
            v = parseAmount(state, amount, order.currency);
          } catch {
            return notify('مبلغ غير صالح', 'error');
          }
          if (await call('addWorkExpense', order.id, { date, kind, amount: v, billTo, cashAccountId: cash, ...(description.trim() ? { description: description.trim() } : {}) })) {
            notify('تم تسجيل المصروف');
            onClose();
          }
        }}
      >
        <Field label="النوع">
          <input value={kind} onChange={(e) => setKind(e.target.value)} list="expense-kinds" autoFocus />
          <datalist id="expense-kinds">
            {EXPENSE_KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field label="المبلغ">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="التفاصيل" wide>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="3 لفات استيك، 10 بكرات خيط..." />
        </Field>
        <div className="segmented wide">
          <button type="button" className={billTo === 'customer' ? 'active' : ''} onClick={() => setBillTo('customer')}>
            على الزبون (بينضاف لحسابه)
          </button>
          <button type="button" className={billTo === 'workshop' ? 'active' : ''} onClick={() => setBillTo('workshop')}>
            على الورشة
          </button>
        </div>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="دفعته من">
          <select value={cash} onChange={(e) => setCash(e.target.value)}>
            {cashes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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

function DeliverDialog({ order, onClose, onDone }: { order: WorkOrder; onClose: () => void; onDone: (o: WorkOrder, d: WorkDelivery) => void }) {
  const { state, call, notify, can } = useCompany();
  const p = workOrderProgress(state, order);
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [invoice, setInvoice] = useState(can('sales.create'));
  const [paid, setPaid] = useState('');
  const cashes = cashAccounts(state, order.currency);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  const [notes, setNotes] = useState('');
  const count = order.sizes.reduce((t, z) => t + int(pieces[z]), 0);
  return (
    <Modal title={`تسليم دفعة — ${order.model}`} onClose={onClose} width={760}>
      <div className="button-row">
        <button type="button" onClick={() => setPieces(Object.fromEntries(order.sizes.map((z) => [z, String(Math.max(0, p.readyBySize[z] ?? 0))])))}>
          كل الجاهز ({Object.values(p.readyBySize).reduce((t, v) => t + Math.max(0, v), 0)})
        </button>
      </div>
      <SizeInputs order={order} value={pieces} onChange={setPieces} hint={(z) => `جاهز ${p.readyBySize[z] ?? 0}`} />
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
            <Field label="المقبوض الآن (الباقي على الحساب)">
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
              pieces: toPieces(order, pieces),
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
      <Field label="المقبوض الآن (الباقي على الحساب)">
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
