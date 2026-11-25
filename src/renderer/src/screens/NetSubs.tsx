// «الاشتراكات» (محلات الإنترنت والشبكات): كل مشترك بباقته وسعرها الشهري و«مدفوع لحد»، مين خلص ومين قرّب،
// «تجديد» بيعمل فاتورة مبيع بالأشهر وبيمدّد التاريخ، وتذكير عالواتساب.
import { useMemo, useState } from 'react';
import { addMonthsIso, isCashBox, netSubList, netSubStatus, netSubsSummary, NETSUB_STATE_NAMES, renewalStart, type NetSub, type NetSubState } from '../../../core';
import { api, dateText, money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { askConfirm, CurrencySelect, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox, Stat, Tabs } from '../components/ui';

type Filter = 'all' | NetSubState;
const TONE: Record<NetSubState, string> = { active: 'good', soon: 'warn', expired: 'bad', stopped: '' };

export function NetSubs() {
  const { state, can, notify, navigate } = useCompany();
  const d = today();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<NetSub | 'new' | null>(null);
  const [renew, setRenew] = useState<NetSub | null>(null);
  const manage = can('netsubs.manage');
  const sum = netSubsSummary(state, d);
  const rows = useMemo(
    () =>
      netSubList(state)
        .map((s) => ({ s, st: netSubStatus(s, d), party: state.parties[s.partyId] }))
        .filter((x) => filter === 'all' || x.st.state === filter)
        .filter((x) => !query.trim() || matches(query, x.party?.name, x.party?.phone, x.s.plan, x.s.username, x.s.ip, x.s.device, x.s.location, String(x.s.number))),
    [state, d, filter, query],
  );
  const monthly = Object.entries(sum.monthly)
    .map(([c, v]) => money(state, v, c))
    .join(' + ');

  const remind = async (s: NetSub) => {
    const p = state.parties[s.partyId];
    if (!p?.phone) return notify('ما في رقم لهالمشترك. ضيفه من العملاء والموردون', 'error');
    const st = netSubStatus(s, d);
    const when = st.days < 0 ? `خلص بتاريخ ${dateText(s.paidUntil)}` : st.days === 0 ? 'بيخلص اليوم' : `بيخلص بتاريخ ${dateText(s.paidUntil)}`;
    const text = `مرحبا ${p.name}، اشتراك الإنترنت (${s.plan}) ${when}. قيمة التجديد ${money(state, s.price * s.months, s.currency)}${s.months > 1 ? ` لـ ${s.months} أشهر` : ' للشهر'}. ${state.info?.name ?? ''}`;
    try {
      await api.whatsapp(p.phone, text);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <div className="page netsubs">
      <PageHeader title="الاشتراكات">
        {manage && (
          <button className="primary" onClick={() => setEdit('new')}>
            <Icon name="plus" size={16} /> مشترك جديد
          </button>
        )}
      </PageHeader>
      <p className="muted">كل مشترك بباقته وسعرها بالشهر. «تجديد» بيعمل فاتورة مبيع وبيمدّد الاشتراك، والقائمة بتبيّن مين خلص ومين قرّب يخلص.</p>

      <div className="stats">
        <Stat label="المشتركين" value={String(sum.total)} />
        <Stat label="خلص اشتراكهم" value={String(sum.expired)} {...(sum.expired ? { tone: 'bad' as const, onClick: () => setFilter('expired') } : {})} />
        <Stat label="بيخلصوا خلال 3 أيام" value={String(sum.soon)} {...(sum.soon ? { onClick: () => setFilter('soon') } : {})} />
        <Stat label="الدخل الشهري المتوقّع" value={monthly || money(state, 0)} tone="good" />
      </div>

      <div className="toolbar">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { key: 'all', label: 'الكل' },
            { key: 'expired', label: 'خلص' },
            { key: 'soon', label: 'قرّب' },
            { key: 'active', label: 'فعّال' },
            { key: 'stopped', label: 'موقوف' },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="اسم، رقم، باقة، IP..." />
      </div>

      {rows.length === 0 ? (
        <Empty>{sum.total || filter !== 'all' || query ? 'ما في مشتركين بهالبحث' : manage ? 'ما في مشتركين لسا. اكبس «مشترك جديد» وحط الباقة وسعرها بالشهر.' : 'ما في مشتركين.'}</Empty>
      ) : (
        <table className="table netsubs-table">
          <thead>
            <tr>
              <th>#</th>
              <th>المشترك</th>
              <th>الباقة</th>
              <th className="num">بالشهر</th>
              <th>مدفوع لحد</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, st, party }) => (
              <tr key={s.id} className={`netsub-${st.state}`}>
                <td>{s.number}</td>
                <td>
                  <b>{party?.name ?? '—'}</b>
                  {(party?.phone || s.username || s.ip) && <div className="muted small">{[party?.phone, s.username, s.ip].filter(Boolean).join(' · ')}</div>}
                </td>
                <td>
                  {s.plan}
                  {s.device && <div className="muted small">{s.device}</div>}
                </td>
                <td className="num">{money(state, s.price, s.currency)}</td>
                <td>{dateText(s.paidUntil)}</td>
                <td>
                  <span className={`tag ${TONE[st.state]}`}>
                    {st.state === 'expired' ? `خلص من ${-st.days} يوم` : st.state === 'stopped' ? NETSUB_STATE_NAMES.stopped : st.days === 0 ? 'بيخلص اليوم' : `باقي ${st.days} يوم`}
                  </span>
                </td>
                <td className="row-actions">
                  {can('sales.create') && (
                    <button className="primary small" onClick={() => setRenew(s)}>
                      تجديد
                    </button>
                  )}
                  {party?.phone && (
                    <button className="whatsapp small" title="تذكير عالواتساب" onClick={() => void remind(s)}>
                      واتساب
                    </button>
                  )}
                  {manage && (
                    <button className="ghost small" onClick={() => setEdit(s)}>
                      تعديل
                    </button>
                  )}
                  {s.renewals.length > 0 && (
                    <button className="ghost small" title="آخر فاتورة تجديد" onClick={() => navigate('invoice', s.renewals[s.renewals.length - 1]!.invoiceId)}>
                      الفاتورة
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edit && <NetSubForm sub={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {renew && <RenewForm sub={renew} onClose={() => setRenew(null)} />}
    </div>
  );
}

function NetSubForm({ sub, onClose }: { sub: NetSub | null; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const d = today();
  const base = state.info!.baseCurrency;
  const [f, setF] = useState({
    partyId: sub?.partyId ?? '',
    newName: '',
    newPhone: '',
    plan: sub?.plan ?? '',
    price: sub ? toInput(state, sub.price, sub.currency) : '',
    currency: sub?.currency ?? base,
    months: String(sub?.months ?? 1),
    start: sub?.start ?? d,
    paidUntil: sub?.paidUntil ?? d,
    username: sub?.username ?? '',
    ip: sub?.ip ?? '',
    device: sub?.device ?? '',
    location: sub?.location ?? '',
    notes: sub?.notes ?? '',
    stopped: !!sub?.stopped,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // اقتراح الباقات من المشتركين التانيين
  const plans = [...new Set(Object.values(state.netSubs ?? {}).map((s) => s.plan))];
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={sub ? `تعديل اشتراك ${state.parties[sub.partyId]?.name ?? ''}` : 'مشترك جديد'} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let price: number;
          try {
            price = parseAmount(state, f.price || '0', f.currency);
          } catch (err) {
            return notify((err as Error).message, 'error');
          }
          if (!f.plan.trim()) return notify('اكتب اسم الباقة (مثلاً 4 ميغا)', 'error');
          setBusy(true);
          let partyId = f.partyId;
          if (!partyId) {
            if (!f.newName.trim()) {
              setBusy(false);
              return notify('اختار المشترك أو اكتب اسمه', 'error');
            }
            const party = { id: uid(), kind: 'customer' as const, name: f.newName.trim(), ...(f.newPhone.trim() ? { phone: f.newPhone.trim() } : {}) };
            if (!(await call('saveParty', party))) return setBusy(false);
            partyId = party.id;
            setF((x) => ({ ...x, partyId }));
          }
          const r = await call('saveNetSub', {
            id: sub?.id ?? uid(),
            partyId,
            plan: f.plan,
            price,
            currency: f.currency,
            months: Number(f.months) || 1,
            start: f.start,
            paidUntil: f.paidUntil,
            username: f.username,
            ip: f.ip,
            device: f.device,
            location: f.location,
            notes: f.notes,
            stopped: f.stopped,
          });
          setBusy(false);
          if (r !== null) {
            notify(sub ? 'تم الحفظ' : 'انضاف المشترك. لما يدفع اكبس «تجديد»');
            onClose();
          }
        }}
      >
        <Field label="المشترك" wide>
          <Picker options={partyOptions(state, 'customer')} value={f.partyId || null} onChange={(v) => setF({ ...f, partyId: v ?? '' })} placeholder="اختار زبون، أو اكتب اسم جديد تحت" />
        </Field>
        {!f.partyId && (
          <>
            <Field label="اسم مشترك جديد">
              <input value={f.newName} onChange={set('newName')} placeholder="أبو أحمد - حي الجامع" />
            </Field>
            <Field label="رقمه (للواتساب)">
              <input value={f.newPhone} onChange={set('newPhone')} dir="ltr" inputMode="tel" />
            </Field>
          </>
        )}
        <Field label="الباقة">
          <input value={f.plan} onChange={set('plan')} list="netsub-plans" placeholder="4 ميغا، فضائي 10 ميغا..." />
          <datalist id="netsub-plans">
            {plans.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="السعر بالشهر">
          <input className="num-input" inputMode="decimal" value={f.price} onChange={set('price')} />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => setF({ ...f, currency: c })} />
        </Field>
        <Field label="التجديد كل">
          <select value={f.months} onChange={set('months')}>
            {[1, 2, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m === 1 ? 'شهر' : `${m} أشهر`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="تاريخ الاشتراك">
          <input type="date" value={f.start} onChange={set('start')} />
        </Field>
        <Field label="مدفوع لحد">
          <input type="date" value={f.paidUntil} onChange={set('paidUntil')} />
        </Field>
        <Field label="اسم المستخدم (بالراوتر/السيرفر)">
          <input value={f.username} onChange={set('username')} dir="ltr" />
        </Field>
        <Field label="IP">
          <input value={f.ip} onChange={set('ip')} dir="ltr" />
        </Field>
        <Field label="الراوتر / الجهاز">
          <input value={f.device} onChange={set('device')} placeholder="TP-Link، Ubiquiti..." />
        </Field>
        <Field label="العنوان / البرج">
          <input value={f.location} onChange={set('location')} />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={set('notes')} />
        </Field>
        {sub && (
          <label className="check wide">
            <input type="checkbox" checked={f.stopped} onChange={(e) => setF({ ...f, stopped: e.target.checked })} />
            موقوف (مفصول): ما بيطلع بالتنبيهات ولا بالدخل المتوقّع
          </label>
        )}
        <div className="form-actions wide">
          {sub && (
            <button
              type="button"
              className="ghost danger push-start"
              onClick={async () => {
                if (!(await askConfirm(`حذف اشتراك «${state.parties[sub.partyId]?.name ?? ''}»؟ الفواتير اللي انعملت بتضل.`))) return;
                if ((await call('deleteNetSub', sub.id)) !== null) onClose();
              }}
            >
              حذف
            </button>
          )}
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy}>
            حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RenewForm({ sub, onClose }: { sub: NetSub; onClose: () => void }) {
  const { state, call, notify, user, can } = useCompany();
  const d = today();
  const lockedBox = user.role !== 'owner' && user.cashAccountId && state.accounts[user.cashAccountId] ? user.cashAccountId : null;
  const boxes = Object.values(state.accounts).filter((a) => isCashBox(a) && !a.archived && !a.hidden && (!a.currency || a.currency === sub.currency));
  const [months, setMonths] = useState(String(sub.months));
  const [date, setDate] = useState(d);
  const [price, setPrice] = useState(toInput(state, sub.price, sub.currency));
  const [paidAll, setPaidAll] = useState(true);
  const [paid, setPaid] = useState('');
  const [box, setBox] = useState(lockedBox ?? boxes.find((b) => b.currency === sub.currency)?.id ?? boxes[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const n = Math.max(1, Number(months) || 1);
  let unit = 0;
  try {
    unit = parseAmount(state, price || '0', sub.currency);
  } catch {
    unit = 0;
  }
  const total = unit * n;
  const from = renewalStart(sub, date);
  const to = addMonthsIso(from, n);
  const party = state.parties[sub.partyId];
  return (
    <Modal title={`تجديد ${party?.name ?? ''} — ${sub.plan}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let paidMinor = total;
          if (!paidAll) {
            try {
              paidMinor = parseAmount(state, paid || '0', sub.currency);
            } catch (err) {
              return notify((err as Error).message, 'error');
            }
          }
          setBusy(true);
          const r = await call('renewNetSub', sub.id, { date, months: n, price: unit, paid: paidMinor, ...(box ? { cashAccountId: box } : {}) });
          setBusy(false);
          if (r !== null) {
            notify(`تجدّد لحد ${dateText(to)}`);
            onClose();
          }
        }}
      >
        <Field label="كم شهر">
          <select value={months} onChange={(e) => setMonths(e.target.value)} autoFocus>
            {[1, 2, 3, 4, 5, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m === 1 ? 'شهر' : `${m} أشهر`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="سعر الشهر">
          <input className="num-input" inputMode="decimal" value={price} disabled={!can('price.edit')} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="تاريخ الدفع">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="الصندوق">
          <select value={box} disabled={!!lockedBox} onChange={(e) => setBox(e.target.value)}>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="wide netsub-renew-sum">
          من <b>{dateText(from)}</b> لـ <b>{dateText(to)}</b> · المجموع <b>{money(state, total, sub.currency)}</b>
        </p>
        <label className="check wide">
          <input type="checkbox" checked={paidAll} onChange={(e) => setPaidAll(e.target.checked)} />
          دفع كامل المبلغ
        </label>
        {!paidAll && (
          <Field label="المقبوض (الباقي دين عليه)">
            <input className="num-input" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
          </Field>
        )}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy}>
            تجديد وفاتورة
          </button>
        </div>
      </form>
    </Modal>
  );
}
