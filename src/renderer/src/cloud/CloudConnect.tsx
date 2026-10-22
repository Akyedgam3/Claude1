import { useEffect, useState } from 'react';
import { cloudCodeFromHash } from '../../../cloud/code';
import { api, IS_WEB } from '../api';
import { Field } from '../components/ui';
import { Icon } from '../components/icons';

/** الجوال: الاتصال بالجهاز الرئيسي (بالمحل) عن بعد عبر الإنترنت. */
export function CloudConnectForm({ notify, onConnected }: { notify: (m: string, k?: 'ok' | 'error') => void; onConnected: () => Promise<void> }) {
  // نسخة الويب بتنفتح من QR والرمز بالرابط (#c=...)
  const [f, setF] = useState({ code: (IS_WEB && cloudCodeFromHash(location.hash)) || '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api
      .cloudLast()
      .then((l) => l && setF((x) => ({ ...x, code: x.code || l.code, username: x.username || l.username })))
      .catch(() => undefined);
  }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const scan = async () => {
    try {
      const v = await api.scanBarcode();
      if (v) setF((x) => ({ ...x, code: v }));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.cloudConnect(f);
          await onConnected();
        } catch (err) {
          notify((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted wide">
        اعمل على بيانات المحل من أي مكان عبر الإنترنت. على الجهاز الرئيسي: الإعدادات ← الاتصال عن بعد، ثم امسح الرمز {IS_WEB ? 'بكاميرا الجوال' : ''} أو انسخه. يجب أن يبقى البرنامج مفتوحاً على الجهاز الرئيسي ومتصلاً بالإنترنت.
      </p>
      <Field label="رمز الاتصال" wide>
        <div className="scan-wrap">
          <input dir="ltr" className="mono" value={f.code} onChange={set('code')} placeholder="XXXX-XXXX-..." autoComplete="off" />
          {!IS_WEB && (
            <button type="button" className="camera-scan" onClick={scan} aria-label="مسح رمز QR">
              <Icon name="camera" size={20} />
            </button>
          )}
        </div>
      </Field>
      <Field label="اسم المستخدم">
        <input dir="ltr" value={f.username} onChange={set('username')} autoComplete="username" />
      </Field>
      <Field label="كلمة السر">
        <input type="password" value={f.password} onChange={set('password')} autoComplete="current-password" />
      </Field>
      <div className="form-actions wide">
        <button className="primary" disabled={busy || !f.code.trim() || !f.username}>
          {busy ? 'جاري الاتصال...' : 'اتصال'}
        </button>
      </div>
    </form>
  );
}
