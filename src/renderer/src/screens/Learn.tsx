// «تعلّم وزن»: خطوات البداية (بتتعلّم لحالها من بيانات الشركة)، نصيحة اليوم، دليل الاستخدام كامل
// (نفس مواضيع المساعد مقسّمة وفيها بحث)، اختصارات الكيبورد، وفيديوهات الشرح.
import { useMemo, useState } from 'react';
import type { CompanyState } from '../../../core';
import { api, IS_MOBILE, useCompany } from '../api';
import { openAssistant } from '../assistant/Assistant';
import { TOPICS } from '../assistant/knowledge';
import type { Topic } from '../assistant/engine';
import { Icon } from '../components/icons';
import { PageHeader, normalize } from '../components/ui';
import { NAV, navAllowed, type NavItem } from '../nav';

/** أقسام الدليل: كل قسم بيبلّش من أول موضوع فيه (بنفس ترتيب مواضيع المساعد) */
const GROUP_STARTS: { id: string; title: string; icon: string }[] = [
  { id: 'sale', title: 'البيع', icon: 'pos' },
  { id: 'purchase', title: 'الشراء والمواد', icon: 'package' },
  { id: 'add-party', title: 'الزباين والديون والسندات', icon: 'debts' },
  { id: 'profit', title: 'التقارير', icon: 'reports' },
  { id: 'add-employee', title: 'الموظفين والشركاء', icon: 'users' },
  { id: 'backup', title: 'الإعدادات والحماية', icon: 'settings' },
  { id: 'restaurant', title: 'حسب نوع شغلك', icon: 'store' },
  { id: 'zero-box', title: 'ميزات جديدة', icon: 'sparkles' },
];

export function topicGroups(): { title: string; icon: string; topics: Topic[] }[] {
  const out: { title: string; icon: string; topics: Topic[] }[] = [];
  for (const t of TOPICS) {
    const g = GROUP_STARTS.find((s) => s.id === t.id);
    if (g || !out.length) out.push({ title: g?.title ?? 'عام', icon: g?.icon ?? 'file', topics: [] });
    out[out.length - 1]!.topics.push(t);
  }
  return out;
}

const SHORTCUTS: [string, string][] = [
  ['F2', 'فاتورة مبيع'],
  ['F3', 'نقطة البيع'],
  ['F4', 'فاتورة شراء'],
  ['F6', 'المواد'],
  ['F7', 'العملاء والموردون'],
  ['F8', 'التقارير'],
  ['F9', 'الديون (وبيومية الصندوق: تسجيل)'],
  ['F10', 'الصندوق'],
  ['Ctrl+K', 'بحث سريع عن أي شي'],
  ['Ctrl+J', 'المساعد'],
  ['Enter', 'بالفاتورة: للسطر الجاي'],
];

const TIPS = [
  'بالفاتورة اكبس على المجموع واكتب المبلغ اللي بدك ياه، فبيحسبلك السعر لحالو.',
  'من «لوحة الإدارة» بتعرف أقوى يوم بيع وساعة الذروة، فبتجهّز الكاشير والبضاعة بوقتها.',
  'اعمل نسخة احتياطية كل أسبوع عالأقل (الإعدادات ← النسخ الاحتياطي)، أو اربط Google Drive فبتنعمل لحالها.',
  'لكل موظف حساب بصلاحياته: الكاشير ما بيشوف سعر الشراء والأرباح إذا ما بدك.',
  '«قوائم الأسعار» بتخليك تعطي كل زبون سعره (جملة، نص جملة، وكيل) بدون ما تحسب كل مرة.',
  'كبسة على أي حركة بالصندوق أو بكشف الحساب بتفتحلك مستندها لتشوفه أو تعدّله.',
  'إذا ما بدك تحرّك البضاعة هلق، احفظ الفاتورة «كمسودة» وكمّلها بعدين.',
  'يومية الصندوق بتسجّل كذا قبض ودفع بكبسة وحدة (F9).',
  'من الإعدادات ← «فحص البيانات» بتتأكد إنو حساباتك ومخزونك مظبوطين.',
  'بتقدر تشوف محلك من جوالك وإنت بالبيت بالاتصال عن بعد.',
  'خصّص الشاشة الرئيسية: اختار الأزرار والأرقام اللي بتهمك إنت.',
  'اسأل المساعد بأي طريقة بتحكيها: «شقد بعت اليوم؟»، «شو عليه محمد؟».',
];

