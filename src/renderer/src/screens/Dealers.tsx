import { useMemo, useState } from 'react';
import {
  DEALER_MOVE_NAMES,
  dealerCash,
  dealerLedger,
  dealerStock,
  dealerSummary,
  itemTitle,
  partyBalance,
  resolveScan,
  type Dealer,
  type DealerMoveKind,
  type DealerSale,
  type Item,
} from '../../../core';
import { dateText, money, parseAmount, qtyText, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { ConfirmButton, Empty, Field, Modal, PageHeader, Picker, ScanInput, Tabs } from '../components/ui';
import { ItemForm } from './Items';

const DEVICE_KEY = 'wazn.dealerDevice';
const deviceDealer = () => {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? '';
  } catch {
    return '';
  }
};

type Tab = 'sell' | 'goods' | 'account';

/** صيدلية مع موردين: كل مورّد بيبيع من أدوية الصيدلية بسعره، إلو صندوقه وبضاعته، وبيتسجّل عليه سعر الصيدلية دين. */
export function Dealers() {
  const { state, can, notify, call } = useCompany();
  const dealers = useMemo(() => Object.values(state.dealers ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [state.dealers]);
  const [fixed, setFixed] = useState(deviceDealer);
  const [sel, setSel] = useState<string>(() => (fixed && state.dealers?.[fixed] ? fixed : ''));
  const [tab, setTab] = useState<Tab>('sell');
  const [editing, setEditing] = useState<Dealer | 'new' | null>(null);
  const [pricing, setPricing] = useState(false);
  const dealer = sel ? state.dealers?.[sel] : undefined;
  const d = today();
  const fix = (id: string) => {
    try {
      if (id) localStorage.setItem(DEVICE_KEY, id);
      else localStorage.removeItem(DEVICE_KEY);
    } catch {
      /* ما في تخزين */
    }
    setFixed(id);
    notify(id ? `هالجهاز صار نقطة بيع المورّد ${state.dealers?.[id]?.name}` : 'هالجهاز رجع للصيدلية');
  };

  return (
    <div className="page">
      <PageHeader title="الموردين">
        {can('settings.manage') && <button onClick={() => setPricing(true)}>نسب الربح</button>}
        {can('dealers.manage') && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> مورّد جديد
          </button>
        )}
      </PageHeader>
      {fixed && state.dealers?.[fixed] && (
        <div className="dealer-fixed">
          <span>
            هالجهاز نقطة بيع المورّد <strong>{state.dealers[fixed]!.name}</strong>
          </span>
          <button className="small" onClick={() => fix('')}>
            رجّعه للصيدلية
          </button>
        </div>
      )}
      <div className="dealer-tabs">
        <button className={!sel ? 'active' : ''} onClick={() => setSel('')}>
          كل الموردين
        </button>
        {dealers.map((x) => (
          <button key={x.id} className={sel === x.id ? 'active' : ''} onClick={() => setSel(x.id)}>
            {x.name}
            {!x.active ? ' (موقوف)' : ''}
          </button>
        ))}
      </div>

      {!dealer ? (
        dealers.length === 0 ? (
          <Empty>ما في موردين لسا. اكبس «مورّد جديد»، وبعدها بيبيع من أدويتك بسعره وبيتسجّل عليه سعر الصيدلية.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>المورّد</th>
                <th className="num">صندوقه</th>
                <th className="num">عليه للصيدلية</th>
                <th className="num">مبيعات اليوم</th>
                <th className="num">ربحه اليوم</th>
                <th className="num">ربحه هالشهر</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dealers.map((x) => {
                const t = dealerSummary(state, x.id, d, d);
                const m = dealerSummary(state, x.id, d.slice(0, 8) + '01', d);
                const debt = partyBalance(state, x.partyId).base;
                return (
                  <tr key={x.id} className="clickable" onClick={() => setSel(x.id)}>
                    <td>
                      <strong>{x.name}</strong>
                      {x.phone && <div className="muted ltr">{x.phone}</div>}
                    </td>
                    <td className="num">{money(state, dealerCash(state, x.id))}</td>
                    <td className={`num ${debt > 0 ? 'bad' : ''}`}>{money(state, Math.max(0, debt))}</td>
                    <td className="num">{money(state, t.sales)}</td>
                    <td className="num good">{money(state, t.profit)}</td>
                    <td className="num">{money(state, m.profit - m.expenses)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="small" onClick={() => setSel(x.id)}>
                        فتح
                      </button>
                      {can('dealers.manage') && (
                        <>
                          <button className="small" onClick={() => setEditing(x)}>
                            تعديل
                          </button>
                          <ConfirmButton className="small" label="حذف" confirmLabel="متأكد؟ احذف" onConfirm={async () => (await call('deleteDealer', x.id)) && notify(`انحذف المورّد ${x.name}`)} />
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : (
        <>
          <div className="toolbar">
            <Tabs<Tab>
              tabs={[
                { key: 'sell', label: 'بيع' },
                { key: 'goods', label: 'بضاعته الخاصة' },
                { key: 'account', label: 'الصندوق والحساب' },
              ]}
              value={tab}
              onChange={setTab}
            />
            <div className="spacer" />
            {fixed !== dealer.id && (
              <button className="small" onClick={() => fix(dealer.id)} title="هالجهاز بيفتح دايماً على بيع هالمورّد">
                ثبّت هالجهاز على {dealer.name}
              </button>
            )}
            {can('dealers.manage') && (
              <>
                <button className="small" onClick={() => setEditing(dealer)}>
                  تعديل المورّد
                </button>
                <ConfirmButton
                  className="small"
                  label="حذف المورّد"
                  confirmLabel="متأكد؟ احذف"
                  onConfirm={async () => {
                    if (await call('deleteDealer', dealer.id)) {
                      notify(`انحذف المورّد ${dealer.name}`);
                      setSel('');
                    }
                  }}
                />
              </>
            )}
          </div>
          {tab === 'sell' && <DealerSell key={dealer.id} dealer={dealer} />}
          {tab === 'goods' && <DealerGoods key={dealer.id} dealer={dealer} />}
          {tab === 'account' && <DealerAccount key={dealer.id} dealer={dealer} />}
        </>
      )}
      {editing && (
        <DealerForm
          dealer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(x) => {
            setSel(x.id);
            setEditing(null);
          }}
        />
      )}
      {pricing && <PricingForm onClose={() => setPricing(false)} />}
    </div>
  );
}

export function DealerForm({ dealer, onClose, onSaved }: { dealer: Dealer | null; onClose: () => void; onSaved: (d: Dealer) => void }) {
  const { call, notify } = useCompany();
  const [name, setName] = useState(dealer?.name ?? '');
  const [phone, setPhone] = useState(dealer?.phone ?? '');
  const [active, setActive] = useState(dealer?.active ?? true);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await call<Dealer>('saveDealer', { id: dealer?.id ?? uid(), name, ...(phone.trim() ? { phone: phone.trim() } : {}), active });
    if (res) {
      notify(`انحفظ المورّد ${res.value.name}`);
      onSaved(res.value);
    }
  };
  return (
    <Modal title={dealer ? `تعديل ${dealer.name}` : 'مورّد جديد'} onClose={onClose} width={520}>
      <form className="form-grid" onSubmit={save}>
        <Field label="الاسم" wide>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="الهاتف" wide>
          <input className="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {dealer && (
          <label className="check wide">
            <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} /> موقوف (ما بيقدر يبيع)
          </label>
        )}
        <p className="muted wide">بينعمله حساب عند الصيدلية باسم «المورّد {name || '...'}»، وكل دوا بيبيعه بيتسجّل عليه فيه بسعر الصيدلية.</p>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

function PricingForm({ onClose }: { onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const [retail, setRetail] = useState(String(state.info?.pricing?.retailMargin ?? ''));
  const [dealer, setDealer] = useState(String(state.info?.pricing?.dealerMargin ?? ''));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const pricing = { ...(Number(retail) > 0 ? { retailMargin: Number(retail) } : {}), ...(Number(dealer) > 0 ? { dealerMargin: Number(dealer) } : {}) };
    if (await call('updateCompany', { pricing })) {
      notify('انحفظت نسب الربح');
      onClose();
    }
  };
  return (
    <Modal title="نسب الربح عند إدخال البضاعة" onClose={onClose} width={520}>
      <form className="form-grid" onSubmit={save}>
        <Field label="ربح الصيدلية فوق سعر الشراء %">
          <input inputMode="decimal" value={retail} onChange={(e) => setRetail(e.target.value)} />
        </Field>
        <Field label="سعر المورّد فوق سعر الشراء %">
          <input inputMode="decimal" value={dealer} onChange={(e) => setDealer(e.target.value)} />
        </Field>
        <p className="muted wide">بفاتورة الشراء، زر «احسب الأسعار بالنسب» بيعبّي سعر الصيدلية وسعر المورّد لكل مادة من سعر شرائها، وفيك تعدّلهن قبل الحفظ.</p>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

type CartLine = { key: string; itemId: string; qty: string; price: string };

/** نقطة بيع المورّد: أدوية الصيدلية وبضاعته الخاصة بسعره، والمصاري لصندوقه. */
function DealerSell({ dealer }: { dealer: Dealer }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('');
  const [customer, setCustomer] = useState('');
  const [busy, setBusy] = useState(false);
  const own = useMemo(() => dealerStock(state, dealer.id), [state, dealer.id]);
  const options = useMemo(
    () =>
      Object.values(state.items)
        .filter((i) => !i.archived && i.kind === 'stock' && (!i.dealerId || i.dealerId === dealer.id))
        .map((item) => ({
          id: item.id,
          label: itemTitle(item),
          hint: [item.code, item.dealerId ? `بضاعته: ${qtyText(own[item.id]?.qty ?? 0)}` : `الصيدلية: ${qtyText(state.stock[item.id]?.totalQty ?? 0)}`].join(' · '),
          item,
        })),
    [state, dealer.id, own],
  );
  const priceOf = (it: Item) => toInput(state, it.dealerPrice ?? it.price, it.priceCurrency);
  const add = (it: Item) => {
    if (it.dealerId && it.dealerId !== dealer.id) return notify('هالمادة من بضاعة مورّد تاني', 'error');
    if (it.priceCurrency !== base) return notify('أسعار الموردين لازم تكون بالعملة الأساسية', 'error');
    setCart((c) => {
      const same = c.find((x) => x.itemId === it.id);
      if (same) return c.map((x) => (x === same ? { ...x, qty: String(Number(x.qty || 0) + 1) } : x));
      return [...c, { key: uid(), itemId: it.id, qty: '1', price: priceOf(it) }];
    });
  };
  let gross = 0;
  try {
    gross = cart.reduce((s, l) => s + Math.round(Number(l.qty || 0) * parseAmount(state, l.price, base)), 0);
  } catch {
    gross = 0;
  }
  let disc = 0;
  try {
    disc = Math.min(gross, parseAmount(state, discount, base));
  } catch {
    disc = 0;
  }
  const meds = cart.filter((l) => !state.items[l.itemId]?.dealerId).reduce((s, l) => s + Math.round(Number(l.qty || 0) * (state.items[l.itemId]?.price ?? 0)), 0);
  const pay = async () => {
    if (!cart.length || busy) return;
    setBusy(true);
    try {
      const res = await call<DealerSale>('postDealerSale', {
        dealerId: dealer.id,
        date: today(),
        lines: cart.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), price: parseAmount(state, l.price, base) })),
        ...(disc ? { discount: disc } : {}),
        ...(customer.trim() ? { customer: customer.trim() } : {}),
      });
      if (res) {
        notify(`تم البيع: ${money(state, res.value.total)} لصندوق ${dealer.name}`);
        setCart([]);
        setDiscount('');
        setCustomer('');
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const todays = (state.dealerSales ?? []).filter((s) => s.dealerId === dealer.id && s.date === today()).reverse();

  return (
    <div className="dealer-sell">
      {!dealer.active && <div className="banner">هالمورّد موقوف.</div>}
      <section className="card">
        <div className="scan-row">
          <ScanInput
            autoFocus
            onScan={(code) => {
              const r = resolveScan(state, code);
              if (!r) return notify(`لا توجد مادة بالرمز ${code}`, 'error');
              add(r.item);
            }}
            placeholder="امسح الباركود أو اكتب الرمز ثم Enter"
          />
        </div>
        <div style={{ margin: '8px 0' }}>
          <Picker options={options} value={null} onChange={(id) => id && state.items[id] && add(state.items[id]!)} placeholder="أو دوّر على الدوا أو المادة بالاسم..." />
        </div>
        {cart.length === 0 ? (
          <Empty>السلة فاضية. امسح الباركود أو دوّر بالاسم. الأدوية بتنباع بسعر المورّد، والصيدلية بتسجّل عليه سعرها.</Empty>
        ) : (
          <table className="table dealer-cart">
            <thead>
              <tr>
                <th>المادة</th>
                <th>من</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th className="num">المجموع</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cart.map((l) => {
                const it = state.items[l.itemId]!;
                let amount = 0;
                try {
                  amount = Math.round(Number(l.qty || 0) * parseAmount(state, l.price, base));
                } catch {
                  amount = 0;
                }
                return (
                  <tr key={l.key}>
                    <td>
                      <strong>{it.name}</strong>
                      {!it.dealerId && <div className="muted">سعر الصيدلية {money(state, it.price, it.priceCurrency)}</div>}
                    </td>
                    <td>{it.dealerId ? <span className="tag">بضاعته</span> : <span className="tag">الصيدلية</span>}</td>
                    <td>
                      <input className="num-input" inputMode="decimal" value={l.qty} onChange={(e) => setCart(cart.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))} />
                    </td>
                    <td>
                      <input className="num-input" inputMode="decimal" value={l.price} onChange={(e) => setCart(cart.map((x) => (x.key === l.key ? { ...x, price: e.target.value } : x)))} />
                    </td>
                    <td className="num">{money(state, amount)}</td>
                    <td>
                      <button className="icon" title="حذف" onClick={() => setCart(cart.filter((x) => x.key !== l.key))}>
                        <Icon name="close" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="card form-grid">
        <Field label="اسم الزبون (اختياري)">
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </Field>
        <Field label="خصم">
          <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <div className="kv wide">
          <span>الإجمالي (لصندوق {dealer.name})</span>
          <strong>{money(state, gross - disc)}</strong>
          {meds > 0 && (
            <>
              <span>بيتسجّل عليه للصيدلية</span>
              <strong className="bad">{money(state, meds)}</strong>
              <span>ربحه التقريبي</span>
              <strong className="good">{money(state, gross - disc - meds - cart.filter((l) => state.items[l.itemId]?.dealerId).reduce((s, l) => s + Math.round(((own[l.itemId]?.value ?? 0) / (own[l.itemId]?.qty || 1)) * Number(l.qty || 0)), 0))}</strong>
            </>
          )}
        </div>
        <div className="form-actions wide">
          <button className="primary big" disabled={busy || !cart.length || !can('dealers.manage') || !dealer.active} onClick={() => void pay()}>
            قبض وحفظ
          </button>
        </div>
      </section>
      {todays.length > 0 && (
        <section className="card">
          <h3>مبيعاته اليوم</h3>
          <table className="table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>المواد</th>
                <th className="num">المبلغ</th>
                <th className="num">الربح</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {todays.map((s) => (
                <tr key={s.id} className={s.voided ? 'muted' : ''}>
                  <td className="mono">{s.number}</td>
                  <td>
                    {s.lines.map((l) => `${l.name} × ${qtyText(l.qty)}`).join('، ')}
                    {s.customer && <div className="muted">{s.customer}</div>}
                  </td>
                  <td className="num">{money(state, s.total)}</td>
                  <td className="num">{money(state, s.total - s.lines.reduce((a, l) => a + l.cost, 0))}</td>
                  <td>{s.voided ? <span className="tag">ملغاة</span> : can('dealers.manage') && <ConfirmButton label="إلغاء" confirmLabel="أكيد؟" onConfirm={() => call('voidDealerSale', s.id, today())} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

type PurchaseLine = { itemId: string | null; qty: string; cost: string };

/** بضاعة المورّد الخاصة (غير الأدوية): الرصيد والتكلفة، واستلام بضاعة جديدة من صندوقه. */
function DealerGoods({ dealer }: { dealer: Dealer }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const stock = useMemo(() => dealerStock(state, dealer.id), [state, dealer.id]);
  const items = Object.values(state.items).filter((i) => !i.archived && i.dealerId === dealer.id);
  const [newItem, setNewItem] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [lines, setLines] = useState<PurchaseLine[]>([{ itemId: null, qty: '', cost: '' }]);
  const [note, setNote] = useState('');
  const options = items.map((item) => ({ id: item.id, label: item.name, hint: `الرصيد: ${qtyText(stock[item.id]?.qty ?? 0)}`, item }));
  const receive = async () => {
    try {
      const ls = lines.filter((l) => l.itemId && Number(l.qty) > 0).map((l) => ({ itemId: l.itemId!, qty: Number(l.qty), unitCost: parseAmount(state, l.cost, base) }));
      if (!ls.length) return notify('اختار مادة وكميتها', 'error');
      if (await call('postDealerMove', { dealerId: dealer.id, date: today(), kind: 'purchase', lines: ls, ...(note.trim() ? { note } : {}) })) {
        notify('انضافت البضاعة لمخزون المورّد، وانخصم تمنها من صندوقه');
        setReceiving(false);
        setLines([{ itemId: null, qty: '', cost: '' }]);
        setNote('');
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <>
      <div className="toolbar">
        <span className="muted">بضاعة إلو هو (غير الأدوية): ما بتنحسب بمخزون الصيدلية، وربحها كامل إلو.</span>
        <div className="spacer" />
        {can('items.manage') && <button onClick={() => setNewItem(true)}>+ مادة جديدة للمورّد</button>}
        {can('dealers.manage') && (
          <button className="primary" onClick={() => setReceiving(true)}>
            استلام بضاعة
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <Empty>ما في بضاعة خاصة لهالمورّد. اكبس «مادة جديدة للمورّد» واختار بـ«بضاعة مين؟» اسمه.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>المادة</th>
              <th className="num">الرصيد</th>
              <th className="num">وسطي التكلفة</th>
              <th className="num">سعر البيع</th>
              <th className="num">قيمة البضاعة</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const s = stock[it.id] ?? { qty: 0, value: 0 };
              return (
                <tr key={it.id}>
                  <td>{it.name}</td>
                  <td className={`num ${s.qty <= (it.minStock ?? 0) ? 'bad' : ''}`}>
                    {qtyText(s.qty)} {it.unit}
                  </td>
                  <td className="num">{s.qty > 0 ? money(state, Math.round(s.value / s.qty)) : '—'}</td>
                  <td className="num">{it.dealerPrice ? money(state, it.dealerPrice, it.priceCurrency) : '—'}</td>
                  <td className="num">{money(state, s.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {newItem && <ItemForm item={null} onClose={() => setNewItem(false)} onSaved={() => notify(`تأكد إنو «بضاعة مين؟» = ${dealer.name}`)} />}
      {receiving && (
        <Modal title={`استلام بضاعة للمورّد ${dealer.name}`} onClose={() => setReceiving(false)} width={700}>
          <div className="form-grid">
            <div className="wide">
              {lines.map((l, i) => (
                <div key={i} className="with-button" style={{ marginBottom: 6 }}>
                  <div style={{ flex: 2 }}>
                    <Picker options={options} value={l.itemId} onChange={(id) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: id } : x)))} placeholder="المادة" />
                  </div>
                  <input className="num-input" style={{ maxWidth: 110 }} inputMode="decimal" placeholder="الكمية" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                  <input className="num-input" style={{ maxWidth: 140 }} inputMode="decimal" placeholder="تكلفة الوحدة" value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
                </div>
              ))}
              <button type="button" className="small" onClick={() => setLines([...lines, { itemId: null, qty: '', cost: '' }])}>
                + مادة تانية
              </button>
            </div>
            <Field label="ملاحظة" wide>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <p className="muted wide">التمن بينخصم من صندوق المورّد. صندوقه هلق: {money(state, dealerCash(state, dealer.id))}</p>
            <div className="form-actions wide">
              <button type="button" onClick={() => setReceiving(false)}>
                إلغاء
              </button>
              <button type="button" className="primary" onClick={() => void receive()}>
                حفظ
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** صندوق المورّد وحسابه مع الصيدلية: التسديد، المصاريف، السحب، والكشف. */
function DealerAccount({ dealer }: { dealer: Dealer }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [move, setMove] = useState<DealerMoveKind | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const cash = dealerCash(state, dealer.id);
  const debt = partyBalance(state, dealer.partyId).base;
  const d = today();
  const t = dealerSummary(state, dealer.id, d, d);
  const m = dealerSummary(state, dealer.id, d.slice(0, 8) + '01', d);
  const all = dealerSummary(state, dealer.id);
  const rows = dealerLedger(state, dealer);
  const save = async () => {
    try {
      const a = parseAmount(state, amount, base);
      if (await call('postDealerMove', { dealerId: dealer.id, date: today(), kind: move, amount: a, ...(note.trim() ? { note } : {}) })) {
        notify(move === 'payment' ? 'انسجّل التسديد: طلع من صندوقه ودخل صندوق الصيدلية' : 'انسجّلت الحركة');
        setMove(null);
        setAmount('');
        setNote('');
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <>
      <div className="stats">
        <div className="stat">
          <span>صندوقه</span>
          <strong>{money(state, cash)}</strong>
        </div>
        <div className="stat">
          <span>عليه للصيدلية</span>
          <strong className={debt > 0 ? 'bad' : 'good'}>{money(state, Math.max(0, debt))}</strong>
          {debt < 0 && <small className="good">إلو عند الصيدلية {money(state, -debt)}</small>}
        </div>
        <div className="stat">
          <span>ربحه اليوم</span>
          <strong className="good">{money(state, t.profit)}</strong>
          <small className="muted">مبيعات {money(state, t.sales)}</small>
        </div>
        <div className="stat">
          <span>ربحه هالشهر (بعد المصاريف)</span>
          <strong className="good">{money(state, m.profit - m.expenses)}</strong>
          <small className="muted">من الأدوية {money(state, m.profit - m.ownProfit)} · بضاعته {money(state, m.ownProfit)}</small>
        </div>
      </div>
      {can('dealers.manage') && (
        <div className="toolbar">
          <button className="primary" onClick={() => (setMove('payment'), setAmount(debt > 0 ? toInput(state, Math.min(debt, Math.max(cash, 0)), base) : ''))}>
            تسديد للصيدلية
          </button>
          <button onClick={() => setMove('expense')}>مصروف</button>
          <button onClick={() => setMove('withdraw')}>سحب</button>
          <button onClick={() => setMove('deposit')}>إيداع بالصندوق</button>
          <div className="spacer" />
          <span className="muted">من البداية: مبيعات {money(state, all.sales)} · ربح {money(state, all.profit - all.expenses)}</span>
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>ما في حركات لسا.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الحركة</th>
              <th>التفاصيل</th>
              <th className="num">داخل الصندوق</th>
              <th className="num">خارج</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.kind === 'sale' ? (
                <tr key={r.sale.id} className={r.sale.voided ? 'muted' : ''}>
                  <td>{dateText(r.date)}</td>
                  <td>بيع رقم {r.sale.number}</td>
                  <td className="muted">{r.sale.lines.map((l) => `${l.name} × ${qtyText(l.qty)}`).join('، ')}</td>
                  <td className="num">{money(state, r.sale.total)}</td>
                  <td />
                  <td>{r.sale.voided ? <span className="tag">ملغاة</span> : can('dealers.manage') && <ConfirmButton label="إلغاء" confirmLabel="أكيد؟" onConfirm={() => call('voidDealerSale', r.sale.id, today())} />}</td>
                </tr>
              ) : (
                <tr key={r.move.id} className={r.move.voided ? 'muted' : ''}>
                  <td>{dateText(r.date)}</td>
                  <td>{DEALER_MOVE_NAMES[r.move.kind]}</td>
                  <td className="muted">{[r.move.lines?.map((l) => `${state.items[l.itemId]?.name} × ${qtyText(l.qty)}`).join('، '), r.move.note].filter(Boolean).join(' — ')}</td>
                  <td className="num">{r.move.kind === 'deposit' ? money(state, r.move.amount) : ''}</td>
                  <td className="num">{r.move.kind !== 'deposit' ? money(state, r.move.amount) : ''}</td>
                  <td>{r.move.voided ? <span className="tag">ملغاة</span> : can('dealers.manage') && <ConfirmButton label="إلغاء" confirmLabel="أكيد؟" onConfirm={() => call('voidDealerMove', r.move.id, today())} />}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      {move && (
        <Modal title={`${DEALER_MOVE_NAMES[move]} — ${dealer.name}`} onClose={() => setMove(null)} width={480}>
          <div className="form-grid">
            <Field label="المبلغ" wide>
              <input autoFocus className="num-input big-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="ملاحظة" wide>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {move === 'payment' && <p className="muted wide">بيطلع من صندوق المورّد وبيدخل صندوق الصيدلية، وبينقص دينه. عليه هلق {money(state, Math.max(0, debt))}.</p>}
            <div className="form-actions wide">
              <button type="button" onClick={() => setMove(null)}>
                إلغاء
              </button>
              <button type="button" className="primary" onClick={() => void save()}>
                حفظ
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
