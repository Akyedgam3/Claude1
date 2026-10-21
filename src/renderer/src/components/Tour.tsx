import { useEffect, useLayoutEffect, useState } from 'react';
import { useCompany } from '../api';
import { Icon } from './icons';

// جولة تعريفية سريعة: بتنعرض مرة وحدة لكل مستخدم على هالجهاز، وبتنعاد من الإعدادات.

interface Step {
  target?: string; // محدّد العنصر اللي منأشّر عليه؛ بدونه البطاقة بالنص
  title: string;
  text: string;
}

const STEPS: Step[] = [
  { title: 'أهلاً بك في وزن', text: 'جولة سريعة من 10 خطوات تعرّفك على أهم أقسام البرنامج. يمكنك تخطّيها في أي وقت وإعادتها لاحقاً من الإعدادات.' },
  { target: '[data-tour="search"]', title: 'البحث السريع', text: 'اضغط Ctrl+K من أي مكان وابحث عن مادة أو زبون أو فاتورة أو أي شاشة في البرنامج.' },
  { target: '[data-nav="dashboard"]', title: 'الشاشة الرئيسية', text: 'ملخّص يومك: المبيعات، الأرباح، النقد في الصندوق والديون. اضغط على أي بطاقة لتفتح تفاصيلها.' },
  { target: '[data-nav="pos"], [data-nav="restaurant"]', title: 'البيع السريع', text: 'نقطة البيع للبيع بالباركود أو بالضغط على المواد، مع حساب الباقي للزبون وطباعة الإيصال. اختصارها F3.' },
  { target: '[data-nav="sale"]', title: 'فاتورة المبيع', text: 'فاتورة كاملة باسم الزبون، مع الخصم والضريبة، واختيار القبض نقداً أو تسجيلها ديناً عليه. اختصارها F2.' },
  { target: '[data-nav="purchase"]', title: 'فاتورة الشراء', text: 'سجّل بضاعتك من الموردين فتدخل المخزون تلقائياً، واختر «خصم من الصندوق» أو «دون خصم» لتصبح ديناً للمورد. اختصارها F4.' },
  { target: '[data-nav="items"]', title: 'المواد', text: 'أضف موادك بأسعارها وعملتها، أو استوردها من ملف Excel دفعة واحدة. هنا ترى الكميات والنواقص. اختصارها F6.' },
  { target: '[data-nav="debts"]', title: 'الديون', text: 'كل ما لك وما عليك في مكان واحد: ديون الفواتير والديون المباشرة، مع مواعيد السداد ورسائل التذكير. اختصارها F9.' },
  { target: '[data-nav="reports"]', title: 'التقارير', text: 'الأرباح والخسائر، حركة الصندوق، أرباح كل مادة، وتقرير إغلاق اليوم. اختصارها F8.' },
  { target: '[data-nav="settings"]', title: 'الإعدادات والنسخ الاحتياطي', text: 'شعارك وتصميم الفاتورة والمستخدمين، ولا تنسَ أخذ نسخة احتياطية بانتظام. من هنا أيضاً تعيد هذه الجولة.' },
];

const DONE_KEY = (company: string, userId: string) => `mizan.tour.v1.${company}.${userId}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // ما في تخزين: الجولة بترجع تطلع المرة الجاية، مش مشكلة
  }
}

export function startTour(): void {
  window.dispatchEvent(new Event('mizan-tour'));
}

export function Tour() {
  const { state, user, navigate } = useCompany();
  const key = DONE_KEY(state.info?.name ?? '', user.id);
  const [open, setOpen] = useState(() => !read(key) && !read('mizan.tour.off'));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // الخطوات اللي عنصرها مش ظاهر لهالمستخدم (صلاحيات أو نشاط مختلف) منتخطّاها
  const steps = STEPS.filter((s) => !s.target || document.querySelector(s.target));
  const step = steps[Math.min(i, steps.length - 1)]!;

  useEffect(() => {
    const again = () => {
      setI(0);
      setOpen(true);
      navigate('dashboard');
    };
    window.addEventListener('mizan-tour', again);
    return () => window.removeEventListener('mizan-tour', again);
  }, [navigate]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ block: 'nearest' });
    const update = () => setRect(el ? el.getBoundingClientRect() : null);
    update();
    // القائمة ممكن تتمرّر بنعومة: منتابع مكان العنصر لحتى يوقف
    const t = setTimeout(update, 400);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowLeft' || e.key === 'Enter') next();
      else if (e.key === 'ArrowRight') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;
  const last = i >= steps.length - 1;
  const finish = () => {
    write(key);
    setOpen(false);
  };
  const next = () => (last ? finish() : setI(i + 1));

  // البطاقة جنب العنصر (القائمة عاليمين، فمنحطها عشمالو)، أو بالنص
  const W = 360;
  const style: React.CSSProperties = rect
    ? { top: Math.max(16, Math.min(rect.top - 8, window.innerHeight - 260)), left: Math.max(16, rect.left - W - 20), width: W }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: W + 60 };

  return (
    <div className="tour" role="dialog" aria-label="جولة تعريفية">
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={style}>
        <div className="tour-progress">
          {steps.map((_, n) => (
            <span key={n} className={n === i ? 'on' : n < i ? 'done' : ''} />
          ))}
        </div>
        <h3>
          {!step.target && <Icon name="sparkles" size={18} />} {step.title}
        </h3>
        <p>{step.text}</p>
        <div className="tour-actions">
          <span className="muted">
            {i + 1} / {steps.length}
          </span>
          <span className="button-row">
            {!last && (
              <button className="ghost" onClick={finish}>
                تخطّي الجولة
              </button>
            )}
            {i > 0 && <button onClick={() => setI(i - 1)}>السابق</button>}
            <button className="primary" autoFocus onClick={next}>
              {last ? 'ابدأ العمل' : i === 0 ? 'لنبدأ' : 'التالي'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
