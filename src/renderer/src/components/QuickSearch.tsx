import { useEffect, useMemo, useRef, useState } from 'react';
import { INVOICE_KIND_NAMES } from '../../../core';
import { dateText, money, useCompany } from '../api';
import { Icon } from './icons';
import { matches } from './ui';

interface Hit {
  key: string;
  icon: string;
  label: string;
  hint: string;
  go: () => void;
}

/** بحث سريع في كل البرنامج (Ctrl+K): شاشات، مواد، عملاء، فواتير، طلبات. */
export function QuickSearch({ screens, onClose }: { screens: { key: string; label: string; icon: string }[]; onClose: () => void }) {
  const { state, navigate, can, feature } = useCompany();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const hits = useMemo<Hit[]>(() => {
    const text = q.trim();
    const out: Hit[] = [];
    const go = (key: string, param?: string) => () => {
      navigate(key, param);
      onClose();
    };
    for (const s of screens) if (!text || matches(text, s.label)) out.push({ key: `s:${s.key}`, icon: s.icon, label: s.label, hint: 'شاشة', go: go(s.key) });
    if (!text) return out.slice(0, 12);
    const num = /^\d+$/.test(text) ? Number(text) : null;
    for (const i of Object.values(state.items)) {
      if (i.archived || !matches(text, i.name, i.code, i.barcode, i.partNumber, i.category)) continue;
      out.push({ key: `i:${i.id}`, icon: 'package', label: i.name, hint: `${i.code} · الرصيد ${state.stock[i.id]?.totalQty ?? 0}`, go: go('items', i.name) });
      if (out.length > 60) break;
    }
    for (const p of Object.values(state.parties)) {
      if (p.archived || !matches(text, p.name, p.phone)) continue;
      out.push({ key: `p:${p.id}`, icon: 'users', label: p.name, hint: p.phone ?? '', go: go('parties', p.id) });
    }
    for (const inv of state.invoices) {
      if (num !== null ? inv.number !== num : !matches(text, inv.partyId ? state.parties[inv.partyId]?.name : '')) continue;
      out.push({
        key: `v:${inv.id}`,
        icon: 'receipt',
        label: `${INVOICE_KIND_NAMES[inv.kind]} رقم ${inv.number}`,
        hint: `${dateText(inv.date)} · ${money(state, inv.total, inv.currency)}${inv.voidEntryId ? ' · ملغاة' : ''}`,
        go: go('invoice', inv.id),
      });
    }
    if (feature('tailoring') && can('tailoring.manage')) {
      for (const o of Object.values(state.tailorOrders)) {
        if (num !== null ? o.number !== num : !matches(text, state.parties[o.partyId]?.name)) continue;
        out.push({ key: `t:${o.id}`, icon: 'scissors', label: `طلب تفصيل رقم ${o.number}`, hint: state.parties[o.partyId]?.name ?? '', go: go('tailor-order', o.id) });
      }
    }
    if (feature('serials') && /^[\w-]{6,}$/.test(text.trim())) {
      // رقم IMEI: بيفتح سجل الجهاز
      const t = text.trim();
      const known = Object.values(state.stock).some((s) => s.serials?.[t]) || state.invoices.some((i) => i.lines.some((l) => l.serials?.includes(t)));
      if (known) out.push({ key: `imei:${t}`, icon: 'smartphone', label: `سجل الجهاز ${t}`, hint: 'IMEI', go: go('devices', t) });
    }
    if (feature('installments')) {
      for (const pl of Object.values(state.installments)) {
        if (num !== null ? pl.number !== num : !matches(text, state.parties[pl.partyId]?.name, pl.guarantor)) continue;
        out.push({ key: `inst:${pl.id}`, icon: 'calendar', label: `خطة تقسيط رقم ${pl.number}`, hint: state.parties[pl.partyId]?.name ?? '', go: go('installments') });
      }
    }
    if (feature('workshop') && can('tailoring.manage')) {
      for (const o of Object.values(state.workOrders)) {
        if (num !== null ? o.number !== num : !matches(text, o.model, o.modelCode, state.parties[o.partyId]?.name)) continue;
        out.push({ key: `w:${o.id}`, icon: 'factory', label: `طلبية إنتاج رقم ${o.number} — ${o.model}`, hint: state.parties[o.partyId]?.name ?? '', go: go('work-order', o.id) });
      }
      // رقم التوب: بيفتح قائمة الأتواب
      for (const r of Object.values(state.rolls)) {
        if (!text || !matches(text, r.code)) continue;
        out.push({ key: `roll:${r.id}`, icon: 'ruler', label: `توب ${r.code} — ${r.fabric}`, hint: state.parties[r.partyId]?.name ?? '', go: go('workshop', 'rolls') });
      }
    }
    if (feature('repairs') && can('repairs.manage')) {
      for (const r of Object.values(state.repairs)) {
        const v = state.vehicles[r.vehicleId];
        if (num !== null ? r.number !== num : !matches(text, v?.plate, v?.vin, state.parties[r.partyId]?.name)) continue;
        out.push({ key: `r:${r.id}`, icon: 'wrench', label: `أمر صيانة رقم ${r.number}`, hint: `${v?.make ?? ''} ${v?.model ?? ''} ${v?.plate ?? ''}`, go: go('repair', r.id) });
      }
    }
    return out.slice(0, 40);
  }, [q, state, screens, navigate, onClose, can, feature]);

  const safe = Math.min(active, Math.max(0, hits.length - 1));
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="quick-search" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          placeholder="ابحث عن مادة، زبون، رقم فاتورة، أو شاشة..."
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(Math.min(safe + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(safe - 1, 0));
            } else if (e.key === 'Enter') hits[safe]?.go();
          }}
        />
        <ul>
          {hits.map((h, i) => (
            <li key={h.key} className={i === safe ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={h.go}>
              <Icon name={h.icon} size={18} />
              <strong>{h.label}</strong>
              <small>{h.hint}</small>
            </li>
          ))}
          {hits.length === 0 && <li className="muted">لا توجد نتائج</li>}
        </ul>
        <footer className="muted">↑ ↓ للتنقل · Enter للفتح · Esc للإغلاق</footer>
      </div>
    </div>
  );
}
