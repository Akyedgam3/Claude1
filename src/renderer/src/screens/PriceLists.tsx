// «قوائم الأسعار»: شرائح المادة (مفرق، جملة، جملة الجملة، وكيل)، سعر الكلفة، وقوائم المحل
// اللي بيسمّيها هو («نص جملة» = سعر الشراء + 15%). كل زبون إلو قائمة، وبالفاتورة بتتغيّر وقت الحاجة.
import { useMemo, useState } from 'react';
import { COST_LIST, PRICE_TIERS, customPriceLists, partyPriceList, priceListPrice, priceListRule, tierPrice, type PriceListDef, type PriceTier } from '../../../core';
import { money, useCompany } from '../api';
import { PriceListForm } from '../components/PriceLists';
import { askConfirm, Empty, ItemName, PageHeader, SearchBox, itemMatches } from '../components/ui';
import { DocHeader, PrintButtons } from '../components/print';

export function PriceLists() {
  const { state, call, can, notify, navigate } = useCompany();
  const costs = can('costs.view');
  const lists = customPriceLists(state.info);
  const [editing, setEditing] = useState<PriceListDef | null | 'new'>(null);
  const [view, setView] = useState<string>(() => lists[0]?.id ?? 'wholesale');
  const [query, setQuery] = useState('');

  // كم زبون على كل قائمة
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of Object.values(state.parties)) if (!p.archived && p.kind !== 'supplier') c[partyPriceList(p)] = (c[partyPriceList(p)] ?? 0) + 1;
    return c;
  }, [state.parties]);

  const all: { key: string; name: string; rule: string; def?: PriceListDef }[] = [
    ...(costs ? [{ key: COST_LIST, name: 'سعر الكلفة', rule: 'آخر سعر شراء للمادة (بدون ربح)' }] : []),
    ...PRICE_TIERS.map((t) => ({ key: t.id, name: t.short, rule: 'من بطاقة المادة' })),
    ...lists.filter((l) => costs || l.basis !== 'cost').map((l) => ({ key: l.id, name: l.name, rule: priceListRule(l), def: l })),
  ];
  const current = all.find((a) => a.key === view) ?? all[0]!;

  const rows = useMemo(() => {
    return Object.values(state.items)
      .filter((i) => !i.archived && !i.hidden && i.kind !== 'service' && (!query.trim() || itemMatches(i, query)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .slice(0, 400)
      .map((item) => {
        const retail = { price: item.price, currency: item.priceCurrency };
        const p = current.key === COST_LIST || current.def ? priceListPrice(state, item, current.key) : { price: tierPrice(item, current.key as PriceTier), currency: item.priceCurrency };
        return { item, retail, p };
      });
  }, [state, query, current]);

  const remove = async (l: PriceListDef) => {
    const n = counts[l.id] ?? 0;
    if (!(await askConfirm(`حذف قائمة «${l.name}»؟${n ? ` (${n} زبون عليها بيرجعوا لأسعار المفرق أو شريحتهم)` : ''}`))) return;
    if (await call('deletePriceList', l.id)) {
      notify('انحذفت القائمة');
      if (view === l.id) setView('wholesale');
    }
  };

  return (
    <div className="page price-lists">
      <PageHeader title="قوائم الأسعار">
        {can('price.edit') && (
          <button className="primary" onClick={() => setEditing('new')}>
            + قائمة جديدة
          </button>
        )}
      </PageHeader>
      <p className="muted">
        كل زبون إلو قائمة أسعار (من بطاقته)، وبالفاتورة بتقدر تختار قائمة تانية وقت الحاجة. القوائم الجديدة بتسمّيها متل ما بدك (مثلاً «نص جملة» = سعر الشراء + 15%)، وأسعارها بتتحدّث لحالها مع كل شراء أو تعديل سعر.
      </p>
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>القائمة</th>
              <th>السعر</th>
              <th className="num">الزباين</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {all.map((a) => (
              <tr key={a.key} className={`clickable ${a.key === current.key ? 'selected' : ''}`} onClick={() => setView(a.key)}>
                <td>
                  <b>{a.name}</b>
                </td>
                <td className="muted">{a.rule}</td>
                <td className="num">
                  {counts[a.key] ? (
                    <button
                      className="link"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('parties');
                      }}
                    >
                      {counts[a.key]}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                  {a.def && can('items.manage') && (
                    <>
                      <button onClick={() => setEditing(a.def!)}>تعديل</button>
                      <button className="danger" onClick={() => void remove(a.def!)}>
                        حذف
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {can('settings.manage') && <ConsumerPrices />}

      <section className="card print-area">
        <DocHeader title={`قائمة أسعار: ${current.name}`} />
        <div className="toolbar no-print">
          <h3>أسعار «{current.name}»</h3>
          <SearchBox value={query} onChange={setQuery} placeholder="ابحث عن مادة..." />
          <PrintButtons kind="report" name={`قائمة أسعار ${current.name}`} papers={['a4']} />
        </div>
        {rows.length === 0 ? (
          <Empty>ما في مواد</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>المادة</th>
                {current.key !== 'retail' && <th className="num">سعر المفرق</th>}
                <th className="num">{current.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, retail, p }) => (
                <tr key={item.id}>
                  <td>
                    <ItemName item={item} />
                  </td>
                  {current.key !== 'retail' && <td className="num muted">{money(state, retail.price, retail.currency)}</td>}
                  <td className="num">
                    <b>{p ? money(state, Math.round(p.price), p.currency) : '—'}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <PriceListForm
          list={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(l) => {
            setEditing(null);
            setView(l.id);
          }}
        />
      )}
    </div>
  );
}

/** «أسعار المستهلك» لزباين الجملة: ربح المحل بنسبة وحدة على كل المواد، وإظهارها بالفاتورة */
function ConsumerPrices() {
  const { state, call, notify } = useCompany();
  const print = state.info!.print ?? {};
  const [pct, setPct] = useState(print.consumerMarkup ? String(print.consumerMarkup) : '');
  const [on, setOn] = useState(!!print.showConsumerPrice);
  const save = async () => {
    const n = Number(String(pct).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace('٫', '.').replace(',', '.'));
    if (pct.trim() && (!Number.isFinite(n) || n < 0 || n > 1000)) return void notify('اكتب نسبة صحيحة (مثلاً 15)', 'error');
    const next = { ...print, showConsumerPrice: on };
    if (pct.trim() && n > 0) next.consumerMarkup = n;
    else delete next.consumerMarkup;
    if (await call('updateCompany', { print: next })) notify(on ? (n > 0 ? `صار سعر المستهلك = سعر الفاتورة + ${n}% لكل المواد` : 'صار سعر المستهلك يطلع بالفاتورة') : 'انحفظ، وسعر المستهلك مخفي من الفواتير');
  };
  return (
    <section className="card consumer-prices">
      <h3>أسعار المستهلك</h3>
      <p className="muted">
        لزباين الجملة: بفاتورة المبيع بيطلع عمود «سعر المستهلك» حتى المحل يعرف بقديش يبيع. حط ربح المحل مرة وحدة وبيتطبّق على كل المواد: سعر المستهلك = سعر المادة بالفاتورة + النسبة. المادة اللي إلها «سعر مستهلك» ببطاقتها بتضل عليه. بدون نسبة = سعر المفرق.
      </p>
      <div className="button-row">
        <label className="check">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          إظهار سعر المستهلك بالفاتورة
        </label>
        <label className="field-inline">
          ربح المحل %
          <input className="num" style={{ width: 90 }} inputMode="decimal" placeholder="مثلاً 15" value={pct} onChange={(e) => setPct(e.target.value)} />
        </label>
        <button className="primary" onClick={() => void save()}>
          حفظ
        </button>
      </div>
    </section>
  );
}
