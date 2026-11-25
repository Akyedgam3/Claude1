// «الحوالات»: صادرة (الزبون بيدفع عنا وبيستلم عند المكتب التاني) وواردة (منسلّمها نحنا)، بعمولة ورمز استلام،
// تسليم وإلغاء، رسالة واتساب للمستلم بالرمز، وحساب كل مكتب.
import { useMemo, useState } from 'react';
import { partyBalance, remittanceList, REMIT_STATUS_NAMES, type Remittance } from '../../../core';
import { api, currencyName, dateText, money, parseAmount, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, PrintButtons } from '../components/print';
import { askConfirm, CurrencySelect, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox, Stat, Tabs } from '../components/ui';

type Filter = 'pending' | 'out' | 'in' | 'all';

export function Remittances() {
  const { state, can, notify, call } = useCompany();
  const d = today();
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<'out' | 'in' | null>(null);
  const [receipt, setReceipt] = useState<Remittance | null>(null);
  const all = remittanceList(state);
  const rows = useMemo(
    () =>
      all
        .filter((r) => (filter === 'pending' ? r.status === 'pending' : filter === 'all' ? true : r.direction === filter))
        .filter((r) => !query.trim() || matches(query, r.sender, r.receiver, r.code, r.senderPhone, r.receiverPhone, r.destination, state.parties[r.correspondentId]?.name, String(r.number))),
    [all, filter, query, state.parties],
  );
  const pendOut = all.filter((r) => r.status === 'pending' && r.direction === 'out');
  const pendIn = all.filter((r) => r.status === 'pending' && r.direction === 'in');
  const todayFees = all.filter((r) => r.date === d && r.status !== 'cancelled');
  const feeText = Object.entries(todayFees.reduce<Record<string, number>>((m, r) => ((m[r.currency] = (m[r.currency] ?? 0) + r.fee), m), {}))
    .map(([c, v]) => money(state, v, c))
    .join(' + ');
  const offices = [...new Set(all.map((r) => r.correspondentId))].map((id) => state.parties[id]).filter((p): p is NonNullable<typeof p> => !!p);

  const whatsapp = async (r: Remittance) => {
    const phone = r.direction === 'out' ? r.receiverPhone : r.receiverPhone || r.senderPhone;
    if (!phone) return notify('ما في رقم للمستلم', 'error');
    const office = state.parties[r.correspondentId]?.name ?? '';
    const text =
      r.direction === 'out'
        ? `مرحبا ${r.receiver}، وصلتك حوالة من ${r.sender} بقيمة ${money(state, r.amount, r.currency)}. بتستلمها من ${office}${r.destination ? ` (${r.destination})` : ''} برمز ${r.code}.`
        : `مرحبا ${r.receiver}، وصلتك حوالة من ${r.sender} بقيمة ${money(state, r.amount, r.currency)}، جاهزة للاستلام عنا (${state.info?.name ?? ''}) برمز ${r.code}.`;
    try {
      await api.whatsapp(phone, text);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <div className="page remittances">
      <PageHeader title="الحوالات">
        {can('fx.manage') && (
          <>
            <button onClick={() => setForm('in')}>
              <Icon name="plus" size={16} /> حوالة واردة
            </button>
            <button className="primary" onClick={() => setForm('out')}>
              <Icon name="plus" size={16} /> حوالة صادرة
            </button>
          </>
        )}
      </PageHeader>

      <div className="stats">
        <Stat label="صادرة معلّقة" value={String(pendOut.length)} hint="المكتب لسا ما سلّمها" onClick={() => setFilter('pending')} />
        <Stat label="واردة لازم تنسلّم" value={String(pendIn.length)} {...(pendIn.length ? { tone: 'bad' as const, onClick: () => setFilter('pending') } : {})} />
        <Stat label="عمولات اليوم" value={feeText || money(state, 0)} tone="good" />
        <Stat label="حوالات اليوم" value={String(todayFees.length)} />
      </div>

      <div className="toolbar">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { key: 'pending', label: 'المعلّقة' },
            { key: 'out', label: 'صادرة' },
            { key: 'in', label: 'واردة' },
            { key: 'all', label: 'الكل' },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="اسم، رمز، رقم، مكتب..." />
      </div>

      {rows.length === 0 ? (
        <Empty>{all.length ? 'ما في حوالات هون' : 'ما في حوالات لسا. «حوالة صادرة» لما زبون بيبعت مصاري، و«حوالة واردة» لما مكتب بيبعتلك حوالة لتسلّمها.'}</Empty>
      ) : (
        <table className="table remit-table">
          <thead>
            <tr>
              <th>#</th>
              <th>النوع</th>
              <th>من ← إلى</th>
              <th>المكتب</th>
              <th className="num">المبلغ</th>
              <th className="num">العمولة</th>
              <th>الرمز</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'cancelled' ? 'voided' : ''}>
                <td>{r.number}</td>
                <td>
                  <span className={`tag ${r.direction === 'out' ? 'warn' : 'good'}`}>{r.direction === 'out' ? 'صادرة' : 'واردة'}</span>
                </td>
                <td>
                  <b>{r.sender}</b> ← <b>{r.receiver}</b>
                  <div className="muted small">{[r.destination, dateText(r.date)].filter(Boolean).join(' · ')}</div>
                </td>
                <td>{state.parties[r.correspondentId]?.name ?? '—'}</td>
                <td className="num">
                  <span className="ltr">{money(state, r.amount, r.currency)}</span>
                </td>
                <td className="num">
                  <span className="ltr">{r.fee ? money(state, r.fee, r.currency) : '—'}</span>
                </td>
                <td>
                  <span className="ltr">
                  <b>{r.code}</b>
                </span>
                </td>
                <td>
                  <span className={`tag ${r.status === 'delivered' ? 'good' : r.status === 'pending' ? 'warn' : ''}`}>{REMIT_STATUS_NAMES[r.status]}</span>
                </td>
                <td className="row-actions">
                  {r.status === 'pending' && can('fx.manage') && (
                    <button
                      className="primary small"
                      onClick={async () => {
                        const msg = r.direction === 'in' ? `تسليم ${money(state, r.amount, r.currency)} لـ${r.receiver}؟ المبلغ بيطلع من الصندوق.` : `المكتب سلّم الحوالة لـ${r.receiver}؟`;
                        if (!(await askConfirm(msg))) return;
                        if ((await call('deliverRemittance', r.id, today())) !== null) notify('انسلّمت الحوالة');
                      }}
                    >
                      {r.direction === 'in' ? 'تسليم' : 'انسلّمت'}
                    </button>
                  )}
                  {r.receiverPhone && r.status === 'pending' && (
                    <button className="whatsapp small" onClick={() => void whatsapp(r)}>
                      واتساب
                    </button>
                  )}
                  <button className="ghost small" onClick={() => setReceipt(r)}>
                    إيصال
                  </button>
                  {r.status === 'pending' && can('sales.void') && (
                    <button
                      className="ghost small danger"
                      onClick={async () => {
                        if (!(await askConfirm(r.direction === 'out' ? 'إلغاء الحوالة؟ المبلغ والعمولة بيرجعوا للزبون (بيطلعوا من الصندوق).' : 'إلغاء الحوالة الواردة؟'))) return;
                        if ((await call('cancelRemittance', r.id, today())) !== null) notify('انلغت الحوالة');
                      }}
                    >
                      إلغاء
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {offices.length > 0 && can('balances.view') && (
        <section className="card remit-offices">
          <h3>حسابات المكاتب</h3>
          <p className="muted">موجب = المكتب إلنا عليه، سالب = إلو علينا (الحوالات الصادرة اللي لازم يسلّمها). التسوية بسند قبض أو دفع عادي.</p>
          <div className="remit-office-list">
            {offices.map((p) => {
              const b = partyBalance(state, p.id);
              return (
                <div key={p.id} className="remit-office">
                  <b>{p.name}</b>
                  <span className={b.base > 0 ? 'good' : b.base < 0 ? 'bad' : 'muted'}>{money(state, b.base)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {form && <RemitForm direction={form} onClose={() => setForm(null)} onSaved={(r) => setReceipt(r)} />}
      {receipt && <RemitReceipt remit={state.remittances?.[receipt.id] ?? receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function RemitForm({ direction, onClose, onSaved }: { direction: 'out' | 'in'; onClose: () => void; onSaved: (r: Remittance) => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const offices = partyOptions(state).filter((o) => state.parties[o.id]?.kind !== 'customer');
  const [f, setF] = useState({ office: '', newOffice: '', sender: '', senderPhone: '', receiver: '', receiverPhone: '', receiverIdNo: '', destination: '', amount: '', currency: base, fee: '', code: '', notes: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const [busy, setBusy] = useState(false);
  let amount = 0;
  let fee = 0;
  try {
    amount = f.amount.trim() ? parseAmount(state, f.amount, f.currency) : 0;
    fee = f.fee.trim() ? parseAmount(state, f.fee, f.currency) : 0;
  } catch {
    /* بيطلع الخطأ وقت الحفظ */
  }
  return (
    <Modal title={direction === 'out' ? 'حوالة صادرة' : 'حوالة واردة'} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let a: number;
          let fe: number;
          try {
            a = parseAmount(state, f.amount, f.currency);
            fe = f.fee.trim() ? parseAmount(state, f.fee, f.currency) : 0;
          } catch (err) {
            return notify((err as Error).message, 'error');
          }
          setBusy(true);
          let office = f.office;
          if (!office) {
            if (!f.newOffice.trim()) {
              setBusy(false);
              return notify('اختار المكتب أو اكتب اسمه', 'error');
            }
            const p = { id: uid(), kind: 'both' as const, name: f.newOffice.trim() };
            if (!(await call('saveParty', p))) return setBusy(false);
            office = p.id;
            setF((x) => ({ ...x, office: p.id }));
          }
          const clean = (t: string) => (t.trim() ? t.trim() : undefined);
          const r = ((await call('saveRemittance', {
            direction,
            date: today(),
            sender: f.sender.trim(),
            receiver: f.receiver.trim(),
            correspondentId: office,
            amount: a,
            currency: f.currency,
            fee: fe,
            ...Object.fromEntries(Object.entries({ senderPhone: clean(f.senderPhone), receiverPhone: clean(f.receiverPhone), receiverIdNo: clean(f.receiverIdNo), destination: clean(f.destination), code: clean(f.code), notes: clean(f.notes) }).filter(([, v]) => v)),
          })) as { value: Remittance } | null)?.value;
          setBusy(false);
          if (r) {
            notify(`انسجّلت الحوالة رقم ${r.number}، الرمز ${r.code}`);
            onClose();
            onSaved(r);
          }
        }}
      >
        <Field label={direction === 'out' ? 'المكتب اللي بيسلّم' : 'المكتب اللي بعتها'} wide>
          <Picker options={offices} value={f.office || null} onChange={(v) => setF({ ...f, office: v ?? '' })} placeholder="اختار مكتب، أو اكتب اسم جديد تحت" />
        </Field>
        {!f.office && (
          <Field label="اسم مكتب جديد" wide>
            <input value={f.newOffice} onChange={set('newOffice')} placeholder="مكتب الهرم - حلب" />
          </Field>
        )}
        <Field label="المرسل">
          <input value={f.sender} onChange={set('sender')} required />
        </Field>
        <Field label="رقم المرسل">
          <input value={f.senderPhone} onChange={set('senderPhone')} dir="ltr" inputMode="tel" />
        </Field>
        <Field label="المستلم">
          <input value={f.receiver} onChange={set('receiver')} required />
        </Field>
        <Field label="رقم المستلم (للواتساب)">
          <input value={f.receiverPhone} onChange={set('receiverPhone')} dir="ltr" inputMode="tel" />
        </Field>
        {direction === 'in' && (
          <Field label="رقم هوية المستلم">
            <input value={f.receiverIdNo} onChange={set('receiverIdNo')} dir="ltr" />
          </Field>
        )}
        <Field label={direction === 'out' ? 'لوين (مدينة / بلد)' : 'من وين'}>
          <input value={f.destination} onChange={set('destination')} />
        </Field>
        <Field label="المبلغ">
          <input className="num-input" inputMode="decimal" value={f.amount} onChange={set('amount')} required />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => setF({ ...f, currency: c })} />
        </Field>
        <Field label={direction === 'out' ? 'عمولتنا (من الزبون)' : 'عمولتنا (من المكتب)'}>
          <input className="num-input" inputMode="decimal" value={f.fee} onChange={set('fee')} placeholder="0" />
        </Field>
        <Field label="رمز الاستلام (فاضي = تلقائي)">
          <input value={f.code} onChange={set('code')} dir="ltr" />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={set('notes')} />
        </Field>
        {direction === 'out' && amount > 0 && (
          <p className="wide fx-total">
            المقبوض من الزبون: <b>{money(state, amount + fee, f.currency)}</b> ({currencyName(state, f.currency)})
          </p>
        )}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy}>
            حفظ الحوالة
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RemitReceipt({ remit: r, onClose }: { remit: Remittance; onClose: () => void }) {
  const { state } = useCompany();
  const rows: [string, string][] = [
    ['التاريخ', dateText(r.date)],
    ['المرسل', [r.sender, r.senderPhone].filter(Boolean).join(' · ')],
    ['المستلم', [r.receiver, r.receiverPhone].filter(Boolean).join(' · ')],
    ...(r.destination ? ([[r.direction === 'out' ? 'إلى' : 'من', r.destination]] as [string, string][]) : []),
    ['المكتب', state.parties[r.correspondentId]?.name ?? ''],
    ['المبلغ', money(state, r.amount, r.currency)],
    ...(r.fee ? ([['العمولة', money(state, r.fee, r.currency)]] as [string, string][]) : []),
    ...(r.direction === 'out' ? ([['المدفوع', money(state, r.amount + r.fee, r.currency)]] as [string, string][]) : []),
    ['رمز الاستلام', r.code],
    ['الحالة', REMIT_STATUS_NAMES[r.status]],
  ];
  return (
    <Modal title={`إيصال حوالة رقم ${r.number}`} onClose={onClose}>
      <div className="print-area fx-receipt">
        <DocHeader title={`${r.direction === 'out' ? 'حوالة صادرة' : 'حوالة واردة'} رقم ${r.number}`} />
        <div className="fx-receipt-body">
          {rows.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        {r.direction === 'in' && (
          <div className="fx-sign">
            <span>توقيع المستلم</span>
            <span>{r.receiverIdNo ? `رقم الهوية: ${r.receiverIdNo}` : 'رقم الهوية: ..........'}</span>
          </div>
        )}
        <p className="fx-receipt-foot">{state.info!.print?.footer || 'شكراً لتعاملكم معنا'}</p>
      </div>
      <div className="form-actions">
        <PrintButtons kind="invoice" name={`حوالة ${r.number}`} />
      </div>
    </Modal>
  );
}
