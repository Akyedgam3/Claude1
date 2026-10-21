import { useState } from 'react';
import { ACTIVITY_LIST } from '../../../core';
import logo from '../assets/logo.png';
import { Icon } from '../components/icons';
import { api, IS_MOBILE, type AppInfo, type CompanyPeek } from '../api';
import { Field, Modal } from '../components/ui';
import { CloudConnectForm } from '../cloud/CloudConnect';

type Tab = 'open' | 'new' | 'connect' | 'cloud';

export function Welcome({
  info,
  onOpened,
  notify,
}: {
  info: AppInfo;
  onOpened: () => Promise<void>;
  onLicense: () => Promise<void>;
  notify: (m: string, k?: 'ok' | 'error') => void;
}) {
  const [tab, setTab] = useState<Tab>(info.recent.length ? 'open' : 'new');
  const [login, setLogin] = useState<CompanyPeek | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);

  const peek = async (dir?: string) => {
    try {
      const p = dir ? await api.peek(dir) : await api.peek();
      if (p) setLogin(p);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <img src={logo} alt="" className="hero-logo" />
        <div className="logo big">وزن</div>
        <p>نظام محاسبة لكل المصالح والتجارات — يعمل بدون إنترنت وبياناتك مشفّرة على جهازك.</p>
        {info.license.customer && (
          <p className="muted">
            مرخّص لـ {info.license.customer} · {info.license.planName}
            {info.license.daysLeft ? ` · متبقٍ ${info.license.daysLeft} يوم` : ''}
          </p>
        )}
      </div>

      <div className="segmented center">
        <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>
          فتح شركة
        </button>
        <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
          شركة جديدة
        </button>
        {!IS_MOBILE && (
          <button className={tab === 'connect' ? 'active' : ''} onClick={() => setTab('connect')}>
            الاتصال بجهاز رئيسي
          </button>
        )}
        {IS_MOBILE && (
          <button className={tab === 'cloud' ? 'active' : ''} onClick={() => setTab('cloud')}>
            اتصال عن بعد
          </button>
        )}
      </div>

      {tab === 'open' && (
        <section className="card">
          {info.recent.length === 0 && <p className="muted">لا توجد شركات سابقة على هذا الجهاز.</p>}
          <ul className="recent">
            {info.recent.map((r) => (
              <li key={r.dir}>
                <button onClick={() => peek(r.dir)}>
                  <strong>{r.name}</strong>
                  {!IS_MOBILE && <small dir="ltr">{r.dir}</small>}
                </button>
              </li>
            ))}
          </ul>
          <div className="button-row">
            {!IS_MOBILE && <button onClick={() => peek()}>فتح من مجلد...</button>}
            <button
              onClick={async () => {
                try {
                  const p = await api.restore();
                  if (p) {
                    notify('تم نسخ النسخة الاحتياطية. سجّل الدخول لفتحها.');
                    setLogin(p);
                  }
                } catch (e) {
                  notify((e as Error).message, 'error');
                }
              }}
            >
              {IS_MOBILE ? 'استعادة نسخة احتياطية (ملف .wazn)' : 'استعادة نسخة احتياطية...'}
            </button>
          </div>
        </section>
      )}

      {tab === 'new' && <NewCompany notify={notify} onCreated={(code) => setRecovery(code)} />}
      {tab === 'connect' && (
        <section className="card">
          <ConnectForm info={info} notify={notify} onConnected={onOpened} />
        </section>
      )}

      {tab === 'cloud' && (
        <section className="card">
          <CloudConnectForm notify={notify} onConnected={onOpened} />
        </section>
      )}

      {login && <LoginDialog peek={login} onClose={() => setLogin(null)} notify={notify} onOpened={onOpened} />}
      {recovery && (
        <Modal title="احفظ رمز الاسترداد" onClose={() => undefined}>
          <p>بيانات الشركة مشفّرة بكلمة السر. إن نسيت كلمة السر فهذا الرمز هو الطريقة الوحيدة لفتح الشركة.</p>
          <p className="big-code mono selectable" dir="ltr">
            {recovery}
          </p>
          <p className="bad">اكتبه على ورقة واحفظه في مكان آمن. لن يظهر مرة أخرى.</p>
          <div className="form-actions">
            <button onClick={() => navigator.clipboard.writeText(recovery)}>نسخ</button>
            <button
              className="primary"
              onClick={async () => {
                setRecovery(null);
                await onOpened();
              }}
            >
              حفظته، تابع
            </button>
          </div>
        </Modal>
      )}
      <footer className="muted">الإصدار {info.version}</footer>
    </div>
  );
}

