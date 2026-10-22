import logo from '../assets/logo.png';
import { CloudConnectForm } from './CloudConnect';

/** نسخة الويب (آيفون): ما فيها بيانات محلية، بس اتصال عن بعد بجهاز المحل. */
export function WebConnect({ notify, onConnected }: { notify: (m: string, k?: 'ok' | 'error') => void; onConnected: () => Promise<void> }) {
  const nav = navigator as Navigator & { standalone?: boolean };
  const installed = nav.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return (
    <div className="welcome web-connect">
      <div className="welcome-hero">
        <img src={logo} alt="" className="hero-logo" />
        <div className="logo big">وزن</div>
        <p>اشتغل على بيانات محلك من جوالك من أي مكان. البيانات بتضل على جهاز المحل وبتمرق مشفّرة.</p>
      </div>
      <section className="card">
        <h3>اتصال عن بعد</h3>
        <CloudConnectForm notify={notify} onConnected={onConnected} />
      </section>
      {!installed && (
        <section className="card web-install">
          <h3>حطّه على الشاشة الرئيسية متل التطبيق</h3>
          {ios ? (
            <ol>
              <li>
                اكبس زر المشاركة <b>⎋</b> تحت بسفاري
              </li>
              <li>
                اختار <b>«إضافة إلى الشاشة الرئيسية»</b> (Add to Home Screen)
              </li>
              <li>افتح وزن من أيقونته بعد هيك</li>
            </ol>
          ) : (
            <p className="muted">من قائمة المتصفح اختار «إضافة إلى الشاشة الرئيسية». ولأندرويد في تطبيق وزن الكامل.</p>
          )}
        </section>
      )}
      <p className="muted center">هالنسخة للاتصال بمحل مفعّل عنده «الاتصال عن بعد». بتشتغل بترخيص المحل وما بتحتاج مفتاح.</p>
    </div>
  );
}
