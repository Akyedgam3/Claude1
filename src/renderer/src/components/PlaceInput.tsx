import { useId, useMemo } from 'react';
import { checkPlace, placesIn } from '../../../core';
import { useCompany } from '../api';

/** خانة مكان المادة بمستودع: بتقترح الأماكن الموجودة، وبتقلك إذا المكان جديد (رح ينضاف) أو موجود ومين عليه. */
export function PlaceInput({ warehouseId, value, onChange, selfId, placeholder }: { warehouseId: string; value: string; onChange: (v: string) => void; selfId?: string; placeholder?: string }) {
  const { state } = useCompany();
  const id = useId();
  const places = useMemo(() => [...placesIn(state, warehouseId).keys()].sort((a, b) => a.localeCompare(b, 'ar', { numeric: true })), [state, warehouseId]);
  const check = checkPlace(state, warehouseId, value, selfId);
  const names = check.items.slice(0, 3).map((i) => i.name).join('، ');
  return (
    <div className="place-input">
      <input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'رف 3 / ركن A'} />
      <datalist id={id}>
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {check.state === 'new' && <small className="good">مكان جديد — رح ينضاف</small>}
      {check.state === 'exists' && (
        <small className="muted">
          {check.items.length ? `موجود: ${names}${check.items.length > 3 ? ` و${check.items.length - 3} غيرها` : ''}` : 'موجود (هاي المادة نفسها)'}
        </small>
      )}
    </div>
  );
}
