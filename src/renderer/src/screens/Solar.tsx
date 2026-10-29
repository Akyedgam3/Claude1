import { useMemo, useState } from 'react';
import {
  DEFAULT_DESIGN,
  SOLAR_APPLIANCES,
  SOLAR_PART_NAMES,
  SOLAR_STATUS_NAMES,
  solarDeposits,
  solarDesign,
  solarLineAmount,
  solarQuoteText,
  solarTotals,
  solarWarranties,
  type CompanyState,
  type Invoice,
  type SolarLine,
  type SolarLoad,
  type SolarPart,
  type SolarProject,
  type SolarStatus,
} from '../../../core';
import { api, convertPrice, dateText, fxRates, money, parseAmount, qtyText, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { DocHeader, PrintButtons } from '../components/print';
import { CurrencySelect, Empty, Field, itemOptions, matches, Modal, PageHeader, partyOptions, Picker, SearchBox, Tabs } from '../components/ui';
import { PartyForm } from './Parties';
import { DeliverDialog, DepositDialog } from './Tailor';

const OPEN: SolarStatus[] = ['quote', 'accepted', 'installed'];
const EDIT_STATUS: SolarStatus[] = ['quote', 'accepted', 'installed', 'cancelled'];
const PARTS: SolarPart[] = ['panel', 'inverter', 'battery', 'other', 'labor'];
/** تصنيف المواد لكل نوع بند (لاختيار المادة المقترحة). */
const PART_CATEGORY: Partial<Record<SolarPart, string>> = { panel: 'ألواح شمسية', inverter: 'انفرترات', battery: 'بطاريات' };
const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫،,]/g, '.').trim() || 0);
const kwh = (wh: number) => `${qtyText(Math.round(wh / 10) / 100)} ك.و.س`;

/** ملخص المنظومة بسطر: «4 ألواح · انفرتر 3.6 كيلو · 1 بطارية». */
function systemSummary(p: SolarProject): string {
  const of = (part: SolarPart) => p.lines.filter((l) => l.part === part);
  const panels = of('panel').reduce((s, l) => s + l.qty, 0);
  const batt = of('battery').reduce((s, l) => s + l.qty, 0);
  const inv = of('inverter')[0]?.name;
  return [panels ? `${panels} لوح` : '', inv ?? '', batt ? `${batt} بطارية` : ''].filter(Boolean).join(' · ') || '—';
}