interface Step {
  id: string;
  title: string;
  hint: string;
  screen: string;
  done: (s: CompanyState) => boolean;
}

const STEPS: Step[] = [
  { id: 'info', title: 'بيانات محلك وشعارك', hint: 'الاسم والعنوان والهاتف والشعار بيطلعوا على الفواتير.', screen: 'settings', done: (s) => !!(s.info?.print?.logo || s.info?.phone || s.info?.address) },
  { id: 'items', title: 'ضيف موادك', hint: 'باليد، أو من ملف Excel دفعة وحدة.', screen: 'items', done: (s) => Object.values(s.items).some((i) => !i.archived) },
  { id: 'parties', title: 'ضيف زبون أو مورد', hint: 'حتى تبيع بالدين وتتابع كشف حسابه.', screen: 'parties', done: (s) => Object.values(s.parties).some((p) => !p.archived) },
  { id: 'purchase', title: 'دخّل بضاعتك', hint: 'فاتورة شراء، أو رصيد افتتاحي من الجرد.', screen: 'purchase', done: (s) => s.invoices.some((i) => i.kind === 'purchase') || s.adjustments.some((a) => a.kind === 'opening') },
  { id: 'sale', title: 'أول فاتورة مبيع', hint: 'من فاتورة مبيع (F2) أو نقطة البيع (F3).', screen: 'sale', done: (s) => s.invoices.some((i) => i.kind === 'sale') },
  { id: 'voucher', title: 'سجّل مصروف أو قبض', hint: 'إيجار، كهربا، أو دفعة من زبون.', screen: 'vouchers', done: (s) => s.entries.some((e) => e.source?.type === 'voucher') },
  { id: 'users', title: 'حساب للكاشير', hint: 'كل موظف باسمه وصلاحياته.', screen: 'users', done: (s) => Object.keys(s.users).length > 1 },
  { id: 'management', title: 'افتح لوحة الإدارة', hint: 'شوف شغلك كله: الربح، الأفضل، والذروة.', screen: 'management', done: () => seen('management') },
];

const seen = (k: string) => {
  try {
    return localStorage.getItem('wazn.learn.' + k) === '1';
  } catch {
    return false;
  }
};
export const markSeen = (k: string) => {
  try {
    localStorage.setItem('wazn.learn.' + k, '1');
  } catch {
    /* ما في تخزين */
  }
};

/** خطوات البداية المسموحة لهالمستخدم، وقديش خلص منها */
export function useStartSteps() {
  const { state, can, feature, user } = useCompany();
  const allowed = (key: string) => {
    const n = NAV.find((x): x is NavItem => typeof x !== 'string' && x.key === key);
    return !n || navAllowed(n, { can, feature, user });
  };
  const steps = STEPS.filter((s) => allowed(s.screen)).map((s) => ({ ...s, ok: s.done(state) }));
  return { steps, done: steps.filter((s) => s.ok).length };
}

