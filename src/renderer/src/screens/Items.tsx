import { useMemo, useState } from 'react';
import type { Item } from '../../../core';
import { money, parseAmount, qtyText, toInput, uid, useCompany } from '../api';
import { CurrencySelect, Empty, Field, itemMatches, Modal, PageHeader, SearchBox } from '../components/ui';

export function Items() {
  const { state } = useCompany();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const isAuto = state.info?.activity === 'auto';

  const items = useMemo(
    () =>
      Object.values(state.items)
        .filter((i) => !i.archived && itemMatches(i, query))
        .sort((a, b) => a.code.localeCompare(b.code, 'ar', { numeric: true })),
    [state.items, query],
  );

  return (
    <div className="page">
      <PageHeader title={isAuto ? 'القطع والمواد' : 'المواد والخدمات'}>
        <button className="primary" onClick={() => setEditing('new')}>
          + مادة جديدة
        </button>
      </PageHeader>
      <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم، الرمز، رقم القطعة، الباركود، أو نوع السيارة..." />
      {items.length === 0 ? (
        <Empty>{query ? 'لا توجد نتائج' : 'لم تُضف أي مادة بعد'}</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرمز</th>
              <th>الاسم</th>
              {isAuto && <th>رقم القطعة</th>}
              {isAuto && <th>تناسب</th>}
              <th>الماركة</th>
              <th>المكان</th>
              <th className="num">الرصيد</th>
              <th className="num">سعر المبيع</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const qty = state.stock[i.id]?.totalQty ?? 0;
              const low = i.kind === 'stock' && i.minStock !== undefined && qty <= i.minStock;
              return (
                <tr key={i.id} className="clickable" onClick={() => setEditing(i)}>
                  <td className="mono">{i.code}</td>
                  <td>
                    {i.name}
                    {i.kind === 'service' && <span className="tag">خدمة</span>}
                  </td>
                  {isAuto && <td className="mono">{i.partNumber}</td>}
                  {isAuto && <td>{i.compat}</td>}
                  <td>{i.brand}</td>
                  <td>{i.location}</td>
                  <td className={`num ${low ? 'bad' : ''}`}>{i.kind === 'stock' ? `${qtyText(qty)} ${i.unit}` : '—'}</td>
                  <td className="num">{money(state, i.price, i.priceCurrency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && <ItemForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function nextCode(codes: string[]): string {
  const max = codes.map((c) => Number(c)).filter(Number.isFinite).reduce((m, n) => Math.max(m, n), 0);
  return String(max + 1).padStart(4, '0');
}

export function ItemForm({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved?: (item: Item) => void }) {
  const { state, call, notify } = useCompany();
  const isAuto = state.info?.activity === 'auto';
  const base = state.info!.baseCurrency;
  const [f, setF] = useState(() => ({
    code: item?.code ?? nextCode(Object.values(state.items).map((i) => i.code)),
    name: item?.name ?? '',
    kind: item?.kind ?? 'stock',
    unit: item?.unit ?? 'قطعة',
    barcode: item?.barcode ?? '',
    category: item?.category ?? '',
    brand: item?.brand ?? '',
    partNumber: item?.partNumber ?? '',
    compat: item?.compat ?? '',
    location: item?.location ?? '',
    priceCurrency: item?.priceCurrency ?? base,
    price: item ? toInput(state, item.price, item.priceCurrency) : '',
    wholesalePrice: item?.wholesalePrice !== undefined ? toInput(state, item.wholesalePrice, item.priceCurrency) : '',
    minStock: item?.minStock !== undefined ? String(item.minStock) : '',
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    let data: Item;
    try {
      data = {
        id: item?.id ?? uid(),
        code: f.code.trim(),
        name: f.name.trim(),
        kind: f.kind as Item['kind'],
        unit: f.unit.trim() || 'قطعة',
        priceCurrency: f.priceCurrency,
        price: parseAmount(state, f.price, f.priceCurrency),
        ...(f.wholesalePrice ? { wholesalePrice: parseAmount(state, f.wholesalePrice, f.priceCurrency) } : {}),
        ...(f.minStock ? { minStock: Number(f.minStock) } : {}),
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
    <Modal title={item ? 'تعديل مادة' : 'مادة جديدة'} onClose={onClose} width={720}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="الاسم" wide>
          <input value={f.name} onChange={set('name')} autoFocus placeholder={isAuto ? 'مثال: فلتر زيت كيا ريو' : ''} />
        </Field>
        <Field label="الرمز">
          <input value={f.code} onChange={set('code')} className="mono" />
        </Field>
        <Field label="النوع">
          <select value={f.kind} onChange={set('kind')}>
            <option value="stock">مادة مخزنية</option>
            <option value="service">خدمة (بدون مخزون)</option>
          </select>
        </Field>
        {isAuto && (
          <>
            <Field label="رقم القطعة (OEM)">
              <input value={f.partNumber} onChange={set('partNumber')} className="mono" dir="ltr" />
            </Field>
            <Field label="تناسب السيارات">
              <input value={f.compat} onChange={set('compat')} placeholder="كيا ريو 2012-2016، هيونداي أكسنت" />
            </Field>
          </>
        )}
        <Field label="الماركة / المنشأ">
          <input value={f.brand} onChange={set('brand')} placeholder={isAuto ? 'أصلي، كوري، صيني...' : ''} />
        </Field>
        <Field label="التصنيف">
          <input value={f.category} onChange={set('category')} placeholder={isAuto ? 'فلاتر، فرامل، كهرباء...' : ''} />
        </Field>
        <Field label="الوحدة">
          <input value={f.unit} onChange={set('unit')} />
        </Field>
        <Field label="الباركود">
          <input value={f.barcode} onChange={set('barcode')} className="mono" dir="ltr" />
        </Field>
        <Field label="المكان (رف / مستودع)">
          <input value={f.location} onChange={set('location')} />
        </Field>
        <Field label="الحد الأدنى للتنبيه">
          <input type="number" min={0} value={f.minStock} onChange={set('minStock')} />
        </Field>
        <Field label="عملة السعر">
          <CurrencySelect value={f.priceCurrency} onChange={(c) => setF({ ...f, priceCurrency: c })} />
        </Field>
        <Field label="سعر المبيع (مفرق)">
          <input value={f.price} onChange={set('price')} inputMode="decimal" />
        </Field>
        <Field label="سعر الجملة">
          <input value={f.wholesalePrice} onChange={set('wholesalePrice')} inputMode="decimal" />
        </Field>
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
