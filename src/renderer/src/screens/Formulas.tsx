import { useMemo, useState } from 'react';
import type { Item, RecipeLine } from '../../../core';
import { money, parsePrice, qtyText, today, uid, unitMoney, useCompany } from '../api';
import { Icon } from '../components/icons';
import { Empty, Field, itemOptions, Modal, PageHeader, Picker, SearchBox, Tabs } from '../components/ui';

/** متوسط تكلفة الوحدة الأساسية للمادة (أو آخر تكلفة إذا خلصت). */
function unitCostOf(state: ReturnType<typeof useCompany>['state'], id: string): number {
  const s = state.stock[id];
  return s && s.totalQty > 0 ? s.value / s.totalQty : (s?.lastCost ?? 0);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * الخلطات والوصفات (عطور، كولونيا، كريمات، حلويات...): كل منتج إلو وصفة (كحول + زيت + مثبت + عبوة)
 * مكتوبة لكمية معيّنة. «تصنيع» بينقص المواد الأولية من المخزون وبيزيد المنتج بتكلفته الحقيقية.
 */
export function Formulas() {
  const { state, can } = useCompany();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [making, setMaking] = useState<Item | null>(null);
  const showCost = can('costs.view');
  const products = useMemo(
    () =>
      Object.values(state.items)
        .filter((i) => i.kind === 'stock' && !i.archived && i.recipe?.length)
        .filter((i) => !q.trim() || i.name.includes(q.trim()) || i.recipe!.some((r) => state.items[r.itemId]?.name.includes(q.trim())))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [state.items, q],
  );

  return (
    <div className="page">
      <PageHeader title="الخلطات والوصفات">
        {can('items.manage') && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> وصفة جديدة
          </button>
        )}
      </PageHeader>
      <p className="muted">
        اكتب وصفة كل منتج مرة وحدة (مثلاً: 100 مل كولونيا = 80 مل كحول + 15 مل زيت عطري + 5 مل مثبت). وقت «تصنيع» البرنامج بينقص المواد الأولية من المخزون حسب الكمية، وبيزيد المنتج بتكلفته.
      </p>
      {products.length > 3 && <SearchBox value={q} onChange={setQ} placeholder="ابحث عن منتج أو مادة..." />}
      {products.length === 0 ? (
        <section className="card">
          <Empty>ما في وصفات لسا. اكبس «وصفة جديدة» واكتب مكوّنات أول منتج.</Empty>
        </section>
      ) : (
        <div className="formula-grid">
          {products.map((p, i) => {
            const y = p.recipeYield && p.recipeYield > 0 ? p.recipeYield : 1;
            const perUnit = p.recipe!.reduce((s, r) => s + unitCostOf(state, r.itemId) * r.qty, 0);
            const canMake = Math.min(...p.recipe!.map((r) => (r.qty > 0 ? (state.stock[r.itemId]?.totalQty ?? 0) / r.qty : Infinity)));
            const margin = p.price > 0 && perUnit > 0 ? Math.round(((p.price - perUnit) / p.price) * 100) : null;
            return (
              <article key={p.id} className="formula-card" style={{ ['--i' as string]: Math.min(i, 12) }}>
                <header>
                  <span className="formula-icon">
                    <Icon name="flask" size={18} />
                  </span>
                  <div>
                    <h4>{p.name}</h4>
                    <small className="muted">
                      الوصفة لـ {qtyText(y)} {p.unit} · بالمخزن {qtyText(state.stock[p.id]?.totalQty ?? 0)} {p.unit}
                    </small>
                  </div>
                </header>
                <ul className="formula-lines">
                  {p.recipe!.map((r) => {
                    const it = state.items[r.itemId];
                    const have = state.stock[r.itemId]?.totalQty ?? 0;
                    return (
                      <li key={r.itemId}>
                        <span>{it?.name ?? '—'}</span>
                        <b className={have < r.qty ? 'bad' : ''}>
                          {qtyText(round3(r.qty * y))} {it?.unit}
                        </b>
                      </li>
                    );
                  })}
                </ul>
                <div className="formula-foot">
                  {showCost && (
                    <span>
                      تكلفة {p.unit}: <b>{unitMoney(state, perUnit)}</b>
                      {margin !== null && <em className={margin < 0 ? 'bad' : 'good'}> · ربح {margin}%</em>}
                    </span>
                  )}
                  <span className={canMake < 1 ? 'bad' : 'muted'}>{canMake < 1 ? 'المواد ما بتكفي' : `المواد بتكفي لـ ${qtyText(Math.floor(canMake * 1000) / 1000)} ${p.unit}`}</span>
                </div>
                <div className="formula-actions">
                  {can('items.manage') && (
                    <button type="button" onClick={() => setEditing(p)}>
                      تعديل
                    </button>
                  )}
                  {can('production.manage') && (
                    <button type="button" className="primary" onClick={() => setMaking(p)}>
                      <Icon name="factory" size={16} /> تصنيع
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editing && <FormulaEditor product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {making && <ManufactureDialog product={making} onClose={() => setMaking(null)} />}
    </div>
  );
}

/** تعديل الوصفة أو منتج جديد بوصفته. */
function FormulaEditor({ product, onClose }: { product: Item | null; onClose: () => void }) {
  const { state, call, notify, profile } = useCompany();
  const base = state.info!.baseCurrency;
  const [productId, setProductId] = useState<string | null>(product?.id ?? null);
  const [isNew, setIsNew] = useState(!product);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState(profile.units[0] ?? 'قطعة');
  const [category, setCategory] = useState(profile.categories[0] ?? '');
  const [price, setPrice] = useState('');
  const current = productId ? state.items[productId] : undefined;
  const [yieldText, setYieldText] = useState(String(product?.recipeYield ?? (/مل|غرام/.test(profile.units[0] ?? '') ? 100 : 1)));
  // منتج جديد بالمل أو الغرام: الوصفة عادةً لـ 100
  const changeUnit = (u: string) => {
    setUnit(u);
    if (!product && (yieldText === '1' || yieldText === '100')) setYieldText(/مل|غرام/.test(u) ? '100' : '1');
  };
  const y = Number(yieldText) > 0 ? Number(yieldText) : 1;
  const [rows, setRows] = useState<{ key: string; itemId: string; qty: string }[]>(() =>
    (product?.recipe ?? []).map((r) => ({ key: uid(), itemId: r.itemId, qty: String(round3(r.qty * (product?.recipeYield || 1))) })),
  );
  const materials = useMemo(() => itemOptions(state, (i) => i.kind === 'stock' && i.id !== productId), [state, productId]);
  const productOptions = useMemo(() => itemOptions(state, (i) => i.kind === 'stock'), [state]);
  const batchCost = rows.reduce((s, r) => s + unitCostOf(state, r.itemId) * (Number(r.qty) || 0), 0);
  const prodUnit = isNew ? unit : (current?.unit ?? '');

  const pickProduct = (id: string | null) => {
    setProductId(id);
    const it = id ? state.items[id] : undefined;
    if (it?.recipe?.length) {
      const yy = it.recipeYield || 1;
      setYieldText(String(yy));
      setRows(it.recipe.map((r) => ({ key: uid(), itemId: r.itemId, qty: String(round3(r.qty * yy)) })));
    }
  };

  const save = async () => {
    const recipe: RecipeLine[] = rows
      .filter((r) => r.itemId && Number(r.qty) > 0)
      .map((r) => ({ itemId: r.itemId, qty: Number(r.qty) / y }));
    if (!recipe.length) return notify('أضف مادة وحدة عالأقل للوصفة', 'error');
    let item: Item;
    if (isNew) {
      if (!name.trim()) return notify('اكتب اسم المنتج', 'error');
      let sell = 0;
      try {
        sell = price.trim() ? parsePrice(state, price, base) : 0;
      } catch (e) {
        return notify((e as Error).message, 'error');
      }
      const codes = Object.values(state.items).map((i) => Number(i.code)).filter(Number.isFinite);
      item = {
        id: uid(),
        code: String((codes.length ? Math.max(...codes) : 0) + 1).padStart(4, '0'),
        name: name.trim(),
        kind: 'stock',
        unit,
        price: sell,
        priceCurrency: base,
        ...(category ? { category } : {}),
        recipe,
        recipeYield: y,
      };
    } else {
      if (!current) return notify('اختار المنتج', 'error');
      item = { ...current, recipe, recipeYield: y };
    }
    if (await call('saveItem', item)) {
      notify(isNew ? `انضاف «${item.name}» مع وصفته` : 'انحفظت الوصفة');
      onClose();
    }
  };

  return (
    <Modal title={product ? `وصفة ${product.name}` : 'وصفة جديدة'} onClose={onClose} width={680}>
      {!product && (
        <div style={{ marginBottom: 12 }}>
          <Tabs
            value={isNew ? 'new' : 'old'}
            onChange={(v) => setIsNew(v === 'new')}
            tabs={[
              { key: 'new', label: 'منتج جديد' },
              { key: 'old', label: 'منتج موجود' },
            ]}
          />
        </div>
      )}
      <div className="form-grid">
        {isNew ? (
          <>
            <Field label="اسم المنتج">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: كولونيا ليمون" autoFocus />
            </Field>
            <Field label="الوحدة">
              <select value={unit} onChange={(e) => changeUnit(e.target.value)}>
                {profile.units.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="التصنيف">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">—</option>
                {profile.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label={`سعر المبيع (للـ${unit})`}>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="اختياري" />
            </Field>
          </>
        ) : (
          !product && (
            <Field label="المنتج" wide>
              <Picker options={productOptions} value={productId} onChange={pickProduct} placeholder="اختار المنتج..." />
            </Field>
          )
        )}
        <Field label="الوصفة بتعطي">
          <span className="inline-unit">
            <input value={yieldText} onChange={(e) => setYieldText(e.target.value)} inputMode="decimal" /> {prodUnit}
          </span>
        </Field>
      </div>
      <h4 style={{ margin: '14px 0 6px' }}>المكوّنات (للكمية فوق)</h4>
      <div className="mf-rows">
        {rows.map((r) => {
          const it = state.items[r.itemId];
          return (
            <div key={r.key} className="mf-row">
              <span className="mf-name">{it?.name}</span>
              <span className="inline-unit">
                <input className="num-input" value={r.qty} onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))} inputMode="decimal" placeholder="الكمية" /> {it?.unit}
              </span>
              <small className="muted mf-meta">{unitMoney(state, unitCostOf(state, r.itemId) * (Number(r.qty) || 0))}</small>
              <button type="button" className="icon" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} aria-label="حذف">
                <Icon name="close" size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <Picker options={materials} value={null} placeholder="+ أضف مادة (كحول، زيت، مثبت، عبوة...)" onChange={(id) => id && !rows.some((r) => r.itemId === id) && setRows([...rows, { key: uid(), itemId: id, qty: '' }])} />
      {batchCost > 0 && (
        <p className="muted" style={{ marginTop: 10 }}>
          تكلفة الوصفة: <b>{money(state, Math.round(batchCost))}</b> · تكلفة الـ{prodUnit}: <b>{unitMoney(state, batchCost / y)}</b>
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="primary" onClick={() => void save()}>
          حفظ الوصفة
        </button>
      </div>
    </Modal>
  );
}

/** تصنيع: كم بدك تعمل، والمواد بتنحسب لحالها (وفيك تعدّل الكمية الفعلية اللي استعملتها). */
function ManufactureDialog({ product, onClose }: { product: Item; onClose: () => void }) {
  const { state, call, notify, can } = useCompany();
  const y = product.recipeYield && product.recipeYield > 0 ? product.recipeYield : 1;
  const [qtyText_, setQty] = useState(String(y));
  const [date, setDate] = useState(today());
  const [expiry, setExpiry] = useState('');
  const qty = Number(qtyText_) || 0;
  // الكمية الفعلية: إذا ما تعدّلت بتمشي عالوصفة
  const [edited, setEdited] = useState<Record<string, string>>({});
  const lines = product.recipe!.map((r) => {
    const planned = round3(r.qty * qty);
    const text = edited[r.itemId];
    const used = text !== undefined && text.trim() !== '' ? Number(text) : planned;
    return { itemId: r.itemId, planned, used, have: state.stock[r.itemId]?.totalQty ?? 0 };
  });
  const short = lines.filter((l) => l.used > l.have + 1e-9);
  const cost = lines.reduce((s, l) => s + unitCostOf(state, l.itemId) * l.used, 0);
  const allowNegative = !!state.info?.allowNegativeStock;

  const run = async () => {
    if (!(qty > 0)) return notify('اكتب الكمية اللي بدك تصنّعها', 'error');
    if (lines.some((l) => !(l.used >= 0) || !Number.isFinite(l.used))) return notify('كمية مادة غير صحيحة', 'error');
    const changed = Object.keys(edited).some((k) => edited[k]?.trim());
    const res = await call('postProduction', {
      date,
      outputs: [{ itemId: product.id, qty, ...(expiry ? { expiry } : {}) }],
      ...(changed ? { inputs: lines.filter((l) => l.used > 0).map((l) => ({ itemId: l.itemId, qty: l.used })) } : {}),
      memo: `تصنيع ${product.name} × ${qtyText(qty)} ${product.unit}`,
    });
    if (res) {
      notify(`تصنّع ${qtyText(qty)} ${product.unit} ${product.name} وانخصمت المواد من المخزون`);
      onClose();
    }
  };

  return (
    <Modal title={`تصنيع ${product.name}`} onClose={onClose} width={600}>
      <div className="form-grid">
        <Field label="الكمية اللي بدك تصنّعها">
          <span className="inline-unit">
            <input value={qtyText_} onChange={(e) => setQty(e.target.value)} inputMode="decimal" autoFocus /> {product.unit}
          </span>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {product.trackExpiry && (
          <Field label="تاريخ الانتهاء">
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="qty-chips">
        {[0.5, 1, 2, 5, 10].map((m) => (
          <button key={m} type="button" className={qty === round3(y * m) ? 'active' : ''} onClick={() => setQty(String(round3(y * m)))}>
            {qtyText(round3(y * m))} {product.unit}
          </button>
        ))}
      </div>
      <div className="mf-rows">
        {lines.map((l) => {
          const it = state.items[l.itemId];
          return (
            <div key={l.itemId} className="mf-row">
              <span className="mf-name">− {it?.name}</span>
              <span className="inline-unit">
                <input className="num-input" value={edited[l.itemId] ?? String(l.planned)} onChange={(e) => setEdited({ ...edited, [l.itemId]: e.target.value })} inputMode="decimal" /> {it?.unit}
              </span>
              <small className={`mf-meta ${l.have - l.used < 0 ? 'bad' : 'muted'}`}>
                بالمخزن {qtyText(l.have)} ← {qtyText(round3(l.have - l.used))}
              </small>
            </div>
          );
        })}
        <div className="mf-row mf-out">
          <span className="mf-name">+ {product.name}</span>
          <b>
            {qtyText(qty)} {product.unit}
          </b>
          <small className="mf-meta good">
            بالمخزن {qtyText(state.stock[product.id]?.totalQty ?? 0)} ← {qtyText(round3((state.stock[product.id]?.totalQty ?? 0) + qty))}
          </small>
        </div>
      </div>
      {can('costs.view') && qty > 0 && (
        <p className="muted">
          التكلفة: <b>{money(state, Math.round(cost))}</b> · الـ{product.unit} بـ <b>{unitMoney(state, cost / qty)}</b>
          {product.price > 0 && <> · سعر المبيع {money(state, product.price, product.priceCurrency)}</>}
        </p>
      )}
      {short.length > 0 && (
        <div className="banner bad">
          ما بيكفي: {short.map((l) => state.items[l.itemId]?.name).join('، ')}. {allowNegative ? 'رح يصير المخزون بالسالب.' : 'اشتري المواد أو عدّل الكمية.'}
        </div>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="primary" disabled={!(qty > 0) || (short.length > 0 && !allowNegative)} onClick={() => void run()}>
          <Icon name="factory" size={16} /> تصنيع
        </button>
      </div>
    </Modal>
  );
}
