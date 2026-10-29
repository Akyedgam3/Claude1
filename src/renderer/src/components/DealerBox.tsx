import { useState } from 'react';
import { accountBalance, DEALER_BOX_ID, dueToShared } from '../../../core';
import { money, parseAmount, today, useCompany } from '../api';
import { cashAccounts } from '../screens/InvoiceEditor';
import { Icon } from './icons';

/** تفعيل صندوق المورد الخاص (بشاشة المستخدمين): مخفي عن الصيدلية، وبتنزل فيه مبيعات المورد. */
export function DealerBoxSetup() {
  const { state, call, notify, can, user } = useCompany();
  if (!can('items.hidden') || !can('accounts.manage')) return null;
  const box = state.accounts[DEALER_BOX_ID];
  if (box) return <p className="banner ok">✓ «{box.name}» مفعّل: مخفي عن الصيدلية. اختار لكل مستخدم صندوقه من نموذج المستخدم.</p>;
  const setup = async () => {
    if (!(await call('setupDealerBox'))) return;
    // المورد (أنا) مبيعاته بتنزل بصندوقه
    if (await call('updateUser', { ...user, cashAccountId: DEALER_BOX_ID }, '')) notify('انعمل «صندوق المورد» وصار صندوقك. هلق اعمل حساب الصيدلية وخلّي صندوقه «الصندوق»');
  };
  return (
    <div className="banner">
      <b>صندوق المورد الخاص:</b> صندوق مخفي عن حساب الصيدلية، كل مبيعاتك بتنزل فيه، والصيدلية مبيعاتها بالصندوق المشترك.{' '}
      <button className="small primary" onClick={() => void setup()}>
        تفعيل صندوق المورد
      </button>
    </div>
  );
}

/** بطاقة الرئيسية للمورد: رصيد صندوقه والصندوق المشترك، وشقد لازم يحوّل للصندوق المشترك عن المواد المشتركة. */
export function DealerBoxCard() {
  const { state, call, notify, can } = useCompany();
  const box = state.accounts[DEALER_BOX_ID];
  const shared = cashAccounts(state, state.info!.baseCurrency).filter((a) => !a.hidden);
  const [to, setTo] = useState(shared[0]?.id ?? '1101');
  const [amount, setAmount] = useState('');
  if (!box || !can('items.hidden')) return null;
  const due = dueToShared(state, box.id, to);
  const bal = (id: string) => accountBalance(state, id).balance;
  const send = async (minor: number) => {
    if (!(minor > 0)) return notify('اكتب المبلغ', 'error');
    if (await call('transferBox', { date: today(), from: box.id, to, amount: minor, memo: `تحويل حصة المواد المشتركة من ${box.name}` })) {
      notify('تم التحويل للصندوق المشترك');
      setAmount('');
    }
  };
  return (
    <div className="card dealer-box">
      <h3>
        <Icon name="wallet" size={18} /> الصناديق
      </h3>
      <div className="kv">
        <span>{box.name} (خاص فيك)</span>
        <strong>{money(state, bal(box.id))}</strong>
        <span>{state.accounts[to]?.name ?? 'الصندوق المشترك'}</span>
        <strong>{money(state, bal(to))}</strong>
        <span>مستحق للصندوق المشترك (مواد مشتركة بعتها)</span>
        <strong className={due > 0 ? 'bad' : 'good'}>{money(state, Math.max(0, due))}</strong>
      </div>
      {can('vouchers.create') && (
        <div className="with-button" style={{ marginTop: 10 }}>
          {shared.length > 1 && (
            <select value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 200 }}>
              {shared.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <input inputMode="decimal" placeholder="مبلغ تاني" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 160 }} />
          {amount ? (
            <button className="primary" onClick={() => void send(parseAmount(state, amount, state.info!.baseCurrency))}>
              تحويل
            </button>
          ) : (
            <button className="primary" disabled={due <= 0} onClick={() => void send(due)}>
              تحويل المستحق ({money(state, Math.max(0, due))})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
