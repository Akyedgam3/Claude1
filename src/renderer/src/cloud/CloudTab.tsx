import { useEffect, useState } from 'react';
import { cloudCodeLink } from '../../../cloud/code';
import { api, useCompany, type CloudStatus } from '../api';
import { Qr } from '../components/CommercialDoc';
import { CLOUD_CHANGED } from './useCloudHost';
import { askConfirm } from '../components/ui';

/** الإعدادات ← الاتصال عن بعد: خدمة إضافية اختيارية، بتشتغل بس إذا مفعّلة بالترخيص. */
export function CloudTab() {
  const { notify } = useCompany();
  const [s, setS] = useState<CloudStatus | null>(null);
  const load = () => api.cloudStatus().then(setS).catch((e: Error) => notify(e.message, 'error'));
  useEffect(() => {
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;

  if (!s.available) {
    return (
      <section className="card">
        <h3>الاتصال عن بعد</h3>
        <p>
          خدمة إضافية اختيارية تتيح لك متابعة محلك والعمل على بياناته من جوالك وأنت في البيت أو في أي مكان، عبر الإنترنت. البيانات تبقى على جهاز المحل، وتمر عبر الإنترنت مشفّرة بالكامل.
        </p>
        <p className="muted">هذه الخدمة غير مفعّلة في ترخيصك. تواصل معنا لتفعيلها، وبعدها تظهر هنا مباشرة.</p>
      </section>
    );
  }

  const setup = async (enable: boolean, newCode = false) => {
    if (newCode && !(await askConfirm('سيتم فصل كل الأجهزة المتصلة عن بعد، وتحتاج لإدخال الرمز الجديد عليها. متابعة؟'))) return;
    try {
      setS(await api.cloudSetup(enable, newCode));
      window.dispatchEvent(new Event(CLOUD_CHANGED));
      notify(enable ? 'الاتصال عن بعد يعمل' : 'تم إيقاف الاتصال عن بعد');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <section className="card">
      <h3>الاتصال عن بعد</h3>
      <p className="muted">
        هذا الجهاز يحفظ البيانات، والجوال يتصل به من أي مكان عبر الإنترنت. كل جهاز يدخل باسم مستخدم وكلمة سر وبنفس صلاحياته. يجب أن يبقى البرنامج مفتوحاً على هذا الجهاز ومتصلاً بالإنترنت.
      </p>
      <label className="check">
        <input type="checkbox" checked={s.enabled} onChange={(e) => setup(e.target.checked)} />
        تفعيل الاتصال عن بعد
      </label>
      {s.enabled && s.code && (
        <>
          <div className="cloud-code">
            <Qr text={cloudCodeLink(s.code)} size={180} />
            <div>
              <p>أندرويد: افتح تطبيق وزن ← «اتصال عن بعد» ← امسح الرمز. آيفون: امسح الرمز بكاميرا الجوال فبتنفتح نسخة الويب والرمز جاهز. أو اكتب الرمز:</p>
              <p className="big-code mono selectable" dir="ltr">
                {s.code.slice(0, 19)}
                <br />
                {s.code.slice(20)}
              </p>
              <button onClick={() => navigator.clipboard.writeText(s.code!).then(() => notify('تم نسخ الرمز'))}>نسخ الرمز</button>
            </div>
          </div>
          <div className="kv">
            <span>الأجهزة المتصلة</span>
            <strong>{s.devices.length ? s.devices.map((d) => `${d.deviceName} (${d.user})`).join('، ') : 'لا يوجد'}</strong>
          </div>
          <p className="bad">هذا الرمز مثل مفتاح المحل: من يملكه يستطيع رؤية البيانات. لا ترسله إلا لمن تثق به، وغيّره إذا فقدت جوالاً.</p>
          <button onClick={() => setup(true, true)}>رمز جديد (يفصل كل الأجهزة)</button>
        </>
      )}
    </section>
  );
}
