import { useMemo, useState } from 'react';
import { WOOD_EXPENSE_KINDS, WOOD_UNITS, woodExpenses, woodLotSales, woodLotSummary, woodUnitsText, type WoodLot } from '../../../core';
import { dateText, money, parseAmount, qtyText, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { askConfirm, ConfirmButton, Empty, Field, Modal, PageHeader, partyOptions, Picker, Stat, Tabs } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';
import { PartyForm } from './Parties';

const WOOD_KINDS = ['سنديان', 'زيتون', 'حمضيات', 'صنوبر', 'مشمش', 'كينا', 'لزّاب', 'خشب نجارة', 'مخلوط'];
const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫،,]/g, '.').trim()) || 0;

/** مبلغ بالليرة السورية: إذا كتبه بالقديمة (6,000,000) منقسمه على 100 (60,000 جديدة). */
function useMoneyInput() {
  const { state } = useCompany();
  const base = state.info!.baseCurrency;
  const syp = base === 'SYP';
  const [old, setOld] = useState(false);
  const parse = (text: string): number => {
    if (!text.trim()) return 0;
    if (old && syp) {
      // القديمة ÷ 100 = الجديدة، وبعدين لأصغر وحدة
      return Math.round((num(text) / 100) * 10 ** (state.currencies[base]?.decimals ?? 2));
    }
    return parseAmount(state, text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), base);
  };
  const toggle = syp ? (
    <label className="check old-lira">
      <input type="checkbox" checked={old} onChange={(e) => setOld(e.target.checked)} /> بالليرة القديمة
    </label>
  ) : null;
  return { parse, toggle, old: old && syp };
}

/** معمل الحطب: حمولات بتنشرى بالقيمة، مصاريف، بيع بالطن والشوال والقطعة، وربح كل حمولة. */
export function WoodLots() {
  const { state, can, navigate } = useCompany();
  const [tab, setTab] = useState<'open' | 'closed' | 'expenses'>('open');
  const [buying, setBuying] = useState(false);
  const [selling, setSelling] = useState<string | null | false>(false);
  const [spending, setSpending] = useState<string | null | false>(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const showCost = can('costs.view');
  const lots = useMemo(() => Object.values(state.woodLots ?? {}).filter((l) => l.status !== 'cancelled').sort((a, b) => b.number - a.number), [state.woodLots]);
  const open = lots.filter((l) => l.status === 'open');
  const month = today().slice(0, 7);
  const monthSales = state.invoices.filter((i) => i.source?.type === 'woodlot' && !i.voidEntryId && !i.deleted && i.date.startsWith(month)).reduce((s, i) => s + i.total - i.taxTotal, 0);
  const monthExpenses = woodExpenses(state).filter((x) => x.date.startsWith(month)).reduce((s, x) => s + x.amount, 0);
  const tied = open.reduce((s, l) => s + Math.max(0, woodLotSummary(state, l).toBreakEven), 0);
  const shown = tab === 'open' ? open : lots.filter((l) => l.status === 'closed');

  return (
    <div className="page wood">
      <PageHeader title="حمولات الحطب">
        {can('purchases.create') && (
          <button className="primary" onClick={() => setBuying(true)}>
            <Icon name="plus" size={16} /> حمولة جديدة
          </button>
        )}
        {can('sales.create') && open.length > 0 && (
          <button className="primary accent" onClick={() => setSelling(null)}>
            <Icon name="receipt" size={16} /> بيع
          </button>
        )}
        {can('vouchers.create') && (
          <button onClick={() => setSpending(null)}>
            <Icon name="wallet" size={16} /> مصروف
          </button>
        )}
      </PageHeader>

      <div className="stats">
        <Stat label="حمولات مفتوحة" value={String(open.length)} hint={open.length ? open.map((l) => l.title).slice(0, 3).join('، ') : 'ما في'} />
        {showCost && <Stat label="لسا لترجع رأس المال" value={money(state, tied)} hint="بالحمولات المفتوحة" tone={tied ? 'bad' : 'good'} />}
        <Stat label="مبيع هالشهر" value={money(state, monthSales)} tone="good" />
        {showCost && <Stat label="مصاريف هالشهر" value={money(state, monthExpenses)} hint="عمال، صيانة، مازوت..." onClick={() => setTab('expenses')} />}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'open', label: `المفتوحة (${open.length})` },
          { key: 'closed', label: 'اللي خلصت' },
          { key: 'expenses', label: 'المصاريف', hidden: !showCost },
        ]}
      />

      {tab === 'expenses' ? (
        <ExpensesList />
      ) : shown.length === 0 ? (
        <section className="card">
          <Empty>{tab === 'open' ? 'ما في حمولات مفتوحة. اكبس «حمولة جديدة» وسجّل قيمة الحطب اللي اشتريتو.' : 'لسا ما خلصت ولا حمولة.'}</Empty>
        </section>
      ) : (
        <div className="wood-grid">
          {shown.map((lot, i) => (
            <LotCard key={lot.id} lot={lot} index={i} onSell={() => setSelling(lot.id)} onSpend={() => setSpending(lot.id)} onOpen={() => setViewing(lot.id)} />
          ))}
        </div>
      )}

      {buying && <BuyLot onClose={() => setBuying(false)} />}
      {selling !== false && <SellWood lotId={selling} onClose={() => setSelling(false)} onDone={(id) => navigate('invoice', id)} />}
      {spending !== false && <AddExpense lotId={spending} onClose={() => setSpending(false)} />}
      {viewing && state.woodLots?.[viewing] && <LotDetails lot={state.woodLots[viewing]!} onClose={() => setViewing(null)} onSell={() => setSelling(viewing)} onSpend={() => setSpending(viewing)} />}
    </div>
  );
}

