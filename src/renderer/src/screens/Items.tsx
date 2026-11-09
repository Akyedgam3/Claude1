import { useMemo, useState } from 'react';
import { applyListPricing, attributesFor, niceUnitCost, buyDiscountOf, generateVariants, itemPlace, itemPlacesText, listPrices, withPlace, type Item, type ItemKind, type ItemUnit, type RecipeLine } from '../../../core';
import { api, major, money, unitMoney, parseAmount, parsePrice, qtyText, toInput, today, uid, useCompany } from '../api';
import { Barcode, ExportButtons, usePrinter } from '../components/print';
import { CameraScanButton, ColorPicker, ConfirmButton, CurrencySelect, ItemName, Empty, Field, itemMatches, itemOptions, Modal, PageHeader, Picker, SearchBox, Tabs } from '../components/ui';
import { Icon } from '../components/icons';
import { PlaceInput } from '../components/PlaceInput';
import { DealerForm } from './Dealers';

export function Items({ initialQuery }: { initialQuery?: string } = {}) {
  const { state, profile, feature, can, call, notify, navigate } = useCompany();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [variants, setVariants] = useState(false);
  const [labels, setLabels] = useState<Item[] | null>(null);
  const [placing, setPlacing] = useState(false);
  const [adding, setAdding] = useState<Item | null>(null);
  const showCost = can('costs.view');
  const canEdit = can('items.manage');

  const categories = useMemo(() => [...new Set([...profile.categories, ...Object.values(state.items).map((i) => i.category).filter(Boolean)])] as string[], [state.items, profile]);
  const items = useMemo(
    () =>
      Object.values(state.items)
        .filter((i) => !i.archived && itemMatches(i, query) && (!category || i.category === category))
        .sort((a, b) => a.code.localeCompare(b.code, 'ar', { numeric: true })),
    [state.items, query, category],
  );

  const importExcel = async () => {
    try {
      const rows = await api.importExcel();
      if (!rows) return;
      const byCode = new Map(Object.values(state.items).map((i) => [i.code, i]));
      const existingCodes = new Set(byCode.keys());
      const base = state.info!.baseCurrency;
      const parsed: Item[] = [];
      // الكمية والتكلفة (اختياريين): بينسجّلوا بضاعة أول المدة
      const stock: { itemId: string; qty: number; unitCost: number }[] = [];
      let skippedStock = 0;
      const num = (v: unknown) => Number(String(v ?? '').replace(/[,،\s]/g, '').replace('٫', '.')) || 0;
      for (const r of rows) {
        const name = String(r['الاسم'] ?? '').trim();
        if (!name) continue;
        const qty = num(r['الكمية']);
        const cost = String(r['التكلفة'] ?? '').trim() ? parsePrice(state, String(r['التكلفة']).replace(/[,،\s]/g, ''), base) : 0;
        const code = String(r['الرمز'] ?? '').trim() || nextCode([...existingCodes]);
        const old = byCode.get(code);
        if (old) {
          // مادة مستوردة من قبل: منضيف كميتها بس إذا رصيدها لسا صفر (حتى ما تتضاعف لو انعاد الاستيراد)
          if (qty > 0) {
            if (old.kind === 'stock' && !old.trackSerial && !(state.stock[old.id]?.totalQty ?? 0)) stock.push({ itemId: old.id, qty, unitCost: cost });
            else skippedStock++;
          }
          continue;
        }
        if (existingCodes.has(code)) continue;
        existingCodes.add(code); // يمنع تكرار الرمز داخل نفس الملف
        const curText = String(r['العملة'] ?? base).trim();
        // العملات المضافة أولاً بالرمز أو الاسم الكامل («ليرة تركية» قبل «ليرة»)
        const custom = Object.values(state.currencies).find((c) => [c.code, c.nameAr, c.symbol].some((x) => x.toLowerCase() === curText.toLowerCase()));
        const currency = custom?.code ?? (/^(usd|\$|دولار)/i.test(curText) ? 'USD' : /^(syp|ل\.?س|ليرة)/i.test(curText) ? 'SYP' : base);
        const id = uid();
        if (qty > 0) stock.push({ itemId: id, qty, unitCost: cost });
        // سعر النشرة (كهربائيات): أسعار البيع والجملة بتنحسب منه بنسب الشركة، والتعبئة بتصير وحدة كرتونة
        const listText = String(r['سعر النشرة'] ?? '').trim();
        const pack = Math.round(num(r['التعبئة'] ?? r['العدد بالكرتونة']));
        const brandName = r['الماركة'] ? String(r['الماركة']).trim() : '';
        if (listText) {
          parsed.push(
            applyListPricing(state.info ?? undefined, {
              id,
              code,
              name,
              kind: 'stock',
              unit: String(r['الوحدة'] ?? profile.units[0] ?? 'قطعة'),
              priceCurrency: currency,
              price: 0,
              listPrice: parsePrice(state, listText.replace(/[,،\s]/g, ''), currency),
              ...(pack > 1 ? { units: [{ name: `كرتونة ${pack}`, factor: pack }] } : {}),
              ...(r['الباركود'] ? { barcode: String(r['الباركود']) } : {}),
              ...(r['التصنيف'] ? { category: String(r['التصنيف']) } : {}),
              ...(brandName ? { brand: brandName } : {}),
            }),
          );
          continue;
        }
        parsed.push({
          id,
          code,
          name,
          kind: 'stock',
          unit: String(r['الوحدة'] ?? profile.units[0] ?? 'قطعة'),
          priceCurrency: currency,
          price: parsePrice(state, String(r['سعر المبيع'] ?? r['سعر المفرق'] ?? '0'), currency),
          ...(r['سعر الجملة'] ? { wholesalePrice: parsePrice(state, String(r['سعر الجملة']), currency) } : {}),
          ...(r['سعر جملة الجملة'] ? { bulkPrice: parsePrice(state, String(r['سعر جملة الجملة']), currency) } : {}),
          ...(r['سعر الوكيل'] ? { agentPrice: parsePrice(state, String(r['سعر الوكيل']), currency) } : {}),
          ...(r['الباركود'] ? { barcode: String(r['الباركود']) } : {}),
          ...(r['التصنيف'] ? { category: String(r['التصنيف']) } : {}),
          ...(r['الماركة'] ? { brand: String(r['الماركة']) } : {}),
          ...(r['رقم القطعة'] ? { partNumber: String(r['رقم القطعة']) } : {}),
        });
      }
      if (!parsed.length && !stock.length) {
        if (skippedStock) return notify(`ما انضاف شي: ${skippedStock} مادة إلها رصيد من قبل، فما انضافت كميتها مرة تانية`, 'error');
        return notify('لا توجد مواد جديدة ولا كميات بالملف (الأعمدة: الاسم، الرمز، الوحدة، سعر المبيع أو سعر النشرة، العملة، الباركود، التصنيف، الماركة، التعبئة، الكمية، التكلفة)', 'error');
      }
      if (parsed.length && !(await call<number>('saveItems', parsed))) return;
      if (stock.length && !(await call('postOpeningBalances', { date: today(), stock }))) return;
      notify(
        [
          parsed.length ? `تم استيراد ${parsed.length} مادة` : '',
          stock.length ? `وتسجيل كميات ${stock.length} مادة كبضاعة أول المدة` : '',
          skippedStock ? `(${skippedStock} مادة إلها رصيد من قبل، ما انضافت كميتها)` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title={profile.itemsLabel}>
        {canEdit && (
          <>
            <button className="primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> {profile.itemLabel} {newWord(profile.itemLabel)}
            </button>
            {feature('variants') && <button onClick={() => setVariants(true)}>+ موديل بمقاسات وألوان</button>}
            <button onClick={importExcel}>استيراد من Excel</button>
            <button onClick={() => setPlacing(true)}>تحديد الأماكن</button>
          </>
        )}
        {can('stock.adjust') &&
          (Object.keys(state.warehouses).length > 1 ? (
            Object.values(state.warehouses).map((w) => (
              <button key={w.id} onClick={() => navigate('stock', `count:${w.id}`)}>
                <Icon name="check" size={16} /> جرد {w.name}
              </button>
            ))
          ) : (
            <button onClick={() => navigate('stock', 'count')}>
              <Icon name="check" size={16} /> جرد المواد
            </button>
          ))}
        <button onClick={() => setLabels(items.filter((i) => i.barcode || i.code).slice(0, 500))}>طباعة ملصقات</button>
        <ExportButtons
          name={profile.itemsLabel}
          sheets={() => [
            {
              name: profile.itemsLabel,
              columns: [
                { header: 'الرمز', key: 'code' },
                { header: 'الاسم', key: 'name' },
                { header: 'الوحدة', key: 'unit' },
                { header: 'التصنيف', key: 'category' },
                { header: 'الماركة', key: 'brand' },
                { header: 'رقم القطعة', key: 'partNumber' },
                { header: 'الباركود', key: 'barcode' },
                { header: 'الرصيد', key: 'qty', type: 'number' },
                { header: 'سعر المبيع', key: 'price', type: 'money' },
                ...(feature('priceTiers')
                  ? [
                      { header: 'سعر الجملة', key: 'wholesale', type: 'money' as const },
                      { header: 'سعر جملة الجملة', key: 'bulk', type: 'money' as const },
                      { header: 'سعر الوكيل', key: 'agent', type: 'money' as const },
                    ]
                  : []),
                { header: 'العملة', key: 'currency' },
                ...(showCost ? [{ header: 'متوسط التكلفة', key: 'cost', type: 'money' as const }] : []),
              ],
              rows: items.map((i) => {
                const s = state.stock[i.id];
                return {
                  code: i.code,
                  name: i.name,
                  unit: i.unit,
                  category: i.category,
                  brand: i.brand,
                  partNumber: i.partNumber,
                  barcode: i.barcode,
                  qty: i.kind === 'stock' ? (s?.totalQty ?? 0) : null,
                  price: major(state, i.price, i.priceCurrency),
                  wholesale: i.wholesalePrice !== undefined ? major(state, i.wholesalePrice, i.priceCurrency) : null,
                  bulk: i.bulkPrice !== undefined ? major(state, i.bulkPrice, i.priceCurrency) : null,
                  agent: i.agentPrice !== undefined ? major(state, i.agentPrice, i.priceCurrency) : null,
                  currency: i.priceCurrency,
                  cost: s && s.totalQty > 0 ? major(state, niceUnitCost(s.value / s.totalQty, state.currencies[state.info!.baseCurrency]!.decimals)) : null,
                };
              }),
            },
          ]}
        />
      </PageHeader>
      <div className="toolbar">
        <div className="scan-wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم، الرمز، الباركود، رقم القطعة، المقاس، اللون..." />
          <CameraScanButton onCode={setQuery} />
        </div>
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">كل التصنيفات</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
      {items.length === 0 ? (
        <Empty>{query ? 'لا توجد نتائج' : 'لم تُضف أي مادة بعد'}</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرمز</th>
              <th>الاسم</th>
              {feature('partNumbers') && <th>رقم القطعة</th>}
              {feature('partNumbers') && <th>تناسب</th>}
              <th>التصنيف</th>
              <th>المكان</th>
              <th className="num">الرصيد</th>
              {showCost && <th className="num">التكلفة</th>}
              <th className="num">سعر المبيع</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const s = state.stock[i.id];
              const qty = s?.totalQty ?? 0;
              const low = i.kind === 'stock' && i.minStock !== undefined && qty <= i.minStock;
              return (
                <tr key={i.id} className={canEdit ? 'clickable' : ''} onClick={() => canEdit && setEditing(i)}>
                  <td className="mono">{i.code}</td>
                  <td>
                    <ItemName item={i} />
                    {i.kind === 'service' && <span className="tag">خدمة</span>}
                    {i.kind === 'composite' && <span className="tag">مركّب</span>}
                    {i.trackExpiry && <span className="tag">صلاحية</span>}
                    {i.trackSerial && <span className="tag">S/N</span>}
                    {i.weighed && <span className="tag">وزن</span>}
                    {i.hidden && <span className="tag">مخفية</span>}
                  </td>
                  {feature('partNumbers') && <td className="mono">{i.partNumber}</td>}
                  {feature('partNumbers') && <td>{i.compat}</td>}
                  <td>{i.category}</td>
                  <td>{itemPlacesText(state, i)}</td>
                  <td className={`num ${low ? 'bad' : ''}`}>
                    {i.kind === 'stock' ? `${qtyText(qty)} ${i.unit}` : '—'}
                    {i.kind === 'stock' && !i.trackSerial && !i.trackExpiry && can('stock.adjust') && (
                      <button
                        className="ghost small add-qty"
                        title="إضافة كمية بدون فاتورة شراء"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdding(i);
                        }}
                      >
                        + كمية
                      </button>
                    )}
                  </td>
                  {showCost && <td className="num">{s && qty > 0 ? unitMoney(state, s.value / qty) : '—'}</td>}
                  <td className="num">{money(state, i.price, i.priceCurrency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && <ItemForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {variants && <VariantsForm onClose={() => setVariants(false)} />}
      {labels && <LabelSheet items={labels} onClose={() => setLabels(null)} />}
      {adding && <QuickAddStock item={adding} onClose={() => setAdding(null)} />}
      {placing && <PlacesBulk items={items.filter((i) => i.kind === 'stock')} onClose={() => setPlacing(false)} />}
    </div>
  );
}

/** زيادة رصيد مادة بسرعة من قائمة المواد، بدون فاتورة شراء (قيد «إضافة بضاعة» بالمخزون). */
function QuickAddStock({ item, onClose }: { item: Item; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const s = state.stock[item.id];
  const avg = s && s.totalQty > 0 ? Math.round(s.value / s.totalQty) : (s?.lastCost ?? 0);
  const whs = Object.values(state.warehouses);
  const [warehouseId, setWarehouseId] = useState(whs[0]?.id ?? 'main');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(avg ? toInput(state, avg, base) : '');
  const save = async () => {
    const q = Number(qty.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (!(q > 0)) return notify('اكتب الكمية', 'error');
    const res = await call('adjustStock', {
      kind: 'opening',
      date: today(),
      warehouseId,
      memo: 'إضافة بضاعة',
      lines: [{ itemId: item.id, qty: q, unitCost: cost.trim() ? parsePrice(state, cost, base) : avg }],
    });
    if (res) {
      notify(`تمت إضافة ${qtyText(q)} ${item.unit} لـ ${item.name}`);
      onClose();
    }
  };
  return (
    <Modal title={`إضافة كمية: ${item.name}`} onClose={onClose} width={420}>
      <p className="muted">
        الرصيد الحالي: {qtyText(s?.totalQty ?? 0)} {item.unit}
      </p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={`الكمية المضافة (${item.unit})`}>
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label={`تكلفة الوحدة (${state.currencies[base]?.symbol ?? base}) — اختياري`}>
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
        </Field>
        {whs.length > 1 && (
          <Field label="المستودع">
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {whs.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="form-actions wide">
          <button className="primary big">إضافة</button>
        </div>
      </form>
    </Modal>
  );
}

function nextCode(codes: string[]): string {
  const max = codes.map((c) => Number(c)).filter(Number.isFinite).reduce((m, n) => Math.max(m, n), 0);
  return String(max + 1).padStart(4, '0');
}

type FormTab = 'basic' | 'prices' | 'tracking' | 'recipe';

export function ItemForm({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved?: (item: Item) => void }) {
  const { state, call, notify, feature, profile, can } = useCompany();
  const [newDealer, setNewDealer] = useState(false);
  const [label, setLabel] = useState(false);
  const base = state.info!.baseCurrency;
  const [tab, setTab] = useState<FormTab>('basic');
  const [f, setF] = useState(() => ({
    code: item?.code ?? nextCode(Object.values(state.items).map((i) => i.code)),
    name: item?.name ?? '',
    kind: (item?.kind ?? (profile.id === 'clinic' ? 'service' : 'stock')) as ItemKind,
    unit: item?.unit ?? profile.units[0] ?? 'قطعة',
    barcode: item?.barcode ?? '',
    category: item?.category ?? '',
    brand: item?.brand ?? '',
    partNumber: item?.partNumber ?? '',
    compat: item?.compat ?? '',
    priceCurrency: item?.priceCurrency ?? base,
    price: item ? toInput(state, item.price, item.priceCurrency) : '',
    wholesalePrice: item?.wholesalePrice !== undefined ? toInput(state, item.wholesalePrice, item.priceCurrency) : '',
    listPrice: item?.listPrice !== undefined ? toInput(state, item.listPrice, item.priceCurrency) : '',
    buyDiscount: item?.buyDiscount !== undefined ? String(item.buyDiscount) : '',
    specialPrice: item?.specialPrice !== undefined ? toInput(state, item.specialPrice, item.priceCurrency) : '',
    bulkPrice: item?.bulkPrice !== undefined ? toInput(state, item.bulkPrice, item.priceCurrency) : '',
    agentPrice: item?.agentPrice !== undefined ? toInput(state, item.agentPrice, item.priceCurrency) : '',
    dealerPrice: item?.dealerPrice !== undefined ? toInput(state, item.dealerPrice, item.priceCurrency) : '',
    dealerId: item?.dealerId ?? '',
    hidden: !!item?.hidden,
    minStock: item?.minStock !== undefined ? String(item.minStock) : '',
    trackExpiry: item?.trackExpiry ?? (feature('batches') && (profile.id === 'pharmacy' || profile.id === 'pharmacydealers')),
    trackSerial: item?.trackSerial ?? false,
    weighed: item?.weighed ?? false,
    warrantyMonths: item?.warrantyMonths ? String(item.warrantyMonths) : '',
  }));
  const warehouseList = Object.values(state.warehouses);
  const [places, setPlaces] = useState<Record<string, string>>(() => Object.fromEntries(warehouseList.map((w) => [w.id, item ? itemPlace(item, w.id) : ''])));
  const [units, setUnits] = useState<{ name: string; factor: string; price: string; barcode: string }[]>(
    () => item?.units?.map((u) => ({ name: u.name, factor: String(u.factor), price: u.price !== undefined ? toInput(state, u.price, item.priceCurrency) : '', barcode: u.barcode ?? '' })) ?? [],
  );
  const [recipe, setRecipe] = useState<{ itemId: string; qty: string }[]>(() => item?.recipe?.map((r) => ({ itemId: r.itemId, qty: String(r.qty) })) ?? []);
  const [attrs, setAttrs] = useState<Record<string, string>>(item?.attributes ?? {});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const stockItems = useMemo(() => itemOptions(state, (i) => i.kind === 'stock' && i.id !== item?.id), [state, item]);
  const hasStock = !!item && (state.stock[item.id]?.totalQty ?? 0) !== 0;
  const [extraAttr, setExtraAttr] = useState('');
  const attributeNames = [...new Set([...attributesFor(profile, f.category), ...Object.keys(attrs)])];

  const save = async () => {
    let data: Item;
    try {
      const cur = f.priceCurrency;
      const unitList: ItemUnit[] = units
        .filter((u) => u.name.trim())
        .map((u) => ({
          name: u.name.trim(),
          factor: Number(u.factor),
          ...(u.price ? { price: parsePrice(state, u.price, cur) } : {}),
          ...(u.barcode.trim() ? { barcode: u.barcode.trim() } : {}),
        }));
      const recipeList: RecipeLine[] = recipe.filter((r) => r.itemId && Number(r.qty) > 0).map((r) => ({ itemId: r.itemId, qty: Number(r.qty) }));
      const attributes = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v.trim()));
      data = {
        id: item?.id ?? uid(),
        code: f.code.trim(),
        name: f.name.trim(),
        kind: f.kind,
        unit: f.unit.trim() || 'قطعة',
        priceCurrency: cur,
        price: parsePrice(state, f.price, cur),
        ...(f.wholesalePrice ? { wholesalePrice: parsePrice(state, f.wholesalePrice, cur) } : {}),
        ...(f.listPrice ? { listPrice: parseAmount(state, f.listPrice, cur) } : {}),
        ...(f.buyDiscount.trim() !== '' && Number.isFinite(Number(f.buyDiscount)) ? { buyDiscount: Number(f.buyDiscount) } : {}),
        ...(f.specialPrice ? { specialPrice: parsePrice(state, f.specialPrice, cur) } : {}),
        ...(f.bulkPrice ? { bulkPrice: parsePrice(state, f.bulkPrice, cur) } : {}),
        ...(f.agentPrice ? { agentPrice: parsePrice(state, f.agentPrice, cur) } : {}),
        ...(f.dealerPrice ? { dealerPrice: parsePrice(state, f.dealerPrice, cur) } : {}),
        ...(f.dealerId ? { dealerId: f.dealerId } : {}),
        ...(f.hidden ? { hidden: true } : {}),
        ...(f.minStock ? { minStock: Number(f.minStock) } : {}),
        ...(unitList.length ? { units: unitList } : {}),
        ...(recipeList.length ? { recipe: recipeList } : {}),
        ...(Object.keys(attributes).length ? { attributes } : {}),
        ...(f.kind === 'stock' && f.trackExpiry ? { trackExpiry: true } : {}),
        ...(f.kind === 'stock' && f.trackSerial ? { trackSerial: true } : {}),
        ...(f.weighed ? { weighed: true } : {}),
        ...(f.warrantyMonths ? { warrantyMonths: Number(f.warrantyMonths) } : {}),
        ...(item?.group ? { group: item.group } : {}),
        ...(Object.values(places).some((p) => p.trim()) ? { locations: Object.fromEntries(Object.entries(places).filter(([, p]) => p.trim()).map(([w, p]) => [w, p.trim()])) } : {}),
        ...Object.fromEntries((['barcode', 'category', 'brand', 'partNumber', 'compat'] as const).filter((k) => f[k].trim()).map((k) => [k, f[k].trim()])),
      };
    } catch (e) {
      return notify((e as Error).message, 'error');
    }
    if (await call('saveItem', data)) {
      notify('تم الحفظ');
      onSaved?.(data);
      onClose();
    }
  };

  return (
    <Modal title={item ? `تعديل: ${item.name}` : `${profile.itemLabel} ${newWord(profile.itemLabel)}`} onClose={onClose} width={780}>
      <Tabs<FormTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'basic', label: 'الأساسي' },
          { key: 'prices', label: 'الأسعار والوحدات' },
          { key: 'tracking', label: 'التتبع', hidden: f.kind !== 'stock' },
          { key: 'recipe', label: f.kind === 'composite' ? 'المكوّنات' : 'وصفة الإنتاج', hidden: f.kind === 'service' },
        ]}
      />
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {tab === 'basic' && (
          <>
            <Field label="الاسم" wide>
              <input value={f.name} onChange={set('name')} autoFocus />
            </Field>
            <Field label="الرمز">
              <input value={f.code} onChange={set('code')} className="mono" />
            </Field>
            <Field label="النوع">
              <select value={f.kind} onChange={set('kind')} disabled={hasStock}>
                <option value="stock">مادة مخزنية</option>
                <option value="service">خدمة (بدون مخزون)</option>
                <option value="composite">صنف مركّب (يتكون من مواد أخرى)</option>
              </select>
            </Field>
            <Field label="التصنيف">
              <input value={f.category} onChange={set('category')} list="cats" />
              <datalist id="cats">
                {[...new Set([...profile.categories, ...Object.values(state.items).map((i) => i.category ?? '')])].filter(Boolean).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="الماركة / المنشأ">
              <input value={f.brand} onChange={set('brand')} />
            </Field>
            {feature('partNumbers') && (
              <>
                <Field label="رقم القطعة (OEM)">
                  <input value={f.partNumber} onChange={set('partNumber')} className="mono" dir="ltr" />
                </Field>
                <Field label="تناسب السيارات">
                  <input value={f.compat} onChange={set('compat')} placeholder="كيا ريو 2012-2016" />
                </Field>
              </>
            )}
            {feature('devices') && (
              <Field label="تناسب الأجهزة">
                <input value={f.compat} onChange={set('compat')} placeholder="Galaxy A54، A34" />
              </Field>
            )}
            <Field label="الباركود">
              <div className="scan-wrap">
                <input value={f.barcode} onChange={set('barcode')} className="mono" dir="ltr" />
                <CameraScanButton onCode={(code) => setF({ ...f, barcode: code })} />
              </div>
            </Field>
            {warehouseList.map((w) => (
              <Field key={w.id} label={warehouseList.length > 1 ? `المكان بمستودع ${w.name}` : 'المكان (رف / ركن)'}>
                <PlaceInput warehouseId={w.id} selfId={item?.id} value={places[w.id] ?? ''} onChange={(v) => setPlaces((p) => ({ ...p, [w.id]: v }))} />
              </Field>
            ))}
            {attributeNames.map((a) => (
              <Field key={a} label={a} wide={a === 'اللون'}>
                {a === 'اللون' ? <ColorPicker value={attrs[a] ?? ''} onChange={(v) => setAttrs({ ...attrs, [a]: v })} /> : <input value={attrs[a] ?? ''} onChange={(e) => setAttrs({ ...attrs, [a]: e.target.value })} />}
              </Field>
            ))}
            <Field label="حقل إضافي خاص بهذه المادة">
              <div className="with-button">
                <input value={extraAttr} onChange={(e) => setExtraAttr(e.target.value)} placeholder="مثلاً: اللون، بلد المنشأ، الوزن" />
                <button
                  type="button"
                  className="icon"
                  title="إضافة الحقل"
                  disabled={!extraAttr.trim() || attributeNames.includes(extraAttr.trim())}
                  onClick={() => {
                    setAttrs({ ...attrs, [extraAttr.trim()]: attrs[extraAttr.trim()] ?? ' ' });
                    setExtraAttr('');
                  }}
                >
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </Field>
            {can('items.hidden') && (
              <label className="check wide">
                <input type="checkbox" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} />
                مادة مخفية: ما بتبين إلا إلك (والمدير). حساب الصيدلية أو الكاشير ما بيشوفها ولا بيبيعها
              </label>
            )}
          </>
        )}

        {tab === 'prices' && (
          <>
            <Field label="الوحدة الأساسية">
              <input value={f.unit} onChange={set('unit')} list="units" />
              <datalist id="units">
                {[...new Set([...profile.units, ...Object.values(state.items).map((i) => i.unit)])].filter(Boolean).map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </Field>
            <Field label="عملة السعر">
              <CurrencySelect value={f.priceCurrency} onChange={(c) => setF({ ...f, priceCurrency: c })} />
            </Field>
            {feature('listPricing') && (
              <>
                <Field label="سعر النشرة">
                  <input
                    value={f.listPrice}
                    inputMode="decimal"
                    onChange={(e) => {
                      // سعر الزبون والمعلم بيتحسبوا من النشرة لحالهن (وبتقدر تعدّلهن)
                      const v = e.target.value;
                      let p: ReturnType<typeof listPrices> | null = null;
                      try {
                        p = v ? listPrices(state.info ?? undefined, { listPrice: parseAmount(state, v, f.priceCurrency), brand: f.brand, ...(f.buyDiscount ? { buyDiscount: Number(f.buyDiscount) } : {}) }) : null;
                      } catch {
                        p = null;
                      }
                      setF({ ...f, listPrice: v, ...(p ? { price: toInput(state, p.retail, f.priceCurrency), wholesalePrice: toInput(state, p.master, f.priceCurrency) } : {}) });
                    }}
                  />
                </Field>
                <Field label={`حسم الشراء % (فارغ = حسم النشرة ${buyDiscountOf(state.info ?? undefined, { brand: f.brand })}%)`}>
                  <input value={f.buyDiscount} onChange={set('buyDiscount')} inputMode="decimal" />
                </Field>
              </>
            )}
            {!(feature('dealers') && f.dealerId) && !(feature('priceTiers') && !feature('dealers')) && (
              <Field label={feature('dealers') ? 'سعر الصيدلية (للزبون، وبيتحاسب فيه المورّد)' : 'سعر المبيع (مفرق)'}>
                <input value={f.price} onChange={set('price')} inputMode="decimal" />
              </Field>
            )}
            {feature('dealers') && (
              <>
                <Field label={f.dealerId ? 'سعر البيع (بضاعة المورّد، بيبيع فيه)' : 'سعر المورّد (بيبيع فيه المورّد، أغلى من سعر الصيدلية)'}>
                  <input value={f.dealerPrice} onChange={set('dealerPrice')} inputMode="decimal" />
                </Field>
                <Field label="بضاعة مين؟">
                  <div className="with-button">
                    <select value={f.dealerId} onChange={(e) => setF({ ...f, dealerId: e.target.value })} disabled={!!item && (state.stock[item.id]?.totalQty ?? 0) !== 0}>
                      <option value="">بضاعة الصيدلية</option>
                      {Object.values(state.dealers ?? {}).map((d) => (
                        <option key={d.id} value={d.id}>
                          بضاعة خاصة بالمورّد {d.name}
                        </option>
                      ))}
                    </select>
                    {can('dealers.manage') && !(item && (state.stock[item.id]?.totalQty ?? 0) !== 0) && (
                      <button type="button" className="icon" title="مورّد جديد" onClick={() => setNewDealer(true)}>
                        <Icon name="plus" size={16} />
                      </button>
                    )}
                  </div>
                  {Object.keys(state.dealers ?? {}).length === 0 && <small className="muted">ما في موردين بهالشركة لسا. اكبس + وضيفه هون، أو من قسم «الموردين» (مش «العملاء والموردون»).</small>}
                  {!!item && (state.stock[item.id]?.totalQty ?? 0) !== 0 && <small className="muted">ما بيتغيّر وعليها رصيد ({state.stock[item.id]!.totalQty}). صفّر رصيدها (إلغاء فاتورة الشراء أو جرد) أو اعمل مادة جديدة للمورّد.</small>}
                </Field>
              </>
            )}
            {feature('priceTiers') && (
              <div className="tier-prices wide">
                <div className="tier-prices-head">
                  <strong>سعر كل نوع زبون</strong>
                  <small className="muted">الفاضي بياخد سعر اللي قبله</small>
                </div>
                <div className="tier-prices-row">
                  <label>
                    <span>مفرق</span>
                    <input value={f.price} onChange={set('price')} inputMode="decimal" />
                  </label>
                  <label>
                    <span>جملة</span>
                    <input value={f.wholesalePrice} onChange={set('wholesalePrice')} inputMode="decimal" placeholder={f.price} />
                  </label>
                  <label>
                    <span>جملة الجملة</span>
                    <input value={f.bulkPrice} onChange={set('bulkPrice')} inputMode="decimal" placeholder={f.wholesalePrice || f.price} />
                  </label>
                  <label>
                    <span>وكيل</span>
                    <input value={f.agentPrice} onChange={set('agentPrice')} inputMode="decimal" placeholder={f.bulkPrice || f.wholesalePrice || f.price} />
                  </label>
                </div>
                {(item?.specialPrice !== undefined || f.specialPrice) && (
                  <label className="tier-legacy">
                    <span>سعر خاص (قديم)</span>
                    <input value={f.specialPrice} onChange={set('specialPrice')} inputMode="decimal" />
                  </label>
                )}
              </div>
            )}
            {f.kind === 'stock' && (
              <Field label="الحد الأدنى للتنبيه">
                <input type="number" min={0} value={f.minStock} onChange={set('minStock')} />
              </Field>
            )}
            <div className="field wide">
              <span>وحدات إضافية (كرتونة = 12 قطعة مثلاً)</span>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>الوحدة</th>
                    <th>كم {f.unit} فيها</th>
                    <th>سعرها (اختياري)</th>
                    <th>باركودها</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {units.map((u, i) => (
                    <tr key={i}>
                      <td>
                        <input value={u.name} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      </td>
                      <td>
                        <input value={u.factor} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))} inputMode="decimal" />
                      </td>
                      <td>
                        <input value={u.price} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} inputMode="decimal" />
                      </td>
                      <td>
                        <input className="mono" value={u.barcode} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, barcode: e.target.value } : x)))} />
                      </td>
                      <td>
                        <button type="button" className="icon" onClick={() => setUnits(units.filter((_, j) => j !== i))}>
                          <Icon name="close" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={() => setUnits([...units, { name: '', factor: '', price: '', barcode: '' }])}>
                + وحدة
              </button>
            </div>
          </>
        )}

        {tab === 'tracking' && (
          <>
            <label className="check wide">
              <input type="checkbox" checked={f.trackExpiry} disabled={hasStock} onChange={(e) => setF({ ...f, trackExpiry: e.target.checked })} />
              تتبع الدفعات وتواريخ الصلاحية (يُباع الأقرب انتهاءً أولاً)
            </label>
            <label className="check wide">
              <input type="checkbox" checked={f.trackSerial} disabled={hasStock} onChange={(e) => setF({ ...f, trackSerial: e.target.checked })} />
              تتبع الأرقام التسلسلية / IMEI لكل قطعة
            </label>
            {f.trackSerial && (
              <Field label="الكفالة (أشهر)">
                <input type="number" min={0} value={f.warrantyMonths} onChange={set('warrantyMonths')} />
              </Field>
            )}
            {feature('scale') && (
              <label className="check wide">
                <input type="checkbox" checked={f.weighed} onChange={(e) => setF({ ...f, weighed: e.target.checked })} />
                يُباع بالوزن (يُقرأ من باركود الميزان — رمز المادة يجب أن يكون رقماً من 5 خانات مثل 00123)
              </label>
            )}
            {hasStock && <p className="muted wide">لا يمكن تغيير التتبع لمادة لها رصيد.</p>}
          </>
        )}

        {tab === 'recipe' && (
          <div className="field wide">
            <span>{f.kind === 'composite' ? 'المكوّنات التي تُنقص من المخزون عند بيع وحدة واحدة' : 'المواد الأولية اللازمة لإنتاج وحدة واحدة'}</span>
            <table className="table compact">
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>الكمية</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recipe.map((r, i) => (
                  <tr key={i}>
                    <td>{state.items[r.itemId]?.name}</td>
                    <td>
                      <input value={r.qty} onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} inputMode="decimal" />{' '}
                      {state.items[r.itemId]?.unit}
                    </td>
                    <td>
                      <button type="button" className="icon" onClick={() => setRecipe(recipe.filter((_, j) => j !== i))}>
                        <Icon name="close" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Picker options={stockItems} value={null} placeholder="+ أضف مادة" onChange={(id) => id && setRecipe([...recipe, { itemId: id, qty: '1' }])} />
          </div>
        )}

        <div className="form-actions wide">
          {item && !item.archived && (
            <ConfirmButton
              className="push-start"
              label={`حذف ${profile.itemLabel}`}
              confirmLabel="متأكد؟ احذفها"
              onConfirm={async () => {
                if (await call('deleteItem', item.id)) {
                  notify(`انحذفت «${item.name}». فواتيرها القديمة بتضل متل ما هي`);
                  onClose();
                }
              }}
            />
          )}
          {item && (item.barcode || item.code) && (
            <button type="button" onClick={() => setLabel(true)}>
              <Icon name="printer" size={16} /> ملصق
            </button>
          )}
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
      {label && item && <LabelSheet items={[item]} onClose={() => setLabel(false)} />}
      {newDealer && <DealerForm dealer={null} onClose={() => setNewDealer(false)} onSaved={(d) => (setF((x) => ({ ...x, dealerId: d.id })), setNewDealer(false))} />}
    </Modal>
  );
}

function VariantsForm({ onClose }: { onClose: () => void }) {
  const { state, call, notify, profile } = useCompany();
  const base = state.info!.baseCurrency;
  const [f, setF] = useState({ name: '', prefix: '', category: '', brand: '', sizes: 'S, M, L, XL', colors: '', price: '', currency: base });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const split = (s: string) => s.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
  const count = Math.max(1, split(f.sizes).length) * Math.max(1, split(f.colors).length);
  return (
    <Modal title="موديل جديد بمقاسات وألوان" onClose={onClose} width={680}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (!f.name.trim()) return notify('اسم الموديل مطلوب', 'error');
            const items = generateVariants(
              {
                name: f.name.trim(),
                kind: 'stock',
                unit: profile.units[0] ?? 'قطعة',
                price: parsePrice(state, f.price, f.currency),
                priceCurrency: f.currency,
                ...(f.category ? { category: f.category } : {}),
                ...(f.brand ? { brand: f.brand } : {}),
              },
              f.prefix.trim() || nextCode(Object.values(state.items).map((i) => i.code)),
              split(f.sizes),
              split(f.colors),
            );
            const res = await call<number>('saveItems', items);
            if (res) {
              notify(`تم إنشاء ${res.value} قطعة`);
              onClose();
            }
          } catch (err) {
            notify((err as Error).message, 'error');
          }
        }}
      >
        <Field label="اسم الموديل" wide>
          <input value={f.name} onChange={set('name')} placeholder="قميص كتان" autoFocus />
        </Field>
        <Field label="بادئة الرمز">
          <input value={f.prefix} onChange={set('prefix')} className="mono" placeholder="SH101" />
        </Field>
        <Field label="التصنيف">
          <input value={f.category} onChange={set('category')} />
        </Field>
        <Field label="المقاسات (مفصولة بفاصلة)" wide>
          <input value={f.sizes} onChange={set('sizes')} />
        </Field>
        <Field label="الألوان (مفصولة بفاصلة)" wide>
          <input value={f.colors} onChange={set('colors')} placeholder="أبيض، أسود، كحلي" />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => setF({ ...f, currency: c })} />
        </Field>
        <Field label="سعر المبيع">
          <input value={f.price} onChange={set('price')} inputMode="decimal" />
        </Field>
        <p className="wide muted">سيتم إنشاء {count} قطعة (كل مقاس × كل لون) بباركود ورصيد مستقل.</p>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">إنشاء</button>
        </div>
      </form>
    </Modal>
  );
}

