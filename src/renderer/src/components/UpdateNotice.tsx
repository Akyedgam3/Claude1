import { useState } from 'react';
import type { LicenseStatus } from '../../../license/manager';
import { api } from '../api';
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
  if (!update) return null;
  const show = update.mandatory || open || hidden !== update.version;
  const download = () => api.openUpdate().catch((e: Error) => notify(e.message, 'error'));
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
                <h3>{update.mandatory ? 'لازم تحدّث البرنامج' : 'في نسخة جديدة من ميزان'}</h3>
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
            <p className="muted">نزّل ملف التنصيب وشغّله فوق البرنامج الحالي، بياناتك ما بتتأثر.</p>
            <div className="actions">
              <button className="primary" onClick={download}>
                <Icon name="download" size={16} /> تحميل التحديث
              </button>
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
