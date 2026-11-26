// «يومية الصندوق»: كذا قبض ودفع على صندوق واحد بشاشة وحدة، وكبسة وحدة بتسجّلهن كلهن (F9).
// كل سطر بيصير سند قبض أو دفع عادي: بيطلع بالسندات وبكشف حساب صاحبه وبالصندوق.
import { confirmCashOut } from '../components/cashGuard';
import { useEffect, useMemo, useState } from 'react';
import { isCashBox, type CompanyState } from '../../../core';
import { fxRates, money, parseAmount, today, uid, useCompany } from '../api';
import { Field, PageHeader, Picker } from '../components/ui';
import { Icon } from '../components/icons';
import { PartyForm } from './Parties';

interface Row {
  key: string;
  inText: string; // مقبوض
  outText: string; // مدفوع
  who: string | null; // p:<زبون/مورد> أو a:<حساب>
  memo: string;
}
const emptyRow = (): Row => ({ key: uid(), inText: '', outText: '', who: null, memo: '' });

/** رصيد الصندوق بعملة معيّنة (حركاته بهالعملة) */
function boxBalance(state: CompanyState, boxId: string, currency: string): number {
  let b = 0;
  for (const e of state.entries) for (const l of e.lines) if (l.accountId === boxId && l.currency === currency) b += l.debit - l.credit;
  return b;
}

