import { useMemo, useState } from 'react';
import { dateText, money, qtyText, today, uid, useCompany } from '../api';
import { Empty, Field, itemOptions, PageHeader, Picker } from '../components/ui';

/** الإنتاج (أفران، حلويات، تصنيع بسيط): مواد أولية ← منتج جاهز بتكلفته الحقيقية. */
export function Production() {
  const { state, call, notify, can } = useCompany();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<{ key: string; itemId: string; qty: string }[]>([]);
  const products = useMemo(() => itemOptions(state, (i) => i.kind === 'stock' && !!i.recipe?.length), [state]);
  const showCost = can('costs.view');

  // المواد الأولية المطلوبة حسب الوصفات
  const needs = new Map<string, number>();
  for (const r of rows) {
    for (const line of state.items[r.itemId]?.recipe ?? []) needs.set(line.itemId, (needs.get(line.itemId) ?? 0) + line.qty * (Number(r.qty) || 0));
  }

  return (
    <div className="page">
      <PageHeader title="الإنتاج" />
      <section className="card">
        {products.length === 0 ? (
          <Empty>أضف وصفة إنتاج للمنتجات من شاشة المواد (تبويب "وصفة الإنتاج")</Empty>
        ) : (
          <>
            <div className="form-grid four">
              <Field label="التاريخ">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <table className="table lines">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكمية المنتجة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{state.items[r.itemId]?.name}</td>
                    <td>
                      <input className="num-input" value={r.qty} onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))} inputMode="decimal" />{' '}
                      {state.items[r.itemId]?.unit}
                    </td>
                    <td>
                      <button className="icon" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Picker options={products} value={null} placeholder="+ أضف منتجاً" onChange={(id) => id && setRows([...rows, { key: uid(), itemId: id, qty: '1' }])} />
            {needs.size > 0 && (
              <>
                <h4>المواد الأولية المطلوبة</h4>
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>المادة</th>
                      <th className="num">المطلوب</th>
                      <th className="num">المتوفر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...needs].map(([id, q]) => {
                      const have = state.stock[id]?.totalQty ?? 0;
                      return (
                        <tr key={id}>
                          <td>{state.items[id]?.name}</td>
                          <td className="num">
                            {qtyText(Math.round(q * 1000) / 1000)} {state.items[id]?.unit}
                          </td>
                          <td className={`num ${have < q ? 'bad' : ''}`}>{qtyText(have)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
            <div className="form-actions">
              <button
                className="primary"
                disabled={!rows.length}
                onClick={async () => {
                  const res = await call('postProduction', { date, outputs: rows.map((r) => ({ itemId: r.itemId, qty: Number(r.qty) })) });
                  if (res) {
                    notify('تم تسجيل الإنتاج');
                    setRows([]);
                  }
                }}
              >
                تسجيل الإنتاج
              </button>
            </div>
          </>
        )}
      </section>
      <section className="card">
        <h3>آخر عمليات الإنتاج</h3>
        {state.productions.length === 0 ? (
          <p className="muted">لا يوجد</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المنتجات</th>
                {showCost && <th className="num">التكلفة</th>}
              </tr>
            </thead>
            <tbody>
              {[...state.productions].reverse().slice(0, 100).map((p) => (
                <tr key={p.id}>
                  <td>{dateText(p.date)}</td>
                  <td>{p.outputs.map((o) => `${state.items[o.itemId]?.name} × ${qtyText(o.qty)}`).join('، ')}</td>
                  {showCost && <td className="num">{money(state, p.outputs.reduce((s, o) => s + o.cost, 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
