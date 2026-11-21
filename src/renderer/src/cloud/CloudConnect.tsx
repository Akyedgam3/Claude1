import { useEffect, useState } from 'react';
import { cloudCodeFromHash } from '../../../cloud/code';
import { api, IS_MOBILE, IS_WEB } from '../api';
import { Field } from '../components/ui';
import { Icon } from '../components/icons';

/** الاتصال بالجهاز الرئيسي (بالمحل) عن بعد عبر الإنترنت، من جوال أو كمبيوتر. بعد أول مرة بيكفي كلمة السر. */
export function CloudConnectForm({ notify, onConnected }: { notify: (m: string, k?: 'ok' | 'error') => void; onConnected: () => Promise<void> }) {
  // نسخة الويب بتنفتح من QR والرمز بالرابط (#c=...)
  const fromLink = (IS_WEB && cloudCodeFromHash(location.hash)) || '';
  const [f, setF] = useState({ code: fromLink, username: '', password: '' });
  const [last, setLast] = useState<{ code: string; username: string; name?: string } | null>(null);
  const [full, setFull] = useState(!!fromLink);
  const [busy, setBusy] = useState(false);
  // الجهاز الرئيسي مطفي وما في نسخة محفوظة لهالحساب هون: منعرض استرجاع البيانات بملف
  const [lost, setLost] = useState(false);
  const [rec, setRec] = useState({ username: '', password: '', confirm: '' });
  useEffect(() => {
    void api
      .cloudLast()
      .then((l) => {
        setLast(l);
        if (l) setF((x) => ({ ...x, code: x.code || l.code, username: x.username || l.username }));
      })
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
  const quick = !!last && !full;
  const connect = async () => {
    setBusy(true);
    try {
      await api.cloudConnect(quick ? { saved: true, password: f.password } : f);
      await onConnected();
    } catch (err) {
      if (/مطفي/.test((err as Error).message) && !IS_WEB) {
        setLost(true);
        setRec((r) => ({ ...r, username: r.username || (quick ? last!.username : f.username) }));
      }
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      {quick ? (
        <div className="saved-conn wide">
          <Icon name="cloud" size={22} />
          <div>
            <b>{last.name || 'الجهاز الرئيسي'}</b>
            <small>
              باسم <span dir="ltr">{last.username}</span>
            </small>
          </div>
          <button type="button" className="ghost" onClick={() => setFull(true)}>
            اتصال تاني
          </button>
        </div>
      ) : (
        <>
          <p className="muted wide">
            اعمل على بيانات المحل من أي مكان عبر الإنترنت. على الجهاز الرئيسي: الإعدادات ← الاتصال عن بعد، ثم {IS_MOBILE ? 'امسح الرمز أو انسخه' : 'انسخ الرمز'}. بعد أول مرة بيكفي كلمة السر.
          </p>
          <Field label="رمز الاتصال" wide>
            <div className="scan-wrap">
              <input dir="ltr" className="mono" value={f.code} onChange={set('code')} placeholder="XXXX-XXXX-..." autoComplete="off" />
              {IS_MOBILE && (
                <button type="button" className="camera-scan" onClick={scan} aria-label="مسح رمز QR">
                  <Icon name="camera" size={20} />
                </button>
              )}
            </div>
          </Field>
          <Field label="اسم المستخدم">
            <input dir="ltr" value={f.username} onChange={set('username')} autoComplete="username" />
          </Field>
        </>
      )}
      <Field label="كلمة السر" wide={quick}>
        <input type="password" value={f.password} onChange={set('password')} autoComplete="current-password" autoFocus={quick} />
      </Field>
      {lost && (
        <div className="wide card cloud-recover">
          <b>الجهاز الرئيسي ضاع أو انحذف منه التطبيق؟</b>
          <p className="muted">
            فيك ترجّع بيانات المحل من آخر نسخة محفوظة بالاتصال عن بعد، بملف نسخة احتياطية (.wazn). بعدين بتفتحه على الجهاز الجديد المرخّص: فتح شركة ← استعادة نسخة احتياطية. بتدخل باسم صاحب المحل وبكلمة السر الجديدة اللي بتكتبها هون.
          </p>
          <Field label="اسم الدخول تبع صاحب المحل">
            <input dir="ltr" value={rec.username} onChange={(e) => setRec({ ...rec, username: e.target.value })} />
          </Field>
          <Field label="كلمة سر جديدة (6 أحرف أو أكتر)">
            <input type="password" value={rec.password} onChange={(e) => setRec({ ...rec, password: e.target.value })} />
          </Field>
          <Field label="تأكيد كلمة السر">
            <input type="password" value={rec.confirm} onChange={(e) => setRec({ ...rec, confirm: e.target.value })} />
          </Field>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (rec.password.length < 6) return notify('كلمة السر لازم تكون 6 أحرف على الأقل', 'error');
              if (rec.password !== rec.confirm) return notify('كلمتين السر مش متطابقين', 'error');
              setBusy(true);
              try {
                const where = await api.cloudRecover({ ...(quick ? { saved: true } : { code: f.code }), username: rec.username, password: rec.password });
                if (where) notify(`انحفظت بيانات المحل: ${where}. افتحها على الجهاز الجديد من «استعادة نسخة احتياطية».`);
              } catch (e) {
                notify((e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'عم يسترجع...' : 'استرجع بيانات المحل بملف'}
          </button>
        </div>
      )}
      <div className="form-actions wide">
        {full && last && (
          <button type="button" className="ghost" onClick={() => setFull(false)}>
            رجوع لـ {last.name || 'الاتصال المحفوظ'}
          </button>
        )}
        <button className="primary" disabled={busy || (!quick && (!f.code.trim() || !f.username))}>
          {busy ? 'جاري الاتصال...' : 'اتصال'}
        </button>
      </div>
      {busy && <p className="muted wide cloud-wait">عم نتصل بالجهاز الرئيسي… إذا كان مطفي بيفتح وزن آخر نسخة محفوظة خلال ثواني، والعمليات الجديدة بتوصله لما يرجع.</p>}
    </form>
  );
}
