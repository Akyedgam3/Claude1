// قوائم الأسعار: اختيار القائمة (بالفاتورة وبطاقة الزبون) ونافذة قائمة جديدة/تعديل.
import { useState } from 'react';
import { COST_LIST, PRICE_BASIS_NAMES, PRICE_TIERS, customPriceLists, priceListRule, type Party, type PriceBasis, type PriceListDef } from '../../../core';
import { useCompany } from '../api';
import { Field, Modal } from './ui';

export const NEW_LIST = '__new__';

/** خيارات القوائم: شرائح المادة، سعر الكلفة (لمين بيشوف التكلفة)، وقوائم المحل. */
export function priceListOptions(lists: PriceListDef[], opts: { costs: boolean; special?: boolean; current?: string }) {
  const out: { key: string; label: string }[] = PRICE_TIERS.map((t) => ({ key: t.id, label: t.short }));
  if (opts.special || opts.current === 'special') out.push({ key: 'special', label: 'سعر خاص' });
  if (opts.costs || opts.current === COST_LIST) out.push({ key: COST_LIST, label: 'سعر الكلفة' });
  for (const l of lists) out.push({ key: l.id, label: `${l.name} (${priceListRule(l)})` });
  return out;
}

/** قائمة منسدلة لاختيار قائمة الأسعار، وآخر خيار «قائمة جديدة…». */
export function PriceListSelect({ value, onChange, disabled, allowNew = true, party }: { value: string; onChange: (key: string) => void; disabled?: boolean; allowNew?: boolean; party?: Party | null }) {
  const { state, can } = useCompany();
  const [creating, setCreating] = useState(false);
  const lists = customPriceLists(state.info);
  const options = priceListOptions(lists, { costs: can('costs.view'), current: value });
  return (
    <>
      <select
        className="price-list-select"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === NEW_LIST) setCreating(true);
          else onChange(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
        {/* قائمة محذوفة لسا مختارة */}
        {!options.some((o) => o.key === value) && <option value={value}>قائمة محذوفة</option>}
        {allowNew && can('price.edit') && <option value={NEW_LIST}>+ قائمة أسعار جديدة…</option>}
      </select>
      {creating && (
        <PriceListForm
          list={null}
          party={party ?? null}
          onClose={() => setCreating(false)}
          onSaved={(l) => {
            setCreating(false);
            onChange(l.id);
          }}
        />
      )}
    </>
  );
}

/** نافذة قائمة أسعار جديدة أو تعديلها: الاسم (مثلاً «نص جملة»)، الأساس، والنسبة. */
export function PriceListForm({ list, party, onClose, onSaved }: { list: PriceListDef | null; party?: Party | null; onClose: () => void; onSaved: (l: PriceListDef) => void }) {
  const { call, can, notify } = useCompany();
  const costs = can('costs.view');
  const [name, setName] = useState(list?.name ?? '');
  const [basis, setBasis] = useState<PriceBasis>(list?.basis ?? (costs ? 'cost' : 'retail'));
  const [percent, setPercent] = useState(list ? String(list.percent) : '');
  const [forParty, setForParty] = useState(false);
  const [saving, setSaving] = useState(false);
  const pct = Number(percent.replace('٫', '.').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))) || 0);
  const save = async () => {
    if (saving) return;
    if (!name.trim()) return notify('اكتب اسم القائمة (مثلاً: نص جملة)', 'error');
    if (!Number.isFinite(pct) || pct <= -100) return notify('النسبة مش مفهومة', 'error');
    setSaving(true);
    try {
      const res = await call<PriceListDef>('savePriceList', { ...(list ? { id: list.id } : {}), name: name.trim(), basis, percent: pct });
      if (!res) return;
      if (forParty && party) await call('saveParty', { ...party, priceList: res.value.id });
      notify(list ? 'انحفظت القائمة' : `انعملت قائمة «${res.value.name}»`);
      onSaved(res.value);
    } finally {
      setSaving(false);
    }
  };
  const bases = (Object.keys(PRICE_BASIS_NAMES) as PriceBasis[]).filter((b) => b !== 'cost' || costs || list?.basis === 'cost');
  return (
    <Modal title={list ? `تعديل ${list.name}` : 'قائمة أسعار جديدة'} onClose={onClose} width={460}>
      <div className="form-grid">
        <Field label="اسم القائمة" wide>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: نص جملة" autoFocus />
        </Field>
        <Field label="السعر من">
          <select value={basis} onChange={(e) => setBasis(e.target.value as PriceBasis)}>
            {bases.map((b) => (
              <option key={b} value={b}>
                {PRICE_BASIS_NAMES[b]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="النسبة % (زيادة، أو بالسالب حسم)">
          <input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" placeholder={basis === 'cost' ? 'مثلاً 15' : 'مثلاً -5'} />
        </Field>
      </div>
      <p className="muted">
        السعر = {priceListRule({ basis, percent: Number.isFinite(pct) ? pct : 0 })}. مثلاً مادة {basis === 'cost' ? 'سعر شراها' : PRICE_BASIS_NAMES[basis]} 1000 بتصير بهالقائمة{' '}
        <b>{Number.isFinite(pct) ? Math.round(1000 * (1 + pct / 100) * 100) / 100 : '—'}</b>. القائمة بتضل محفوظة وبتقدر تختارها لأي زبون أو بأي فاتورة.
      </p>
      {party && !list && can('parties.manage') && (
        <label className="check">
          <input type="checkbox" checked={forParty} onChange={(e) => setForParty(e.target.checked)} /> خليها قائمة {party.name} دايماً
        </label>
      )}
      <div className="form-actions">
        <button className="primary big" disabled={saving} onClick={() => void save()}>
          حفظ
        </button>
      </div>
    </Modal>
  );
}
