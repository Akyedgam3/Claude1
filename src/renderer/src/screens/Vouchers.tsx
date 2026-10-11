import { useMemo, useState } from 'react';
import { amountInWords, type JournalEntry } from '../../../core';
import { dateText, major, money, parseAmount, today, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { ConfirmButton, CurrencySelect, Empty, Field, Modal, PageHeader, partyOptions, Picker } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';

export function Vouchers() {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [kind, setKind] = useState<'receipt' | 'payment'>('receipt');
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

  const boxes = cashAccounts(state, currency);
  const cashId = boxes.some((b) => b.id === cash) ? cash : (boxes.find((b) => b.currency === currency) ?? boxes[0])?.id ?? '1101';
  const counterAccounts = useMemo(
    () =>
      Object.values(state.accounts)
        .filter((a) => !a.isGroup && !a.archived && (!a.currency || a.currency === currency) && (kind === 'payment' ? ['expense', 'equity', 'liability'].includes(a.type) : ['revenue', 'equity', 'liability'].includes(a.type)))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.accounts, kind, currency],
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
    const res = await call<JournalEntry>('postVoucher', {
      kind,
      date,
      amount: minor,
      currency,
      ...(currency !== base && rate ? { rate: Number(rate) } : {}),
      ...(target === 'party' ? { partyId } : { accountId: counterId }),
      cashAccountId: cashId,
      memo: memo.trim() || (kind === 'receipt' ? 'قبض' : 'دفع'),
    });
    if (res) {
      notify('تم حفظ السند');
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
            <button className="primary">حفظ السند</button>
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
                        can('vouchers.void') && <ConfirmButton label="إلغاء" onConfirm={() => call('voidEntry', e.id, today()).then((r) => r && notify('تم إلغاء السند'))} />
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
            <p className="doc-words">{amountInWords(amount, counter.currency, decimals)}</p>
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
