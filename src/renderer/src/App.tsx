import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyEvent, ROLE_NAMES, type CompanyState, type Feature, type Permission } from '../../core';
import type { EventItem } from '../../app/lan';
import type { LicenseStatus } from '../../license/manager';
import { api, Company, makeCtxHelpers, type AppInfo, type CompanyCtx } from './api';
import { Accounts } from './screens/Accounts';
import { Appointments } from './screens/Appointments';
import { Dashboard } from './screens/Dashboard';
import { InvoiceEditor } from './screens/InvoiceEditor';
import { InvoiceView } from './screens/InvoiceView';
import { Invoices } from './screens/Invoices';
import { Items } from './screens/Items';
import { Journal } from './screens/Journal';
import { LockScreen } from './screens/LockScreen';
import { Parties } from './screens/Parties';
import { Pos } from './screens/Pos';
import { Production } from './screens/Production';
import { Rates } from './screens/Rates';
import { RepairEditor } from './screens/RepairEditor';
import { Repairs } from './screens/Repairs';
import { Reports } from './screens/Reports';
import { Restaurant } from './screens/Restaurant';
import { Settings } from './screens/Settings';
import { StockOps } from './screens/StockOps';
import { Users } from './screens/Users';
import { Vehicles } from './screens/Vehicles';
import { Vouchers } from './screens/Vouchers';
import { Welcome } from './screens/Welcome';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  feature?: Feature;
  features?: Feature[]; // أي واحدة منها
  perm?: Permission;
  perms?: Permission[]; // أي واحدة منها
}

