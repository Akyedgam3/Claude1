import { useMemo, useState } from 'react';
import { attributesFor, generateVariants, type Item, type ItemKind, type ItemUnit, type RecipeLine } from '../../../core';
import { api, major, money, parseAmount, qtyText, toInput, today, uid, useCompany } from '../api';
import { Barcode, ExportButtons, usePrinter } from '../components/print';
import { CameraScanButton, ColorPicker, ConfirmButton, CurrencySelect, ItemName, Empty, Field, itemMatches, itemOptions, Modal, PageHeader, Picker, SearchBox, Tabs } from '../components/ui';
import { Icon } from '../components/icons';

export function Items({ initialQuery }: { initialQuery?: string } = {}) {
  const { state, profile, feature, can, call, notify, navigate } = useCompany();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [variants, setVariants] = useState(false);
  const [labels, setLabels] = useState<Item[] | null>(null);
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
        const cost = String(r['التكلفة'] ?? '').trim() ? parseAmount(state, String(r['التكلفة']).replace(/[,،\s]/g, ''), base) : 0;
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
        parsed.push({
          id,
          code,
          name,
          kind: 'stock',
          unit: String(r['الوحدة'] ?? profile.units[0] ?? 'قطعة'),
          priceCurrency: currency,
          price: parseAmount(state, String(r['سعر المبيع'] ?? '0'), currency),
          ...(r['الباركود'] ? { barcode: String(r['الباركود']) } : {}),
          ...(r['التصنيف'] ? { category: String(r['التصنيف']) } : {}),
          ...(r['الماركة'] ? { brand: String(r['الماركة']) } : {}),
          ...(r['رقم القطعة'] ? { partNumber: String(r['رقم القطعة']) } : {}),
        });
      }
      if (!parsed.length && !stock.length) {
        if (skippedStock) return notify(`ما انضاف شي: ${skippedStock} مادة إلها رصيد من قبل، فما انضافت كميتها مرة تانية`, 'error');
        return notify('لا توجد مواد جديدة ولا كميات بالملف (الأعمدة: الاسم، الرمز، الوحدة، سعر المبيع، العملة، الباركود، التصنيف، الكمية، التكلفة)', 'error');
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
          </>
        )}
        {can('stock.adjust') && (
          <button onClick={() => navigate('stock', 'count')}>
            <Icon name="check" size={16} /> جرد المواد
          </button>
        )}
        <button onClick={() => setLabels(items.filter((i) => i.barcode || i.code).slice(0, 60))}>طباعة ملصقات</button>
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
                  currency: i.priceCurrency,
                  cost: s && s.totalQty > 0 ? major(state, Math.round(s.value / s.totalQty)) : null,
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
                  </td>
                  {feature('partNumbers') && <td className="mono">{i.partNumber}</td>}
                  {feature('partNumbers') && <td>{i.compat}</td>}
                  <td>{i.category}</td>
                  <td>{i.location}</td>
                  <td className={`num ${low ? 'bad' : ''}`}>{i.kind === 'stock' ? `${qtyText(qty)} ${i.unit}` : '—'}</td>
                  {showCost && <td className="num">{s && qty > 0 ? money(state, Math.round(s.value / qty)) : '—'}</td>}
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
    </div>
  );
}

function nextCode(codes: string[]): string {
  const max = codes.map((c) => Number(c)).filter(Number.isFinite).reduce((m, n) => Math.max(m, n), 0);
  return String(max + 1).padStart(4, '0');
}

type FormTab = 'basic' | 'prices' | 'tracking' | 'recipe';

