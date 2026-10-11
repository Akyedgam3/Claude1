import { useMemo, useState } from 'react';
import { computeTaxes, findRate, INVOICE_KIND_NAMES, type Invoice, type InvoiceKind, type Item } from '../../../core';
import { money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { CurrencySelect, Field, itemOptions, PageHeader, partyOptions, Picker, itemMatches } from '../components/ui';
import { ItemForm } from './Items';
import { PartyForm } from './Parties';

interface LineState {
  key: string;
  itemId: string | null;
  description: string;
  qty: string;
  price: string;
  discount: string;
}

const emptyLine = (): LineState => ({ key: uid(), itemId: null, description: '', qty: '1', price: '', discount: '' });

/** الحسابات النقدية المتاحة لاستلام/دفع المال (الصناديق والبنوك). */
export function cashAccounts(state: ReturnType<typeof useCompany>['state']) {
  return Object.values(state.accounts).filter((a) => !a.isGroup && !a.archived && (a.id.startsWith('1101') || a.id.startsWith('1102') || a.parentId === '1101' || a.parentId === '1102'));
}

export function InvoiceEditor({ kind }: { kind: InvoiceKind }) {
  const { state, call, notify, navigate } = useCompany();
  const base = state.info!.baseCurrency;
  const isSale = kind === 'sale' || kind === 'sale_return';
  const [partyId, setPartyId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [currency, setCurrency] = useState(base);
  const [rateText, setRateText] = useState('');
  const [warehouseId, setWarehouseId] = useState(Object.keys(state.warehouses)[0] ?? 'main');
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [discount, setDiscount] = useState('');
  const [taxIds, setTaxIds] = useState<string[]>(() => (isSale ? Object.values(state.taxes).filter((t) => t.active && t.percent > 0).map((t) => t.id) : []));
  const [paidText, setPaidText] = useState<string | null>(null); // null = تلقائي
  const [cashAccountId, setCashAccountId] = useState('1101');
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState('');
  const [newItem, setNewItem] = useState<string | null>(null); // مفتاح السطر الذي نضيف له مادة جديدة
  const [newParty, setNewParty] = useState(false);
  const [saving, setSaving] = useState(false);

  const storedRate = findRate(state, currency, date);
  const rate = currency === base ? 1 : Number(rateText) || storedRate || 0;
  const items = useMemo(() => itemOptions(state), [state]);

  /** سعر المادة محوّلاً إلى عملة الفاتورة. */
  const priceFor = (item: Item): string => {
    const raw = isSale ? item.price : (state.stock[item.id]?.lastCost ?? 0);
    const from = isSale ? item.priceCurrency : base;
    if (from === currency) return toInput(state, raw, currency);
    const fromRate = findRate(state, from, date);
    if (!fromRate || !rate) return '';
    const scale = 10 ** (state.currencies[currency]!.decimals - state.currencies[from]!.decimals);
    return toInput(state, Math.round(((raw * fromRate) / rate) * scale), currency);
  };

  const setLine = (key: string, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const chooseItem = (key: string, itemId: string | null) => {
    const item = itemId ? state.items[itemId] : null;
    setLines((ls) => {
      const next = ls.map((l) => (l.key === key ? { ...l, itemId, description: item?.name ?? '', price: item ? priceFor(item) : l.price } : l));
      return next[next.length - 1]!.itemId || next[next.length - 1]!.description ? [...next, emptyLine()] : next;
    });
  };

  const addByScan = () => {
    const code = scan.trim();
    if (!code) return;
    const item = Object.values(state.items).find((i) => i.barcode === code || i.code === code || i.partNumber === code);
    if (!item) return notify(`لا توجد مادة بالرمز ${code}`, 'error');
    setLines((ls) => {
      const existing = ls.find((l) => l.itemId === item.id);
      if (existing) return ls.map((l) => (l === existing ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l));
      const filled = ls.filter((l) => l.itemId || l.description);
      return [...filled, { key: uid(), itemId: item.id, description: item.name, qty: '1', price: priceFor(item), discount: '' }, emptyLine()];
    });
    setScan('');
  };

  // معاينة المجاميع بنفس منطق النواة
  const preview = useMemo(() => {
    try {
      const used = lines.filter((l) => l.itemId || l.description.trim());
      const amounts = used.map((l) => Math.round(Number(l.qty || 0) * parseAmount(state, l.price, currency)) - parseAmount(state, l.discount, currency));
      const subtotal = amounts.reduce((s, a) => s + a, 0);
      const disc = parseAmount(state, discount, currency);
      const taxes = taxIds.map((id) => ({ ...state.taxes[id]!, active: true }));
      const t = computeTaxes(subtotal - disc, taxes);
      return { amounts, subtotal, disc, taxes: t.taxes, total: t.total, error: null as string | null };
    } catch (e) {
      return { amounts: [], subtotal: 0, disc: 0, taxes: [], total: 0, error: (e as Error).message };
    }
  }, [lines, discount, taxIds, currency, state]);

  const paid = paidText === null ? (partyId ? 0 : preview.total) : (() => {
    try {
      return parseAmount(state, paidText, currency);
    } catch {
      return 0;
    }
  })();

  const save = async () => {
    if (preview.error) return notify(preview.error, 'error');
    if (currency !== base && !rate) return notify('أدخل سعر الصرف', 'error');
    setSaving(true);
    try {
      const used = lines.filter((l) => l.itemId || l.description.trim());
      const draft = {
        kind,
        date,
        partyId,
        currency,
        ...(currency !== base ? { rate } : {}),
        warehouseId,
        lines: used.map((l) => ({
          itemId: l.itemId,
          description: l.description,
          qty: Number(l.qty),
          price: parseAmount(state, l.price, currency),
          discount: parseAmount(state, l.discount, currency),
        })),
        discount: preview.disc,
        taxIds,
        paid,
        cashAccountId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const res = await call<Invoice>('postInvoice', draft);
      if (res) {
        notify(`تم حفظ ${INVOICE_KIND_NAMES[kind]} رقم ${res.value.number}`);
        navigate('invoice', res.value.id);
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const returnKind = kind === 'sale' ? 'sale_return' : kind === 'purchase' ? 'purchase_return' : null;

  return (
    <div
      className="page invoice-editor"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) void save();
      }}
    >
      <PageHeader title={INVOICE_KIND_NAMES[kind]}>
        {returnKind && <button onClick={() => navigate(returnKind)}>{INVOICE_KIND_NAMES[returnKind]}</button>}
      </PageHeader>

      <section className="card form-grid four">
        <Field label={isSale ? 'العميل' : 'المورد'}>
          <div className="with-button">
            <Picker
              options={partyOptions(state, isSale ? 'customer' : 'supplier')}
              value={partyId}
              onChange={setPartyId}
              placeholder={isSale ? 'زبون نقدي (اختياري)' : 'مورد نقدي (اختياري)'}
            />
            {partyId && (
              <button type="button" className="icon" title="إزالة" onClick={() => setPartyId(null)}>
                ✕
              </button>
            )}
            <button type="button" className="icon" title="إضافة جديد" onClick={() => setNewParty(true)}>
              +
            </button>
          </div>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        {currency !== base ? (
          <Field label={`سعر الصرف (${state.currencies[base]?.symbol})`}>
            <input value={rateText} placeholder={storedRate ? String(storedRate) : 'أدخل السعر'} onChange={(e) => setRateText(e.target.value)} inputMode="decimal" />
          </Field>
        ) : (
          Object.keys(state.warehouses).length > 1 && (
            <Field label="المستودع">
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {Object.values(state.warehouses).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
          )
        )}
      </section>

      <section className="card">
        <div className="scan-row">
          <input
            className="mono"
            placeholder="امسح الباركود أو اكتب رمز/رقم القطعة ثم Enter"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addByScan();
              }
            }}
          />
        </div>
        <table className="table lines">
          <thead>
            <tr>
              <th style={{ width: '34%' }}>المادة / البيان</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الخصم</th>
              <th className="num">المجموع</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const item = l.itemId ? state.items[l.itemId] : null;
              const stock = item?.kind === 'stock' ? (state.stock[item.id]?.totalQty ?? 0) : null;
              return (
                <tr key={l.key}>
                  <td>
                    {l.itemId ? (
                      <div className="line-item">
                        <strong>{l.description}</strong>
                        <small>
                          {[item?.code, item?.partNumber, stock !== null ? `الرصيد: ${stock}` : null].filter(Boolean).join(' · ')}
                          {isSale && stock !== null && Number(l.qty) > stock && <span className="bad"> — الكمية أكبر من الرصيد</span>}
                        </small>
                      </div>
                    ) : (
                      <div className="with-button">
                        <Picker
                          options={items}
                          value={null}
                          onChange={(id) => chooseItem(l.key, id)}
                          placeholder="ابحث عن مادة..."
                          filter={(o, q) => itemMatches((o as (typeof items)[number]).item, q)}
                        />
                        <button type="button" className="icon" title="مادة جديدة" onClick={() => setNewItem(l.key)}>
                          +
                        </button>
                      </div>
                    )}
                    {!l.itemId && (
                      <input
                        className="line-desc"
                        placeholder={isSale ? 'أو اكتب خدمة (أجور يد مثلاً)' : 'أو اكتب بياناً (مصاريف شحن مثلاً)'}
                        value={l.description}
                        onChange={(e) => {
                          setLine(l.key, { description: e.target.value });
                          if (i === lines.length - 1 && e.target.value) setLines((ls) => [...ls, emptyLine()]);
                        }}
                      />
                    )}
                  </td>
                  <td>
                    <input className="num-input" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" />
                  </td>
                  <td>
                    <input className="num-input" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} inputMode="decimal" />
                  </td>
                  <td>
                    <input className="num-input" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} inputMode="decimal" />
                  </td>
                  <td className="num">{l.itemId || l.description ? money(state, preview.amounts[lines.filter((x) => x.itemId || x.description.trim()).indexOf(l)] ?? 0, currency) : ''}</td>
                  <td>
                    {(l.itemId || l.description) && (
                      <button className="icon" title="حذف السطر" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="invoice-bottom">
        <section className="card form-grid">
          <Field label="ملاحظات" wide>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {Object.values(state.taxes).filter((t) => t.percent > 0).length > 0 && (
            <div className="field wide">
              <span>الضرائب</span>
              <div className="checks">
                {Object.values(state.taxes)
                  .filter((t) => t.percent > 0)
                  .map((t) => (
                    <label key={t.id}>
                      <input
                        type="checkbox"
                        checked={taxIds.includes(t.id)}
                        onChange={(e) => setTaxIds(e.target.checked ? [...taxIds, t.id] : taxIds.filter((x) => x !== t.id))}
                      />
                      {t.name} ({t.percent}%)
                    </label>
                  ))}
              </div>
            </div>
          )}
        </section>

        <section className="card totals">
          <div className="kv">
            <span>المجموع</span>
            <strong>{money(state, preview.subtotal, currency)}</strong>
            <span>خصم على الفاتورة</span>
            <input className="num-input" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
            {preview.taxes.map((t) => (
              <span key={t.tax.id} style={{ display: 'contents' }}>
                <span>{t.tax.name}</span>
                <strong>{money(state, t.amount, currency)}</strong>
              </span>
            ))}
            <span className="grand">الإجمالي</span>
            <strong className="grand">{money(state, preview.total, currency)}</strong>
            {currency !== base && rate > 0 && (
              <>
                <span>المقابل</span>
                <strong className="muted">{money(state, Math.round(preview.total * rate * 10 ** (state.currencies[base]!.decimals - state.currencies[currency]!.decimals)), base)}</strong>
              </>
            )}
            <span>{isSale ? 'المقبوض' : 'المدفوع'}</span>
            <input
              className="num-input"
              value={paidText ?? toInput(state, paid, currency)}
              onChange={(e) => setPaidText(e.target.value)}
              disabled={!partyId}
              title={!partyId ? 'الفاتورة النقدية تُدفع كاملة' : ''}
              inputMode="decimal"
            />
            <span>{isSale ? 'الصندوق' : 'من صندوق'}</span>
            <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
              {cashAccounts(state).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {partyId && preview.total - paid > 0 && (
              <>
                <span>الباقي بالدين</span>
                <strong className="bad">{money(state, preview.total - paid, currency)}</strong>
              </>
            )}
          </div>
          <button className="primary big" disabled={saving} onClick={save}>
            حفظ الفاتورة <small>(Ctrl+Enter)</small>
          </button>
        </section>
      </div>

      {newItem && (
        <ItemForm
          item={null}
          onClose={() => setNewItem(null)}
          onSaved={(item) => {
            // الحالة تتحدّث بعد الحفظ؛ نضع المادة في السطر مباشرة
            setLines((ls) => {
              const next = ls.map((l) => (l.key === newItem ? { ...l, itemId: item.id, description: item.name, price: isSale ? toInput(state, item.price, item.priceCurrency) : '' } : l));
              return [...next, emptyLine()];
            });
          }}
        />
      )}
      {newParty && <PartyForm party={null} defaultKind={isSale ? 'customer' : 'supplier'} onClose={() => setNewParty(false)} onSaved={(p) => setPartyId(p.id)} />}
    </div>
  );
}
