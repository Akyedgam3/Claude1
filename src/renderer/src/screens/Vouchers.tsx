import { useEffect, useMemo, useState } from 'react';
import { confirmCashOut } from '../components/cashGuard';
import { amountInWords, displayDecimals, INVOICE_KIND_NAMES, partyDebts, type CompanyState, type JournalEntry } from '../../../core';
import { dateText, inputToRate, major, money, parseAmount, toInput, today, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { ConfirmButton, CurrencySelect, Empty, Field, Modal, PageHeader, partyOptions, Picker } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';

export function Vouchers({ initialKind, editId }: { initialKind?: 'receipt' | 'payment'; editId?: string } = {}) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [kind, setKind] = useState<'receipt' | 'payment'>(initialKind ?? 'receipt');
  const [target, setTarget] = useState<'party' | 'account'>('party');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('5209');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(base);
  const [rate, setRate] = useState('');
  const [cash, setCash] = useState('');
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('');
  const [printing, setPrinting] = useState<JournalEntry | null>(null);
  // تعديل سند: بيتعبّى بالفورم، والحفظ بيلغي القديم وبيسجّل الجديد بنفس الرقم
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const startEdit = (e: JournalEntry) => {
    const c = e.lines[1]!;
    const box = e.lines[0]!;
    setEditing(e);
    setKind(e.source?.type === 'payment' ? 'payment' : 'receipt');
    if (c.partyId) {
      setTarget('party');
      setPartyId(c.partyId);
    } else {
      setTarget('account');
      setAccountId(c.accountId);
    }
    setCurrency(c.currency);
    setAmount(toInput(state, c.debit || c.credit, c.currency));
    setCash(box.accountId);
    setDate(e.date);
    setMemo(e.memo.replace(/^سند (قبض|دفع) رقم \d+: /, ''));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    if (!editId) return;
    const e = state.entries.find((x) => x.id === editId);
    if (e && !state.voided[e.id] && !e.voidOf) startEdit(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const boxes = cashAccounts(state, currency);
  const cashId = boxes.some((b) => b.id === cash) ? cash : (boxes.find((b) => b.currency === currency) ?? boxes[0])?.id ?? '1101';
  const counterAccounts = useMemo(
    () =>
      Object.values(state.accounts)
        .filter((a) => !a.isGroup && !a.archived && (a.type !== 'equity' || can('cash.manage')) && (!a.currency || a.currency === currency) && (kind === 'payment' ? ['expense', 'equity', 'liability'].includes(a.type) : ['revenue', 'equity', 'liability'].includes(a.type)))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.accounts, kind, currency, can],
  );
  // الحساب المعروض هو نفسه الذي يُرحَّل عليه (لا قيمة مخفية خارج القائمة)
  const counterId = counterAccounts.some((a) => a.id === accountId) ? accountId : (counterAccounts[0]?.id ?? '');

  const history = useMemo(
    () =>
      state.entries
        .filter((e) => (e.source?.type === 'receipt' || e.source?.type === 'payment') && !e.voidOf)
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
        .slice(0, 200),
    [state.entries],
  );

  const submit = async () => {
    let minor: number;
    try {
      minor = parseAmount(state, amount, currency);
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    if (target === 'party' && !partyId) return notify('اختر العميل أو المورد', 'error');
    const draft = {
      kind,
      date,
      amount: minor,
      currency,
      ...(currency !== base && Number(rate) ? { rate: inputToRate(state, currency, Number(rate)) } : {}),
      ...(target === 'party' ? { partyId } : { accountId: counterId }),
      cashAccountId: cashId,
      memo: memo.trim() || (kind === 'receipt' ? 'قبض' : 'دفع'),
    };
    if (kind === 'payment' && !editing && !(await confirmCashOut(state, cashId, currency, minor))) return;
    const res = editing ? await call<JournalEntry>('editVoucher', editing.id, draft) : await call<JournalEntry>('postVoucher', draft);
    if (res) {
      notify(editing ? 'تم تعديل السند' : 'تم حفظ السند');
      setEditing(null);
      setAmount('');
      setMemo('');
      setPrinting(res.value);
    }
  };

  return (
    <div className="page">
      <PageHeader title="سندات القبض والدفع">
        <ExportButtons
          name="السندات"
          sheets={() => [
            {
              name: 'السندات',
              columns: [
                { header: 'التاريخ', key: 'date' },
                { header: 'البيان', key: 'memo' },
                { header: 'الطرف / الحساب', key: 'counter' },
                { header: 'العملة', key: 'currency' },
                { header: 'قبض', key: 'in', type: 'money' },
                { header: 'دفع', key: 'out', type: 'money' },
              ],
              rows: history.map((e) => {
                const c = e.lines[1]!;
                return {
                  date: dateText(e.date),
                  memo: e.memo,
                  counter: c.partyId ? state.parties[c.partyId]?.name : state.accounts[c.accountId]?.name,
                  currency: c.currency,
                  in: e.source?.type === 'receipt' ? major(state, c.credit, c.currency) : null,
                  out: e.source?.type === 'payment' ? major(state, c.debit, c.currency) : null,
                };
              }),
            },
          ]}
        />
      </PageHeader>
      <section className="card">
        {editing && (
          <div className="banner draft-banner">
            عم تعدّل «{editing.memo}». لما تحفظ، القديم بينلغى بتاريخه وبينسجّل الجديد بنفس الرقم.{' '}
            <button type="button" className="ghost small" onClick={() => (setEditing(null), setAmount(''), setMemo(''))}>
              إلغاء التعديل
            </button>
          </div>
        )}
        <div className="segmented">
          <button className={kind === 'receipt' ? 'active' : ''} onClick={() => setKind('receipt')}>
            سند قبض (استلام مال)
          </button>
          <button className={kind === 'payment' ? 'active' : ''} onClick={() => setKind('payment')}>
            سند دفع (دفع مال)
          </button>
        </div>
        <form
          className="form-grid four"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label={kind === 'receipt' ? 'مِن' : 'إلى'}>
            <select value={target} onChange={(e) => setTarget(e.target.value as 'party' | 'account')}>
              <option value="party">عميل / مورد</option>
              <option value="account">{kind === 'payment' ? 'مصروف / حساب آخر' : 'إيراد / حساب آخر'}</option>
            </select>
          </Field>
          {target === 'party' ? (
            <Field label="الاسم">
              <Picker options={partyOptions(state)} value={partyId} onChange={setPartyId} />
              {partyId && <PartyOpenInfo state={state} partyId={partyId} />}
            </Field>
          ) : (
            <Field label="الحساب">
              <select value={counterId} onChange={(e) => setAccountId(e.target.value)}>
                {counterAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="المبلغ">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="العملة">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
          {currency !== base && (
            <Field label="سعر الصرف (اختياري)">
              <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="سعر اليوم المسجّل" />
            </Field>
          )}
          <Field label="الصندوق">
            <select value={cashId} onChange={(e) => setCash(e.target.value)}>
              {boxes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="التاريخ">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="البيان" wide>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="دفعة على الحساب، أجرة محل، أمبيرات..." />
          </Field>
          <div className="form-actions wide">
            <button className="primary">{editing ? 'حفظ التعديل' : 'حفظ السند'}</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3>آخر السندات</h3>
        {history.length === 0 ? (
          <Empty>لا توجد سندات</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>البيان</th>
                <th>الطرف / الحساب</th>
                <th className="num">المبلغ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((e) => {
                const counter = e.lines[1]!;
                const voided = !!state.voided[e.id];
                return (
                  <tr key={e.id} className={voided ? 'voided' : ''}>
                    <td>{dateText(e.date)}</td>
                    <td>{e.memo}</td>
                    <td>{counter.partyId ? state.parties[counter.partyId]?.name : state.accounts[counter.accountId]?.name}</td>
                    <td className={`num ${e.source?.type === 'receipt' ? 'credit' : 'debit'}`}>{money(state, counter.debit || counter.credit, counter.currency)}</td>
                    <td className="button-row">
                      <button className="ghost" onClick={() => setPrinting(e)}>
                        طباعة
                      </button>
                      {voided ? (
                        <span className="tag bad">ملغى</span>
                      ) : (
                        <>
                          {can('vouchers.void') && can('vouchers.create') && (
                            <button className="ghost" onClick={() => startEdit(e)}>
                              تعديل
                            </button>
                          )}
                          {can('vouchers.void') && <ConfirmButton label="إلغاء" onConfirm={() => call('voidEntry', e.id, today()).then((r) => r && notify('تم إلغاء السند'))} />}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {printing && <VoucherPrint entry={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function VoucherPrint({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const { state } = useCompany();
  const users = state.users;
  const counter = entry.lines[1]!;
  const amount = counter.debit || counter.credit;
  const receipt = entry.source?.type === 'receipt';
  const name = counter.partyId ? state.parties[counter.partyId]?.name : state.accounts[counter.accountId]?.name;
  const decimals = state.currencies[counter.currency]?.decimals ?? 2;
  return (
    <Modal title="طباعة السند" onClose={onClose} width={760}>
      <div className="button-row">
        <PrintButtons kind="receipt" name={entry.memo} />
      </div>
      <div className="paper-preview">
        <div className="print-area invoice-doc">
          <DocHeader title={receipt ? 'سند قبض' : 'سند دفع'}>
            <div>{entry.memo.split(':')[0]}</div>
            <div>
              التاريخ: <span className="ltr">{dateText(entry.date)}</span>
            </div>
          </DocHeader>
          <div className="voucher-body">
            <p>
              {receipt ? 'استلمنا من' : 'دفعنا إلى'}: <strong>{name}</strong>
            </p>
            <p>
              مبلغاً وقدره: <strong className="grand">{money(state, amount, counter.currency)}</strong>
            </p>
            <p className="doc-words">{amountInWords(amount, counter.currency, displayDecimals(state, counter.currency))}</p>
            <p>وذلك عن: {entry.memo.split(':').slice(1).join(':').trim() || '—'}</p>
          </div>
          <footer className="doc-footer signatures">
            <span>المستلم</span>
            <span>المحاسب: {users[entry.createdBy]?.displayName ?? ''}</span>
          </footer>
        </div>
      </div>
    </Modal>
  );
}

/** تحت اسم الزبون/المورد بالسند: رصيده والفواتير المفتوحة (السند بينوزّع عليها بالأقدم أول). */
function PartyOpenInfo({ state, partyId }: { state: CompanyState; partyId: string }) {
  const debts = useMemo(() => partyDebts(state, partyId), [state, partyId]);
  const rows = debts.filter((d) => d.balance !== 0);
  if (!rows.length) return <small className="muted voucher-party-info">حسابه صفر، ما في فواتير مفتوحة</small>;
  return (
    <div className="voucher-party-info">
      {rows.map((d) => {
        const open = d.open
          .map((o) => ({ o, inv: state.invoices.find((i) => i.entryId === o.entryId) }))
          .filter((x) => x.inv)
          .slice(0, 5);
        return (
          <div key={d.currency}>
            <small>
              {d.balance > 0 ? 'الرصيد عليه: ' : 'الرصيد إله: '}
              <b className={d.balance > 0 ? 'bad' : 'good'}>{money(state, Math.abs(d.balance), d.currency)}</b>
            </small>
            {open.length > 0 && (
              <small className="muted">
                {' '}— الفواتير المفتوحة (الدفعة بتنحسب عالأقدم أول):{' '}
                {open.map(({ o, inv }) => `${INVOICE_KIND_NAMES[inv!.kind]} ${inv!.number}: باقي ${money(state, Math.abs(o.remaining), d.currency)}`).join('، ')}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