export function ItemForm({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved?: (item: Item) => void }) {
  const { state, call, notify, feature, profile } = useCompany();
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
    location: item?.location ?? '',
    priceCurrency: item?.priceCurrency ?? base,
    price: item ? toInput(state, item.price, item.priceCurrency) : '',
    wholesalePrice: item?.wholesalePrice !== undefined ? toInput(state, item.wholesalePrice, item.priceCurrency) : '',
    specialPrice: item?.specialPrice !== undefined ? toInput(state, item.specialPrice, item.priceCurrency) : '',
    dealerPrice: item?.dealerPrice !== undefined ? toInput(state, item.dealerPrice, item.priceCurrency) : '',
    dealerId: item?.dealerId ?? '',
    minStock: item?.minStock !== undefined ? String(item.minStock) : '',
    trackExpiry: item?.trackExpiry ?? (feature('batches') && (profile.id === 'pharmacy' || profile.id === 'pharmacydealers')),
    trackSerial: item?.trackSerial ?? false,
    weighed: item?.weighed ?? false,
    warrantyMonths: item?.warrantyMonths ? String(item.warrantyMonths) : '',
  }));
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
          ...(u.price ? { price: parseAmount(state, u.price, cur) } : {}),
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
        price: parseAmount(state, f.price, cur),
        ...(f.wholesalePrice ? { wholesalePrice: parseAmount(state, f.wholesalePrice, cur) } : {}),
        ...(f.specialPrice ? { specialPrice: parseAmount(state, f.specialPrice, cur) } : {}),
        ...(f.dealerPrice ? { dealerPrice: parseAmount(state, f.dealerPrice, cur) } : {}),
        ...(f.dealerId ? { dealerId: f.dealerId } : {}),
        ...(f.minStock ? { minStock: Number(f.minStock) } : {}),
        ...(unitList.length ? { units: unitList } : {}),
        ...(recipeList.length ? { recipe: recipeList } : {}),
        ...(Object.keys(attributes).length ? { attributes } : {}),
        ...(f.kind === 'stock' && f.trackExpiry ? { trackExpiry: true } : {}),
        ...(f.kind === 'stock' && f.trackSerial ? { trackSerial: true } : {}),
        ...(f.weighed ? { weighed: true } : {}),
        ...(f.warrantyMonths ? { warrantyMonths: Number(f.warrantyMonths) } : {}),
        ...(item?.group ? { group: item.group } : {}),
        ...Object.fromEntries((['barcode', 'category', 'brand', 'partNumber', 'compat', 'location'] as const).filter((k) => f[k].trim()).map((k) => [k, f[k].trim()])),
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
            <Field label="المكان (رف / مستودع)">
              <input value={f.location} onChange={set('location')} />
            </Field>
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
            <Field label={feature('dealers') ? (f.dealerId ? 'سعر المبيع (مفرق) — مش مستعمل' : 'سعر الصيدلية (للزبون، وبيتحاسب فيه المورّد)') : 'سعر المبيع (مفرق)'}>
              <input value={f.price} onChange={set('price')} inputMode="decimal" />
            </Field>
            {feature('dealers') && (
              <>
                <Field label="سعر المورّد (بيبيع فيه المورّد)">
                  <input value={f.dealerPrice} onChange={set('dealerPrice')} inputMode="decimal" />
                </Field>
                <Field label="بضاعة مين؟">
                  <select value={f.dealerId} onChange={(e) => setF({ ...f, dealerId: e.target.value })} disabled={!!item && (state.stock[item.id]?.totalQty ?? 0) !== 0}>
                    <option value="">بضاعة الصيدلية</option>
                    {Object.values(state.dealers ?? {}).map((d) => (
                      <option key={d.id} value={d.id}>
                        بضاعة خاصة بالمورّد {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {feature('priceTiers') && (
              <>
                <Field label="سعر الجملة">
                  <input value={f.wholesalePrice} onChange={set('wholesalePrice')} inputMode="decimal" />
                </Field>
                <Field label="سعر خاص">
                  <input value={f.specialPrice} onChange={set('specialPrice')} inputMode="decimal" />
                </Field>
              </>
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
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
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
                price: parseAmount(state, f.price, f.currency),
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

/** ورقة ملصقات باركود للطباعة على طابعة الملصقات أو ورق A4. */
function LabelSheet({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const { state } = useCompany();
  const printer = usePrinter();
  const [copies, setCopies] = useState(1);
  const list = items.flatMap((i) => Array.from({ length: copies }, () => i));
  return (
    <Modal title={`ملصقات الباركود (${items.length} مادة)`} onClose={onClose} width={820}>
      <div className="button-row">
        <label className="check">
          عدد النسخ لكل مادة
          <input type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))} style={{ width: 70 }} />
        </label>
        <button className="primary" onClick={() => printer.print('label', 'a4')}>
          طباعة على A4
        </button>
        <button onClick={() => printer.print('label', '58mm')}>طابعة ملصقات</button>
      </div>
      <div className="print-area labels">
        {list.map((i, n) => (
          <div key={`${i.id}-${n}`} className="label">
            <div className="label-name">{i.name}</div>
            <Barcode value={i.barcode || i.code} />
            <div className="label-code mono">{i.barcode || i.code}</div>
            <div className="label-price">{money(state, i.price, i.priceCurrency)}</div>
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
