import { useEffect, useMemo, useState } from 'react';
import { orderTotals, type DiningTable, type Invoice, type Order, type OrderLine, type OrderType } from '../../../core';
import { money, parseAmount, qtyText, today, toInput, uid, useCompany } from '../api';
import { DocHeader, usePrinter } from '../components/print';
import { ConfirmButton, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker } from '../components/ui';
import { InvoiceDocument } from './InvoiceView';
import { cashAccounts, itemPrice } from './InvoiceEditor';
import { Icon } from '../components/icons';

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
  const cashes = cashAccounts(state, base);
  const [cash, setCash] = useState(cashes[0]?.id ?? '1101');
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
      if (!text) return notify(`سجّل سعر الدولار أولاً لتسعير "${item.name}"`, 'error');
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
        received = paid ? parseAmount(state, paid, base) : t.total;
      } catch {
        return notify('مبلغ غير صالح', 'error');
      }
      if (received < t.total) return notify('المبلغ المستلم أقل من الإجمالي. لتسجيله دين اختار «على الحساب»', 'error');
    }
    if (payMode === 'account' && !draft.partyId) return notify('اختار الزبون اللي بدو يسجّل عليه', 'error');
    const taxIds = Object.values(state.taxes)
      .filter((x) => x.active && x.percent > 0)
      .map((x) => x.id);
    const res = await call<Invoice>('closeOrder', order.id, {
      date: today(),
      taxIds,
      ...(payMode === 'account' ? { paid: 0, partyId: draft.partyId } : { cashAccountId: cash }),
    });
    if (!res) return;
    setDoc({ kind: 'receipt', inv: res.value });
    if (payMode !== 'account' && received > res.value.total) notify(`الباقي للزبون: ${money(state, received - res.value.total)}`);
    // الطلب صار مسكّر فبترجع شاشة الطاولات لحالها؛ ما منستدعي onBack بعد الطباعة
    // مشان ما نسكّر طاولة تانية فتحها الكاشير بهالأثناء
    setTimeout(() => void printer.print('receipt'), 50);
  };

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
      <div className="pos">
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
          </div>
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
              <input className="num-input" value={paid} placeholder={toInput(state, t.total, base)} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" />
              {(() => {
                try {
                  const r = paid ? parseAmount(state, paid, base) : 0;
                  return r > t.total ? (
                    <>
                      <span>الباقي للزبون</span>
                      <strong className="good">{money(state, r - t.total)}</strong>
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
          <div className="print-area invoice-doc">
            <DocHeader title="الحساب (مبدئي)">
              <div>
                {table ? table.name : TYPE_NAMES[draft.type]} — طلب {draft.number}
              </div>
              <div className="ltr">{new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </DocHeader>
            <table className="doc-lines">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>العدد</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>{state.items[l.itemId]?.name}</td>
                    <td>{qtyText(l.qty)}</td>
                    <td>{money(state, Math.round(l.qty * l.price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="doc-totals">
              {t.service > 0 && (
                <div>
                  <span>خدمة {draft.servicePercent}%</span>
                  <strong>{money(state, t.service)}</strong>
                </div>
              )}
              {t.delivery > 0 && (
                <div>
                  <span>أجور التوصيل</span>
                  <strong>{money(state, t.delivery)}</strong>
                </div>
              )}
              {t.discount > 0 && (
                <div>
                  <span>خصم</span>
                  <strong>{money(state, t.discount)}</strong>
                </div>
              )}
              <div className="grand">
                <span>الإجمالي</span>
                <strong>{money(state, t.total)}</strong>
              </div>
            </div>
            <p className="center muted">هذه ليست فاتورة نهائية</p>
          </div>
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
