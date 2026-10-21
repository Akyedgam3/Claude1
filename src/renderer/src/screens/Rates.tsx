import { useState } from 'react';
import { findRate, type Currency, type RateKind } from '../../../core';
import { dateText, inputToRate, rateInverted, rateLine, rateQuestion, rateToInput, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { Empty, Field, Modal, PageHeader } from '../components/ui';

/** العملات وأسعار الصرف: الليرة والدولار جاهزين، والمستخدم بيضيف أي عملة تانية باسمها وسعرها. */
export function Rates() {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const others = Object.values(state.currencies).filter((c) => c.code !== base);
  const [picked, setPicked] = useState(() => (others.find((c) => c.code === 'USD') ?? others[0])?.code ?? '');
  const foreign = state.currencies[picked] ? picked : (others[0]?.code ?? '');
  const [date, setDate] = useState(today());
  const [market, setMarket] = useState('');
  const [official, setOfficial] = useState('');
  const [editing, setEditing] = useState<Currency | 'new' | null>(null);
  const history = state.rates.filter((r) => r.currency === foreign).sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind)).slice(0, 300);
  const current = foreign ? findRate(state, foreign, today()) : undefined;
  const cur = state.currencies[foreign];
  const shown = (r: number | undefined) => (r ? rateToInput(state, foreign, r) : undefined);

  const save = async () => {
    let saved = 0;
    for (const [kind, v] of [['market', market], ['official', official]] as [RateKind, string][]) {
      const n = Number(v);
      if (!v.trim()) continue;
      if (!(n > 0)) return notify('سعر غير صالح', 'error');
      if (await call('setRate', { date, currency: foreign, kind, rate: inputToRate(state, foreign, n) })) saved++;
    }
    if (saved) {
      notify('تم حفظ السعر');
      setMarket('');
      setOfficial('');
    }
  };

  return (
    <div className="page">
      <PageHeader title="العملات وأسعار الصرف">
        <button onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> إضافة عملة
        </button>
      </PageHeader>

      {others.length > 1 && (
        <div className="segmented cur-tabs">
          {others.map((c) => (
            <button key={c.code} className={c.code === foreign ? 'active' : ''} onClick={() => setPicked(c.code)}>
              {c.nameAr} <small className="muted">{c.symbol}</small>
              {c.hidden && <small className="muted"> (مخفية)</small>}
            </button>
          ))}
        </div>
      )}

      {cur && (
        <>
          <div className="stats">
            <div className="stat">
              <span>سعر السوق الحالي — {cur.nameAr}</span>
              <strong>{current ? rateLine(state, foreign, current) : 'غير مسجّل'}</strong>
            </div>
          </div>
          <section className="card">
            <div className="row-between">
              <p className="muted">
                {rateQuestion(state, foreign)}. الفواتير والسندات تستخدم سعر السوق المسجّل بتاريخها أو قبله. فيك تبيع وتسعّر بأي عملة: كل مادة إلها «عملة السعر»، وكل فاتورة أو بيعة بالكاشير بتختار عملتها.
              </p>
              {can('rates.manage') && (
                <button className="ghost" onClick={() => setEditing(cur)}>
                  <Icon name="customize" size={16} /> تعديل العملة
                </button>
              )}
            </div>
            <form
              className="form-grid four"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <Field label="التاريخ">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="سعر السوق (المستخدم في الفواتير)">
                <input value={market} placeholder={String(shown(findRate(state, foreign, date, 'market')) ?? '')} onChange={(e) => setMarket(e.target.value)} inputMode="decimal" autoFocus />
              </Field>
              <Field label="السعر الرسمي (للمرجعية)">
                <input value={official} placeholder={String(shown(findRate(state, foreign, date, 'official')) ?? '')} onChange={(e) => setOfficial(e.target.value)} inputMode="decimal" />
              </Field>
              <div className="form-actions">
                <button className="primary">حفظ</button>
              </div>
            </form>
          </section>
          <section className="card">
            <h3>السجل</h3>
            {history.length === 0 ? (
              <Empty>لم تُسجّل أسعار بعد</Empty>
            ) : (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th className="num">السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={`${r.date}-${r.kind}`}>
                      <td>{dateText(r.date)}</td>
                      <td>{r.kind === 'market' ? 'سوق' : 'رسمي'}</td>
                      <td className="num">{shown(r.rate)!.toLocaleString('en')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {editing && (
        <CurrencyForm
          currency={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(code) => {
            setPicked(code);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

const SUGGESTED: { code: string; nameAr: string; symbol: string }[] = [
  { code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺' },
  { code: 'EUR', nameAr: 'يورو', symbol: '€' },
  { code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س' },
  { code: 'AED', nameAr: 'درهم إماراتي', symbol: 'د.إ' },
  { code: 'JOD', nameAr: 'دينار أردني', symbol: 'د.أ' },
  { code: 'LBP', nameAr: 'ليرة لبنانية', symbol: 'ل.ل' },
  { code: 'IQD', nameAr: 'دينار عراقي', symbol: 'د.ع' },
  { code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م' },
];

function CurrencyForm({ currency, onClose, onSaved }: { currency: Currency | null; onClose: () => void; onSaved: (code: string) => void }) {
  const { state, call, notify } = useCompany();
  const base = state.currencies[state.info!.baseCurrency]!;
  const isNew = !currency;
  const [f, setF] = useState({
    code: currency?.code ?? '',
    nameAr: currency?.nameAr ?? '',
    symbol: currency?.symbol ?? '',
    decimals: String(currency?.decimals ?? 2),
    inverted: currency ? rateInverted(state, currency.code) : false,
    hidden: !!currency?.hidden,
    rate: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const name = f.nameAr.trim() || 'العملة';
  const sym = f.symbol.trim() || f.code || '؟';
  const suggestions = SUGGESTED.filter((s) => !state.currencies[s.code]);

  const save = async () => {
    const code = f.code.trim().toUpperCase();
    if (isNew && state.currencies[code]) return notify('في عملة بنفس الرمز', 'error');
    const rate = Number(f.rate);
    if (f.rate.trim() && !(rate > 0)) return notify('سعر غير صالح', 'error');
    setBusy(true);
    try {
      const res = await call('saveCurrency', { code, nameAr: f.nameAr, symbol: f.symbol, decimals: Number(f.decimals), rateInverted: f.inverted, hidden: f.hidden });
      if (!res) return;
      if (rate > 0) await call('setRate', { date: today(), currency: code, kind: 'market', rate: f.inverted ? 1 / rate : rate });
      notify(isNew ? `تمت إضافة ${f.nameAr.trim()}` : 'تم حفظ العملة');
      onSaved(code);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'إضافة عملة' : `تعديل ${currency!.nameAr}`} onClose={onClose}>
      {isNew && suggestions.length > 0 && (
        <div className="quick-cur">
          <span className="muted">اختيار سريع:</span>
          {suggestions.map((s) => (
            <button key={s.code} type="button" onClick={() => setF({ ...f, ...s })}>
              {s.nameAr}
            </button>
          ))}
        </div>
      )}
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="اسم العملة">
          <input value={f.nameAr} onChange={set('nameAr')} placeholder="ليرة تركية" autoFocus={isNew} maxLength={40} />
        </Field>
        <Field label="الرمز على الفواتير">
          <input value={f.symbol} onChange={set('symbol')} placeholder="₺" maxLength={8} />
        </Field>
        <Field label="الرمز الدولي (أحرف إنكليزية)">
          <input dir="ltr" className="mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="TRY" maxLength={8} disabled={!isNew} />
        </Field>
        <Field label="المنازل العشرية">
          <select value={f.decimals} onChange={set('decimals')} disabled={!isNew}>
            <option value="0">بدون كسور (0)</option>
            <option value="2">قرشين (0.00)</option>
            <option value="3">3 منازل (0.000)</option>
          </select>
        </Field>
        <Field label="طريقة كتابة السعر" wide>
          <div className="segmented">
            <button type="button" className={!f.inverted ? 'active' : ''} onClick={() => setF({ ...f, inverted: false })}>
              1 {sym} = ؟ {base.symbol}
            </button>
            <button type="button" className={f.inverted ? 'active' : ''} onClick={() => setF({ ...f, inverted: true })}>
              1 {base.symbol} = ؟ {sym}
            </button>
          </div>
        </Field>
        <Field label={f.inverted ? `كم ${name} يساوي 1 ${base.nameAr}` : `كم ${base.nameAr} يساوي 1 ${name}`} wide>
          <input value={f.rate} onChange={set('rate')} inputMode="decimal" placeholder={isNew ? 'سعر اليوم (اختياري، بتقدر تسجّله بعدين)' : 'سعر جديد لليوم (اختياري)'} />
        </Field>
        {!isNew && (
          <label className="check wide">
            <input type="checkbox" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} />
            إخفاء العملة من قوائم الاختيار (الحركات القديمة بتضل متل ما هي)
          </label>
        )}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy || !f.nameAr.trim() || !f.symbol.trim() || f.code.length < 2}>
            حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}
