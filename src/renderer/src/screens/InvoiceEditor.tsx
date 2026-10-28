import { useEffect, useMemo, useRef, useState } from 'react';
import { computeTaxes, findRate, INVOICE_KIND_NAMES, itemTitle, itemUnitCost, matchSerials, priceFromMargin, resolveScan, weighingText, type CompanyState, type ScanResult, type SerialMatch, type Invoice, type InvoiceKind, type Item, type Party, type Weighing } from '../../../core';
import { convertPrice, fxRates, money, parseAmount, rateInverted, toInput, today, uid, useCompany } from '../api';
import { CurrencySelect, Field, ItemName, itemMatches, itemOptions, Modal, PageHeader, partyOptions, Picker, ScanInput } from '../components/ui';
import { invoiceDrafts } from '../drafts';
import { ItemForm } from './Items';
import { PartyForm } from './Parties';
import { Icon } from '../components/icons';
import { WeighingModal, weightsFromQty } from '../components/Weighing';

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
  src?: { amount: number; currency: string }; // السعر اليدوي بالعملة اللي انكتب فيها، لنحوّله إذا تغيّرت عملة الفاتورة أو سعر الصرف
  note?: string; // ملاحظة السطر (بتنحفظ متل ما هي عند تعديل فاتورة)
  weighing?: Weighing; // وزنات قفص قفص (الكمية = الصافي)
  sell?: string; // فاتورة الشراء (صيدلية مع موردين): سعر الصيدلية الجديد
  dealer?: string; // وسعر المورّد الجديد
}

/** حالة الفاتورة المفتوحة اللي بتنحفظ لما المستخدم يروح على شاشة تانية. */
interface DraftData {
  partyId: string | null;
  date: string;
  currency: string;
  rateText: string;
  warehouseId: string;
  lines: LineState[];
  discount: string;
  taxIds: string[];
  paidText: string | null;
  payMode: 'cash' | 'credit' | 'partial';
  cashAccountId: string;
  salesman: string;
  notes: string;
}

const emptyLine = (): LineState => ({ key: uid(), itemId: null, description: '', unit: '', qty: '1', price: '', discount: '', batch: '', expiry: '', serials: '' });

/** الحسابات النقدية (الصناديق والبنك) المناسبة لعملة معيّنة. */
export function cashAccounts(state: CompanyState, currency?: string) {
  return Object.values(state.accounts).filter(
    (a) => !a.isGroup && !a.archived && a.type === 'asset' && (/^110[128]/.test(a.id) || a.parentId === '1101') && (!currency || !a.currency || a.currency === currency),
  );
}

