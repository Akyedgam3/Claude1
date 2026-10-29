import { useMemo, useState } from 'react';
import { applyListPricing, buyDiscountOf, guessColumns, listPrices, listSettings, readListRows, splitPasted, type Item, type ListColumn, type ListPricing } from '../../../core';
import { money, parseAmount, toInput, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { CurrencySelect, Empty, Field, matches, Modal, PageHeader, SearchBox } from '../components/ui';

const num = (s: string) => Number(String(s).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫،,]/g, '.').trim());
type Edit = { list?: string; disc?: string };

/** النشرات والحسومات: سعر النشرة لكل صنف، وحسم الشراء والمعلمين وزيادة الزبون، واستيراد نشرة كاملة بلصقة. */
export function ListPrices() {
  const { state, call, notify, can } = useCompany();
  const info = state.info!;
  const s = listSettings(info);
  const [cfg, setCfg] = useState({ buy: String(s.buyDiscount), master: String(s.masterDiscount), retail: String(s.retailMarkup) });
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [importing, setImporting] = useState(false);
  const [bump, setBump] = useState('');
  const brands = useMemo(() => [...new Set(Object.values(state.items).filter((i) => !i.archived && i.listPrice).map((i) => i.brand || ''))].sort((a, b) => a.localeCompare(b, 'ar')), [state.items]);
  const rows = useMemo(
    () =>
      Object.values(state.items)
        .filter((i) => !i.archived && i.kind !== 'service' && (!brand || (i.brand ?? '') === brand) && matches(query, i.code, i.name, i.brand))
        .sort((a, b) => (a.brand ?? '').localeCompare(b.brand ?? '', 'ar') || a.code.localeCompare(b.code, 'ar', { numeric: true })),
    [state.items, brand, query],
  );
  const draftOf = (i: Item): Item => {
    const e = edits[i.id];
    if (!e) return i;
    let listPrice = i.listPrice;
    try {
      if (e.list !== undefined) listPrice = e.list.trim() ? parseAmount(state, e.list, i.priceCurrency) : undefined;
    } catch {
      /* رقم ناقص وقت الكتابة */
    }
    const d = e.disc !== undefined ? (e.disc.trim() === '' ? undefined : num(e.disc)) : i.buyDiscount;
    const { buyDiscount: _b, listPrice: _l, ...rest } = i;
    return { ...rest, ...(listPrice !== undefined ? { listPrice } : {}), ...(d !== undefined && Number.isFinite(d) ? { buyDiscount: d } : {}) };
  };
  const dirty = Object.keys(edits).length;
  const manage = can('items.manage');

  const saveSettings = async () => {
    const next: ListPricing = { ...s, buyDiscount: num(cfg.buy) || 0, masterDiscount: num(cfg.master) || 0, retailMarkup: num(cfg.retail) || 0 };
    if (!(await call('updateCompany', { listPricing: next }))) return;
    // كل الأسعار بتتحدّث على النسب الجديدة
    const items = Object.values(state.items).filter((i) => !i.archived && i.listPrice).map((i) => applyListPricing({ ...info, listPricing: next }, draftOf(i)));
    if (items.length && (await call('saveItems', items))) notify(`انحفظت النسب وتحدّث سعر ${items.length} صنف`);
    setEdits({});
  };
  const saveEdits = async () => {
    const items = rows.filter((i) => edits[i.id]).map((i) => applyListPricing(info, draftOf(i)));
    if (await call('saveItems', items)) {
      notify(`تحدّث ${items.length} صنف`);
      setEdits({});
    }
  };
  const applyBump = async () => {
    const p = num(bump);
    if (!p) return;
    const items = rows.filter((i) => i.listPrice).map((i) => applyListPricing(info, { ...i, listPrice: Math.round(i.listPrice! * (1 + p / 100)) }));
    if (items.length && (await call('saveItems', items))) {
      notify(`${p > 0 ? 'ارتفعت' : 'نزلت'} نشرة ${items.length} صنف ${Math.abs(p)}%`);
      setBump('');
    }
  };

  return (
    <div className="page">
      <PageHeader title="النشرات والحسومات">
        {manage && (
          <button className="primary" onClick={() => setImporting(true)}>
            <Icon name="download" size={16} /> استيراد نشرة
          </button>
        )}
      </PageHeader>
      <div className="card list-cfg">
        <Field label="حسم الشراء من الشركة %">
          <input inputMode="decimal" value={cfg.buy} onChange={(e) => setCfg({ ...cfg, buy: e.target.value })} disabled={!can('settings.manage')} />
        </Field>
        <Field label="حسم المعلمين %">
          <input inputMode="decimal" value={cfg.master} onChange={(e) => setCfg({ ...cfg, master: e.target.value })} disabled={!can('settings.manage')} />
        </Field>
        <Field label="زيادة الزبون العادي على النشرة %">
          <input inputMode="decimal" value={cfg.retail} onChange={(e) => setCfg({ ...cfg, retail: e.target.value })} disabled={!can('settings.manage')} />
        </Field>
        {can('settings.manage') && (
          <button onClick={() => void saveSettings()}>
            حفظ النسب وتحديث كل الأسعار
          </button>
        )}
        <p className="muted wide">مثال: نشرة 100 ← بتشتري بـ {100 - (num(cfg.buy) || 0)}، المعلم بـ {100 - (num(cfg.master) || 0)}، والزبون العادي بـ {100 + (num(cfg.retail) || 0)}. ولأي زبون حسم خاص من شاشة العملاء.</p>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالكود أو الاسم..." />
        {brands.length > 0 && (
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">كل النشرات</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b || 'بدون نشرة'}
              </option>
            ))}
          </select>
        )}
        {manage && (
          <span className="with-button" style={{ flex: '0 1 auto' }}>
            <input style={{ width: 90 }} inputMode="decimal" placeholder="± %" value={bump} onChange={(e) => setBump(e.target.value)} />
            <button disabled={!num(bump)} onClick={() => void applyBump()} title="بيرفع (أو بينزّل) سعر النشرة للأصناف المعروضة">
              {brand ? `غيّر نشرة ${brand}` : 'غيّر النشرة'} بالنسبة
            </button>
          </span>
        )}
        <div className="spacer" />
        {manage && dirty > 0 && (
          <button className="primary" onClick={() => void saveEdits()}>
            حفظ التعديلات ({dirty})
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty>ما في أصناف. اكبس «استيراد نشرة» والصق النشرة من Excel أو PDF، وبتنضاف الأصناف بأسعارها.</Empty>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الصنف</th>
              <th>النشرة</th>
              <th className="num">سعر النشرة</th>
              <th className="num">حسم الشراء %</th>
              <th className="num">سعر الشراء</th>
              <th className="num">المعلم</th>
              <th className="num">الزبون</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const d = draftOf(i);
              const p = listPrices(info, d);
              const e = edits[i.id];
              const set = (patch: Edit) => setEdits((x) => ({ ...x, [i.id]: { ...x[i.id], ...patch } }));
              return (
                <tr key={i.id} className={e ? 'warn-row' : ''}>
                  <td className="mono">{i.code}</td>
                  <td>
                    {i.name}
                    {i.units?.[0] && <small className="muted"> · {i.units[0].name}</small>}
                  </td>
                  <td className="muted">{i.brand ?? '—'}</td>
                  <td className="num">
                    <input className="num-input" inputMode="decimal" disabled={!manage} value={e?.list ?? (i.listPrice !== undefined ? toInput(state, i.listPrice, i.priceCurrency) : '')} onChange={(x) => set({ list: x.target.value })} />
                  </td>
                  <td className="num">
                    <input className="num-input" style={{ width: 70 }} inputMode="decimal" disabled={!manage} placeholder={String(buyDiscountOf(info, { brand: i.brand }))} value={e?.disc ?? (i.buyDiscount !== undefined ? String(i.buyDiscount) : '')} onChange={(x) => set({ disc: x.target.value })} />
                  </td>
                  <td className="num muted">{p.list ? money(state, p.cost, i.priceCurrency) : '—'}</td>
                  <td className="num">{p.list ? money(state, p.master, i.priceCurrency) : money(state, i.wholesalePrice ?? i.price, i.priceCurrency)}</td>
                  <td className="num">{p.list ? money(state, p.retail, i.priceCurrency) : money(state, i.price, i.priceCurrency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {importing && <ImportList onClose={() => setImporting(false)} />}
    </div>
  );
}

const COL_NAMES: Record<ListColumn, string> = { skip: 'تجاهل', code: 'الكود', name: 'الصنف', pack: 'التعبئة', price: 'السعر' };

/** استيراد نشرة: بتلصق الجدول (من Excel أو PDF)، بتختار الأعمدة، وبتنضاف الأصناف أو بيتحدّث سعر الموجودة. */
function ImportList({ onClose }: { onClose: () => void }) {
  const { state, call, notify, profile } = useCompany();
  const info = state.info!;
  const s = listSettings(info);
  const [brand, setBrand] = useState('');
  const [currency, setCurrency] = useState(state.currencies['USD'] ? 'USD' : info.baseCurrency);
  const [disc, setDisc] = useState(String(s.buyDiscount));
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const cells = useMemo(() => splitPasted(text), [text]);
  const [cols, setCols] = useState<ListColumn[] | null>(null);
  const guessed = useMemo(() => guessColumns(cells.filter((r) => r.some((c) => /\d/.test(c)))), [cells]);
  const use = cols && cols.length === guessed.length ? cols : guessed;
  const rows = useMemo(() => readListRows(cells, use), [cells, use]);
  const existing = (code: string, name: string) => Object.values(state.items).find((i) => !i.archived && (i.brand ?? '') === brand.trim() && ((code && (i.code === code || i.code.endsWith(code))) || i.name === name));
  const fresh = rows.filter((r) => !existing(r.code, r.name)).length;

  const run = async () => {
    const b = brand.trim();
    if (!b) return notify('اكتب اسم النشرة (الشركة)', 'error');
    if (!rows.length) return notify('ما لقيت أصناف بأسعار. الصق الجدول واختار الأعمدة', 'error');
    const d = num(disc);
    const settings: ListPricing = { ...s, brands: { ...(s.brands ?? {}), [b]: Number.isFinite(d) ? d : s.buyDiscount } };
    await call('updateCompany', { listPricing: settings });
    const used = new Set(Object.values(state.items).map((i) => i.code));
    const items: Item[] = [];
    for (const r of rows) {
      const listPrice = parseAmount(state, String(r.price), currency);
      const old = existing(r.code, r.name);
      if (old) {
        items.push(applyListPricing({ ...info, listPricing: settings }, { ...old, listPrice, priceCurrency: currency }));
        continue;
      }
      let code = r.code || uid().slice(0, 6);
      while (used.has(code)) code = `${b.slice(0, 2)}-${code}`;
      used.add(code);
      items.push(
        applyListPricing({ ...info, listPricing: settings }, {
          id: uid(),
          code,
          name: r.name,
          kind: 'stock',
          unit: 'قطعة',
          brand: b,
          ...(category ? { category } : {}),
          priceCurrency: currency,
          price: 0,
          listPrice,
          ...(r.pack > 1 ? { units: [{ name: `كرتونة ${r.pack}`, factor: r.pack }] } : {}),
        }),
      );
    }
    if (await call('saveItems', items)) {
      notify(`نشرة ${b}: ${fresh} صنف جديد و${items.length - fresh} تحدّث سعره`);
      onClose();
    }
  };

  return (
    <Modal title="استيراد نشرة" onClose={onClose} width={980}>
      <div className="form-grid">
        <Field label="اسم النشرة / الشركة">
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="نيوباور" />
        </Field>
        <Field label="عملة النشرة">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <Field label="حسم الشراء على هالنشرة %">
          <input inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value)} />
        </Field>
        <Field label="التصنيف (اختياري)">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {profile.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الصق النشرة هون (من Excel: حدّد الجدول وانسخه، أو من PDF: حدّد النص وانسخه)" wide>
          <textarea rows={6} value={text} onChange={(e) => (setText(e.target.value), setCols(null))} placeholder={'2000\tمفتاح مفرد 16 امبير\t480\t0.7\n2010\tمفتاح مفرد بضوء\t400\t1.5'} />
        </Field>
        {cells.length > 0 && (
          <div className="wide">
            <p className="muted">
              لقيت {rows.length} صنف ({fresh} جديد، {rows.length - fresh} موجود بيتحدّث سعره). تأكد من الأعمدة:
            </p>
            <div className="table-scroll" style={{ maxHeight: 300 }}>
              <table className="table compact">
                <thead>
                  <tr>
                    {use.map((c, k) => (
                      <th key={k}>
                        <select value={c} onChange={(e) => setCols(use.map((x, j) => (j === k ? (e.target.value as ListColumn) : x === e.target.value ? 'skip' : x)))}>
                          {(Object.keys(COL_NAMES) as ListColumn[]).map((x) => (
                            <option key={x} value={x}>
                              {COL_NAMES[x]}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cells.slice(0, 40).map((r, i) => (
                    <tr key={i}>
                      {use.map((c, k) => (
                        <td key={k} className={c === 'skip' ? 'muted' : ''}>
                          {r[k] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="primary" disabled={!rows.length} onClick={() => void run()}>
            استيراد {rows.length ? `${rows.length} صنف` : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
