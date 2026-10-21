import { useMemo, useState } from 'react';
import { partyBalance, type CompanyState, type JournalEntry, type Party } from '../../../core';
import { addDays, dateText, major, money, parseAmount, today, toInput, uid, useCompany } from '../api';
import { ExportButtons } from '../components/print';
import { CurrencySelect, Empty, Field, Modal, PageHeader, partyOptions, Picker, SearchBox, matches } from '../components/ui';
import { Icon } from '../components/icons';
import { cashAccounts } from './InvoiceEditor';
import { PartyPanel } from './Parties';

// قسم الديون: مين إلو عندي ومين إلي عندو، بدون فواتير. الدين والتسديد بكبسة.

type View = 'owed' | 'owe' | 'all';

interface Row {
  party: Party;
  base: number; // موجب = إلنا عندو، سالب = إلو عنا
  byCurrency: [string, number][];
  last: string;
  due?: string;
}

function debtRows(state: CompanyState): Row[] {
  const last: Record<string, string> = {};
  for (const e of state.entries) for (const l of e.lines) if (l.partyId && (!last[l.partyId] || e.date > last[l.partyId]!)) last[l.partyId] = e.date;
  return Object.values(state.parties)
    .filter((p) => !p.archived)
    .map((p) => {
      const b = partyBalance(state, p.id);
      return { party: p, base: b.base, byCurrency: Object.entries(b.byCurrency).filter(([, v]) => v !== 0), last: last[p.id] ?? '', ...(p.debtDue ? { due: p.debtDue } : {}) };
    })
    .filter((r) => r.base !== 0 || r.byCurrency.length > 0);
}

/** نص «عليه 500 ل.س + 20 $» من أرصدة العملات. */
function amountsText(state: CompanyState, list: [string, number][], sign: 1 | -1): string {
  return list
    .filter(([, v]) => v * sign > 0)
    .map(([c, v]) => money(state, Math.abs(v), c))
    .join(' + ');
}

