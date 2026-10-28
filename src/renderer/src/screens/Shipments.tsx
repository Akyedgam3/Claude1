import { useMemo, useState } from 'react';
import { SHIPMENT_CHARGE_PRESETS, SHIPMENT_STATUS_NAMES, shipmentTotals, type Invoice, type Shipment, type ShipmentStatus } from '../../../core';
import { dateText, money, parseAmount, toInput, today, uid, useCompany } from '../api';
import { Icon } from '../components/icons';
import { CurrencySelect, Empty, Field, matches, Modal, PageHeader, partyOptions, Picker, SearchBox } from '../components/ui';
import { PartyForm } from './Parties';
import { DeliverDialog } from './Tailor';

const TONE: Record<ShipmentStatus, string> = { loading: 'open', transit: 'in_progress', customs: 'in_progress', arrived: 'done', delivered: 'done', invoiced: 'invoiced', cancelled: 'cancelled' };
const ACTIVE: ShipmentStatus[] = ['loading', 'transit', 'customs', 'arrived', 'delivered'];
const EDITABLE: ShipmentStatus[] = ['loading', 'transit', 'customs', 'arrived', 'delivered', 'cancelled'];

/** الشحنات (نقل وتخليص جمركي): كل سيارة بسائقها ورقمها ووجهتها وبضاعتها وأجورها، وبتنفوتر على صاحب البضاعة. */
export function Shipments() {
  const { state, can, call, notify, navigate } = useCompany();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'all' | ShipmentStatus>('active');
  const [editing, setEditing] = useState<Shipment | 'new' | null>(null);
  const [invoicing, setInvoicing] = useState<Shipment | null>(null);
  const all = useMemo(() => Object.values(state.shipments ?? {}), [state.shipments]);
  const rows = useMemo(
    () =>
      all
        .filter((s) => (status === 'active' ? ACTIVE.includes(s.status) : status === 'all' || s.status === status))
        .filter((s) => matches(query, s.number, state.parties[s.partyId]?.name, s.driver, s.driverPhone, s.plate, s.trailer, s.destination, s.origin, s.goods, s.declaration, s.container))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number),
    [all, status, query, state.parties],
  );
  const month = today().slice(0, 7);
  const stats = useMemo(() => {
    const m = all.filter((s) => s.date.slice(0, 7) === month && s.status !== 'cancelled');
    return {
      road: all.filter((s) => s.status === 'loading' || s.status === 'transit' || s.status === 'customs').length,
      toInvoice: all.filter((s) => s.status === 'arrived' || s.status === 'delivered').length,
      month: m.length,
    };
  }, [all, month]);
  const manage = can('shipments.manage');

  return (
    <div className="page">
      <PageHeader title="الشحنات والتخليص">
        {manage && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> شحنة جديدة
          </button>
        )}
      </PageHeader>
      <div className="stats">
        <div className="stat clickable" onClick={() => setStatus('transit')}>
          <span>بالطريق والجمرك</span>
          <strong>{stats.road}</strong>
        </div>
        <div className="stat clickable" onClick={() => setStatus('delivered')}>
          <span>وصلت وبانتظار الفاتورة</span>
          <strong className={stats.toInvoice ? 'good' : ''}>{stats.toInvoice}</strong>
        </div>
        <div className="stat">
          <span>شحنات هالشهر</span>
          <strong>{stats.month}</strong>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث باسم الزبون، السائق، رقم السيارة، الوجهة، البضاعة، رقم البيان..." />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">الشحنات المفتوحة</option>
          <option value="all">الكل</option>
          {Object.entries(SHIPMENT_STATUS_NAMES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>{query ? 'ما في شحنات بهالبحث.' : 'ما في شحنات بعد. اكبس «شحنة جديدة».'}</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>صاحب البضاعة</th>
              <th>السائق والسيارة</th>
              <th>الوجهة والبضاعة</th>
              <th>التاريخ</th>
              <th className="num">الأجور</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const t = shipmentTotals(s);
              return (
                <tr key={s.id} className={manage && !s.invoiceId ? 'clickable' : ''} onClick={() => (s.invoiceId ? navigate('invoice', s.invoiceId) : manage && setEditing(s))}>
                  <td className="mono">{s.number}</td>
                  <td>{state.parties[s.partyId]?.name}</td>
                  <td>
                    {s.driver}
                    <div className="muted mono">
                      {s.plate}
                      {s.plate && s.driverPhone ? ' · ' : ''}
                      {s.driverPhone && <span className="ltr">{s.driverPhone}</span>}
                    </div>
                  </td>
                  <td>
                    {[s.origin, s.destination].filter(Boolean).join(' ← ')}
                    <div className="muted">
                      {s.goods}
                      {s.refrigerated ? ' · مبرّد' : ''}
                    </div>
                  </td>
                  <td>{dateText(s.date)}</td>
                  <td className="num">{money(state, t.total, s.currency)}</td>
                  <td>
                    <span className={`status ${TONE[s.status]}`}>{SHIPMENT_STATUS_NAMES[s.status]}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {!s.invoiceId && s.status !== 'cancelled' && can('sales.create') && t.total > 0 && (
                      <button className="small primary" onClick={() => setInvoicing(s)}>
                        فوترة
                      </button>
                    )}
                    {s.invoiceId && (
                      <button className="small" onClick={() => navigate('invoice', s.invoiceId!)}>
                        الفاتورة
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && <ShipmentForm shipment={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {invoicing && (
        <DeliverDialog
          title={`فاتورة الشحنة رقم ${invoicing.number}`}
          totalLabel="أجور الشحنة"
          depositsLabel="مقبوض سلف"
          submitLabel="إصدار الفاتورة"
          subtotal={shipmentTotals(invoicing).total}
          deposits={0}
          currency={invoicing.currency}
          onClose={() => setInvoicing(null)}
          onConfirm={async (o) => {
            const res = await call<Invoice>('invoiceShipment', invoicing.id, { date: today(), paid: o.paid ?? shipmentTotals(invoicing).total, cashAccountId: o.cashAccountId });
            if (res) {
              notify(`تم إصدار الفاتورة رقم ${res.value.number}`);
              setInvoicing(null);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </div>
  );
}

type Money = { description: string; amount: string };

function ShipmentForm({ shipment, onClose }: { shipment: Shipment | null; onClose: () => void }) {
  const { state, call, notify, can } = useCompany();
  const base = state.info!.baseCurrency;
  const [f, setF] = useState({
    partyId: shipment?.partyId ?? '',
    date: shipment?.date ?? today(),
    status: shipment?.status ?? ('loading' as ShipmentStatus),
    driver: shipment?.driver ?? '',
    driverPhone: shipment?.driverPhone ?? '',
    plate: shipment?.plate ?? '',
    trailer: shipment?.trailer ?? '',
    origin: shipment?.origin ?? '',
    destination: shipment?.destination ?? '',
    border: shipment?.border ?? '',
    goods: shipment?.goods ?? '',
    packages: shipment?.packages ? String(shipment.packages) : '',
    weight: shipment?.weight ? String(shipment.weight) : '',
    container: shipment?.container ?? '',
    declaration: shipment?.declaration ?? '',
    refrigerated: shipment?.refrigerated ?? false,
    temperature: shipment?.temperature ?? '',
    currency: shipment?.currency ?? base,
    notes: shipment?.notes ?? '',
  });
  const cur = f.currency;
  const toRows = (list: { description: string; amount: number }[] | undefined): Money[] => (list ?? []).map((x) => ({ description: x.description, amount: toInput(state, x.amount, cur) }));
  const [charges, setCharges] = useState<Money[]>(shipment ? toRows(shipment.charges) : [{ description: 'أجار سيارة + تخليص', amount: '' }]);
  const [costs, setCosts] = useState<Money[]>(toRows(shipment?.costs));
  const [newParty, setNewParty] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const showCosts = can('costs.view');

  const sum = (rows: Money[]) => {
    try {
      return rows.reduce((s, r) => s + (r.amount.trim() ? parseAmount(state, r.amount, cur) : 0), 0);
    } catch {
      return 0;
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.partyId) return notify('اختار صاحب البضاعة (المطلوب منه)', 'error');
    let data: Shipment;
    try {
      const parse = (rows: Money[]) => rows.filter((r) => r.description.trim() || r.amount.trim()).map((r) => ({ description: r.description.trim(), amount: r.amount.trim() ? parseAmount(state, r.amount, cur) : 0 }));
      const opt = (k: 'driver' | 'driverPhone' | 'plate' | 'trailer' | 'origin' | 'destination' | 'border' | 'goods' | 'container' | 'declaration' | 'temperature' | 'notes') => (f[k].trim() ? { [k]: f[k].trim() } : {});
      data = {
        id: shipment?.id ?? uid(),
        number: shipment?.number ?? 0,
        partyId: f.partyId,
        date: f.date,
        status: f.status,
        currency: cur,
        charges: parse(charges),
        costs: parse(costs),
        ...(f.refrigerated ? { refrigerated: true } : {}),
        ...(Number(f.packages) > 0 ? { packages: Number(f.packages) } : {}),
        ...(Number(f.weight) > 0 ? { weight: Number(f.weight) } : {}),
        ...opt('driver'),
        ...opt('driverPhone'),
        ...opt('plate'),
        ...opt('trailer'),
        ...opt('origin'),
        ...opt('destination'),
        ...opt('border'),
        ...opt('goods'),
        ...opt('container'),
        ...opt('declaration'),
        ...(f.refrigerated ? opt('temperature') : {}),
        ...opt('notes'),
      };
    } catch (err) {
      return notify((err as Error).message, 'error');
    }
    if (await call('saveShipment', data)) {
      notify('تم حفظ الشحنة');
      onClose();
    }
  };

  const moneyRows = (rows: Money[], setRows: (r: Money[]) => void, presets: string[], addLabel: string) => (
    <div className="wide">
      {rows.map((r, i) => (
        <div key={i} className="with-button" style={{ marginBottom: 6 }}>
          <input list={presets.length ? 'ship-presets' : undefined} placeholder="البند" value={r.description} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <input className="num-input" style={{ maxWidth: 160 }} placeholder="المبلغ" inputMode="decimal" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <button type="button" className="icon" title="حذف" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="small" onClick={() => setRows([...rows, { description: '', amount: '' }])}>
        + {addLabel}
      </button>
    </div>
  );

  return (
    <Modal title={shipment ? `الشحنة رقم ${shipment.number}` : 'شحنة جديدة'} onClose={onClose} width={820}>
      <form className="form-grid" onSubmit={save}>
        <Field label="المطلوب من السيد (صاحب البضاعة)">
          <div className="with-button">
            <Picker options={partyOptions(state, 'customer')} value={f.partyId || null} onChange={(id) => set('partyId', id ?? '')} placeholder="اختار الزبون..." />
            {can('parties.manage') && (
              <button type="button" className="icon" title="زبون جديد" onClick={() => setNewParty(true)}>
                <Icon name="plus" size={16} />
              </button>
            )}
          </div>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="الحالة">
          <select value={f.status} onChange={(e) => set('status', e.target.value as ShipmentStatus)}>
            {EDITABLE.map((k) => (
              <option key={k} value={k}>
                {SHIPMENT_STATUS_NAMES[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="العملة">
          <CurrencySelect value={f.currency} onChange={(c) => set('currency', c)} />
        </Field>

        <h3 className="wide form-section">السائق والسيارة</h3>
        <Field label="اسم السائق">
          <input value={f.driver} onChange={(e) => set('driver', e.target.value)} />
        </Field>
        <Field label="رقم السائق">
          <input dir="ltr" inputMode="tel" placeholder="+963..." value={f.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} />
        </Field>
        <Field label="رقم السيارة">
          <input value={f.plate} onChange={(e) => set('plate', e.target.value)} />
        </Field>
        <Field label="رقم البراد / المقطورة">
          <input value={f.trailer} onChange={(e) => set('trailer', e.target.value)} />
        </Field>

        <h3 className="wide form-section">الطريق والبضاعة</h3>
        <Field label="التحميل من">
          <input value={f.origin} onChange={(e) => set('origin', e.target.value)} placeholder="دمشق" />
        </Field>
        <Field label="الوجهة">
          <input value={f.destination} onChange={(e) => set('destination', e.target.value)} placeholder="جدة" />
        </Field>
        <Field label="المعبر / المنفذ">
          <input value={f.border} onChange={(e) => set('border', e.target.value)} placeholder="نصيب" />
        </Field>
        <Field label="نوع البضاعة">
          <input value={f.goods} onChange={(e) => set('goods', e.target.value)} placeholder="تفاح" />
        </Field>
        <Field label="عدد الطرود / الكراتين">
          <input inputMode="numeric" value={f.packages} onChange={(e) => set('packages', e.target.value)} />
        </Field>
        <Field label="الوزن (كغ)">
          <input inputMode="decimal" value={f.weight} onChange={(e) => set('weight', e.target.value)} />
        </Field>
        <Field label="رقم البيان الجمركي">
          <input value={f.declaration} onChange={(e) => set('declaration', e.target.value)} />
        </Field>
        <Field label="رقم الحاوية">
          <input value={f.container} onChange={(e) => set('container', e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.refrigerated} onChange={(e) => set('refrigerated', e.target.checked)} /> نقل مبرّد
        </label>
        {f.refrigerated && (
          <Field label="حرارة البراد">
            <input value={f.temperature} onChange={(e) => set('temperature', e.target.value)} placeholder="+4°" />
          </Field>
        )}

        <h3 className="wide form-section">الأجور على الزبون</h3>
        {moneyRows(charges, setCharges, SHIPMENT_CHARGE_PRESETS, 'بند أجور')}
        <datalist id="ship-presets">
          {SHIPMENT_CHARGE_PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {showCosts && (
          <>
            <h3 className="wide form-section">مصاريف الشحنة علينا (لحساب الربح بس)</h3>
            {moneyRows(costs, setCosts, [], 'مصروف')}
          </>
        )}
        <div className="kv wide">
          <span>إجمالي الأجور</span>
          <strong>{money(state, sum(charges), cur)}</strong>
          {showCosts && costs.length > 0 && (
            <>
              <span>ربح الشحنة</span>
              <strong className={sum(charges) - sum(costs) < 0 ? 'bad' : 'good'}>{money(state, sum(charges) - sum(costs), cur)}</strong>
            </>
          )}
        </div>
        <Field label="ملاحظات" wide>
          <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">حفظ</button>
        </div>
      </form>
      {newParty && <PartyForm party={null} defaultKind="customer" onClose={() => setNewParty(false)} onSaved={(p) => set('partyId', p.id)} />}
    </Modal>
  );
}
