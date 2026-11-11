// كشف الحساب: لأي زبون أو مورد أو حساب (صندوق، بنك، مصاريف...)، بأي فترة، كل عملة لحالها،
// مع نوع كل حركة ورقمها والرصيد بعدها، والفاتورة بتنفتح بكبسة. طباعة A4 أو حراري، وتصدير Excel.
import { useMemo, useState } from 'react';
import { fullStatement, type StatementTarget } from '../../../core';
import { dateText, major, money, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { Empty, Field, PageHeader, partyOptions, Picker, Stat } from '../components/ui';
import { asPeriod, PeriodPicker, usePeriod } from '../components/PeriodPicker';

export function Statements({ initial }: { initial?: string } = {}) {
  const { state, navigate, can } = useCompany();
  // initial: «party:<id>» أو «account:<id>»
  const [kind0, id0] = (initial ?? '').split(':');
  const [target, setTarget] = useState<StatementTarget | null>(id0 && (kind0 === 'party' || kind0 === 'account') ? { kind: kind0, id: id0 } : null);
  const [mode, setMode] = useState<'party' | 'account'>(kind0 === 'account' ? 'account' : 'party');
  const [period, setPeriod] = usePeriod('all');
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [hideVoided, setHideVoided] = useState(true);
  const p = asPeriod(period);
  const parties = useMemo(() => partyOptions(state), [state.parties]);
  const accounts = useMemo(() => Object.values(state.accounts).filter((a) => !a.hidden || can('accounts.manage')).sort((a, b) => a.id.localeCompare(b.id)), [state.accounts]);
  const st = useMemo(() => (target ? fullStatement(state, target, p, { ...(currency ? { currency } : {}), hideVoided }) : null), [state, target, p.from, p.to, currency, hideVoided]);
  const name = target ? (target.kind === 'party' ? state.parties[target.id]?.name : state.accounts[target.id]?.name) ?? '' : '';
  const cur = st?.currency ?? state.info!.baseCurrency;
  const m = (v: number) => money(state, v, cur);
  const isParty = target?.kind === 'party';
  // للزبون: موجب = إلنا عليه، سالب = إلو علينا
  const balanceText = (v: number) => (isParty ? (v > 0 ? 'إلنا عليه' : v < 0 ? 'إلو علينا' : 'مسدّد') : '');

  return (
    <div className="page">
      <PageHeader title="كشف الحساب" />
      <div className="segmented">
        <button type="button" className={mode === 'party' ? 'active' : ''} onClick={() => setMode('party')}>
          زبون / مورد
        </button>
        <button type="button" className={mode === 'account' ? 'active' : ''} onClick={() => setMode('account')}>
          حساب (صندوق، بنك، مصاريف...)
        </button>
      </div>
      <div className="form-grid statement-target">
        {mode === 'party' ? (
          <Field label="الزبون أو المورد" wide>
            <Picker options={parties} value={target?.kind === 'party' ? target.id : null} onChange={(id) => (setCurrency(undefined), setTarget(id ? { kind: 'party', id } : null))} placeholder="اكتب الاسم..." />
          </Field>
        ) : (
          <Field label="الحساب" wide>
            <select value={target?.kind === 'account' ? target.id : ''} onChange={(e) => (setCurrency(undefined), setTarget(e.target.value ? { kind: 'account', id: e.target.value } : null))}>
              <option value="">اختر الحساب...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <PeriodPicker value={period} onChange={setPeriod} />
      {!target || !st ? (
        <Empty>اختر زبون أو مورد أو حساب لتشوف كشفه.</Empty>
      ) : (
        <>
          {st.currencies.length > 1 && (
            <div className="segmented">
              <button type="button" className={!currency ? 'active' : ''} onClick={() => setCurrency(undefined)}>
                الكل ({state.currencies[state.info!.baseCurrency]?.symbol})
              </button>
              {st.currencies.map((c) => (
                <button key={c} type="button" className={currency === c ? 'active' : ''} onClick={() => setCurrency(c)}>
                  {state.currencies[c]?.nameAr ?? c}
                </button>
              ))}
            </div>
          )}
          <div className="stats">
            <Stat label="رصيد أول المدة" value={m(st.opening)} hint={balanceText(st.opening)} />
            <Stat label={isParty ? 'عليه (مدين)' : 'مدين'} value={m(st.totalDebit)} />
            <Stat label={isParty ? 'منه (دائن)' : 'دائن'} value={m(st.totalCredit)} />
            <Stat label="الرصيد آخر المدة" value={m(Math.abs(st.closing))} hint={balanceText(st.closing)} tone={isParty ? (st.closing > 0 ? 'bad' : st.closing < 0 ? 'good' : undefined) : undefined} />
          </div>
          <div className="toolbar">
            <label className="check">
              <input type="checkbox" checked={hideVoided} onChange={(e) => setHideVoided(e.target.checked)} /> خبّي الفواتير والسندات الملغاة
            </label>
            <PrintButtons kind="report" name={`كشف حساب ${name}`} papers={['a4', '80mm']} />
            <ExportButtons
              name={`كشف حساب ${name}`}
              sheets={() => [
                {
                  name: 'كشف حساب',
                  title: name,
                  columns: [
                    { header: 'التاريخ', key: 'date' },
                    { header: 'الحركة', key: 'type' },
                    { header: 'البيان', key: 'memo' },
                    { header: 'مدين', key: 'debit', type: 'money' },
                    { header: 'دائن', key: 'credit', type: 'money' },
                    { header: 'الرصيد', key: 'running', type: 'money' },
                  ],
                  rows: [
                    { type: 'رصيد أول المدة', running: major(state, st.opening, cur) },
                    ...st.rows.map((r) => ({ date: dateText(r.date), type: r.type, memo: r.memo, debit: r.debit ? major(state, r.debit, cur) : null, credit: r.credit ? major(state, r.credit, cur) : null, running: major(state, r.running, cur) })),
                  ],
                  totals: { debit: major(state, st.totalDebit, cur), credit: major(state, st.totalCredit, cur) },
                },
              ]}
            />
          </div>
          <div className="print-area">
            <div className="print-only">
              <DocHeader title="كشف حساب">
                <div>
                  <b>{name}</b>
                </div>
                {period.key !== 'all' && <div className="ltr">{`${dateText(period.from)} — ${dateText(period.to)}`}</div>}
              </DocHeader>
            </div>
            {!st.rows.length && st.opening === 0 ? (
              <Empty>ما في حركات بهالفترة.</Empty>
            ) : (
              <table className="table compact statement">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الحركة</th>
                    <th>البيان</th>
                    <th className="num">مدين</th>
                    <th className="num">دائن</th>
                    <th className="num">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="group-row">
                    <td colSpan={5}>رصيد أول المدة</td>
                    <td className="num">{m(st.opening)}</td>
                  </tr>
                  {st.rows.map((r) => (
                    <tr key={r.entryId} className={`${r.invoiceId ? 'clickable' : ''} ${r.voided ? 'voided' : ''}`} onClick={() => r.invoiceId && navigate('invoice', r.invoiceId)}>
                      <td>{dateText(r.date)}</td>
                      <td>{r.type}</td>
                      <td>{r.memo}</td>
                      <td className="num">{r.debit ? m(r.debit) : ''}</td>
                      <td className="num">{r.credit ? m(r.credit) : ''}</td>
                      <td className="num">
                        <b>{m(r.running)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>المجموع والرصيد آخر المدة</td>
                    <td className="num">{m(st.totalDebit)}</td>
                    <td className="num">{m(st.totalCredit)}</td>
                    <td className="num">
                      <b>{m(st.closing)}</b> {balanceText(st.closing)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
