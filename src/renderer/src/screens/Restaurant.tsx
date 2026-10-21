import { useEffect, useMemo, useState } from 'react';
import { convertOrder, orderTotals, type DiningTable, type Invoice, type Order, type OrderLine, type OrderType } from '../../../core';
import { convertPrice, fxRates, money, parseAmount, plainMoney, qtyText, shownCurrencies, today, toInput, uid, useCompany } from '../api';
import { ThermalReceipt } from '../components/ThermalReceipt';
import { DocHeader, usePrinter } from '../components/print';
import { ConfirmButton, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker } from '../components/ui';
import { InvoiceDocument } from './InvoiceView';
import { cashAccounts, itemPrice } from './InvoiceEditor';
import { Icon } from '../components/icons';
import { curLabel, RateNote } from '../components/CurrencySwitch';
import { CartBar, CartTabs, useCartTab } from '../components/MobileCart';
import { CustomerDisplayButton, showThanks, useCustomerDisplay } from '../components/CustomerDisplay';

const TYPE_NAMES: Record<OrderType, string> = { dine_in: 'صالة', takeaway: 'سفري', delivery: 'توصيل' };
const QUICK_NOTES = ['بدون بصل', 'بدون ثوم', 'حار', 'بدون حر', 'زيادة صوص', 'على الجنب', 'مستعجل', 'بدون ملح'];

/** كم دقيقة مرّت من وقت معيّن (تتحدث كل نص دقيقة). */
function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
const minutesSince = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : 0);
const elapsed = (min: number) => (min < 60 ? `${min} د` : `${Math.floor(min / 60)} س ${min % 60} د`);

/** حالة الطلب من جهة المطبخ. */
function kitchenState(o: Order): 'empty' | 'pending' | 'cooking' | 'ready' {
  if (o.lines.length === 0) return 'empty';
  if (o.lines.some((l) => !l.sent)) return 'pending';
  return o.lines.every((l) => l.ready) ? 'ready' : 'cooking';
}
const KITCHEN_LABEL = { empty: 'فاضي', pending: 'بانتظار الإرسال', cooking: 'بالمطبخ', ready: 'جاهز للتقديم' };

