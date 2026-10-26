import { useState } from 'react';
import logo from '../assets/logo.png';
import { api, IS_MOBILE, type AppInfo } from '../api';
import { ConnectForm } from './Welcome';
import { CloudConnectForm } from '../cloud/CloudConnect';

/** يظهر عند عدم وجود ترخيص صالح: لا يمكن فتح أي شركة على هذا الجهاز. */
export function LockScreen({ info, onChanged, notify }: { info: AppInfo; onChanged: () => Promise<void>; notify: (m: string, k?: 'ok' | 'error') => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [connect, setConnect] = useState<'lan' | 'cloud' | null>(null);
  const lic = info.license;

  const activate = async () => {
    setBusy(true);
    try {
      await api.activate(key);
      notify('تم تفعيل البرنامج');
      setKey('');
      await onChanged();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="welcome lock">
      <div className="welcome-hero">
        <img src={logo} alt="" className="hero-logo" />
        <div className="logo big">وزن</div>
        <p>نظام محاسبة لكل المصالح والتجارات</p>
      </div>
      <section className="card lock-card">
        <h3>{lic.reason === 'none' ? 'تفعيل البرنامج' : 'البرنامج متوقف'}</h3>
        {lic.message && <div className={`banner ${lic.reason === 'none' ? '' : 'bad'}`}>{lic.message}</div>}
        <div className="kv">
          <span>بصمة الجهاز</span>
          <strong className="mono selectable big-code">{lic.machineId}</strong>
          {lic.customer && (
            <>
              <span>الترخيص باسم</span>
              <strong>{lic.customer}</strong>
            </>
          )}
        </div>
        <p className="muted">
          أرسل بصمة الجهاز للبائع لتحصل على مفتاح الترخيص (شهري، 3 أشهر، 6 أشهر، سنوي، أو شراء دائم)، ثم الصقه هنا.
        </p>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void activate();
          }}
        >
          <textarea dir="ltr" className="mono" rows={3} placeholder="MZN2-..." value={key} onChange={(e) => setKey(e.target.value)} />
        </form>
        <div className="button-row">
          <button className="primary" disabled={!key.trim() || busy} onClick={activate}>
            تفعيل
          </button>
          {lic.onlineEnabled && lic.reason !== 'none' && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const s = await api.refreshLicense();
                  notify(s.locked ? (s.message ?? 'ما زال الترخيص متوقفاً') : 'تم التحقق، البرنامج يعمل', s.locked ? 'error' : 'ok');
                  await onChanged();
                } catch (e) {
                  notify((e as Error).message, 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              إعادة التحقق عبر الإنترنت
            </button>
          )}
          <button className="ghost" onClick={() => navigator.clipboard.writeText(lic.machineId).then(() => notify('تم نسخ البصمة'))}>
            نسخ البصمة
          </button>
        </div>
      </section>
      <section className="card lock-card">
        <h3>{IS_MOBILE ? 'متصل بمحل عن بعد؟' : 'جهاز فرعي أو متصل عن بعد؟'}</h3>
        <p className="muted">
          {IS_MOBILE ? 'الجوال المتصل عن بعد' : 'الأجهزة الإضافية (كاشير تاني على نفس الشبكة، أو كمبيوتر بالبيت عن بعد)'} بتشتغل بترخيص الجهاز الرئيسي بالمحل وما بتحتاج مفتاح خاص.
        </p>
        {connect === 'cloud' ? (
          <CloudConnectForm notify={notify} onConnected={onChanged} />
        ) : connect === 'lan' ? (
          <ConnectForm info={info} notify={notify} onConnected={onChanged} />
        ) : (
          <div className="button-row">
            {!IS_MOBILE && <button onClick={() => setConnect('lan')}>على نفس الشبكة</button>}
            <button onClick={() => setConnect('cloud')}>اتصال عن بعد</button>
          </div>
        )}
      </section>
      <footer className="muted">الإصدار {info.version}</footer>
    </div>
  );
}
