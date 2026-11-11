import { useMemo, useState } from 'react';
import { partyBalance, type Invoice, type Party } from '../../../core';
import { dateText, money, today, uid, useCompany } from '../api';
import { Empty, Field, Modal, PageHeader, Stat } from '../components/ui';
import { Icon } from '../components/icons';
import { PayForm } from './Debts';

type Period = 'month' | 'last' | 'year' | 'all';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'هالشهر' },
  { key: 'last', label: 'الشهر الماضي' },
  { key: 'year', label: 'هالسنة' },
  { key: 'all', label: 'الكل' },
];

function range(p: Period, d: string): [string, string] {
  const [y, m] = d.split('-').map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, '0');
  if (p === 'month') return [`${y}-${pad(m)}-01`, d];
  if (p === 'last') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return [`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-31`];
  }
  if (p === 'year') return [`${y}-01-01`, d];
  return ['0000-01-01', '9999-12-31'];
}

/** المسوّقين: كل مسوّق، فواتيره اللي جابها، وعمولته (المستحقة والمدفوعة والباقية). العمولة ما بتطلع بالفاتورة للزبون. */
export function Marketers() {
  const { state, navigate, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [period, setPeriod] = useState<Period>('month');
  const [open, setOpen] = useState<string | null>(null);
  const [pay, setPay] = useState<Party | null>(null);
  const [edit, setEdit] = useState<Party | 'new' | null>(null);
  const [from, to] = range(period, today());
  const toBase = (minor: number, cur: string, rate: number) => Math.round(minor * rate * 10 ** ((state.currencies[base]?.decimals ?? 2) - (state.currencies[cur]?.decimals ?? 2)));

  const rows = useMemo(() => {
    // عمولة كل فاتورة من قيدها المسجّل (بتضل صح حتى لو تغيّرت نسبة المسوّق بعدين)
    const commissionOf = (inv: Invoice, m: Party) => {
      const e = state.entries.find((x) => x.source?.type === 'commission' && x.source.id === inv.id && !state.voided[x.id] && !x.voidOf);
      const l = e?.lines.find((x) => x.partyId === m.id);
      return l ? { amount: l.credit, base: l.baseCredit } : { amount: 0, base: 0 };
    };
    return Object.values(state.parties)
      .filter((p) => p.marketerRate && !p.archived)
      .map((m) => {
        const invoices = state.invoices
          .filter((i) => i.marketerId === m.id && i.kind === 'sale' && !i.voidEntryId && i.date >= from && i.date <= to)
          .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
          .map((i) => ({ inv: i, com: commissionOf(i, m) }));
        const sales = invoices.reduce((t, x) => t + toBase(x.inv.total, x.inv.currency, x.inv.rate), 0);
        const earned = invoices.reduce((t, x) => t + x.com.base, 0);
        const owed = Math.max(0, -partyBalance(state, m.id).base);
        return { m, invoices, sales, earned, owed };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [state, from, to]);

  const totals = rows.reduce((t, r) => ({ sales: t.sales + r.sales, earned: t.earned + r.earned, owed: t.owed + r.owed, count: t.count + r.invoices.length }), { sales: 0, earned: 0, owed: 0, count: 0 });

  return (
    <div className="page">
      <PageHeader title="المسوّقين">
        {can('parties.manage') && (
          <button className="primary" onClick={() => setEdit('new')}>
            <Icon name="plus" size={16} /> مسوّق جديد
          </button>
        )}
      </PageHeader>
      <p className="muted">كل مسوّق إلو نسبة من المبيعات اللي بيجيبها. بفاتورة المبيع اختار «عن طريق مسوّق» (ما بيطلع للزبون)، وعمولته بتنسجّل لحالها مصروف ودين إلو، وبتدفعها من هون.</p>

      <div className="segmented">
        {PERIODS.map((p) => (
          <button key={p.key} className={period === p.key ? 'active' : ''} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>ما في مسوّقين لسا. اكبس «مسوّق جديد» وحط اسمه ونسبته (مثلاً أحمد 5%).</Empty>
      ) : (
        <>
          <div className="stats">
            <Stat label="مبيعات المسوّقين" value={money(state, totals.sales)} hint={`${totals.count} فاتورة`} />
            <Stat label="عمولاتهم بهالفترة" value={money(state, totals.earned)} />
            <Stat label="باقي إلهم (كل الفترات)" value={money(state, totals.owed)} tone={totals.owed ? 'bad' : undefined} />
          </div>
          <div className="marketers">
            {rows.map(({ m, invoices, sales, earned, owed }) => (
              <section key={m.id} className="card marketer-card">
                <div className="marketer-head" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <div>
                    <h3>
                      {m.name} <span className="tag">{m.marketerRate}% من الربح</span>
                    </h3>
                    {m.phone && <small className="muted ltr">{m.phone}</small>}
                  </div>
                  <div className="marketer-nums">
                    <span>
                      <small>فواتير</small>
                      <b>{invoices.length}</b>
                    </span>
                    <span>
                      <small>مبيعاته</small>
                      <b>{money(state, sales)}</b>
                    </span>
                    <span>
                      <small>عمولته</small>
                      <b>{money(state, earned)}</b>
                    </span>
                    <span>
                      <small>باقي إلو</small>
                      <b className={owed ? 'bad' : 'good'}>{money(state, owed)}</b>
                    </span>
                  </div>
                </div>
                <div className="button-row">
                  <button className="ghost small" onClick={() => setOpen(open === m.id ? null : m.id)}>
                    {open === m.id ? 'سكّر الفواتير' : `فواتيره (${invoices.length})`}
                  </button>
                  {can('vouchers.create') && owed > 0 && (
                    <button className="primary small" onClick={() => setPay(m)}>
                      دفع العمولة
                    </button>
                  )}
                  {can('parties.manage') && (
                    <button className="ghost small" onClick={() => setEdit(m)}>
                      تعديل النسبة
                    </button>
                  )}
                  <button className="ghost small" onClick={() => navigate('debts')}>
                    كشف حسابه
                  </button>
                </div>
                {open === m.id &&
                  (invoices.length === 0 ? (
                    <p className="muted">ما في فواتير إلو بهالفترة.</p>
                  ) : (
                    <table className="table compact">
                      <thead>
                        <tr>
                          <th>التاريخ</th>
                          <th>الفاتورة</th>
                          <th>الزبون</th>
                          <th className="num">قيمة الفاتورة</th>
                          <th className="num">العمولة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map(({ inv, com }) => (
                          <tr key={inv.id} className="clickable" onClick={() => navigate('invoice', inv.id)}>
                            <td>{dateText(inv.date)}</td>
                            <td className="mono">#{inv.number}</td>
                            <td>{inv.partyId ? state.parties[inv.partyId]?.name : 'زبون نقدي'}</td>
                            <td className="num">{money(state, inv.total, inv.currency)}</td>
                            <td className="num good">{money(state, com.amount, inv.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
              </section>
            ))}
          </div>
        </>
      )}
      {pay && <PayForm party={pay} direction="out" onClose={() => setPay(null)} />}
      {edit && <MarketerForm party={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MarketerForm({ party, onClose }: { party: Party | null; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [name, setName] = useState(party?.name ?? '');
  const [phone, setPhone] = useState(party?.phone ?? '');
  const [rate, setRate] = useState(party?.marketerRate ? String(party.marketerRate) : '');
  const save = async () => {
    const r = Number(rate.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (!name.trim()) return notify('اكتب اسم المسوّق', 'error');
    if (!(r > 0 && r <= 100)) return notify('النسبة لازم تكون بين 0 و100', 'error');
    const twin = !party && Object.values(state.parties).find((p) => !p.archived && p.name.trim() === name.trim());
    const base: Party = party ?? (twin || { id: uid(), name: name.trim(), kind: 'supplier' });
    const next: Party = { ...base, name: name.trim(), marketerRate: r, ...(phone.trim() ? { phone: phone.trim() } : {}) };
    if (await call('saveParty', next)) {
      notify(party ? 'تم التعديل' : `تمت إضافة ${next.name} كمسوّق (${r}%)`);
      onClose();
    }
  };
  return (
    <Modal title={party ? `تعديل ${party.name}` : 'مسوّق جديد'} onClose={onClose} width={480}>
      <div className="form-grid">
        <Field label="الاسم" wide>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: أحمد" autoFocus />
        </Field>
        <Field label="نسبته % من ربح الفاتورة">
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="مثلاً 33.33 (التلت)" />
        </Field>
        <Field label="رقم الهاتف (اختياري)">
          <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <p className="muted">العمولة نسبة من <b>ربح</b> كل فاتورة (سعر البيع ناقص تكلفة البضاعة)، مش من قيمة الفاتورة. إذا الفاتورة ما فيها ربح ما في عمولة. التلت = 33.33. تغيير النسبة بيمشي على الفواتير الجاية بس.</p>
      <div className="form-actions">
        <button className="primary big" onClick={save}>
          حفظ
        </button>
      </div>
    </Modal>
  );
}
