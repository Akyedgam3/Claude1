import { useMemo, useState } from 'react';
import { partyBalance, partyStatement, type Party } from '../../../core';
import { major, money, parseAmount, toInput, uid, useCompany, dateText } from '../api';
import { ExportButtons, PrintButtons, DocHeader } from '../components/print';
import { Icon } from '../components/icons';
import { Empty, Field, matches, Modal, PageHeader, SearchBox } from '../components/ui';
import { MeasurementsEditor, TAILOR_STATUS } from './Tailor';

const KIND_NAMES: Record<Party['kind'], string> = { customer: 'عميل', supplier: 'مورد', both: 'عميل ومورد' };

export function Parties({ focus }: { focus?: string }) {
  const { state, can } = useCompany();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'customer' | 'supplier'>('all');
  const [editing, setEditing] = useState<Party | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(focus ?? null);

  const rows = useMemo(
    () =>
      Object.values(state.parties)
        .filter((p) => !p.archived && (kind === 'all' || p.kind === kind || p.kind === 'both') && matches(query, p.name, p.phone))
        .map((p) => ({ party: p, balance: partyBalance(state, p.id) }))
        .sort((a, b) => a.party.name.localeCompare(b.party.name, 'ar')),
    [state, query, kind],
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
                    <td>{party.name}</td>
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

function PartyPanel({ party, onEdit }: { party: Party; onEdit: () => void }) {
  const { state, navigate, feature, can, notify } = useCompany();
  const [currency, setCurrency] = useState<string>('');
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
          {can('parties.manage') && <button onClick={onEdit}>تعديل</button>}
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
                <tr key={r.entryId} className={inv ? 'clickable' : ''} onClick={() => inv && navigate('invoice', inv.id)}>
                  <td>{dateText(r.date)}</td>
                  <td>{r.memo}</td>
                  <td className="num">{r.debit ? money(state, r.debit, currency || undefined) : ''}</td>
                  <td className="num">{r.credit ? money(state, r.credit, currency || undefined) : ''}</td>
                  <td className="num">{money(state, r.running, currency || undefined)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
    creditLimit: party?.creditLimit ? toInput(state, party.creditLimit, base) : '',
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
            ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
            ...(f.address.trim() ? { address: f.address.trim() } : {}),
            ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
            ...(Object.keys(measurements).length ? { measurements } : {}),
          };
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
          <Field label="شريحة السعر">
            <select value={f.priceTier} onChange={set('priceTier')}>
              <option value="retail">مفرق</option>
              <option value="wholesale">جملة</option>
              <option value="special">سعر خاص</option>
            </select>
          </Field>
        )}
        {f.kind !== 'supplier' && (
          <Field label={`حد الدين المسموح (${state.currencies[base]?.symbol}) — فارغ = بلا حد`}>
            <input value={f.creditLimit} onChange={set('creditLimit')} inputMode="decimal" />
          </Field>
        )}
        <Field label="ملاحظات" wide>
          <textarea value={f.notes} onChange={set('notes')} rows={2} />
        </Field>
        {feature('tailoring') && f.kind !== 'supplier' && (
          <div className="wide">
            <h4>القياسات (سم)</h4>
            <MeasurementsEditor value={measurements} onChange={setMeasurements} />
          </div>
        )}
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