export function Debts() {
  const { state, can } = useCompany();
  const d = today();
  const [view, setView] = useState<View>('owed');
  const [query, setQuery] = useState('');
  const [newDebt, setNewDebt] = useState<'owed' | 'owe' | null>(null);
  const [paying, setPaying] = useState<{ party: Party; direction: 'in' | 'out' } | null>(null);
  const [showing, setShowing] = useState<Party | null>(null);
  const rows = useMemo(() => debtRows(state), [state]);
  const owedTotal = rows.filter((r) => r.base > 0).reduce((s, r) => s + r.base, 0);
  const oweTotal = rows.filter((r) => r.base < 0).reduce((s, r) => s - r.base, 0);
  const late = rows.filter((r) => r.due && r.due < d && r.base !== 0);
  const dueSoon = rows.filter((r) => r.due && r.due >= d && r.due <= addDays(d, 7) && r.base !== 0);
  const shown = rows
    .filter((r) => (view === 'owed' ? r.base > 0 : view === 'owe' ? r.base < 0 : true))
    .filter((r) => matches(query, r.party.name, r.party.phone))
    .sort((a, b) => {
      // المتأخر أول، بعدين الأكبر
      const la = a.due && a.due < d ? 1 : 0;
      const lb = b.due && b.due < d ? 1 : 0;
      return lb - la || Math.abs(b.base) - Math.abs(a.base);
    });
  const canWrite = can('vouchers.create');

  return (
    <div className="page debts">
      <PageHeader title="الديون">
        {canWrite && (
          <>
            <button className="primary" onClick={() => setNewDebt('owed')}>
              <Icon name="plus" size={16} /> دين إلي على حدا
            </button>
            <button className="danger-soft" onClick={() => setNewDebt('owe')}>
              <Icon name="plus" size={16} /> دين علي لحدا
            </button>
          </>
        )}
        <ExportButtons
          name="الديون"
          sheets={() => [
            {
              name: 'الديون',
              columns: [
                { header: 'الاسم', key: 'name' },
                { header: 'الهاتف', key: 'phone' },
                { header: 'إلنا عندو', key: 'owed', type: 'money' },
                { header: 'إلو عنا', key: 'owe', type: 'money' },
                { header: 'موعد السداد', key: 'due' },
                { header: 'آخر حركة', key: 'last' },
              ],
              rows: rows.map((r) => ({
                name: r.party.name,
                phone: r.party.phone ?? '',
                owed: r.base > 0 ? major(state, r.base) : null,
                owe: r.base < 0 ? major(state, -r.base) : null,
                due: r.due ? dateText(r.due) : '',
                last: r.last ? dateText(r.last) : '',
              })),
            },
          ]}
        />
      </PageHeader>

      <div className="stats debt-stats">
        <div className={`stat clickable ${view === 'owed' ? 'selected' : ''}`} onClick={() => setView('owed')}>
          <span>
            <Icon name="debts" size={16} /> إلي عند الناس
          </span>
          <strong className="good">{money(state, owedTotal)}</strong>
          <small className="muted">{rows.filter((r) => r.base > 0).length} شخص</small>
        </div>
        <div className={`stat clickable ${view === 'owe' ? 'selected' : ''}`} onClick={() => setView('owe')}>
          <span>
            <Icon name="debts" size={16} /> علي للناس
          </span>
          <strong className="bad">{money(state, oweTotal)}</strong>
          <small className="muted">{rows.filter((r) => r.base < 0).length} شخص</small>
        </div>
        <div className="stat">
          <span>الصافي</span>
          <strong className={owedTotal - oweTotal >= 0 ? 'good' : 'bad'}>{money(state, Math.abs(owedTotal - oweTotal))}</strong>
          <small className="muted">{owedTotal >= oweTotal ? 'إلك أكتر ما عليك' : 'عليك أكتر ما إلك'}</small>
        </div>
        <div className={`stat ${late.length ? 'warn' : ''}`}>
          <span>
            <Icon name="bell" size={16} /> مواعيد السداد
          </span>
          <strong className={late.length ? 'bad' : ''}>{late.length} متأخر</strong>
          <small className="muted">{dueSoon.length} خلال هالأسبوع</small>
        </div>
      </div>

      <section className="card">
        <div className="debt-toolbar">
          <div className="segmented">
            <button className={view === 'owed' ? 'active' : ''} onClick={() => setView('owed')}>
              إلي عندهم
            </button>
            <button className={view === 'owe' ? 'active' : ''} onClick={() => setView('owe')}>
              عليّ إلهم
            </button>
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
              الكل
            </button>
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder="بحث بالاسم أو الرقم..." />
        </div>
        {shown.length === 0 ? (
          <Empty>{view === 'owed' ? 'ما حدا عليه دين إلك — ممتاز' : view === 'owe' ? 'ما عليك ولا دين' : 'ما في ديون'}</Empty>
        ) : (
          <table className="table debt-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th className="num">المبلغ</th>
                <th>موعد السداد</th>
                <th>آخر حركة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const lateRow = r.due && r.due < d;
                return (
                  <tr key={r.party.id} className={`clickable ${lateRow ? 'late' : ''}`} onClick={() => setShowing(r.party)}>
                    <td>
                      <strong>{r.party.name}</strong>
                      {r.party.phone && (
                        <small className="muted block ltr" dir="ltr">
                          {r.party.phone}
                        </small>
                      )}
                    </td>
                    <td className="num">
                      {r.byCurrency.filter(([, v]) => v > 0).length > 0 && <div className="debit">إلك: {amountsText(state, r.byCurrency, 1)}</div>}
                      {r.byCurrency.filter(([, v]) => v < 0).length > 0 && <div className="credit">عليك: {amountsText(state, r.byCurrency, -1)}</div>}
                    </td>
                    <td>{r.due ? <span className={`due-badge ${lateRow ? 'late' : r.due === d ? 'today' : ''}`}>{lateRow ? `متأخر من ${dateText(r.due)}` : r.due === d ? 'اليوم' : dateText(r.due)}</span> : <span className="muted">—</span>}</td>
                    <td className="muted">{r.last ? `${dateText(r.last)} · ${daysAgo(r.last, d)}` : ''}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="button-row">
                        {canWrite && r.base > 0 && (
                          <button className="primary" onClick={() => setPaying({ party: r.party, direction: 'in' })}>
                            قبضت منه
                          </button>
                        )}
                        {canWrite && r.base < 0 && (
                          <button className="primary" onClick={() => setPaying({ party: r.party, direction: 'out' })}>
                            دفعتله
                          </button>
                        )}
                        {r.base > 0 && <ReminderButton state={state} row={r} />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {newDebt && <DebtForm direction={newDebt} onClose={() => setNewDebt(null)} />}
      {paying && <PayForm party={paying.party} direction={paying.direction} onClose={() => setPaying(null)} />}
      {showing && (
        <Modal title={`حساب ${showing.name}`} onClose={() => setShowing(null)} width={920}>
          {canWrite && (
            <div className="button-row debt-panel-actions">
              <button onClick={() => (setPaying({ party: showing, direction: 'in' }), setShowing(null))}>قبضت منه</button>
              <button onClick={() => (setPaying({ party: showing, direction: 'out' }), setShowing(null))}>دفعتله</button>
              <DueEditor party={showing} />
            </div>
          )}
          <PartyPanel party={state.parties[showing.id] ?? showing} />
        </Modal>
      )}
    </div>
  );
}

function daysAgo(date: string, now: string): string {
  const n = Math.round((Date.parse(now) - Date.parse(date)) / 86_400_000);
  return n <= 0 ? 'اليوم' : n === 1 ? 'مبارح' : `من ${n} يوم`;
}

function ReminderButton({ state, row }: { state: CompanyState; row: Row }) {
  const { notify } = useCompany();
  return (
    <button
      className="ghost"
      title="رسالة تذكير جاهزة للواتساب"
      onClick={() => {
        const due = row.due ? `\nموعد السداد المتفق عليه: ${dateText(row.due)}.` : '';
        const text = `مرحباً ${row.party.name}،\nحابين نذكّرك إنو الرصيد المستحق لـ${state.info!.name} هو: ${amountsText(state, row.byCurrency, 1)}.${due}\nشكراً إلك`;
        void navigator.clipboard.writeText(text).then(() => notify('تم نسخ رسالة التذكير، الصقها بالواتساب'));
      }}
    >
      <Icon name="message" size={15} /> تذكير
    </button>
  );
}

/** تعديل موعد السداد المتفق عليه. */
function DueEditor({ party }: { party: Party }) {
  const { state, call, notify, can } = useCompany();
  const p = state.parties[party.id] ?? party;
  if (!can('parties.manage')) return null;
  return (
    <label className="inline-field">
      موعد السداد
      <input
        type="date"
        value={p.debtDue ?? ''}
        onChange={async (e) => {
          const next: Party = { ...p };
          if (e.target.value) next.debtDue = e.target.value;
          else delete next.debtDue;
          if (await call('saveParty', next)) notify(e.target.value ? 'انحفظ موعد السداد' : 'انشال موعد السداد');
        }}
      />
    </label>
  );
}

const REASONS: Record<'owed' | 'owe', { key: 'old' | 'cash' | 'goods'; title: string; hint: string }[]> = {
  owed: [
    { key: 'old', title: 'دين قديم', hint: 'من قبل ما تستعمل البرنامج — ما بيأثر عالصندوق' },
    { key: 'cash', title: 'دينته مصاري', hint: 'طلعوا من الصندوق هلق' },
    { key: 'goods', title: 'أخد بضاعة أو خدمة', hint: 'بدون فاتورة — بتنحسب إيراد' },
  ],
  owe: [
    { key: 'old', title: 'دين قديم', hint: 'من قبل ما تستعمل البرنامج — ما بيأثر عالصندوق' },
    { key: 'cash', title: 'استدنت مصاري', hint: 'فاتوا عالصندوق هلق' },
    { key: 'goods', title: 'أخدت بضاعة أو خدمة', hint: 'بدون فاتورة — بتنحسب مصروف' },
  ],
};

function DebtForm({ direction: initial, onClose }: { direction: 'owed' | 'owe'; onClose: () => void }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [direction, setDirection] = useState(initial);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(base);
  const [reason, setReason] = useState<'old' | 'cash' | 'goods'>('old');
  const [date, setDate] = useState(today());
  const [due, setDue] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const boxes = cashAccounts(state, currency);
  const [box, setBox] = useState('');
  const cashId = boxes.some((b) => b.id === box) ? box : (boxes.find((b) => b.currency === currency) ?? boxes[0])?.id;

  const save = async () => {
    let minor = 0;
    try {
      minor = parseAmount(state, amount, currency);
    } catch {
      return notify('المبلغ مو صحيح', 'error');
    }
    if (minor <= 0) return notify('اكتب المبلغ', 'error');
    let pid = partyId;
    setBusy(true);
    try {
      if (adding || !pid) {
        if (!newName.trim()) return notify('اختار الشخص أو اكتب اسمه', 'error');
        if (!can('parties.manage')) return notify('ما عندك صلاحية تضيف أشخاص', 'error');
        const p: Party = { id: uid(), kind: direction === 'owed' ? 'customer' : 'supplier', name: newName.trim(), ...(newPhone.trim() ? { phone: newPhone.trim() } : {}), ...(due ? { debtDue: due } : {}) };
        if (!(await call('saveParty', p))) return;
        pid = p.id;
      }
      const res = await call<JournalEntry>('postDebt', {
        direction,
        partyId: pid,
        date,
        amount: minor,
        currency,
        reason,
        ...(reason === 'cash' && cashId ? { cashAccountId: cashId } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      });
      if (!res) return;
      const existing = state.parties[pid!];
      if (due && existing && can('parties.manage')) await call('saveParty', { ...existing, debtDue: due });
      notify(direction === 'owed' ? 'انسجّل الدين إلك' : 'انسجّل الدين عليك');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={direction === 'owed' ? 'دين إلي على حدا' : 'دين علي لحدا'} onClose={onClose} width={620}>
      <div className="segmented debt-dir">
        <button className={direction === 'owed' ? 'active' : ''} onClick={() => setDirection('owed')}>
          إلي عندو
        </button>
        <button className={direction === 'owe' ? 'active' : ''} onClick={() => setDirection('owe')}>
          عليّ إلو
        </button>
      </div>
      <div className="form-grid">
        <Field label="الشخص" wide>
          {adding ? (
            <div className="with-button">
              <input autoFocus placeholder="الاسم" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input placeholder="رقم الموبايل (اختياري)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} dir="ltr" />
              <button className="ghost" onClick={() => setAdding(false)}>
                من القائمة
              </button>
            </div>
          ) : (
            <div className="with-button">
              <Picker options={partyOptions(state)} value={partyId} onChange={setPartyId} placeholder="اختار الشخص..." />
              <button className="ghost" onClick={() => (setAdding(true), setPartyId(null))}>
                <Icon name="plus" size={14} /> شخص جديد
              </button>
            </div>
          )}
        </Field>
        <Field label="المبلغ">
          <input className="num-input big-input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <div className="reason-cards">
        {REASONS[direction].map((r) => (
          <button key={r.key} className={`reason ${reason === r.key ? 'active' : ''}`} onClick={() => setReason(r.key)}>
            <strong>{r.title}</strong>
            <small>{r.hint}</small>
          </button>
        ))}
      </div>
      <div className="form-grid">
        {reason === 'cash' && boxes.length > 1 && (
          <Field label="الصندوق">
            <select value={cashId} onChange={(e) => setBox(e.target.value)}>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="موعد السداد (اختياري)">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="ملاحظة" wide>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="مثلاً: حق كيس رز، سلفة لآخر الشهر..." />
        </Field>
      </div>
      <div className="form-actions">
        <button className="primary big" disabled={busy} onClick={save}>
          سجّل الدين
        </button>
      </div>
    </Modal>
  );
}

function PayForm({ party, direction, onClose }: { party: Party; direction: 'in' | 'out'; onClose: () => void }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const bal = partyBalance(state, party.id);
  const sign = direction === 'in' ? 1 : -1;
  const open = Object.entries(bal.byCurrency).filter(([, v]) => v * sign > 0);
  const [currency, setCurrency] = useState(open[0]?.[0] ?? base);
  const outstanding = Math.max(0, (bal.byCurrency[currency] ?? 0) * sign);
  const [amount, setAmount] = useState(outstanding ? toInput(state, outstanding, currency) : '');
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('');
  const [nextDue, setNextDue] = useState(party.debtDue ?? '');
  const boxes = cashAccounts(state, currency);
  const [box, setBox] = useState('');
  const cashId = boxes.some((b) => b.id === box) ? box : (boxes.find((b) => b.currency === currency) ?? boxes[0])?.id;
  const [busy, setBusy] = useState(false);
  let minor = 0;
  try {
    minor = parseAmount(state, amount, currency);
  } catch {
    minor = 0;
  }
  const rest = outstanding - minor;

  const save = async () => {
    if (minor <= 0) return notify('اكتب المبلغ', 'error');
    setBusy(true);
    try {
      const res = await call('settleDebt', { direction, partyId: party.id, date, amount: minor, currency, ...(cashId ? { cashAccountId: cashId } : {}), ...(memo.trim() ? { memo: memo.trim() } : {}) });
      if (!res) return;
      // انسدّ الدين: منشيل موعد السداد. لسا في باقي: منحفظ الموعد الجديد
      if (can('parties.manage')) {
        const p = { ...(state.parties[party.id] ?? party) };
        const fullyPaid = rest <= 0 && open.length <= 1;
        if (fullyPaid) delete p.debtDue;
        else if (nextDue) p.debtDue = nextDue;
        if (p.debtDue !== state.parties[party.id]?.debtDue) await call('saveParty', p);
      }
      notify(direction === 'in' ? `انقبض ${money(state, minor, currency)} من ${party.name}` : `اندفع ${money(state, minor, currency)} لـ${party.name}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={direction === 'in' ? `قبضت من ${party.name}` : `دفعت لـ${party.name}`} onClose={onClose} width={520}>
      <div className="kv">
        {open.length === 0 ? (
          <>
            <span>الرصيد</span>
            <strong className="muted">{direction === 'in' ? 'ما عليه شي إلك' : 'ما إلو شي عندك'}</strong>
          </>
        ) : (
          open.map(([c, v]) => (
            <span key={c} style={{ display: 'contents' }}>
              <span>{direction === 'in' ? 'عليه' : 'إلو'}</span>
              <strong className={direction === 'in' ? 'debit' : 'credit'}>{money(state, Math.abs(v), c)}</strong>
            </span>
          ))
        )}
      </div>
      <div className="form-grid">
        <Field label="المبلغ">
          <input className="num-input big-input" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="العملة">
          <CurrencySelect
            value={currency}
            onChange={(c) => {
              setCurrency(c);
              const o = Math.max(0, (bal.byCurrency[c] ?? 0) * sign);
              setAmount(o ? toInput(state, o, c) : '');
            }}
          />
        </Field>
        {boxes.length > 1 && (
          <Field label="الصندوق">
            <select value={cashId} onChange={(e) => setBox(e.target.value)}>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {outstanding > 0 && rest > 0 && (
          <Field label="موعد سداد الباقي (اختياري)">
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </Field>
        )}
        <Field label="ملاحظة" wide>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
      {outstanding > 0 && minor > 0 && (
        <p className={rest > 0 ? 'muted' : 'good'}>{rest > 0 ? `بيضل ${money(state, rest, currency)}` : rest === 0 ? 'هيك بيتسكّر الحساب ✓' : `زيادة ${money(state, -rest, currency)} — بتصير ${direction === 'in' ? 'إلو عندك' : 'إلك عندو'}`}</p>
      )}
      <div className="form-actions">
        {outstanding > 0 && (
          <button className="ghost" onClick={() => setAmount(toInput(state, outstanding, currency))}>
            المبلغ كامل
          </button>
        )}
        <button className="primary big" disabled={busy} onClick={save}>
          {direction === 'in' ? 'سجّل القبض' : 'سجّل الدفع'}
        </button>
      </div>
    </Modal>
  );
}
