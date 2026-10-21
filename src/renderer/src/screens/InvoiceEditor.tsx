import { useMemo, useRef, useState } from 'react';
import { computeTaxes, findRate, INVOICE_KIND_NAMES, resolveScan, type CompanyState, type Invoice, type InvoiceKind, type Item, type Party } from '../../../core';
import { convertPrice, fxRates, money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { CurrencySelect, Field, itemMatches, itemOptions, PageHeader, partyOptions, Picker, ScanInput } from '../components/ui';
import { ItemForm } from './Items';
import { PartyForm } from './Parties';
import { Icon } from '../components/icons';

interface LineState {
  key: string;
  itemId: string | null;
  description: string;
  unit: string; // '' = الوحدة الأساسية
  qty: string;
  price: string;
  discount: string;
  batch: string;
  expiry: string;
  serials: string;
  manualPrice?: boolean; // كتب المستخدم السعر بيده (لا نعيد تسعيره)
}

const emptyLine = (): LineState => ({ key: uid(), itemId: null, description: '', unit: '', qty: '1', price: '', discount: '', batch: '', expiry: '', serials: '' });

/** الحسابات النقدية (الصناديق والبنك) المناسبة لعملة معيّنة. */
export function cashAccounts(state: CompanyState, currency?: string) {
  return Object.values(state.accounts).filter(
    (a) => !a.isGroup && !a.archived && a.type === 'asset' && (/^110[128]/.test(a.id) || a.parentId === '1101') && (!currency || !a.currency || a.currency === currency),
  );
}

/** سعر المادة حسب شريحة العميل والوحدة، محوّلاً لعملة الفاتورة. */
export function itemPrice(state: CompanyState, item: Item, opts: { party?: Party | null; unit?: string; currency: string; date: string; purchase?: boolean }): string {
  const rates = fxRates(state, opts.date);
  if (opts.purchase) {
    const unitCost = state.stock[item.id]?.lastCost ?? 0;
    const factor = item.units?.find((u) => u.name === opts.unit)?.factor ?? 1;
    const v = convertPrice(state, Math.round(unitCost * factor), state.info!.baseCurrency, opts.currency, rates);
    return v === null || v === 0 ? '' : toInput(state, v, opts.currency);
  }
  const unit = item.units?.find((u) => u.name === opts.unit);
  const tier = opts.party?.priceTier;
  let price = tier === 'wholesale' ? (item.wholesalePrice ?? item.price) : tier === 'special' ? (item.specialPrice ?? item.wholesalePrice ?? item.price) : item.price;
  if (unit) price = unit.price ?? Math.round(price * unit.factor);
  const v = convertPrice(state, price, item.priceCurrency, opts.currency, rates);
  return v === null ? '' : toInput(state, v, opts.currency);
}

export function InvoiceEditor({ kind: kindProp }: { kind: string }) {
  const kind = kindProp as InvoiceKind;
  const { state, call, notify, navigate, feature, can } = useCompany();
  const base = state.info!.baseCurrency;
  const isSale = kind === 'sale' || kind === 'sale_return';
  const stockIn = kind === 'purchase' || kind === 'sale_return';
  const [partyId, setPartyId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [currency, setCurrency] = useState(base);
  const [rateText, setRateText] = useState('');
  const [warehouseId, setWarehouseId] = useState(Object.keys(state.warehouses)[0] ?? 'main');
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [discount, setDiscount] = useState('');
  const [taxIds, setTaxIds] = useState<string[]>(() => (isSale ? Object.values(state.taxes).filter((t) => t.active && t.percent > 0).map((t) => t.id) : []));
  const [paidText, setPaidText] = useState<string | null>(null);
  // الخصم من الصندوق: كامل، لا (دين)، أو جزء. البرنامج بيتذكّر آخر اختيار لكل نوع فاتورة
  const payKey = `mizan.payMode.${kind}`;
  const [payMode, setPayModeState] = useState<'cash' | 'credit' | 'partial'>(() => {
    try {
      const v = localStorage.getItem(payKey);
      return v === 'credit' || v === 'partial' ? v : 'cash';
    } catch {
      return 'cash';
    }
  });
  const setPayMode = (m: 'cash' | 'credit' | 'partial') => {
    setPayModeState(m);
    try {
      localStorage.setItem(payKey, m);
    } catch {
      // ما في تخزين: بيضل الاختيار لهالفاتورة بس
    }
  };
  const [cashAccountId, setCashAccountId] = useState('');
  const [salesman, setSalesman] = useState('');
  const [notes, setNotes] = useState('');
  const [newItem, setNewItem] = useState<string | null>(null);
  const [newParty, setNewParty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const party = partyId ? state.parties[partyId] : null;
  const storedRate = findRate(state, currency, date);
  // الشركة بالدولار والفاتورة بالليرة: السعر بينكتب «الدولار بكم ليرة» ومنقلبه
  const invertRate = base === 'USD' && currency === 'SYP';
  const typedRate = Number(rateText) || 0;
  const rate = currency === base ? 1 : (typedRate ? (invertRate ? 1 / typedRate : typedRate) : storedRate || 0);
  const items = useMemo(() => itemOptions(state, (i) => isSale || i.kind !== 'composite'), [state, isSale]);
  const boxes = cashAccounts(state, currency);
  const cashId = boxes.some((b) => b.id === cashAccountId) ? cashAccountId : (boxes.find((b) => b.currency === currency) ?? boxes[0])?.id ?? '1101';
  const salesmen = useMemo(() => [...new Set(state.invoices.map((i) => i.salesman).filter(Boolean))] as string[], [state.invoices]);

  const priceFor = (item: Item, unit = '', p: Party | null | undefined = party, cur = currency) =>
    itemPrice(state, item, { party: p, unit, currency: cur, date, purchase: kind === 'purchase' || kind === 'purchase_return' });
  /** عند تغيير الزبون أو العملة: نعيد تسعير الأسطر التلقائية، ونلغي المبلغ المدفوع المكتوب. */
  const reprice = (p: Party | null | undefined, cur: string) => {
    setPaidText(null);
    setLines((ls) => ls.map((l) => (l.itemId && !l.manualPrice && state.items[l.itemId] ? { ...l, price: priceFor(state.items[l.itemId]!, l.unit, p, cur) } : l)));
  };
  const changeParty = (id: string | null) => {
    setPartyId(id);
    reprice(id ? (state.parties[id] ?? null) : null, currency);
  };
  const changeCurrency = (cur: string) => {
    setCurrency(cur);
    reprice(party, cur);
  };
  const setLine = (key: string, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const withEmpty = (ls: LineState[]) => (ls.some((l) => !l.itemId && !l.description) ? ls : [...ls, emptyLine()]);

  const chooseItem = (key: string, itemId: string | null, unit = '', qty = '1', price?: string) => {
    const item = itemId ? state.items[itemId] : null;
    setLines((ls) => withEmpty(ls.map((l) => (l.key === key ? { ...l, itemId, unit, qty, description: item?.name ?? '', price: price ?? (item ? priceFor(item, unit) : l.price), manualPrice: price !== undefined } : l))));
  };

  const scan = (code: string) => {
    const r = resolveScan(state, code);
    if (!r) return notify(`لا توجد مادة بالرمز ${code}`, 'error');
    const unit = r.unit ?? '';
    // سعر باركود الميزان مكتوب بعملة سعر المادة؛ نحوّله لعملة الفاتورة
    const scanned = r.price !== undefined ? convertPrice(state, r.price, r.item.priceCurrency, currency, fxRates(state, date)) : null;
    const priceOverride = scanned !== null ? toInput(state, scanned, currency) : undefined;
    setLines((ls) => {
      if (r.serial) {
        const has = (l: LineState) => l.serials.split(/[\s,،]+/).includes(r.serial!);
        if (ls.some(has)) return ls;
        const filled = ls.filter((l) => l.itemId || l.description);
        const same = filled.find((l) => l.itemId === r.item.id);
        if (same) return [...filled.map((l) => (l === same ? { ...l, qty: String(Number(l.qty || 0) + 1), serials: `${l.serials} ${r.serial}`.trim() } : l)), emptyLine()];
        return [...filled, { ...emptyLine(), itemId: r.item.id, description: r.item.name, unit, qty: '1', price: priceFor(r.item, unit), serials: r.serial }, emptyLine()];
      }
      const same = !r.qty && ls.find((l) => l.itemId === r.item.id && l.unit === unit && !r.item.trackSerial);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l));
      const filled = ls.filter((l) => l.itemId || l.description);
      return [
        ...filled,
        { ...emptyLine(), itemId: r.item.id, description: r.item.name, unit, qty: String(r.qty ?? 1), price: priceOverride ?? priceFor(r.item, unit) },
        emptyLine(),
      ];
    });
  };

  const used = useMemo(() => lines.filter((l) => l.itemId || l.description.trim()), [lines]);
  const preview = useMemo(() => {
    try {
      const amounts = used.map((l) => Math.round(Number(l.qty || 0) * parseAmount(state, l.price, currency)) - parseAmount(state, l.discount, currency));
      const subtotal = amounts.reduce((s, a) => s + a, 0);
      const disc = parseAmount(state, discount, currency);
      const t = computeTaxes(subtotal - disc, taxIds.map((id) => ({ ...state.taxes[id]!, active: true })));
      return { amounts, subtotal, disc, taxes: t.taxes, total: t.total, error: null as string | null };
    } catch (e) {
      return { amounts: [] as number[], subtotal: 0, disc: 0, taxes: [], total: 0, error: (e as Error).message };
    }
  }, [used, discount, taxIds, currency, state]);

  const paid = (() => {
    if (payMode === 'cash') return preview.total;
    if (payMode === 'credit') return 0;
    try {
      return paidText === null ? 0 : parseAmount(state, paidText, currency);
    } catch {
      return 0;
    }
  })();

  const save = async () => {
    if (savingRef.current) return; // منع الحفظ مرتين (Ctrl+Enter المتكرر)
    if (preview.error) return notify(preview.error, 'error');
    if (currency !== base && !rate) return notify('أدخل سعر الصرف', 'error');
    if (payMode !== 'cash' && !partyId) return notify(isSale ? 'اختار الزبون مشان ينسجّل الدين عليه' : 'اختار المورد مشان ينسجّل الدين إلو', 'error');
    savingRef.current = true;
    setSaving(true);
    try {
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
          ...(l.unit ? { unit: l.unit } : {}),
          price: parseAmount(state, l.price, currency),
          discount: parseAmount(state, l.discount, currency),
          ...(l.batch.trim() ? { batch: l.batch.trim() } : {}),
          ...(l.expiry ? { expiry: l.expiry } : {}),
          ...(l.serials.trim() ? { serials: l.serials.split(/[\s,،]+/).map((s) => s.trim()).filter(Boolean) } : {}),
        })),
        discount: preview.disc,
        taxIds,
        paid,
        cashAccountId: cashId,
        ...(salesman.trim() ? { salesman: salesman.trim() } : {}),
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
      savingRef.current = false;
      setSaving(false);
    }
  };

  const returnKind = kind === 'sale' ? 'sale_return' : kind === 'purchase' ? 'purchase_return' : null;
  const allowDiscount = can('discount.give');
  const warehouses = Object.values(state.warehouses);

  return (
    <div className="page invoice-editor" onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && void save()}>
      <PageHeader title={INVOICE_KIND_NAMES[kind]}>
        {returnKind && can(returnKind === 'sale_return' ? 'returns.create' : 'purchases.create') && <button onClick={() => navigate(returnKind)}>{INVOICE_KIND_NAMES[returnKind]}</button>}
      </PageHeader>

      <section className="card form-grid four">
        <Field label={isSale ? 'العميل' : 'المورد'}>
          <div className="with-button">
            <Picker options={partyOptions(state, isSale ? 'customer' : 'supplier')} value={partyId} onChange={changeParty} placeholder={isSale ? 'زبون نقدي (اختياري)' : 'مورد نقدي (اختياري)'} />
            {partyId && (
              <button type="button" className="icon" title="إزالة" onClick={() => changeParty(null)}>
                <Icon name="close" size={16} />
              </button>
            )}
            {can('parties.manage') && (
              <button type="button" className="icon" title="إضافة جديد" onClick={() => setNewParty(true)}>
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
          {party?.priceTier && party.priceTier !== 'retail' && <small className="muted">شريحة السعر: {party.priceTier === 'wholesale' ? 'جملة' : 'خاص'}</small>}
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={currency} onChange={changeCurrency} />
        </Field>
        {currency !== base && (
          <Field label={invertRate ? 'سعر الدولار (ل.س)' : `سعر الصرف (${state.currencies[base]?.symbol})`}>
            <input value={rateText} placeholder={storedRate ? String(invertRate ? Math.round(10000 / storedRate) / 10000 : storedRate) : 'أدخل السعر'} onChange={(e) => setRateText(e.target.value)} inputMode="decimal" />
          </Field>
        )}
        {warehouses.length > 1 && (
          <Field label="المستودع">
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {feature('salesmen') && isSale && (
          <Field label="المندوب">
            <input value={salesman} onChange={(e) => setSalesman(e.target.value)} list="salesmen" />
            <datalist id="salesmen">
              {salesmen.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        )}
      </section>

      <section className="card">
        <div className="scan-row">
          <ScanInput onScan={scan} placeholder="امسح الباركود (أو باركود الميزان) أو اكتب الرمز / رقم القطعة ثم Enter" />
        </div>
        <table className="table lines">
          <thead>
            <tr>
              <th style={{ width: '32%' }}>المادة / البيان</th>
              <th>الوحدة</th>
              <th>الكمية</th>
              <th>السعر</th>
              {allowDiscount && <th>الخصم</th>}
              <th className="num">المجموع</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const item = l.itemId ? state.items[l.itemId] : null;
              const stock = item?.kind === 'stock' ? (state.stock[item.id]?.qty[warehouseId] ?? 0) : null;
              const factor = item?.units?.find((u) => u.name === l.unit)?.factor ?? 1;
              const short = !stockIn && stock !== null && Number(l.qty) * factor > stock;
              const idx = used.indexOf(l);
              const batches = item?.trackExpiry ? Object.values(state.stock[item.id]?.batches ?? {}).filter((b) => b.warehouseId === warehouseId && b.qty > 0) : [];
              return (
                <tr key={l.key}>
                  <td>
                    {l.itemId ? (
                      <div className="line-item">
                        <strong>{l.description}</strong>
                        <small>
                          {[item?.code, item?.partNumber, stock !== null ? `الرصيد: ${stock}` : null].filter(Boolean).join(' · ')}
                          {short && <span className="bad"> — الكمية أكبر من الرصيد</span>}
                        </small>
                        {item?.trackExpiry &&
                          (stockIn ? (
                            <span className="line-extra">
                              <input placeholder="رقم الدفعة" value={l.batch} onChange={(e) => setLine(l.key, { batch: e.target.value })} />
                              <input type="date" title="تاريخ الصلاحية" value={l.expiry} onChange={(e) => setLine(l.key, { expiry: e.target.value })} />
                            </span>
                          ) : (
                            batches.length > 0 && (
                              <select className="line-extra" value={l.batch} onChange={(e) => setLine(l.key, { batch: e.target.value })}>
                                <option value="">الأقرب انتهاءً تلقائياً</option>
                                {batches.map((b) => (
                                  <option key={b.batch} value={b.batch}>
                                    {b.batch} — {b.expiry ?? ''} ({b.qty})
                                  </option>
                                ))}
                              </select>
                            )
                          ))}
                        {item?.trackSerial && (
                          <textarea
                            className="line-extra mono"
                            rows={1}
                            placeholder={`الأرقام التسلسلية / IMEI (${Number(l.qty) * factor}) مفصولة بمسافة`}
                            value={l.serials}
                            onChange={(e) => setLine(l.key, { serials: e.target.value })}
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="with-button">
                          <Picker options={items} value={null} onChange={(id) => chooseItem(l.key, id)} placeholder="ابحث عن مادة..." filter={(o, q) => itemMatches((o as (typeof items)[number]).item, q)} />
                          {can('items.manage') && (
                            <button type="button" className="icon" title="مادة جديدة" onClick={() => setNewItem(l.key)}>
                              <Icon name="plus" size={16} />
                            </button>
                          )}
                        </div>
                        <input
                          className="line-desc"
                          placeholder={isSale ? 'أو اكتب خدمة (أجور يد مثلاً)' : 'أو اكتب بياناً (مصاريف شحن مثلاً)'}
                          value={l.description}
                          onChange={(e) => setLines((ls) => withEmpty(ls.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x))))}
                        />
                      </>
                    )}
                  </td>
                  <td>
                    {item?.units?.length ? (
                      <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value, price: priceFor(item, e.target.value) })}>
                        <option value="">{item.unit}</option>
                        {item.units.map((u) => (
                          <option key={u.name} value={u.name}>
                            {u.name} ({u.factor})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">{item?.unit}</span>
                    )}
                  </td>
                  <td>
                    <input className="num-input" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" />
                  </td>
                  <td>
                    <input className="num-input" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value, manualPrice: true })} inputMode="decimal" />
                  </td>
                  {allowDiscount && (
                    <td>
                      <input className="num-input" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} inputMode="decimal" />
                    </td>
                  )}
                  <td className="num">{idx >= 0 ? money(state, preview.amounts[idx] ?? 0, currency) : ''}</td>
                  <td>
                    {(l.itemId || l.description) && (
                      <button className="icon" title="حذف السطر" onClick={() => setLines((ls) => withEmpty(ls.filter((x) => x.key !== l.key)))}>
                        <Icon name="close" size={16} />
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
          {Object.values(state.taxes).some((t) => t.percent > 0) && (
            <div className="field wide">
              <span>الضرائب</span>
              <div className="checks">
                {Object.values(state.taxes)
                  .filter((t) => t.percent > 0)
                  .map((t) => (
                    <label key={t.id}>
                      <input type="checkbox" checked={taxIds.includes(t.id)} onChange={(e) => setTaxIds(e.target.checked ? [...taxIds, t.id] : taxIds.filter((x) => x !== t.id))} />
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
            {allowDiscount && (
              <>
                <span>خصم على الفاتورة</span>
                <input className="num-input" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
              </>
            )}
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
          </div>
          <PaySwitch kind={kind} mode={payMode} onChange={setPayMode} />
          {payMode !== 'cash' && !partyId && <p className="bad small-note">{isSale ? 'اختار الزبون فوق مشان ينسجّل الدين عليه' : 'اختار المورد فوق مشان ينسجّل الدين إلو'}</p>}
          <div className="kv">
            {payMode === 'partial' && (
              <>
                <span>{kind === 'sale' || kind === 'purchase_return' ? 'المقبوض' : 'المدفوع'}</span>
                <input className="num-input" autoFocus value={paidText ?? ''} placeholder="0" onChange={(e) => setPaidText(e.target.value)} inputMode="decimal" />
              </>
            )}
            {payMode !== 'credit' && (
              <>
                <span>الصندوق</span>
                <select value={cashId} onChange={(e) => setCashAccountId(e.target.value)}>
                  {boxes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {preview.total - paid > 0 && (
              <>
                <span>الباقي بالدين</span>
                <strong className="bad">{money(state, preview.total - paid, currency)}</strong>
              </>
            )}
          </div>
          <button className="primary big" disabled={saving || used.length === 0} onClick={save}>
            حفظ الفاتورة <small>(Ctrl+Enter)</small>
          </button>
        </section>
      </div>

      {newItem && (
        <ItemForm
          item={null}
          onClose={() => setNewItem(null)}
          onSaved={(item) => setLines((ls) => withEmpty(ls.map((l) => (l.key === newItem ? { ...l, itemId: item.id, description: item.name, price: priceFor(item) } : l))))}
        />
      )}
      {newParty && <PartyForm party={null} defaultKind={isSale ? 'customer' : 'supplier'} onClose={() => setNewParty(false)} onSaved={(p) => changeParty(p.id)} />}
    </div>
  );
}

/** زر «ينخصم من الصندوق أو لا»: كامل / بالدين / جزء. */
function PaySwitch({ kind, mode, onChange }: { kind: InvoiceKind; mode: 'cash' | 'credit' | 'partial'; onChange: (m: 'cash' | 'credit' | 'partial') => void }) {
  const inflow = kind === 'sale' || kind === 'purchase_return';
  const labels = inflow
    ? { cash: 'انقبض كامل بالصندوق', credit: 'ما انقبض (دين عليه)', partial: 'قبضت جزء' }
    : { cash: 'ينخصم من الصندوق', credit: 'ما ينخصم (دين إلو)', partial: 'دفعت جزء' };
  return (
    <div className="pay-switch">
      {(['cash', 'credit', 'partial'] as const).map((m) => (
        <button key={m} type="button" className={`${m} ${mode === m ? 'active' : ''}`} onClick={() => onChange(m)}>
          {labels[m]}
        </button>
      ))}
    </div>
  );
}
