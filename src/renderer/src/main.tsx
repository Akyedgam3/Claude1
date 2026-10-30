import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CustomerDisplay } from './components/CustomerDisplay';
import './styles.css';
import './mobile.css';
import { api, IS_MOBILE } from './api';

// ويندوز: أحياناً بعد نافذة نظام (طباعة، حفظ، تأكيد) الصفحة بتبطل تستلم الكتابة. إذا انكبس على الصفحة
// وهي مش ماسكة الكيبورد، منطلب من البرنامج يرجّع التركيز إلها (بدل ما يضطر الزبون يسكّر ويفتح).
if (!IS_MOBILE && location.hash !== '#customer') {
  let last = 0;
  document.addEventListener(
    'mousedown',
    () => {
      if (document.hasFocus() || Date.now() - last < 1000) return;
      last = Date.now();
      void api.refocus().catch(() => undefined);
    },
    true,
  );
}

// نفس الواجهة بتنفتح بنافذة شاشة الزبون (#customer) بس بتعرض شاشة العرض لحالها
createRoot(document.getElementById('root')!).render(location.hash === '#customer' ? <CustomerDisplay /> : <App />);
