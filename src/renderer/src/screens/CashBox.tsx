// الصندوق: رصيد كل صندوق وبنك بعملته (من القيود نفسها، فمطابق للحسابات)، الداخل والخارج بالفترة،
// وكل حركة بنوعها والرصيد بعدها. وزر «تصفير الصندوق»: كل اللي فيه بيروح لصندوق تاني أو بنك أو سحب للمالك.
import { useMemo, useState } from 'react';
import { cashBoxes, findRate, fullStatement, SYSTEM_ACCOUNTS, type Account } from '../../../core';
import { dateText, major, money, parseAmount, rateToInput, toInput, today, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { askConfirm, Empty, Field, Modal, PageHeader, Stat } from '../components/ui';
import { asPeriod, PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { Icon } from '../components/icons';
import { entryTarget } from '../components/openEntry';

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
  const { state, can, user } = useCompany();
  // بدون «إدارة الصناديق» (الكاشير): صندوقه بس (أو الصندوق الرئيسي)، بدون البنك وباقي الصناديق
  const boxes = useMemo(() => {
    const all = cashBoxes(state).filter((a) => !a.hidden || can('accounts.manage'));
    if (can('cash.manage')) return all;
    const own = user.cashAccountId ? all.find((a) => a.id === user.cashAccountId) : undefined;
    return own ? [own] : all.filter((a) => a.id !== '1102');
  }, [state.accounts, user.cashAccountId]);
  const [sel, setSel] = useState<string>(boxes[0]?.id ?? '');
  const [period, setPeriod] = usePeriod('today');
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [zeroing, setZeroing] = useState(false);
  const [filling, setFilling] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [opening, setOpening] = useState(false);
  const d = today();
  // ملخص كل الصناديق: الرصيد الآن والداخل والخارج اليوم، لكل عملة
  const summary = useMemo(
    () => {
      // الملغى وقيد إلغائه ما بينحسبوا بداخل/خارج اليوم (متل جدول الحركة)، فالكرت بيطابق الجدول
      const voided = new Set<string>();
      for (const e of state.entries) if (e.voidOf) voided.add(e.voidOf).add(e.id);
      return boxes.map((b) => {
        const now: Record<string, number> = {};
        const inToday: Record<string, number> = {};
        const outToday: Record<string, number> = {};
        for (const e of state.entries)
          for (const l of e.lines) {
            if (l.accountId !== b.id) continue;
            now[l.currency] = (now[l.currency] ?? 0) + l.debit - l.credit;
            if (e.date === d && !voided.has(e.id)) {
              inToday[l.currency] = (inToday[l.currency] ?? 0) + l.debit;
              outToday[l.currency] = (outToday[l.currency] ?? 0) + l.credit;
            }
          }
        return { box: b, now, inToday, outToday };
      });
    },
    [state.entries, boxes, d],
  );
  const box = state.accounts[sel];
  const p = asPeriod(period);
  const st = useMemo(() => (box ? fullStatement(state, { kind: 'account', id: box.id }, p, { ...((currency ?? box.currency) ? { currency: currency ?? box.currency! } : {}), hideVoided: true }) : null), [state, box?.id, p.from, p.to, currency]);
  const cur = st?.currency ?? box?.currency ?? state.info!.baseCurrency;
  const m = (v: number) => money(state, v, cur);
  // بالسالب منبيّن الرقم نفسه (أحمر) حتى المالك يعرف قديش ناقص، مش «ما في نقد» بس
  const mc = (v: number) => (v < 0 ? `${m(v)} (بالسالب)` : m(v));
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
                  <b className={(now[c] ?? 0) < 0 ? 'bad' : ''} title={(now[c] ?? 0) < 0 ? NO_CASH : undefined}>{money(state, now[c] ?? 0, c)}</b>
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
            {can('cash.manage') && negatives.length > 0 && (
              <button onClick={() => setFilling(true)}>
                <Icon name="wallet" size={16} /> تصفير السالب
              </button>
            )}
            {can('cash.manage') && can('vouchers.create') && (
              <button onClick={() => setOpening(true)} title="المصاري اللي كانت معك قبل ما تبلّش عالبرنامج، أو مصاري حطيتها من عندك">
                <Icon name="wallet" size={16} /> رصيد افتتاحي
              </button>
            )}
            {can('cash.manage') && Object.keys(state.currencies).length > 1 && (
              <button onClick={() => setExchanging(true)}>
                <Icon name="transfer" size={16} /> صرف عملة
              </button>
            )}
            {can('cash.manage') && (
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
          {opening && <OpeningCash box={box} onClose={() => setOpening(false)} />}
          {exchanging && <ExchangeBox box={box} boxes={boxes} onClose={() => setExchanging(false)} />}
          {zeroing && <ZeroBox box={box} balances={boxBalances(state, box.id)} boxes={boxes} onClose={() => setZeroing(false)} />}
        </>
      )}
    </div>
  );
}

