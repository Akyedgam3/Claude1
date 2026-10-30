import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { itemColor, itemTitle, type CompanyState, type Item, type Party } from '../../../core';
import { api, Company, IS_MOBILE, shownCurrencies, useCompany, type CompanyCtx } from '../api';
import { Icon } from './icons';

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const modalStack: object[] = [];

export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // النوافذ المتداخلة: Escape يغلق العليا فقط، ولا يغلقها إن كانت قائمة اختيار مفتوحة
    const me = {};
    modalStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || modalStack[modalStack.length - 1] !== me) return;
      close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(me), 1);
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined}>
        <header>
          <h3>{title}</h3>
          <button className="icon" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** الشاشات التفصيلية: بيطلع فيها زر X يرجّع للقائمة اللي جيت منها. */
const DETAIL_SCREENS = new Set(['invoice', 'repair', 'quote', 'tailor-order', 'work-order']);

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  const ctx = useContext(Company) as CompanyCtx | null;
  return (
    <div className="page-header">
      {ctx && DETAIL_SCREENS.has(ctx.screenKey) && (
        <button className="back-x" onClick={ctx.back} title="رجوع" aria-label="رجوع">
          <Icon name="close" size={18} />
        </button>
      )}
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
  return matches(query, item.name, item.code, item.partNumber, item.barcode, item.compat, item.brand, item.category, item.group, ...Object.values(item.attributes ?? {}));
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
  const PICKER_MAX = 50;
  const { list, total } = useMemo(() => {
    const all = options.filter((o) => (filter ? filter(o, query) : matches(query, o.label, o.hint)));
    return { list: all.slice(0, PICKER_MAX), total: all.length };
  }, [options, query, filter]);

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
          } else if (e.key === 'Escape' && open) {
            e.preventDefault(); // يغلق القائمة فقط، لا النافذة
            setOpen(false);
          }
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
          {total > list.length && (
            <li className="muted picker-more">
              عم يظهر {list.length} من {total} — اكتب الاسم أو الرمز أو الباركود لتلاقي الباقي
            </li>
          )}
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

/** ألوان الموبايلات الشائعة: الاسم ← لون العرض. */
export const ITEM_COLORS: Record<string, string> = {
  أسود: '#1b1b1d',
  أبيض: '#f6f6f4',
  رمادي: '#8a8f98',
  فضي: '#c3c7cc',
  ذهبي: '#d4af37',
  تيتانيوم: '#9b9486',
  أزرق: '#2f6fde',
  سماوي: '#7ec8f0',
  كحلي: '#1f2f5c',
  أخضر: '#2e9b57',
  نعناعي: '#9fe0c3',
  فيروزي: '#2bb5b0',
  بنفسجي: '#8e5cc9',
  ليلكي: '#c3a6e8',
  زهري: '#f2a7c3',
  أحمر: '#d63b3b',
  برتقالي: '#f08a24',
  أصفر: '#f4d03f',
  بني: '#8b5a2b',
  كريمي: '#efe4cc',
};

/** لون العرض من اسم اللون (حتى لو مكتوب «أزرق فاتح» أو «Blue»). */
export function colorValue(name: string): string | null {
  const n = name.trim();
  const en: Record<string, string> = { black: 'أسود', white: 'أبيض', gray: 'رمادي', grey: 'رمادي', silver: 'فضي', gold: 'ذهبي', titanium: 'تيتانيوم', blue: 'أزرق', navy: 'كحلي', green: 'أخضر', mint: 'نعناعي', purple: 'بنفسجي', violet: 'بنفسجي', lavender: 'ليلكي', pink: 'زهري', red: 'أحمر', orange: 'برتقالي', yellow: 'أصفر', brown: 'بني', cream: 'كريمي' };
  const key = Object.keys(ITEM_COLORS).find((k) => n.startsWith(k)) ?? en[n.toLowerCase().split(/\s+/)[0] ?? ''];
  return key ? ITEM_COLORS[key]! : null;
}

/** نقطة اللون واسمه (بتنعرض جنب اسم الموبايل). */
export function ColorTag({ color }: { color: string }) {
  if (!color) return null;
  const v = colorValue(color);
  return (
    <span className="color-tag" title={`اللون: ${color}`}>
      <i style={v ? { background: v } : undefined} className={v ? '' : 'unknown'} />
      {color}
    </span>
  );
}

/** اسم المادة ومعه لونها إذا إلها لون. */
export function ItemName({ item, strong }: { item: Item | undefined; strong?: boolean }) {
  if (!item) return null;
  const c = itemColor(item);
  return (
    <span className="item-name">
      {strong ? <strong>{item.name}</strong> : item.name}
      {c && !item.name.includes(c) && <ColorTag color={c} />}
    </span>
  );
}

