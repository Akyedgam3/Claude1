import { useMemo, useState } from 'react';
import type { Invoice, RepairOrder, RepairStatus } from '../../../core';
import { money, parseAmount, toInput, today, uid, useCompany, dateText } from '../api';
import { CurrencySelect, Field, itemMatches, itemOptions, Modal, PageHeader, Picker } from '../components/ui';
import { cashAccounts } from './InvoiceEditor';
import { repairTotal, STATUS_NAMES } from './Repairs';
import { assetLabel, useAssetKind, VehicleForm } from './Vehicles';
import { DocHeader, PrintButtons } from '../components/print';

interface PartRow {
  key: string;
  itemId: string;
  qty: string;
  price: string;
}
interface LaborRow {
  key: string;
  description: string;
  amount: string;
}

export function RepairEditor({ id }: { id?: string }) {
  const { state, call, notify, navigate } = useCompany();
  const asset = useAssetKind();
  const base = state.info!.baseCurrency;
  const existing = id && !id.startsWith('new') ? state.repairs[id] : undefined;
  const presetVehicle = id?.startsWith('new:') ? id.slice(4) : null;
  const locked = existing?.status === 'invoiced';

  const [vehicleId, setVehicleId] = useState<string | null>(existing?.vehicleId ?? presetVehicle);
  const [date, setDate] = useState(existing?.date ?? today());
  const [status, setStatus] = useState<RepairStatus>(existing?.status ?? 'open');
  const [odometer, setOdometer] = useState(existing?.odometer ? String(existing.odometer) : '');
  const [technician, setTechnician] = useState(existing?.technician ?? '');
  const [complaint, setComplaint] = useState(existing?.complaint ?? '');
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? base);
  const [parts, setParts] = useState<PartRow[]>(
    existing?.parts.map((p) => ({ key: uid(), itemId: p.itemId, qty: String(p.qty), price: toInput(state, p.price, existing.currency) })) ?? [],
  );
  const [labor, setLabor] = useState<LaborRow[]>(
    existing?.labor.map((l) => ({ key: uid(), description: l.description, amount: toInput(state, l.amount, existing.currency) })) ?? [],
  );
  const [newVehicle, setNewVehicle] = useState(false);
  const [invoicing, setInvoicing] = useState(false);

  const vehicle = vehicleId ? state.vehicles[vehicleId] : undefined;
  const items = useMemo(() => itemOptions(state), [state]);
  const vehicleOptions = useMemo(
    () =>
      Object.values(state.vehicles).map((v) => ({
        id: v.id,
        label: assetLabel(v),
        hint: state.parties[v.partyId]?.name ?? '',
      })),
    [state],
  );
  const technicians = useMemo(() => [...new Set(Object.values(state.repairs).map((r) => r.technician).filter(Boolean))], [state.repairs]);

  const build = (): Omit<RepairOrder, 'number'> | null => {
    if (!vehicle) {
      notify('اختر السيارة', 'error');
      return null;
    }
    try {
      return {
        id: existing?.id ?? uid(),
        vehicleId: vehicle.id,
        partyId: vehicle.partyId,
        date,
        status,
        complaint: complaint.trim(),
        currency,
        parts: parts.map((p) => ({ itemId: p.itemId, qty: Number(p.qty), price: parseAmount(state, p.price, currency) })),
        labor: labor.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), amount: parseAmount(state, l.amount, currency) })),
        ...(odometer ? { odometer: Number(odometer) } : {}),
        ...(diagnosis.trim() ? { diagnosis: diagnosis.trim() } : {}),
        ...(technician.trim() ? { technician: technician.trim() } : {}),
      };
    } catch (e) {
      notify((e as Error).message, 'error');
      return null;
    }
  };

  const save = async (): Promise<RepairOrder | null> => {
    const data = build();
    if (!data) return null;
    const res = await call<RepairOrder>('saveRepair', data);
    if (!res) return null;
    notify(`تم حفظ أمر الإصلاح رقم ${res.value.number}`);
    if (!existing) navigate('repair', res.value.id);
    return res.value;
  };

  const total = (() => {
    try {
      return repairTotal({
        parts: parts.map((p) => ({ itemId: p.itemId, qty: Number(p.qty) || 0, price: parseAmount(state, p.price, currency) })),
        labor: labor.map((l) => ({ description: l.description, amount: parseAmount(state, l.amount, currency) })),
      } as RepairOrder);
    } catch {
      return 0;
    }
  })();

  return (
    <div className="page">
      <PageHeader title={existing ? `أمر صيانة رقم ${existing.number}` : 'أمر صيانة جديد'}>
        {existing && <PrintButtons kind="invoice" name={`أمر صيانة ${existing.number}`} />}
        {existing?.invoiceId && (
          <button className="primary" onClick={() => navigate('invoice', existing.invoiceId)}>
            عرض الفاتورة
          </button>
        )}
        {!locked && (
          <>
            <button className="primary" onClick={save}>
              حفظ
            </button>
            {status !== 'cancelled' && (
              <button className="primary accent" onClick={() => setInvoicing(true)}>
                تسليم وفوترة
              </button>
            )}
          </>
        )}
      </PageHeader>
      {locked && <div className="banner">هذا الأمر مفوتر. لتعديله ألغِ الفاتورة (يعود الأمر قابلاً للتعديل).</div>}

      <fieldset disabled={locked} className="plain">
        <section className="card form-grid four">
          <Field label={asset.one === 'سيارة' ? 'السيارة' : 'الجهاز'} wide>
            <div className="with-button">
              <Picker options={vehicleOptions} value={vehicleId} onChange={setVehicleId} placeholder="ابحث باللوحة / IMEI أو اسم الزبون..." />
              <button type="button" className="icon" title="جديد" onClick={() => setNewVehicle(true)}>
                +
              </button>
            </div>
          </Field>
          <Field label="الزبون">
            <input readOnly value={vehicle ? (state.parties[vehicle.partyId]?.name ?? '') : ''} />
          </Field>
          <Field label="الحالة">
            <select value={status} onChange={(e) => setStatus(e.target.value as RepairStatus)}>
              {(['open', 'in_progress', 'done', 'cancelled'] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_NAMES[s]}
                </option>
              ))}
              {status === 'invoiced' && <option value="invoiced">{STATUS_NAMES.invoiced}</option>}
            </select>
          </Field>
          <Field label="التاريخ">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {asset.kind === 'vehicle' && (
            <Field label="العداد (كم)">
              <input value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
            </Field>
          )}
          <Field label="الفني">
            <input value={technician} onChange={(e) => setTechnician(e.target.value)} list="technicians" />
            <datalist id="technicians">
              {technicians.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="العملة">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
          <Field label="شكوى الزبون" wide>
            <textarea rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder={asset.kind === 'vehicle' ? 'صوت بالفرامل، تغيير زيت...' : 'الشاشة مكسورة، لا يشحن...'} />
          </Field>
          <Field label="التشخيص والعمل المنجز" wide>
            <textarea rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </Field>
        </section>

        <div className="two-col">
          <section className="card">
            <h3>القطع المستخدمة</h3>
            <table className="table lines">
              <thead>
                <tr>
                  <th>القطعة</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const item = state.items[p.itemId];
                  return (
                    <tr key={p.key}>
                      <td>
                        <div className="line-item">
                          <strong>{item?.name}</strong>
                          <small>
                            {item?.partNumber} · الرصيد: {state.stock[p.itemId]?.totalQty ?? 0}
                          </small>
                        </div>
                      </td>
                      <td>
                        <input className="num-input" value={p.qty} onChange={(e) => setParts(parts.map((x) => (x.key === p.key ? { ...x, qty: e.target.value } : x)))} />
                      </td>
                      <td>
                        <input className="num-input" value={p.price} onChange={(e) => setParts(parts.map((x) => (x.key === p.key ? { ...x, price: e.target.value } : x)))} />
                      </td>
                      <td>
                        <button type="button" className="icon" onClick={() => setParts(parts.filter((x) => x.key !== p.key))}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4}>
                    <Picker
                      options={items}
                      value={null}
                      placeholder="+ أضف قطعة (بحث بالاسم، الرقم، أو نوع السيارة)"
                      filter={(o, q) => itemMatches((o as (typeof items)[number]).item, q)}
                      onChange={(itemId) => {
                        if (!itemId) return;
                        const item = state.items[itemId]!;
                        const price = item.priceCurrency === currency ? toInput(state, item.price, currency) : '';
                        setParts([...parts, { key: uid(), itemId, qty: '1', price }]);
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card">
            <h3>أجور اليد</h3>
            <table className="table lines">
              <thead>
                <tr>
                  <th>العمل</th>
                  <th>الأجرة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {labor.map((l) => (
                  <tr key={l.key}>
                    <td>
                      <input value={l.description} onChange={(e) => setLabor(labor.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x)))} />
                    </td>
                    <td>
                      <input className="num-input" value={l.amount} onChange={(e) => setLabor(labor.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))} />
                    </td>
                    <td>
                      <button type="button" className="icon" onClick={() => setLabor(labor.filter((x) => x.key !== l.key))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => setLabor([...labor, { key: uid(), description: '', amount: '' }])}>
              + أضف عملاً
            </button>
          </section>
        </div>
      </fieldset>

      <section className="card totals-bar">
        <span>إجمالي الأمر (قبل الضرائب)</span>
        <strong>{money(state, total, currency)}</strong>
      </section>

      {existing && <RepairCard repair={existing} />}
      {newVehicle && <VehicleForm vehicle={null} onClose={() => setNewVehicle(false)} onSaved={(v) => setVehicleId(v.id)} />}
      {invoicing && (
        <InvoiceRepairDialog
          total={total}
          currency={currency}
          onClose={() => setInvoicing(false)}
          onConfirm={async (opts) => {
            const saved = await save();
            if (!saved) return;
            const res = await call<Invoice>('invoiceRepair', saved.id, { date: today(), ...opts });
            if (res) {
              notify(`تم إنشاء فاتورة رقم ${res.value.number}`);
              navigate('invoice', res.value.id);
            }
          }}
        />
      )}
    </div>
  );
}

function InvoiceRepairDialog({
  total,
  currency,
  onClose,
  onConfirm,
}: {
  total: number;
  currency: string;
  onClose: () => void;
  onConfirm: (opts: { paid: number; cashAccountId: string; taxIds: string[] }) => Promise<void>;
}) {
  const { state, notify } = useCompany();
  const [paid, setPaid] = useState(toInput(state, total, currency));
  const [cash, setCash] = useState('1101');
  const [taxIds, setTaxIds] = useState(Object.values(state.taxes).filter((t) => t.active && t.percent > 0).map((t) => t.id));
  return (
    <Modal title="تسليم السيارة وإصدار الفاتورة" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onConfirm({ paid: parseAmount(state, paid, currency), cashAccountId: cash, taxIds });
          } catch (err) {
            notify((err as Error).message, 'error');
          }
        }}
      >
        <p className="wide">
          قيمة الأمر: <strong>{money(state, total, currency)}</strong>
          {taxIds.length > 0 && ' + الضرائب'}
        </p>
        <Field label="المقبوض الآن (الباقي يُسجّل ديناً على الزبون)">
          <input value={paid} onChange={(e) => setPaid(e.target.value)} autoFocus />
        </Field>
        <Field label="الصندوق">
          <select value={cash} onChange={(e) => setCash(e.target.value)}>
            {cashAccounts(state).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {Object.values(state.taxes)
          .filter((t) => t.percent > 0)
          .map((t) => (
            <label key={t.id} className="check wide">
              <input type="checkbox" checked={taxIds.includes(t.id)} onChange={(e) => setTaxIds(e.target.checked ? [...taxIds, t.id] : taxIds.filter((x) => x !== t.id))} />
              {t.name} ({t.percent}%)
            </label>
          ))}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary">إصدار الفاتورة</button>
        </div>
      </form>
    </Modal>
  );
}