const NAV: (NavItem | string)[] = [
  { key: 'dashboard', label: 'الرئيسية', icon: '⌂' },
  'العمليات',
  { key: 'pos', label: 'نقطة البيع', icon: '▣', feature: 'pos', perm: 'pos.use' },
  { key: 'restaurant', label: 'الطاولات والطلبات', icon: '🍽', feature: 'tables', perm: 'restaurant.use' },
  { key: 'sale', label: 'فاتورة مبيع', icon: '＋', perm: 'sales.create' },
  { key: 'repairs', label: 'أوامر الصيانة', icon: '🔧', feature: 'repairs', perm: 'repairs.manage' },
  { key: 'appointments', label: 'المواعيد', icon: '🗓', feature: 'appointments', perm: 'appointments.manage' },
  { key: 'purchase', label: 'فاتورة شراء', icon: '⇣', perm: 'purchases.create' },
  { key: 'vouchers', label: 'سندات القبض والدفع', icon: '₪', perm: 'vouchers.create' },
  { key: 'invoices', label: 'سجل الفواتير', icon: '☰' },
  'المخزون والبطاقات',
  { key: 'items', label: 'المواد', icon: '▦' },
  { key: 'stock', label: 'عمليات المخزون', icon: '⇄', perms: ['stock.adjust', 'stock.transfer'] },
  { key: 'production', label: 'الإنتاج', icon: '⚙', feature: 'production', perm: 'production.manage' },
  { key: 'parties', label: 'العملاء والموردون', icon: '☺' },
  { key: 'vehicles', label: 'السيارات والأجهزة', icon: '🚗', features: ['vehicles', 'devices'], perm: 'repairs.manage' },
  'المحاسبة',
  { key: 'reports', label: 'التقارير', icon: '▤', perms: ['reports.financial', 'reports.stock'] },
  { key: 'journal', label: 'القيود اليومية', icon: '✎', perm: 'journal.create' },
  { key: 'rates', label: 'سعر الدولار', icon: '$', perm: 'rates.manage' },
  { key: 'accounts', label: 'دليل الحسابات', icon: '⌗', perm: 'accounts.manage' },
  'الإدارة',
  { key: 'users', label: 'المستخدمون', icon: '👤', perm: 'users.manage' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙' },
];

/** نسخة سطحية جديدة لكل مجموعة حتى تلاحظ React التغيير بعد تطبيق الأحداث. */
function refreshRefs(s: CompanyState): CompanyState {
  const next = { ...s } as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) {
    if (Array.isArray(v)) next[k] = [...v];
    else if (v && typeof v === 'object') next[k] = { ...v };
  }
  return next as unknown as CompanyState;
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [state, setState] = useState<CompanyState | null>(null);
  const [screen, setScreen] = useState<{ key: string; param?: string }>({ key: 'dashboard' });
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null);
  const seqRef = useRef(0);
  const stateRef = useRef<CompanyState | null>(null);

  const notify = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => setToast({ message, kind }), []);

  const loadState = useCallback(async () => {
    const snap = await api.state();
    seqRef.current = snap.seq;
    stateRef.current = snap.state;
    setState(refreshRefs(snap.state));
  }, []);

  const loadInfo = useCallback(async () => {
    const i = await api.info();
    setInfo(i);
    if (i.session) await loadState();
    else {
      stateRef.current = null;
      setState(null);
    }
  }, [loadState]);

  useEffect(() => {
    void loadInfo();
    const offs = [
      api.on('company:events', (payload) => {
        const items = payload as EventItem[];
        const s = stateRef.current;
        if (!s) return;
        for (const it of items) {
          if (it.seq <= seqRef.current) continue;
          if (it.seq !== seqRef.current + 1) {
            void loadState(); // فجوة في الأحداث: نعيد تحميل الحالة كاملة
            return;
          }
          applyEvent(s, it.event);
          seqRef.current = it.seq;
        }
        setState(refreshRefs(s));
      }),
      api.on('company:reset', () => void loadState()),
      api.on('company:closed', (message) => {
        notify(String(message ?? 'تم إغلاق الشركة'), 'error');
        void loadInfo();
      }),
      api.on('license:changed', (lic) => setInfo((i) => (i ? { ...i, license: lic as LicenseStatus } : i))),
      api.on('lan:error', (message) => notify(String(message), 'error')),
    ];
    return () => offs.forEach((off) => off());
  }, [loadInfo, loadState, notify]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const call = useCallback(
    async <T,>(method: string, ...args: unknown[]): Promise<{ value: T } | null> => {
      try {
        const res = await api.call<T>(method, ...args);
        // ننتظر قليلاً وصول أحداث العملية، وإلا نعيد التحميل
        for (let i = 0; i < 20 && seqRef.current < res.seq; i++) await new Promise((r) => setTimeout(r, 25));
        if (seqRef.current < res.seq) await loadState();
        return { value: res.value };
      } catch (e) {
        notify((e as Error).message, 'error');
        return null;
      }
    },
    [loadState, notify],
  );

  const navigate = useCallback((key: string, param?: string) => setScreen(param ? { key, param } : { key }), []);

  const ctx = useMemo<CompanyCtx | null>(() => {
    if (!info?.session || !state) return null;
    return { state, info, session: info.session, call, notify, navigate, reloadInfo: loadInfo, ...makeCtxHelpers(state, info.session.user) };
  }, [info, state, call, notify, navigate, loadInfo]);

  if (!info) return <div className="splash">ميزان</div>;
  const toastEl = toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>;
  const lic = info.license;

  // البرنامج لا يفتح بدون ترخيص (إلا الاتصال بجهاز رئيسي مرخّص)
  if (!info.session) {
    return (
      <>
        {lic.locked ? (
          <LockScreen info={info} onChanged={loadInfo} notify={notify} />
        ) : (
          <Welcome
            info={info}
            notify={notify}
            onOpened={async () => {
              await loadInfo();
              setScreen({ key: 'dashboard' });
            }}
            onLicense={loadInfo}
          />
        )}
        {toastEl}
      </>
    );
  }
  if (!ctx) return <div className="splash">ميزان</div>;

  const visible = NAV.filter((n) => {
    if (typeof n === 'string') return true;
    if (n.feature && !ctx.feature(n.feature)) return false;
    if (n.features && !n.features.some(ctx.feature)) return false;
    if (n.perm && !ctx.can(n.perm)) return false;
    if (n.perms && !n.perms.some(ctx.can)) return false;
    return true;
  }).filter((n, i, arr) => typeof n !== 'string' || (arr[i + 1] !== undefined && typeof arr[i + 1] !== 'string'));

  return (
    <Company.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo">ميزان</div>
            <div className="company-name">
              {ctx.profile.icon} {ctx.state.info?.name}
            </div>
            <div className="user-chip">
              {ctx.user.displayName} · {ROLE_NAMES[ctx.user.role]}
              {ctx.session.kind === 'remote' && <span title={ctx.session.address}> · متصل بالجهاز الرئيسي</span>}
            </div>
          </div>
          <nav>
            {visible.map((n) =>
              typeof n === 'string' ? (
                <div key={n} className="nav-group">
                  {n}
                </div>
              ) : (
                <button key={n.key} className={screen.key === n.key ? 'active' : ''} onClick={() => navigate(n.key)}>
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                </button>
              ),
            )}
          </nav>
          {ctx.session.kind === 'local' && (
            <div className={`license-badge ${lic.daysLeft !== null && lic.daysLeft !== undefined && lic.daysLeft <= 7 ? 'warn' : ''}`}>
              {lic.planName}
              {lic.daysLeft !== null && lic.daysLeft !== undefined && <small> · متبقٍ {lic.daysLeft} يوم</small>}
            </div>
          )}
          <button
            className="ghost close-company"
            onClick={async () => {
              await api.close();
              await loadInfo();
            }}
          >
            تسجيل الخروج
          </button>
        </aside>
        <main className="content">
          {lic.message && !lic.locked && <div className="banner">{lic.message}</div>}
          {ctx.session.kind === 'local' && lic.onlineEnabled && lic.offlineDaysLeft !== undefined && lic.offlineDaysLeft <= 2 && (
            <div className="banner bad">اتصل بالإنترنت للتحقق من الاشتراك خلال {lic.offlineDaysLeft} يوم وإلا سيتوقف البرنامج.</div>
          )}
          {ctx.session.viaRecovery && <div className="banner bad">دخلت برمز الاسترداد. غيّر كلمة السر الآن من الإعدادات ← حسابي.</div>}
          <Screen screen={screen} />
        </main>
      </div>
      {toastEl}
    </Company.Provider>
  );
}