export function Learn() {
  const { navigate, can, feature, user } = useCompany();
  const { steps, done } = useStartSteps();
  const groups = useMemo(topicGroups, []);
  const [group, setGroup] = useState(-1);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const allowedScreen = (key: string) => {
    const n = NAV.find((x): x is NavItem => typeof x !== 'string' && x.key === key);
    return !n || navAllowed(n, { can, feature, user });
  };
  const tip = TIPS[Math.floor(Date.now() / 86_400_000) % TIPS.length]!;
  const q = normalize(query.trim());
  const shown = groups
    .map((g, i) => ({ ...g, i, topics: g.topics.filter((t) => (group < 0 || group === i) && (!q || normalize(`${t.q} ${t.keys.join(' ')} ${t.a}`).includes(q))) }))
    .filter((g) => g.topics.length);
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 100;

  return (
    <div className="page learn">
      <PageHeader title="تعلّم وزن">
        <button onClick={openAssistant}>
          <Icon name="sparkles" size={16} /> اسأل المساعد
        </button>
        <button onClick={() => void api.openVideos().catch(() => undefined)}>
          <Icon name="eye" size={16} /> فيديوهات الشرح
        </button>
      </PageHeader>

      <div className="learn-top">
        <section className="card learn-start">
          <div className="learn-start-head">
            <div className="learn-ring" style={{ ['--p' as string]: `${pct}` }} aria-label={`خلصت ${done} من ${steps.length}`}>
              <b>{done}</b>
              <small>من {steps.length}</small>
            </div>
            <div>
              <h3>{done === steps.length ? 'خلّصت خطوات البداية 👏' : 'خطوات البداية'}</h3>
              <p className="muted">{done === steps.length ? 'محلك جاهز بالكامل. تحت في دليل لكل شي بالبرنامج.' : 'كمّلها بالترتيب، وكل خطوة بتتعلّم لحالها لما تعملها.'}</p>
            </div>
          </div>
          <ol className="learn-steps">
            {steps.map((s) => (
              <li key={s.id} className={s.ok ? 'ok' : ''}>
                <span className="learn-check">{s.ok ? <Icon name="check" size={14} /> : null}</span>
                <div>
                  <b>{s.title}</b>
                  <small className="muted">{s.hint}</small>
                </div>
                <button
                  className={s.ok ? 'ghost small' : 'primary small'}
                  onClick={() => {
                    if (s.id === 'management') markSeen('management');
                    navigate(s.screen);
                  }}
                >
                  {s.ok ? 'افتح' : 'يلا'}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <div className="learn-side">
          <section className="card learn-tip">
            <h3>
              <Icon name="sparkles" size={18} /> نصيحة اليوم
            </h3>
            <p>{tip}</p>
          </section>
          {!IS_MOBILE && (
            <section className="card">
              <h3>اختصارات الكيبورد</h3>
              <ul className="learn-keys">
                {SHORTCUTS.map(([k, v]) => (
                  <li key={k}>
                    <kbd>{k}</kbd>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section className="card learn-guide">
        <div className="learn-guide-head">
          <h3>دليل الاستخدام ({TOPICS.length} موضوع)</h3>
          <input className="learn-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="دوّر: فاتورة، دين، باركود، نسخة احتياطية…" />
        </div>
        <div className="learn-chips" role="group" aria-label="الأقسام">
          <button type="button" className={group < 0 ? 'active' : ''} onClick={() => setGroup(-1)}>
            الكل
          </button>
          {groups.map((g, i) => (
            <button key={g.title} type="button" className={group === i ? 'active' : ''} onClick={() => setGroup(i)}>
              <Icon name={g.icon} size={14} /> {g.title}
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="muted">ما لقيت شي. جرّب كلمة تانية، أو اسأل المساعد.</p>}
        {shown.map((g) => (
          <div key={g.title} className="learn-group">
            <h4>
              <Icon name={g.icon} size={16} /> {g.title}
            </h4>
            <div className="learn-topics">
              {g.topics.map((t) => (
                <details key={t.id} open={open === t.id || (!!q && g.topics.length <= 3)} onToggle={(e) => (e.currentTarget.open ? setOpen(t.id) : open === t.id && setOpen(null))}>
                  <summary>{t.q}</summary>
                  <div className="learn-answer">
                    {t.a.split('\n').map((line, i) =>
                      line.includes('←') ? (
                        <ol key={i} className="learn-flow">
                          {line.split('←').map((p, j) => (
                            <li key={j}>{p.trim()}</li>
                          ))}
                        </ol>
                      ) : (
                        <p key={i}>{line}</p>
                      ),
                    )}
                    {t.go && t.go.filter((l) => allowedScreen(l.screen)).length > 0 && (
                      <div className="learn-go">
                        {t.go
                          .filter((l) => allowedScreen(l.screen))
                          .map((l) => (
                            <button key={l.screen + (l.param ?? '')} className="small" onClick={() => navigate(l.screen, l.param)}>
                              افتح «{l.label}»
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/** بطاقة بالرئيسية للشركات الجديدة: قديش خلص من خطوات البداية */
export function StartBanner() {
  const { navigate } = useCompany();
  const { steps, done } = useStartSteps();
  const [hidden, setHidden] = useState(() => seen('banner-hidden'));
  if (hidden || !steps.length || done >= steps.length) return null;
  return (
    <section className="card learn-banner">
      <div className="learn-ring sm" style={{ ['--p' as string]: `${Math.round((done / steps.length) * 100)}` }}>
        <b>{done}</b>
        <small>من {steps.length}</small>
      </div>
      <div>
        <b>كمّل خطوات البداية</b>
        <small className="muted">الخطوة الجاية: {steps.find((s) => !s.ok)?.title}</small>
      </div>
      <button className="primary small" onClick={() => navigate('learn')}>
        تعلّم وزن
      </button>
      <button
        className="icon"
        title="إخفاء"
        onClick={() => {
          markSeen('banner-hidden');
          setHidden(true);
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </section>
  );
}
