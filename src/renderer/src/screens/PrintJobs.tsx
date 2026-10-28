import { useMemo, useState } from 'react';
import {
  PRINT_EXTRAS,
  PRINT_KIND_NAMES,
  PRINT_PRESETS,
  PRINT_STATUS_NAMES,
  printJobDeposits,
  printJobMaterialCost,
  printJobTotals,
  printLineAmount,
  printLineUnits,
  printPieceArea,
  printUnitName,
  type Invoice,
  type PrintJob,
  type PrintJobLine,
  type PrintJobStatus,
  type PrintLineKind,
} from '../../../core';
import { addDays, dateText, money, parseAmount, qtyText, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { CurrencySelect, Empty, Field, itemOptions, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { PartyForm } from './Parties';
import { DeliverDialog, DepositDialog } from './Tailor';

const OPEN: PrintJobStatus[] = ['new', 'design', 'printing', 'ready'];
const EDIT_STATUS: PrintJobStatus[] = ['new', 'design', 'printing', 'ready', 'delivered', 'cancelled'];
const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫،,]/g, '.').trim() || 0);

/** المطبعة: طلبات الطباعة (فلكس، تصوير، كروت...) بموعد تسليم وعربون وفاتورة. */
export function PrintJobs() {
  const { state, can, call, notify, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [editing, setEditing] = useState<PrintJob | 'new' | null>(null);
  const all = useMemo(() => Object.values(state.printJobs ?? {}), [state.printJobs]);
  const d = today();
  const rows = useMemo(
    () =>
      all
        .filter((j) => show === 'all' || OPEN.includes(j.status))
        .filter((j) => matches(query, j.number, j.title, state.parties[j.partyId]?.name, state.parties[j.partyId]?.phone, j.file, ...j.lines.map((l) => l.name)))
        .sort((a, b) => (OPEN.includes(a.status) && OPEN.includes(b.status) ? (a.due ?? '9').localeCompare(b.due ?? '9') : 0) || b.date.localeCompare(a.date) || b.number - a.number),
    [all, show, query, state.parties],
  );
  const stats = useMemo(() => {
    const open = all.filter((j) => OPEN.includes(j.status));
    return {
      open: open.length,
      late: open.filter((j) => j.due && j.due < d).length,
      today: open.filter((j) => j.due === d).length,
      ready: open.filter((j) => j.status === 'ready').length,
      deposits: open.reduce((s, j) => s + printJobDeposits(state, j), 0),
    };
  }, [all, state, d]);
  const setStatus = async (j: PrintJob, status: PrintJobStatus) => {
    const { deposits: _d, materialsAdjustmentId: _m, invoiceId: _i, ...rest } = j;
    if (await call('savePrintJob', { ...rest, status })) notify(`الطلب رقم ${j.number}: ${PRINT_STATUS_NAMES[status]}`);
  };
  const manage = can('printjobs.manage');

  return (
    <div className="page">
      <PageHeader title="طلبات الطباعة">
        {manage && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> طلب جديد
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat clickable" onClick={() => setShow('open')}>
          <span>طلبات شغّالة</span>
          <strong>{stats.open}</strong>
        </div>
        <div className={`stat ${stats.late ? 'warn' : ''}`}>
          <span>تسليم اليوم</span>
          <strong>{stats.today}</strong>
          {stats.late > 0 && <small className="bad">{stats.late} متأخر</small>}
        </div>
        <div className="stat">
          <span>جاهز للتسليم</span>
          <strong className={stats.ready ? 'good' : ''}>{stats.ready}</strong>
        </div>
        <div className="stat">
          <span>عربون مقبوض</span>
          <strong>{money(state, stats.deposits)}</strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث برقم الطلب، الزبون، الهاتف، نوع الشغل..." />
        <select value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')}>
          <option value="open">الطلبات الشغّالة</option>
          <option value="all">كل الطلبات</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>{query ? 'ما في طلبات بهالبحث.' : 'ما في طلبات شغّالة. اكبس «طلب جديد» وسجّل الفلكس أو التصوير أو الكروت.'}</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الزبون والطلب</th>
              <th>البنود</th>
              <th>التسليم</th>
              <th>الحالة</th>
              <th className="num">القيمة</th>
              <th className="num">العربون</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              const t = printJobTotals(j);
              const dep = printJobDeposits(state, j);
              const late = OPEN.includes(j.status) && j.due && j.due < d;
              return (
                <tr key={j.id} className="clickable" onClick={() => setEditing(j)}>
                  <td className="mono">{j.number}</td>
                  <td>
                    <strong>{state.parties[j.partyId]?.name}</strong>
                    {j.title && <div className="muted">{j.title}</div>}
                  </td>
                  <td className="muted">{j.lines.map((l) => l.name).join('، ') || '—'}</td>
                  <td className={late ? 'bad' : j.due === d ? 'good' : ''}>{j.due ? (j.due === d ? 'اليوم' : dateText(j.due)) : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {j.invoiceId || !manage ? (
                      <span className="tag">{PRINT_STATUS_NAMES[j.status]}</span>
                    ) : (
                      <select value={j.status} onChange={(e) => void setStatus(j, e.target.value as PrintJobStatus)}>
                        {EDIT_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {PRINT_STATUS_NAMES[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="num">{money(state, t.total, j.currency)}</td>
                  <td className="num">{dep ? money(state, dep, j.currency) : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {j.invoiceId ? (
                      <button className="small" onClick={() => navigate('invoice', j.invoiceId)}>
                        الفاتورة
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && <JobForm job={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type LineForm = { id: string; kind: PrintLineKind; name: string; width: string; height: string; pages: string; qty: string; price: string; materialId: string | null; materialQty: string; note: string };
type ExtraForm = { description: string; amount: string };

const toForm = (state: Parameters<typeof toInput>[0], cur: string, l: PrintJobLine): LineForm => ({
  id: l.id,
  kind: l.kind,
  name: l.name,
  width: l.width ? String(l.width) : '',
  height: l.height ? String(l.height) : '',
  pages: l.pages ? String(l.pages) : '',
  qty: String(l.qty),
  price: toInput(state, l.price, cur),
  materialId: l.material?.itemId ?? null,
  materialQty: l.material ? String(l.material.qty) : '',
  note: l.note ?? '',
});

function JobForm({ job: initial, onClose }: { job: PrintJob | null; onClose: () => void }) {
  const { state, call, notify, navigate, can } = useCompany();
  // رقم ثابت للطلب الجديد: الحفظ قبل العربون والفوترة بيرجع لنفس الطلب
  const [id] = useState(() => initial?.id ?? uid());
  const job = state.printJobs?.[id] ?? initial;
  const base = state.info!.baseCurrency;
  const [f, setF] = useState({
    partyId: job?.partyId ?? '',
    title: job?.title ?? '',
    date: job?.date ?? today(),
    due: job?.due ?? addDays(today(), 2),
    status: job?.status ?? ('new' as PrintJobStatus),
    currency: job?.currency ?? base,
    file: job?.file ?? '',
    notes: job?.notes ?? '',
    discount: job?.discount ? toInput(state, job.discount, job.currency) : '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [lines, setLines] = useState<LineForm[]>(() => job?.lines.map((l) => toForm(state, job.currency, l)) ?? []);
  const [extras, setExtras] = useState<ExtraForm[]>(() => job?.extras.map((x) => ({ description: x.description, amount: toInput(state, x.amount, job.currency) })) ?? []);
  const [newParty, setNewParty] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const materials = useMemo(() => itemOptions(state, (i) => i.kind === 'stock'), [state]);
  const locked = !!job?.invoiceId;
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const build = (): Omit<PrintJob, 'number' | 'deposits'> | string => {
    if (!f.partyId) return 'اختار الزبون (أو ضيف زبون جديد)';
    try {
      const out: PrintJobLine[] = lines
        .filter((l) => l.name.trim())
        .map((l) => ({
          id: l.id,
          kind: l.kind,
          name: l.name.trim(),
          ...(l.kind === 'area' ? { width: num(l.width), height: num(l.height) } : {}),
          ...(l.kind === 'pages' ? { pages: Math.max(1, Math.round(num(l.pages) || 1)) } : {}),
          qty: num(l.qty) || 1,
          price: parseAmount(state, l.price, f.currency),
          ...(l.materialId && num(l.materialQty) > 0 ? { material: { itemId: l.materialId, qty: num(l.materialQty) } } : {}),
          ...(l.note.trim() ? { note: l.note.trim() } : {}),
        }));
      const ex = extras.filter((x) => x.description.trim() && x.amount).map((x) => ({ description: x.description.trim(), amount: parseAmount(state, x.amount, f.currency) }));
      const discount = parseAmount(state, f.discount, f.currency);
      return {
        id,
        partyId: f.partyId,
        date: f.date,
        ...(f.due ? { due: f.due } : {}),
        ...(f.title.trim() ? { title: f.title.trim() } : {}),
        status: job?.invoiceId ? job.status : f.status,
        currency: f.currency,
        lines: out,
        extras: ex,
        ...(discount ? { discount } : {}),
        ...(f.file.trim() ? { file: f.file.trim() } : {}),
        ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
      };
    } catch (e) {
      return (e as Error).message;
    }
  };
  const preview = build();
  const totals = typeof preview === 'string' ? null : printJobTotals(preview);
  const deposits = job ? printJobDeposits(state, state.printJobs?.[job.id] ?? job) : 0;
  const matCost = typeof preview === 'string' ? 0 : printJobMaterialCost(state, preview);

  const save = async (quiet = false): Promise<PrintJob | null> => {
    const d = build();
    if (typeof d === 'string') {
      notify(d, 'error');
      return null;
    }
    const res = await call<PrintJob>('savePrintJob', d);
    if (!res) return null;
    if (!quiet) {
      notify(`انحفظ الطلب رقم ${res.value.number}`);
      onClose();
    }
    return res.value;
  };

  const addPreset = (p: (typeof PRINT_PRESETS)[number]) => {
    const item = Object.values(state.items).find((i) => !i.archived && i.kind !== 'composite' && i.name === p.name);
    setLines((ls) => [
      ...ls,
      {
        id: uid(),
        kind: p.kind,
        name: p.name,
        width: p.width ? String(p.width) : '',
        height: p.height ? String(p.height) : '',
        pages: p.pages ? String(p.pages) : '',
        qty: '1',
        price: item?.price ? toInput(state, item.price, f.currency) : '',
        materialId: null,
        materialQty: '',
        note: '',
      },
    ]);
  };

  return (
    <Modal title={job ? `طلب طباعة رقم ${job.number}` : 'طلب طباعة جديد'} onClose={onClose} width={1080}>
      <div className="form-grid">
        <Field label="الزبون">
          <div className="with-button">
            <Picker options={partyOptions(state, 'customer')} value={f.partyId || null} onChange={(id) => set('partyId', id ?? '')} placeholder="اختار الزبون..." />
            {can('parties.manage') && !locked && (
              <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
        </Field>
        <Field label="الطلب (اختياري)">
          <input placeholder="آرمة محل، كروت، مشروع تخرج..." value={f.title} onChange={(e) => set('title', e.target.value)} disabled={locked} />
        </Field>
        <Field label="تاريخ الطلب">
          <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} disabled={locked} />
        </Field>
        <Field label="موعد التسليم">
          <input type="date" value={f.due} onChange={(e) => set('due', e.target.value)} disabled={locked} />
        </Field>
        <Field label="الحالة">
          <select value={f.status} onChange={(e) => set('status', e.target.value as PrintJobStatus)} disabled={locked}>
            {(locked ? [f.status] : EDIT_STATUS).map((s) => (
              <option key={s} value={s}>
                {PRINT_STATUS_NAMES[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => set('currency', c)} />
        </Field>

        <h3 className="wide form-section">البنود</h3>
        {!locked && (
          <div className="wide preset-row">
            {PRINT_PRESETS.map((p) => (
              <button key={p.name} type="button" className="small" onClick={() => addPreset(p)}>
                + {p.name}
              </button>
            ))}
            <button type="button" className="small" onClick={() => addPreset({ name: '', kind: 'count' })}>
              + بند آخر
            </button>
          </div>
        )}
        <div className="wide">
          {lines.length === 0 ? (
            <p className="muted">اكبس على نوع الشغل فوق لتضيفه (فلكس، تصوير، كروت...)</p>
          ) : (
            <table className="table compact print-lines">
              <thead>
                <tr>
                  <th>البند</th>
                  <th>الحساب</th>
                  <th>القياس / الصفحات</th>
                  <th>العدد</th>
                  <th>السعر</th>
                  <th>المادة من المخزون</th>
                  <th className="num">المجموع</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  let amount = 0;
                  const draftLine: PrintJobLine = { id: l.id, kind: l.kind, name: l.name, width: num(l.width), height: num(l.height), pages: Math.max(1, Math.round(num(l.pages) || 1)), qty: num(l.qty) || 1, price: 0 };
                  try {
                    amount = printLineAmount({ ...draftLine, price: parseAmount(state, l.price, f.currency) });
                  } catch {
                    amount = 0;
                  }
                  const units = printLineUnits(draftLine);
                  const mat = l.materialId ? state.items[l.materialId] : null;
                  return (
                    <tr key={l.id}>
                      <td>
                        <input value={l.name} placeholder="اسم البند" onChange={(e) => setLine(i, { name: e.target.value })} disabled={locked} />
                      </td>
                      <td>
                        <select value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as PrintLineKind })} disabled={locked}>
                          {(Object.keys(PRINT_KIND_NAMES) as PrintLineKind[]).map((k) => (
                            <option key={k} value={k}>
                              {PRINT_KIND_NAMES[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {l.kind === 'area' ? (
                          <span className="dims">
                            <input className="num-input" inputMode="decimal" placeholder="العرض م" value={l.width} onChange={(e) => setLine(i, { width: e.target.value })} disabled={locked} />
                            <span>×</span>
                            <input className="num-input" inputMode="decimal" placeholder="الارتفاع م" value={l.height} onChange={(e) => setLine(i, { height: e.target.value })} disabled={locked} />
                            <small className="muted">{qtyText(printPieceArea(draftLine))} م²</small>
                          </span>
                        ) : l.kind === 'pages' ? (
                          <input className="num-input" inputMode="numeric" placeholder="عدد الصفحات" value={l.pages} onChange={(e) => setLine(i, { pages: e.target.value })} disabled={locked} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <input className="num-input" inputMode="decimal" value={l.qty} title={l.kind === 'pages' ? 'عدد النسخ' : 'عدد القطع'} onChange={(e) => setLine(i, { qty: e.target.value })} disabled={locked} />
                      </td>
                      <td>
                        <input className="num-input" inputMode="decimal" placeholder={`لكل ${printUnitName(l.kind)}`} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} disabled={locked} />
                      </td>
                      <td className="material-cell">
                        <Picker
                          options={materials}
                          value={l.materialId}
                          onChange={(id) => setLine(i, { materialId: id, materialQty: l.materialQty || (id && l.kind === 'area' ? String(units) : l.kind === 'pages' && id ? String(units) : l.materialQty) })}
                          placeholder="رول فلكس، ورق..."
                        />
                        {l.materialId && (
                          <span className="dims">
                            <input className="num-input" inputMode="decimal" value={l.materialQty} onChange={(e) => setLine(i, { materialQty: e.target.value })} disabled={locked} />
                            <small className="muted">{mat?.unit}</small>
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {money(state, amount, f.currency)}
                        <div className="muted">
                          {qtyText(units)} {printUnitName(l.kind)}
                        </div>
                      </td>
                      <td>
                        {!locked && (
                          <button type="button" className="icon" title="حذف" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                            <Icon name="close" size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <h3 className="wide form-section">إضافات (تصميم، تركيب، توصيل...)</h3>
        <div className="wide">
          {extras.map((x, i) => (
            <div key={i} className="with-button" style={{ marginBottom: 6 }}>
              <input list="print-extras" style={{ flex: 2 }} value={x.description} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} disabled={locked} />
              <input className="num-input" style={{ maxWidth: 160 }} inputMode="decimal" placeholder="المبلغ" value={x.amount} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} disabled={locked} />
              {!locked && (
                <button type="button" className="icon" title="حذف" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          ))}
          <datalist id="print-extras">
            {PRINT_EXTRAS.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
          {!locked && (
            <button type="button" className="small" onClick={() => setExtras([...extras, { description: extras.length ? '' : 'تصميم', amount: '' }])}>
              + إضافة
            </button>
          )}
        </div>
        <Field label="خصم">
          <input inputMode="decimal" value={f.discount} onChange={(e) => set('discount', e.target.value)} disabled={locked} />
        </Field>
        <Field label="ملف التصميم / مكانه">
          <input placeholder="مثلاً: سطح المكتب ← طلبات ← المطعم.pdf" value={f.file} onChange={(e) => set('file', e.target.value)} disabled={locked} />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={(e) => set('notes', e.target.value)} disabled={locked} />
        </Field>

        {totals && (
          <div className="kv wide">
            {totals.meters > 0 && (
              <>
                <span>مجموع الأمتار</span>
                <strong>{qtyText(totals.meters)} م²</strong>
              </>
            )}
            {totals.pages > 0 && (
              <>
                <span>مجموع الصفحات</span>
                <strong>{totals.pages}</strong>
              </>
            )}
            <span>قيمة الطلب</span>
            <strong>{money(state, totals.total, f.currency)}</strong>
            {deposits > 0 && (
              <>
                <span>العربون المقبوض</span>
                <strong className="good">{money(state, deposits, f.currency)}</strong>
                <span>الباقي</span>
                <strong className="bad">{money(state, Math.max(0, totals.total - deposits), f.currency)}</strong>
              </>
            )}
            {matCost > 0 && can('costs.view') && f.currency === base && (
              <>
                <span>تكلفة المواد التقريبية</span>
                <strong>{money(state, matCost)}</strong>
                <span>الربح التقريبي</span>
                <strong className="good">{money(state, totals.total - matCost)}</strong>
              </>
            )}
          </div>
        )}

        <div className="form-actions wide">
          {job?.invoiceId ? (
            <button type="button" className="primary" onClick={() => navigate('invoice', job.invoiceId)}>
              عرض الفاتورة
            </button>
          ) : (
            <>
              {can('vouchers.create') && f.status !== 'cancelled' && (
                <button type="button" className="push-start" onClick={() => setDepositing(true)}>
                  <Icon name="wallet" size={16} /> قبض عربون
                </button>
              )}
              {can('sales.create') && f.status !== 'cancelled' && (
                <button type="button" onClick={() => setDelivering(true)}>
                  <Icon name="receipt" size={16} /> تسليم وفوترة
                </button>
              )}
              <button type="button" onClick={onClose}>
                إلغاء
              </button>
              {can('printjobs.manage') && (
                <button type="button" className="primary" onClick={() => void save()}>
                  حفظ الطلب
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {newParty && <PartyForm party={null} defaultKind="customer" onClose={() => setNewParty(false)} onSaved={(p) => set('partyId', p.id)} />}
      {depositing && totals && (
        <DepositDialog
          title="قبض عربون على الطلب"
          hint="بيتسجّل سند قبض باسم الزبون، وبينخصم من المطلوب عند التسليم."
          currency={f.currency}
          suggested={Math.max(0, Math.round(totals.total / 2) - deposits)}
          onClose={() => setDepositing(false)}
          onConfirm={async (amount, cashAccountId) => {
            const saved = await save(true);
            if (!saved) return;
            if (await call('addPrintDeposit', saved.id, { date: today(), amount, cashAccountId })) {
              notify('تم قبض العربون');
              setDepositing(false);
            }
          }}
        />
      )}
      {delivering && totals && (
        <DeliverDialog
          title="تسليم الطلب وفوترته"
          totalLabel="قيمة الطلب"
          depositsLabel="العربون المقبوض"
          submitLabel="تسليم وفوترة"
          subtotal={totals.total}
          deposits={deposits}
          currency={f.currency}
          onClose={() => setDelivering(false)}
          onConfirm={async (opts) => {
            const saved = await save(true);
            if (!saved) return;
            const res = await call<Invoice>('deliverPrintJob', saved.id, { date: today(), ...opts });
            if (res) {
              notify(`تم التسليم: فاتورة رقم ${res.value.number}`);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </Modal>
  );
}
