// التكاليف الإضافية بفاتورة الشراء (نقل، شحن، جمركة): بتنوزّع على المواد حسب القيمة أو الكمية وبتدخل بتكلفتها.
// الدفع: من صندوق، أو على حساب المورد نفسه، أو على جهة تانية (شركة شحن، مخلّص).
import type { Account, CompanyState, ExtraCost } from '../../../core';
import { money, parseAmount, toInput, uid } from '../api';
import { Icon } from './icons';
import { Field, Picker, partyOptions } from './ui';

export interface ExtraRow {
  key: string;
  amount: string;
  split: 'value' | 'qty';
  pay: 'cash' | 'supplier' | 'party';
  cashAccountId: string;
  partyId: string | null;
  memo: string;
}

export const emptyExtra = (box: string): ExtraRow => ({ key: uid(), amount: '', split: 'value', pay: 'cash', cashAccountId: box, partyId: null, memo: '' });

export function extraRowsFrom(state: CompanyState, extras: ExtraCost[] | undefined, currency: string, box: string): ExtraRow[] {
  return (extras ?? []).map((x) => ({ key: uid(), amount: toInput(state, x.amount, currency), split: x.split, pay: x.pay, cashAccountId: x.cashAccountId ?? box, partyId: x.partyId ?? null, memo: x.memo ?? '' }));
}

/** الصفوف المعبّاية بصيغة الفاتورة (والمبلغ الغلط بيرمي خطأ مفهوم) */
export function extraCostsOf(state: CompanyState, rows: ExtraRow[], currency: string): ExtraCost[] {
  const out: ExtraCost[] = [];
  rows.forEach((r, i) => {
    if (!r.amount.trim()) return;
    let amount: number;
    try {
      amount = parseAmount(state, r.amount, currency);
    } catch {
      throw new Error(`التكلفة الإضافية ${i + 1}: المبلغ مش مفهوم`);
    }
    if (!(amount > 0)) return;
    out.push({ amount, split: r.split, pay: r.pay, ...(r.pay === 'cash' ? { cashAccountId: r.cashAccountId } : {}), ...(r.pay === 'party' && r.partyId ? { partyId: r.partyId } : {}), ...(r.memo.trim() ? { memo: r.memo.trim() } : {}) });
  });
  return out;
}

export function ExtraCostsEditor({ state, rows, onChange, currency, boxes, lockedBox, goodsTotal }: { state: CompanyState; rows: ExtraRow[]; onChange: (rows: ExtraRow[]) => void; currency: string; boxes: Account[]; lockedBox: string | null; goodsTotal: number }) {
  const box = lockedBox ?? boxes[0]?.id ?? '1101';
  const set = (key: string, patch: Partial<ExtraRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  let total = 0;
  for (const r of rows) {
    try {
      if (r.amount.trim()) total += Math.max(0, parseAmount(state, r.amount, currency));
    } catch {
      /* بيبيّن الخطأ وقت الحفظ */
    }
  }
  return (
    <section className="card extra-costs">
      <div className="extra-head">
        <h3>تكاليف إضافية (نقل، شحن، جمركة)</h3>
        <button type="button" className="small" onClick={() => onChange([...rows, emptyExtra(box)])}>
          <Icon name="plus" size={14} /> تكلفة إضافية
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">إذا دفعت أجور نقل أو شحن أو جمركة على هالبضاعة، ضيفها هون: بتنوزّع على المواد وبتدخل بتكلفتها، فالربح بيطلع صح.</p>
      ) : (
        <>
          {rows.map((r) => (
            <div key={r.key} className="extra-row form-grid four">
              <Field label="المبلغ">
                <input className="num-input" inputMode="decimal" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} autoFocus={!r.amount} />
              </Field>
              <Field label="التوزيع على المواد">
                <select value={r.split} onChange={(e) => set(r.key, { split: e.target.value as ExtraRow['split'] })}>
                  <option value="value">حسب القيمة (السعر)</option>
                  <option value="qty">حسب العدد (الكمية)</option>
                </select>
              </Field>
              <Field label="الدفع">
                <select value={r.pay} onChange={(e) => set(r.key, { pay: e.target.value as ExtraRow['pay'] })}>
                  <option value="cash">دفعتها من الصندوق</option>
                  <option value="supplier">على حساب المورد</option>
                  <option value="party">على جهة تانية (شركة شحن، مخلّص)</option>
                </select>
              </Field>
              {r.pay === 'cash' ? (
                <Field label="من صندوق">
                  <select value={r.cashAccountId} disabled={!!lockedBox} onChange={(e) => set(r.key, { cashAccountId: e.target.value })}>
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : r.pay === 'party' ? (
                <Field label="الجهة">
                  <Picker options={partyOptions(state, 'supplier')} value={r.partyId} onChange={(id) => set(r.key, { partyId: id })} placeholder="شركة الشحن أو المخلّص…" />
                </Field>
              ) : (
                <div className="extra-note muted">بتنضاف على اللي علينا للمورد.</div>
              )}
              <Field label="البيان" wide>
                <div className="with-button">
                  <input value={r.memo} onChange={(e) => set(r.key, { memo: e.target.value })} placeholder="أجور نقل وجمركة…" />
                  <button type="button" className="icon" title="حذف" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </Field>
            </div>
          ))}
          {total > 0 && (
            <p className="extra-sum">
              مجموع التكاليف الإضافية <b>{money(state, total, currency)}</b>
              {goodsTotal > 0 && (
                <>
                  ، يعني {(Math.round((total / goodsTotal) * 1000) / 10).toLocaleString('ar')}% فوق سعر البضاعة. تكلفة البضاعة كلها <b>{money(state, goodsTotal + total, currency)}</b>
                </>
              )}
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
