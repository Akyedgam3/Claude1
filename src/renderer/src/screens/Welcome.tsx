import { useEffect, useState } from 'react';
import { ACTIVITIES, type Activity } from '../../../core';
import logo from '../assets/logo.png';
import { Icon } from '../components/icons';
import { ActivityPicker } from '../components/ActivityPicker';
import { api, IS_MOBILE, IS_WEB, type AppInfo, type CompanyPeek, type DriveBackupFile } from '../api';
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
  const [driveOk, setDriveOk] = useState(false);
  const [drivePick, setDrivePick] = useState(false);
  useEffect(() => {
    if (!IS_MOBILE) api.driveStatus().then((d) => setDriveOk(d.available)).catch(() => setDriveOk(false));
  }, []);
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

      <div className="segmented center welcome-tabs">
        <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>
          فتح شركة
        </button>
        <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
          شركة جديدة
        </button>
        {!IS_WEB && (
          <button className={tab === 'connect' ? 'active' : ''} onClick={() => setTab('connect')}>
            على نفس الشبكة
          </button>
        )}
        <button className={tab === 'cloud' ? 'active' : ''} onClick={() => setTab('cloud')}>
          اتصال عن بعد
        </button>
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
            {driveOk && <button onClick={() => setDrivePick(true)}>استعادة من Google Drive</button>}
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

      {drivePick && (
        <DriveRestore
          notify={notify}
          onClose={() => setDrivePick(false)}
          onRestored={(p) => {
            setDrivePick(false);
            notify('تم تنزيل النسخة من Google Drive. سجّل الدخول لفتحها.');
            setLogin(p);
          }}
        />
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

/** استعادة من Google Drive: ربط (إذا مش مربوط) ← قائمة النسخ ← تنزيل وفتح. */
function DriveRestore({ notify, onClose, onRestored }: { notify: (m: string, k?: 'ok' | 'error') => void; onClose: () => void; onRestored: (p: CompanyPeek) => void }) {
  const [files, setFiles] = useState<DriveBackupFile[] | null>(null);
  const [busy, setBusy] = useState('');
  const load = async () => {
    setBusy('list');
    try {
      const st = await api.driveStatus();
      if (!st.linked) {
        setBusy('link');
        await api.driveLink();
      }
      setBusy('list');
      setFiles(await api.driveList());
    } catch (e) {
      notify((e as Error).message, 'error');
      onClose();
    } finally {
      setBusy('');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <Modal title="استعادة من Google Drive" onClose={onClose}>
      {busy === 'link' && <p>كمّل تسجيل الدخول بحساب Google بالمتصفح، وبعدين ارجع لهون.</p>}
      {busy === 'list' && <p className="muted">عم جيب النسخ...</p>}
      {files && files.length === 0 && <p className="muted">ما في نسخ من وزن على هالحساب.</p>}
      {files && files.length > 0 && (
        <ul className="recent drive-files">
          {files.slice(0, 60).map((f) => (
            <li key={f.id}>
              <button
                disabled={!!busy}
                onClick={async () => {
                  setBusy(f.id);
                  try {
                    onRestored(await api.driveRestore(f.id));
                  } catch (e) {
                    notify((e as Error).message, 'error');
                  } finally {
                    setBusy('');
                  }
                }}
              >
                <strong>{f.companyName || f.name}</strong>
                <small dir="ltr">
                  {new Date(f.createdTime).toLocaleString('en-GB')} · {(f.size / 1024).toFixed(0)} KB{busy === f.id ? ' · ...' : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="form-actions">
        <button onClick={onClose}>إغلاق</button>
      </div>
    </Modal>
  );
}

function NewCompany({ notify, onCreated }: { notify: (m: string, k?: 'ok' | 'error') => void; onCreated: (recovery: string) => void }) {
  const [f, setF] = useState({ name: '', activity: '', baseCurrency: 'SYP', phone: '', address: '', ownerName: '', username: 'admin', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  // معالج بخطوات: 1 النشاط، 2 بيانات المحل، 3 حساب المالك
  const [step, setStep] = useState(1);
  const [picking, setPicking] = useState(false);
  const [draftAct, setDraftAct] = useState('general');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const act = f.activity ? ACTIVITIES[f.activity as Activity] : null;
  const STEPS = ['نشاطك', 'بيانات المحل', 'حسابك'];

  const create = async () => {
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
  };

  return (
    <section className="card wizard">
      <ol className="wizard-steps" aria-label="الخطوات">
        {STEPS.map((t, i) => (
          <li key={t} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
            <span>{step > i + 1 ? <Icon name="check" size={14} /> : i + 1}</span>
            {t}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="wizard-body">
          <h3>شو نوع شغلك؟</h3>
          <p className="muted">اختار نشاطك، ووزن بيجهّزلك الشاشات والتصنيفات والميزات اللي بتلزمك.</p>
          <button
            type="button"
            className={`act-choose ${act ? 'picked' : ''}`}
            onClick={() => {
              setDraftAct(f.activity || 'general');
              setPicking(true);
            }}
          >
            {act ? (
              <>
                <span className="act-icon" style={{ background: act.color }}>
                  <Icon name={act.icon} size={22} />
                </span>
                <span className="act-text">
                  <b>{act.name}</b>
                  <small>{act.description}</small>
                </span>
                <span className="act-change">تغيير</span>
              </>
            ) : (
              <>
                <span className="act-icon empty">
                  <Icon name="search" size={20} />
                </span>
                <span className="act-text">
                  <b>اختار النشاط…</b>
                  <small>أكتر من 50 نشاط: سوبرماركت، مطعم، صيدلية، موبايلات، ألبسة…</small>
                </span>
              </>
            )}
          </button>
          <div className="wizard-actions">
            <button type="button" className="primary big" disabled={!act} onClick={() => setStep(2)}>
              التالي
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form
          className="wizard-body form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            if (!f.name.trim()) return notify('اكتب اسم الشركة أو المحل', 'error');
            setStep(3);
          }}
        >
          <h3 className="wide">بيانات المحل</h3>
          {act && (
            <p className="muted wide wizard-act">
              <Icon name={act.icon} size={16} /> {act.name}
            </p>
          )}
          <Field label="اسم الشركة / المحل" wide>
            <input value={f.name} onChange={set('name')} autoFocus placeholder="مثلاً: ماركت الشام" />
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
          <div className="wizard-actions wide">
            <button type="button" onClick={() => setStep(1)}>
              رجوع
            </button>
            <button className="primary big">التالي</button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form
          className="wizard-body form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h3 className="wide">حسابك (المالك)</h3>
          <Field label="اسمك">
            <input value={f.ownerName} onChange={set('ownerName')} autoFocus />
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
          <div className="wizard-actions wide">
            <button type="button" onClick={() => setStep(2)}>
              رجوع
            </button>
            <button className="primary big" disabled={busy}>
              إنشاء الشركة
            </button>
          </div>
        </form>
      )}

      {picking && (
        <Modal title="اختار نوع نشاطك" onClose={() => setPicking(false)} width={1000}>
          <div className="act-modal">
            <ActivityPicker value={draftAct} onChange={setDraftAct} />
            <div className="act-modal-foot">
              <button type="button" onClick={() => setPicking(false)}>
                إلغاء
              </button>
              <button
                type="button"
                className="primary big"
                onClick={() => {
                  setF({ ...f, activity: draftAct });
                  setPicking(false);
                  setStep(2);
                }}
              >
                كمّل بـ «{ACTIVITIES[draftAct as Activity]?.name}»
              </button>
            </div>
          </div>
        </Modal>
      )}
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
  const last = info.lastRemote;
  const [full, setFull] = useState(!last?.saved);
  const [f, setF] = useState({ host: last?.host ?? '', port: String(last?.port ?? 47100), pairingCode: '', username: last?.username ?? '', password: '' });
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ host: string; port: number; name: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const quick = !!last?.saved && !full;
  const search = async () => {
    setSearching(true);
    try {
      const r = await api.lanDiscover();
      setFound(r);
      if (r.length === 1) setF((x) => ({ ...x, host: r[0]!.host, port: String(r[0]!.port) }));
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  };
  // أول مرة: منفتّش لحالنا على الجهاز الرئيسي بالشبكة (الجوال ما بيقدر يدوّر، بيمسح QR من الكمبيوتر)
  useEffect(() => {
    if (!quick && !f.host && !IS_MOBILE) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.lanConnect(quick ? { saved: true, password: f.password } : { ...f, port: Number(f.port) || 47100 });
          await onConnected();
        } catch (err) {
          notify((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {quick ? (
        <div className="saved-conn wide">
          <Icon name="network" size={22} />
          <div>
            <b>{last!.name || 'الجهاز الرئيسي'}</b>
            <small>
              باسم <span dir="ltr">{last!.username}</span> · على نفس الشبكة
            </small>
          </div>
          <button type="button" className="ghost" onClick={() => setFull(true)}>
            جهاز تاني
          </button>
        </div>
      ) : (
        <>
          <p className="muted wide">على الكمبيوتر الرئيسي: الإعدادات ← الشبكة المحلية ← تفعيل وضع الخادم، وهناك بتلاقي رمز الربط{IS_MOBILE ? ' والـ QR' : ''}. بعد أول مرة بيكفي كلمة السر.</p>
          {IS_MOBILE && (
            <button
              type="button"
              className="primary wide lan-scan"
              onClick={async () => {
                try {
                  const v = await api.scanBarcode();
                  if (!v) return;
                  const m = /^wazn-lan:(.+)$/s.exec(v.trim());
                  if (!m) return notify('هاد مش QR الشبكة المحلية. امسح اللي بالكمبيوتر: الإعدادات ← الشبكة المحلية', 'error');
                  const d = JSON.parse(m[1]!) as { h: string[]; p: number; c: string };
                  setF((x) => ({ ...x, host: d.h.join(','), port: String(d.p), pairingCode: d.c }));
                  notify('تمام، هلق اكتب اسم المستخدم وكلمة السر');
                } catch (e) {
                  notify((e as Error).message, 'error');
                }
              }}
            >
              <Icon name="camera" size={18} /> مسح QR من الكمبيوتر
            </button>
          )}
          <div className={`lan-found wide ${IS_MOBILE ? 'hidden' : ''}`}>
            <button type="button" onClick={() => void search()} disabled={searching}>
              <Icon name="search" size={16} /> {searching ? 'عم يدوّر على الجهاز الرئيسي...' : 'بحث عن الجهاز الرئيسي بالشبكة'}
            </button>
            {found && found.length === 0 && !searching && <small className="muted">ما لقينا جهاز رئيسي. تأكد إنو وضع الخادم مفعّل عليه وإنكم على نفس الشبكة، أو اكتب عنوانه.</small>}
            {found?.map((h) => (
              <button type="button" key={`${h.host}:${h.port}`} className={f.host === h.host && f.port === String(h.port) ? 'on' : ''} onClick={() => setF({ ...f, host: h.host, port: String(h.port) })}>
                <Icon name="laptop" size={16} /> {h.name} <small dir="ltr">{h.host}</small>
              </button>
            ))}
          </div>
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
        </>
      )}
      <Field label="كلمة السر" wide>
        <input type="password" value={f.password} onChange={set('password')} autoFocus={quick} />
      </Field>
      <div className="form-actions wide">
        {full && last?.saved && (
          <button type="button" className="ghost" onClick={() => setFull(false)}>
            رجوع لـ {last.name || 'الجهاز المحفوظ'}
          </button>
        )}
        <button className="primary" disabled={busy || (!quick && (!f.host || !f.pairingCode || !f.username))}>
          {busy ? 'جاري الاتصال...' : 'اتصال'}
        </button>
      </div>
    </form>
  );
}