/** سعر المادة حسب شريحة العميل والوحدة، محوّلاً لعملة الفاتورة. */
export function itemPrice(state: CompanyState, item: Item, opts: { party?: Party | null; unit?: string; currency: string; date: string; purchase?: boolean; rates?: Record<string, number> }): string {
  const rates = opts.rates ?? fxRates(state, opts.date);
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

export function InvoiceEditor({ kind: kindProp, editId, draftId: draftProp }: { kind: string; editId?: string; draftId?: string }) {
  const kind = kindProp as InvoiceKind;
  const { state, call, notify, navigate, feature, can } = useCompany();
  const base = state.info!.baseCurrency;
  const isSale = kind === 'sale' || kind === 'sale_return';
  const stockIn = kind === 'purchase' || kind === 'sale_return';
  // تعديل فاتورة: منعبّي كل شي من الفاتورة القديمة، وعند الحفظ بتنلغى وبتنسجّل الجديدة بنفس الرقم
  const editing = editId ? state.invoices.find((i) => i.id === editId && i.kind === kind && !i.voidEntryId) : undefined;
  const editInput = (v: number) => (editing ? toInput(state, v, editing.currency) : '');
  // الفاتورة المفتوحة (إذا راح على شاشة تانية ورجع، أو فاتح كذا فاتورة مع بعض)
  const company = state.info?.name ?? '';
  const [draftId] = useState(() => draftProp ?? invoiceDrafts.latest(company, kind)?.id ?? uid());
  const [d] = useState(() => (editing ? undefined : (invoiceDrafts.get(company, draftId)?.data as DraftData | undefined)));
  const [partyId, setPartyId] = useState<string | null>(editing?.partyId ?? d?.partyId ?? null);
  const [date, setDate] = useState(editing?.date ?? d?.date ?? today());
  const [currency, setCurrency] = useState(editing?.currency ?? (d && state.currencies[d.currency] ? d.currency : base));
  const [rateText, setRateText] = useState(() => (editing && editing.currency !== base ? String(rateInverted(state, editing.currency) ? Math.round(10000 / editing.rate) / 10000 : editing.rate) : (d?.rateText ?? '')));
  const [warehouseId, setWarehouseId] = useState(editing?.warehouseId ?? (d && state.warehouses[d.warehouseId] ? d.warehouseId : undefined) ?? Object.keys(state.warehouses)[0] ?? 'main');
  const [lines, setLines] = useState<LineState[]>(() =>
    editing
      ? [
          ...editing.lines.map((l) => ({
            ...emptyLine(),
            itemId: l.itemId,
            description: l.description,
            unit: l.unit ?? '',
            qty: String(l.qty),
            price: editInput(l.price),
            discount: l.discount ? editInput(l.discount) : '',
            batch: l.batches?.[0]?.batch ?? '',
            expiry: l.batches?.[0]?.expiry ?? '',
            serials: (l.serials ?? []).join(' '),
            manualPrice: true,
            src: { amount: l.price, currency: editing.currency },
            ...(l.note ? { note: l.note } : {}),
            ...(l.weighing ? { weighing: l.weighing } : {}),
          })),
          emptyLine(),
        ]
      : d?.lines.length
        ? d.lines
        : [emptyLine()],
  );
  const [discount, setDiscount] = useState(editing?.discount ? editInput(editing.discount) : (d?.discount ?? ''));
  const [taxIds, setTaxIds] = useState<string[]>(() => (editing ? editing.taxIds : d ? d.taxIds.filter((id) => state.taxes[id]) : isSale ? Object.values(state.taxes).filter((t) => t.active && t.percent > 0).map((t) => t.id) : []));
  const [paidText, setPaidText] = useState<string | null>(editing && editing.paid !== editing.total && editing.paid > 0 ? editInput(editing.paid) : (d?.paidText ?? null));
  // الخصم من الصندوق: كامل، لا (دين)، أو جزء. البرنامج بيتذكّر آخر اختيار لكل نوع فاتورة
  const payKey = `mizan.payMode.${kind}`;
  const [payMode, setPayModeState] = useState<'cash' | 'credit' | 'partial'>(() => {
    if (editing) return editing.paid >= editing.total ? 'cash' : editing.paid === 0 ? 'credit' : 'partial';
    if (d) return d.payMode;
    try {
      const v = localStorage.getItem(payKey);
      return v === 'credit' || v === 'partial' ? v : 'cash';
    } catch {
      return 'cash';
    }
  });
  const setPayMode = (m: 'cash' | 'credit' | 'partial') => {
    setPayModeState(m);
    if (editing) return; // تعديل فاتورة قديمة ما بيغيّر الاختيار المحفوظ
    try {
      localStorage.setItem(payKey, m);
    } catch {
      // ما في تخزين: بيضل الاختيار لهالفاتورة بس
    }
  };
  const [cashAccountId, setCashAccountId] = useState(editing?.cashAccountId ?? d?.cashAccountId ?? '');
  const [salesman, setSalesman] = useState(editing?.salesman ?? d?.salesman ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? d?.notes ?? '');
  const [newItem, setNewItem] = useState<string | null>(null);
  const [weighLine, setWeighLine] = useState<string | null>(null);
  // صيدلية مع موردين: بفاتورة الشراء منحط سعر الصيدلية وسعر المورّد لكل مادة
  const setPrices = feature('dealers') && kind === 'purchase' && can('items.manage');
  const margins = state.info?.pricing ?? {};
  const costOf = (l: LineState) => {
    const item = l.itemId ? state.items[l.itemId] : null;
    const factor = item?.units?.find((u) => u.name === l.unit)?.factor ?? 1;
    try {
      return parseAmount(state, l.price, currency) / factor;
    } catch {
      return 0;
    }
  };
  const suggest = (l: LineState, m: number | undefined) => {
    const item = l.itemId ? state.items[l.itemId] : null;
    const c = costOf(l);
    return item && m && c > 0 && item.priceCurrency === currency ? toInput(state, priceFromMargin(c, m, 10 ** (state.currencies[currency]?.decimals ?? 2) * 5), currency) : '';
  };
  const fillPrices = () =>
    setLines((ls) => ls.map((l) => (l.itemId ? { ...l, sell: suggest(l, margins.retailMargin) || l.sell, dealer: suggest(l, margins.dealerMargin) || l.dealer } : l)));
  const weighBirds = feature('poultry');
  const [newParty, setNewParty] = useState(false);
  const [serialChoices, setSerialChoices] = useState<{ code: string; matches: SerialMatch[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const party = partyId ? state.parties[partyId] : null;
  const storedRate = findRate(state, currency, date);
  // بعض العملات سعرها بينكتب مقلوب (الشركة بالدولار والفاتورة بالليرة: «الدولار بكم ليرة»)
  const invertRate = rateInverted(state, currency);
  const typedRate = Number(rateText) || 0;
  const rate = currency === base ? 1 : (typedRate ? (invertRate ? 1 / typedRate : typedRate) : storedRate || 0);
  const items = useMemo(() => itemOptions(state, (i) => isSale || i.kind !== 'composite'), [state, isSale]);
  const boxes = cashAccounts(state, currency);
  const cashId = boxes.some((b) => b.id === cashAccountId) ? cashAccountId : (boxes.find((b) => b.currency === currency) ?? boxes[0])?.id ?? '1101';
  const salesmen = useMemo(() => [...new Set(state.invoices.map((i) => i.salesman).filter(Boolean))] as string[], [state.invoices]);

  /** أسعار الصرف للتحويل: المخزّنة، ومكانها السعر المكتوب بالفاتورة إذا انكتب. */
  const ratesFor = (cur: string, typed: string) => {
    const r = fxRates(state, date);
    const t = Number(typed) || 0;
    if (cur !== base && t) r[cur] = rateInverted(state, cur) ? 1 / t : t;
    return r;
  };
  const priceFor = (item: Item, unit = '', p: Party | null | undefined = party, cur = currency, rates = ratesFor(currency, rateText)) =>
    itemPrice(state, item, { party: p, unit, currency: cur, date, rates, purchase: kind === 'purchase' || kind === 'purchase_return' });
  /** يحوّل مبلغ مكتوب من عملة لعملة (إذا ما في سعر صرف بيضل متل ما هو). */
  const convertText = (text: string, from: string, to: string, rates: Record<string, number>) => {
    if (!text.trim() || from === to) return text;
    try {
      const v = convertPrice(state, parseAmount(state, text, from), from, to, rates);
      return v === null ? text : toInput(state, v, to);
    } catch {
      return text;
    }
  };
  /**
   * عند تغيير الزبون أو العملة أو سعر الصرف: الأسطر التلقائية بتتسعّر من جديد،
   * والأسعار المكتوبة باليد بتتحوّل من العملة اللي انكتبت فيها (6$ بتصير 6×السعر بالليرة).
   */
  const reprice = (p: Party | null | undefined, cur: string, typed: string) => {
    const rates = ratesFor(cur, typed);
    if (currency !== cur && currency !== base && rate) rates[currency] = rate; // السعر المكتوب للعملة القديمة
    setLines((ls) =>
      ls.map((l) => {
        const item = l.itemId ? state.items[l.itemId] : undefined;
        const discount = convertText(l.discount, currency, cur, rates);
        if (item && !l.manualPrice) return { ...l, discount, price: priceFor(item, l.unit, p, cur, rates) };
        if (l.src) {
          const v = l.src.currency === cur ? l.src.amount : convertPrice(state, l.src.amount, l.src.currency, cur, rates);
          return v === null ? { ...l, discount } : { ...l, discount, price: toInput(state, v, cur) };
        }
        return { ...l, discount, price: convertText(l.price, currency, cur, rates) };
      }),
    );
    return rates;
  };
  const changeParty = (id: string | null) => {
    setPartyId(id);
    setPaidText(null);
    reprice(id ? (state.parties[id] ?? null) : null, currency, rateText);
  };
  const changeCurrency = (cur: string) => {
    if (cur === currency) return;
    const rates = reprice(party, cur, '');
    setDiscount((d) => convertText(d, currency, cur, rates));
    setPaidText(null);
    setCurrency(cur);
    setRateText('');
  };
  const changeRate = (text: string) => {
    setRateText(text);
    reprice(party, currency, text);
  };
  const priceSrc = (text: string) => {
    try {
      return text.trim() ? { amount: parseAmount(state, text, currency), currency } : undefined;
    } catch {
      return undefined;
    }
  };
  const setLine = (key: string, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const withEmpty = (ls: LineState[]) => (ls.some((l) => !l.itemId && !l.description) ? ls : [...ls, emptyLine()]);

  const chooseItem = (key: string, itemId: string | null, unit = '', qty = '1', price?: string) => {
    const item = itemId ? state.items[itemId] : null;
    setLines((ls) => withEmpty(ls.map((l) => (l.key === key ? { ...l, itemId, unit, qty, description: item ? itemTitle(item) : '', price: price ?? (item ? priceFor(item, unit) : l.price), manualPrice: price !== undefined } : l))));
  };

  const scan = (code: string) => {
    const r = kind === 'sale_return' ? null : resolveScan(state, code);
    if (r?.item.dealerId) return notify(`«${r.item.name}» من بضاعة مورّد، بتنباع من شاشة الموردين`, 'error');
    if (r) return addScanned(r);
    // آخر أرقام الـ IMEI / الرقم التسلسلي (بالمرتجع: من الأجهزة المبيوعة)
    const m = matchSerials(state, code, { sold: kind === 'sale_return' });
    const exact = m.filter((x) => x.serial.toLowerCase().endsWith(code.trim().toLowerCase()));
    if (exact.length === 1) return addSerial(exact[0]!);
    if (m.length === 1) return addSerial(m[0]!);
    if (m.length > 1) return setSerialChoices({ code: code.trim(), matches: m });
    const plain = kind === 'sale_return' ? resolveScan(state, code) : null;
    if (plain) return addScanned(plain);
    notify(`لا توجد مادة بالرمز ${code}`, 'error');
  };

  const addSerial = (m: SerialMatch) => {
    setSerialChoices(null);
    // بالمرتجع: الجهاز بيرجع بسعر ما انباع فيه، والزبون نفسه إذا لسا ما انختار
    if (m.sold && m.partyId && !partyId) changeParty(m.partyId);
    const v = m.price ? convertPrice(state, m.price.amount, m.price.currency, currency, ratesFor(currency, rateText)) : null;
    addScanned({ item: m.item, serial: m.serial }, v !== null && m.price ? { price: toInput(state, v, currency), src: m.price } : undefined);
  };

  const addScanned = (r: ScanResult, sold?: { price: string; src: { amount: number; currency: string } }) => {
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
        return [...filled, { ...emptyLine(), itemId: r.item.id, description: itemTitle(r.item), unit, qty: '1', price: sold?.price ?? priceFor(r.item, unit), ...(sold ? { manualPrice: true, src: sold.src } : {}), serials: r.serial }, emptyLine()];
      }
      const same = !r.qty && ls.find((l) => l.itemId === r.item.id && l.unit === unit && !r.item.trackSerial);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l));
      const filled = ls.filter((l) => l.itemId || l.description);
      return [
        ...filled,
        { ...emptyLine(), itemId: r.item.id, description: itemTitle(r.item), unit, qty: String(r.qty ?? 1), price: priceOverride ?? priceFor(r.item, unit), ...(priceOverride !== undefined ? { manualPrice: true, src: { amount: r.price!, currency: r.item.priceCurrency } } : {}) },
        emptyLine(),
      ];
    });
  };

  const used = useMemo(() => lines.filter((l) => l.itemId || l.description.trim()), [lines]);

  // نحفظ الفاتورة المفتوحة مع كل تعديل (لتضل موجودة إذا راح على شاشة تانية)، والفاضية ما منحفظها
  const savedRef = useRef(false);
  useEffect(() => {
    if (editing) return;
    window.dispatchEvent(new CustomEvent('wazn:draft', { detail: draftId }));
    return () => void window.dispatchEvent(new CustomEvent('wazn:draft', { detail: null }));
  }, [editing, draftId]);
  useEffect(() => {
    if (editing || savedRef.current) return;
    if (!used.length && !partyId && !notes.trim()) return invoiceDrafts.remove(company, draftId);
    const data: DraftData = { partyId, date, currency, rateText, warehouseId, lines, discount, taxIds, paidText, payMode, cashAccountId, salesman, notes };
    invoiceDrafts.save(company, { id: draftId, kind, title: (partyId && state.parties[partyId]?.name) || (isSale ? 'زبون نقدي' : 'مورد نقدي'), count: used.length, updated: Date.now(), data });
  }, [editing, company, draftId, kind, isSale, state.parties, used, partyId, date, currency, rateText, warehouseId, lines, discount, taxIds, paidText, payMode, cashAccountId, salesman, notes]);
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

  // ربح الفاتورة وقت البيع (تقديري بمتوسط التكلفة الحالي)، بالعملة الأساسية. بينطفى من الإعدادات
  const profit = useMemo(() => {
    if (kind !== 'sale' || !can('costs.view') || state.info!.print?.showInvoiceProfit === false || !used.length || preview.error || !(rate > 0)) return null;
    const scale = 10 ** (state.currencies[base]!.decimals - state.currencies[currency]!.decimals);
    const revenue = Math.round((preview.subtotal - preview.disc) * rate * scale);
    let cost = 0;
    for (const l of used) {
      if (!l.itemId) continue;
      const item = state.items[l.itemId];
      const factor = (l.unit && item?.units?.find((u) => u.name === l.unit)?.factor) || 1;
      cost += itemUnitCost(state, l.itemId) * Number(l.qty || 0) * factor;
    }
    cost = Math.round(cost);
    return { revenue, cost, profit: revenue - cost };
  }, [kind, can, state, used, preview, rate, base, currency]);

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
    if (payMode !== 'cash' && !partyId) return notify(isSale ? 'اختر العميل ليُسجَّل الدين عليه' : 'اختر المورد ليُسجَّل الدين له', 'error');
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
          ...(l.note ? { note: l.note } : {}),
          ...(l.weighing ? { weighing: l.weighing } : {}),
        })),
        discount: preview.disc,
        taxIds,
        paid,
        cashAccountId: cashId,
        ...(salesman.trim() ? { salesman: salesman.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const res = editing ? await call<Invoice>('replaceInvoice', editing.id, draft) : await call<Invoice>('postInvoice', draft);
      if (res && setPrices) {
        // أسعار البيع الجديدة من فاتورة الشراء: سعر الصيدلية وسعر المورّد
        let n = 0;
        for (const l of used) {
          const item = l.itemId ? state.items[l.itemId] : null;
          if (!item || (!l.sell?.trim() && !l.dealer?.trim())) continue;
          const price = l.sell?.trim() ? parseAmount(state, l.sell, item.priceCurrency) : item.price;
          const dealerPrice = l.dealer?.trim() ? parseAmount(state, l.dealer, item.priceCurrency) : item.dealerPrice;
          if (price === item.price && dealerPrice === item.dealerPrice) continue;
          if (await call('saveItem', { ...item, price, ...(dealerPrice !== undefined ? { dealerPrice } : {}) })) n++;
        }
        if (n) notify(`انحدّثت أسعار ${n} مادة`);
      }
      if (res) {
        notify(editing ? `تم تعديل ${INVOICE_KIND_NAMES[kind]} رقم ${res.value.number}` : `تم حفظ ${INVOICE_KIND_NAMES[kind]} رقم ${res.value.number}`);
        if (!editing) {
          savedRef.current = true;
          invoiceDrafts.remove(company, draftId);
        }
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
      <PageHeader title={editing ? `تعديل ${INVOICE_KIND_NAMES[kind]} رقم ${editing.number}` : INVOICE_KIND_NAMES[kind]}>
        {editing && <button onClick={() => navigate('invoice', editing.id)}>إلغاء التعديل</button>}
        {!editing && (
          <button onClick={() => navigate(kind, `draft:${uid()}`)} title="بتضل هالفاتورة مفتوحة وبترجعلها من الشريط فوق">
            <Icon name="plus" size={16} /> فاتورة جديدة مع هي
          </button>
        )}
        {!editing && returnKind && can(returnKind === 'sale_return' ? 'returns.create' : 'purchases.create') && <button onClick={() => navigate(returnKind)}>{INVOICE_KIND_NAMES[returnKind]}</button>}
      </PageHeader>
      {editing && <div className="banner">عم تعدّل الفاتورة رقم {editing.number}. لما تحفظ، القديمة بتنلغى وبتنسجّل هي بنفس الرقم، والمخزون والحسابات بيتصلّحوا لحالهن (والقديمة بتضل بالسجل ملغاة).</div>}

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
          <Field label={invertRate ? `سعر الصرف: 1 ${state.currencies[base]?.symbol} = ؟ ${state.currencies[currency]?.symbol}` : `سعر الصرف: 1 ${state.currencies[currency]?.symbol} = ؟ ${state.currencies[base]?.symbol}`}>
            <input value={rateText} placeholder={storedRate ? String(invertRate ? Math.round(10000 / storedRate) / 10000 : storedRate) : 'أدخل السعر'} onChange={(e) => changeRate(e.target.value)} inputMode="decimal" />
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
          <ScanInput onScan={scan} placeholder={feature('serials') ? 'امسح الباركود أو اكتب الرمز / آخر أرقام الـ IMEI ثم Enter' : 'امسح الباركود (أو باركود الميزان) أو اكتب الرمز / رقم القطعة ثم Enter'} />
        </div>
        {setPrices && (
          <div className="sell-prices-bar">
            <span className="muted">
              أسعار البيع: اكتب سعر الصيدلية وسعر المورّد تحت كل مادة، أو احسبهن من سعر الشراء
              {margins.retailMargin || margins.dealerMargin ? ` (ربح الصيدلية ${margins.retailMargin ?? 0}% · المورّد ${margins.dealerMargin ?? 0}%)` : ' (حط نسب الربح من شاشة الموردين)'}
            </span>
            {(margins.retailMargin || margins.dealerMargin) && (
              <button type="button" className="small" onClick={fillPrices}>
                احسب الأسعار بالنسب
              </button>
            )}
          </div>
        )}
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
              // عند التعديل: الكمية اللي بالفاتورة القديمة بترجع للمستودع قبل الجديدة
              const back = editing && editing.warehouseId === warehouseId && item ? editing.lines.filter((x) => x.itemId === item.id).reduce((s, x) => s + x.qty * (x.factor ?? 1), 0) * (stockIn ? -1 : 1) : 0;
              const stock = item?.kind === 'stock' ? (state.stock[item.id]?.qty[warehouseId] ?? 0) + back : null;
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
                        {setPrices && (
                          <span className="sell-prices">
                            <label>
                              سعر الصيدلية
                              <input className="num-input" inputMode="decimal" placeholder={suggest(l, margins.retailMargin) || (item ? toInput(state, item.price, item.priceCurrency) : '')} value={l.sell ?? ''} onChange={(e) => setLine(l.key, { sell: e.target.value })} />
                            </label>
                            <label>
                              سعر المورّد
                              <input className="num-input" inputMode="decimal" placeholder={suggest(l, margins.dealerMargin) || (item?.dealerPrice ? toInput(state, item.dealerPrice, item.priceCurrency) : '')} value={l.dealer ?? ''} onChange={(e) => setLine(l.key, { dealer: e.target.value })} />
                            </label>
                          </span>
                        )}
                        {l.weighing && <small className="weigh-note">{weighingText(l.weighing, l.unit || item?.unit || 'كغ')}</small>}
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
                    <div className="qty-cell">
                      <input
                        className="num-input"
                        value={l.qty}
                        title={l.weighing ? 'الكمية من الوزنات — اكبس زر الميزان لتعدّلها' : feature('poultry') ? 'فيك تكتب الوزنات: 99+110+114' : undefined}
                        onChange={(e) => {
                          const { weighing: _w, ...rest } = l;
                          setLines((ls) => ls.map((x) => (x.key === l.key ? { ...rest, qty: e.target.value } : x)));
                        }}
                        onBlur={(e) => {
                          const ws = weightsFromQty(e.target.value);
                          if (ws?.length) setLine(l.key, { qty: String(Math.round(ws.reduce((a, b) => a + b, 0) * 1000) / 1000), weighing: { weights: ws } });
                        }}
                        inputMode="decimal"
                      />
                      {feature('poultry') && (l.itemId || l.description) && (
                        <button type="button" className={`icon${l.weighing ? ' on' : ''}`} title={l.weighing ? `${l.weighing.weights.length} وزنات` : 'وزنات قفص قفص'} onClick={() => setWeighLine(l.key)}>
                          <Icon name="weight" size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <input className="num-input" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value, manualPrice: true, src: priceSrc(e.target.value) })} inputMode="decimal" />
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
          {profit && (
            <div className={`profit-box ${profit.profit < 0 ? 'loss' : ''}`} title="صافي المبيع بدون الضريبة ناقص تكلفة البضاعة (بمتوسط التكلفة الحالي)">
              <span>{profit.profit < 0 ? 'خسارة الفاتورة' : 'ربح الفاتورة'}</span>
              <strong>{money(state, Math.abs(profit.profit), base)}</strong>
              {profit.revenue > 0 && <small>{Math.round((profit.profit / profit.revenue) * 100)}% · التكلفة {money(state, profit.cost, base)}</small>}
            </div>
          )}
          <PaySwitch kind={kind} mode={payMode} onChange={setPayMode} />
          {payMode !== 'cash' && !partyId && <p className="bad small-note">{isSale ? 'اختر العميل في الأعلى ليُسجَّل الدين عليه' : 'اختر المورد في الأعلى ليُسجَّل الدين له'}</p>}
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

      {weighLine && (() => {
        const l = lines.find((x) => x.key === weighLine);
        if (!l) return null;
        const item = l.itemId ? state.items[l.itemId] : null;
        return (
          <WeighingModal
            {...(l.weighing ? { value: l.weighing } : {})}
            unit={l.unit || item?.unit || 'كيلو'}
            birds={weighBirds && !isSale}
            onClose={() => setWeighLine(null)}
            onSave={(w) => {
              const { weighing: _w, ...rest } = l;
              setLines((ls) => ls.map((x) => (x.key === l.key ? (w ? { ...rest, weighing: w, qty: String(Math.round((w.weights.reduce((a, b) => a + b, 0) - (w.tare ?? 0)) * 1000) / 1000) } : rest) : x)));
              setWeighLine(null);
            }}
          />
        );
      })()}
      {newItem && (
        <ItemForm
          item={null}
          onClose={() => setNewItem(null)}
          onSaved={(item) => setLines((ls) => withEmpty(ls.map((l) => (l.key === newItem ? { ...l, itemId: item.id, description: item.name, price: priceFor(item) } : l))))}
        />
      )}
      {serialChoices && (
        <Modal title={`أجهزة رقمها فيه ${serialChoices.code}`} onClose={() => setSerialChoices(null)} width={520}>
          <p className="muted">في أكتر من جهاز، اختار الجهاز:</p>
          <div className="serial-choices">
            {serialChoices.matches.map((m) => (
              <button key={m.serial} type="button" onClick={() => addSerial(m)}>
                <ItemName item={m.item} strong />
                <SerialHit serial={m.serial} q={serialChoices.code} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {newParty && <PartyForm party={null} defaultKind={isSale ? 'customer' : 'supplier'} onClose={() => setNewParty(false)} onSaved={(p) => changeParty(p.id)} />}
    </div>
  );
}

/**
 * شريط الفواتير المفتوحة (فوق كل الشاشات): المستخدم بيقدر يشتغل شي تاني أو يفتح فاتورة تانية،
 * وبيرجع لأي فاتورة متل ما تركها. ما بيطلع إلا إذا في فاتورة مفتوحة فيها شي.
 */
export function OpenInvoices() {
  const { state, navigate, screenKey } = useCompany();
  const company = state.info?.name ?? '';
  const drafts = invoiceDrafts.use(company);
  const [current, setCurrent] = useState<string | null>(null);
  // منعرف أي فاتورة مفتوحة هلق من شاشة الفاتورة نفسها
  useEffect(() => {
    const on = (e: Event) => setCurrent((e as CustomEvent<string | null>).detail);
    window.addEventListener('wazn:draft', on);
    return () => window.removeEventListener('wazn:draft', on);
  }, []);
  const inEditor = screenKey in INVOICE_KIND_NAMES;
  if (!drafts.length || (drafts.length === 1 && inEditor && current === drafts[0]!.id)) return null;
  return (
    <div className="open-invoices" role="tablist" aria-label="الفواتير المفتوحة">
      <span className="muted">
        <Icon name="receipt" size={14} /> فواتير مفتوحة:
      </span>
      {drafts.map((d) => (
        <span key={d.id} className={`open-invoice ${inEditor && current === d.id ? 'active' : ''}`}>
          <button type="button" role="tab" onClick={() => navigate(d.kind, `draft:${d.id}`)}>
            {INVOICE_KIND_NAMES[d.kind as InvoiceKind] ?? d.kind} · {d.title}
            {d.count > 0 && <small> ({d.count})</small>}
          </button>
          <button
            type="button"
            className="close"
            title="تجاهل هالفاتورة"
            onClick={() => {
              if (!confirm('تتجاهل هالفاتورة؟ ما رح تنحفظ.')) return;
              invoiceDrafts.remove(company, d.id);
              if (inEditor && current === d.id) navigate(d.kind, `draft:${uid()}`);
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

/** الرقم التسلسلي مع تعليم الأرقام اللي انكتبت. */
function SerialHit({ serial, q }: { serial: string; q: string }) {
  const i = serial.toLowerCase().lastIndexOf(q.toLowerCase());
  return (
    <span className="mono" dir="ltr">
      {i < 0 ? serial : (
        <>
          {serial.slice(0, i)}
          <b>{serial.slice(i, i + q.length)}</b>
          {serial.slice(i + q.length)}
        </>
      )}
    </span>
  );
}

/** زر «ينخصم من الصندوق أو لا»: كامل / بالدين / جزء. */
function PaySwitch({ kind, mode, onChange }: { kind: InvoiceKind; mode: 'cash' | 'credit' | 'partial'; onChange: (m: 'cash' | 'credit' | 'partial') => void }) {
  const inflow = kind === 'sale' || kind === 'purchase_return';
  const labels = inflow
    ? { cash: 'قبض كامل في الصندوق', credit: 'دون قبض (دين عليه)', partial: 'قبض جزئي' }
    : { cash: 'خصم من الصندوق', credit: 'دون خصم (دين له)', partial: 'دفع جزئي' };
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
