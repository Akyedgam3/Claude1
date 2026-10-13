import { useEffect, useMemo, useRef, useState } from 'react';
import { findRate, resolveScan, type Invoice, type Item } from '../../../core';
import { convertPrice, money, parseAmount, qtyText, today, toInput, uid, useCompany } from '../api';
import { usePrinter } from '../components/print';
import { matches, partyOptions, Picker, ScanInput } from '../components/ui';
import { InvoiceDocument } from './InvoiceView';
import { itemPrice } from './InvoiceEditor';
import { Icon } from '../components/icons';

interface CartLine {
  key: string;
  itemId: string;
  unit: string;
  qty: number;
  price: number; // بعملة الفاتورة
  serials: string[];
  note?: string;
}

/** فاتورة معلّقة: زبون عم ينقّي، فبنخدم غيره وبنرجعله. */
interface Held {
  id: string;
  at: string;
  cart: CartLine[];
  partyId: string | null;
}

const WEIGHT_UNIT = /كيلو|كغ|kg/i;
const WEIGHTS: [string, number][] = [
  ['¼', 0.25],
  ['½', 0.5],
  ['¾', 0.75],
  ['1', 1],
  ['2', 2],
];

/** شاشة البيع السريع للكاشير. */
export function Pos() {
  const { state, call, notify, can, user, profile } = useCompany();
  const base = state.info!.baseCurrency;
  const printer = usePrinter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [received, setReceived] = useState('');
  const [discount, setDiscount] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [last, setLast] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [amountFor, setAmountFor] = useState<string | null>(null);
  const party = partyId ? state.parties[partyId] : null;

  // الفواتير المعلّقة محفوظة على هالجهاز بس، حتى ما تضيع إذا انسكرت الشاشة
  const heldKey = `mizan.pos.held.${state.info?.name ?? ''}`;
  const [held, setHeld] = useState<Held[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(heldKey) ?? '[]') as Held[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(heldKey, JSON.stringify(held));
    } catch {
      // التخزين مش متاح: بتضل بالذاكرة بس
    }
  }, [held, heldKey]);

  // الأكثر مبيعاً بآخر شهرين بيطلع أول
  const popularity = useMemo(() => {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const n: Record<string, number> = {};
    for (const inv of state.invoices) {
      if (inv.kind !== 'sale' || inv.voidEntryId || inv.date < since) continue;
      for (const l of inv.lines) if (l.itemId) n[l.itemId] = (n[l.itemId] ?? 0) + 1;
    }
    return n;
  }, [state.invoices]);
  const sellable = useMemo(
    () => Object.values(state.items).filter((i) => !i.archived && (i.price > 0 || i.units?.some((u) => (u.price ?? 0) > 0))),
    [state.items],
  );
  const categories = useMemo(() => [...new Set(sellable.map((i) => i.category).filter(Boolean))] as string[], [sellable]);
  const grid = useMemo(
    () =>
      sellable
        .filter((i) => (!category || i.category === category) && matches(query, i.name, i.code, i.barcode))
        .sort((a, b) => (popularity[b.id] ?? 0) - (popularity[a.id] ?? 0))
        .slice(0, 60),
    [sellable, category, query, popularity],
  );
  const inCart = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of cart) m[l.itemId] = (m[l.itemId] ?? 0) + 1;
    return m;
  }, [cart]);

  /** السعر بعملة الشركة، أو null إن كانت المادة مسعّرة بالدولار ولا يوجد سعر صرف. */
  const priceOf = (item: Item, unit = ''): number | null => {
    const text = itemPrice(state, item, { party, unit, currency: base, date: today() });
    return text ? parseAmount(state, text, base) : null;
  };
  const scanRef = useRef<HTMLInputElement>(null);
  const refocus = () => setTimeout(() => scanRef.current?.focus(), 0);

  const add = (item: Item, opts: { unit?: string; qty?: number; price?: number; serial?: string } = {}) => {
    const unit = opts.unit ?? '';
    const price = opts.price ?? priceOf(item, unit);
    refocus();
    if (price === null) return notify(`سجّل سعر الدولار اليوم أولاً — سعر "${item.name}" بالدولار`, 'error');
    setCart((c) => {
      if (opts.serial) {
        if (c.some((l) => l.serials.includes(opts.serial!))) {
          notify(`الجهاز ${opts.serial} موجود بالسلة`, 'error');
          return c;
        }
        // جهاز بنفس الصنف بدون رقم بعد: منعبّي رقمه بدل ما نفتح سطر جديد
        const empty = c.find((l) => l.itemId === item.id && l.serials.length < l.qty);
        if (empty) return c.map((l) => (l === empty ? { ...l, serials: [...l.serials, opts.serial!] } : l));
        return [...c, { key: uid(), itemId: item.id, unit, qty: 1, price, serials: [opts.serial] }];
      }
      const same = !opts.qty && !item.trackSerial && c.find((l) => l.itemId === item.id && l.unit === unit && !l.note);
      if (same) return c.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: uid(), itemId: item.id, unit, qty: opts.qty ?? 1, price, serials: [] }];
    });
  };
  const setLine = (key: string, patch: Partial<CartLine>) => setCart((c) => c.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const scan = (code: string) => {
    const r = resolveScan(state, code);
    if (!r) return notify(`لا توجد مادة بالرمز ${code}`, 'error');
    // سعر باركود الميزان بعملة سعر المادة؛ نحوّله لعملة الشركة
    let price: number | undefined;
    if (r.price !== undefined) {
      const v = convertPrice(state, r.price, r.item.priceCurrency, base, { [base]: 1, USD: findRate(state, 'USD', today()) ?? 0 });
      if (v === null) return notify('سجّل سعر الدولار اليوم أولاً', 'error');
      price = v;
    }
    add(r.item, { ...(r.unit ? { unit: r.unit } : {}), ...(r.qty ? { qty: r.qty } : {}), ...(price !== undefined ? { price } : {}), ...(r.serial ? { serial: r.serial } : {}) });
  };

  const subtotal = cart.reduce((s, l) => s + Math.round(l.qty * l.price), 0);
  let disc = 0;
  try {
    disc = parseAmount(state, discount, base);
  } catch {
    disc = 0;
  }
  const taxes = Object.values(state.taxes).filter((t) => t.active && t.percent > 0);
  const net = subtotal - disc;
  const total = net + taxes.reduce((s, t) => s + Math.round((net * t.percent) / 100), 0);
  let receivedMinor = 0;
  try {
    receivedMinor = received ? parseAmount(state, received, base) : total;
  } catch {
    receivedMinor = 0;
  }
  const change = receivedMinor - total;

  // أزرار المبلغ المستلم: المضبوط، وأقرب مبالغ مدوّرة فوقه
  const cashSteps = useMemo(() => {
    if (total <= 0) return [];
    const unit = 10 ** (state.currencies[base]?.decimals ?? 0);
    const out: number[] = [];
    for (const step of [100, 500, 1000, 5000, 10000]) {
      const v = Math.ceil(total / (step * unit)) * step * unit;
      if (v > total && !out.includes(v)) out.push(v);
      if (out.length >= 3) break;
    }
    return out;
  }, [total, base, state.currencies]);

  const pay = async (credit: boolean) => {
    if (!cart.length || busy) return;
    if (credit && !partyId) return notify('اختر العميل للبيع بالدين', 'error');
    if (!credit && change < 0) return notify('المبلغ المستلم أقل من الإجمالي', 'error');
    setBusy(true);
    const res = await call<Invoice>('postInvoice', {
      kind: 'sale',
      date: today(),
      partyId,
      lines: cart.map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        price: l.price,
        ...(l.unit ? { unit: l.unit } : {}),
        ...(l.serials.length ? { serials: l.serials } : {}),
        ...(l.note?.trim() ? { note: l.note.trim() } : {}),
      })),
      ...(disc ? { discount: disc } : {}),
      taxIds: taxes.map((t) => t.id),
      paid: credit ? Math.min(Math.max(0, received ? receivedMinor : 0), total) : total,
      notes: 'نقطة البيع',
    });
    setBusy(false);
    if (!res) return;
    setLast(res.value);
    setCart([]);
    setNoteFor(null);
    setAmountFor(null);
    refocus();
    setReceived('');
    setDiscount('');
    setPartyId(null);
    notify(change > 0 && !credit ? `تم البيع — الباقي للزبون: ${money(state, change)}` : 'تم البيع');
    if (autoPrint) setTimeout(() => void printer.print('receipt'), 50);
  };

  const hold = () => {
    if (!cart.length) return;
    setHeld((h) => [...h, { id: uid(), at: new Date().toISOString(), cart, partyId }]);
    setCart([]);
    setPartyId(null);
    setReceived('');
    setDiscount('');
    setNoteFor(null);
    notify('انعلّقت الفاتورة، فيك ترجعلها من فوق');
    refocus();
  };
  const resume = (h: Held) => {
    setHeld((list) => [...list.filter((x) => x.id !== h.id), ...(cart.length ? [{ id: uid(), at: new Date().toISOString(), cart, partyId }] : [])]);
    setCart(h.cart);
    setPartyId(h.partyId && state.parties[h.partyId] ? h.partyId : null);
    setReceived('');
    refocus();
  };

  const todaySales = state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date === today() && i.createdBy === user.id);
  const quickNotes = profile.quickNotes ?? [];

  return (
    <div className="pos">
      <div className="pos-products">
        <div className="pos-search">
          <ScanInput onScan={scan} placeholder="امسح الباركود أو باركود الميزان..." autoFocus inputRef={scanRef} />
          <input placeholder="بحث بالاسم..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {categories.length > 0 && (
          <div className="pos-cats">
            <button className={!category ? 'active' : ''} onClick={() => setCategory('')}>
              الكل
            </button>
            {categories.map((c) => (
              <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="pos-grid">
          {grid.map((i) => {
            const p = i.price > 0 ? priceOf(i) : null;
            return (
              <div key={i.id} className="pos-tile">
                <button className={`pos-item ${inCart[i.id] ? 'in-cart' : ''}`} onClick={() => (i.price > 0 ? add(i) : i.units?.[0] && add(i, { unit: i.units[0].name }))}>
                  {inCart[i.id] ? <span className="badge">{inCart[i.id]}</span> : null}
                  <strong>{i.name}</strong>
                  <span>{i.price > 0 ? (p === null ? 'لا يوجد سعر دولار' : `${money(state, p)} / ${i.unit}`) : ''}</span>
                  {i.kind === 'stock' && (
                    <small>
                      {qtyText(state.stock[i.id]?.totalQty ?? 0)} {i.unit}
                    </small>
                  )}
                </button>
                {!!i.units?.length && (
                  <div className="unit-chips">
                    {i.units.slice(0, 4).map((u) => {
                      const up = priceOf(i, u.name);
                      return (
                        <button key={u.name} onClick={() => add(i, { unit: u.name })} title={`${u.name}${up !== null ? ' — ' + money(state, up) : ''}`}>
                          {u.name}
                          {up !== null && <small>{money(state, up)}</small>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pos-cart card">
        {held.length > 0 && (
          <div className="held-bar">
            <span className="muted">معلّقة:</span>
            {held.map((h, n) => (
              <button key={h.id} className="held-chip" onClick={() => resume(h)} title="رجّع هالفاتورة">
                <Icon name="receipt" size={14} /> {h.partyId && state.parties[h.partyId] ? state.parties[h.partyId]!.name : `#${n + 1}`} · {h.cart.length}
              </button>
            ))}
          </div>
        )}
        <div className="with-button">
          <Picker options={partyOptions(state, 'customer')} value={partyId} onChange={setPartyId} placeholder="زبون نقدي" />
          {partyId && (
            <button className="icon" onClick={() => setPartyId(null)}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="pos-lines">
          {cart.length === 0 && <p className="muted center">السلة فارغة</p>}
          {cart.map((l) => {
            const item = state.items[l.itemId]!;
            const weighed = !l.unit && WEIGHT_UNIT.test(item.unit);
            const notes = (l.note ?? '').split('،').map((x) => x.trim()).filter(Boolean);
            const toggleNote = (n: string) => setLine(l.key, { note: (notes.includes(n) ? notes.filter((x) => x !== n) : [...notes, n]).join('، ') });
            return (
              <div key={l.key} className="pos-line-wrap">
                <div className="pos-line">
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {money(state, l.price)} / {l.unit || item.unit}
                      {l.note ? <em className="line-note"> · {l.note}</em> : null}
                    </small>
                    {item.trackSerial && (
                      <input className="mono" placeholder="IMEI / الرقم التسلسلي" value={l.serials.join(' ')} onChange={(e) => setLine(l.key, { serials: e.target.value.split(/\s+/).filter(Boolean) })} />
                    )}
                  </div>
                  <div className="qty-box">
                    <button onClick={() => setCart(l.qty <= 1 ? cart.filter((x) => x.key !== l.key) : cart.map((x) => (x.key === l.key ? { ...x, qty: x.qty - 1 } : x)))}>−</button>
                    <QtyInput value={l.qty} onChange={(q) => setCart((c) => (q > 0 ? c.map((x) => (x.key === l.key ? { ...x, qty: q } : x)) : c))} />
                    <button onClick={() => setLine(l.key, { qty: l.qty + 1 })}>+</button>
                  </div>
                  <strong className="num">{money(state, Math.round(l.qty * l.price))}</strong>
                  <button className="icon" onClick={() => setCart(cart.filter((x) => x.key !== l.key))}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div className="line-tools">
                  {weighed &&
                    WEIGHTS.map(([label, q]) => (
                      <button key={label} className={l.qty === q ? 'on' : ''} onClick={() => setLine(l.key, { qty: q })}>
                        {label}
                      </button>
                    ))}
                  {weighed && (
                    <button className={amountFor === l.key ? 'on' : ''} onClick={() => setAmountFor(amountFor === l.key ? null : l.key)}>
                      بالمبلغ
                    </button>
                  )}
                  <button className={noteFor === l.key || l.note ? 'on' : ''} onClick={() => setNoteFor(noteFor === l.key ? null : l.key)}>
                    <Icon name="file" size={13} /> {quickNotes.length ? 'طعمة / ملاحظة' : 'ملاحظة'}
                  </button>
                </div>
                {weighed && amountFor === l.key && (
                  <AmountToQty
                    onPick={(amountText) => {
                      let a = 0;
                      try {
                        a = parseAmount(state, amountText, base);
                      } catch {
                        a = 0;
                      }
                      if (a > 0 && l.price > 0) {
                        setLine(l.key, { qty: Math.round((a / l.price) * 1000) / 1000 });
                        setAmountFor(null);
                        refocus();
                      }
                    }}
                  />
                )}
                {noteFor === l.key && (
                  <div className="line-note-box">
                    {quickNotes.length > 0 && (
                      <div className="quick-notes">
                        {quickNotes.map((n) => (
                          <button key={n} className={notes.includes(n) ? 'on' : ''} onClick={() => toggleNote(n)}>
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                    <input placeholder="اكتب ملاحظة بتنطبع عالإيصال..." value={l.note ?? ''} onChange={(e) => setLine(l.key, { note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (setNoteFor(null), refocus())} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="kv pos-totals">
          <span>المجموع</span>
          <strong>{money(state, subtotal)}</strong>
          {can('discount.give') && (
            <>
              <span>خصم</span>
              <input className="num-input" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
            </>
          )}
          {taxes.map((t) => (
            <span key={t.id} style={{ display: 'contents' }}>
              <span>{t.name}</span>
              <strong>{t.percent}%</strong>
            </span>
          ))}
          <span className="grand">الإجمالي</span>
          <strong className="grand">{money(state, total)}</strong>
          <span>المستلم</span>
          <input
            className="num-input big-input"
            value={received}
            placeholder={toInput(state, total, base)}
            onChange={(e) => setReceived(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void pay(false)}
            inputMode="decimal"
            title="Enter = دفع نقداً"
          />
          {cashSteps.length > 0 && (
            <div className="cash-quick">
              <button onClick={() => setReceived('')}>مضبوط</button>
              {cashSteps.map((v) => (
                <button key={v} onClick={() => setReceived(toInput(state, v, base))}>
                  {money(state, v)}
                </button>
              ))}
            </div>
          )}
          <span>الباقي للزبون</span>
          <strong className={change < 0 ? 'bad' : 'good'}>{money(state, Math.max(0, change))}</strong>
        </div>
        <div className="pos-pay">
          <button className="primary big" disabled={busy || !cart.length} onClick={() => pay(false)}>
            دفع نقداً
          </button>
          <button className="big" disabled={busy || !cart.length || !partyId} onClick={() => pay(true)}>
            على الحساب
          </button>
        </div>
        <div className="pos-footer">
          <label className="check">
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
            طباعة الإيصال تلقائياً
          </label>
          {cart.length > 0 && (
            <button className="ghost" onClick={hold} title="خلّي هالفاتورة على جنب وخدم زبون تاني">
              <Icon name="prev" size={14} /> تعليق الفاتورة
            </button>
          )}
          {last && (
            <button className="ghost" onClick={() => printer.print('receipt')}>
              إعادة طباعة آخر إيصال
            </button>
          )}
          <span className="muted">
            مبيعاتي اليوم: {todaySales.length} فاتورة · {money(state, todaySales.reduce((s, i) => s + (i.currency === base ? i.total : 0), 0))}
          </span>
        </div>
      </div>
      {last && (
        <div className="print-only">
          <InvoiceDocument inv={last} />
        </div>
      )}
    </div>
  );
}

/** "عطيني بـ 500": بيحوّل المبلغ لوزن حسب سعر الكيلو. */
function AmountToQty({ onPick }: { onPick: (amount: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="amount-box">
      <input autoFocus inputMode="decimal" placeholder="المبلغ اللي بدو ياه الزبون" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onPick(text)} />
      <button className="primary" onClick={() => onPick(text)}>
        احسب الوزن
      </button>
    </div>
  );
}

/** حقل كمية يقبل الكسور أثناء الكتابة (1.25 كيلو) ويثبّت القيمة عند الخروج منه. */
function QtyInput({ value, onChange }: { value: number; onChange: (q: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    const q = Number((text ?? '').replace(',', '.'));
    if (text !== null && q > 0) onChange(q);
    setText(null);
  };
  return (
    <input
      value={text ?? qtyText(value)}
      inputMode="decimal"
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const q = Number(t.replace(',', '.'));
        if (q > 0 && !t.endsWith('.') && !t.endsWith(',')) onChange(q);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}
