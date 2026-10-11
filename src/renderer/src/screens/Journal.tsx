import { useMemo, useState } from 'react';
import type { JournalEntry } from '../../../core';
import { dateText, major, money, parseAmount, today, uid, useCompany } from '../api';
import { ExportButtons } from '../components/print';
import { ConfirmButton, CurrencySelect, Field, matches, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { Icon } from '../components/icons';

interface Row {
  key: string;
  accountId: string | null;
  partyId: string | null;
  debit: string;
  credit: string;
  memo: string;
}

const emptyRow = (): Row => ({ key: uid(), accountId: null, partyId: null, debit: '', credit: '', memo: '' });

/** القيود اليدوية (تسويات، رواتب، استهلاك...) وسجل كل القيود. */
export function Journal() {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('');
  const [currency, setCurrency] = useState(base);
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [query, setQuery] = useState('');

  const accountOpts = useMemo(
    () =>
      Object.values(state.accounts)
        .filter((a) => !a.isGroup && !a.archived)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((a) => ({ id: a.id, label: `${a.id} — ${a.name}`, ...(a.currency ? { hint: a.currency } : {}) })),
    [state.accounts],
  );
  const parse = (v: string) => {
    try {
      return parseAmount(state, v, currency);
    } catch {
      return NaN;
    }
  };
  const totalDebit = rows.reduce((s, r) => s + (parse(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (parse(r.credit) || 0), 0);
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const entries = useMemo(
    () => [...state.entries].reverse().filter((e) => matches(query, e.number, e.memo, ...e.lines.map((l) => state.accounts[l.accountId]?.name))).slice(0, 300),
    [state.entries, state.accounts, query],
  );

  const save = async () => {
    const lines = rows
      .filter((r) => r.accountId && (r.debit || r.credit))
      .map((r) => ({
        accountId: r.accountId!,
        ...(r.debit ? { debit: parse(r.debit) } : {}),
        ...(r.credit ? { credit: parse(r.credit) } : {}),
        currency,
        ...(r.partyId ? { partyId: r.partyId } : {}),
        ...(r.memo ? { memo: r.memo } : {}),
      }));
    if (lines.some((l) => Number.isNaN(l.debit ?? 0) || Number.isNaN(l.credit ?? 0))) return notify('مبلغ غير صالح', 'error');
    if (await call('postEntry', { date, memo: memo.trim() || 'قيد يدوي', lines, source: { type: 'manual', id: uid() } })) {
      notify('تم حفظ القيد');
      setRows([emptyRow(), emptyRow()]);
      setMemo('');
    }
  };

  return (
    <div className="page">
      <PageHeader title="القيود اليومية" />
      {can('journal.create') && (
        <section className="card">
          <h3>قيد يدوي جديد</h3>
          <div className="form-grid four">
            <Field label="التاريخ">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="العملة">
              <CurrencySelect value={currency} onChange={setCurrency} />
            </Field>
            <Field label="البيان" wide>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="رواتب شهر، تسوية، استهلاك أصول..." />
            </Field>
          </div>
          <table className="table lines">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>الحساب</th>
                <th>العميل / المورد (اختياري)</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>ملاحظة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <Picker options={accountOpts} value={r.accountId} onChange={(id) => setRow(r.key, { accountId: id })} placeholder="اختر الحساب" />
                  </td>
                  <td>{(r.accountId === '1103' || r.accountId === '2101') && <Picker options={partyOptions(state)} value={r.partyId} onChange={(id) => setRow(r.key, { partyId: id })} />}</td>
                  <td>
                    <input className="num-input" value={r.debit} onChange={(e) => setRow(r.key, { debit: e.target.value, credit: '' })} inputMode="decimal" />
                  </td>
                  <td>
                    <input className="num-input" value={r.credit} onChange={(e) => setRow(r.key, { credit: e.target.value, debit: '' })} inputMode="decimal" />
                  </td>
                  <td>
                    <input value={r.memo} onChange={(e) => setRow(r.key, { memo: e.target.value })} />
                  </td>
                  <td>
                    <button className="icon" onClick={() => setRows((rs) => (rs.length > 2 ? rs.filter((x) => x.key !== r.key) : rs))}>
                      <Icon name="close" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <button onClick={() => setRows([...rows, emptyRow()])}>+ سطر</button>
                </td>
                <td>المجموع</td>
                <td className="num">{money(state, totalDebit, currency)}</td>
                <td className="num">{money(state, totalCredit, currency)}</td>
                <td className={totalDebit === totalCredit && totalDebit > 0 ? 'good' : 'bad'}>{totalDebit === totalCredit ? (totalDebit > 0 ? 'متوازن ✓' : '') : `الفرق ${money(state, Math.abs(totalDebit - totalCredit), currency)}`}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="form-actions">
            <button className="primary" disabled={totalDebit !== totalCredit || totalDebit === 0} onClick={save}>
              حفظ القيد
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="panel-header">
          <h3>سجل القيود</h3>
          <ExportButtons
            name="دفتر اليومية"
            sheets={() => [
              {
                name: 'اليومية',
                columns: [
                  { header: 'رقم القيد', key: 'n', type: 'number' },
                  { header: 'التاريخ', key: 'date' },
                  { header: 'البيان', key: 'memo' },
                  { header: 'الحساب', key: 'account' },
                  { header: 'مدين', key: 'debit', type: 'money' },
                  { header: 'دائن', key: 'credit', type: 'money' },
                ],
                rows: state.entries.flatMap((e) =>
                  e.lines.map((l) => ({ n: e.number, date: dateText(e.date), memo: e.memo, account: state.accounts[l.accountId]?.name, debit: major(state, l.baseDebit) || null, credit: major(state, l.baseCredit) || null })),
                ),
              },
            ]}
          />
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="بحث برقم القيد أو البيان أو اسم الحساب..." />
        <table className="table compact">
          <thead>
            <tr>
              <th>رقم</th>
              <th>التاريخ</th>
              <th>البيان</th>
              <th>الحسابات</th>
              <th className="num">المبلغ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e: JournalEntry) => (
              <tr key={e.id} className={state.voided[e.id] || e.voidOf ? 'voided' : ''}>
                <td className="mono">{e.number}</td>
                <td>{dateText(e.date)}</td>
                <td>{e.memo}</td>
                <td className="muted">{[...new Set(e.lines.map((l) => state.accounts[l.accountId]?.name))].join('، ')}</td>
                <td className="num">{money(state, e.lines.reduce((s, l) => s + l.baseDebit, 0))}</td>
                <td>
                  {e.source?.type === 'manual' && !e.voidOf && !state.voided[e.id] && can('vouchers.void') && (
                    <ConfirmButton label="إلغاء" onConfirm={() => call('voidEntry', e.id, today()).then((r) => r && notify('تم إلغاء القيد'))} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
