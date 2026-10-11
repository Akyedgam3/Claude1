import { useMemo, useState } from 'react';
import type { Invoice, Order, OrderLine, OrderType } from '../../../core';
import { money, parseAmount, qtyText, today, toInput, uid, useCompany } from '../api';
import { DocHeader, usePrinter } from '../components/print';
import { ConfirmButton, Empty, matches, PageHeader } from '../components/ui';
import { InvoiceDocument } from './InvoiceView';
import { itemPrice } from './InvoiceEditor';

const TYPE_NAMES: Record<OrderType, string> = { dine_in: 'صالة', takeaway: 'سفري', delivery: 'توصيل' };

export function Restaurant() {
  const { state, call, notify, can } = useCompany();
  const [selected, setSelected] = useState<string | null>(null); // معرّف الطلب
  const [newTable, setNewTable] = useState('');
  const tables = Object.values(state.tables).filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));
  const open = Object.values(state.orders).filter((o) => o.status === 'open');
  const orderOf = (tableId: string) => open.find((o) => o.tableId === tableId);
  const total = (o: Order) => o.lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);

  const start = async (type: OrderType, tableId: string | null) => {
    const res = await call<Order>('saveOrder', { id: uid(), type, tableId, status: 'open', lines: [] });
    if (res) setSelected(res.value.id);
  };

  if (selected && state.orders[selected]) return <OrderPanel order={state.orders[selected]} onBack={() => setSelected(null)} />;

  return (
    <div className="page">
      <PageHeader title="الطاولات والطلبات">
        <button className="primary" onClick={() => start('takeaway', null)}>
          + طلب سفري
        </button>
        <button onClick={() => start('delivery', null)}>+ توصيل</button>
      </PageHeader>
      {tables.length === 0 && <Empty>أضف الطاولات أولاً</Empty>}
      <div className="tables-grid">
        {tables.map((t) => {
          const o = orderOf(t.id);
          return (
            <button key={t.id} className={`table-card ${o ? 'busy' : ''}`} onClick={() => (o ? setSelected(o.id) : start('dine_in', t.id))}>
              <strong>{t.name}</strong>
              {o ? (
                <>
                  <span>طلب {o.number}</span>
                  <span>{money(state, total(o))}</span>
                </>
              ) : (
                <span className="muted">فارغة</span>
              )}
            </button>
          );
        })}
      </div>
      {open.filter((o) => !o.tableId).length > 0 && (
        <section className="card">
          <h3>طلبات سفري وتوصيل مفتوحة</h3>
          <div className="tables-grid">
            {open
              .filter((o) => !o.tableId)
              .map((o) => (
                <button key={o.id} className="table-card busy" onClick={() => setSelected(o.id)}>
                  <strong>
                    {TYPE_NAMES[o.type]} {o.number}
                  </strong>
                  <span>{money(state, total(o))}</span>
                </button>
              ))}
          </div>
        </section>
      )}
      {can('settings.manage') && (
        <form
          className="inline-form card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (newTable.trim() && (await call('saveTable', { id: uid(), name: newTable.trim() }))) {
              notify('تمت إضافة الطاولة');
              setNewTable('');
            }
          }}
        >
          <input value={newTable} onChange={(e) => setNewTable(e.target.value)} placeholder="اسم الطاولة الجديدة (طاولة 5، تراس 2...)" />
          <button>إضافة طاولة</button>
        </form>
      )}
    </div>
  );
}