export function CashJournal() {
  const { state, call, notify, user, can, navigate } = useCompany();
  const base = state.info!.baseCurrency;
  const lockedBox = user.role !== 'owner' && user.cashAccountId && state.accounts[user.cashAccountId] ? user.cashAccountId : null;
  const boxes = useMemo(() => Object.values(state.accounts).filter((a) => isCashBox(a) && !a.archived && !a.hidden), [state.accounts]);
  const [boxId, setBoxId] = useState(lockedBox ?? boxes[0]?.id ?? '');
  const box = state.accounts[boxId];
  const [currency, setCurrency] = useState(box?.currency ?? base);
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [newParty, setNewParty] = useState<string | null>(null);
  useEffect(() => {
    if (box?.currency && box.currency !== currency) setCurrency(box.currency);
  }, [box?.currency, currency]);

  // الأسماء: الزباين والموردين، وتحتهم الحسابات (مصاريف، إيرادات، جاري المالك...)
  const options = useMemo(() => {
    const parties = Object.values(state.parties)
      .filter((p) => !p.archived)
      .map((p) => ({ id: `p:${p.id}`, label: p.name, hint: p.kind === 'supplier' ? 'مورد' : p.kind === 'both' ? 'عميل ومورد' : 'عميل' }));
    const accounts = Object.values(state.accounts)
      .filter((a) => !a.isGroup && !a.archived && !a.hidden && ['expense', 'revenue', 'equity', 'liability'].includes(a.type) && (!a.currency || a.currency === currency))
      .map((a) => ({ id: `a:${a.id}`, label: a.name, hint: a.type === 'expense' ? 'مصروف' : a.type === 'revenue' ? 'إيراد' : 'حساب' }));
    return [...parties, ...accounts];
  }, [state.parties, state.accounts, currency]);

  const amount = (t: string) => {
    if (!t.trim()) return 0;
    try {
      return parseAmount(state, t, currency);
    } catch {
      return NaN;
    }
  };
  const used = rows.filter((r) => r.who || r.inText.trim() || r.outText.trim());
  const totalIn = used.reduce((s, r) => s + (amount(r.inText) || 0), 0);
  const totalOut = used.reduce((s, r) => s + (amount(r.outText) || 0), 0);
  const balance = box ? boxBalance(state, box.id, currency) : 0;
  const after = balance + totalIn - totalOut;

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r));
      // دايماً في سطر فاضي بالآخر
      const last = next[next.length - 1]!;
      return last.who || last.inText || last.outText ? [...next, emptyRow()] : next;
    });


  const save = async () => {
    if (saving) return;
    if (!box) return notify('اختار الصندوق', 'error');
    if (!used.length) return notify('اكتب سطر واحد على الأقل', 'error');
    const list = [];
    for (const [i, r] of used.entries()) {
      const a = amount(r.inText);
      const b = amount(r.outText);
      if (Number.isNaN(a) || Number.isNaN(b)) return notify(`السطر ${i + 1}: المبلغ مش مفهوم`, 'error');
      if ((a > 0) === (b > 0)) return notify(`السطر ${i + 1}: اكتب يا مقبوض يا مدفوع`, 'error');
      if (!r.who) return notify(`السطر ${i + 1}: اختار الاسم (زبون، مورد، أو حساب)`, 'error');
      const [t, id] = [r.who.slice(0, 1), r.who.slice(2)];
      const name = t === 'p' ? state.parties[id]?.name : state.accounts[id]?.name;
      list.push({
        kind: a > 0 ? 'receipt' : 'payment',
        date,
        amount: a > 0 ? a : b,
        currency,
        ...(t === 'p' ? { partyId: id } : { accountId: id }),
        cashAccountId: box.id,
        memo: r.memo.trim() || `يومية الصندوق — ${name ?? ''}`,
      });
    }
    // صافي اللي طالع من الصندوق بهالعملة (المقبوض بيغطي المدفوع)
    const out = list.reduce((s, v) => s + (v.kind === 'payment' ? v.amount : -v.amount), 0);
    if (out > 0 && !(await confirmCashOut(state, box.id, currency, out))) return;
    setSaving(true);
    try {
      const res = await call('postVouchers', list);
      if (res) {
        notify(`تسجّلت ${list.length} حركة على ${box.name}`);
        setRows([emptyRow(), emptyRow(), emptyRow()]);
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    // F9 = تسجيل (متل البرامج القديمة)، وبهالشاشة بياخد الأولوية على اختصار «الديون»؛ وCtrl+Enter كمان
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9' || (e.key === 'Enter' && e.ctrlKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void save();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const m = (v: number) => money(state, v, currency);
  return (
    <div className="page cash-journal">
      <PageHeader title="يومية الصندوق">
        <button onClick={() => navigate('vouchers')}>السندات المسجّلة</button>
      </PageHeader>
      <section className="card form-grid four">
        <Field label="الصندوق">
          <select value={boxId} disabled={!!lockedBox} onChange={(e) => setBoxId(e.target.value)}>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="العملة">
          <select value={currency} disabled={!!box?.currency} onChange={(e) => setCurrency(e.target.value)}>
            {Object.values(state.currencies)
              .filter((c) => c.code === base || fxRates(state, date)[c.code])
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.nameAr}
                </option>
              ))}
          </select>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="cj-balance">
          <small>الرصيد الحالي</small>
          <b className={balance < 0 ? 'bad' : ''}>{m(balance)}</b>
        </div>
      </section>

      <section className="card">
        <table className="table lines cj-lines">
          <thead>
            <tr>
              <th>المقبوض</th>
              <th>المدفوع</th>
              <th>الاسم (زبون، مورد، أو حساب)</th>
              <th>ملاحظات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td data-label="المقبوض">
                  <input className="num-input cj-in" inputMode="decimal" value={r.inText} onChange={(e) => setRow(r.key, { inText: e.target.value, ...(e.target.value ? { outText: '' } : {}) })} />
                </td>
                <td data-label="المدفوع">
                  <input className="num-input cj-out" inputMode="decimal" value={r.outText} onChange={(e) => setRow(r.key, { outText: e.target.value, ...(e.target.value ? { inText: '' } : {}) })} />
                </td>
                <td data-label="الاسم (من مين / لمين)">
                  <div className="with-button">
                    <Picker options={options} value={r.who} onChange={(id) => setRow(r.key, { who: id })} placeholder="اكتب الاسم…" />
                    {can('parties.manage') && (
                      <button type="button" className="icon" title="اسم جديد" onClick={() => setNewParty(r.key)}>
                        <Icon name="plus" size={16} />
                      </button>
                    )}
                  </div>
                </td>
                <td data-label="ملاحظات">
                  <input value={r.memo} onChange={(e) => setRow(r.key, { memo: e.target.value })} />
                </td>
                <td className="line-cell-remove">
                  {(r.who || r.inText || r.outText) && (
                    <button type="button" className="icon" title="حذف السطر" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [emptyRow()]))}>
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="cj-totals">
          <span>
            <small>مجموع المقبوضات</small>
            <b className="good">{m(totalIn)}</b>
          </span>
          <span>
            <small>مجموع المدفوعات</small>
            <b className="bad">{m(totalOut)}</b>
          </span>
          <span>
            <small>الرصيد بعد التسجيل</small>
            <b className={after < 0 ? 'bad' : ''}>{m(after)}</b>
          </span>
          <button className="primary big" disabled={saving || !used.length} onClick={() => void save()}>
            تسجيل <small>(F9)</small>
          </button>
        </div>
        <p className="muted">كل سطر بيصير سند قبض أو دفع، وبينزل بكشف حساب صاحبه. ما في داعي لسبب: الشخص نفسه هو الحساب. للمصاري اللي مش لشخص اختار «جاري المالك» أو مصروف.</p>
      </section>
      {newParty && (
        <PartyForm
          party={null}
          defaultKind="both"
          onClose={() => setNewParty(null)}
          onSaved={(p) => {
            setRow(newParty, { who: `p:${p.id}` });
            setNewParty(null);
          }}
        />
      )}
    </div>
  );
}
