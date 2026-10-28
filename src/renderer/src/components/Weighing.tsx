import { useRef, useState } from 'react';
import { birdAverage, parseWeights, weighingGross, weighingNet, type Weighing } from '../../../core';
import { Field, Modal } from './ui';
import { Icon } from './icons';

const kg = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 3 });
const num = (s: string) => parseWeights(s)[0] ?? 0;
const TARE_KEY = 'wazn.boxTare';
const savedTare = () => {
  try {
    return localStorage.getItem(TARE_KEY) ?? '';
  } catch {
    return '';
  }
};

/** «99+110+114» بخانة الكمية ← وزنات. */
export function weightsFromQty(text: string): number[] | null {
  return /[+]/.test(text) ? parseWeights(text) : null;
}

/**
 * الوزن قفص قفص متل عالقبان: بتكتب الوزنة وEnter، وبتنطرح الأقفاص الفاضية (عددها × وزن القفص)،
 * وعدد الطيور والنافق بيعطوا وسطي وزن الطير.
 */
export function WeighingModal({ value, unit = 'كيلو', birds = true, onClose, onSave }: { value?: Weighing; unit?: string; birds?: boolean; onClose: () => void; onSave: (w: Weighing | null) => void }) {
  const [weights, setWeights] = useState<number[]>(value?.weights ?? []);
  const [entry, setEntry] = useState('');
  const [boxes, setBoxes] = useState(value?.boxes ? String(value.boxes) : '');
  const [boxTare, setBoxTare] = useState(() => (value?.tare && value.boxes ? String(Math.round((value.tare / value.boxes) * 1000) / 1000) : value?.tare ? '' : savedTare()));
  const [tareTotal, setTareTotal] = useState(value?.tare && !value.boxes ? String(value.tare) : '');
  const [count, setCount] = useState(value?.count ? String(value.count) : '');
  const [dead, setDead] = useState(value?.dead ? String(value.dead) : '');
  const input = useRef<HTMLInputElement>(null);
  const tare = num(tareTotal) || (num(boxes) && num(boxTare) ? Math.round(num(boxes) * num(boxTare) * 1000) / 1000 : 0);
  const pending = parseWeights(entry);
  const all = [...weights, ...pending];
  const w: Weighing = { weights: all, ...(tare ? { tare } : {}), ...(num(boxes) ? { boxes: num(boxes) } : {}), ...(num(count) ? { count: num(count) } : {}), ...(num(dead) ? { dead: num(dead) } : {}) };
  const net = all.length ? weighingNet(w) : 0;
  const avg = all.length ? birdAverage(w) : undefined;
  const add = () => {
    if (!pending.length) return;
    setWeights([...weights, ...pending]);
    setEntry('');
    input.current?.focus();
  };
  const save = () => {
    if (!all.length) return onSave(null);
    if (!(net > 0)) return;
    try {
      if (num(boxTare)) localStorage.setItem(TARE_KEY, boxTare);
    } catch {
      /* مش مهم */
    }
    onSave(w);
  };
  return (
    <Modal title="الوزنات" onClose={onClose} width={640}>
      <div className="form-grid">
        <Field label={`الوزنة (${unit}) — اكتبها واكبس Enter`} wide>
          <div className="with-button">
            <input
              ref={input}
              autoFocus
              inputMode="decimal"
              placeholder="99 أو 99+110+114"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (pending.length) add();
                  else save();
                }
              }}
            />
            <button type="button" className="primary" onClick={add}>
              <Icon name="plus" size={16} /> أضف
            </button>
          </div>
        </Field>
        <div className="wide weigh-list">
          {weights.length === 0 ? (
            <span className="muted">ما في وزنات لسا</span>
          ) : (
            weights.map((x, i) => (
              <span key={i} className="weigh-chip">
                <small>{i + 1}</small> {kg(x)}
                <button type="button" title="حذف الوزنة" onClick={() => setWeights(weights.filter((_, j) => j !== i))}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))
          )}
        </div>
        <Field label="عدد الأقفاص الفاضية">
          <input inputMode="numeric" value={boxes} onChange={(e) => setBoxes(e.target.value)} />
        </Field>
        <Field label="وزن القفص الفاضي">
          <input inputMode="decimal" placeholder="مثلاً 7" value={boxTare} onChange={(e) => setBoxTare(e.target.value)} />
        </Field>
        <Field label="أو وزن الفارغ كله">
          <input inputMode="decimal" placeholder={tare && !num(tareTotal) ? kg(tare) : ''} value={tareTotal} onChange={(e) => setTareTotal(e.target.value)} />
        </Field>
        {birds && (
          <>
            <Field label="عدد الطيور">
              <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
            <Field label="النافق (ما بينحسب)">
              <input inputMode="numeric" value={dead} onChange={(e) => setDead(e.target.value)} />
            </Field>
          </>
        )}
        <div className="kv wide">
          <span>عدد الوزنات</span>
          <strong>{all.length}</strong>
          <span>الوزن القائم</span>
          <strong>{kg(all.length ? weighingGross(w) : 0)}</strong>
          {tare > 0 && (
            <>
              <span>وزن الفارغ</span>
              <strong>− {kg(tare)}</strong>
            </>
          )}
          <span>الصافي</span>
          <strong className={net < 0 ? 'bad' : 'good'}>
            {kg(net)} {unit}
          </strong>
          {avg !== undefined && (
            <>
              <span>وسطي وزن الطير</span>
              <strong>{kg(avg)}</strong>
            </>
          )}
        </div>
        <div className="form-actions wide">
          {value && (
            <button type="button" className="push-start" onClick={() => onSave(null)}>
              بدون وزنات
            </button>
          )}
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="primary" disabled={!all.length || !(net > 0)} onClick={save}>
            اعتمد الصافي
          </button>
        </div>
      </div>
    </Modal>
  );
}