export function Restaurant() {
  const { state, call, can, navigate, notify } = useCompany();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const [area, setArea] = useState('');
  const [managing, setManaging] = useState(false);
  const [newTable, setNewTable] = useState('');
  const tables = Object.values(state.tables)
    .filter((t) => !t.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));
  const areas = [...new Set(tables.map((t) => t.area || 'الصالة'))].sort((a, b) => (a === 'الصالة' ? -1 : b === 'الصالة' ? 1 : a.localeCompare(b, 'ar')));
  const open = Object.values(state.orders).filter((o) => o.status === 'open');
  const orderOf = (tableId: string) => open.find((o) => o.tableId === tableId);
  const d = today();
  const todaySales = state.invoices.filter((i) => i.source?.type === 'order' && i.date === d && !i.voidEntryId).reduce((t, i) => t + Math.round(i.total * i.rate), 0);
  const openValue = open.reduce((t, o) => t + orderTotals(o).total, 0);

  const start = async (type: OrderType, tableId: string | null) => {
    const res = await call<Order>('saveOrder', { id: uid(), type, tableId, status: 'open', lines: [] });
    if (res) setSelected(res.value.id);
  };

  if (selected && state.orders[selected]?.status === 'open') return <OrderPanel order={state.orders[selected]} onBack={() => setSelected(null)} onSwitch={setSelected} />;

  const shownAreas = area ? [area] : areas;
  return (
    <div className="page">
      <PageHeader title="الطاولات والطلبات">
        <button className="primary" onClick={() => start('takeaway', null)}>
          <Icon name="plus" size={16} /> طلب سفري
        </button>
        <button onClick={() => start('delivery', null)}>
          <Icon name="truck" size={16} /> توصيل
        </button>
        <button onClick={() => navigate('kitchen')}>
          <Icon name="utensils" size={16} /> شاشة المطبخ
        </button>
        {can('settings.manage') && (
          <button className="ghost" onClick={() => setManaging(true)}>
            <Icon name="settings" size={16} /> الطاولات
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat">
          <span>طاولات مشغولة</span>
          <strong>
            {tables.filter((t) => orderOf(t.id)).length} / {tables.length}
          </strong>
        </div>
        <div className="stat">
          <span>طلبات مفتوحة</span>
          <strong>{open.length}</strong>
        </div>
        <div className="stat">
          <span>قيمة الطلبات المفتوحة</span>
          <strong>{money(state, openValue)}</strong>
        </div>
        <div className="stat">
          <span>مبيعات المطعم اليوم</span>
          <strong className="good">{money(state, todaySales)}</strong>
        </div>
      </div>
      {areas.length > 1 && (
        <div className="pos-cats">
          <button className={!area ? 'active' : ''} onClick={() => setArea('')}>
            الكل
          </button>
          {areas.map((a) => (
            <button key={a} className={area === a ? 'active' : ''} onClick={() => setArea(a)}>
              {a}
            </button>
          ))}
        </div>
      )}
      {tables.length === 0 && (
        <Empty>
          ما في طاولات بعد.{' '}
          {can('settings.manage') && (
            <button className="link" onClick={() => setManaging(true)}>
              أضف طاولاتك
            </button>
          )}
        </Empty>
      )}
      {shownAreas.map((a) => (
        <section key={a}>
          {areas.length > 1 && <h3 className="area-title">{a}</h3>}
          <div className="tables-grid">
            {tables
              .filter((t) => (t.area || 'الصالة') === a)
              .map((t) => {
                const o = orderOf(t.id);
                const k = o ? kitchenState(o) : 'empty';
                return (
                  <button key={t.id} className={`table-card ${o ? `busy k-${k}` : ''}`} onClick={() => (o ? setSelected(o.id) : start('dine_in', t.id))}>
                    <span className="table-head">
                      <strong>{t.name}</strong>
                      {t.seats ? (
                        <small className="muted">
                          <Icon name="users" size={12} /> {t.seats}
                        </small>
                      ) : null}
                    </span>
                    {o ? (
                      <>
                        <span className="table-total">{money(state, orderTotals(o).total)}</span>
                        <span className="table-meta">
                          <span>طلب {o.number}</span>
                          <span>{elapsed(minutesSince(o.openedAt, now))}</span>
                        </span>
                        <span className={`k-tag k-${k}`}>{KITCHEN_LABEL[k]}</span>
                      </>
                    ) : (
                      <span className="muted">فاضية — اضغط لفتح طلب</span>
                    )}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
      {open.filter((o) => !o.tableId).length > 0 && (
        <section className="card">
          <h3>طلبات سفري وتوصيل مفتوحة</h3>
          <div className="tables-grid">
            {open
              .filter((o) => !o.tableId)
              .map((o) => {
                const k = kitchenState(o);
                return (
                  <button key={o.id} className={`table-card busy k-${k}`} onClick={() => setSelected(o.id)}>
                    <span className="table-head">
                      <strong>
                        {TYPE_NAMES[o.type]} {o.number}
                      </strong>
                      <small className="muted">{elapsed(minutesSince(o.openedAt, now))}</small>
                    </span>
                    {(o.customerName || o.phone) && <span>{o.customerName || o.phone}</span>}
                    <span className="table-total">{money(state, orderTotals(o).total)}</span>
                    <span className={`k-tag k-${k}`}>{KITCHEN_LABEL[k]}</span>
                  </button>
                );
              })}
          </div>
        </section>
      )}
      {can('settings.manage') && (
        <form
          className="inline-form card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (newTable.trim() && (await call('saveTable', { id: uid(), name: newTable.trim(), ...(area ? { area } : {}) }))) {
              notify('تمت إضافة الطاولة');
              setNewTable('');
            }
          }}
        >
          <input value={newTable} onChange={(e) => setNewTable(e.target.value)} placeholder="اسم الطاولة الجديدة (طاولة 5، تراس 2...)" />
          <button>إضافة طاولة</button>
        </form>
      )}
      {managing && <TablesManager onClose={() => setManaging(false)} />}
    </div>
  );
}

function TablesManager({ onClose }: { onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [area, setArea] = useState('الصالة');
  const [count, setCount] = useState('6');
  const [prefix, setPrefix] = useState('طاولة');
  const [seats, setSeats] = useState('4');
  const tables = Object.values(state.tables)
    .filter((t) => !t.archived)
    .sort((a, b) => (a.area ?? '').localeCompare(b.area ?? '') || a.name.localeCompare(b.name, 'ar', { numeric: true }));
  const areas = [...new Set(tables.map((t) => t.area).filter(Boolean))] as string[];
  const save = (t: DiningTable) => call('saveTable', t);
  return (
    <Modal title="إدارة الطاولات" onClose={onClose} width={820}>
      <section className="card">
        <h4>إضافة مجموعة طاولات</h4>
        <form
          className="form-grid four"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Math.min(100, Math.max(1, Number(count) || 0));
            const existing = new Set(tables.map((t) => t.name));
            let i = 1;
            let added = 0;
            while (added < n) {
              const name = `${prefix.trim() || 'طاولة'} ${i++}`;
              if (existing.has(name)) continue;
              if (!(await call('saveTable', { id: uid(), name, area: area.trim() || 'الصالة', ...(Number(seats) > 0 ? { seats: Number(seats) } : {}) }))) return;
              added++;
            }
            notify(`تمت إضافة ${added} طاولة`);
          }}
        >
          <Field label="المنطقة">
            <input value={area} onChange={(e) => setArea(e.target.value)} list="table-areas" />
            <datalist id="table-areas">
              {['الصالة', 'التراس', 'عائلي', 'الطابق العلوي', 'VIP', ...areas].map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field label="الاسم">
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </Field>
          <Field label="العدد">
            <input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="عدد الكراسي">
            <input value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" />
          </Field>
          <div className="form-actions wide">
            <button className="primary">إضافة</button>
          </div>
        </form>
      </section>
      <table className="table compact">
        <thead>
          <tr>
            <th>الطاولة</th>
            <th>المنطقة</th>
            <th>الكراسي</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tables.map((t) => (
            <tr key={t.id}>
              <td>
                <input defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && void save({ ...t, name: e.target.value.trim() })} />
              </td>
              <td>
                <input defaultValue={t.area ?? ''} list="table-areas" onBlur={(e) => e.target.value !== (t.area ?? '') && void save({ ...t, area: e.target.value.trim() })} />
              </td>
              <td>
                <input className="num-input" defaultValue={t.seats ?? ''} onBlur={(e) => Number(e.target.value) !== (t.seats ?? 0) && void save({ ...t, seats: Number(e.target.value) || 0 })} />
              </td>
              <td>
                <ConfirmButton
                  label="حذف"
                  onConfirm={async () => {
                    if (Object.values(state.orders).some((o) => o.status === 'open' && o.tableId === t.id)) return notify('الطاولة عليها طلب مفتوح', 'error');
                    await save({ ...t, archived: true });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

type PayMode = 'cash' | 'other' | 'account';

function OrderPanel({ order, onBack, onSwitch }: { order: Order; onBack: () => void; onSwitch: (id: string) => void }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const printer = usePrinter();
  const now = useNow();
  const [draft, setDraft] = useState<Order>(order);
  const lines = draft.lines;
  const setLines = (l: OrderLine[]) => setDraft({ ...draft, lines: l });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [paid, setPaid] = useState('');
  const [discount, setDiscount] = useState(order.discount ? toInput(state, order.discount, base) : '');
  const [deliveryFee, setDeliveryFee] = useState(order.deliveryFee ? toInput(state, order.deliveryFee, base) : '');
  const [payMode, setPayMode] = useState<PayMode>('cash');
  // عملة الحساب: الطلب مسعّر بعملة الشركة، والزبون فيه يدفع بالعملة اللي بدو ياها
  const [payCur, setPayCur] = useState(base);
  const rates = fxRates(state, today());
  const cashes = cashAccounts(state, payCur);
  const [cashPick, setCash] = useState(cashes[0]?.id ?? '1101');
  const cash = cashes.some((c) => c.id === cashPick) ? cashPick : (cashes.find((c) => c.currency === payCur) ?? cashes[0])?.id ?? '1101';
  const [moving, setMoving] = useState<'move' | 'merge' | null>(null);
  const [doc, setDoc] = useState<{ kind: 'ticket'; lines: OrderLine[] } | { kind: 'bill' } | { kind: 'receipt'; inv: Invoice } | null>(null);
  const menu = useMemo(() => Object.values(state.items).filter((i) => !i.archived && i.price > 0 && i.category !== 'مواد أولية' && i.category !== 'مواد خام'), [state.items]);
  const cats = [...new Set(menu.map((i) => i.category).filter(Boolean))] as string[];
  const shown = menu.filter((i) => (!category || i.category === category) && matches(query, i.name, i.code));
  const customers = useMemo(() => partyOptions(state, 'customer'), [state]);
  const waiters = Object.values(state.users)
    .filter((u) => u.active)
    .map((u) => u.displayName);
  const table = draft.tableId ? state.tables[draft.tableId] : null;

  const amount = (text: string) => {
    if (!text.trim()) return 0;
    return parseAmount(state, text, base);
  };
  let current: Order = draft;
  let amountsOk = true;
  try {
    current = { ...draft, discount: amount(discount), deliveryFee: amount(deliveryFee) };
  } catch {
    amountsOk = false;
  }
  const t = orderTotals(current);
  const mobileTab = useCartTab();
  const fxOk = payCur === base || (!!rates[payCur] && !!rates[base]);
  const tp = payCur === base || !fxOk ? t : orderTotals(convertOrder(current, (m) => convertPrice(state, m, base, payCur, rates) ?? 0));
  const clean = (o: Order): Order => {
    const copy: Order = { ...o };
    for (const k of ['discount', 'deliveryFee', 'servicePercent', 'guests'] as const) if (!copy[k]) delete copy[k];
    for (const k of ['customerName', 'phone', 'address', 'waiter', 'notes'] as const) if (!copy[k]?.trim()) delete copy[k];
    return copy;
  };

  const dirty = JSON.stringify(clean(current)) !== JSON.stringify(clean(order));
  // حالة الجاهزية بتتغير من شاشة المطبخ
  useEffect(() => {
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, ...(order.lines.find((x) => x.id === l.id)?.ready !== undefined ? { ready: order.lines.find((x) => x.id === l.id)!.ready } : {}) })) }));
  }, [order]);


  const add = (itemId: string) => {
    const item = state.items[itemId]!;
    const existing = lines.find((l) => l.itemId === itemId && !l.sent && !l.note);
    if (existing) setLines(lines.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l)));
    else {
      const text = itemPrice(state, item, { currency: base, date: today() });
      if (!text) return notify(`سجّل سعر صرف ${state.currencies[item.priceCurrency]?.nameAr ?? ''} أولاً لتسعير "${item.name}"`, 'error');
      const line = { id: uid(), itemId, qty: 1, price: parseAmount(state, text, base) };
      setLines([...lines, line]);
      setActive(line.id);
    }
  };

  const persist = async (next: Order) => {
    if (!amountsOk) {
      notify('مبلغ غير صالح', 'error');
      return null;
    }
    const res = await call<Order>('saveOrder', clean(next));
    return res?.value ?? null;
  };

  const sendToKitchen = async () => {
    const at = new Date().toISOString();
    const fresh = lines.filter((l) => !l.sent);
    const saved = await persist({ ...current, lines: lines.map((l) => (l.sent ? l : { ...l, sent: true, sentAt: at })) });
    if (!saved) return;
    setDraft(saved);
    if (fresh.length) {
      setDoc({ kind: 'ticket', lines: fresh });
      setTimeout(() => void printer.print('kitchen'), 50);
      notify('تم الإرسال للمطبخ');
    } else notify('تم الحفظ');
  };

  const close = async () => {
    if (dirty && !(await persist(current))) return;
    let received = t.total;
    if (payMode !== 'account') {
      try {
        received = paid ? parseAmount(state, paid, payCur) : tp.total;
      } catch {
        return notify('مبلغ غير صالح', 'error');
      }
      if (received < tp.total) return notify('المبلغ المستلم أقل من الإجمالي. لتسجيله دين اختار «على الحساب»', 'error');
    }
    if (payMode === 'account' && !draft.partyId) return notify('اختار الزبون اللي بدو يسجّل عليه', 'error');
    const taxIds = Object.values(state.taxes)
      .filter((x) => x.active && x.percent > 0)
      .map((x) => x.id);
    if (!fxOk) return notify('سجّل سعر الصرف اليوم أولاً', 'error');
    const res = await call<Invoice>('closeOrder', order.id, {
      date: today(),
      taxIds,
      ...(payCur !== base ? { currency: payCur } : {}),
      ...(payMode === 'account' ? { paid: 0, partyId: draft.partyId } : { cashAccountId: cash }),
    });
    if (!res) return;
    setDoc({ kind: 'receipt', inv: res.value });
    if (payMode !== 'account' && received > res.value.total) notify(`الباقي للزبون: ${money(state, received - res.value.total, payCur)}`);
    showThanks(state, money(state, res.value.total, payCur), payMode !== 'account' && paid ? { received: money(state, received, payCur), change: money(state, Math.max(0, received - res.value.total), payCur) } : null);
    // الطلب صار مسكّر فبترجع شاشة الطاولات لحالها؛ ما منستدعي onBack بعد الطباعة
    // مشان ما نسكّر طاولة تانية فتحها الكاشير بهالأثناء
    setTimeout(() => void printer.print('receipt'), 50);
  };

  // شاشة الزبون: الطلب والمبلغ مباشرة
  let shownPaid: number | null = null;
  try {
    shownPaid = paid ? parseAmount(state, paid, payCur) : null;
  } catch {
    shownPaid = null;
  }
  useCustomerDisplay(
    lines.length
      ? {
          title: table ? table.name : TYPE_NAMES[draft.type],
          lines: lines.map((l) => ({ name: state.items[l.itemId]?.name ?? '', qty: qtyText(l.qty), total: money(state, Math.round(l.qty * l.price)), ...(l.note ? { note: l.note } : {}) })),
          totals: [
            ...(t.service > 0 ? [{ label: `خدمة ${draft.servicePercent}%`, value: money(state, t.service) }] : []),
            ...(t.delivery > 0 ? [{ label: 'أجور التوصيل', value: money(state, t.delivery) }] : []),
            ...(t.discount > 0 ? [{ label: 'خصم', value: money(state, t.discount) }] : []),
          ],
          grand: money(state, tp.total, payCur),
          paid: shownPaid && shownPaid > 0 ? { received: money(state, shownPaid, payCur), change: money(state, Math.max(0, shownPaid - tp.total), payCur) } : null,
        }
      : null,
  );

  const activeLine = lines.find((l) => l.id === active && !l.sent);
  const busyTables = new Set(Object.values(state.orders).filter((o) => o.status === 'open' && o.tableId).map((o) => o.tableId));
  const otherOpen = Object.values(state.orders).filter((o) => o.status === 'open' && o.id !== order.id);

  return (
    <div className="page">
      <PageHeader title={`${table ? table.name : TYPE_NAMES[draft.type]} — طلب ${draft.number}`}>
        <button onClick={onBack}>
          <Icon name="prev" size={16} /> رجوع
        </button>
        <button className="primary" onClick={sendToKitchen} disabled={!lines.some((l) => !l.sent) && !dirty}>
          <Icon name="utensils" size={16} /> إرسال للمطبخ
        </button>
        <button
          onClick={async () => {
            if (dirty && !(await persist(current))) return;
            setDoc({ kind: 'bill' });
            setTimeout(() => void printer.print('receipt'), 50);
          }}
          disabled={!lines.length}
        >
          <Icon name="printer" size={16} /> طباعة الحساب
        </button>
        {draft.tableId !== null || draft.type === 'dine_in' ? (
          <button className="ghost" onClick={() => setMoving('move')}>
            نقل
          </button>
        ) : null}
        {otherOpen.length > 0 && (
          <button className="ghost" onClick={() => setMoving('merge')}>
            دمج
          </button>
        )}
        <CustomerDisplayButton />
        <ConfirmButton
          label="إلغاء الطلب"
          onConfirm={async () => {
            if (await call('saveOrder', { ...order, status: 'cancelled' })) onBack();
          }}
        />
      </PageHeader>
      <div className="order-info">
        {draft.type === 'dine_in' ? (
          <>
            <label>
              <span>الضيوف</span>
              <input className="num-input" value={draft.guests ?? ''} onChange={(e) => setDraft({ ...draft, guests: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </label>
            <label>
              <span>الكابتن</span>
              <input value={draft.waiter ?? ''} list="waiters" onChange={(e) => setDraft({ ...draft, waiter: e.target.value })} />
              <datalist id="waiters">
                {waiters.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </label>
          </>
        ) : (
          <>
            <label>
              <span>الاسم</span>
              <input value={draft.customerName ?? ''} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} />
            </label>
            <label>
              <span>الموبايل</span>
              <input value={draft.phone ?? ''} dir="ltr" onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </label>
            {draft.type === 'delivery' && (
              <label className="grow">
                <span>العنوان</span>
                <input value={draft.address ?? ''} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
              </label>
            )}
          </>
        )}
        <span className="muted">
          مفتوح من {elapsed(minutesSince(order.openedAt, now))}
          {draft.waiter ? ` · ${draft.waiter}` : ''}
        </span>
      </div>
      <div className={`pos ${mobileTab.className}`}>
        <CartTabs tab={mobileTab.tab} setTab={mobileTab.setTab} count={lines.length} itemsLabel="المنيو" />
        <div className="pos-products">
          <div className="pos-search">
            <input placeholder="بحث في القائمة..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {cats.length > 0 && (
            <div className="pos-cats">
              <button className={!category ? 'active' : ''} onClick={() => setCategory('')}>
                الكل
              </button>
              {cats.map((c) => (
                <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="pos-grid">
            {shown.map((i) => {
              const inCart = lines.filter((l) => l.itemId === i.id).reduce((s, l) => s + l.qty, 0);
              return (
                <button key={i.id} className={`pos-item ${inCart ? 'in-cart' : ''}`} onClick={() => add(i.id)}>
                  <strong>{i.name}</strong>
                  <span>{money(state, i.price, i.priceCurrency)}</span>
                  {inCart > 0 && <b className="badge">{qtyText(inCart)}</b>}
                </button>
              );
            })}
            {shown.length === 0 && <p className="muted">ما في أصناف. أضف أصناف المنيو من «المواد» مع السعر والتصنيف.</p>}
          </div>
        </div>
        <CartBar tab={mobileTab.tab} setTab={mobileTab.setTab} count={lines.length} total={money(state, t.total)} />
        <div className="pos-cart card">
          <div className="pos-lines">
            {lines.length === 0 && <p className="muted center">اختار الأصناف من المنيو</p>}
            {lines.map((l) => (
              <div key={l.id} className={`pos-line ${l.sent ? 'sent' : ''} ${active === l.id ? 'active' : ''}`} onClick={() => setActive(l.id)}>
                <div>
                  <strong>{state.items[l.itemId]?.name}</strong>
                  {l.sent ? (
                    l.note && <small>{l.note}</small>
                  ) : (
                    <input placeholder="ملاحظة للمطبخ..." value={l.note ?? ''} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)))} />
                  )}
                </div>
                <div className="qty-box">
                  <button disabled={l.sent} onClick={() => setLines(l.qty <= 1 ? lines.filter((x) => x.id !== l.id) : lines.map((x) => (x.id === l.id ? { ...x, qty: x.qty - 1 } : x)))}>
                    −
                  </button>
                  <span>{qtyText(l.qty)}</span>
                  <button disabled={l.sent} onClick={() => setLines(lines.map((x) => (x.id === l.id ? { ...x, qty: x.qty + 1 } : x)))}>
                    +
                  </button>
                </div>
                <strong className="num">{money(state, Math.round(l.qty * l.price))}</strong>
                {l.sent ? (
                  <span className={`tag ${l.ready ? 'good' : ''}`}>{l.ready ? 'جاهز' : 'بالمطبخ'}</span>
                ) : (
                  <button className="icon" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {activeLine && (
            <div className="quick-notes">
              {QUICK_NOTES.map((n) => (
                <button
                  key={n}
                  className={(activeLine.note ?? '').includes(n) ? 'active' : ''}
                  onClick={() => {
                    const cur = activeLine.note ? activeLine.note.split('، ').filter(Boolean) : [];
                    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
                    setLines(lines.map((x) => (x.id === activeLine.id ? { ...x, note: next.join('، ') } : x)));
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <div className="kv pos-totals">
            <span>الأصناف</span>
            <strong>{money(state, t.items)}</strong>
            {draft.type === 'dine_in' && (
              <>
                <span>خدمة %</span>
                <input className="num-input" value={draft.servicePercent ?? ''} placeholder="0" onChange={(e) => setDraft({ ...draft, servicePercent: Math.min(50, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })} />
              </>
            )}
            {draft.type === 'delivery' && (
              <>
                <span>أجور التوصيل</span>
                <input className="num-input" value={deliveryFee} placeholder="0" onChange={(e) => setDeliveryFee(e.target.value)} inputMode="decimal" />
              </>
            )}
            {can('discount.give') && (
              <>
                <span>خصم</span>
                <input className="num-input" value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
              </>
            )}
            <span className="grand">الإجمالي</span>
            <strong className="grand">{money(state, t.total)}</strong>
            {payCur !== base && fxOk && (
              <>
                <span className="grand">المطلوب {state.currencies[payCur]?.code === 'USD' ? 'بالدولار' : `بـ${state.currencies[payCur]?.nameAr}`}</span>
                <strong className="grand">{money(state, tp.total, payCur)}</strong>
              </>
            )}
          </div>
          {shownCurrencies(state, payCur).length > 1 && (
            <div className="cur-switch">
              <span className="muted">الدفع بـ</span>
              <div className="segmented">
                {shownCurrencies(state, payCur).map((c) => (
                  <button
                    key={c.code}
                    className={payCur === c.code ? 'active' : ''}
                    onClick={() => {
                      if (c.code !== base && (!rates[c.code] || !rates[base])) return notify('سجّل سعر الصرف اليوم أولاً', 'error');
                      setPayCur(c.code);
                      setPaid('');
                    }}
                  >
                    {curLabel(c)}
                  </button>
                ))}
              </div>
              <RateNote code={payCur} />
            </div>
          )}
          <div className="pay-modes segmented">
            <button className={payMode === 'cash' ? 'active' : ''} onClick={() => setPayMode('cash')}>
              نقدي
            </button>
            {cashes.length > 1 && (
              <button className={payMode === 'other' ? 'active' : ''} onClick={() => setPayMode('other')}>
                بطاقة / حوالة
              </button>
            )}
            <button className={payMode === 'account' ? 'active' : ''} onClick={() => setPayMode('account')}>
              على الحساب
            </button>
          </div>
          {payMode === 'account' ? (
            <Picker options={customers} value={draft.partyId ?? null} onChange={(v) => setDraft({ ...draft, partyId: v })} placeholder="اختار الزبون..." />
          ) : (
            <div className="kv">
              {payMode === 'other' && (
                <>
                  <span>الحساب</span>
                  <select value={cash} onChange={(e) => setCash(e.target.value)}>
                    {cashes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <span>المستلم</span>
              <input className="num-input" value={paid} placeholder={toInput(state, tp.total, payCur)} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" />
              {(() => {
                try {
                  const r = paid ? parseAmount(state, paid, payCur) : 0;
                  return r > tp.total ? (
                    <>
                      <span>الباقي للزبون</span>
                      <strong className="good">{money(state, r - tp.total, payCur)}</strong>
                    </>
                  ) : null;
                } catch {
                  return null;
                }
              })()}
            </div>
          )}
          <button className="primary big" disabled={!lines.length || !can('sales.create')} onClick={close}>
            الحساب وإغلاق الطلب
          </button>
        </div>
      </div>
      {moving && (
        <Modal title={moving === 'move' ? 'نقل الطلب لطاولة تانية' : 'دمج طلب تاني بهالطلب'} onClose={() => setMoving(null)}>
          <div className="tables-grid">
            {moving === 'move'
              ? Object.values(state.tables)
                  .filter((x) => !x.archived && !busyTables.has(x.id))
                  .map((x) => (
                    <button
                      key={x.id}
                      className="table-card"
                      onClick={async () => {
                        if (dirty && !(await persist(current))) return;
                        const res = await call<Order>('moveOrder', order.id, x.id);
                        if (res) {
                          setDraft(res.value);
                          setMoving(null);
                          notify(`انتقل الطلب إلى ${x.name}`);
                        }
                      }}
                    >
                      <strong>{x.name}</strong>
                      <span className="muted">{x.area}</span>
                    </button>
                  ))
              : otherOpen.map((o) => (
                  <button
                    key={o.id}
                    className="table-card busy"
                    onClick={async () => {
                      if (dirty && !(await persist(current))) return;
                      const res = await call<Order>('mergeOrders', o.id, order.id);
                      if (res) {
                        setDraft(res.value);
                        setMoving(null);
                        notify('تم الدمج');
                        onSwitch(res.value.id);
                      }
                    }}
                  >
                    <strong>{o.tableId ? state.tables[o.tableId]?.name : `${TYPE_NAMES[o.type]} ${o.number}`}</strong>
                    <span>{money(state, orderTotals(o).total)}</span>
                  </button>
                ))}
          </div>
        </Modal>
      )}
      {doc?.kind === 'ticket' && (
        <div className="print-only">
          <div className="print-area invoice-doc kitchen-ticket">
            <DocHeader title="المطبخ">
              <div>
                {table ? table.name : TYPE_NAMES[draft.type]} — طلب {draft.number}
              </div>
              <div className="ltr">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
              {draft.waiter && <div>{draft.waiter}</div>}
            </DocHeader>
            {doc.lines.map((l) => (
              <div key={l.id} className="ticket-line">
                <strong>
                  {qtyText(l.qty)} × {state.items[l.itemId]?.name}
                </strong>
                {l.note && (
                  <div>
                    <Icon name="warning" size={14} /> {l.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {doc?.kind === 'bill' && (
        <div className="print-only">
          <ThermalReceipt
            always
            data={{
              title: 'الحساب',
              draft: true,
              number: draft.number,
              date: new Date().toLocaleDateString('en-GB'),
              time: new Date().toLocaleString('en-GB'),
              ...(table ? { table: table.name } : { orderType: TYPE_NAMES[draft.type] }),
              ...(draft.waiter ? { captain: draft.waiter } : {}),
              ...(draft.guests ? { guests: draft.guests } : {}),
              ...(draft.customerName ? { customer: draft.customerName } : {}),
              lines: lines.map((l) => ({
                name: state.items[l.itemId]?.name ?? '',
                ...(l.note ? { sub: [l.note] } : {}),
                qty: qtyText(l.qty),
                price: plainMoney(state, l.price),
                total: plainMoney(state, Math.round(l.qty * l.price)),
              })),
              totals: [
                { label: 'المجموع', value: money(state, t.items) },
                ...(t.service > 0 ? [{ label: `خدمة ${draft.servicePercent}%`, value: money(state, t.service) }] : []),
                ...(t.delivery > 0 ? [{ label: 'أجور التوصيل', value: money(state, t.delivery) }] : []),
                ...(t.discount > 0 ? [{ label: 'خصم', value: money(state, t.discount) }] : []),
              ],
              grand: { label: 'الإجمالي', value: money(state, t.total) },
            }}
          />
        </div>
      )}
      {doc?.kind === 'receipt' && (
        <div className="print-only">
          <InvoiceDocument inv={doc.inv} />
        </div>
      )}
    </div>
  );
}

/** شاشة المطبخ: الطلبات المرسلة بالترتيب، والطباخ بيعلّم الجاهز. */
export function KitchenDisplay() {
  const { state, call, navigate } = useCompany();
  const now = useNow(15_000);
  const open = Object.values(state.orders)
    .filter((o) => o.status === 'open' && o.lines.some((l) => l.sent))
    .map((o) => ({ o, since: o.lines.filter((l) => l.sent && !l.ready).reduce<string | undefined>((m, l) => (l.sentAt && (!m || l.sentAt < m) ? l.sentAt : m), undefined) }))
    .sort((a, b) => (a.since ?? '9').localeCompare(b.since ?? '9'));
  const cooking = open.filter(({ o }) => o.lines.some((l) => l.sent && !l.ready));
  const ready = open.filter(({ o }) => o.lines.every((l) => !l.sent || l.ready));
  const mark = (o: Order, ids: string[] | 'all', value = true) =>
    call('saveOrder', { ...o, lines: o.lines.map((l) => (l.sent && (ids === 'all' || ids.includes(l.id)) ? { ...l, ready: value } : l)) });
  const title = (o: Order) => (o.tableId ? (state.tables[o.tableId]?.name ?? '') : `${TYPE_NAMES[o.type]} ${o.number}`);
  return (
    <div className="page kitchen-page">
      <PageHeader title="شاشة المطبخ">
        <button onClick={() => navigate('restaurant')}>
          <Icon name="prev" size={16} /> الطاولات
        </button>
      </PageHeader>
      <h3>قيد التحضير ({cooking.length})</h3>
      {cooking.length === 0 && <Empty>ما في طلبات بالمطبخ هلق</Empty>}
      <div className="kitchen-grid">
        {cooking.map(({ o, since }) => {
          const min = minutesSince(since, now);
          return (
            <div key={o.id} className={`kitchen-card ${min >= 20 ? 'late' : min >= 10 ? 'warn' : ''}`}>
              <header>
                <strong>{title(o)}</strong>
                <span>طلب {o.number}</span>
                <span className="timer">{elapsed(min)}</span>
              </header>
              <ul>
                {o.lines
                  .filter((l) => l.sent)
                  .map((l) => (
                    <li key={l.id} className={l.ready ? 'done' : ''} onClick={() => void mark(o, [l.id], !l.ready)}>
                      <b>{qtyText(l.qty)}×</b> {state.items[l.itemId]?.name}
                      {l.note && <small>{l.note}</small>}
                    </li>
                  ))}
              </ul>
              <button className="primary" onClick={() => void mark(o, 'all')}>
                <Icon name="check" size={16} /> الطلب كله جاهز
              </button>
            </div>
          );
        })}
      </div>
      {ready.length > 0 && (
        <>
          <h3>جاهز للتقديم ({ready.length})</h3>
          <div className="kitchen-grid">
            {ready.map(({ o }) => (
              <div key={o.id} className="kitchen-card ready">
                <header>
                  <strong>{title(o)}</strong>
                  <span>طلب {o.number}</span>
                </header>
                <ul>
                  {o.lines
                    .filter((l) => l.sent)
                    .map((l) => (
                      <li key={l.id} className="done" onClick={() => void mark(o, [l.id], false)}>
                        <b>{qtyText(l.qty)}×</b> {state.items[l.itemId]?.name}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** لوحة الإدارة المباشرة: كل شي عم يصير بالمطعم هلق، بتتحدث لحالها مع كل طلب وفاتورة. */
export function RestaurantLive() {
  const { state, navigate } = useCompany();
  const now = useNow(15_000);
  const base = state.info!.baseCurrency;
  const day = today();
  const sales = state.invoices.filter((i) => i.kind === 'sale' && !i.voidEntryId && i.date === day && i.currency === base);
  const total = sales.reduce((s, i) => s + i.total, 0);
  const cash = sales.reduce((s, i) => s + i.paid, 0);
  const tables = Object.values(state.tables).filter((t) => !t.archived);
  const open = Object.values(state.orders).filter((o) => o.status === 'open');
  const byTable = new Map(open.filter((o) => o.tableId).map((o) => [o.tableId!, o]));
  const openValue = open.reduce((s, o) => s + orderTotals(o).total, 0);
  const cookingLines = open.flatMap((o) => o.lines.filter((l) => l.sent && !l.ready));
  const oldest = cookingLines.reduce((m, l) => Math.max(m, minutesSince(l.sentAt, now)), 0);
  const readyOrders = open.filter((o) => kitchenState(o) === 'ready').length;

  // الأكثر مبيعاً اليوم
  const top = new Map<string, { name: string; qty: number; amount: number }>();
  for (const inv of sales)
    for (const l of inv.lines) {
      const k = l.itemId ?? l.description;
      const x = top.get(k) ?? { name: l.description, qty: 0, amount: 0 };
      x.qty += l.qty;
      x.amount += Math.round(l.qty * l.price);
      top.set(k, x);
    }
  const topItems = [...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  // المبيعات حسب الساعة
  const hours = Array.from({ length: 24 }, () => 0);
  for (const inv of sales) {
    const h = new Date(inv.createdAt).getHours();
    if (!Number.isNaN(h)) hours[h] = (hours[h] ?? 0) + inv.total;
  }
  const firstH = Math.max(0, Math.min(10, hours.findIndex((v) => v > 0) === -1 ? 10 : hours.findIndex((v) => v > 0)));
  const shownHours = hours.map((v, h) => ({ h, v })).filter((x) => x.h >= firstH);
  const maxH = Math.max(1, ...shownHours.map((x) => x.v));
  // الكاشير والكابتن
  const people = new Map<string, number>();
  for (const inv of sales) {
    const n = state.users[inv.createdBy]?.displayName ?? '—';
    people.set(`الكاشير: ${n}`, (people.get(`الكاشير: ${n}`) ?? 0) + inv.total);
    const o = inv.source?.type === 'order' ? state.orders[inv.source.id] : undefined;
    if (o?.waiter) people.set(`الكابتن: ${o.waiter}`, (people.get(`الكابتن: ${o.waiter}`) ?? 0) + inv.total);
  }
  const recent = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const m = (v: number) => money(state, v);

  return (
    <div className="page live-page">
      <PageHeader title="لوحة الإدارة المباشرة">
        <span className="live-dot">مباشر · {new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen())}>
          <Icon name="monitor" size={16} /> ملء الشاشة
        </button>
      </PageHeader>
      <div className="live-kpis">
        <div className="kpi big">
          <span>مبيعات اليوم</span>
          <strong>{m(total)}</strong>
          <small>{sales.length} فاتورة · وسطي الفاتورة {m(sales.length ? Math.round(total / sales.length) : 0)}</small>
        </div>
        <div className="kpi">
          <span>المقبوض نقداً</span>
          <strong>{m(cash)}</strong>
          <small>دين: {m(total - cash)}</small>
        </div>
        <div className="kpi">
          <span>طاولات مشغولة</span>
          <strong>
            {byTable.size} / {tables.length}
          </strong>
          <small>{open.length} طلب مفتوح · {m(openValue)}</small>
        </div>
        <div className={`kpi ${oldest >= 20 ? 'bad' : oldest >= 10 ? 'warn' : ''}`}>
          <span>بالمطبخ</span>
          <strong>{cookingLines.length} صنف</strong>
          <small>{cookingLines.length ? `أقدم طلب من ${elapsed(oldest)}` : 'ما في انتظار'}</small>
        </div>
        <div className="kpi good">
          <span>جاهز للتقديم</span>
          <strong>{readyOrders}</strong>
          <small>طلب</small>
        </div>
      </div>
      <div className="live-grid">
        <section className="card">
          <h3>الطاولات</h3>
          <div className="live-tables">
            {tables.map((t) => {
              const o = byTable.get(t.id);
              const k = o ? kitchenState(o) : null;
              return (
                <button key={t.id} className={`lt ${o ? `busy k-${k}` : ''}`} onClick={() => navigate('restaurant')}>
                  <b>{t.name}</b>
                  {o ? (
                    <>
                      <span>{m(orderTotals(o).total)}</span>
                      <small>
                        {elapsed(minutesSince(o.openedAt, now))} · {KITCHEN_LABEL[k!]}
                      </small>
                    </>
                  ) : (
                    <small>فاضية</small>
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <section className="card">
          <h3>المبيعات حسب الساعة</h3>
          <div className="live-hours">
            {shownHours.map(({ h, v }) => (
              <div key={h} className={new Date(now).getHours() === h ? 'now' : ''}>
                <i style={{ height: `${(v / maxH) * 100}%` }} title={m(v)} />
                <small>{h}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>الأكثر طلباً اليوم</h3>
          {topItems.length === 0 && <Empty>لسا ما في مبيعات اليوم</Empty>}
          <ol className="live-top">
            {topItems.map((x) => (
              <li key={x.name}>
                <span>{x.name}</span>
                <b>{qtyText(x.qty)}</b>
                <small>{m(x.amount)}</small>
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h3>الكاشير والكباتن</h3>
          {people.size === 0 && <Empty>لسا ما في مبيعات اليوم</Empty>}
          <div className="live-people">
            {[...people.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{m(v)}</b>
              </div>
            ))}
          </div>
          <h3>آخر الفواتير</h3>
          <div className="live-people">
            {recent.map((i) => (
              <div key={i.id} className="clickable" onClick={() => navigate('invoice', i.id)}>
                <span>
                  #{i.number} · {new Date(i.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <b>{m(i.total)}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
