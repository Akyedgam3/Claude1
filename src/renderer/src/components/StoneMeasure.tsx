// «قياس» بفاتورة المنشرة: طول × عرض × سماكة × عدد (سم) ← متر مربع إذا السماكة لحد 10 سم، ومتر مكعب إذا أكتر.
import { useState } from 'react';
import { STONE_THICK_LIMIT, stoneMeasure } from '../../../core';
import { Field, Modal } from './ui';

const num = (t: string) => Number(t.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬]/g, '').replace('٫', '.')) || 0;

export function StoneMeasureModal({ itemUnit, onClose, onSave }: { itemUnit?: string; onClose: () => void; onSave: (r: { qty: number; unit: 'م²' | 'م³'; text: string }) => void }) {
  const [f, setF] = useState({ length: '', width: '', thick: '', count: '1' });
  const [force, setForce] = useState<'auto' | 'm2' | 'm3'>('auto');
  const r = stoneMeasure({ length: num(f.length), width: num(f.width), thick: num(f.thick), count: num(f.count) }, force === 'auto' ? {} : { force });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const mismatch = r && itemUnit && /م[²³2-3]|متر/.test(itemUnit) && itemUnit !== r.unit;
  return (
    <Modal title="قياس الحجر" onClose={onClose} width={460}>
      <form
        className="form-grid stone-measure"
        onSubmit={(e) => {
          e.preventDefault();
          if (r) onSave(r);
        }}
      >
        <Field label="الطول (سم)">
          <input className="num-input" inputMode="decimal" value={f.length} onChange={set('length')} autoFocus />
        </Field>
        <Field label="العرض (سم)">
          <input className="num-input" inputMode="decimal" value={f.width} onChange={set('width')} />
        </Field>
        <Field label="السماكة (سم)">
          <input className="num-input" inputMode="decimal" value={f.thick} onChange={set('thick')} />
        </Field>
        <Field label="العدد">
          <input className="num-input" inputMode="decimal" value={f.count} onChange={set('count')} />
        </Field>
        <div className="segmented wide" role="radiogroup">
          {(['auto', 'm2', 'm3'] as const).map((k) => (
            <button type="button" key={k} className={force === k ? 'active' : ''} onClick={() => setForce(k)}>
              {k === 'auto' ? `تلقائي (لحد ${STONE_THICK_LIMIT} سم مربع)` : k === 'm2' ? 'متر مربع' : 'متر مكعب'}
            </button>
          ))}
        </div>
        <p className="wide stone-result">{r ? <b>{r.text}</b> : <span className="muted">اكتب الطول والعرض (والسماكة)</span>}</p>
        {mismatch && <p className="wide bad small">وحدة المادة «{itemUnit}» والقياس طلع {r!.unit}: تأكد إنك اخترت المادة الصح (ألواح بالمربع، كتل بالمكعب).</p>}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={!r}>
            حط الكمية
          </button>
        </div>
      </form>
    </Modal>
  );
}