function Screen({ screen }: { screen: { key: string; param?: string } }) {
  const p = screen.param;
  switch (screen.key) {
    case 'pos':
      return <Pos />;
    case 'restaurant':
      return <Restaurant />;
    case 'sale':
    case 'purchase':
    case 'sale_return':
    case 'purchase_return':
      return <InvoiceEditor key={`${screen.key}-${p ?? ''}`} kind={screen.key} />;
    case 'invoices':
      return <Invoices />;
    case 'invoice':
      return <InvoiceView id={p!} />;
    case 'repairs':
      return <Repairs />;
    case 'repair':
      return <RepairEditor key={p ?? 'new'} {...(p ? { id: p } : {})} />;
    case 'appointments':
      return <Appointments />;
    case 'vehicles':
      return <Vehicles />;
    case 'items':
      return <Items />;
    case 'stock':
      return <StockOps {...(p ? { tab: p } : {})} />;
    case 'production':
      return <Production />;
    case 'parties':
      return <Parties {...(p ? { focus: p } : {})} />;
    case 'vouchers':
      return <Vouchers />;
    case 'rates':
      return <Rates />;
    case 'reports':
      return <Reports {...(p ? { tab: p } : {})} />;
    case 'journal':
      return <Journal />;
    case 'accounts':
      return <Accounts />;
    case 'users':
      return <Users />;
    case 'settings':
      return <Settings {...(p ? { tab: p } : {})} />;
    default:
      return <Dashboard />;
  }
}
