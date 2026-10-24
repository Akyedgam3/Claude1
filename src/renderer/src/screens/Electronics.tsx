import { useMemo, useState } from 'react';
import { installmentState, serialHistory, serialsInStock, type InstallmentPlan, type Invoice, type Item } from '../../../core';
import { addDays, dateText, money, parseAmount, toInput, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, usePrinter } from '../components/print';
import { CameraScanButton, ConfirmButton, Empty, Field, ItemName, itemOptions, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { cashAccounts, itemPrice } from './InvoiceEditor';
import { PartyForm } from './Parties';

// ───────────── سجل الأجهزة (IMEI) ─────────────

export function DeviceLookup({ serial: initial }: { serial?: string }) {
  const { state, navigate } = useCompany();
  const [code, setCode] = useState(initial ?? '');
  const [shown, setShown] = useState(initial ?? '');
  const [query, setQuery] = useState('');
  const h = shown ? serialHistory(state, shown, today()) : null;
  const stock = serialsInStock(state).filter((x) => matches(query, x.serial, x.item.name, x.item.category));
  const party = (id?: string | null) => (id ? state.parties[id]?.name : 'زبون نقدي');
  return (
    <div className="page">
      <PageHeader title="سجل الأجهزة (السيريال / IMEI)" />
      <form
        className="imei-search card"
        onSubmit={(e) => {
          e.preventDefault();
          setShown(code.trim());
        }}
      >
        <Icon name="search" size={22} />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="امسح أو اكتب الرقم التسلسلي (S/N) أو IMEI..." dir="ltr" autoFocus />
        <button className="primary">بحث</button>
      </form>
      {shown && !h && <Empty>ما في جهاز بهالرقم بالسجلات.</Empty>}
      {h && (
        <section className="card device-card">
          <header>
            <div>
              <h3>{h.item.name}</h3>
              <div className="mono" dir="ltr">
                {h.serial}
              </div>
              {h.item.attributes && (
                <div className="chips-row">
                  {Object.entries(h.item.attributes).map(([k, v]) => (
                    <span key={k} className="chip">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="device-status">
              {h.inStock ? (
                <span className="status done">بالمخزون — {state.warehouses[h.warehouseId!]?.name}</span>
              ) : h.soldOn ? (
                <span className="status invoiced">
                  مبيوع لـ {party(h.soldTo)} · {dateText(h.soldOn)}
                </span>
              ) : (
                <span className="status cancelled">مو بالمخزون</span>
              )}
              {h.warrantyUntil && (
                <span className={`status ${h.warrantyActive ? 'done' : 'cancelled'}`}>
                  {h.warrantyActive ? 'بالكفالة' : 'الكفالة خالصة'} حتى {dateText(h.warrantyUntil)}
                </span>
              )}
            </div>
          </header>
          <table className="table compact">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الحركة</th>
                <th>الطرف</th>
                <th className="num">السعر</th>
              </tr>
            </thead>
            <tbody>
              {h.events.map((e, i) => (
                <tr key={i} className={`${e.invoiceId ? 'clickable' : ''} ${e.voided ? 'muted strike' : ''}`} onClick={() => e.invoiceId && navigate('invoice', e.invoiceId)}>
                  <td>{dateText(e.date)}</td>
                  <td>
                    <span className={`tag ${e.kind === 'in' ? 'good' : ''}`}>{e.kind === 'in' ? 'دخل' : 'طلع'}</span> {e.label}
                  </td>
                  <td>{e.partyId !== undefined ? party(e.partyId) : ''}</td>
                  <td className="num">{e.price !== undefined ? money(state, e.price, e.currency) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {h.repairs.length > 0 && (
            <div className="button-row">
              {h.repairs.map((id) => (
                <button key={id} className="ghost" onClick={() => navigate('repair', id)}>
                  <Icon name="wrench" size={14} /> أمر صيانة {state.repairs[id]?.number}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="card">
        <header className="panel-header">
          <h3>الأجهزة الموجودة بالمخزون ({serialsInStock(state).length})</h3>
          <div className="scan-wrap">
            <SearchBox value={query} onChange={setQuery} placeholder="بحث بالرقم أو الموديل..." />
            <CameraScanButton onCode={setQuery} title="قراءة IMEI بالكاميرا" />
          </div>
        </header>
        {stock.length === 0 ? (
          <p className="muted">ما في أجهزة برقم تسلسلي بالمخزون.</p>
        ) : (
          <table className="table compact">
            <tbody>
              {stock.slice(0, 300).map((x) => (
                <tr
                  key={x.serial}
                  className="clickable"
                  onClick={() => {
                    setCode(x.serial);
                    setShown(x.serial);
                  }}
                >
                  <td className="mono" dir="ltr">
                    {x.serial}
                  </td>
                  <td>
                    <ItemName item={x.item} />
                  </td>
                  <td className="muted">{x.item.category}</td>
                  <td className="num">{money(state, x.item.price, x.item.priceCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ───────────── التقسيط ─────────────

export function Installments() {
  const { state, can } = useCompany();
  const [status, setStatus] = useState<'active' | 'overdue' | 'done' | 'all'>('active');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const d = today();
  const plans = Object.values(state.installments).map((p) => ({ p, st: installmentState(state, p, d) }));
  const active = plans.filter((x) => x.p.status === 'active');
  const weekEnd = addDays(d, 7);
  const rows = plans
    .filter(({ p, st }) => (status === 'all' ? true : status === 'overdue' ? st.overdueCount > 0 : p.status === status))
    .filter(({ p }) => matches(query, p.number, state.parties[p.partyId]?.name, state.parties[p.partyId]?.phone, p.guarantor))
    .sort((a, b) => (a.st.nextDue ?? '9').localeCompare(b.st.nextDue ?? '9'));
  if (open && state.installments[open]) return <PlanView plan={state.installments[open]} onBack={() => setOpen(null)} />;
  return (
    <div className="page">
      <PageHeader title="التقسيط">
        {can('sales.create') && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> خطة تقسيط
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat">
          <span>خطط فعّالة</span>
          <strong>{active.length}</strong>
        </div>
        <div className="stat">
          <span>الباقي عند الزبائن</span>
          <strong>{money(state, active.reduce((t, x) => t + x.st.remaining, 0))}</strong>
        </div>
        <div className="stat">
          <span>مستحق هالأسبوع</span>
          <strong>{money(state, active.reduce((t, x) => t + x.st.rows.filter((r) => r.remaining > 0 && r.due >= d && r.due <= weekEnd).reduce((s, r) => s + r.remaining, 0), 0))}</strong>
        </div>
        <div className="stat clickable" onClick={() => setStatus('overdue')}>
          <span>متأخر</span>
          <strong className={active.some((x) => x.st.overdueCount) ? 'bad' : ''}>{money(state, active.reduce((t, x) => t + x.st.overdueAmount, 0))}</strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث باسم الزبون، الموبايل، الكفيل، أو رقم الخطة..." />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">الفعّالة</option>
          <option value="overdue">المتأخرة</option>
          <option value="done">المسدّدة</option>
          <option value="all">الكل</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>ما في خطط. لما تبيع جهاز بالتقسيط، اعمل فاتورة المبيع بالدفعة الأولى، بعدين اضغط «خطة تقسيط».</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الزبون</th>
              <th>الأقساط</th>
              <th className="num">المجموع</th>
              <th>المسدّد</th>
              <th>القسط الجاي</th>
              <th>متأخر</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, st }) => (
              <tr key={p.id} className={`clickable ${st.overdueCount ? 'late' : ''}`} onClick={() => setOpen(p.id)}>
                <td className="mono">{p.number}</td>
                <td>
                  {state.parties[p.partyId]?.name}
                  {p.status !== 'active' && <span className="tag">{p.status === 'done' ? 'مسدّدة' : 'ملغاة'}</span>}
                </td>
                <td>
                  {st.rows.filter((r) => r.remaining === 0).length} / {p.schedule.length}
                </td>
                <td className="num">{money(state, st.total, p.currency)}</td>
                <td>
                  <div className="meter-row">
                    <span className="meter good">
                      <span style={{ width: `${Math.round((st.paid / st.total) * 100)}%` }} />
                    </span>
                    <small>{money(state, st.paid, p.currency)}</small>
                  </div>
                </td>
                <td>{st.nextDue ? `${dateText(st.nextDue)} · ${money(state, st.nextAmount!, p.currency)}` : '—'}</td>
                <td className={st.overdueCount ? 'bad' : ''}>{st.overdueCount ? `${st.overdueCount} قسط · ${money(state, st.overdueAmount, p.currency)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <NewPlan onClose={() => setCreating(false)} onCreated={(id) => setOpen(id)} />}
    </div>
  );
}

function NewPlan({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const [partyId, setPartyId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [markup, setMarkup] = useState('10');
  const [count, setCount] = useState('6');
  const [firstDue, setFirstDue] = useState(addDays(today(), 30));
  const [guarantor, setGuarantor] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [newParty, setNewParty] = useState(false);
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const taken = new Set(Object.values(state.installments).filter((p) => p.status !== 'cancelled' && p.invoiceId).map((p) => p.invoiceId));
  const invoices = state.invoices.filter((i) => i.kind === 'sale' && i.partyId === partyId && !i.voidEntryId && i.total > i.paid && !taken.has(i.id));
  let p = 0;
  try {
    p = principal.trim() ? parseAmount(state, principal, base) : 0;
  } catch {
    p = 0;
  }
  const m = Math.round((p * (Number(markup) || 0)) / 100);
  const n = Math.max(1, Math.floor(Number(count) || 1));
  return (
    <Modal title="خطة تقسيط جديدة" onClose={onClose} width={720}>
      <div className="form-grid">
        <Field label="الزبون" wide>
          <div className="with-button">
            <Picker options={customers} value={partyId} onChange={(v) => { setPartyId(v); setInvoiceId(''); }} placeholder="ابحث بالاسم أو الموبايل..." />
            <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
              <Icon name="plus" size={16} />
            </button>
          </div>
        </Field>
        <Field label="الفاتورة (اختياري)" wide>
          <select
            value={invoiceId}
            onChange={(e) => {
              setInvoiceId(e.target.value);
              const inv = invoices.find((i) => i.id === e.target.value);
              if (inv) setPrincipal(toInput(state, inv.total - inv.paid, inv.currency));
            }}
          >
            <option value="">بدون فاتورة (مبلغ دين مباشر)</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                فاتورة {i.number} · {dateText(i.date)} · باقي {money(state, i.total - i.paid, i.currency)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المبلغ المقسّط (بعد الدفعة الأولى)">
          <input value={principal} onChange={(e) => setPrincipal(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="زيادة التقسيط %">
          <input value={markup} onChange={(e) => setMarkup(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
        </Field>
        <Field label="عدد الأقساط (شهرية)">
          <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
        </Field>
        <Field label="أول قسط">
          <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
        </Field>
        <Field label="الكفيل">
          <input value={guarantor} onChange={(e) => setGuarantor(e.target.value)} />
        </Field>
        <Field label="موبايل الكفيل">
          <input value={guarantorPhone} onChange={(e) => setGuarantorPhone(e.target.value)} dir="ltr" />
        </Field>
      </div>
      <div className="plan-strip">
        <div>
          <span>زيادة التقسيط</span>
          <strong>{money(state, m)}</strong>
        </div>
        <div>
          <span>المجموع على الزبون</span>
          <strong>{money(state, p + m)}</strong>
        </div>
        <div>
          <span>القسط الشهري</span>
          <strong>{money(state, Math.floor((p + m) / n))}</strong>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button
          className="primary"
          onClick={async () => {
            if (!partyId) return notify('اختار الزبون', 'error');
            const res = await call<InstallmentPlan>('createInstallmentPlan', {
              partyId,
              date: today(),
              principal: p,
              markup: m,
              count: n,
              firstDue,
              ...(invoiceId ? { invoiceId } : {}),
              ...(guarantor.trim() ? { guarantor: guarantor.trim() } : {}),
              ...(guarantorPhone.trim() ? { guarantorPhone: guarantorPhone.trim() } : {}),
            });
            if (res) {
              notify(`تم إنشاء خطة التقسيط رقم ${res.value.number}`);
              onClose();
              onCreated(res.value.id);
            }
          }}
        >
          إنشاء الخطة
        </button>
      </div>
      {newParty && <PartyForm party={null} onClose={() => setNewParty(false)} onSaved={(pt) => setPartyId(pt.id)} />}
    </Modal>
  );
}

function PlanView({ plan, onBack }: { plan: InstallmentPlan; onBack: () => void }) {
  const { state, call, notify, can, navigate } = useCompany();
  const printer = usePrinter();
  const d = today();
  const st = installmentState(state, plan, d);
  const party = state.parties[plan.partyId];
  const [amount, setAmount] = useState(st.nextAmount ? toInput(state, st.nextAmount, plan.currency) : '');
  const cashes = cashAccounts(state, plan.currency);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  const reminder = `مرحباً ${party?.name ?? ''}، نذكّرك بقسط ${st.overdueCount ? `متأخر بقيمة ${money(state, st.overdueAmount, plan.currency)}` : `بتاريخ ${dateText(st.nextDue)} بقيمة ${money(state, st.nextAmount ?? 0, plan.currency)}`} لدى ${state.info!.name}. الباقي الكلي: ${money(state, st.remaining, plan.currency)}.`;
  const sheet = (
    <>
      <div className="plan-strip">
        <div>
          <span>المجموع</span>
          <strong>{money(state, st.total, plan.currency)}</strong>
        </div>
        <div>
          <span>المسدّد</span>
          <strong className="good">{money(state, st.paid, plan.currency)}</strong>
        </div>
        <div>
          <span>الباقي</span>
          <strong>{money(state, st.remaining, plan.currency)}</strong>
        </div>
        {st.overdueCount > 0 && (
          <div className="bad">
            <span>متأخر ({st.overdueCount})</span>
            <strong>{money(state, st.overdueAmount, plan.currency)}</strong>
          </div>
        )}
      </div>
      <table className="table installments-table">
        <thead>
          <tr>
            <th>#</th>
            <th>الاستحقاق</th>
            <th className="num">القسط</th>
            <th className="num">المدفوع</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {st.rows.map((r, i) => (
            <tr key={i} className={r.overdue ? 'late' : r.remaining === 0 ? 'paid' : ''}>
              <td>{i + 1}</td>
              <td>{dateText(r.due)}</td>
              <td className="num">{money(state, r.amount, plan.currency)}</td>
              <td className="num">{r.paid ? money(state, r.paid, plan.currency) : '—'}</td>
              <td>
                {r.remaining === 0 ? (
                  <span className="tag good">مدفوع</span>
                ) : r.overdue ? (
                  <span className="tag bad">متأخر</span>
                ) : r.paid ? (
                  <span className="tag">جزئي</span>
                ) : (
                  <span className="tag">مستحق</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
  return (
    <div className="page">
      <PageHeader title={`خطة تقسيط رقم ${plan.number} — ${party?.name ?? ''}`}>
        <button onClick={onBack}>
          <Icon name="prev" size={16} /> رجوع
        </button>
        <button onClick={() => void printer.print('invoice')}>
          <Icon name="printer" size={16} /> طباعة الجدول
        </button>
        {plan.status === 'active' && st.remaining > 0 && (
          <button onClick={() => void navigator.clipboard.writeText(reminder).then(() => notify('تم نسخ التذكير، الصقه بالواتساب'))}>نسخ تذكير واتساب</button>
        )}
        {plan.invoiceId && (
          <button className="ghost" onClick={() => navigate('invoice', plan.invoiceId!)}>
            الفاتورة
          </button>
        )}
        {plan.status === 'active' && can('sales.void') && st.paid === 0 && (
          <ConfirmButton
            label="إلغاء الخطة"
            onConfirm={async () => {
              if (await call('cancelInstallmentPlan', plan.id, d)) notify('تم إلغاء الخطة');
            }}
          />
        )}
      </PageHeader>
      <div className="two-col wide-first">
        <section className="card">{sheet}</section>
        <section className="card">
          <h3>قبض قسط</h3>
          {plan.status !== 'active' ? (
            <p className="muted">{plan.status === 'done' ? 'الخطة مسدّدة بالكامل.' : 'الخطة ملغاة.'}</p>
          ) : can('vouchers.create') ? (
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                let v = 0;
                try {
                  v = parseAmount(state, amount, plan.currency);
                } catch {
                  return notify('مبلغ غير صالح', 'error');
                }
                if (await call('collectInstallment', plan.id, { date: d, amount: v, cashAccountId: cash })) notify('تم قبض القسط');
              }}
            >
              <Field label="المبلغ" wide>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="الصندوق" wide>
                <select value={cash} onChange={(e) => setCash(e.target.value)}>
                  {cashes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-actions wide">
                <button className="primary">قبض</button>
              </div>
            </form>
          ) : null}
          <div className="kv">
            <span>الزبون</span>
            <strong>{party?.name}</strong>
            {party?.phone && (
              <>
                <span>الموبايل</span>
                <strong dir="ltr">{party.phone}</strong>
              </>
            )}
            {plan.guarantor && (
              <>
                <span>الكفيل</span>
                <strong>
                  {plan.guarantor} {plan.guarantorPhone && <small dir="ltr">{plan.guarantorPhone}</small>}
                </strong>
              </>
            )}
            {plan.markup > 0 && (
              <>
                <span>زيادة التقسيط</span>
                <strong>{money(state, plan.markup, plan.currency)}</strong>
              </>
            )}
          </div>
          {plan.payments.length > 0 && (
            <>
              <h4>الدفعات</h4>
              <table className="table compact">
                <tbody>
                  {plan.payments.map((p) => (
                    <tr key={p.entryId} className={state.voided[p.entryId] ? 'muted strike' : ''}>
                      <td>{dateText(p.date)}</td>
                      <td className="num">{money(state, p.amount, plan.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
      <div className="print-only">
        <div className="print-area invoice-doc">
          <DocHeader title="جدول أقساط">
            <div>خطة رقم {plan.number}</div>
            <div className="ltr">{dateText(plan.date)}</div>
          </DocHeader>
          <p>
            الزبون: <strong>{party?.name}</strong> {party?.phone && <span className="ltr">{party.phone}</span>}
            {plan.guarantor && (
              <>
                {' '}
                — الكفيل: <strong>{plan.guarantor}</strong> {plan.guarantorPhone && <span className="ltr">{plan.guarantorPhone}</span>}
              </>
            )}
          </p>
          {sheet}
          <div className="doc-signatures">
            <div>توقيع الزبون</div>
            <div>توقيع الكفيل</div>
            <div>توقيع المحل</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────── بيع مع استبدال ─────────────

export function TradeIn() {
  const { state, call, notify, navigate } = useCompany();
  const base = state.info!.baseCurrency;
  const [partyId, setPartyId] = useState<string | null>(null);
  const [newParty, setNewParty] = useState(false);
  const [newItem, setNewItem] = useState<string | null>(null);
  const [newSerial, setNewSerial] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [oldItem, setOldItem] = useState<string | null>(() => Object.values(state.items).find((i) => i.trackSerial && i.category === 'موبايلات مستعملة')?.id ?? null);
  const [oldModel, setOldModel] = useState('');
  const [oldSerial, setOldSerial] = useState('');
  const [condition, setCondition] = useState('نظيف');
  const [battery, setBattery] = useState('');
  const [oldPrice, setOldPrice] = useState('');
  const [received, setReceived] = useState('');
  const cashes = cashAccounts(state, base);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const serialItems = useMemo(() => itemOptions(state, (i: Item) => !!i.trackSerial), [state]);
  const available = newItem ? Object.keys(state.stock[newItem]?.serials ?? {}) : [];
  const amt = (t: string) => {
    try {
      return t.trim() ? parseAmount(state, t, base) : 0;
    } catch {
      return NaN;
    }
  };
  const diff = amt(newPrice) - amt(oldPrice);
  return (
    <div className="page">
      <PageHeader title="بيع مع استبدال" />
      <p className="muted">الزبون بيجيب جهازه القديم: منشتريه منه برقمه وحالته (بيدخل المخزون كمستعمل)، ومنبيعه الجديد، وبيدفع الفرق بس.</p>
      <section className="card form-grid">
        <Field label="الزبون" wide>
          <div className="with-button">
            <Picker options={customers} value={partyId} onChange={setPartyId} placeholder="ابحث بالاسم أو الموبايل..." />
            <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
              <Icon name="plus" size={16} />
            </button>
          </div>
        </Field>
      </section>
      <div className="two-col">
        <section className="card form-grid trade-new">
          <h3 className="wide">
            <Icon name="smartphone" size={18} /> الجهاز الجديد
          </h3>
          <Field label="الصنف" wide>
            <Picker
              options={serialItems}
              value={newItem}
              onChange={(v) => {
                setNewItem(v);
                setNewSerial('');
                const it = v ? state.items[v] : undefined;
                if (it) setNewPrice(itemPrice(state, it, { currency: base, date: today() }) || '');
              }}
              placeholder="اختار الجهاز (موبايل، لابتوب...)"
            />
          </Field>
          <Field label="IMEI / S/N" wide>
            <select value={newSerial} onChange={(e) => setNewSerial(e.target.value)} dir="ltr">
              <option value="">{available.length ? 'اختار الجهاز...' : 'ما في أجهزة من هالصنف بالمخزون'}</option>
              {available.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="سعر البيع" wide>
            <input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" />
          </Field>
        </section>
        <section className="card form-grid trade-old">
          <h3 className="wide">
            <Icon name="transfer" size={18} /> الجهاز القديم (من الزبون)
          </h3>
          <Field label="يدخل المخزون كصنف" wide>
            <Picker options={serialItems} value={oldItem} onChange={setOldItem} placeholder="موبايل مستعمل..." />
          </Field>
          <Field label="الموديل" wide>
            <input value={oldModel} onChange={(e) => setOldModel(e.target.value)} placeholder="iPhone 11 64GB، Dell Latitude 5490..." />
          </Field>
          <Field label="IMEI / S/N">
            <input value={oldSerial} onChange={(e) => setOldSerial(e.target.value)} dir="ltr" />
          </Field>
          <Field label="البطارية %">
            <input value={battery} onChange={(e) => setBattery(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </Field>
          <Field label="الحالة" wide>
            <input value={condition} onChange={(e) => setCondition(e.target.value)} list="conditions" />
            <datalist id="conditions">
              {['نظيف', 'كالجديد', 'خدوش خفيفة', 'شاشة مكسورة', 'بحاجة صيانة'].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="سعر الشراء (قيمة الاستبدال)" wide>
            <input value={oldPrice} onChange={(e) => setOldPrice(e.target.value)} inputMode="decimal" />
          </Field>
        </section>
      </div>
      <section className="card">
        <div className="plan-strip">
          <div>
            <span>الجديد</span>
            <strong>{money(state, amt(newPrice) || 0)}</strong>
          </div>
          <div>
            <span>− القديم</span>
            <strong>{money(state, amt(oldPrice) || 0)}</strong>
          </div>
          <div className={diff < 0 ? 'bad' : 'good'}>
            <span>{diff >= 0 ? 'الفرق على الزبون' : 'الفرق للزبون'}</span>
            <strong>{Number.isFinite(diff) ? money(state, Math.abs(diff)) : '—'}</strong>
          </div>
        </div>
        <div className="form-grid">
          <Field label={diff >= 0 ? 'المقبوض من الزبون الآن' : 'المدفوع للزبون الآن'}>
            <input value={received} onChange={(e) => setReceived(e.target.value)} placeholder={Number.isFinite(diff) ? toInput(state, Math.abs(diff), base) : ''} inputMode="decimal" />
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
        </div>
        <div className="form-actions">
          <button
            className="primary big"
            onClick={async () => {
              if (!partyId) return notify('اختار الزبون', 'error');
              if (!newItem || !newSerial) return notify('اختار الجهاز الجديد ورقمه', 'error');
              if (!oldItem || !oldSerial.trim()) return notify('اكتب صنف ورقم الجهاز القديم', 'error');
              const np = amt(newPrice);
              const op = amt(oldPrice);
              if (!(np > 0) || !(op > 0)) return notify('اكتب سعر الجهازين', 'error');
              const r = received.trim() ? amt(received) : Math.abs(np - op);
              if (!Number.isFinite(r)) return notify('مبلغ غير صالح', 'error');
              const note = [condition.trim(), battery ? `بطارية ${battery}%` : ''].filter(Boolean).join(' — ');
              const res = await call<{ sale: Invoice; purchase: Invoice }>('tradeIn', {
                date: today(),
                partyId,
                sale: [{ itemId: newItem, qty: 1, price: np, serials: [newSerial] }],
                tradeIn: [{ itemId: oldItem, description: oldModel.trim() || state.items[oldItem]?.name, qty: 1, price: op, serials: [oldSerial.trim()], ...(note ? { note } : {}) }],
                received: np >= op ? r : -r,
                cashAccountId: cash,
              });
              if (res) {
                notify(`تم: فاتورة مبيع ${res.value.sale.number} وفاتورة شراء ${res.value.purchase.number}`);
                navigate('invoice', res.value.sale.id);
              }
            }}
          >
            تنفيذ الاستبدال
          </button>
        </div>
      </section>
      {newParty && <PartyForm party={null} onClose={() => setNewParty(false)} onSaved={(pt) => setPartyId(pt.id)} />}
    </div>
  );
}

// ───────────── تجميعة كمبيوتر ─────────────

const SLOTS: { label: string; match?: RegExp }[] = [
  { label: 'المعالج', match: /معالج/ },
  { label: 'المازربورد', match: /مازربورد/ },
  { label: 'الرام', match: /رام/ },
  { label: 'التخزين (SSD / هارد)', match: /هارد|SSD/i },
  { label: 'كرت الشاشة', match: /كرت/ },
  { label: 'الباور والكيس', match: /باور|كيس/ },
  { label: 'الشاشة', match: /شاشات/ },
];

interface BuildRow {
  key: string;
  label: string;
  match?: RegExp;
  itemId: string | null;
  qty: string;
  price: string;
  serial: string;
}

export function PcBuild() {
  const { state, call, notify, navigate, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [rows, setRows] = useState<BuildRow[]>(() => SLOTS.map((s, i) => ({ key: String(i), label: s.label, ...(s.match ? { match: s.match } : {}), itemId: null, qty: '1', price: '', serial: '' })));
  const [name, setName] = useState('تجميعة كمبيوتر');
  const [fee, setFee] = useState('');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [paid, setPaid] = useState('');
  const cashes = cashAccounts(state, base);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const all = useMemo(() => itemOptions(state, (i: Item) => i.kind !== 'service' && i.price > 0), [state]);
  const amt = (t: string) => {
    try {
      return t.trim() ? parseAmount(state, t, base) : 0;
    } catch {
      return NaN;
    }
  };
  const used = rows.filter((r) => r.itemId);
  const parts = used.reduce((t, r) => t + Math.round((Number(r.qty) || 0) * amt(r.price)), 0);
  const total = parts + amt(fee);
  const upd = (key: string, patch: Partial<BuildRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const specs = used.map((r) => `${r.label}: ${state.items[r.itemId!]?.name}`).join(' · ');

  const lines = () => {
    for (const r of used) {
      const it = state.items[r.itemId!]!;
      if (it.trackSerial && !r.serial) throw new Error(`اختار الرقم التسلسلي لـ ${it.name}`);
      if (!Number.isFinite(amt(r.price))) throw new Error(`سعر غير صالح: ${it.name}`);
    }
    return [
      ...used.map((r) => ({ itemId: r.itemId!, qty: Number(r.qty) || 1, price: amt(r.price), ...(r.serial ? { serials: [r.serial] } : {}) })),
      ...(amt(fee) > 0 ? [{ itemId: null, description: 'أجور تجميع وتنصيب', qty: 1, price: amt(fee) }] : []),
    ];
  };

  return (
    <div className="page">
      <PageHeader title="تجميعة كمبيوتر" />
      <section className="card form-grid">
        <Field label="اسم التجميعة" wide>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="تجميعة جيمنج i5، كمبيوتر مكتبي..." />
        </Field>
        <Field label="الزبون (اختياري)" wide>
          <Picker options={[{ id: '', label: 'زبون نقدي' }, ...customers]} value={partyId ?? ''} onChange={(v) => setPartyId(v || null)} placeholder="زبون نقدي" />
        </Field>
      </section>
      <section className="card">
        <table className="table lines build-table">
          <thead>
            <tr>
              <th>القطعة</th>
              <th>الصنف</th>
              <th>S/N</th>
              <th>العدد</th>
              <th>السعر</th>
              <th className="num">المجموع</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const opts = r.match ? all.filter((o) => r.match!.test(o.item.category ?? '') || r.match!.test(o.item.name)) : all;
              const it = r.itemId ? state.items[r.itemId] : undefined;
              const serials = it?.trackSerial ? Object.keys(state.stock[it.id]?.serials ?? {}).filter((s) => s === r.serial || !rows.some((x) => x.serial === s)) : [];
              return (
                <tr key={r.key}>
                  <td>
                    <strong>{r.label}</strong>
                  </td>
                  <td style={{ minWidth: 260 }}>
                    <Picker
                      options={opts.length ? opts : all}
                      value={r.itemId}
                      onChange={(v) => {
                        const item = v ? state.items[v] : undefined;
                        upd(r.key, { itemId: v, serial: '', price: item ? itemPrice(state, item, { currency: base, date: today(), ...(partyId ? { party: state.parties[partyId] ?? null } : {}) }) || '' : '' });
                      }}
                      placeholder="اختار..."
                    />
                  </td>
                  <td>
                    {it?.trackSerial ? (
                      <select value={r.serial} onChange={(e) => upd(r.key, { serial: e.target.value })} dir="ltr">
                        <option value="">—</option>
                        {serials.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <input className="num-input" value={r.qty} onChange={(e) => upd(r.key, { qty: e.target.value.replace(/[^\d.]/g, '') })} disabled={!r.itemId || !!it?.trackSerial} />
                  </td>
                  <td>
                    <input className="num-input" value={r.price} onChange={(e) => upd(r.key, { price: e.target.value })} disabled={!r.itemId} />
                  </td>
                  <td className="num">{r.itemId ? money(state, Math.round((Number(r.qty) || 0) * (amt(r.price) || 0))) : ''}</td>
                  <td>
                    {r.itemId && (
                      <button type="button" className="icon" title="تفريغ" onClick={() => upd(r.key, { itemId: null, price: '', serial: '' })}>
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="button-row">
          <button type="button" onClick={() => setRows([...rows, { key: String(Date.now()), label: 'قطعة إضافية', itemId: null, qty: '1', price: '', serial: '' }])}>
            <Icon name="plus" size={16} /> قطعة إضافية (ماوس، كيبورد، كولر...)
          </button>
        </div>
        <div className="form-grid">
          <Field label="أجور التجميع والتنصيب">
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <div className="plan-strip">
          <div>
            <span>القطع ({used.length})</span>
            <strong>{money(state, parts || 0)}</strong>
          </div>
          <div>
            <span>أجور التجميع</span>
            <strong>{money(state, amt(fee) || 0)}</strong>
          </div>
          <div className="good">
            <span>سعر التجميعة</span>
            <strong>{Number.isFinite(total) ? money(state, total) : '—'}</strong>
          </div>
        </div>
      </section>
      <section className="card form-grid">
        <Field label="المقبوض الآن">
          <input value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={Number.isFinite(total) ? toInput(state, total, base) : ''} inputMode="decimal" />
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
        <div className="form-actions wide">
          <button
            disabled={!used.length}
            onClick={async () => {
              try {
                const ls = lines();
                const res = await call<{ id: string; number: number }>('saveQuote', {
                  id: crypto.randomUUID(),
                  date: today(),
                  validUntil: addDays(today(), 7),
                  partyId,
                  ...(partyId ? {} : { customerName: 'زبون' }),
                  currency: base,
                  lines: ls.map((l) => ({ itemId: l.itemId, description: l.itemId ? state.items[l.itemId]!.name : 'أجور تجميع وتنصيب', qty: l.qty, price: l.price })),
                  discount: 0,
                  taxIds: [],
                  notes: `${name.trim()} — ${specs}`,
                  status: 'open',
                });
                if (res) {
                  notify(`تم حفظ عرض السعر رقم ${res.value.number}`);
                  navigate('quote', res.value.id);
                }
              } catch (e) {
                notify((e as Error).message, 'error');
              }
            }}
          >
            <Icon name="file" size={16} /> حفظ كعرض سعر
          </button>
          <button
            className="primary big"
            disabled={!used.length || !can('sales.create')}
            onClick={async () => {
              try {
                const ls = lines();
                const p = paid.trim() ? amt(paid) : total;
                if (!Number.isFinite(p)) return notify('مبلغ غير صالح', 'error');
                if (!partyId && p < total) return notify('البيع بالدين بدو زبون؛ اختار الزبون', 'error');
                const res = await call<Invoice>('postInvoice', { kind: 'sale', date: today(), partyId, currency: base, lines: ls, paid: p, cashAccountId: cash, notes: `${name.trim()} — ${specs}` });
                if (res) {
                  notify(`تم بيع التجميعة — فاتورة رقم ${res.value.number}`);
                  navigate('invoice', res.value.id);
                }
              } catch (e) {
                notify((e as Error).message, 'error');
              }
            }}
          >
            بيع التجميعة
          </button>
        </div>
      </section>
    </div>
  );
}
