import { useMemo, useState } from 'react';
import { INVOICE_KIND_NAMES, partyBalance, partyDebts, type CompanyState, type DebtItem, type Invoice, type JournalEntry, type Party, type PartyDebts } from '../../../core';
import { addDays, dateText, major, money, parseAmount, today, toInput, uid, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { CurrencySelect, Empty, Field, Modal, PageHeader, partyOptions, Picker, SearchBox, matches } from '../components/ui';
import { Icon } from '../components/icons';
import { cashAccounts } from './InvoiceEditor';

// قسم الديون: كل ما لنا وما علينا في مكان واحد — ديون الفواتير والديون المباشرة والتسديدات.

type View = 'owed' | 'owe' | 'all';

interface Row {
  party: Party;
  base: number; // موجب = لنا عليه، سالب = له علينا
  byCurrency: [string, number][];
  openInvoices: number;
  oldest: string; // تاريخ أقدم دين غير مسدَّد
  last: string;
  due?: string;
}

function debtRows(state: CompanyState): Row[] {
  const last: Record<string, string> = {};
  for (const e of state.entries) for (const l of e.lines) if (l.partyId && (!last[l.partyId] || e.date > last[l.partyId]!)) last[l.partyId] = e.date;
  const rows: Row[] = [];
  for (const p of Object.values(state.parties)) {
    if (p.archived || !last[p.id]) continue;
    const b = partyBalance(state, p.id);
    const byCurrency = Object.entries(b.byCurrency).filter(([, v]) => v !== 0);
    if (b.base === 0 && byCurrency.length === 0) continue;
    const open = partyDebts(state, p.id).flatMap((d) => d.open);
    rows.push({
      party: p,
      base: b.base,
      byCurrency,
      openInvoices: open.filter((m) => m.source?.type === 'invoice').length,
      oldest: open.reduce((o, m) => (!o || m.date < o ? m.date : o), ''),
      last: last[p.id]!,
      ...(p.debtDue ? { due: p.debtDue } : {}),
    });
  }
  return rows;
}

/** «500 ل.س + 20 $» من أرصدة العملات باتجاه معيّن. */
function amountsText(state: CompanyState, list: [string, number][], sign: 1 | -1): string {
  return list
    .filter(([, v]) => v * sign > 0)
    .map(([c, v]) => money(state, Math.abs(v), c))
    .join(' + ');
}

function daysSince(date: string, now: string): number {
  return Math.max(0, Math.round((Date.parse(now) - Date.parse(date)) / 86_400_000));
}

function ageText(date: string, now: string): string {
  const n = daysSince(date, now);
  return n === 0 ? 'اليوم' : n === 1 ? 'منذ يوم' : n === 2 ? 'منذ يومين' : n <= 10 ? `منذ ${n} أيام` : `منذ ${n} يوماً`;
}

export function Debts() {
  const { state, can } = useCompany();
  const d = today();
  const [view, setView] = useState<View>('owed');
  const [query, setQuery] = useState('');
  const [newDebt, setNewDebt] = useState<{ direction: 'owed' | 'owe'; partyId?: string } | null>(null);
  const [paying, setPaying] = useState<{ party: Party; direction: 'in' | 'out' } | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const rows = useMemo(() => debtRows(state), [state]);
  const owedRows = rows.filter((r) => r.base > 0);
  const oweRows = rows.filter((r) => r.base < 0);
  const owedTotal = owedRows.reduce((s, r) => s + r.base, 0);
  const oweTotal = oweRows.reduce((s, r) => s - r.base, 0);
  const late = rows.filter((r) => r.due && r.due < d);
  const dueSoon = rows.filter((r) => r.due && r.due >= d && r.due <= addDays(d, 7));
  const shown = rows
    .filter((r) => (view === 'owed' ? r.base > 0 : view === 'owe' ? r.base < 0 : true))
    .filter((r) => matches(query, r.party.name, r.party.phone))
    .sort((a, b) => {
      // المتأخر عن موعده أولاً، ثم الأكبر مبلغاً
      const la = a.due && a.due < d ? 1 : 0;
      const lb = b.due && b.due < d ? 1 : 0;
      return lb - la || Math.abs(b.base) - Math.abs(a.base);
    });
  const canWrite = can('vouchers.create');
  const current = showing ? state.parties[showing] : null;

  return (
    <div className="page debts">
      <PageHeader title="الديون">
        {canWrite && (
          <>
            <button className="primary" onClick={() => setNewDebt({ direction: 'owed' })}>
              <Icon name="plus" size={16} /> تسجيل دين لنا
            </button>
            <button className="danger-soft" onClick={() => setNewDebt({ direction: 'owe' })}>
              <Icon name="plus" size={16} /> تسجيل دين علينا
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
                { header: 'لنا عليه', key: 'owed', type: 'money' },
                { header: 'له علينا', key: 'owe', type: 'money' },
                { header: 'فواتير غير مسددة', key: 'inv', type: 'number' },
                { header: 'أقدم دين', key: 'oldest' },
                { header: 'موعد السداد', key: 'due' },
              ],
              rows: rows.map((r) => ({
                name: r.party.name,
                phone: r.party.phone ?? '',
                owed: r.base > 0 ? major(state, r.base) : null,
                owe: r.base < 0 ? major(state, -r.base) : null,
                inv: r.openInvoices,
                oldest: r.oldest ? dateText(r.oldest) : '',
                due: r.due ? dateText(r.due) : '',
              })),
            },
          ]}
        />
      </PageHeader>

      <p className="muted page-intro">
        هنا تجد كل الديون في مكان واحد: ديون الفواتير الآجلة، والديون المسجّلة مباشرة، وكل قبض أو دفع. اضغط على أي اسم لعرض فواتيره غير المسددة وكشف حسابه الكامل.
      </p>

      <div className="stats debt-stats">
        <div className={`stat clickable ${view === 'owed' ? 'selected' : ''}`} onClick={() => setView('owed')}>
          <span>
            <Icon name="debts" size={16} /> ديون لنا على الآخرين
          </span>
          <strong className="good">{money(state, owedTotal)}</strong>
          <small className="muted">{owedRows.length} شخص · {owedRows.reduce((s, r) => s + r.openInvoices, 0)} فاتورة غير مسددة</small>
        </div>
        <div className={`stat clickable ${view === 'owe' ? 'selected' : ''}`} onClick={() => setView('owe')}>
          <span>
            <Icon name="debts" size={16} /> ديون علينا للآخرين
          </span>
          <strong className="bad">{money(state, oweTotal)}</strong>
          <small className="muted">{oweRows.length} شخص · {oweRows.reduce((s, r) => s + r.openInvoices, 0)} فاتورة غير مسددة</small>
        </div>
        <div className="stat">
          <span>الصافي</span>
          <strong className={owedTotal - oweTotal >= 0 ? 'good' : 'bad'}>{money(state, Math.abs(owedTotal - oweTotal))}</strong>
          <small className="muted">{owedTotal >= oweTotal ? 'ما لنا أكثر مما علينا' : 'ما علينا أكثر مما لنا'}</small>
        </div>
        <div className={`stat ${late.length ? 'warn' : ''}`}>
          <span>
            <Icon name="bell" size={16} /> مواعيد السداد
          </span>
          <strong className={late.length ? 'bad' : ''}>{late.length} متأخر</strong>
          <small className="muted">{dueSoon.length} خلال هذا الأسبوع</small>
        </div>
      </div>

      <section className="card">
        <div className="debt-toolbar">
          <div className="segmented">
            <button className={view === 'owed' ? 'active' : ''} onClick={() => setView('owed')}>
              لنا عليهم ({owedRows.length})
            </button>
            <button className={view === 'owe' ? 'active' : ''} onClick={() => setView('owe')}>
              لهم علينا ({oweRows.length})
            </button>
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
              الكل
            </button>
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم أو رقم الهاتف..." />
        </div>
        {shown.length === 0 ? (
          <Empty>{view === 'owed' ? 'لا توجد ديون لك على أحد.' : view === 'owe' ? 'لا توجد عليك ديون لأحد.' : 'لا توجد ديون.'}</Empty>
        ) : (
          <table className="table debt-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th className="num">المبلغ المستحق</th>
                <th>الفواتير غير المسددة</th>
                <th>أقدم دين</th>
                <th>موعد السداد</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const lateRow = r.due && r.due < d;
                return (
                  <tr key={r.party.id} className={`clickable ${lateRow ? 'late' : ''}`} onClick={() => setShowing(r.party.id)}>
                    <td>
                      <strong>{r.party.name}</strong>
                      {r.party.phone && (
                        <small className="muted block" dir="ltr">
                          {r.party.phone}
                        </small>
                      )}
                    </td>
                    <td className="num">
                      {r.byCurrency.some(([, v]) => v > 0) && <div className="debit">لنا: {amountsText(state, r.byCurrency, 1)}</div>}
                      {r.byCurrency.some(([, v]) => v < 0) && <div className="credit">علينا: {amountsText(state, r.byCurrency, -1)}</div>}
                    </td>
                    <td>{r.openInvoices ? <span className="count-badge">{r.openInvoices} فاتورة</span> : <span className="muted">—</span>}</td>
                    <td className="muted">{r.oldest ? ageText(r.oldest, d) : ''}</td>
                    <td>
                      {r.due ? (
                        <span className={`due-badge ${lateRow ? 'late' : r.due === d ? 'today' : ''}`}>{lateRow ? `متأخر منذ ${dateText(r.due)}` : r.due === d ? 'اليوم' : dateText(r.due)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="button-row">
                        {canWrite && r.base > 0 && (
                          <button className="primary" onClick={() => setPaying({ party: r.party, direction: 'in' })}>
                            تسجيل قبض
                          </button>
                        )}
                        {canWrite && r.base < 0 && (
                          <button className="primary" onClick={() => setPaying({ party: r.party, direction: 'out' })}>
                            تسجيل دفع
                          </button>
                        )}
                        <button className="ghost" onClick={() => setShowing(r.party.id)}>
                          التفاصيل
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {newDebt && <DebtForm direction={newDebt.direction} {...(newDebt.partyId ? { partyId: newDebt.partyId } : {})} onClose={() => setNewDebt(null)} />}
      {paying && <PayForm party={paying.party} direction={paying.direction} onClose={() => setPaying(null)} />}
      {current && !paying && !newDebt && (
        <DebtDetail
          party={current}
          onClose={() => setShowing(null)}
          onPay={(direction) => setPaying({ party: current, direction })}
          onDebt={(direction) => setNewDebt({ direction, partyId: current.id })}
        />
      )}
    </div>
  );
}

/** اسم المستند الذي ولّد الحركة بصيغة واضحة. */
function docLabel(m: DebtItem, invoices: Record<string, Invoice>): { label: string; invoice?: Invoice } {
  const t = m.source?.type;
  const inv = t === 'invoice' && m.source ? invoices[m.source.id] : undefined;
  if (inv) return { label: `${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`, invoice: inv };
  if (t === 'debt') return { label: m.memo.replace(/^دين (إلنا على|لنا على|علينا لـ) ?[^—]*— /, 'دين مباشر — ') };
  if (t === 'receipt') return { label: 'قبض' + (m.memo.includes(':') ? ` — ${m.memo.split(':').slice(1).join(':').trim()}` : '') };
  if (t === 'payment') return { label: 'دفع' + (m.memo.includes(':') ? ` — ${m.memo.split(':').slice(1).join(':').trim()}` : '') };
  if (t === 'opening') return { label: 'رصيد افتتاحي' };
  return { label: m.memo };
}

/** كل ما يخص شخصاً واحداً: الملخص، والفواتير غير المسددة، وكشف الحساب الكامل. */
function DebtDetail({ party, onClose, onPay, onDebt }: { party: Party; onClose: () => void; onPay: (d: 'in' | 'out') => void; onDebt: (d: 'owed' | 'owe') => void }) {
  const { state, can, navigate } = useCompany();
  const d = today();
  const debts = useMemo(() => partyDebts(state, party.id), [state, party.id]);
  const invoices = useMemo(() => Object.fromEntries(state.invoices.map((i) => [i.id, i])), [state.invoices]);
  const [cur, setCur] = useState<string>(debts[0]?.currency ?? state.info!.baseCurrency);
  const sel: PartyDebts | undefined = debts.find((x) => x.currency === cur) ?? debts[0];
  const canWrite = can('vouchers.create');
  const balance = partyBalance(state, party.id);
  const owed = Object.entries(balance.byCurrency).filter(([, v]) => v !== 0);
  const invoiceStats = (sel?.movements ?? []).filter((m) => m.source?.type === 'invoice');
  const oldestOpen = sel?.open[0];

  let running = 0;
  const statement = (sel?.movements ?? []).map((m) => {
    running += m.amount;
    return { m, running };
  });

  return (
    <Modal title={`ديون ${party.name}`} onClose={onClose} width={980}>
      <div className="debt-detail">
        <div className="debt-head">
          <div>
            {party.phone && (
              <div className="muted" dir="ltr">
                {party.phone}
              </div>
            )}
            <div className="debt-balance">
              {owed.length === 0 ? (
                <strong className="muted">الحساب مسدَّد بالكامل</strong>
              ) : (
                owed.map(([c, v]) => (
                  <strong key={c} className={v > 0 ? 'good' : 'bad'}>
                    {v > 0 ? 'لنا عليه' : 'له علينا'} {money(state, Math.abs(v), c)}
                  </strong>
                ))
              )}
            </div>
          </div>
          <div className="button-row">
            {canWrite && (
              <>
                <button className="primary" onClick={() => onPay('in')}>
                  تسجيل قبض
                </button>
                <button className="primary" onClick={() => onPay('out')}>
                  تسجيل دفع
                </button>
                <button onClick={() => onDebt('owed')}>دين لنا عليه</button>
                <button onClick={() => onDebt('owe')}>دين له علينا</button>
              </>
            )}
            <ReminderButton state={state} party={party} list={owed} />
            <PrintButtons kind="report" name={`كشف ديون ${party.name}`} papers={['a4', '80mm']} />
          </div>
        </div>

        <div className="stats debt-mini">
          <div className="stat">
            <span>عدد الفواتير</span>
            <strong>{invoiceStats.length}</strong>
          </div>
          <div className="stat">
            <span>فواتير غير مسددة</span>
            <strong className={sel?.open.some((m) => m.source?.type === 'invoice') ? 'bad' : ''}>{sel?.open.filter((m) => m.source?.type === 'invoice').length ?? 0}</strong>
          </div>
          <div className="stat">
            <span>أقدم دين غير مسدد</span>
            <strong>{oldestOpen ? ageText(oldestOpen.date, d) : '—'}</strong>
          </div>
          <div className="stat">
            <span>موعد السداد</span>
            <DueEditor party={party} />
          </div>
        </div>

        {debts.length > 1 && (
          <div className="segmented">
            {debts.map((x) => (
              <button key={x.currency} className={x.currency === sel?.currency ? 'active' : ''} onClick={() => setCur(x.currency)}>
                {state.currencies[x.currency]?.nameAr}
              </button>
            ))}
          </div>
        )}

        <div className="print-area">
          <div className="print-only">
            <DocHeader title="كشف ديون">
              <div>{party.name}</div>
            </DocHeader>
          </div>

          <h4>الفواتير والديون غير المسددة</h4>
          {!sel || sel.open.length === 0 ? (
            <p className="muted">لا توجد فواتير أو ديون غير مسددة.</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المستند</th>
                  <th className="num">قيمته</th>
                  <th className="num">المسدَّد منه</th>
                  <th className="num">المتبقي</th>
                  <th>العمر</th>
                </tr>
              </thead>
              <tbody>
                {sel.open.map((m) => {
                  const doc = docLabel(m, invoices);
                  return (
                    <tr key={m.entryId} className={doc.invoice ? 'clickable' : ''} onClick={() => doc.invoice && navigate('invoice', doc.invoice.id)}>
                      <td>{dateText(m.date)}</td>
                      <td>
                        {doc.label}
                        {doc.invoice && <small className="muted block">إجمالي الفاتورة {money(state, doc.invoice.total, doc.invoice.currency)} · دُفع عند البيع {money(state, doc.invoice.paid, doc.invoice.currency)}</small>}
                      </td>
                      <td className="num">{money(state, Math.abs(m.amount), sel.currency)}</td>
                      <td className="num muted">{money(state, Math.abs(m.amount) - Math.abs(m.remaining), sel.currency)}</td>
                      <td className={`num ${m.remaining > 0 ? 'good' : 'bad'}`}>
                        <strong>{money(state, Math.abs(m.remaining), sel.currency)}</strong>
                      </td>
                      <td className={daysSince(m.date, d) > 30 ? 'bad' : 'muted'}>{ageText(m.date, d)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>المجموع المتبقي</td>
                  <td className={`num ${sel.balance > 0 ? 'good' : 'bad'}`}>
                    <strong>{money(state, Math.abs(sel.balance), sel.currency)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          <h4>كشف الحساب الكامل</h4>
          {!sel || sel.movements.length === 0 ? (
            <p className="muted">لا توجد حركات.</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th className="num">عليه (مدين)</th>
                  <th className="num">له (دائن)</th>
                  <th className="num">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {statement.map(({ m, running: r }) => {
                  const doc = docLabel(m, invoices);
                  return (
                    <tr key={m.entryId} className={doc.invoice ? 'clickable' : ''} onClick={() => doc.invoice && navigate('invoice', doc.invoice.id)}>
                      <td>{dateText(m.date)}</td>
                      <td>{doc.label}</td>
                      <td className="num">{m.amount > 0 ? money(state, m.amount, sel.currency) : ''}</td>
                      <td className="num">{m.amount < 0 ? money(state, -m.amount, sel.currency) : ''}</td>
                      <td className={`num ${r > 0 ? 'good' : r < 0 ? 'bad' : 'muted'}`}>
                        {r === 0 ? '0' : `${money(state, Math.abs(r), sel.currency)} ${r > 0 ? 'لنا' : 'علينا'}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ReminderButton({ state, party, list }: { state: CompanyState; party: Party; list: [string, number][] }) {
  const { notify } = useCompany();
  if (!list.some(([, v]) => v > 0)) return null;
  return (
    <button
      title="رسالة تذكير جاهزة للإرسال عبر واتساب"
      onClick={() => {
        const due = party.debtDue ? `\nموعد السداد المتفق عليه: ${dateText(party.debtDue)}.` : '';
        const text = `السلام عليكم ${party.name}،\nنودّ تذكيركم بأن المبلغ المستحق لـ${state.info!.name} هو: ${amountsText(state, list, 1)}.${due}\nشاكرين لكم حسن التعامل.`;
        void navigator.clipboard.writeText(text).then(() => notify('تم نسخ رسالة التذكير، يمكنك لصقها في واتساب'));
      }}
    >
      <Icon name="message" size={15} /> رسالة تذكير
    </button>
  );
}

/** تعديل موعد السداد المتفق عليه. */
function DueEditor({ party }: { party: Party }) {
  const { state, call, notify, can } = useCompany();
  const p = state.parties[party.id] ?? party;
  if (!can('parties.manage')) return <strong>{p.debtDue ? dateText(p.debtDue) : '—'}</strong>;
  return (
    <input
      type="date"
      value={p.debtDue ?? ''}
      onChange={async (e) => {
        const next: Party = { ...p };
        if (e.target.value) next.debtDue = e.target.value;
        else delete next.debtDue;
        if (await call('saveParty', next)) notify(e.target.value ? 'تم حفظ موعد السداد' : 'تم حذف موعد السداد');
      }}
    />
  );
}

const REASONS: Record<'owed' | 'owe', { key: 'old' | 'cash' | 'goods'; title: string; hint: string }[]> = {
  owed: [
    { key: 'old', title: 'دين سابق', hint: 'من قبل استخدام البرنامج — ما بيأثر عالصندوق ولا بينحسب بالأرباح' },
    { key: 'cash', title: 'سلفة نقدية', hint: 'خرج المبلغ من الصندوق الآن' },
    { key: 'goods', title: 'بضاعة أو خدمة دون فاتورة', hint: 'المبلغ كلو بينحسب إيراد بدون تكلفة. لبضاعة من المحل الأفضل «فاتورة مبيع» بالدين ليتحسب ربحها صح وينزل المخزون' },
  ],
  owe: [
    { key: 'old', title: 'دين سابق', hint: 'من قبل استخدام البرنامج — ما بيأثر عالصندوق ولا بينحسب بالأرباح' },
    { key: 'cash', title: 'قرض نقدي', hint: 'دخل المبلغ إلى الصندوق الآن' },
    { key: 'goods', title: 'بضاعة أو خدمة دون فاتورة', hint: 'يُسجَّل المبلغ مصروفاً' },
  ],
};

function DebtForm({ direction: initial, partyId: presetParty, onClose }: { direction: 'owed' | 'owe'; partyId?: string; onClose: () => void }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [direction, setDirection] = useState(initial);
  const [partyId, setPartyId] = useState<string | null>(presetParty ?? null);
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
      return notify('المبلغ غير صحيح', 'error');
    }
    if (minor <= 0) return notify('أدخل المبلغ', 'error');
    let pid = partyId;
    setBusy(true);
    try {
      if (adding || !pid) {
        if (!newName.trim()) return notify('اختر الشخص أو اكتب اسمه', 'error');
        if (!can('parties.manage')) return notify('لا تملك صلاحية إضافة أشخاص', 'error');
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
      notify(direction === 'owed' ? 'تم تسجيل الدين لك' : 'تم تسجيل الدين عليك');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={direction === 'owed' ? 'تسجيل دين لنا' : 'تسجيل دين علينا'} onClose={onClose} width={640}>
      <div className="segmented debt-dir">
        <button className={direction === 'owed' ? 'active' : ''} onClick={() => setDirection('owed')}>
          دين لنا على شخص
        </button>
        <button className={direction === 'owe' ? 'active' : ''} onClick={() => setDirection('owe')}>
          دين علينا لشخص
        </button>
      </div>
      <div className="form-grid">
        <Field label="الشخص" wide>
          {adding ? (
            <div className="with-button">
              <input autoFocus placeholder="الاسم" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input placeholder="رقم الهاتف (اختياري)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} dir="ltr" />
              <button className="ghost" onClick={() => setAdding(false)}>
                من القائمة
              </button>
            </div>
          ) : (
            <div className="with-button">
              <Picker options={partyOptions(state)} value={partyId} onChange={setPartyId} placeholder="اختر الشخص..." />
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
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="مثال: ثمن كيس أرز، سلفة حتى نهاية الشهر..." />
        </Field>
      </div>
      <div className="form-actions">
        <button className="primary big" disabled={busy} onClick={save}>
          تسجيل الدين
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
    if (minor <= 0) return notify('أدخل المبلغ', 'error');
    setBusy(true);
    try {
      const res = await call('settleDebt', { direction, partyId: party.id, date, amount: minor, currency, ...(cashId ? { cashAccountId: cashId } : {}), ...(memo.trim() ? { memo: memo.trim() } : {}) });
      if (!res) return;
      // سُدِّد الدين بالكامل: نحذف موعد السداد. بقي جزء: نحفظ الموعد الجديد
      if (can('parties.manage')) {
        const p = { ...(state.parties[party.id] ?? party) };
        const fullyPaid = rest <= 0 && open.length <= 1;
        if (fullyPaid) delete p.debtDue;
        else if (nextDue) p.debtDue = nextDue;
        if (p.debtDue !== state.parties[party.id]?.debtDue) await call('saveParty', p);
      }
      notify(direction === 'in' ? `تم قبض ${money(state, minor, currency)} من ${party.name}` : `تم دفع ${money(state, minor, currency)} إلى ${party.name}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={direction === 'in' ? `قبض من ${party.name}` : `دفع إلى ${party.name}`} onClose={onClose} width={540}>
      <div className="kv">
        {open.length === 0 ? (
          <>
            <span>الرصيد</span>
            <strong className="muted">{direction === 'in' ? 'لا يوجد له دين مستحق لنا' : 'لا يوجد علينا دين له'}</strong>
          </>
        ) : (
          open.map(([c, v]) => (
            <span key={c} style={{ display: 'contents' }}>
              <span>{direction === 'in' ? 'المستحق عليه' : 'المستحق له'}</span>
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
          <Field label="موعد سداد المتبقي (اختياري)">
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </Field>
        )}
        <Field label="ملاحظة" wide>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
      {outstanding > 0 && minor > 0 && (
        <p className={rest > 0 ? 'muted' : 'good'}>
          {rest > 0 ? `يتبقى ${money(state, rest, currency)}` : rest === 0 ? 'بهذا يُسدَّد الحساب بالكامل ✓' : `زيادة ${money(state, -rest, currency)} — تصبح ${direction === 'in' ? 'له علينا' : 'لنا عليه'}`}
        </p>
      )}
      <div className="form-actions">
        {outstanding > 0 && (
          <button className="ghost" onClick={() => setAmount(toInput(state, outstanding, currency))}>
            المبلغ كاملاً
          </button>
        )}
        <button className="primary big" disabled={busy} onClick={save}>
          {direction === 'in' ? 'تسجيل القبض' : 'تسجيل الدفع'}
        </button>
      </div>
    </Modal>
  );
}
