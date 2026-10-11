import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CompanyState, Item, Party } from '../../../core';
import { useCompany } from '../api';

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined}>
        <header>
          <h3>{title}</h3>
          <button className="icon" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <h2>{title}</h2>
      <div className="actions">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input className="search" type="search" value={value} placeholder={placeholder ?? 'بحث...'} onChange={(e) => onChange(e.target.value)} autoFocus />
  );
}

/** بحث يتجاهل الهمزات والتاء المربوطة ليسهل إيجاد الأسماء العربية. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْ]/g, '')
    .replace(/[\s\-_/]+/g, '');
}

export function matches(query: string, ...fields: (string | number | undefined)[]): boolean {
  const q = normalize(query);
  if (!q) return true;
  return fields.some((f) => f !== undefined && normalize(String(f)).includes(q));
}

export function itemMatches(item: Item, query: string): boolean {
  return matches(query, item.name, item.code, item.partNumber, item.barcode, item.compat, item.brand, item.category);
}

interface Option {
  id: string;
  label: string;
  hint?: string;
}

/** قائمة اختيار مع بحث، تُستخدم لاختيار المواد والعملاء. */
export function Picker({
  options,
  value,
  onChange,
  placeholder,
  filter,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  filter?: (option: Option, query: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const list = useMemo(
    () => options.filter((o) => (filter ? filter(o, query) : matches(query, o.label, o.hint))).slice(0, 50),
    [options, query, filter],
  );

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    onChange(o.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="picker" ref={ref}>
      <input
        value={open ? query : (selected?.label ?? '')}
        placeholder={placeholder ?? 'اختر...'}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, list.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') {
            e.preventDefault();
            choose(list[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul className="picker-list">
          {list.length === 0 && <li className="muted">لا نتائج</li>}
          {list.map((o, i) => (
            <li key={o.id} className={i === active ? 'active' : ''} onMouseDown={() => choose(o)} onMouseEnter={() => setActive(i)}>
              <div>{o.label}</div>
              {o.hint && <small>{o.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function partyOptions(state: CompanyState, side?: 'customer' | 'supplier'): Option[] {
  return Object.values(state.parties)
    .filter((p: Party) => !p.archived && (!side || p.kind === side || p.kind === 'both'))
    .map((p) => ({ id: p.id, label: p.name, ...(p.phone ? { hint: p.phone } : {}) }));
}

export function itemOptions(state: CompanyState): (Option & { item: Item })[] {
  return Object.values(state.items)
    .filter((i) => !i.archived)
    .map((item) => ({
      id: item.id,
      label: `${item.name}`,
      hint: [item.code, item.partNumber, item.compat, `الرصيد: ${state.stock[item.id]?.totalQty ?? 0}`].filter(Boolean).join(' · '),
      item,
    }));
}

export function CurrencySelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { state } = useCompany();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.values(state.currencies).map((c) => (
        <option key={c.code} value={c.code}>
          {c.nameAr}
        </option>
      ))}
    </select>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
