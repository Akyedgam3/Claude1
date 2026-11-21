// اختيار نوع النشاط: بحث، أقسام، بطاقات موحّدة، ولوحة «شو بيجهّزلك وزن» للنشاط المختار.
// بتنستعمل بإنشاء الشركة (مع اللوحة) وبالإعدادات (مختصرة).
import { useMemo, useState } from 'react';
import { ACTIVITIES, ACTIVITY_LIST, FEATURE_INFO, type Activity } from '../../../core';
import { Icon } from './icons';
import { normalize } from './ui';

const GROUPS: { id: string; title: string; ids: Activity[] }[] = [
  { id: 'retail', title: 'بيع بالتجزئة', ids: ['general', 'supermarket', 'clothing', 'perfumes', 'printshop'] },
  { id: 'food', title: 'أغذية ومطاعم', ids: ['restaurant', 'bakery', 'sweets', 'butcher', 'foodstuff', 'poultry'] },
  { id: 'tech', title: 'تقنية وكهرباء', ids: ['mobile', 'electrical', 'solar', 'auto'] },
  { id: 'health', title: 'صحة وخدمات', ids: ['pharmacy', 'pharmacydealers', 'clinic', 'tailor', 'weddinghall'] },
  { id: 'build', title: 'بناء وصناعة', ids: ['building', 'gypsum', 'stone', 'woodmill'] },
  { id: 'trade', title: 'جملة ونقل', ids: ['wholesale', 'customs'] },
];
/** الأكثر استعمالاً أول شي */
const POPULAR: Activity[] = ['general', 'supermarket', 'restaurant', 'mobile', 'clothing', 'pharmacy', 'foodstuff', 'electrical'];
/** كلمات بحث إضافية (شو بيكتب الناس) */
const ALIASES: Partial<Record<Activity, string>> = {
  general: 'محل دكان بقالية شركة خدمات',
  supermarket: 'ماركت ميني ماركت بقاليه دكان مواد غذائيه',
  restaurant: 'مطعم كافيه قهوه شاورما فلافل بيتزا وجبات',
  mobile: 'جوالات تلفونات كمبيوتر لابتوب صيانه موبايل',
  clothing: 'البسه احذيه بوتيك ملابس',
  pharmacy: 'دوا ادويه صيدليه',
  pharmacydealers: 'دوا ادويه مستودع ادويه',
  butcher: 'لحام ملحمه خضرجي خضره فواكه',
  bakery: 'فرن معجنات خبز حلويات',
  sweets: 'بوظه ايس كريم حلويات شرقيه',
  auto: 'سيارات ميكانيك كراج قطع غيار',
  building: 'حديد اسمنت بلوك مواد بناء',
  electrical: 'كهربا كاميرات تمديدات انارة',
  poultry: 'فروج دجاج مدجنه دواجن',
  wholesale: 'جمله مندوبين توزيع',
  tailor: 'خياط تفصيل ورشه خياطه',
  clinic: 'دكتور عياده صالون حلاقه تجميل',
  printshop: 'مكتبه قرطاسيه مطبعه فلكس تصوير',
};

export function ActivityPicker({ value, onChange, preview = true }: { value: string; onChange: (id: Activity) => void; preview?: boolean }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const q = normalize(query.trim());
  const list = useMemo(() => {
    const ordered = [...POPULAR, ...ACTIVITY_LIST.map((a) => a.id).filter((id) => !POPULAR.includes(id))].map((id) => ACTIVITIES[id]).filter(Boolean);
    const inGroup = group === 'all' ? ordered : ordered.filter((a) => GROUPS.find((g) => g.id === group)?.ids.includes(a.id));
    if (!q) return inGroup;
    return ordered.filter((a) => normalize(`${a.name} ${a.description} ${ALIASES[a.id] ?? ''}`).includes(q));
  }, [q, group]);
  const sel = ACTIVITIES[value as Activity] ?? ACTIVITIES.general;
  const feats = sel.features.map((f) => FEATURE_INFO[f]?.name).filter(Boolean) as string[];

  return (
    <div className={`act-picker ${preview ? 'with-preview' : ''}`}>
      <div className="act-main">
        <div className="act-tools">
          <span className="act-search">
            <Icon name="search" size={16} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="دوّر على نشاطك… (صيدلية، فروج، موبايلات)" aria-label="بحث عن النشاط" />
          </span>
          {!q && (
            <div className="act-groups" role="tablist" aria-label="الأقسام">
              <button type="button" role="tab" aria-selected={group === 'all'} className={group === 'all' ? 'on' : ''} onClick={() => setGroup('all')}>
                الكل
              </button>
              {GROUPS.map((g) => (
                <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={group === g.id ? 'on' : ''} onClick={() => setGroup(g.id)}>
                  {g.title}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="act-grid" role="radiogroup" aria-label="نوع النشاط">
          {list.length === 0 && <p className="muted act-empty">ما لقينا نشاط بهالاسم. اختار «تجارة عامة / خدمات» وفيك تشغّل الميزات اللي بدك ياها بعدين.</p>}
          {list.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={value === a.id} className={`act-card ${value === a.id ? 'on' : ''}`} onClick={() => onChange(a.id)}>
              <span className="act-icon" style={{ background: a.color }}>
                <Icon name={a.icon} size={20} />
              </span>
              <span className="act-text">
                <b>{a.name}</b>
                {!preview && <small>{a.description}</small>}
              </span>
              {value === a.id && (
                <span className="act-check" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {preview && (
        <aside className="act-preview" aria-live="polite">
          <span className="act-icon lg" style={{ background: sel.color }}>
            <Icon name={sel.icon} size={30} />
          </span>
          <h4>{sel.name}</h4>
          <p>{sel.description}</p>
          <h5>شو بيجهّزلك وزن</h5>
          <ul>
            <li>
              <Icon name="check" size={14} /> فواتير بيع وشراء، مخزون، ديون، صندوق وتقارير
            </li>
            {feats.map((f) => (
              <li key={f}>
                <Icon name="check" size={14} /> {f}
              </li>
            ))}
          </ul>
          <small className="muted">فيك تغيّر النشاط أو تشغّل أي ميزة تانية بأي وقت من الإعدادات، بدون ما يتأثر شي من حساباتك.</small>
        </aside>
      )}
    </div>
  );
}
