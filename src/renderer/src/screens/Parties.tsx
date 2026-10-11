import { useMemo, useState } from 'react';
import { partyBalance, partyStatement, type Party } from '../../../core';
import { money, uid, useCompany, dateText } from '../api';
import { Empty, Field, matches, Modal, PageHeader, SearchBox } from '../components/ui';

const KIND_NAMES: Record<Party['kind'], string> = { customer: 'عميل', supplier: 'مورد', both: 'عميل ومورد' };

export function Parties({ focus }: { focus?: string }) {
  const { state } = useCompany();
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
        <button className="primary" onClick={() => setEditing('new')}>
          + إضافة
        </button>
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
  const { state, navigate } = useCompany();
  const [currency, setCurrency] = useState<string>('');
  const balance = partyBalance(state, party.id);
  const st = partyStatement(state, party.id, {}, currency || undefined);
  const vehicles = Object.values(state.vehicles).filter((v) => v.partyId === party.id);
  const currencies = Object.keys(balance.byCurrency);

  return (
    <aside className="card panel">
      <header className="panel-header">
        <h3>{party.name}</h3>
        <button onClick={onEdit}>تعديل</button>
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
  const { call, notify } = useCompany();
  const [f, setF] = useState({
    name: party?.name ?? '',
    kind: party?.kind ?? defaultKind,
    phone: party?.phone ?? '',
    address: party?.address ?? '',
    notes: party?.notes ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={party ? 'تعديل' : 'إضافة عميل / مورد'} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const data: Party = {
            id: party?.id ?? uid(),
            name: f.name.trim(),
            kind: f.kind as Party['kind'],
            ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
            ...(f.address.trim() ? { address: f.address.trim() } : {}),
            ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
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
        <Field label="ملاحظات" wide>
          <textarea value={f.notes} onChange={set('notes')} rows={2} />
        </Field>
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