/** الطاقة الشمسية: منظومات (حاسبة أحمال، عرض سعر، عربون، تركيب وفاتورة) وكفالات القطع. */
export function Solar() {
  const { state, can, call, notify, navigate } = useCompany();
  const [tab, setTab] = useState<'projects' | 'warranties'>('projects');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [editing, setEditing] = useState<SolarProject | 'new' | null>(null);
  const all = useMemo(() => Object.values(state.solarProjects ?? {}), [state.solarProjects]);
  const rows = useMemo(
    () =>
      all
        .filter((p) => show === 'all' || OPEN.includes(p.status))
        .filter((p) => matches(query, p.number, p.title, p.address, state.parties[p.partyId]?.name, state.parties[p.partyId]?.phone, ...p.lines.flatMap((l) => [l.name, ...(l.serials ?? [])])))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number),
    [all, show, query, state.parties],
  );
  const ym = today().slice(0, 7);
  const stats = useMemo(
    () => ({
      quotes: all.filter((p) => p.status === 'quote').length,
      waiting: all.filter((p) => p.status === 'accepted').length,
      month: all.filter((p) => (p.status === 'installed' || p.status === 'invoiced') && (p.installDate ?? '').startsWith(ym)).length,
      deposits: all.filter((p) => OPEN.includes(p.status)).reduce((s, p) => s + solarDeposits(state, p), 0),
    }),
    [all, state, ym],
  );
  const setStatus = async (p: SolarProject, status: SolarStatus) => {
    const { deposits: _d, invoiceId: _i, createdAt: _c, number: _n, ...rest } = p;
    if (await call('saveSolarProject', { ...rest, status, ...(status === 'installed' && !p.installDate ? { installDate: today() } : {}) })) notify(`المنظومة رقم ${p.number}: ${SOLAR_STATUS_NAMES[status]}`);
  };
  const manage = can('solar.manage');

  return (
    <div className="page">
      <PageHeader title="الطاقة الشمسية">
        {manage && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> منظومة جديدة
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat clickable" onClick={() => setShow('open')}>
          <span>عروض أسعار</span>
          <strong>{stats.quotes}</strong>
        </div>
        <div className="stat">
          <span>بانتظار التركيب</span>
          <strong className={stats.waiting ? 'good' : ''}>{stats.waiting}</strong>
        </div>
        <div className="stat">
          <span>تركّبت هالشهر</span>
          <strong>{stats.month}</strong>
        </div>
        <div className="stat">
          <span>عربون مقبوض</span>
          <strong>{money(state, stats.deposits)}</strong>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'projects', label: 'المنظومات' },
          { key: 'warranties', label: 'الكفالات' },
        ]}
      />
      {tab === 'warranties' ? (
        <Warranties onOpen={(p) => setEditing(p)} />
      ) : (
        <>
          <div className="toolbar">
            <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالزبون، الهاتف، العنوان، الرقم التسلسلي..." />
            <select value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')}>
              <option value="open">الشغّالة</option>
              <option value="all">كل المنظومات</option>
            </select>
          </div>
          {rows.length === 0 ? (
            <Empty>{query ? 'ما في منظومات بهالبحث.' : 'ما في منظومات شغّالة. اكبس «منظومة جديدة»، احسب أحمال الزبون وطلّعله عرض سعر.'}</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>الزبون</th>
                  <th>المنظومة</th>
                  <th>الحالة</th>
                  <th className="num">القيمة</th>
                  <th className="num">العربون</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                    <td className="mono">{p.number}</td>
                    <td>
                      <strong>{state.parties[p.partyId]?.name}</strong>
                      {(p.title || p.address) && <div className="muted">{[p.title, p.address].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td className="muted">{systemSummary(p)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {p.invoiceId || !manage ? (
                        <span className={`tag sol-${p.status}`}>{SOLAR_STATUS_NAMES[p.status]}</span>
                      ) : (
                        <select value={p.status} onChange={(e) => void setStatus(p, e.target.value as SolarStatus)}>
                          {EDIT_STATUS.map((s) => (
                            <option key={s} value={s}>
                              {SOLAR_STATUS_NAMES[s]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="num">{money(state, solarTotals(p).total, p.currency)}</td>
                    <td className="num">{solarDeposits(state, p) ? money(state, solarDeposits(state, p), p.currency) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {p.invoiceId && (
                        <button className="small" onClick={() => navigate('invoice', p.invoiceId)}>
                          الفاتورة
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {editing && <ProjectForm project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** كفالات القطع المركّبة: بتبحث بالرقم التسلسلي أو الزبون، وبتشوف شو باقي من الكفالة. */
function Warranties({ onOpen }: { onOpen: (p: SolarProject) => void }) {
  const { state } = useCompany();
  const [query, setQuery] = useState('');
  const [ended, setEnded] = useState(false);
  const d = today();
  const rows = solarWarranties(state)
    .filter((w) => ended || w.end >= d)
    .filter((w) => matches(query, w.project.number, state.parties[w.project.partyId]?.name, state.parties[w.project.partyId]?.phone, w.line.name, ...w.serials));
  const left = (end: string) => Math.round((Date.parse(end) - Date.parse(d)) / 864e5);
  return (
    <>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالرقم التسلسلي، الزبون، القطعة..." />
        <label className="check">
          <input type="checkbox" checked={ended} onChange={(e) => setEnded(e.target.checked)} /> مع المنتهية
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty>ما في كفالات. بتنحسب من تاريخ التركيب لكل قطعة إلها مدة كفالة.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الزبون</th>
              <th>القطعة</th>
              <th>الرقم التسلسلي</th>
              <th>التركيب</th>
              <th>نهاية الكفالة</th>
              <th>الباقي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const n = left(w.end);
              return (
                <tr key={w.project.id + w.line.id} className="clickable" onClick={() => onOpen(w.project)}>
                  <td>
                    <strong>{state.parties[w.project.partyId]?.name}</strong>
                    <div className="muted">منظومة رقم {w.project.number}</div>
                  </td>
                  <td>
                    {w.line.name}
                    {w.line.qty !== 1 && <span className="muted"> × {qtyText(w.line.qty)}</span>}
                  </td>
                  <td className="mono">{w.serials.join('، ') || '—'}</td>
                  <td>{dateText(w.start)}</td>
                  <td>{dateText(w.end)}</td>
                  <td className={n < 0 ? 'bad' : n <= 60 ? 'warn' : 'good'}>{n < 0 ? 'منتهية' : n <= 60 ? `${n} يوم` : n < 730 ? `${Math.floor(n / 30)} شهر` : `${Math.floor(n / 365)} سنين`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

type LoadForm = { id: string; name: string; watts: string; qty: string; dayHours: string; nightHours: string };
type LineForm = { id: string; part: SolarPart; itemId: string | null; name: string; qty: string; price: string; warranty: string; serials: string };

const loadToForm = (l: SolarLoad): LoadForm => ({ id: l.id, name: l.name, watts: String(l.watts), qty: String(l.qty), dayHours: String(l.dayHours), nightHours: String(l.nightHours) });
const lineToForm = (state: CompanyState, cur: string, l: SolarLine): LineForm => ({
  id: l.id,
  part: l.part,
  itemId: l.itemId ?? null,
  name: l.name,
  qty: String(l.qty),
  price: toInput(state, l.price, cur),
  warranty: l.warrantyMonths ? String(l.warrantyMonths) : '',
  serials: (l.serials ?? []).join('، '),
});

function ProjectForm({ project: initial, onClose }: { project: SolarProject | null; onClose: () => void }) {
  const { state, call, notify, navigate, can } = useCompany();
  const [id] = useState(() => initial?.id ?? uid());
  const project = state.solarProjects?.[id] ?? initial;
  const base = state.info!.baseCurrency;
  const [f, setF] = useState({
    partyId: project?.partyId ?? '',
    title: project?.title ?? '',
    address: project?.address ?? '',
    date: project?.date ?? today(),
    installDate: project?.installDate ?? '',
    status: project?.status ?? ('quote' as SolarStatus),
    currency: project?.currency ?? base,
    discount: project?.discount ? toInput(state, project.discount, project.currency) : '',
    notes: project?.notes ?? '',
    sunHours: String(project?.design?.sunHours ?? DEFAULT_DESIGN.sunHours),
    panelWatts: String(project?.design?.panelWatts ?? DEFAULT_DESIGN.panelWatts),
    batteryKwh: String(project?.design?.batteryKwh ?? DEFAULT_DESIGN.batteryKwh),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [loads, setLoads] = useState<LoadForm[]>(() => project?.loads.map(loadToForm) ?? []);
  const [lines, setLines] = useState<LineForm[]>(() => project?.lines.map((l) => lineToForm(state, project.currency, l)) ?? []);
  const [visits, setVisits] = useState(() => project?.visits ?? []);
  const [visit, setVisit] = useState({ date: today(), note: '' });
  const [newParty, setNewParty] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const locked = !!project?.invoiceId;
  const goods = useMemo(() => itemOptions(state, (i) => i.kind !== 'composite'), [state]);
  const setLoad = (i: number, patch: Partial<LoadForm>) => setLoads((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const loadsOut: SolarLoad[] = loads.filter((l) => l.name.trim()).map((l) => ({ id: l.id, name: l.name.trim(), watts: num(l.watts), qty: num(l.qty) || 1, dayHours: num(l.dayHours), nightHours: num(l.nightHours) }));
  const design = { sunHours: num(f.sunHours) || DEFAULT_DESIGN.sunHours, panelWatts: num(f.panelWatts) || DEFAULT_DESIGN.panelWatts, batteryKwh: num(f.batteryKwh) || DEFAULT_DESIGN.batteryKwh };
  const calc = solarDesign(loadsOut, design);

  const priceOf = (itemId: string, cur: string) => {
    const it = state.items[itemId];
    if (!it) return '';
    const v = convertPrice(state, it.price, it.priceCurrency, cur, fxRates(state, today()));
    return v === null ? '' : toInput(state, v, cur);
  };
  const newLine = (part: SolarPart, itemId: string | null = null, qty = 1): LineForm => {
    const it = itemId ? state.items[itemId] : undefined;
    return { id: uid(), part, itemId, name: it?.name ?? (part === 'labor' ? 'تركيب وتشغيل' : ''), qty: String(qty), price: itemId ? priceOf(itemId, f.currency) : '', warranty: part === 'panel' ? '120' : part === 'inverter' ? '24' : part === 'battery' ? '60' : '', serials: '' };
  };
  /** المادة الأنسب من المخزون: بنفس التصنيف وفيها الرقم (550 واط، 3.6 كيلو...) إذا موجودة. */
  const suggestItem = (part: SolarPart, hint: number) => {
    const cat = PART_CATEGORY[part];
    const list = Object.values(state.items).filter((i) => !i.archived && i.kind === 'stock' && i.category === cat);
    if (part === 'inverter' && hint > 0) {
      // أصغر انفرتر بالمخزون بيغطي الحمل (الرقم من الاسم: «انفرتر 3.6 كيلو»)
      const size = (n: string) => Number(/(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
      const fit = list.filter((i) => size(i.name) >= hint).sort((a, b) => size(a.name) - size(b.name))[0];
      if (fit) return fit.id;
    }
    return (list.find((i) => i.name.includes(String(hint))) ?? list[0])?.id ?? null;
  };
  // عبّي الألواح والانفرتر والبطاريات من الحساب
  const applyDesign = () => {
    const want: [SolarPart, number, number][] = [
      ['panel', calc.panels, design.panelWatts],
      ['inverter', calc.inverterKw ? 1 : 0, calc.inverterKw],
      ['battery', calc.batteries, design.batteryKwh],
    ];
    setLines((ls) => {
      let out = [...ls];
      for (const [part, qty, hint] of want) {
        if (!qty) continue;
        const i = out.findIndex((l) => l.part === part);
        if (i >= 0) out = out.map((l, j) => (j === i ? { ...l, qty: String(qty) } : l));
        else out.push(newLine(part, suggestItem(part, hint), qty));
      }
      return out;
    });
  };

  const build = (): Omit<SolarProject, 'number' | 'deposits' | 'invoiceId' | 'createdAt'> | string => {
    if (!f.partyId) return 'اختار الزبون (أو ضيف زبون جديد)';
    try {
      const out: SolarLine[] = lines
        .filter((l) => l.name.trim())
        .map((l) => {
          const serials = l.serials.split(/[،,\n]/).map((x) => x.trim()).filter(Boolean);
          const w = Math.round(num(l.warranty));
          return { id: l.id, part: l.part, ...(l.itemId && l.part !== 'labor' ? { itemId: l.itemId } : {}), name: l.name.trim(), qty: num(l.qty), price: parseAmount(state, l.price, f.currency), ...(w > 0 ? { warrantyMonths: w } : {}), ...(serials.length ? { serials } : {}) };
        });
      const discount = parseAmount(state, f.discount, f.currency);
      return {
        id,
        partyId: f.partyId,
        date: f.date,
        ...(f.title.trim() ? { title: f.title.trim() } : {}),
        ...(f.address.trim() ? { address: f.address.trim() } : {}),
        status: project?.invoiceId ? project.status : f.status,
        ...(f.installDate ? { installDate: f.installDate } : {}),
        currency: f.currency,
        loads: loadsOut,
        design,
        lines: out,
        ...(discount ? { discount } : {}),
        ...(visits.length ? { visits } : {}),
        ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
      };
    } catch (e) {
      return (e as Error).message;
    }
  };
  const preview = build();
  const totals = typeof preview === 'string' ? null : solarTotals(preview);
  const deposits = project ? solarDeposits(state, project) : 0;
  const cost = useMemo(() => {
    if (typeof preview === 'string') return 0;
    return preview.lines.reduce((s, l) => {
      const st = l.itemId ? state.stock[l.itemId] : undefined;
      return s + (st && st.totalQty > 0 ? Math.round((st.value / st.totalQty) * l.qty) : 0);
    }, 0);
  }, [preview, state.stock]);
  const phone = f.partyId ? state.parties[f.partyId]?.phone : undefined;

  const save = async (quiet = false): Promise<SolarProject | null> => {
    const d = build();
    if (typeof d === 'string') {
      notify(d, 'error');
      return null;
    }
    const res = await call<SolarProject>('saveSolarProject', d);
    if (!res) return null;
    if (!quiet) {
      notify(`انحفظت المنظومة رقم ${res.value.number}`);
      onClose();
    }
    return res.value;
  };
  const sendQuote = async () => {
    const saved = await save(true);
    if (!saved || !phone) return;
    const text = solarQuoteText(state, saved, (m) => money(state, m, saved.currency));
    try {
      await api.whatsapp(phone, text);
    } catch (e) {
      await navigator.clipboard.writeText(text).catch(() => undefined);
      notify(`${(e as Error).message}. نسخت العرض، الصقه بالواتساب`, 'error');
    }
  };

  return (
    <Modal title={project ? `منظومة رقم ${project.number}` : 'منظومة جديدة'} onClose={onClose} width={1120}>
      <div className="form-grid">
        <Field label="الزبون">
          <div className="with-button">
            <Picker options={partyOptions(state, 'customer')} value={f.partyId || null} onChange={(v) => set('partyId', v ?? '')} placeholder="اختار الزبون..." />
            {can('parties.manage') && !locked && (
              <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
        </Field>
        <Field label="اسم المنظومة (اختياري)">
          <input placeholder="بيت أبو علي — 3.6 كيلو" value={f.title} onChange={(e) => set('title', e.target.value)} disabled={locked} />
        </Field>
        <Field label="العنوان">
          <input placeholder="الحي، الشارع، علامة مميزة" value={f.address} onChange={(e) => set('address', e.target.value)} disabled={locked} />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} disabled={locked} />
        </Field>
        <Field label="الحالة">
          <select value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value as SolarStatus, ...(e.target.value === 'installed' && !x.installDate ? { installDate: today() } : {}) }))} disabled={locked}>
            {(locked ? [f.status] : EDIT_STATUS).map((s) => (
              <option key={s} value={s}>
                {SOLAR_STATUS_NAMES[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="تاريخ التركيب (بداية الكفالة)">
          <input type="date" value={f.installDate} onChange={(e) => set('installDate', e.target.value)} disabled={locked} />
        </Field>

        <h3 className="wide form-section">حاسبة الأحمال</h3>
        {!locked && (
          <div className="wide preset-row">
            {SOLAR_APPLIANCES.map((a) => (
              <button key={a.name} type="button" className="small" onClick={() => setLoads((ls) => [...ls, loadToForm({ ...a, id: uid() })])}>
                + {a.name}
              </button>
            ))}
            <button type="button" className="small" onClick={() => setLoads((ls) => [...ls, { id: uid(), name: '', watts: '', qty: '1', dayHours: '', nightHours: '' }])}>
              + جهاز تاني
            </button>
          </div>
        )}
        <div className="wide">
          {loads.length === 0 ? (
            <p className="muted">ضيف أجهزة البيت (براد، ليدات، مكيف...) وبيطلعلك حجم المنظومة المناسبة.</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>الجهاز</th>
                  <th>الاستطاعة (واط)</th>
                  <th>العدد</th>
                  <th>ساعات بالنهار</th>
                  <th>ساعات بالليل</th>
                  <th className="num">باليوم</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loads.map((l, i) => (
                  <tr key={l.id}>
                    <td>
                      <input value={l.name} placeholder="اسم الجهاز" onChange={(e) => setLoad(i, { name: e.target.value })} disabled={locked} />
                    </td>
                    <td>
                      <input className="num-input" inputMode="decimal" value={l.watts} onChange={(e) => setLoad(i, { watts: e.target.value })} disabled={locked} />
                    </td>
                    <td>
                      <input className="num-input" inputMode="numeric" value={l.qty} onChange={(e) => setLoad(i, { qty: e.target.value })} disabled={locked} />
                    </td>
                    <td>
                      <input className="num-input" inputMode="decimal" value={l.dayHours} onChange={(e) => setLoad(i, { dayHours: e.target.value })} disabled={locked} />
                    </td>
                    <td>
                      <input className="num-input" inputMode="decimal" value={l.nightHours} onChange={(e) => setLoad(i, { nightHours: e.target.value })} disabled={locked} />
                    </td>
                    <td className="num muted">{kwh(num(l.watts) * (num(l.qty) || 1) * (num(l.dayHours) + num(l.nightHours)))}</td>
                    <td>
                      {!locked && (
                        <button type="button" className="icon" title="حذف" onClick={() => setLoads((ls) => ls.filter((_, j) => j !== i))}>
                          <Icon name="close" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Field label="ساعات الشمس باليوم">
          <input inputMode="decimal" value={f.sunHours} onChange={(e) => set('sunHours', e.target.value)} disabled={locked} />
        </Field>
        <Field label="استطاعة اللوح (واط)">
          <input inputMode="numeric" value={f.panelWatts} onChange={(e) => set('panelWatts', e.target.value)} disabled={locked} />
        </Field>
        <Field label="سعة البطارية الوحدة (ك.و.س)">
          <input inputMode="decimal" value={f.batteryKwh} onChange={(e) => set('batteryKwh', e.target.value)} disabled={locked} />
        </Field>
        {calc.totalWh > 0 && (
          <div className="wide solar-calc">
            <div>
              <span>أعلى حمل</span>
              <b>{qtyText(calc.peakW)} واط</b>
            </div>
            <div>
              <span>الاستهلاك باليوم</span>
              <b>{kwh(calc.totalWh)}</b>
              <small>منها بالليل {kwh(calc.nightWh)}</small>
            </div>
            <div className="sug">
              <span>انفرتر</span>
              <b>{qtyText(calc.inverterKw)} كيلو</b>
            </div>
            <div className="sug">
              <span>ألواح</span>
              <b>{calc.panels} لوح</b>
              <small>{qtyText(calc.arrayKw)} كيلو واط</small>
            </div>
            <div className="sug">
              <span>بطاريات</span>
              <b>{calc.batteries}</b>
              <small>تخزين {qtyText(calc.storageKwh)} ك.و.س</small>
            </div>
            {!locked && (
              <button type="button" className="primary" onClick={applyDesign}>
                <Icon name="sparkles" size={16} /> عبّي المنظومة من الحساب
              </button>
            )}
          </div>
        )}

        <h3 className="wide form-section">المواد والأجور</h3>
        {!locked && (
          <div className="wide preset-row">
            {PARTS.map((p) => (
              <button key={p} type="button" className="small" onClick={() => setLines((ls) => [...ls, newLine(p, p === 'labor' ? null : suggestItem(p, p === 'panel' ? design.panelWatts : p === 'battery' ? design.batteryKwh : calc.inverterKw))])}>
                + {SOLAR_PART_NAMES[p]}
              </button>
            ))}
          </div>
        )}
        <div className="wide">
          {lines.length === 0 ? (
            <p className="muted">ضيف الألواح والانفرتر والبطاريات من المخزون، والحوامل والكبلات، وأجور التركيب. أو اكبس «عبّي المنظومة من الحساب».</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>المادة</th>
                  <th>العدد</th>
                  <th>السعر</th>
                  <th>الكفالة (شهر)</th>
                  <th>الأرقام التسلسلية</th>
                  <th className="num">المجموع</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  let amount = 0;
                  try {
                    amount = solarLineAmount({ qty: num(l.qty), price: parseAmount(state, l.price, f.currency) });
                  } catch {
                    amount = 0;
                  }
                  const have = l.itemId ? state.stock[l.itemId]?.totalQty : undefined;
                  return (
                    <tr key={l.id}>
                      <td>
                        <select value={l.part} onChange={(e) => setLine(i, { part: e.target.value as SolarPart })} disabled={locked}>
                          {PARTS.map((p) => (
                            <option key={p} value={p}>
                              {SOLAR_PART_NAMES[p]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="material-cell">
                        {l.part === 'labor' ? (
                          <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} disabled={locked} />
                        ) : (
                          <>
                            <Picker options={goods} value={l.itemId} onChange={(v) => setLine(i, { itemId: v, name: v ? state.items[v]!.name : l.name, price: v ? priceOf(v, f.currency) : l.price })} placeholder="اختار من المخزون..." />
                            {have !== undefined && <small className={have < num(l.qty) ? 'bad' : 'muted'}>بالمخزون: {qtyText(have)}</small>}
                          </>
                        )}
                      </td>
                      <td>
                        <input className="num-input" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} disabled={locked} />
                      </td>
                      <td>
                        <input className="num-input" inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} disabled={locked} />
                      </td>
                      <td>
                        {l.part !== 'labor' && <input className="num-input" inputMode="numeric" value={l.warranty} onChange={(e) => setLine(i, { warranty: e.target.value })} />}
                      </td>
                      <td>
                        {l.part !== 'labor' && <input dir="ltr" placeholder="SN1، SN2" value={l.serials} onChange={(e) => setLine(i, { serials: e.target.value })} />}
                      </td>
                      <td className="num">{money(state, amount, f.currency)}</td>
                      <td>
                        {!locked && (
                          <button type="button" className="icon" title="حذف" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                            <Icon name="close" size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => set('currency', c)} />
        </Field>
        <Field label="خصم">
          <input inputMode="decimal" value={f.discount} onChange={(e) => set('discount', e.target.value)} disabled={locked} />
        </Field>
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={(e) => set('notes', e.target.value)} disabled={locked} />
        </Field>

        {(f.status === 'installed' || locked) && (
          <>
            <h3 className="wide form-section">زيارات الصيانة</h3>
            <div className="wide">
              {visits.map((v, i) => (
                <div key={i} className="with-button" style={{ marginBottom: 6 }}>
                  <span className="muted" style={{ minWidth: 110 }}>{dateText(v.date)}</span>
                  <span style={{ flex: 1 }}>{v.note}</span>
                  {!locked && (
                    <button type="button" className="icon" title="حذف" onClick={() => setVisits(visits.filter((_, j) => j !== i))}>
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
              ))}
              {!locked && (
                <div className="with-button">
                  <input type="date" style={{ maxWidth: 180 }} value={visit.date} onChange={(e) => setVisit({ ...visit, date: e.target.value })} />
                  <input placeholder="شو انعمل: تنظيف ألواح، فحص بطاريات..." value={visit.note} onChange={(e) => setVisit({ ...visit, note: e.target.value })} />
                  <button type="button" className="small" disabled={!visit.note.trim()} onClick={() => { setVisits([...visits, { date: visit.date, note: visit.note.trim() }]); setVisit({ date: today(), note: '' }); }}>
                    + زيارة
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {totals && (
          <div className="kv wide">
            {PARTS.filter((p) => totals.byPart[p]).map((p) => (
              <span key={p} style={{ display: 'contents' }}>
                <span>{SOLAR_PART_NAMES[p]}</span>
                <strong>{money(state, totals.byPart[p], f.currency)}</strong>
              </span>
            ))}
            {totals.discount > 0 && (
              <>
                <span>الخصم</span>
                <strong>{money(state, totals.discount, f.currency)}</strong>
              </>
            )}
            <span>قيمة المنظومة</span>
            <strong>{money(state, totals.total, f.currency)}</strong>
            {deposits > 0 && (
              <>
                <span>العربون المقبوض</span>
                <strong className="good">{money(state, deposits, f.currency)}</strong>
                <span>الباقي</span>
                <strong className="bad">{money(state, Math.max(0, totals.total - deposits), f.currency)}</strong>
              </>
            )}
            {cost > 0 && can('costs.view') && f.currency === base && (
              <>
                <span>تكلفة المواد</span>
                <strong>{money(state, cost)}</strong>
                <span>الربح التقريبي</span>
                <strong className="good">{money(state, totals.total - cost)}</strong>
              </>
            )}
          </div>
        )}

        {typeof preview !== 'string' && project && (
          <div className="print-area">
            <div className="print-only">
              <QuoteDoc project={{ ...project, ...preview }} />
            </div>
          </div>
        )}

        <div className="form-actions wide">
          {phone && typeof preview !== 'string' && preview.lines.length > 0 && (
            <button type="button" className="whatsapp" onClick={() => void sendQuote()}>
              <Icon name="message" size={16} /> عرض السعر بالواتساب
            </button>
          )}
          {project && <PrintButtons kind="report" name={`عرض سعر منظومة ${project.number}`} papers={['a4']} />}
          {project?.invoiceId ? (
            <button type="button" className="primary" onClick={() => navigate('invoice', project.invoiceId)}>
              عرض الفاتورة
            </button>
          ) : (
            <>
              {can('vouchers.create') && f.status !== 'cancelled' && (
                <button type="button" className="push-start" onClick={() => setDepositing(true)}>
                  <Icon name="wallet" size={16} /> قبض عربون
                </button>
              )}
              {can('sales.create') && f.status !== 'cancelled' && (
                <button type="button" onClick={() => setInvoicing(true)}>
                  <Icon name="receipt" size={16} /> فاتورة المنظومة
                </button>
              )}
              <button type="button" onClick={onClose}>
                إلغاء
              </button>
              {can('solar.manage') && (
                <button type="button" className="primary" onClick={() => void save()}>
                  حفظ المنظومة
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {newParty && <PartyForm party={null} defaultKind="customer" onClose={() => setNewParty(false)} onSaved={(p) => set('partyId', p.id)} />}
      {depositing && totals && (
        <DepositDialog
          title="قبض عربون المنظومة"
          hint="بيتسجّل سند قبض باسم الزبون، وبينخصم من الفاتورة. وعرض السعر بيصير «موافق»."
          currency={f.currency}
          suggested={Math.max(0, Math.round(totals.total / 2) - deposits)}
          onClose={() => setDepositing(false)}
          onConfirm={async (amount, cashAccountId) => {
            const saved = await save(true);
            if (!saved) return;
            if (await call('addSolarDeposit', saved.id, { date: today(), amount, cashAccountId })) {
              notify('تم قبض العربون');
              if (saved.status === 'quote') set('status', 'accepted');
              setDepositing(false);
            }
          }}
        />
      )}
      {invoicing && totals && (
        <DeliverDialog
          title="فاتورة المنظومة"
          totalLabel="قيمة المنظومة"
          depositsLabel="العربون المقبوض"
          submitLabel="إصدار الفاتورة"
          subtotal={totals.total}
          deposits={deposits}
          currency={f.currency}
          onClose={() => setInvoicing(false)}
          onConfirm={async (opts) => {
            const saved = await save(true);
            if (!saved) return;
            const res = await call<Invoice>('invoiceSolarProject', saved.id, { date: today(), ...opts });
            if (res) {
              notify(`انعملت الفاتورة رقم ${res.value.number}، والمواد انصرفت من المخزون`);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </Modal>
  );
}

/** عرض السعر المطبوع: الحاسبة باختصار، والمواد بكفالاتها، والإجمالي. */
function QuoteDoc({ project: p }: { project: SolarProject }) {
  const { state } = useCompany();
  const t = solarTotals(p);
  const d = solarDesign(p.loads, p.design ?? DEFAULT_DESIGN);
  const party = state.parties[p.partyId];
  return (
    <div className="doc">
      <DocHeader title={`عرض سعر منظومة طاقة شمسية رقم ${p.number}`}>
        <div>
          {party?.name}
          {party?.phone ? ` · ${party.phone}` : ''}
        </div>
        <div>
          {dateText(p.date)}
          {p.address ? ` · ${p.address}` : ''}
        </div>
      </DocHeader>
      {d.totalWh > 0 && (
        <p>
          الاستهلاك اليومي {kwh(d.totalWh)} (بالليل {kwh(d.nightWh)})، أعلى حمل {qtyText(d.peakW)} واط ← انفرتر {qtyText(d.inverterKw)} كيلو، {d.panels} لوح، {d.batteries} بطارية.
        </p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>البيان</th>
            <th className="num">العدد</th>
            <th className="num">السعر</th>
            <th>الكفالة</th>
            <th className="num">المجموع</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td>{l.name}</td>
              <td className="num">{qtyText(l.qty)}</td>
              <td className="num">{money(state, l.price, p.currency)}</td>
              <td>{l.warrantyMonths ? (l.warrantyMonths % 12 === 0 ? `${l.warrantyMonths / 12} سنة` : `${l.warrantyMonths} شهر`) : '—'}</td>
              <td className="num">{money(state, solarLineAmount(l), p.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {t.discount > 0 && (
            <tr>
              <th colSpan={5}>الخصم</th>
              <th className="num">{money(state, t.discount, p.currency)}</th>
            </tr>
          )}
          <tr>
            <th colSpan={5}>الإجمالي</th>
            <th className="num">{money(state, t.total, p.currency)}</th>
          </tr>
        </tfoot>
      </table>
      {p.notes && <p>{p.notes}</p>}
    </div>
  );
}
