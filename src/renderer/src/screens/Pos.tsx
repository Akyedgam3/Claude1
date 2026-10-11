import { useMemo, useState } from 'react';
import { resolveScan, type Invoice, type Item } from '../../../core';
import { money, parseAmount, qtyText, today, toInput, uid, useCompany } from '../api';
import { usePrinter } from '../components/print';
import { matches, partyOptions, Picker, ScanInput } from '../components/ui';
import { InvoiceDocument } from './InvoiceView';
import { itemPrice } from './InvoiceEditor';

interface CartLine {
  key: string;
  itemId: string;
  unit: string;
  qty: number;
  price: number; // بعملة الفاتورة
  serials: string[];
}

/** شاشة البيع السريع للكاشير. */
export function Pos() {
  const { state, call, notify, can, user } = useCompany();
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
  const party = partyId ? state.parties[partyId] : null;

  const sellable = useMemo(() => Object.values(state.items).filter((i) => !i.archived && i.price > 0), [state.items]);
  const categories = useMemo(() => [...new Set(sellable.map((i) => i.category).filter(Boolean))] as string[], [sellable]);
  const grid = useMemo(
    () => sellable.filter((i) => (!category || i.category === category) && matches(query, i.name, i.code, i.barcode)).slice(0, 60),
    [sellable, category, query],
  );

  const priceOf = (item: Item, unit = '') => {
    const text = itemPrice(state, item, { party, unit, currency: base, date: today() });
    return text ? parseAmount(state, text, base) : 0;
  };

  const add = (item: Item, opts: { unit?: string; qty?: number; price?: number } = {}) => {
    const unit = opts.unit ?? '';
    setCart((c) => {
      const same = !opts.qty && !item.trackSerial && c.find((l) => l.itemId === item.id && l.unit === unit);
      if (same) return c.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: uid(), itemId: item.id, unit, qty: opts.qty ?? 1, price: opts.price ?? priceOf(item, unit), serials: [] }];
    });
  };

  const scan = (code: string) => {
    const r = resolveScan(state, code);
    if (!r) return notify(`لا توجد مادة بالرمز ${code}`, 'error');
    add(r.item, { ...(r.unit ? { unit: r.unit } : {}), ...(r.qty ? { qty: r.qty } : {}), ...(r.price !== undefined ? { price: r.price } : {}) });
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

  const pay = async (credit: boolean) => {
    if (!cart.length) return;
    if (credit && !partyId) return notify('اختر العميل للبيع بالدين', 'error');
    if (!credit && change < 0) return notify('المبلغ المستلم أقل من الإجمالي', 'error');
    setBusy(true);
    const res = await call<Invoice>('postInvoice', {
      kind: 'sale',
      date: today(),
      partyId,
      lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price, ...(l.unit ? { unit: l.unit } : {}), ...(l.serials.length ? { serials: l.serials } : {}) })),
      ...(disc ? { discount: disc } : {}),
      taxIds: taxes.map((t) => t.id),
      paid: credit ? Math.min(Math.max(0, received ? receivedMinor : 0), total) : total,
      notes: 'نقطة البيع',
    });
    setBusy(false);
    if (!res) return;
    setLast(res.value);
    setCart([]);
    setReceived('');
    setDiscount('');
    setPartyId(null);
    notify(change > 0 && !credit ? `تم البيع — الباقي للزبون: ${money(state, change)}` : 'تم البيع');
    if (autoPrint) setTimeout(() => void printer.print('receipt'), 50);
  };

  const todaySales = state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date === today() && i.createdBy === user.id);

  return (
    <div className="pos">
      <div className="pos-products">
        <div className="pos-search">
          <ScanInput onScan={scan} placeholder="امسح الباركود أو باركود الميزان..." />
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
          {grid.map((i) => (
            <button key={i.id} className="pos-item" onClick={() => add(i)}>
              <strong>{i.name}</strong>
              <span>{money(state, priceOf(i))}</span>
              {i.kind === 'stock' && <small>{qtyText(state.stock[i.id]?.totalQty ?? 0)} {i.unit}</small>}
            </button>
          ))}
        </div>
      </div>

      <div className="pos-cart card">
        <div className="with-button">
          <Picker options={partyOptions(state, 'customer')} value={partyId} onChange={setPartyId} placeholder="زبون نقدي" />
          {partyId && (
            <button className="icon" onClick={() => setPartyId(null)}>
              ✕
            </button>
          )}
        </div>
        <div className="pos-lines">
          {cart.length === 0 && <p className="muted center">السلة فارغة</p>}
          {cart.map((l) => {
            const item = state.items[l.itemId]!;
            return (
              <div key={l.key} className="pos-line">
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {money(state, l.price)} {l.unit || item.unit}
                  </small>
                  {item.trackSerial && (
                    <input className="mono" placeholder="IMEI / الرقم التسلسلي" value={l.serials.join(' ')} onChange={(e) => setCart(cart.map((x) => (x.key === l.key ? { ...x, serials: e.target.value.split(/\s+/).filter(Boolean) } : x)))} />
                  )}
                </div>
                <div className="qty-box">
                  <button onClick={() => setCart(l.qty <= 1 ? cart.filter((x) => x.key !== l.key) : cart.map((x) => (x.key === l.key ? { ...x, qty: x.qty - 1 } : x)))}>−</button>
                  <input value={qtyText(l.qty)} onChange={(e) => setCart(cart.map((x) => (x.key === l.key ? { ...x, qty: Number(e.target.value) || 0 } : x)))} />
                  <button onClick={() => setCart(cart.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                </div>
                <strong className="num">{money(state, Math.round(l.qty * l.price))}</strong>
                <button className="icon" onClick={() => setCart(cart.filter((x) => x.key !== l.key))}>
                  ✕
                </button>
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
          <input className="num-input big-input" value={received} placeholder={toInput(state, total, base)} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" />
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
