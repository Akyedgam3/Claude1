// «التنبيهات»: كل شي بدو انتباه اليوم بمكان واحد (نواقص، صلاحية، ديون وأقساط متأخرة، مصاريف ثابتة، بيع تحت الكلفة...).
// كل تنبيه بيبيّن أمثلة وزر بيفتح الشاشة اللي بتنحلّ منها. المستخدم بيشوف بس اللي معه صلاحيته.
import { alertsFor, type AppAlert, type CompanyState } from '../../../core';
import { today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/ui';

/** التنبيهات اللي بيشوفها هالمستخدم (للعدّاد بالقائمة والرئيسية كمان) */
export function useAlerts(): AppAlert[] {
  const { state, can } = useCompany();
  return visibleAlerts(state, can);
}
// نفس الحالة ونفس اليوم = نفس التنبيهات (القائمة بترسم كتير، والحساب بيلف على المخزون والديون)
const cache = new WeakMap<CompanyState, { day: string; list: AppAlert[] }>();
export function visibleAlerts(state: CompanyState, can: (p: AppAlert['perm']) => boolean): AppAlert[] {
  const day = today();
  let hit = cache.get(state);
  if (!hit || hit.day !== day) {
    let list: AppAlert[] = [];
    try {
      list = alertsFor(state, day);
    } catch {
      /* التنبيهات مساعدة بس: ما بتوقّف البرنامج */
    }
    hit = { day, list };
    cache.set(state, hit);
  }
  return hit.list.filter((a) => can(a.perm));
}

const LEVEL: Record<AppAlert['level'], { label: string; icon: string }> = {
  bad: { label: 'لازم تنتبهلها', icon: 'warning' },
  warn: { label: 'انتبه', icon: 'bell' },
  info: { label: 'للعلم', icon: 'message' },
};

export function Alerts() {
  const { navigate } = useCompany();
  const alerts = useAlerts();
  const groups = (['bad', 'warn', 'info'] as const).map((lv) => ({ lv, list: alerts.filter((a) => a.level === lv) })).filter((g) => g.list.length);

  return (
    <div className="page alerts">
      <PageHeader title="التنبيهات" />
      <p className="muted">كل شي بدو انتباهك اليوم: النواقص، الصلاحية، الديون والأقساط المتأخرة، المصاريف الثابتة، والبيع تحت الكلفة. بتتحدّث لحالها مع كل عملية.</p>
      {alerts.length === 0 ? (
        <section className="card alerts-clear">
          <span className="alerts-clear-icon">
            <Icon name="check" size={30} />
          </span>
          <h3>كل شي تمام 👍</h3>
          <p className="muted">ما في شي بدو انتباه هلق. وزن بيراقب المخزون والديون والمصاريف وبيخبّرك هون أول بأول.</p>
        </section>
      ) : (
        groups.map((g) => (
          <section key={g.lv} className="alerts-group">
            <h3 className={`alerts-level ${g.lv}`}>
              <Icon name={LEVEL[g.lv].icon} size={16} /> {LEVEL[g.lv].label} ({g.list.length})
            </h3>
            <div className="alerts-list">
              {g.list.map((a) => (
                <article key={a.id} className={`card alert-card ${a.level}`} data-alert={a.id}>
                  <h4>{a.title}</h4>
                  <ul>
                    {a.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                    {a.more > 0 && <li className="muted">و{a.more} غيرهم…</li>}
                  </ul>
                  <button className="small" onClick={() => navigate(a.screen)}>
                    {a.action} <Icon name="next" size={14} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
