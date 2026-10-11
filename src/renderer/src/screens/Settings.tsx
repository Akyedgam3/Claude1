import { useState } from 'react';
import type { LicenseStatus } from '../../../main/license-manager';
import { api, useCompany } from '../api';
import { Field, PageHeader } from '../components/ui';

export function LicensePanel({
  license,
  onChange,
  notify,
}: {
  license: LicenseStatus;
  onChange: () => Promise<void>;
  notify: (m: string, k?: 'ok' | 'error') => void;
}) {
  const [key, setKey] = useState('');
  return (
    <div className="license-panel">
      <h3>الترخيص</h3>
      <div className="kv">
        <span>الحالة</span>
        <strong className={license.readOnly ? 'bad' : ''}>
          {license.readOnly ? 'منتهي — قراءة وطباعة فقط' : license.planName}
          {license.daysLeft !== null && !license.readOnly && ` · متبقٍ ${license.daysLeft} يوم`}
        </strong>
        {license.customer && (
          <>
            <span>باسم</span>
            <strong>{license.customer}</strong>
          </>
        )}
        <span>بصمة الجهاز</span>
        <strong dir="ltr" className="mono selectable">
          {license.machineId}
        </strong>
      </div>
      {license.message && <p className="bad">{license.message}</p>}
      <p className="muted">
        للاشتراك (شهري، 3 أشهر، 6 أشهر، سنوي، أو شراء دائم) أرسل بصمة الجهاز للبائع، وستحصل على مفتاح ترخيص تلصقه هنا. لا حاجة للإنترنت.
      </p>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.activate(key);
            setKey('');
            notify('تم تفعيل الترخيص');
            await onChange();
          } catch (err) {
            notify((err as Error).message, 'error');
          }
        }}
      >
        <input dir="ltr" className="mono" placeholder="MZN1-..." value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="primary" disabled={!key.trim()}>
          تفعيل
        </button>
      </form>
    </div>
  );
}

export function Settings({ onLicense }: { onLicense: () => Promise<void> }) {
  const { state, info, call, notify } = useCompany();
  const company = state.info!;
  const [form, setForm] = useState({ name: company.name, phone: company.phone ?? '', address: company.address ?? '', taxNumber: company.taxNumber ?? '' });

  return (
    <div className="page">
      <PageHeader title="الإعدادات" />

      <section className="card">
        <h3>بيانات الشركة (تظهر على الفواتير)</h3>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call('updateCompany', form)) notify('تم الحفظ');
          }}
        >
          <Field label="الاسم">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="العنوان">
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="الرقم الضريبي / السجل التجاري">
            <input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
          </Field>
          <div className="form-actions wide">
            <button className="primary">حفظ</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3>الضرائب والرسوم</h3>
        <p className="muted">حدد النسب حسب نوع نشاطك. الضرائب الفعّالة تظهر كخيار في الفواتير.</p>
        <table className="table">
          <thead>
            <tr>
              <th>الضريبة</th>
              <th>النسبة %</th>
              <th>الحساب</th>
              <th>فعّالة</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(state.taxes).map((t) => (
              <tr key={t.id}>
                <td>
                  <input defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && call('saveTax', { ...t, name: e.target.value })} />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={t.percent}
                    onBlur={(e) => Number(e.target.value) !== t.percent && call('saveTax', { ...t, percent: Number(e.target.value) })}
                  />
                </td>
                <td>{state.accounts[t.accountId]?.name}</td>
                <td>
                  <input type="checkbox" checked={t.active} onChange={(e) => call('saveTax', { ...t, active: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>النسخ الاحتياطي</h3>
        <p className="muted">يأخذ البرنامج نسخة تلقائية عند كل إغلاق (آخر 30 نسخة). يُنصح بنسخة أسبوعية على فلاشة.</p>
        <div className="button-row">
          <button
            onClick={async () => {
              try {
                const p = await api.backup(false);
                notify(`تم حفظ النسخة: ${p}`);
              } catch (e) {
                notify((e as Error).message, 'error');
              }
            }}
          >
            نسخة احتياطية الآن
          </button>
          <button
            onClick={async () => {
              try {
                const p = await api.backup(true);
                if (p) notify(`تم حفظ النسخة: ${p}`);
              } catch (e) {
                notify((e as Error).message, 'error');
              }
            }}
          >
            نسخ إلى فلاشة / مجلد آخر...
          </button>
          <button onClick={() => api.reveal()}>فتح مجلد الشركة</button>
        </div>
      </section>

      <section className="card">
        <LicensePanel license={info.license} onChange={onLicense} notify={notify} />
      </section>
    </div>
  );
}