/** بطاقة الحمولة: شريط بيبيّن قديش رجع من رأس المال، وبعدين الربح. */
function LotCard({ lot, index, onSell, onSpend, onOpen }: { lot: WoodLot; index: number; onSell: () => void; onSpend: () => void; onOpen: () => void }) {
  const { state, can } = useCompany();
  const s = woodLotSummary(state, lot);
  const capital = s.cost + s.expenses;
  const pct = capital > 0 ? Math.min(100, Math.round((s.sales / capital) * 100)) : 0;
  const showCost = can('costs.view');
  return (
    <article className={`wood-card ${s.profit >= 0 ? 'won' : ''}`} style={{ ['--i' as string]: Math.min(index, 12) }}>
      <header onClick={onOpen}>
        <span className="wood-icon">
          <Icon name="tree" size={20} />
        </span>
        <div>
          <h4>
            {lot.title} <small className="muted">#{lot.number}</small>
          </h4>
          <small className="muted">
            {dateText(lot.date)}
            {lot.supplierId ? ` · ${state.parties[lot.supplierId]?.name ?? ''}` : ''}
          </small>
        </div>
        {lot.status === 'closed' && <span className="badge-soft">خلصت</span>}
      </header>
      {showCost && (
        <>
          <div className="wood-bar" title={`رجع ${pct}% من رأس المال`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="wood-nums">
            <span>
              الحمولة <b>{money(state, s.cost)}</b>
            </span>
            <span>
              مصاريف <b>{money(state, s.expenses)}</b>
            </span>
            <span>
              مبيع <b className="good">{money(state, s.sales)}</b>
            </span>
          </div>
          <div className={`wood-profit ${s.profit >= 0 ? 'good' : 'bad'}`}>
            {s.profit >= 0 ? (
              <>
                ربح <b>{money(state, s.profit)}</b>
              </>
            ) : (
              <>
                لسا <b>{money(state, -s.profit)}</b> لترجع رأس المال
              </>
            )}
          </div>
        </>
      )}
      <small className="muted">{s.invoices ? `انباع: ${woodUnitsText(s.byUnit)}` : 'لسا ما انباع منها شي'}</small>
      {lot.status === 'open' && (
        <div className="wood-actions">
          {can('vouchers.create') && (
            <button type="button" onClick={onSpend}>
              <Icon name="wallet" size={15} /> مصروف
            </button>
          )}
          {can('sales.create') && (
            <button type="button" className="primary" onClick={onSell}>
              <Icon name="receipt" size={15} /> بيع
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function BuyLot({ onClose }: { onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const m = useMoneyInput();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [cost, setCost] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<'all' | 'none' | 'part'>('all');
  const [paidText, setPaidText] = useState('');
  const [cashId, setCashId] = useState(cashAccounts(state, base)[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [newParty, setNewParty] = useState(false);
  let value = 0;
  let err = '';
  try {
    value = m.parse(cost);
  } catch (e) {
    err = (e as Error).message;
  }
  const save = async () => {
    if (!title.trim()) return notify('اكتب نوع الحطب', 'error');
    if (err || !(value > 0)) return notify(err || 'اكتب قيمة الحمولة', 'error');
    let paid = value;
    try {
      paid = !supplierId ? value : payMode === 'all' ? value : payMode === 'none' ? 0 : m.parse(paidText);
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    const res = await call<WoodLot>('buyWoodLot', { date, title, cost: value, ...(supplierId ? { supplierId, paid } : {}), cashAccountId: cashId, notes });
    if (res) {
      notify(`انسجّلت حمولة ${res.value.title} رقم ${res.value.number}`);
      onClose();
    }
  };
  return (
    <Modal title="حمولة حطب جديدة" onClose={onClose} width={620}>
      <p className="muted">سجّل قيمة الحمولة بس، بدون وزن ولا كمية. البرنامج بيحسبلك قديش رجع منها مع كل بيعة، وقديش ربحت لما تخلص.</p>
      <Field label="نوع الحطب">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="سنديان، زيتون..." autoFocus />
      </Field>
      <div className="chips">
        {WOOD_KINDS.map((k) => (
          <button key={k} type="button" className={title === k ? 'active' : ''} onClick={() => setTitle(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <Field label="قيمة الحمولة">
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder={m.old ? 'مثلاً 6000000' : 'مثلاً 60000'} />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {m.toggle}
      {value > 0 && !err && <p className="wood-hint">= {money(state, value)}</p>}
      <Field label="المورد (اختياري)">
        <div className="with-button">
          <Picker options={partyOptions(state, 'supplier')} value={supplierId} onChange={setSupplierId} placeholder="بدون مورد (دفع كاش)" />
          <button type="button" className="icon" title="مورد جديد" onClick={() => setNewParty(true)}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      </Field>
      {supplierId && (
        <>
          <Tabs
            value={payMode}
            onChange={setPayMode}
            tabs={[
              { key: 'all', label: 'دفعت كلها' },
              { key: 'part', label: 'دفعت قسم' },
              { key: 'none', label: 'كلها دين' },
            ]}
          />
          {payMode === 'part' && (
            <Field label="المدفوع">
              <input value={paidText} onChange={(e) => setPaidText(e.target.value)} inputMode="decimal" />
            </Field>
          )}
        </>
      )}
      {(!supplierId || payMode !== 'none') && cashAccounts(state, base).length > 1 && (
        <Field label="من الصندوق">
          <select value={cashId} onChange={(e) => setCashId(e.target.value)}>
            {cashAccounts(state, base).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="ملاحظات">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="من وين، شو الحالة..." />
      </Field>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="primary" onClick={() => void save()}>
          تسجيل الحمولة
        </button>
      </div>
      {newParty && <PartyForm party={null} defaultKind="supplier" onClose={() => setNewParty(false)} onSaved={(p) => setSupplierId(p.id)} />}
    </Modal>
  );
}

type SaleLine = { key: string; unit: string; qty: string; price: string };

function SellWood({ lotId, onClose, onDone }: { lotId: string | null; onClose: () => void; onDone: (invoiceId: string) => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const m = useMoneyInput();
  const open = Object.values(state.woodLots ?? {}).filter((l) => l.status === 'open').sort((a, b) => a.number - b.number);
  const [lot, setLot] = useState(lotId ?? open[0]?.id ?? '');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<SaleLine[]>([{ key: uid(), unit: 'طن', qty: '', price: '' }]);
  const [paidText, setPaidText] = useState<string | null>(null);
  const [cashId, setCashId] = useState(cashAccounts(state, base)[0]?.id ?? '');
  const [newParty, setNewParty] = useState(false);
  const set = (key: string, p: Partial<SaleLine>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  let total = 0;
  let err = '';
  try {
    total = lines.reduce((s, l) => s + Math.round(num(l.qty) * m.parse(l.price)), 0);
  } catch (e) {
    err = (e as Error).message;
  }
  const sell = async () => {
    if (!lot) return notify('اختار الحمولة', 'error');
    if (err) return notify(err, 'error');
    const ls = lines.filter((l) => num(l.qty) > 0).map((l) => ({ unit: l.unit.trim() || 'قطعة', qty: num(l.qty), price: m.parse(l.price) }));
    if (!ls.length) return notify('اكتب الكمية والسعر', 'error');
    let paid: number | undefined;
    try {
      paid = paidText === null ? (partyId ? undefined : total) : m.parse(paidText);
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    const res = await call<{ id: string; number: number }>('sellWood', lot, { date, partyId, lines: ls, ...(paid !== undefined ? { paid } : {}), cashAccountId: cashId });
    if (res) {
      notify(`انعملت فاتورة رقم ${res.value.number}`);
      onClose();
      onDone(res.value.id);
    }
  };
  return (
    <Modal title="بيع حطب" onClose={onClose} width={640}>
      <div className="form-grid">
        <Field label="من الحمولة">
          <select value={lot} onChange={(e) => setLot(e.target.value)}>
            {open.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} #{l.number}
              </option>
            ))}
          </select>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="الزبون">
        <div className="with-button">
          <Picker options={partyOptions(state, 'customer')} value={partyId} onChange={setPartyId} placeholder="زبون نقدي" />
          <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      </Field>
      <div className="wood-lines">
        {lines.map((l) => (
          <div key={l.key} className="wood-line">
            <div className="chips">
              {WOOD_UNITS.map((u) => (
                <button key={u} type="button" className={l.unit === u ? 'active' : ''} onClick={() => set(l.key, { unit: u })}>
                  {u}
                </button>
              ))}
            </div>
            <div className="wood-line-nums">
              <input value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} inputMode="decimal" placeholder={`كم ${l.unit}`} aria-label="الكمية" />
              <span>×</span>
              <input value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} inputMode="decimal" placeholder={`سعر ال${l.unit}`} aria-label="السعر" />
              {lines.length > 1 && (
                <button type="button" className="icon" aria-label="حذف" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" className="link" onClick={() => setLines([...lines, { key: uid(), unit: 'شوال', qty: '', price: '' }])}>
          + وحدة تانية (طن وشوالات مع بعض)
        </button>
      </div>
      {m.toggle}
      <div className="wood-total">
        الإجمالي <b>{err ? '—' : money(state, total)}</b>
      </div>
      <div className="form-grid">
        <Field label={partyId ? 'المقبوض هلق' : 'المقبوض'}>
          <input value={paidText ?? ''} onChange={(e) => setPaidText(e.target.value)} inputMode="decimal" placeholder={partyId ? 'فاضي = كلها دين' : 'كامل المبلغ'} />
        </Field>
        {cashAccounts(state, base).length > 1 && (
          <Field label="عالصندوق">
            <select value={cashId} onChange={(e) => setCashId(e.target.value)}>
              {cashAccounts(state, base).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="primary" disabled={!lot || !(total > 0)} onClick={() => void sell()}>
          بيع وطباعة الفاتورة
        </button>
      </div>
      {newParty && <PartyForm party={null} defaultKind="customer" onClose={() => setNewParty(false)} onSaved={(p) => setPartyId(p.id)} />}
    </Modal>
  );
}

function AddExpense({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const m = useMoneyInput();
  const open = Object.values(state.woodLots ?? {}).filter((l) => l.status === 'open').sort((a, b) => b.number - a.number);
  const [kind, setKind] = useState(WOOD_EXPENSE_KINDS[0]!.kind);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [lot, setLot] = useState(lotId ?? '');
  const [date, setDate] = useState(today());
  const [cashId, setCashId] = useState(cashAccounts(state, base)[0]?.id ?? '');
  const save = async () => {
    let value = 0;
    try {
      value = m.parse(amount);
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    if (!(value > 0)) return notify('اكتب المبلغ', 'error');
    if (await call('addWoodExpense', { date, kind, description, amount: value, ...(lot ? { lotId: lot } : {}), cashAccountId: cashId })) {
      notify(`انسجّل مصروف ${kind}`);
      onClose();
    }
  };
  return (
    <Modal title="مصروف المعمل" onClose={onClose} width={560}>
      <div className="chips">
        {WOOD_EXPENSE_KINDS.map((k) => (
          <button key={k.kind} type="button" className={kind === k.kind ? 'active' : ''} onClick={() => setKind(k.kind)}>
            {k.kind}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <Field label="المبلغ">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {m.toggle}
      <Field label="على الحمولة">
        <select value={lot} onChange={(e) => setLot(e.target.value)}>
          <option value="">مصروف عام للمعمل</option>
          {open.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} #{l.number}
            </option>
          ))}
        </select>
      </Field>
      <Field label="تفاصيل (اختياري)">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثلاً: 3 عمال يومين" />
      </Field>
      {cashAccounts(state, base).length > 1 && (
        <Field label="من الصندوق">
          <select value={cashId} onChange={(e) => setCashId(e.target.value)}>
            {cashAccounts(state, base).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="primary" onClick={() => void save()}>
          حفظ المصروف
        </button>
      </div>
    </Modal>
  );
}

function LotDetails({ lot, onClose, onSell, onSpend }: { lot: WoodLot; onClose: () => void; onSell: () => void; onSpend: () => void }) {
  const { state, call, notify, can, navigate } = useCompany();
  const s = woodLotSummary(state, lot);
  const sales = woodLotSales(state, lot.id);
  const expenses = woodExpenses(state, lot.id);
  const showCost = can('costs.view');
  return (
    <Modal title={`حمولة ${lot.title} #${lot.number}`} onClose={onClose} width={720}>
      <p className="muted">
        {dateText(lot.date)}
        {lot.supplierId ? ` · من ${state.parties[lot.supplierId]?.name ?? ''}` : ''}
        {lot.notes ? ` · ${lot.notes}` : ''}
        {lot.status === 'closed' && lot.closedAt ? ` · خلصت ${dateText(lot.closedAt)}` : ''}
      </p>
      {showCost && (
        <div className="stats">
          <Stat label="قيمة الحمولة" value={money(state, s.cost)} />
          <Stat label="المصاريف" value={money(state, s.expenses)} />
          <Stat label="المبيع" value={money(state, s.sales)} tone="good" hint={woodUnitsText(s.byUnit) || undefined} />
          <Stat label={s.profit >= 0 ? 'الربح' : 'لسا لرأس المال'} value={money(state, Math.abs(s.profit))} tone={s.profit >= 0 ? 'good' : 'bad'} />
        </div>
      )}
      <h4>المبيعات ({sales.length})</h4>
      {sales.length === 0 ? (
        <p className="muted">ما انباع منها شي لسا</p>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الفاتورة</th>
              <th>الزبون</th>
              <th>الكمية</th>
              <th className="num">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((inv) => (
              <tr key={inv.id} className="clickable" onClick={() => navigate('invoice', inv.id)}>
                <td>{dateText(inv.date)}</td>
                <td>#{inv.number}</td>
                <td>{inv.partyId ? state.parties[inv.partyId]?.name : 'نقدي'}</td>
                <td>{inv.lines.map((l) => `${qtyText(l.qty)} ${/\(([^()]+)\)$/.exec(l.description)?.[1] ?? ''}`).join(' + ')}</td>
                <td className="num">{money(state, inv.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showCost && (
        <>
          <h4>المصاريف ({expenses.length})</h4>
          {expenses.length === 0 ? (
            <p className="muted">ما في مصاريف على هالحمولة</p>
          ) : (
            <table className="table compact">
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id}>
                    <td>{dateText(x.date)}</td>
                    <td>
                      {x.kind}
                      {x.description ? <small className="muted"> · {x.description}</small> : null}
                    </td>
                    <td className="num">{money(state, x.amount)}</td>
                    <td>
                      {can('vouchers.void') && (
                        <ConfirmButton
                          className="small"
                          label="إلغاء"
                          confirmLabel="متأكد؟"
                          onConfirm={async () => {
                            if (await call('removeWoodExpense', x.id, today())) notify('انلغى المصروف');
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <div className="form-actions">
        {lot.status === 'open' && sales.length === 0 && can('purchases.create') && (
          <ConfirmButton
            className="push-start"
            label="إلغاء الحمولة"
            confirmLabel="متأكد؟ انسجّلت بالغلط"
            onConfirm={async () => {
              if (await call('cancelWoodLot', lot.id, today())) {
                notify('انلغت الحمولة');
                onClose();
              }
            }}
          />
        )}
        {lot.status === 'open' && can('production.manage') && (
          <button
            type="button"
            onClick={async () => {
              if (!(await askConfirm(`خلصت حمولة ${lot.title}؟ قيمتها بتنتقل لتكلفة المبيعات وبيبيّن ربحها بالتقارير. (فيك ترجّعها إذا غلطت)`))) return;
              if (await call('closeWoodLot', lot.id, today())) notify(`تسكّرت حمولة ${lot.title}`);
            }}
          >
            <Icon name="check" size={16} /> الحمولة خلصت
          </button>
        )}
        {lot.status === 'closed' && can('production.manage') && (
          <button type="button" onClick={async () => (await call('reopenWoodLot', lot.id, today())) && notify('رجعت الحمولة مفتوحة')}>
            رجّعها مفتوحة
          </button>
        )}
        {lot.status === 'open' && can('vouchers.create') && (
          <button type="button" onClick={onSpend}>
            <Icon name="wallet" size={16} /> مصروف
          </button>
        )}
        {lot.status === 'open' && can('sales.create') && (
          <button type="button" className="primary" onClick={onSell}>
            <Icon name="receipt" size={16} /> بيع
          </button>
        )}
      </div>
    </Modal>
  );
}

function ExpensesList() {
  const { state } = useCompany();
  const all = woodExpenses(state);
  const byKind = new Map<string, number>();
  for (const x of all) byKind.set(x.kind, (byKind.get(x.kind) ?? 0) + x.amount);
  if (!all.length) {
    return (
      <section className="card">
        <Empty>ما في مصاريف لسا. اكبس «مصروف» وسجّل أجور العمال والصيانة والمازوت.</Empty>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="chips static">
        {[...byKind].map(([k, v]) => (
          <span key={k} className="chip-stat">
            {k}: <b>{money(state, v)}</b>
          </span>
        ))}
      </div>
      <table className="table compact">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th>التفاصيل</th>
            <th>الحمولة</th>
            <th className="num">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {all.map((x) => (
            <tr key={x.id}>
              <td>{dateText(x.date)}</td>
              <td>{x.kind}</td>
              <td>{x.description ?? ''}</td>
              <td>{x.lotId ? `${state.woodLots?.[x.lotId]?.title ?? ''} #${state.woodLots?.[x.lotId]?.number ?? ''}` : 'عام'}</td>
              <td className="num">{money(state, x.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