function CashTable({ rows, opening, m, mc }: { rows: ReturnType<typeof fullStatement>['rows']; opening: number; m: (v: number) => string; mc: (v: number) => string }) {
  const { navigate, state } = useCompany();
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
          <tr key={r.entryId} className="clickable" title="اكبس لتفتح الحركة (وتعدّلها)" onClick={() => { const t = entryTarget(state, r.entryId); if (t) navigate(t.screen, t.param); }}>
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

/**
 * الرصيد الافتتاحي للصندوق: المصاري اللي كانت بالدرج قبل البرنامج (أو حطها المالك) بتفوت رأس مال، مش مبيعات،
 * فالصندوق ما بيصير بالسالب لما تندفع فواتير البضاعة الموجودة. فيك تكتب قديش معك هلق والبرنامج بيحسب الفرق.
 */
function OpeningCash({ box, onClose }: { box: Account; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const bal = boxBalances(state, box.id);
  const [currency, setCurrency] = useState(box.currency ?? base);
  const now = bal[currency] ?? 0;
  const [mode, setMode] = useState<'count' | 'add'>('count');
  const [text, setText] = useState('');
  const [date, setDate] = useState(() => state.entries.reduce((d, e) => (e.date < d ? e.date : d), today()));
  let typed = 0;
  try {
    typed = text.trim() ? parseAmount(state, text, currency) : 0;
  } catch {
    typed = -1;
  }
  const amount = mode === 'count' ? typed - now : typed;
  const save = async () => {
    if (typed < 0) return notify('اكتب المبلغ رقم', 'error');
    if (!(amount > 0)) return notify(mode === 'count' ? `بالصندوق ${money(state, now, currency)} أصلاً، ما في شي يتزاد` : 'اكتب المبلغ', 'error');
    if (await call('postVoucher', { kind: 'receipt', date, amount, currency, accountId: SYSTEM_ACCOUNTS.capital, cashAccountId: box.id, memo: `رصيد افتتاحي لـ${box.name}` })) {
      notify(`تم: فات ${money(state, amount, currency)} على ${box.name} كرأس مال`);
      onClose();
    }
  };
  const curs = box.currency ? [box.currency] : Object.keys(state.currencies);
  return (
    <Modal title={`رصيد افتتاحي: ${box.name}`} onClose={onClose} width={480}>
      <p className="muted">المصاري اللي كانت معك قبل ما تبلّش عالبرنامج، أو حطيتها من عندك. بتنسجّل رأس مال إلك، مش مبيعات، وما بتغيّر الربح.</p>
      <div className="form-grid">
        <div className="segmented wide">
          <button type="button" className={mode === 'count' ? 'active' : ''} onClick={() => setMode('count')}>عدّيت الدرج: قديش فيه هلق؟</button>
          <button type="button" className={mode === 'add' ? 'active' : ''} onClick={() => setMode('add')}>مبلغ بدي زيده</button>
        </div>
        {curs.length > 1 && (
          <Field label="العملة">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {curs.map((c) => (
                <option key={c} value={c}>
                  {state.currencies[c]?.nameAr ?? c}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={mode === 'count' ? `قديش بالدرج هلق (${state.currencies[currency]?.symbol ?? currency})` : `المبلغ (${state.currencies[currency]?.symbol ?? currency})`}>
          <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="التاريخ (أول يوم بالبرنامج)">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <p className="wide muted">
          بالبرنامج هلق: <b className={now < 0 ? 'bad' : ''}>{money(state, now, currency)}</b>
          {amount > 0 && (
            <>
              {' '}← رح يفوت <b>{money(state, amount, currency)}</b> ويصير الصندوق <b>{money(state, now + amount, currency)}</b>
            </>
          )}
        </p>
        <div className="form-actions wide">
          <button className="primary big" disabled={!(amount > 0)} onClick={() => void save()}>
            حفظ
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * صرف عملة بين صندوقين: ليرات من صندوق الليرة ← دولارات بصندوق الدولار (أو العكس).
 * المبلغ الداخل بيتحسب لحالو من سعر اليوم، وفيك تعدّله إذا صرفت بسعر تاني (الفرق بيروح على فروقات الصرف).
 */
function ExchangeBox({ box, boxes, onClose }: { box: Account; boxes: Account[]; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const curs = Object.keys(state.currencies);
  const bal = boxBalances(state, box.id);
  const [fromCur, setFromCur] = useState(box.currency ?? (Object.entries(bal).find(([, v]) => v > 0)?.[0] ?? base));
  const others = boxes.filter((b) => b.id !== box.id);
  const firstTo = others.find((b) => b.currency && b.currency !== fromCur) ?? others[0] ?? box;
  const [to, setTo] = useState(firstTo.id);
  const toBox = state.accounts[to];
  const [toCurState, setToCur] = useState(firstTo.currency ?? curs.find((c) => c !== fromCur) ?? base);
  const toCur = toBox?.currency ?? toCurState;
  const [amountText, setAmountText] = useState('');
  const [toText, setToText] = useState<string | null>(null); // null = محسوب من السعر
  const [date, setDate] = useState(today());
  const dec = (c: string) => state.currencies[c]?.decimals ?? 2;
  const rate = (c: string) => (c === base ? 1 : findRate(state, c, date));
  const amount = (() => {
    try {
      return parseAmount(state, amountText, fromCur);
    } catch {
      return 0;
    }
  })();
  const rf = rate(fromCur);
  const rt = rate(toCur);
  const auto = rf && rt && amount > 0 ? Math.round(((amount / 10 ** dec(fromCur)) * rf * 10 ** dec(toCur)) / rt) : 0;
  const toAmount = (() => {
    if (toText === null) return auto;
    try {
      return parseAmount(state, toText, toCur);
    } catch {
      return 0;
    }
  })();
  const have = bal[fromCur] ?? 0;
  const name = (c: string) => state.currencies[c]?.nameAr ?? c;
  const save = async () => {
    if (fromCur === toCur) return notify('اختار عملتين مختلفتين', 'error');
    if (!rf || !rt) return notify(`سجّل سعر ${name(fromCur === base ? toCur : fromCur)} لهاليوم أول (الإعدادات ← العملات أو الرئيسية)`, 'error');
    if (!(amount > 0) || !(toAmount > 0)) return notify('اكتب المبلغ', 'error');
    if (amount > have && !(await askConfirm(`بـ«${box.name}» ${money(state, Math.max(0, have), fromCur)} بس. الصندوق رح يصير بالسالب. كمّل؟`))) return;
    if (await call('exchangeBoxes', { date, from: box.id, to, fromCurrency: fromCur, amount, toCurrency: toCur, toAmount })) {
      notify(`تم الصرف: طلع ${money(state, amount, fromCur)} وفات ${money(state, toAmount, toCur)} على ${toBox?.name ?? ''}`);
      onClose();
    }
  };
  // السعر الفعلي للعملية (كم ليرة بالدولار)، حتى يشوف إذا مطابق لسعر اليوم
  const foreign = fromCur === base ? toCur : fromCur;
  const effective = amount > 0 && toAmount > 0 && (fromCur === base || toCur === base)
    ? (fromCur === base ? amount / 10 ** dec(fromCur) / (toAmount / 10 ** dec(toCur)) : toAmount / 10 ** dec(toCur) / (amount / 10 ** dec(fromCur)))
    : null;
  return (
    <Modal title={`صرف عملة من ${box.name}`} onClose={onClose} width={500}>
      <div className="form-grid">
        {!box.currency && (
          <Field label="العملة اللي طالعة">
            <select value={fromCur} onChange={(e) => (setFromCur(e.target.value), setToText(null))}>
              {curs.map((c) => (
                <option key={c} value={c}>
                  {name(c)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={`المبلغ اللي طالع (${state.currencies[fromCur]?.symbol ?? fromCur})`}>
          <input value={amountText} onChange={(e) => (setAmountText(e.target.value), setToText(null))} inputMode="decimal" autoFocus />
        </Field>
        <p className="wide muted">بالصندوق هلق: {money(state, have, fromCur)}</p>
        <Field label="لأي صندوق">
          <select value={to} onChange={(e) => (setTo(e.target.value), setToText(null))}>
            {others.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        {!toBox?.currency && (
          <Field label="العملة اللي داخلة">
            <select value={toCur} onChange={(e) => (setToCur(e.target.value), setToText(null))}>
              {curs.filter((c) => c !== fromCur).map((c) => (
                <option key={c} value={c}>
                  {name(c)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={`المبلغ اللي داخل (${state.currencies[toCur]?.symbol ?? toCur})`}>
          <input value={toText ?? (auto ? toInput(state, auto, toCur) : '')} onChange={(e) => setToText(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => (setDate(e.target.value), setToText(null))} />
        </Field>
        {fromCur === toCur ? (
          <p className="wide bad">نفس العملة: استعمل «تصفير الصندوق / تحويل».</p>
        ) : !rf || !rt ? (
          <p className="wide bad">ما في سعر {name(foreign)} مسجّل لهاليوم. سجّله أول.</p>
        ) : (
          <p className="wide muted">
            سعر اليوم: {foreign !== base ? `1 ${name(foreign)} = ${rateToInput(state, foreign, rate(foreign) ?? 0).toLocaleString('en')} ${state.currencies[base]?.symbol ?? base}` : ''}
            {effective !== null && Math.abs(effective - (rate(foreign) ?? 0)) > 1e-9 && <> — سعر هالصرف {rateToInput(state, foreign, effective).toLocaleString('en', { maximumFractionDigits: 4 })} (الفرق بيروح على فروقات الصرف)</>}
          </p>
        )}
        <div className="form-actions wide">
          <button className="primary big" disabled={!(amount > 0) || !(toAmount > 0) || fromCur === toCur} onClick={() => void save()}>
            صرف
          </button>
        </div>
      </div>
    </Modal>
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
  const [currency, setCurrency] = useState(() => negatives[0]?.[0] ?? box.currency ?? state.info!.baseCurrency);
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
