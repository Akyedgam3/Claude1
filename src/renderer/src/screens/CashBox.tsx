// الصندوق: رصيد كل صندوق وبنك بعملته (من القيود نفسها، فمطابق للحسابات)، الداخل والخارج بالفترة،
// وكل حركة بنوعها والرصيد بعدها. وزر «تصفير الصندوق»: كل اللي فيه بيروح لصندوق تاني أو بنك أو سحب للمالك.
import { useMemo, useState } from 'react';
import { cashBoxes, fullStatement, type Account } from '../../../core';
import { dateText, major, money, parseAmount, toInput, today, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { Empty, Field, Modal, PageHeader, Stat } from '../components/ui';
import { asPeriod, PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { Icon } from '../components/icons';

/** رصيد الصندوق لكل عملة (بعملتها نفسها). */
function boxBalances(state: ReturnType<typeof useCompany>['state'], id: string, to?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of state.entries) {
    if (to && e.date > to) continue;
    for (const l of e.lines) if (l.accountId === id) out[l.currency] = (out[l.currency] ?? 0) + l.debit - l.credit;
  }
  return out;
}

/** الصندوق ما بيبيّن بالسالب: إذا طلع منه أكتر من اللي فات بيكتب «ما في نقد». */
const NO_CASH = 'ما في نقد بالصندوق';

export function CashBox() {
  const { state, can } = useCompany();
  const boxes = useMemo(() => cashBoxes(state).filter((a) => !a.hidden || can('accounts.manage')), [state.accounts]);
  const [sel, setSel] = useState<string>(boxes[0]?.id ?? '');
  const [period, setPeriod] = usePeriod('today');
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [zeroing, setZeroing] = useState(false);
  const [filling, setFilling] = useState(false);
  const d = today();
  // ملخص كل الصناديق: الرصيد الآن والداخل والخارج اليوم، لكل عملة
  const summary = useMemo(
    () =>
      boxes.map((b) => {
        const now: Record<string, number> = {};
        const inToday: Record<string, number> = {};
        const outToday: Record<string, number> = {};
        for (const e of state.entries)
          for (const l of e.lines) {
            if (l.accountId !== b.id) continue;
            now[l.currency] = (now[l.currency] ?? 0) + l.debit - l.credit;
            if (e.date === d) {
              inToday[l.currency] = (inToday[l.currency] ?? 0) + l.debit;
              outToday[l.currency] = (outToday[l.currency] ?? 0) + l.credit;
            }
          }
        return { box: b, now, inToday, outToday };
      }),
    [state.entries, boxes, d],
  );
  const box = state.accounts[sel];
  const p = asPeriod(period);
  const st = useMemo(() => (box ? fullStatement(state, { kind: 'account', id: box.id }, p, { ...((currency ?? box.currency) ? { currency: currency ?? box.currency! } : {}), hideVoided: true }) : null), [state, box?.id, p.from, p.to, currency]);
  const cur = st?.currency ?? box?.currency ?? state.info!.baseCurrency;
  const m = (v: number) => money(state, v, cur);
  const mc = (v: number) => (v < 0 ? NO_CASH : m(v));
  const negatives = box ? Object.entries(boxBalances(state, box.id)).filter(([, v]) => v < 0) : [];

  if (!boxes.length) return <div className="page"><PageHeader title="الصندوق" /><Empty>ما في صناديق.</Empty></div>;

  return (
    <div className="page">
      <PageHeader title="الصندوق" />
      <div className="cash-cards">
        {summary.map(({ box: b, now, inToday, outToday }) => {
          const curs = Object.keys(now).length ? Object.keys(now) : [b.currency ?? state.info!.baseCurrency];
          return (
            <button key={b.id} type="button" className={`cash-card ${sel === b.id ? 'active' : ''}`} onClick={() => (setSel(b.id), setCurrency(undefined))}>
              <span className="cash-name">
                <Icon name="wallet" size={18} /> {b.name}
              </span>
              {curs.map((c) => (
                <span key={c} className="cash-line">
                  <b className={(now[c] ?? 0) < 0 ? 'muted' : ''}>{(now[c] ?? 0) < 0 ? `${NO_CASH}${curs.length > 1 ? ` (${state.currencies[c]?.symbol ?? c})` : ''}` : money(state, now[c] ?? 0, c)}</b>
                  <small className="muted">
                    اليوم: <span className="good">+{money(state, inToday[c] ?? 0, c)}</span> <span className="bad">−{money(state, outToday[c] ?? 0, c)}</span>
                  </small>
                </span>
              ))}
            </button>
          );
        })}
      </div>
      {box && st && (
        <>
          <div className="toolbar cash-head">
            <h3>{box.name}</h3>
            {can('vouchers.create') && negatives.length > 0 && (
              <button onClick={() => setFilling(true)}>
                <Icon name="wallet" size={16} /> تصفير السالب
              </button>
            )}
            {can('vouchers.create') && (
              <button className="primary" onClick={() => setZeroing(true)}>
                <Icon name="transfer" size={16} /> تصفير الصندوق / تحويل
              </button>
            )}
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
          {st.currencies.length > 1 && (
            <div className="segmented">
              {st.currencies.map((c) => (
                <button key={c} type="button" className={cur === c ? 'active' : ''} onClick={() => setCurrency(c)}>
                  {state.currencies[c]?.nameAr ?? c}
                </button>
              ))}
            </div>
          )}
          <div className="stats">
            <Stat label="أول المدة" value={mc(st.opening)} />
            <Stat label="الداخل" value={m(st.totalDebit)} tone="good" />
            <Stat label="الخارج" value={m(st.totalCredit)} tone="bad" />
            <Stat label="آخر المدة" value={mc(st.closing)} />
          </div>
          <div className="toolbar">
            <PrintButtons kind="report" name={`حركة ${box.name}`} papers={['a4', '80mm']} />
            <ExportButtons
              name={`حركة ${box.name}`}
              sheets={() => [
                {
                  name: box.name,
                  columns: [
                    { header: 'التاريخ', key: 'date' },
                    { header: 'الحركة', key: 'type' },
                    { header: 'البيان', key: 'memo' },
                    { header: 'داخل', key: 'in', type: 'money' },
                    { header: 'خارج', key: 'out', type: 'money' },
                    { header: 'الرصيد', key: 'running', type: 'money' },
                  ],
                  rows: [{ type: 'أول المدة', running: major(state, st.opening, cur) }, ...st.rows.map((r) => ({ date: dateText(r.date), type: r.type, memo: r.memo, in: r.debit ? major(state, r.debit, cur) : null, out: r.credit ? major(state, r.credit, cur) : null, running: major(state, r.running, cur) }))],
                  totals: { in: major(state, st.totalDebit, cur), out: major(state, st.totalCredit, cur) },
                },
              ]}
            />
          </div>
          <div className="print-area">
            <div className="print-only">
              <DocHeader title={`حركة ${box.name}`}>{period.key !== 'all' && <div className="ltr">{`${dateText(period.from)} — ${dateText(period.to)}`}</div>}</DocHeader>
            </div>
            {!st.rows.length ? (
              <Empty>ما في حركات بهالفترة.</Empty>
            ) : (
              <CashTable rows={st.rows} opening={st.opening} m={m} mc={mc} />
            )}
          </div>
          {filling && <FillBox box={box} negatives={negatives} onClose={() => setFilling(false)} />}
          {zeroing && <ZeroBox box={box} balances={boxBalances(state, box.id)} boxes={boxes} onClose={() => setZeroing(false)} />}
        </>
      )}
    </div>
  );
}

function CashTable({ rows, opening, m, mc }: { rows: ReturnType<typeof fullStatement>['rows']; opening: number; m: (v: number) => string; mc: (v: number) => string }) {
  const { navigate } = useCompany();
  return (
    <table className="table compact statement">
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>الحركة</th>
          <th>البيان</th>
          <th className="num">داخل</th>
          <th className="num">خارج</th>
          <th className="num">الرصيد</th>
        </tr>
      </thead>
      <tbody>
        <tr className="group-row">
          <td colSpan={5}>أول المدة</td>
          <td className="num">{mc(opening)}</td>
        </tr>
        {rows.map((r) => (
          <tr key={r.entryId} className={r.invoiceId ? 'clickable' : ''} onClick={() => r.invoiceId && navigate('invoice', r.invoiceId)}>
            <td>{dateText(r.date)}</td>
            <td>{r.type}</td>
            <td>{r.memo}</td>
            <td className="num good">{r.debit ? m(r.debit) : ''}</td>
            <td className="num bad">{r.credit ? m(r.credit) : ''}</td>
            <td className="num">
              {r.running < 0 ? <span className="muted">ما في نقد</span> : <b>{m(r.running)}</b>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** تصفير الصندوق: كل المبلغ (أو كله إلا فراطة بتضل) بيروح لصندوق تاني أو بنك، أو سحب للمالك. */
function ZeroBox({ box, balances, boxes, onClose }: { box: Account; balances: Record<string, number>; boxes: Account[]; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const curs = Object.entries(balances).filter(([, v]) => v > 0).map(([c]) => c);
  const [currency, setCurrency] = useState(curs[0] ?? box.currency ?? state.info!.baseCurrency);
  const balance = balances[currency] ?? 0;
  const targets = boxes.filter((b) => b.id !== box.id && (!b.currency || b.currency === currency));
  const [to, setTo] = useState<string>(targets[0]?.id ?? 'owner');
  const [keep, setKeep] = useState('');
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('');
  const keepAmount = keep.trim() ? parseAmount(state, keep, currency) : 0;
  const amount = balance - keepAmount;
  const save = async () => {
    if (!(amount > 0)) return notify('ما في مبلغ للتصفير', 'error');
    const ok =
      to === 'owner'
        ? await call('drawFromBox', { date, from: box.id, amount, currency, memo: memo.trim() || `تصفير ${box.name}: سحب للمالك` })
        : await call('transferBox', { date, from: box.id, to, amount, currency, memo: memo.trim() || `تصفير ${box.name} ← ${state.accounts[to]?.name ?? ''}` });
    if (ok) {
      notify(`تم: طلع ${money(state, amount, currency)} من ${box.name}`);
      onClose();
    }
  };
  return (
    <Modal title={`تصفير ${box.name}`} onClose={onClose} width={480}>
      {!curs.length ? (
        <p className="muted">ما في شي بالصندوق ينصفّر.</p>
      ) : (
        <div className="form-grid">
          {curs.length > 1 && (
            <Field label="العملة" wide>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {curs.map((c) => (
                  <option key={c} value={c}>
                    {state.currencies[c]?.nameAr ?? c}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="wide zero-balance">
            بالصندوق هلق: <b>{money(state, balance, currency)}</b>
          </p>
          <Field label="لوين بتروح المصاري" wide>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {targets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="owner">سحب للمالك (مسحوبات، مش مصروف)</option>
            </select>
          </Field>
          <Field label="خلّي بالصندوق (فراطة) — اختياري">
            <input value={keep} onChange={(e) => setKeep(e.target.value)} inputMode="decimal" placeholder={toInput(state, 0, currency)} />
          </Field>
          <Field label="التاريخ">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="ملاحظة" wide>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="مثلاً: تسليم الوردية" />
          </Field>
          <p className="wide muted">
            رح يطلع <b>{money(state, Math.max(0, amount), currency)}</b> ويضل بالصندوق <b>{money(state, Math.max(0, keepAmount), currency)}</b>.
          </p>
          <div className="form-actions wide">
            <button className="primary big" disabled={!(amount > 0)} onClick={() => void save()}>
              تصفير
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** تصفير السالب: إذا طلع من الصندوق أكتر من اللي فات عليه (مصاري ما انسجّلت)، المالك بيحط الفرق فبيرجع الصندوق صفر. */
function FillBox({ box, negatives, onClose }: { box: Account; negatives: [string, number][]; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [currency, setCurrency] = useState(negatives[0]![0]);
  const amount = -(negatives.find(([c]) => c === currency)?.[1] ?? 0);
  const [date, setDate] = useState(today());
  const save = async () => {
    if (!(amount > 0)) return onClose();
    if (await call('fillBox', { date, to: box.id, amount, currency, memo: `تصفير السالب بـ${box.name}` })) {
      notify(`تم: ${box.name} رجع صفر`);
      onClose();
    }
  };
  return (
    <Modal title={`تصفير السالب — ${box.name}`} onClose={onClose} width={460}>
      <div className="form-grid">
        {negatives.length > 1 && (
          <Field label="العملة" wide>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {negatives.map(([c]) => (
                <option key={c} value={c}>
                  {state.currencies[c]?.nameAr ?? c}
                </option>
              ))}
            </select>
          </Field>
        )}
        <p className="wide">
          طلع من الصندوق أكتر من اللي فات عليه بـ <b>{money(state, amount, currency)}</b> (غالباً مصاري فاتت وما انسجّلت). التصفير بيسجّلها إنه المالك حطها بالصندوق، فبيرجع الصندوق <b>صفر</b>.
        </p>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="form-actions wide">
          <button className="primary big" onClick={() => void save()}>
            صفّر
          </button>
        </div>
      </div>
    </Modal>
  );
}