/** اختيار اللون: كبسة على لون جاهز أو كتابة لون تاني. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-picker">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="اختار أو اكتب اللون" />
      <div className="swatches">
        {Object.entries(ITEM_COLORS).map(([name, v]) => (
          <button key={name} type="button" title={name} className={value.trim() === name ? 'on' : ''} style={{ background: v }} onClick={() => onChange(name)} />
        ))}
      </div>
    </div>
  );
}

export function itemOptions(state: CompanyState, filter?: (i: Item) => boolean): (Option & { item: Item })[] {
  return Object.values(state.items)
    .filter((i) => !i.archived && !i.dealerId && (!filter || filter(i)))
    .map((item) => ({
      id: item.id,
      label: itemTitle(item),
      hint: [
        item.code,
        item.partNumber,
        item.compat,
        item.attributes ? Object.values(item.attributes).join(' ') : '',
        item.kind === 'stock' ? `الرصيد: ${state.stock[item.id]?.totalQty ?? 0}` : item.kind === 'composite' ? 'مركّب' : 'خدمة',
      ]
        .filter(Boolean)
        .join(' · '),
      item,
    }));
}

export function CurrencySelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { state } = useCompany();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {shownCurrencies(state, value).map((c) => (
        <option key={c.code} value={c.code}>
          {c.nameAr} ({c.symbol})
        </option>
      ))}
    </select>
  );
}

export function Stat({ label, value, tone, hint, onClick }: { label: string; value: string; tone?: 'good' | 'bad'; hint?: string; onClick?: () => void }) {
  return (
    <div className={`stat ${tone ?? ''} ${onClick ? 'clickable' : ''}`} onClick={onClick} title={onClick ? 'اكبس لتشوف التفاصيل' : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; hidden?: boolean }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="segmented tabs">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button key={t.key} className={value === t.key ? 'active' : ''} onClick={() => onChange(t.key)}>
            {t.label}
          </button>
        ))}
    </div>
  );
}

/** زر يطلب تأكيداً بضغطة ثانية (للإلغاء والحذف). */
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel?: string; onConfirm: () => void | Promise<unknown>; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button
      type="button"
      className={`danger ${className ?? ''}`}
      onClick={async () => {
        setArmed(false);
        await onConfirm();
      }}
    >
      {confirmLabel ?? 'تأكيد'}
    </button>
  ) : (
    <button type="button" className={`ghost danger ${className ?? ''}`} onClick={() => setArmed(true)}>
      {label}
    </button>
  );
}

/** زر الكاميرا (الجوال بس): بيقرأ الباركود وبيرجّع الرقم. على الكمبيوتر ما بيظهر. */
export function CameraScanButton({ onCode, title = 'قراءة الباركود بالكاميرا' }: { onCode: (code: string) => void; title?: string }) {
  const { notify } = useCompany();
  if (!IS_MOBILE) return null;
  return (
    <button
      type="button"
      className="icon camera-scan"
      title={title}
      aria-label={title}
      onClick={async () => {
        try {
          const code = await api.scanBarcode();
          if (code) onCode(code.trim());
        } catch (e) {
          notify((e as Error).message, 'error');
        }
      }}
    >
      <Icon name="camera" size={20} />
    </button>
  );
}

/** حقل الماسح الضوئي: يقرأ الباركود أو الرمز أو رقم القطعة أو باركود الميزان (وبالجوال كمان بالكاميرا). */
export function ScanInput({ onScan, placeholder, autoFocus, inputRef }: { onScan: (code: string) => void; placeholder?: string; autoFocus?: boolean; inputRef?: React.Ref<HTMLInputElement> }) {
  const [value, setValue] = useState('');
  const input = (
    <input
      ref={inputRef}
      autoFocus={autoFocus}
      className="mono scan-input"
      placeholder={placeholder ?? 'امسح الباركود أو اكتب الرمز ثم Enter'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (value.trim()) onScan(value.trim());
          setValue('');
        }
      }}
    />
  );
  if (!IS_MOBILE) return input;
  return (
    <div className="scan-wrap">
      {input}
      <CameraScanButton onCode={onScan} />
    </div>
  );
}

// تأكيد من جوّا البرنامج بدل confirm() الأصلي: على ويندوز نافذة confirm بتخلّي الخانات تبطل تقبل كتابة لحتى يتسكّر البرنامج
type Ask = { message: string; resolve: (ok: boolean) => void };
let pushAsk: ((a: Ask) => void) | null = null;

/** بيسأل المستخدم ويرجّع true إذا وافق. */
export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => (pushAsk ? pushAsk({ message, resolve }) : resolve(window.confirm(message))));
}

/** مكان نافذة التأكيد (مرة وحدة بأعلى الواجهة). */
export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    pushAsk = (a) => setAsk((cur) => (cur ? (a.resolve(false), cur) : a));
    return () => {
      pushAsk = null;
    };
  }, []);
  if (!ask) return null;
  const done = (ok: boolean) => {
    ask.resolve(ok);
    setAsk(null);
  };
  return (
    <Modal title="تأكيد" onClose={() => done(false)} width={420}>
      <p>{ask.message}</p>
      <div className="form-actions">
        <button className="primary" autoFocus onClick={() => done(true)}>
          نعم
        </button>
        <button onClick={() => done(false)}>لا</button>
      </div>
    </Modal>
  );
}
