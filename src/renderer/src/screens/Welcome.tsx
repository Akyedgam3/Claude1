import { useState } from 'react';
import { api, type AppInfo } from '../api';
import { Field } from '../components/ui';
import { LicensePanel } from './Settings';

const ACTIVITIES = [
  { value: 'auto', label: 'قطع غيار وصيانة سيارات' },
  { value: 'general', label: 'تجارة عامة / خدمات' },
];

export function Welcome({
  info,
  onOpened,
  onLicense,
  notify,
}: {
  info: AppInfo;
  onOpened: () => Promise<void>;
  onLicense: () => Promise<void>;
  notify: (m: string, k?: 'ok' | 'error') => void;
}) {
  const [form, setForm] = useState({ name: '', activity: 'auto', baseCurrency: 'SYP', phone: '', address: '' });
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res !== null) {
        if (res && typeof res === 'object' && 'recoveredTail' in res && res.recoveredTail) {
          notify('تم إصلاح عملية لم تكتمل بسبب انقطاع مفاجئ. باقي البيانات سليمة.');
        }
        await onOpened();
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="logo big">ميزان</div>
        <p>نظام محاسبة يعمل بدون إنترنت، وبياناتك محفوظة على جهازك.</p>
      </div>

      <div className="welcome-grid">
        <section className="card">
          <h3>شركة جديدة</h3>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim()) return notify('اكتب اسم الشركة أو المحل', 'error');
              void run(() => api.createCompany(form));
            }}
          >
            <Field label="اسم الشركة / المحل" wide>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="نوع النشاط">
              <select value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })}>
                {ACTIVITIES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="العملة الأساسية للحسابات">
              <select value={form.baseCurrency} onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}>
                <option value="SYP">ليرة سورية</option>
                <option value="USD">دولار أمريكي</option>
              </select>
            </Field>
            <Field label="الهاتف">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="العنوان">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <div className="form-actions wide">
              <button className="primary" disabled={busy}>
                إنشاء الشركة
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <h3>فتح شركة</h3>
          {info.recent.length === 0 && <p className="muted">لا توجد شركات سابقة على هذا الجهاز.</p>}
          <ul className="recent">
            {info.recent.map((r) => (
              <li key={r.dir}>
                <button disabled={busy} onClick={() => run(() => api.openCompany(r.dir))}>
                  <strong>{r.name}</strong>
                  <small dir="ltr">{r.dir}</small>
                </button>
              </li>
            ))}
          </ul>
          <button disabled={busy} onClick={() => run(() => api.openCompany())}>
            فتح من مجلد...
          </button>
        </section>
      </div>

      <section className="card welcome-license">
        <LicensePanel license={info.license} onChange={onLicense} notify={notify} />
      </section>
      <footer className="muted">الإصدار {info.version}</footer>
    </div>
  );
}
