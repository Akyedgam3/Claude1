import { useMemo, useState } from 'react';
import { money, parseAmount, today, useCompany, dateText } from '../api';
import { CurrencySelect, Empty, Field, PageHeader, partyOptions, Picker } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';

export function Vouchers() {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const [kind, setKind] = useState<'receipt' | 'payment'>('receipt');
  const [target, setTarget] = useState<'party' | 'account'>('party');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('5209');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(base);
  const [rate, setRate] = useState('');
  const [cash, setCash] = useState('1101');
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('');

  const counterAccounts = useMemo(
    () =>
      Object.values(state.accounts)
        .filter((a) => !a.isGroup && !a.archived && (kind === 'payment' ? a.type === 'expense' || a.type === 'equity' || a.type === 'liability' : a.type === 'revenue' || a.type === 'equity'))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.accounts, kind],
  );

  const history = useMemo(
    () =>
      state.entries
        .filter((e) => (e.source?.type === 'receipt' || e.source?.type === 'payment') && !e.voidOf)
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
        .slice(0, 100),
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
    const res = await call('postVoucher', {
      kind,
      date,
      amount: minor,
      currency,
      ...(currency !== base && rate ? { rate: Number(rate) } : {}),
      ...(target === 'party' ? { partyId } : { accountId }),
      cashAccountId: cash,
      memo: memo.trim() || (kind === 'receipt' ? 'قبض' : 'دفع'),
    });
    if (res) {
      notify('تم حفظ السند');
      setAmount('');
      setMemo('');
    }
  };

  return (
    <div className="page">
      <PageHeader title="سندات القبض والدفع" />
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
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
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
            <select value={cash} onChange={(e) => setCash(e.target.value)}>
              {cashAccounts(state).map((a) => (
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
                    <td className={`num ${e.source?.type === 'receipt' ? 'debit' : 'credit'}`}>{money(state, counter.debit || counter.credit, counter.currency)}</td>
                    <td>
                      {voided ? (
                        <span className="tag bad">ملغى</span>
                      ) : (
                        <button className="ghost danger" onClick={() => call('voidEntry', e.id, today()).then((r) => r && notify('تم إلغاء السند'))}>
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
