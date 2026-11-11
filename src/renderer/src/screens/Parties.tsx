import { Fragment, useMemo, useState } from 'react';
import { PRICE_TIER_NAMES, PRICE_TIERS, type PriceTier, lineAmount, partyBalance, partyStatement, siteJobRooms, siteJobTotals, type Invoice, type Party } from '../../../core';
import { major, money, parseAmount, qtyText, toInput, today, uid, useCompany, dateText } from '../api';
import { ExportButtons, PrintButtons, DocHeader } from '../components/print';
import { Icon } from '../components/icons';
import { askConfirm, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { MeasurementsEditor, TAILOR_STATUS } from './Tailor';
import { meters, SITE_JOB_STATUS } from './SiteJobs';

const KIND_NAMES: Record<Party['kind'], string> = { customer: 'عميل', supplier: 'مورد', both: 'عميل ومورد' };

export function Parties({ focus }: { focus?: string }) {
  const { state, can, feature } = useCompany();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'customer' | 'supplier'>('all');
  const [tier, setTier] = useState<PriceTier | 'all'>('all');
  const [editing, setEditing] = useState<Party | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(focus ?? null);

  const rows = useMemo(
    () =>
      Object.values(state.parties)
        .filter((p) => !p.archived && (kind === 'all' || p.kind === kind || p.kind === 'both') && (tier === 'all' || (p.priceTier ?? 'retail') === tier) && matches(query, p.name, p.phone))
        .map((p) => ({ party: p, balance: partyBalance(state, p.id) }))
        .sort((a, b) => a.party.name.localeCompare(b.party.name, 'ar')),
    [state, query, kind, tier],
  );

  return (
    <div className="page">
      <PageHeader title="العملاء والموردون">
        {can('parties.manage') && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> إضافة
          </button>
        )}
        <ExportButtons
          name="العملاء والموردون"
          sheets={() => [
            {
              name: 'الأرصدة',
              columns: [
                { header: 'الاسم', key: 'name' },
                { header: 'النوع', key: 'kind' },
                { header: 'الهاتف', key: 'phone' },
                { header: 'الرصيد (موجب = عليه)', key: 'balance', type: 'money' },
              ],
              rows: rows.map((r) => ({ name: r.party.name, kind: KIND_NAMES[r.party.kind], phone: r.party.phone, balance: major(state, r.balance.base) })),
            },
          ]}
        />
      </PageHeader>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الهاتف..." />
        <div className="segmented">
          {(['all', 'customer', 'supplier'] as const).map((k) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {k === 'all' ? 'الكل' : k === 'customer' ? 'العملاء' : 'الموردون'}
            </button>
          ))}
        </div>
        {feature('priceTiers') && kind !== 'supplier' && (
          <select value={tier} onChange={(e) => setTier(e.target.value as typeof tier)} aria-label="نوع الزبون">
            <option value="all">كل أنواع الزباين</option>
            {PRICE_TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="split">
        <div>
          {rows.length === 0 ? (
            <Empty>لا يوجد</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>النوع</th>
                  <th>الهاتف</th>
                  <th className="num">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ party, balance }) => (
                  <tr key={party.id} className={`clickable ${selected === party.id ? 'selected' : ''}`} onClick={() => setSelected(party.id)}>
                    <td>
                      {party.name}
                      {party.priceTier && party.priceTier !== 'retail' && <small className="tier-chip">{PRICE_TIER_NAMES[party.priceTier]}</small>}
                    </td>
                    <td>{KIND_NAMES[party.kind]}</td>
                    <td dir="ltr" className="mono">
                      {party.phone}
                    </td>
                    <td className="num">
                      <BalanceText value={balance.base} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selected && state.parties[selected] && (
          <PartyPanel party={state.parties[selected]} onEdit={() => setEditing(state.parties[selected]!)} />
        )}
      </div>
      {editing && <PartyForm party={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(p) => setSelected(p.id)} />}
    </div>
  );
}

export function BalanceText({ value, currency }: { value: number; currency?: string }) {
  const { state } = useCompany();
  if (value === 0) return <span className="muted">0</span>;
  return (
    <span className={value > 0 ? 'debit' : 'credit'}>
      {money(state, Math.abs(value), currency)} {value > 0 ? 'عليه' : 'له'}
    </span>
  );
}

export function PartyPanel({ party, onEdit }: { party: Party; onEdit?: () => void }) {
  const { state, navigate, feature, can, notify } = useCompany();
  const [currency, setCurrency] = useState<string>('');
  const [details, setDetails] = useState(false);
  const jobs = feature('sitejobs') ? Object.values(state.siteJobs).filter((j) => j.partyId === party.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const orders = feature('tailoring') ? Object.values(state.tailorOrders).filter((o) => o.partyId === party.id).sort((a, b) => b.number - a.number) : [];
  const measures = Object.entries(party.measurements ?? {});
  const balance = partyBalance(state, party.id);
  const st = partyStatement(state, party.id, {}, currency || undefined);
  const vehicles = Object.values(state.vehicles).filter((v) => v.partyId === party.id);
  const currencies = Object.keys(balance.byCurrency);

  return (
    <aside className="card panel">
      <header className="panel-header">
        <h3>{party.name}</h3>
        <span className="button-row">
          <PrintButtons kind="report" name={`كشف حساب ${party.name}`} papers={['a4', '80mm']} />
          {balance.base > 0 && (
            <button
              title="رسالة تذكير بالدين جاهزة للإرسال"
              onClick={() => {
                const parts = Object.entries(balance.byCurrency).filter(([, v]) => v > 0).map(([c, v]) => money(state, v, c));
                const text = `مرحباً ${party.name}،\nنذكّركم بأن الرصيد المستحق لدى ${state.info!.name} هو: ${parts.join(' + ')}.\nشكراً لتعاملكم معنا.`;
                void navigator.clipboard.writeText(text).then(() => notify('تم نسخ رسالة التذكير، الصقها في واتساب'));
              }}
            >
              تذكير بالدين
            </button>
          )}
          {can('parties.manage') && onEdit && <button onClick={onEdit}>تعديل</button>}
        </span>
      </header>
      <div className="kv">
        <span>الهاتف</span>
        <strong dir="ltr">{party.phone || '—'}</strong>
        <span>العنوان</span>
        <strong>{party.address || '—'}</strong>
        {Object.entries(balance.byCurrency).map(([c, v]) => (
          <span key={c} style={{ display: 'contents' }}>
            <span>الرصيد بـ{state.currencies[c]?.nameAr}</span>
            <strong>
              <BalanceText value={v} currency={c} />
            </strong>
          </span>
        ))}
      </div>
      {vehicles.length > 0 && (
        <>
          <h4>السيارات</h4>
          <ul className="chips">
            {vehicles.map((v) => (
              <li key={v.id}>
                {v.make} {v.model} {v.year} — {v.plate}
              </li>
            ))}
          </ul>
        </>
      )}
      {feature('sitejobs') && (
        <>
          <h4 className="row-title">
            <span>
              <Icon name="roller" size={16} /> المشاريع ({jobs.length})
            </span>
            <button onClick={() => navigate('sitejob')}>كشف جديد</button>
          </h4>
          {jobs.length === 0 ? (
            <p className="muted">ما اشتغلنالو شي لسا.</p>
          ) : (
            <table className="table compact">
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="clickable" onClick={() => navigate('sitejob', j.id)}>
                    <td>{dateText(j.date)}</td>
                    <td>
                      {j.title || `مشروع ${j.number}`}
                      <div className="muted">{siteJobRooms(j).map((r) => `${r.room} ${meters(r.meters)} م`).join(' · ')}</div>
                    </td>
                    <td className="num">{meters(siteJobTotals(j).meters)} م</td>
                    <td className="num">{money(state, siteJobTotals(j).total, j.currency)}</td>
                    <td>{SITE_JOB_STATUS[j.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {feature('tailoring') && (
        <>
          <h4 className="row-title">
            <span>
              <Icon name="ruler" size={16} /> القياسات
            </span>
            <button onClick={() => navigate('tailor-order')}>طلب تفصيل جديد</button>
          </h4>
          {measures.length === 0 ? (
            <p className="muted">لا توجد قياسات محفوظة. أضفها من زر تعديل.</p>
          ) : (
            <div className="doc-measures">
              {measures.map(([k, v]) => (
                <span key={k}>
                  {k}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          )}
          {orders.length > 0 && (
            <ul className="chips">
              {orders.slice(0, 8).map((o) => (
                <li key={o.id} className="clickable" onClick={() => navigate('tailor-order', o.id)}>
                  طلب {o.number} · {TAILOR_STATUS[o.status]}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="panel-actions">
        <h4>كشف الحساب</h4>
        <label className="check">
          <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> مع تفاصيل المواد
        </label>
        {currencies.length > 1 && (
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">بالعملة الأساسية</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                بـ{state.currencies[c]?.nameAr} فقط
              </option>
            ))}
          </select>
        )}
      </div>
      {st.rows.length === 0 ? (
        <p className="muted">لا توجد حركات</p>
      ) : (
        <div className="print-area">
        <div className="print-only">
          <DocHeader title="كشف حساب">
            <div>{party.name}</div>
          </DocHeader>
        </div>
        <table className="table compact">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>البيان</th>
              <th className="num">مدين</th>
              <th className="num">دائن</th>
              <th className="num">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {st.rows.map((r) => {
              const inv = state.invoices.find((i) => i.entryId === r.entryId);
              return (
                <Fragment key={r.entryId}>
                  <tr className={inv ? 'clickable' : ''} onClick={() => inv && navigate('invoice', inv.id)}>
                    <td>{dateText(r.date)}</td>
                    <td>{r.memo}</td>
                    <td className="num">{r.debit ? money(state, r.debit, currency || undefined) : ''}</td>
                    <td className="num">{r.credit ? money(state, r.credit, currency || undefined) : ''}</td>
                    <td className="num">{money(state, r.running, currency || undefined)}</td>
                  </tr>
                  {details && inv && (
                    <tr className="st-lines">
                      <td />
                      <td colSpan={4}>
                        <ul>
                          {inv.lines.map((l, i) => (
                            <li key={i}>
                              <span>{l.description}</span>
                              <span className="num">
                                {qtyText(l.qty)} {l.unit ?? (l.itemId ? state.items[l.itemId]?.unit : '') ?? ''} × {money(state, l.price, inv.currency)} = <b>{money(state, lineAmount(l), inv.currency)}</b>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {details && <ItemsSummary partyId={party.id} />}
        </div>
      )}
    </aside>
  );
}

export function PartyForm({
  party,
  onClose,
  onSaved,
  defaultKind = 'customer',
}: {
  party: Party | null;
  onClose: () => void;
  onSaved?: (p: Party) => void;
  defaultKind?: Party['kind'];
}) {
  const { state, call, notify, feature } = useCompany();
  const base = state.info!.baseCurrency;
  const [f, setF] = useState({
    name: party?.name ?? '',
    kind: party?.kind ?? defaultKind,
    phone: party?.phone ?? '',
    address: party?.address ?? '',
    notes: party?.notes ?? '',
    priceTier: party?.priceTier ?? 'retail',
    listDiscount: party?.listDiscount !== undefined ? String(party.listDiscount) : '',
    creditLimit: party?.creditLimit ? toInput(state, party.creditLimit, base) : '',
    marketerRate: party?.marketerRate ? String(party.marketerRate) : '',
  });
  const [measurements, setMeasurements] = useState<Record<string, string>>(party?.measurements ?? {});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={party ? 'تعديل' : 'إضافة عميل / مورد'} onClose={onClose} {...(feature('tailoring') ? { width: 760 } : {})}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          let creditLimit = 0;
          try {
            creditLimit = parseAmount(state, f.creditLimit, base);
          } catch (err) {
            return notify((err as Error).message, 'error');
          }
          const data: Party = {
            id: party?.id ?? uid(),
            name: f.name.trim(),
            kind: f.kind as Party['kind'],
            ...(f.priceTier !== 'retail' ? { priceTier: f.priceTier as Party['priceTier'] } : {}),
            ...(creditLimit > 0 ? { creditLimit } : {}),
            ...(Number(f.marketerRate) > 0 ? { marketerRate: Math.min(100, Number(f.marketerRate)) } : {}),
            ...(feature('listPricing') && f.listDiscount.trim() !== '' && Number.isFinite(Number(f.listDiscount)) ? { listDiscount: Number(f.listDiscount) } : {}),
            ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
            ...(f.address.trim() ? { address: f.address.trim() } : {}),
            ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
            ...(Object.keys(measurements).length ? { measurements } : {}),
          };
          // نفس الاسم موجود؟ (بيصير الحساب على اسمين وما بيبين صح)
          const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
          const twin = !party && Object.values(state.parties).find((x) => !x.archived && norm(x.name) === norm(data.name));
          if (twin && !(await askConfirm(`«${twin.name}» مسجّل قبل. الأفضل تستعمل الموجود حتى يضل حسابه بمكان واحد. بدك تضيف واحد تاني بنفس الاسم؟`))) return;
          if (await call('saveParty', data)) {
            notify('تم الحفظ');
            onSaved?.(data);
            onClose();
          }
        }}
      >
        <Field label="الاسم" wide>
          <input value={f.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="النوع">
          <select value={f.kind} onChange={set('kind')}>
            {Object.entries(KIND_NAMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الهاتف">
          <input value={f.phone} onChange={set('phone')} dir="ltr" />
        </Field>
        <Field label="العنوان" wide>
          <input value={f.address} onChange={set('address')} />
        </Field>
        {feature('priceTiers') && f.kind !== 'supplier' && (
          <Field label="نوع الزبون (بياخد أسعار نوعه لحالها)" wide>
            <div className="tier-pick">
              {PRICE_TIERS.map((t) => (
                <button type="button" key={t.id} className={f.priceTier === t.id ? 'active' : ''} onClick={() => setF({ ...f, priceTier: t.id })}>
                  {feature('listPricing') && t.id === 'retail' ? 'زبون عادي' : feature('listPricing') && t.id === 'wholesale' ? 'معلم' : t.short}
                </button>
              ))}
              {(party?.priceTier === 'special' || f.priceTier === 'special') && (
                <button type="button" className={f.priceTier === 'special' ? 'active' : ''} onClick={() => setF({ ...f, priceTier: 'special' })}>
                  سعر خاص
                </button>
              )}
            </div>
          </Field>
        )}
        {feature('listPricing') && f.kind !== 'supplier' && (
          <Field label="حسم خاص من النشرة % (فارغ = حسب الشريحة)">
            <input value={f.listDiscount} onChange={set('listDiscount')} inputMode="decimal" placeholder="مثلاً 12" />
          </Field>
        )}
        {f.kind !== 'supplier' && (
          <Field label={`حد الدين المسموح (${state.currencies[base]?.symbol}) — فارغ = بلا حد`}>
            <input value={f.creditLimit} onChange={set('creditLimit')} inputMode="decimal" />
          </Field>
        )}
        <Field label="مسوّق بيجيب زباين؟ نسبته % من ربح الفاتورة (فاضي = لأ)">
          <input value={f.marketerRate} onChange={(e) => setF({ ...f, marketerRate: e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="مثلاً 15" />
        </Field>
        <Field label="ملاحظات" wide>
          <textarea value={f.notes} onChange={set('notes')} rows={2} />
        </Field>
        {feature('tailoring') && f.kind !== 'supplier' && (
          <div className="wide">
            <h4>القياسات (سم)</h4>
            <MeasurementsEditor value={measurements} onChange={setMeasurements} />
          </div>
        )}
        {party && <MergeParty party={party} onDone={onClose} />}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
    </Modal>
  );
}

/** الاسم مكرر؟ دمجه بالاسم التاني: الرصيد بينتقل والمكرر بينحذف. */
function MergeParty({ party, onDone }: { party: Party; onDone: () => void }) {
  const { state, call, notify } = useCompany();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const options = partyOptions(state).filter((o) => o.id !== party.id);
  if (!open)
    return (
      <div className="wide">
        <button type="button" className="ghost small" onClick={() => setOpen(true)}>
          دمج مع شخص تاني (اسم مكرر)
        </button>
      </div>
    );
  return (
    <div className="wide card" style={{ padding: 12 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        اختار الاسم الصح. رصيد «{party.name}» ({money(state, partyBalance(state, party.id).base)}) بينتقل إله، و«{party.name}» بينحذف. الفواتير القديمة بتضل متل ما هي.
      </p>
      <div className="with-button">
        <Picker options={options} value={target} onChange={setTarget} placeholder="ادمج مع..." />
        <button
          type="button"
          className="primary"
          disabled={!target}
          onClick={async () => {
            if (!target) return;
            const to = state.parties[target]!;
            if (!(await askConfirm(`تدمج «${party.name}» مع «${to.name}»؟ رصيده بينتقل والاسم المكرر بينحذف.`))) return;
            if (await call('mergeParty', party.id, target, today())) {
              notify(`انضم حساب «${party.name}» لـ«${to.name}»`);
              onDone();
            }
          }}
        >
          دمج
        </button>
      </div>
    </div>
  );
}

/** ملخص المواد مع شخص: كل مادة كم أخد منّا (أو أخدنا منه) بالمجموع، صافي بعد المرتجعات. */
function ItemsSummary({ partyId }: { partyId: string }) {
  const { state } = useCompany();
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; sold: number; bought: number; amount: Record<string, number> }>();
    const sign: Record<Invoice['kind'], [number, number]> = { sale: [1, 0], sale_return: [-1, 0], purchase: [0, 1], purchase_return: [0, -1] };
    for (const inv of state.invoices) {
      if (inv.partyId !== partyId || inv.deleted || inv.voidEntryId) continue;
      const [s, b] = sign[inv.kind];
      for (const l of inv.lines) {
        const key = l.itemId ?? `d:${l.description}`;
        const item = l.itemId ? state.items[l.itemId] : undefined;
        const base = l.qty * (l.factor ?? 1);
        const r = map.get(key) ?? { name: item?.name ?? l.description, unit: item?.unit ?? l.unit ?? '', sold: 0, bought: 0, amount: {} };
        r.sold += s * base;
        r.bought += b * base;
        r.amount[inv.currency] = (r.amount[inv.currency] ?? 0) + (s + b) * lineAmount(l);
        map.set(key, r);
      }
    }
    return [...map.values()].filter((r) => r.sold || r.bought).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [state, partyId]);
  if (!rows.length) return null;
  const anySold = rows.some((r) => r.sold), anyBought = rows.some((r) => r.bought);
  return (
    <>
      <h4 style={{ marginTop: 14 }}>ملخص المواد</h4>
      <table className="table compact">
        <thead>
          <tr>
            <th>المادة</th>
            {anySold && <th className="num">أخد منّا</th>}
            {anyBought && <th className="num">أخدنا منه</th>}
            <th className="num">القيمة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              {anySold && <td className="num">{r.sold ? `${qtyText(Math.round(r.sold * 1000) / 1000)} ${r.unit}` : ''}</td>}
              {anyBought && <td className="num">{r.bought ? `${qtyText(Math.round(r.bought * 1000) / 1000)} ${r.unit}` : ''}</td>}
              <td className="num">{Object.entries(r.amount).filter(([, v]) => v).map(([c, v]) => money(state, v, c)).join(' + ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
