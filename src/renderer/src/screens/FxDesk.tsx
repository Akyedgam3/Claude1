// «الصرافة»: نشرة أسعار شراء/مبيع، تصريف بحساب تلقائي (الزبون بيعطي ← بياخد)، صندوق لكل عملة،
// ربح فرق السعر لكل عملية ولكل يوم، وعمليات اليوم مع إلغاء وإيصال.
import { useMemo, useState } from 'react';
import { cashAccountFor, FX_SIDE_NAMES, fxBoardText, fxDaySummary, fxDealList, fxDealRate, fxQuote, type CompanyState, type FxBoardRate, type FxDeal } from '../../../core';
import { api, currencyName, dateText, inputToRate, money, parseAmount, rateToInput, toInput, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, PrintButtons } from '../components/print';
import { askConfirm, Empty, Field, Modal, PageHeader, Stat } from '../components/ui';

/** رصيد الصندوق بعملته */
function boxBalance(state: CompanyState, currency: string): number {
  const box = cashAccountFor(state, currency);
  let b = 0;
  for (const e of state.entries) for (const l of e.lines) if (l.accountId === box && l.currency === currency) b += l.debit - l.credit;
  return b;
}

const dec = (state: CompanyState, c: string) => state.currencies[c]?.decimals ?? 2;