/** مقاسات ورق الملصقات الشائعة (عرض × ارتفاع بالمليمتر). */
const LABEL_SIZES: [number, number][] = [[40, 30], [50, 30], [50, 25], [38, 25], [30, 20], [60, 40], [58, 40], [100, 50]];
type LabelPrefs = { w: number; h: number; name: boolean; price: boolean; code: boolean };
const LABEL_KEY = 'wazn.labels';
function readLabelPrefs(): LabelPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(LABEL_KEY) ?? '') as Partial<LabelPrefs>;
    if (v && v.w! >= 10 && v.h! >= 10) return { w: v.w!, h: v.h!, name: v.name !== false, price: v.price !== false, code: v.code !== false };
  } catch {
    // أول مرة
  }
  return { w: 40, h: 30, name: true, price: true, code: true };
}

/**
 * ملصقات الباركود: كل مادة بعدد النسخ اللي بدك ياه (0 = ما بتنطبع). على طابعة الملصقات كل ملصق صفحة لحالها
 * بمقاس الورقة الحقيقي (40×30، 50×25...) فما بتزحط، أو على ورق A4 جدول.
 */
function LabelSheet({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const { state } = useCompany();
  const printer = usePrinter();
  const [prefs, setPrefsState] = useState<LabelPrefs>(readLabelPrefs);
  const setPrefs = (p: Partial<LabelPrefs>) =>
    setPrefsState((old) => {
      const next = { ...old, ...p };
      try {
        localStorage.setItem(LABEL_KEY, JSON.stringify(next));
      } catch {
        // مش مهم
      }
      return next;
    });
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, items.length === 1 ? '1' : ''])));
  const toNum = (t: string) => Math.min(500, Math.max(0, Number(t.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))) || 0));
  const list = items.flatMap((i) => Array.from({ length: toNum(counts[i.id] ?? '0') }, () => i));
  const shown = q.trim() ? items.filter((i) => i.name.includes(q.trim()) || (i.barcode ?? '').includes(q.trim()) || i.code.includes(q.trim())) : items;
  const custom = !LABEL_SIZES.some(([w, h]) => w === prefs.w && h === prefs.h);
  const setAll = (n: string) => setCounts(Object.fromEntries(items.map((i) => [i.id, n])));
  const style = { ['--lw' as string]: `${prefs.w}mm`, ['--lh' as string]: `${prefs.h}mm` } as React.CSSProperties;
  return (
    <Modal title={items.length === 1 ? `ملصق «${items[0]!.name}»` : `ملصقات الباركود (${items.length} مادة)`} onClose={onClose} width={860}>
      <div className="label-setup">
        <Field label="مقاس الملصق (عرض × ارتفاع مم)">
          <select
            value={custom ? 'custom' : `${prefs.w}x${prefs.h}`}
            onChange={(e) => {
              if (e.target.value === 'custom') return setPrefs({ w: prefs.w + 1 });
              const [w, h] = e.target.value.split('x').map(Number);
              setPrefs({ w: w!, h: h! });
            }}
          >
            {LABEL_SIZES.map(([w, h]) => (
              <option key={`${w}x${h}`} value={`${w}x${h}`}>
                {w} × {h} مم
              </option>
            ))}
            <option value="custom">مقاس تاني...</option>
          </select>
        </Field>
        {custom && (
          <Field label="المقاس">
            <span className="inline-unit">
              <input inputMode="numeric" value={prefs.w} onChange={(e) => setPrefs({ w: toNum(e.target.value) || 10 })} /> ×
              <input inputMode="numeric" value={prefs.h} onChange={(e) => setPrefs({ h: toNum(e.target.value) || 10 })} /> مم
            </span>
          </Field>
        )}
        <div className="label-show">
          <label className="check">
            <input type="checkbox" checked={prefs.name} onChange={(e) => setPrefs({ name: e.target.checked })} /> الاسم
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.price} onChange={(e) => setPrefs({ price: e.target.checked })} /> السعر
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.code} onChange={(e) => setPrefs({ code: e.target.checked })} /> رقم الباركود
          </label>
        </div>
      </div>

      {items.length > 1 && (
        <>
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} placeholder="ابحث عن مادة..." />
            <button type="button" onClick={() => setAll('1')}>
              الكل 1
            </button>
            <button type="button" onClick={() => setAll('0')}>
              ولا وحدة
            </button>
          </div>
          <div className="label-pick">
            {shown.map((i) => (
              <label key={i.id} className={`label-pick-row ${toNum(counts[i.id] ?? '0') > 0 ? 'on' : ''}`}>
                <span>
                  {i.name} <small className="muted mono">{i.barcode || i.code}</small>
                </span>
                <input inputMode="numeric" placeholder="0" value={counts[i.id] ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} aria-label="عدد الملصقات" />
              </label>
            ))}
          </div>
        </>
      )}
      {items.length === 1 && (
        <Field label="كم ملصق">
          <input inputMode="numeric" value={counts[items[0]!.id] ?? ''} onChange={(e) => setCounts({ [items[0]!.id]: e.target.value })} style={{ maxWidth: 120 }} autoFocus />
        </Field>
      )}

      <div className="button-row" style={{ margin: '10px 0' }}>
        <button className="primary" disabled={!list.length} onClick={() => void printer.printLabels({ w: prefs.w, h: prefs.h })}>
          <Icon name="printer" size={16} /> طباعة {list.length} ملصق ({prefs.w}×{prefs.h})
        </button>
        <button disabled={!list.length} onClick={() => printer.print('label', 'a4')}>
          على ورق A4
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        💡 بطابعة الملصقات: اختار نفس مقاس الورقة اللي فيها، وبإعدادات الطابعة بويندوز حط نفس المقاس. كل ملصق بينطبع لحالو بدون ما يزحط.
      </p>
      <div className="print-area labels" style={style}>
        {list.map((i, n) => (
          <div key={`${i.id}-${n}`} className="label">
            {prefs.name && <div className="label-name">{i.name}</div>}
            <Barcode value={i.barcode || i.code} />
            {prefs.code && <div className="label-code mono">{i.barcode || i.code}</div>}
            {prefs.price && <div className="label-price">{money(state, i.price, i.priceCurrency)}</div>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** "جديد" أو "جديدة" حسب الاسم (مادة جديدة، صنف جديد). */
export function newWord(label: string): string {
  return /[ةه]$/.test(label.trim()) ? 'جديدة' : 'جديد';
}

/** تحديد أماكن المواد القديمة دفعة وحدة: مكان لكل مادة، أو مكان واحد لكل المواد المعروضة (حسب البحث والتصنيف). */
function PlacesBulk({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const warehouses = Object.values(state.warehouses);
  const [wid, setWid] = useState(warehouses[0]?.id ?? 'main');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [all, setAll] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const shown = useMemo(() => items.filter((i) => !onlyEmpty || !itemPlace(i, wid) || edits[i.id] !== undefined), [items, onlyEmpty, wid, edits]);
  const changed = items.filter((i) => edits[i.id] !== undefined && edits[i.id]!.trim() !== itemPlace(i, wid));
  const fillAll = () => setEdits((e) => ({ ...e, ...Object.fromEntries(shown.map((i) => [i.id, all])) }));
  const save = async () => {
    if (!changed.length) return onClose();
    if (await call('saveItems', changed.map((i) => withPlace(i, wid, edits[i.id]!)))) {
      notify(`انحفظ مكان ${changed.length} مادة`);
      onClose();
    }
  };
  return (
    <Modal title="تحديد أماكن المواد" onClose={onClose} width={720}>
      <p className="muted">اكتب مكان كل مادة (رف / ركن) أو حط مكان واحد لكل المواد المعروضة. القائمة حسب البحث والتصنيف اللي اخترتهم.</p>
      <div className="toolbar">
        {warehouses.length > 1 && (
          <select value={wid} onChange={(e) => { setWid(e.target.value); setEdits({}); }}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        <label className="check">
          <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> بدون مكان بس
        </label>
      </div>
      <div className="with-button">
        <PlaceInput warehouseId={wid} value={all} onChange={setAll} placeholder="مكان لكل المواد المعروضة" />
        <button type="button" disabled={!all.trim() || !shown.length} onClick={fillAll}>
          حطّه لـ {shown.length} مادة
        </button>
      </div>
      <div style={{ maxHeight: '45vh', overflow: 'auto', marginTop: 8 }}>
        <table className="table compact">
          <tbody>
            {shown.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.code}</td>
                <td>{i.name}</td>
                <td style={{ width: '40%' }}>
                  <PlaceInput warehouseId={wid} selfId={i.id} value={edits[i.id] ?? itemPlace(i, wid)} onChange={(v) => setEdits((e) => ({ ...e, [i.id]: v }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Empty>كل المواد المعروضة إلها مكان</Empty>}
      </div>
      <div className="form-actions">
        <button className="primary" onClick={save}>
          حفظ ({changed.length})
        </button>
      </div>
    </Modal>
  );
}
