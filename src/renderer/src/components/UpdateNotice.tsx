import { useEffect, useState } from 'react';
import type { LicenseStatus } from '../../../license/manager';
import { api, IS_MOBILE } from '../api';
import { Icon } from './icons';

type Update = NonNullable<LicenseStatus['update']>;

const KEY = 'mizan.update.dismissed';
function dismissedVersion(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * إعلان نسخة جديدة: نافذة مرة وحدة لكل نسخة، وبعدها زر صغير بالقائمة.
 * إذا التحديث إجباري (نسخة المستخدم أقدم من الحد الأدنى) ما بتنسكر النافذة.
 */
export function UpdateNotice({ update, current, notify, floating }: { update: Update | undefined; current: string; notify: (m: string, k?: 'error') => void; floating?: boolean }) {
  const [hidden, setHidden] = useState(() => dismissedVersion());
  const [open, setOpen] = useState(false);
  // الجوال بينزّل التحديث بحالو: نسبة التنزيل، وإذا لازم يسمح بالتنصيب، وإذا صار خطأ
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'permission' | 'installing' | 'error' | null>(null);
  useEffect(() => {
    if (!IS_MOBILE) return;
    const off = api.on('update:progress', (p) => setProgress(p as { done: number; total: number } | null));
    return () => void off();
  }, []);
  if (!update) return null;
  const show = update.mandatory || open || hidden !== update.version;
  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.openUpdate();
      if (r === 'permission' || r === 'installing') setState(r);
    } catch (e) {
      notify((e as Error).message, 'error');
      if (IS_MOBILE) setState('error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const mb = (n: number) => (n / 1048576).toFixed(1);
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, update.version);
    } catch {
      // ما في مشكلة، رح تطلع مرة تانية بس
    }
    setHidden(update.version);
    setOpen(false);
  };
  return (
    <>
      <button className={floating ? 'update-chip floating' : 'update-chip'} onClick={() => setOpen(true)}>
        <Icon name="download" size={16} /> تحديث جديد {update.version}
      </button>
      {show && (
        <div className="modal-backdrop update-backdrop">
          <div className="modal update-modal" role="dialog" aria-label="تحديث جديد">
            <div className="update-head">
              <Icon name="sparkles" size={34} />
              <div>
                <h3>{update.mandatory ? 'لازم تحدّث البرنامج' : 'في نسخة جديدة من وزن'}</h3>
                <small>
                  نسختك {current} ← النسخة الجديدة <b>{update.version}</b>
                </small>
              </div>
            </div>
            {update.notes.length > 0 && (
              <>
                <div className="update-title">شو الجديد؟</div>
                <ul className="update-notes">
                  {update.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </>
            )}
            {update.mandatory && <div className="banner bad">هالنسخة صارت قديمة وما بتشتغل. نزّل التحديث ونصّبه، وبياناتك بتضل محفوظة متل ما هي.</div>}
            {IS_MOBILE ? (
              <>
                {progress ? (
                  <div className="update-progress">
                    <div className="bar">
                      <i style={{ width: progress.total > 0 ? `${Math.min(100, (progress.done / progress.total) * 100)}%` : '30%' }} />
                    </div>
                    <small>
                      عم ينزل التحديث… {mb(progress.done)}
                      {progress.total > 0 ? ` من ${mb(progress.total)}` : ''} ميغا
                    </small>
                  </div>
                ) : state === 'permission' ? (
                  <div className="banner">أول مرة بس: فعّل «السماح من هذا المصدر» لوزن، وارجع اضغط «تنصيب التحديث».</div>
                ) : state === 'installing' ? (
                  <p className="muted">اضغط «تحديث» أو «تثبيت» بالشاشة اللي طلعت. بياناتك بتضل متل ما هي.</p>
                ) : (
                  <p className="muted">التطبيق بينزّل التحديث ويتأكد منه، وبعدين بينصّبه فوق النسخة الحالية. بياناتك ما بتتأثر.</p>
                )}
              </>
            ) : (
              <p className="muted">نزّل ملف التنصيب وشغّله فوق البرنامج الحالي، بياناتك ما بتتأثر.</p>
            )}
            <div className="actions">
              <button className="primary" onClick={() => void download()} disabled={busy}>
                <Icon name="download" size={16} /> {IS_MOBILE && (state === 'permission' || state === 'installing') ? 'تنصيب التحديث' : busy ? 'عم ينزل…' : 'تحميل التحديث'}
              </button>
              {IS_MOBILE && state === 'error' && (
                <button className="ghost" onClick={() => void api.openUpdatePage().catch(() => undefined)}>
                  تحميل من الموقع
                </button>
              )}
              {!update.mandatory && (
                <button className="ghost" onClick={dismiss}>
                  لاحقاً
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