export function FxDesk() {
  const { state, can, notify } = useCompany();
  const d = today();
  const base = state.info!.baseCurrency;
  const board = state.fxBoard;
  const [editBoard, setEditBoard] = useState(false);
  const [receipt, setReceipt] = useState<FxDeal | null>(null);
  const [day, setDay] = useState(d);
  const sum = fxDaySummary(state, day);
  const deals = useMemo(() => fxDealList(state).filter((x) => x.date === day), [state, day]);
  const currencies = [base, ...(board?.rates.map((r) => r.currency) ?? [])];
  const rateText = (c: string, r: number) => String(rateToInput(state, c, r));

  const shareBoard = async () => {
    const text = fxBoardText(state, rateText);
    if (!text) return notify('حط الأسعار بالنشرة أول', 'error');
    try {
      await api.whatsapp('', text);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <div className="page fx-desk">
      <PageHeader title="الصرافة">
        {board?.rates.length ? (
          <button className="whatsapp" onClick={() => void shareBoard()}>
            النشرة عالواتساب
          </button>
        ) : null}
        {can('fx.rates') && (
          <button className="primary" onClick={() => setEditBoard(true)}>
            {board?.rates.length ? 'تحديث الأسعار' : 'نشرة الأسعار'}
          </button>
        )}
      </PageHeader>

      {!board?.rates.length ? (
        <Empty>{can('fx.rates') ? 'ابدأ بنشرة الأسعار: سعر الشراء والمبيع لكل عملة (دولار، يورو، تركي...). بعدها التصريف بيحسب لحالو.' : 'لسا ما في نشرة أسعار.'}</Empty>
      ) : (
        <>
          <div className={`fx-board ${board.date < d ? 'old' : ''}`}>
            {board.rates.map((r) => (
              <div key={r.currency} className="fx-rate-card">
                <b>{currencyName(state, r.currency)}</b>
                <div>
                  <span>شراء</span>
                  <strong className="ltr">{rateText(r.currency, r.buy)}</strong>
                </div>
                <div>
                  <span>مبيع</span>
                  <strong className="ltr">{rateText(r.currency, r.sell)}</strong>
                </div>
                <small className="muted">بالصندوق: {money(state, boxBalance(state, r.currency), r.currency)}</small>
              </div>
            ))}
            <div className="fx-rate-card cash">
              <b>{currencyName(state, base)}</b>
              <small className="muted">بالصندوق</small>
              <strong>{money(state, boxBalance(state, base), base)}</strong>
              <small className={board.date < d ? 'bad' : 'muted'}>النشرة: {board.date === d ? 'اليوم' : dateText(board.date)}</small>
            </div>
          </div>

          {can('fx.manage') && <Exchange currencies={currencies} onDone={setReceipt} />}
        </>
      )}

      <div className="toolbar">
        <h3>عمليات {day === d ? 'اليوم' : dateText(day)}</h3>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value || d)} />
      </div>
      <div className="stats">
        <Stat label="العمليات" value={String(sum.deals)} />
        {can('profits.view') && <Stat label="ربح فرق السعر" value={money(state, sum.profit)} tone={sum.profit >= 0 ? 'good' : 'bad'} />}
        <Stat
          label="اشترينا"
          value={
            Object.entries(sum.bought)
              .filter(([c]) => c !== base)
              .map(([c, v]) => money(state, v, c))
              .join(' + ') || '—'
          }
        />
        <Stat
          label="بعنا"
          value={
            Object.entries(sum.sold)
              .filter(([c]) => c !== base)
              .map(([c, v]) => money(state, v, c))
              .join(' + ') || '—'
          }
        />
      </div>
      {deals.length === 0 ? (
        <Empty>ما في عمليات بهاليوم</Empty>
      ) : (
        <table className="table fx-deals">
          <thead>
            <tr>
              <th>#</th>
              <th>العملية</th>
              <th>أخدنا</th>
              <th>عطينا</th>
              <th>السعر</th>
              {can('profits.view') && <th className="num">الربح</th>}
              <th>الزبون</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((x) => (
              <tr key={x.id} className={x.voided ? 'voided' : ''}>
                <td>{x.number}</td>
                <td>
                  <span className={`tag ${x.side === 'buy' ? 'good' : x.side === 'sell' ? 'warn' : ''}`}>{x.voided ? 'ملغاة' : FX_SIDE_NAMES[x.side]}</span>
                </td>
                <td>
                  <span className="ltr">{money(state, x.give.amount, x.give.currency)}</span>
                </td>
                <td>
                  <span className="ltr">{money(state, x.take.amount, x.take.currency)}</span>
                </td>
                <td>
                  <span className="ltr">{Math.round(fxDealRate(x, (c) => dec(state, c)) * 10000) / 10000}</span>
                </td>
                {can('profits.view') && <td className="num">{money(state, x.profit)}</td>}
                <td>{x.customer ?? (x.partyId ? state.parties[x.partyId]?.name : '') ?? ''}</td>
                <td className="row-actions">
                  <button className="ghost small" onClick={() => setReceipt(x)}>
                    إيصال
                  </button>
                  {!x.voided && can('sales.void') && <VoidDeal deal={x} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editBoard && <BoardForm onClose={() => setEditBoard(false)} />}
      {receipt && <FxReceipt deal={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function VoidDeal({ deal }: { deal: FxDeal }) {
  const { call, notify } = useCompany();
  return (
    <button
      className="ghost small danger"
      onClick={async () => {
        if (!(await askConfirm(`إلغاء عملية الصرافة رقم ${deal.number}؟ المصاري بترجع للصناديق متل ما كانت.`))) return;
        if ((await call('voidFx', deal.id, today())) !== null) notify('انلغت العملية');
      }}
    >
      إلغاء
    </button>
  );
}

/** الزبون بيعطي ← بياخد: بتكتب بأي خانة والتانية بتنحسب من النشرة، والسعر بينعدّل إذا اتفقتوا على غيره */
function Exchange({ currencies, onDone }: { currencies: string[]; onDone: (d: FxDeal) => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const foreign = currencies.find((c) => c !== base) ?? base;
  const [give, setGive] = useState({ currency: foreign, text: '' });
  const [take, setTake] = useState({ currency: base, text: '' });
  const [rateText, setRateText] = useState('');
  const [customer, setCustomer] = useState('');
  const [idNo, setIdNo] = useState('');
  const [busy, setBusy] = useState(false);

  const toMinor = (c: string, t: string) => {
    try {
      return t.trim() ? parseAmount(state, t, c) : 0;
    } catch {
      return 0;
    }
  };
  const minorToMajor = (c: string, v: number) => v / 10 ** dec(state, c);
  const majorToText = (c: string, v: number) => toInput(state, Math.round(v * 10 ** dec(state, c)), c);
  const q = fxQuote(state, give.currency, take.currency, 1);
  // السعر المعروض بالشراء والمبيع: كم عملة أساسية بالوحدة الأجنبية
  const side = give.currency !== base && take.currency === base ? 'buy' : give.currency === base && take.currency !== base ? 'sell' : 'cross';
  const showRate = (r: number) => (side === 'sell' ? 1 / r : r);
  const shownCurrency = side === 'sell' ? take.currency : give.currency;
  const defaultShown = q ? showRate(q.rate) : 0;
  const typedRate = Number(rateText.replace(/,/g, ''));
  const userRate = rateText.trim() && typedRate > 0 ? (side === 'cross' ? typedRate : inputToRate(state, shownCurrency, typedRate)) : null;
  const rate = userRate !== null ? (side === 'sell' ? 1 / userRate : userRate) : (q?.rate ?? 0); // take لكل give

  const fromGive = (t: string, g = give.currency, tk = take.currency, r = rate) => {
    setGive({ currency: g, text: t });
    const v = minorToMajor(g, toMinor(g, t));
    setTake({ currency: tk, text: v && r ? majorToText(tk, v * r) : '' });
  };
  const fromTake = (t: string) => {
    setTake({ ...take, text: t });
    const v = minorToMajor(take.currency, toMinor(take.currency, t));
    setGive({ ...give, text: v && rate ? majorToText(give.currency, v / rate) : '' });
  };
  const giveMinor = toMinor(give.currency, give.text);
  const takeMinor = toMinor(take.currency, take.text);
  const available = (() => {
    const box = cashAccountFor(state, take.currency);
    let b = 0;
    for (const e of state.entries) for (const l of e.lines) if (l.accountId === box && l.currency === take.currency) b += l.debit - l.credit;
    return b;
  })();
  const short = takeMinor > 0 && takeMinor > available;

  return (
    <section className="card fx-exchange">
      <div className="fx-sides">
        <div className="fx-side give">
          <label>الزبون بيعطي</label>
          <div className="fx-amount">
            <input className="num-input big" inputMode="decimal" value={give.text} onChange={(e) => fromGive(e.target.value)} placeholder="0" autoFocus />
            <select value={give.currency} onChange={(e) => fromGive(give.text, e.target.value, e.target.value === take.currency ? give.currency : take.currency)}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {currencyName(state, c)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="icon fx-swap"
          title="اقلب"
          onClick={() => {
            setRateText('');
            const g = take.currency;
            const tk = give.currency;
            const r = fxQuote(state, g, tk, 1)?.rate ?? 0;
            setTake({ currency: tk, text: '' });
            fromGive(take.text, g, tk, r);
          }}
        >
          <Icon name="transfer" size={20} />
        </button>
        <div className="fx-side take">
          <label>الزبون بياخد</label>
          <div className="fx-amount">
            <input className="num-input big" inputMode="decimal" value={take.text} onChange={(e) => fromTake(e.target.value)} placeholder="0" />
            <select
              value={take.currency}
              onChange={(e) => {
                const tk = e.target.value;
                const g = tk === give.currency ? take.currency : give.currency;
                setRateText('');
                fromGive(give.text, g, tk, fxQuote(state, g, tk, 1)?.rate ?? 0);
              }}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {currencyName(state, c)}
                </option>
              ))}
            </select>
          </div>
          {short && <small className="bad">بالصندوق {money(state, available, take.currency)} بس</small>}
        </div>
      </div>
      <div className="fx-meta">
        <Field label={side === 'cross' ? `السعر (${currencyName(state, take.currency)} بالـ${currencyName(state, give.currency)})` : `السعر (${FX_SIDE_NAMES[side]} ${currencyName(state, shownCurrency)})`}>
          <input
            className="num-input"
            inputMode="decimal"
            value={rateText}
            placeholder={defaultShown ? String(side === 'cross' ? Math.round(defaultShown * 10000) / 10000 : rateToInput(state, shownCurrency, defaultShown)) : ''}
            onChange={(e) => {
              setRateText(e.target.value);
              const tr = Number(e.target.value.replace(/,/g, ''));
              const ur = e.target.value.trim() && tr > 0 ? (side === 'cross' ? tr : inputToRate(state, shownCurrency, tr)) : null;
              const r = ur !== null ? (side === 'sell' ? 1 / ur : ur) : (q?.rate ?? 0);
              fromGive(give.text, give.currency, take.currency, r);
            }}
          />
        </Field>
        <Field label="الزبون (اختياري)">
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </Field>
        <Field label="رقم الهوية (اختياري)">
          <input value={idNo} onChange={(e) => setIdNo(e.target.value)} dir="ltr" />
        </Field>
        <button
          className="primary big"
          disabled={busy || !(giveMinor > 0 && takeMinor > 0) || give.currency === take.currency}
          onClick={async () => {
            setBusy(true);
            const r = ((await call('postFx', { date: today(), give: { currency: give.currency, amount: giveMinor }, take: { currency: take.currency, amount: takeMinor }, ...(customer.trim() ? { customer } : {}), ...(idNo.trim() ? { idNo } : {}) })) as { value: FxDeal } | null)?.value;
            setBusy(false);
            if (r) {
              notify(`تمت العملية رقم ${r.number}`);
              setGive({ ...give, text: '' });
              setTake({ ...take, text: '' });
              setRateText('');
              setCustomer('');
              setIdNo('');
              onDone(r);
            }
          }}
        >
          تنفيذ
        </button>
      </div>
    </section>
  );
}

function BoardForm({ onClose }: { onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const existing = state.fxBoard?.rates ?? [];
  const all = Object.values(state.currencies).filter((c) => c.code !== base);
  const [rows, setRows] = useState(() =>
    all.map((c) => {
      const r = existing.find((x) => x.currency === c.code);
      return { currency: c.code, on: !!r || (!existing.length && c.code === 'USD'), buy: r ? String(rateToInput(state, c.code, r.buy)) : '', sell: r ? String(rateToInput(state, c.code, r.sell)) : '' };
    }),
  );
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Modal title="نشرة الأسعار" onClose={onClose}>
      <form
        className="fx-board-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const rates: FxBoardRate[] = [];
          for (const r of rows.filter((x) => x.on)) {
            const b = Number(r.buy.replace(/,/g, ''));
            const s = Number(r.sell.replace(/,/g, ''));
            if (!(b > 0 && s > 0)) return notify(`اكتب الشراء والمبيع لـ${currencyName(state, r.currency)}`, 'error');
            const buy = inputToRate(state, r.currency, b);
            const sell = inputToRate(state, r.currency, s);
            rates.push({ currency: r.currency, buy: Math.min(buy, sell), sell: Math.max(buy, sell) });
          }
          if (!rates.length) return notify('اختار عملة وحدة عالأقل', 'error');
          if ((await call('saveFxBoard', rates, today())) !== null) {
            notify('انحفظت النشرة، وصار سعر الصرف بالبرنامج = الوسط');
            onClose();
          }
        }}
      >
        <p className="muted">السعر = كم {currencyName(state, base)} بالوحدة. الشراء = بقديش منشتري من الزبون، والمبيع = بقديش منبيعه. لعملة جديدة (تركي، ريال...): الإعدادات ← العملات.</p>
        <table className="table">
          <thead>
            <tr>
              <th>العملة</th>
              <th>شراء</th>
              <th>مبيع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.currency}>
                <td>
                  <label className="check">
                    <input type="checkbox" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} />
                    {currencyName(state, r.currency)}
                  </label>
                </td>
                <td>
                  <input className="num-input" inputMode="decimal" disabled={!r.on} value={r.buy} onChange={(e) => set(i, { buy: e.target.value })} />
                </td>
                <td>
                  <input className="num-input" inputMode="decimal" disabled={!r.on} value={r.sell} onChange={(e) => set(i, { sell: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ النشرة</button>
        </div>
      </form>
    </Modal>
  );
}

function FxReceipt({ deal, onClose }: { deal: FxDeal; onClose: () => void }) {
  const { state } = useCompany();
  const info = state.info!;
  return (
    <Modal title={`إيصال صرافة رقم ${deal.number}`} onClose={onClose}>
      <div className="print-area fx-receipt">
        <DocHeader title={`إيصال صرافة رقم ${deal.number}`} />
        <div className="fx-receipt-body">
          <div>
            <span>التاريخ</span>
            <b>
              {dateText(deal.date)} {new Date(deal.createdAt).toLocaleTimeString('ar-SY-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
            </b>
          </div>
          <div>
            <span>العملية</span>
            <b>{FX_SIDE_NAMES[deal.side]}</b>
          </div>
          <div>
            <span>استلمنا من الزبون</span>
            <b className="ltr">{money(state, deal.give.amount, deal.give.currency)}</b>
          </div>
          <div>
            <span>سلّمنا للزبون</span>
            <b className="ltr">{money(state, deal.take.amount, deal.take.currency)}</b>
          </div>
          <div>
            <span>السعر</span>
            <b className="ltr">{Math.round(fxDealRate(deal, (c) => dec(state, c)) * 10000) / 10000}</b>
          </div>
          {(deal.customer || deal.idNo) && (
            <div>
              <span>الزبون</span>
              <b>{[deal.customer, deal.idNo].filter(Boolean).join(' · ')}</b>
            </div>
          )}
          {deal.voided && <div className="bad">ملغاة</div>}
        </div>
        <p className="fx-receipt-foot">{info.print?.footer || 'شكراً لتعاملكم معنا'}</p>
      </div>
      <div className="form-actions">
        <PrintButtons kind="invoice" name={`صرافة ${deal.number}`} />
      </div>
    </Modal>
  );
}
