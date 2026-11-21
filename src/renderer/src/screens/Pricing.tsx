// «حاسبة التسعير»: من سعر الشراء (أو الكرتونة) + المصاريف + الربح اللي بدك ياه ← سعر البيع، والربح بالقطعة،
// ونسبة الربح من الكلفة ومن سعر البيع، والمقابل بالعملة التانية، وجدول جاهز لنسب الربح المعتادة. فيك تعتمد السعر للمادة.
import { useMemo, useState } from 'react';
import { findRate, itemCost, roundPrice, type Item } from '../../../core';
import { cleanNumber, money, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { CurrencySelect, Field, PageHeader, Picker, itemOptions } from '../components/ui';

type Mode = 'markup' | 'margin' | 'price';
const QUICK = [10, 15, 20, 25, 30, 40, 50, 100];
const STEPS = [0, 1, 5, 10, 25, 50, 100, 500, 1000];

/** رقم من نص (بالأرقام العربية كمان)، أو 0 */
const num = (t: string) => {
  const n = Number(cleanNumber(t));
  return Number.isFinite(n) ? n : 0;
};

/** الحساب كله بالوحدات الكبيرة (ليرة/دولار)؛ step = تقريب لفوق لأقرب كذا */
export function priceFrom(cost: number, mode: Mode, pct: number, target: number, step: number): number {
  let p = mode === 'markup' ? cost * (1 + pct / 100) : mode === 'margin' ? (pct < 100 ? cost / (1 - pct / 100) : 0) : target;
  if (step > 0 && p > 0) p = Math.ceil(p / step - 1e-9) * step;
  return Math.max(0, p);
}

export function Pricing() {
  const { state, can, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const costs = can('costs.view');
  const [cur, setCur] = useState(base);
  const [item, setItem] = useState<Item | null>(null);
  const [buy, setBuy] = useState('');
  const [carton, setCarton] = useState(false);
  const [pieces, setPieces] = useState('12');
  const [extraMode, setExtraMode] = useState<'amount' | 'percent'>('percent');
  const [extra, setExtra] = useState('');
  const [mode, setMode] = useState<Mode>('markup');
  const [pct, setPct] = useState('25');
  const [target, setTarget] = useState('');
  const [step, setStep] = useState(0);
  const dec = state.currencies[cur]?.decimals ?? 2;
  const toMinor = (major: number) => Math.round(major * 10 ** dec);
  const show = (major: number, c = cur) => money(state, Math.round(major * 10 ** (state.currencies[c]?.decimals ?? 2)), c);

  const per = carton ? Math.max(1, num(pieces)) : 1;
  const unitBuy = num(buy) / per;
  const unitCost = extraMode === 'percent' ? unitBuy * (1 + num(extra) / 100) : unitBuy + num(extra) / per;
  const price = priceFrom(unitCost, mode, num(pct), num(target), step);
  const profit = price - unitCost;
  const markup = unitCost > 0 ? (profit / unitCost) * 100 : 0;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  // المقابل بالعملة التانية (الدولار ↔ الأساسية) بسعر اليوم
  const other = cur === base ? (state.currencies.USD && findRate(state, 'USD', today()) ? 'USD' : null) : base;
  const rateOther = other ? (cur === base ? 1 / (findRate(state, 'USD', today()) ?? 1) : (findRate(state, cur, today()) ?? 0)) : 0;

  const pick = (id: string | null) => {
    const it = id ? state.items[id] : null;
    setItem(it ?? null);
    if (!it) return;
    setCarton(false);
    if (costs) {
      const c = itemCost(state, it.id);
      setCur(base);
      setBuy(c > 0 ? String(Math.round((c / 10 ** (state.currencies[base]?.decimals ?? 2)) * 1000) / 1000) : '');
    }
  };
  const options = useMemo(() => itemOptions(state, (i) => i.kind !== 'service'), [state]);
  const valid = unitCost > 0 && price > 0;

  return (
    <div className="page pricing">
      <PageHeader title="حاسبة التسعير" />
      <p className="muted">اكتب سعر الشراء والربح اللي بدك ياه، وبتطلعلك سعر البيع والربح بالقطعة. «بالمية من الكلفة» = الزيادة على سعر الشراء، و«بالمية من سعر البيع» = الهامش.</p>
      <div className="pricing-grid">
        <section className="card">
          <h3>الكلفة</h3>
          <div className="form-grid">
            <Field label="مادة (اختياري)" wide>
              <Picker options={options} value={item?.id ?? null} onChange={pick} placeholder="اختار مادة لتعبّي سعر شرائها…" />
            </Field>
            <Field label={carton ? 'سعر شراء الكرتونة' : 'سعر شراء القطعة'}>
              <input className="num-input" inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="0" />
            </Field>
            <Field label="العملة">
              <CurrencySelect value={cur} onChange={setCur} />
            </Field>
            <label className="check wide">
              <input type="checkbox" checked={carton} onChange={(e) => setCarton(e.target.checked)} /> السعر لكرتونة (أو ربطة)
            </label>
            {carton && (
              <Field label="كم قطعة بالكرتونة">
                <input className="num-input" inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} />
              </Field>
            )}
            <Field label="مصاريف إضافية (نقل، أجور…)">
              <span className="with-button">
                <input className="num-input" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
                <select value={extraMode} onChange={(e) => setExtraMode(e.target.value as 'amount' | 'percent')} aria-label="نوع المصاريف">
                  <option value="percent">%</option>
                  <option value="amount">مبلغ</option>
                </select>
              </span>
            </Field>
          </div>
          <h3>الربح</h3>
          <div className="segmented pricing-mode">
            {(
              [
                ['markup', 'بالمية من الكلفة'],
                ['margin', 'بالمية من سعر البيع'],
                ['price', 'سعر بيع بعرفه'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="form-grid">
            {mode === 'price' ? (
              <Field label="سعر البيع">
                <input className="num-input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" />
              </Field>
            ) : (
              <Field label="النسبة %">
                <input className="num-input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
              </Field>
            )}
            <Field label="تقريب السعر لفوق">
              <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
                {STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s ? `لأقرب ${s.toLocaleString('en')}` : 'بدون تقريب'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="card pricing-result">
          <h3>النتيجة {carton ? '(للقطعة)' : ''}</h3>
          <div className="pricing-big">
            <span>سعر البيع</span>
            <strong>{valid ? show(price) : '—'}</strong>
            {valid && other && rateOther > 0 && <small className="muted">≈ {show(price * rateOther, other)}</small>}
          </div>
          <dl className="pricing-facts">
            <dt>كلفة القطعة</dt>
            <dd>{unitCost > 0 ? show(unitCost) : '—'}</dd>
            <dt>الربح بالقطعة</dt>
            <dd className={profit < 0 ? 'bad' : 'good'}>{valid ? show(profit) : '—'}</dd>
            <dt>من الكلفة</dt>
            <dd>{valid ? `${markup.toFixed(1)}%` : '—'}</dd>
            <dt>من سعر البيع (الهامش)</dt>
            <dd>{valid ? `${margin.toFixed(1)}%` : '—'}</dd>
            {carton && (
              <>
                <dt>سعر الكرتونة</dt>
                <dd>{valid ? show(price * per) : '—'}</dd>
                <dt>ربح الكرتونة</dt>
                <dd>{valid ? show(profit * per) : '—'}</dd>
              </>
            )}
          </dl>
          {item && valid && (
            <div className="pricing-item">
              <small className="muted">
                سعرها الحالي: {money(state, item.price, item.priceCurrency)}
                {item.unit ? ` لكل ${item.unit}` : ''}
              </small>
              {can('items.manage') && (
                <button
                  className="primary small"
                  onClick={async () => {
                    const r = await call('saveItem', { ...item, price: roundPrice(toMinor(price)), priceCurrency: cur });
                    if (r !== null) {
                      notify(`صار سعر «${item.name}» ${show(price)}`);
                      setItem(state.items[item.id] ? { ...item, price: roundPrice(toMinor(price)), priceCurrency: cur } : null);
                    }
                  }}
                >
                  <Icon name="check" size={14} /> اعتمد السعر للمادة
                </button>
              )}
            </div>
          )}
          {unitCost > 0 && (
            <>
              <h4>نسب جاهزة</h4>
              <table className="table compact pricing-quick">
                <thead>
                  <tr>
                    <th>الربح من الكلفة</th>
                    <th className="num">سعر البيع</th>
                    <th className="num">الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {QUICK.map((q) => {
                    const p = priceFrom(unitCost, 'markup', q, 0, step);
                    return (
                      <tr
                        key={q}
                        className="clickable"
                        onClick={() => {
                          setMode('markup');
                          setPct(String(q));
                        }}
                      >
                        <td>{q}%</td>
                        <td className="num">{show(p)}</td>
                        <td className="num">{show(p - unitCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          {!unitCost && <p className="muted">اكتب سعر الشراء لتطلع النتيجة.</p>}
        </section>
      </div>
    </div>
  );
}