function NewCompany({ notify, onCreated }: { notify: (m: string, k?: 'ok' | 'error') => void; onCreated: (recovery: string) => void }) {
  const [f, setF] = useState({ name: '', activity: 'general', baseCurrency: 'SYP', phone: '', address: '', ownerName: '', username: 'admin', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <section className="card">
      <h3>1. نوع النشاط</h3>
      <div className="activity-grid">
        {ACTIVITY_LIST.map((a) => (
          <button key={a.id} type="button" className={`activity ${f.activity === a.id ? 'active' : ''}`} onClick={() => setF({ ...f, activity: a.id })}>
            <span className="activity-icon" style={{ background: a.color }}>
              <Icon name={a.icon} size={22} />
            </span>
            <strong>{a.name}</strong>
            <small>{a.description}</small>
          </button>
        ))}
      </div>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.name.trim()) return notify('اكتب اسم الشركة أو المحل', 'error');
          if (f.password.length < 6) return notify('كلمة السر 6 أحرف على الأقل', 'error');
          if (f.password !== f.confirm) return notify('كلمتا السر غير متطابقتين', 'error');
          setBusy(true);
          try {
            const { confirm: _c, ...data } = f;
            void _c;
            const res = await api.createCompany(data);
            if (demo) {
              try {
                await api.call('loadDemoData');
              } catch (err) {
                notify(`ما انضافت البيانات التجريبية: ${(err as Error).message}`, 'error');
              }
            }
            onCreated(res.recoveryCode);
          } catch (err) {
            notify((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3 className="wide">2. بيانات الشركة</h3>
        <Field label="اسم الشركة / المحل" wide>
          <input value={f.name} onChange={set('name')} />
        </Field>
        <Field label="العملة الأساسية للحسابات">
          <select value={f.baseCurrency} onChange={set('baseCurrency')}>
            <option value="SYP">ليرة سورية جديدة</option>
            <option value="USD">دولار أمريكي</option>
          </select>
        </Field>
        <Field label="الهاتف">
          <input value={f.phone} onChange={set('phone')} dir="ltr" />
        </Field>
        <Field label="العنوان" wide>
          <input value={f.address} onChange={set('address')} />
        </Field>
        <h3 className="wide">3. حساب المالك</h3>
        <Field label="اسمك">
          <input value={f.ownerName} onChange={set('ownerName')} />
        </Field>
        <Field label="اسم الدخول">
          <input value={f.username} onChange={set('username')} dir="ltr" />
        </Field>
        <Field label="كلمة السر (6 أحرف على الأقل)">
          <input type="password" value={f.password} onChange={set('password')} />
        </Field>
        <Field label="تأكيد كلمة السر">
          <input type="password" value={f.confirm} onChange={set('confirm')} />
        </Field>
        <label className="check wide demo-check">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          <span>
            <strong>عبّي بيانات تجريبية للعرض</strong>
            <small className="muted"> — منيو وطاولات وطلبات للمطعم، أو زبائن وأتواب وطلبيات للخياطة... (لشركة تجريبية، مو لشركتك الحقيقية)</small>
          </span>
        </label>
        <div className="form-actions wide">
          <button className="primary big" disabled={busy}>
            إنشاء الشركة
          </button>
        </div>
      </form>
    </section>
  );
}

function LoginDialog({ peek, onClose, notify, onOpened }: { peek: CompanyPeek; onClose: () => void; notify: (m: string, k?: 'ok' | 'error') => void; onOpened: () => Promise<void> }) {
  const [username, setUsername] = useState(peek.usernames[0] ?? '');
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`الدخول إلى: ${peek.name}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const s = await api.login(peek.dir, recovery !== null ? { recoveryCode: recovery } : { username, password });
            if (s.recoveredTail) notify('تم إصلاح عملية لم تكتمل بسبب انقطاع مفاجئ. باقي البيانات سليمة.');
            await onOpened();
          } catch (err) {
            notify((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        {recovery === null ? (
          <>
            <Field label="المستخدم" wide>
              <select value={username} onChange={(e) => setUsername(e.target.value)}>
                {peek.usernames.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="كلمة السر" wide>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
            <button type="button" className="link wide" onClick={() => setRecovery('')}>
              نسيت كلمة السر؟ الدخول برمز الاسترداد
            </button>
          </>
        ) : (
          <Field label="رمز الاسترداد" wide>
            <input dir="ltr" className="mono" value={recovery} onChange={(e) => setRecovery(e.target.value)} autoFocus placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" />
          </Field>
        )}
        <div className="form-actions wide">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy}>
            دخول
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConnectForm({ info, notify, onConnected }: { info: AppInfo; notify: (m: string, k?: 'ok' | 'error') => void; onConnected: () => Promise<void> }) {
  const [f, setF] = useState({ host: info.lastRemote?.host ?? '', port: String(info.lastRemote?.port ?? 47100), pairingCode: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.lanConnect({ ...f, port: Number(f.port) || 47100 });
          await onConnected();
        } catch (err) {
          notify((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted wide">على الجهاز الرئيسي: الإعدادات ← الشبكة المحلية ← تفعيل وضع الخادم. ستجد هناك العنوان ورمز الربط.</p>
      <Field label="عنوان الجهاز الرئيسي (IP)">
        <input dir="ltr" value={f.host} onChange={set('host')} placeholder="192.168.1.10" />
      </Field>
      <Field label="المنفذ">
        <input dir="ltr" value={f.port} onChange={set('port')} />
      </Field>
      <Field label="رمز الربط">
        <input dir="ltr" className="mono" value={f.pairingCode} onChange={set('pairingCode')} placeholder="XXXX-XXXX" />
      </Field>
      <Field label="اسم المستخدم">
        <input dir="ltr" value={f.username} onChange={set('username')} />
      </Field>
      <Field label="كلمة السر" wide>
        <input type="password" value={f.password} onChange={set('password')} />
      </Field>
      <div className="form-actions wide">
        <button className="primary" disabled={busy || !f.host || !f.pairingCode || !f.username}>
          اتصال
        </button>
      </div>
    </form>
  );
}