/** كرت الصيانة المطبوع (يظهر عند الطباعة فقط). */
function RepairCard({ repair }: { repair: RepairOrder }) {
  const { state } = useCompany();
  const v = state.vehicles[repair.vehicleId];
  const party = state.parties[repair.partyId];
  return (
    <div className="print-area print-only invoice-doc">
      <DocHeader title="أمر صيانة">
        <div>رقم: {repair.number}</div>
        <div>
          التاريخ: <span className="ltr">{dateText(repair.date)}</span>
        </div>
      </DocHeader>
      <div className="doc-party">
        <div>
          الزبون: <strong>{party?.name}</strong> {party?.phone && (
            <>
              {' · '}
              <span className="ltr">{party.phone}</span>
            </>
          )}
        </div>
        <div>
          {v?.kind === 'device' ? 'الجهاز' : 'السيارة'}: <strong>{assetLabel(v)}</strong>
          {repair.odometer ? ` · العداد: ${repair.odometer.toLocaleString('en')} كم` : ''}
          {v?.vin && <span className="mono"> · {v.vin}</span>}
        </div>
        {repair.technician && <div>الفني: {repair.technician}</div>}
      </div>
      <p>
        <strong>الشكوى:</strong> {repair.complaint}
      </p>
      {repair.diagnosis && (
        <p>
          <strong>العمل المنجز:</strong> {repair.diagnosis}
        </p>
      )}
      <table className="doc-lines">
        <thead>
          <tr>
            <th>البيان</th>
            <th>الكمية</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {repair.parts.map((p, i) => (
            <tr key={i}>
              <td>{state.items[p.itemId]?.name}</td>
              <td>{p.qty}</td>
              <td>{money(state, Math.round(p.qty * p.price), repair.currency)}</td>
            </tr>
          ))}
          {repair.labor.map((l, i) => (
            <tr key={`l${i}`}>
              <td>{l.description}</td>
              <td>—</td>
              <td>{money(state, l.amount, repair.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="doc-totals">
        <div className="grand">
          <span>الإجمالي</span>
          <strong>{money(state, repairTotal(repair), repair.currency)}</strong>
        </div>
      </div>
      <footer className="doc-footer signatures">
        <span>توقيع الزبون</span>
        <span>توقيع الفني</span>
      </footer>
    </div>
  );
}