function OrderPanel({ order, onBack }: { order: Order; onBack: () => void }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const printer = usePrinter();
  const [lines, setLines] = useState<OrderLine[]>(order.lines);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [paid, setPaid] = useState('');
  // مستند واحد فقط جاهز للطباعة في كل مرة
  const [doc, setDoc] = useState<{ kind: 'ticket'; lines: OrderLine[] } | { kind: 'receipt'; inv: Invoice } | null>(null);
  const menu = useMemo(() => Object.values(state.items).filter((i) => !i.archived && i.price > 0 && i.category !== 'مواد أولية'), [state.items]);
  const cats = [...new Set(menu.map((i) => i.category).filter(Boolean))] as string[];
  const shown = menu.filter((i) => (!category || i.category === category) && matches(query, i.name, i.code));
  const total = lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);
  const table = order.tableId ? state.tables[order.tableId] : null;
  const dirty = JSON.stringify(lines) !== JSON.stringify(order.lines);

  const add = (itemId: string) => {
    const item = state.items[itemId]!;
    const existing = lines.find((l) => l.itemId === itemId && !l.sent && !l.note);
    if (existing) setLines(lines.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l)));
    else {
      const text = itemPrice(state, item, { currency: base, date: today() });
      if (!text) return notify(`سجّل سعر الدولار أولاً لتسعير "${item.name}"`, 'error');
      setLines([...lines, { id: uid(), itemId, qty: 1, price: parseAmount(state, text, base) }]);
    }
  };

  const persist = async (next: OrderLine[]) => {
    const res = await call<Order>('saveOrder', { ...order, lines: next });
    return !!res;
  };

  const sendToKitchen = async () => {
    const fresh = lines.filter((l) => !l.sent);
    const next = lines.map((l) => ({ ...l, sent: true }));
    if (!(await persist(next))) return;
    setLines(next);
    if (fresh.length) {
      setDoc({ kind: 'ticket', lines: fresh });
      setTimeout(() => void printer.print('kitchen'), 50);
    }
    notify('تم الإرسال للمطبخ');
  };

  return (
    <div className="page">
      <PageHeader title={`${table ? table.name : TYPE_NAMES[order.type]} — طلب ${order.number}`}>
        <button onClick={onBack}>← رجوع</button>
        <button onClick={sendToKitchen} disabled={!lines.some((l) => !l.sent) && !dirty}>
          حفظ وإرسال للمطبخ
        </button>
        <ConfirmButton
          label="إلغاء الطلب"
          onConfirm={async () => {
            if (await call('saveOrder', { ...order, status: 'cancelled' })) onBack();
          }}
        />
      </PageHeader>
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
            {shown.map((i) => (
              <button key={i.id} className="pos-item" onClick={() => add(i.id)}>
                <strong>{i.name}</strong>
                <span>{money(state, i.price, i.priceCurrency)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pos-cart card">
          <div className="pos-lines">
            {lines.length === 0 && <p className="muted center">لا أصناف بعد</p>}
            {lines.map((l) => (
              <div key={l.id} className={`pos-line ${l.sent ? 'sent' : ''}`}>
                <div>
                  <strong>{state.items[l.itemId]?.name}</strong>
                  <input placeholder="ملاحظة (بدون بصل...)" value={l.note ?? ''} disabled={l.sent} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)))} />
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
                {l.sent ? <span className="tag">بالمطبخ</span> : <button className="icon" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>✕</button>}
              </div>
            ))}
          </div>
          <div className="kv pos-totals">
            <span className="grand">الإجمالي</span>
            <strong className="grand">{money(state, total)}</strong>
            <span>المستلم</span>
            <input className="num-input" value={paid} placeholder={toInput(state, total, base)} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" />
          </div>
          <button
            className="primary big"
            disabled={!lines.length || !can('sales.create')}
            onClick={async () => {
              if (dirty && !(await persist(lines))) return;
              let received = total;
              try {
                received = paid ? parseAmount(state, paid, base) : total;
              } catch {
                return notify('مبلغ غير صالح', 'error');
              }
              if (received < total) return notify('المبلغ المستلم أقل من الإجمالي', 'error');
              const res = await call<Invoice>('closeOrder', order.id, { date: today(), taxIds: Object.values(state.taxes).filter((t) => t.active && t.percent > 0).map((t) => t.id) });
              if (!res) return;
              setDoc({ kind: 'receipt', inv: res.value });
              if (received > total) notify(`الباقي للزبون: ${money(state, received - total)}`);
              setTimeout(async () => {
                await printer.print('receipt');
                onBack();
              }, 50);
            }}
          >
            الحساب وإغلاق الطلب
          </button>
        </div>
      </div>
      {doc?.kind === 'ticket' && (
        <div className="print-only">
          <div className="print-area invoice-doc kitchen-ticket">
            <DocHeader title="المطبخ">
              <div>
                {table ? table.name : TYPE_NAMES[order.type]} — طلب {order.number}
              </div>
              <div className="ltr">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
            </DocHeader>
            {doc.lines.map((l) => (
              <div key={l.id} className="ticket-line">
                <strong>
                  {qtyText(l.qty)} × {state.items[l.itemId]?.name}
                </strong>
                {l.note && <div>⚠ {l.note}</div>}
              </div>
            ))}
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
