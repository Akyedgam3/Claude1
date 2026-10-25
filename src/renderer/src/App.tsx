import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyEvent, ROLE_NAMES, type CompanyState, type Feature, type Permission } from '../../core';
import type { EventItem } from '../../app/lan';
import type { LicenseStatus } from '../../license/manager';
import { api, Company, IS_MOBILE, IS_WEB, makeCtxHelpers, type AppInfo, type CompanyCtx, type SessionInfo } from './api';
import logoSmall from './assets/logo-64.png';
import logo from './assets/logo.png';
import { Icon } from './components/icons';
import { QuickSearch } from './components/QuickSearch';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdateNotice } from './components/UpdateNotice';
import { Accounts } from './screens/Accounts';
import { Appointments } from './screens/Appointments';
import { Dashboard } from './screens/Dashboard';
import { InvoiceEditor, OpenInvoices } from './screens/InvoiceEditor';
import { Partners } from './screens/Partners';
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
import { KitchenDisplay, Restaurant, RestaurantLive } from './screens/Restaurant';
import { Settings } from './screens/Settings';
import { TailorEditor, TailorOrders } from './screens/Tailor';
import { SiteJobEditor, SiteJobs } from './screens/SiteJobs';
import { QuoteEditor, Quotes } from './screens/Quotes';
import { StockOps } from './screens/StockOps';
import { Users } from './screens/Users';
import { Workshop, WorkOrderEditor } from './screens/Workshop';
import { DeviceLookup, Installments, PcBuild, TradeIn } from './screens/Electronics';
import { Vehicles } from './screens/Vehicles';
import { Debts } from './screens/Debts';
import { Tour } from './components/Tour';
import { Vouchers } from './screens/Vouchers';
import { Welcome } from './screens/Welcome';
import { useCloudHost } from './cloud/useCloudHost';
import { WebConnect } from './cloud/WebConnect';

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
  { key: 'dashboard', label: 'الرئيسية', icon: 'home' },
  'الأجهزة والإلكترونيات',
  { key: 'devices', label: 'سجل الأجهزة (السيريال)', icon: 'laptop', feature: 'serials' },
  { key: 'installments', label: 'التقسيط', icon: 'calendar', feature: 'installments', perms: ['sales.create', 'vouchers.create'] },
  { key: 'trade-in', label: 'بيع مع استبدال', icon: 'transfer', feature: 'tradeIn', perm: 'sales.create' },
  { key: 'pc-build', label: 'تجميعة كمبيوتر', icon: 'cpu', feature: 'pcBuild', perm: 'sales.create' },
  'الخياطة',
  { key: 'workshop', label: 'ورشة الخياطة (الجملة)', icon: 'factory', feature: 'workshop', perm: 'tailoring.manage' },
  { key: 'tailor', label: 'طلبات التفصيل', icon: 'scissors', feature: 'tailoring', perm: 'tailoring.manage' },
  'الورشة',
  { key: 'sitejobs', label: 'المشاريع والكشوفات', icon: 'roller', feature: 'sitejobs', perm: 'sitejobs.manage' },
  'العمليات',
  { key: 'pos', label: 'نقطة البيع', icon: 'pos', feature: 'pos', perm: 'pos.use' },
  { key: 'restaurant', label: 'الطاولات والطلبات', icon: 'utensils', feature: 'tables', perm: 'restaurant.use' },
  { key: 'kitchen', label: 'شاشة المطبخ', icon: 'beef', feature: 'tables', perm: 'restaurant.use' },
  { key: 'restaurant-live', label: 'لوحة الإدارة المباشرة', icon: 'live', feature: 'tables', perm: 'reports.financial' },
  { key: 'sale', label: 'فاتورة مبيع', icon: 'plus', perm: 'sales.create' },
  { key: 'quotes', label: 'عروض الأسعار', icon: 'file', perm: 'sales.create' },
  { key: 'repairs', label: 'أوامر الصيانة', icon: 'wrench', feature: 'repairs', perm: 'repairs.manage' },
  { key: 'appointments', label: 'المواعيد', icon: 'calendar', feature: 'appointments', perm: 'appointments.manage' },
  { key: 'purchase', label: 'فاتورة شراء', icon: 'purchase', perm: 'purchases.create' },
  { key: 'debts', label: 'الديون', icon: 'debts', perm: 'vouchers.create' },
  { key: 'vouchers', label: 'سندات القبض والدفع', icon: 'wallet', perm: 'vouchers.create' },
  { key: 'invoices', label: 'سجل الفواتير', icon: 'receipt' },
  'المخزون والبطاقات',
  { key: 'items', label: 'المواد', icon: 'package' },
  { key: 'stock', label: 'عمليات المخزون', icon: 'transfer', perms: ['stock.adjust', 'stock.transfer'] },
  { key: 'production', label: 'الإنتاج', icon: 'factory', feature: 'production', perm: 'production.manage' },
  { key: 'parties', label: 'العملاء والموردون', icon: 'users' },
  { key: 'vehicles', label: 'السيارات والأجهزة', icon: 'car', features: ['vehicles', 'devices'], perm: 'repairs.manage' },
  'المحاسبة',
  { key: 'reports', label: 'التقارير', icon: 'reports', perms: ['reports.financial', 'reports.stock', 'sales.create'] },
  { key: 'journal', label: 'القيود اليومية', icon: 'journal', perm: 'journal.create' },
  { key: 'rates', label: 'العملات وسعر الصرف', icon: 'dollar', perm: 'rates.manage' },
  { key: 'partners', label: 'الشركاء والمساهمين', icon: 'users', perm: 'partners.manage' },
  { key: 'accounts', label: 'دليل الحسابات', icon: 'accounts', perm: 'accounts.manage' },
  'الإدارة',
  { key: 'users', label: 'المستخدمون', icon: 'user-cog', perm: 'users.manage' },
  { key: 'settings', label: 'الإعدادات', icon: 'settings' },
];

/** مفاتيح سريعة للشاشات الأكثر استخداماً. */
const SHORTCUTS: Record<string, string> = { F2: 'sale', F3: 'pos', F4: 'purchase', F6: 'items', F7: 'parties', F8: 'reports', F9: 'debts' };
const SHORTCUT_OF = Object.fromEntries(Object.entries(SHORTCUTS).map(([k, v]) => [v, k]));

/** نسخة سطحية جديدة لكل مجموعة حتى تلاحظ React التغيير بعد تطبيق الأحداث. */
function refreshRefs(s: CompanyState): CompanyState {
  const next = { ...s } as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) {
    if (Array.isArray(v)) next[k] = [...v];
    else if (v && typeof v === 'object') next[k] = { ...v };
  }
  return next as unknown as CompanyState;
}

/** الشاشات التفصيلية وقائمة كل وحدة منها (لزر الرجوع إذا ما في سجل). */
const DETAIL_PARENT: Record<string, string> = { invoice: 'invoices', repair: 'repairs', quote: 'quotes', 'tailor-order': 'tailor', 'work-order': 'workshop', sitejob: 'sitejobs' };

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
      api.on('cloud:notice', (message) => notify(String(message))),
      api.on('cloud:mode', (m) => setInfo((i) => (i?.session ? { ...i, session: { ...i.session, cloud: m as SessionInfo['cloud'] } } : i))),
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

  // سجل الشاشات: زر X بالشاشات التفصيلية (فاتورة، صيانة...) بيرجّع لحيث جيت منه
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const trail = useRef<{ key: string; param?: string }[]>([]);
  const navigate = useCallback((key: string, param?: string) => {
    const cur = screenRef.current;
    if (cur.key !== key || cur.param !== param) trail.current = [...trail.current.slice(-29), cur];
    setScreen(param ? { key, param } : { key });
  }, []);
  const back = useCallback(() => {
    const prev = trail.current.pop();
    const cur = screenRef.current;
    const parent = DETAIL_PARENT[cur.key];
    setScreen(prev ?? (parent ? { key: parent } : { key: 'dashboard' }));
  }, []);

  const ctx = useMemo<CompanyCtx | null>(() => {
    if (!info?.session || !state) return null;
    return { state, info, session: info.session, call, notify, navigate, screenKey: screen.key, back, reloadInfo: loadInfo, ...makeCtxHelpers(state, info.session.user) };
  }, [info, state, call, notify, navigate, screen.key, back, loadInfo]);

  // الاتصال عن بعد (خدمة إضافية): بس إذا مفعّلة بالترخيص والشركة مفتوحة على هالجهاز
  useCloudHost(info?.session?.kind === 'local' && !!info.license.cloud && !!state, state?.info?.name ?? '', notify);

  const [searching, setSearching] = useState(false);
  // الموبايل: القائمة الجانبية درج بينفتح من زر ☰
  const [navOpen, setNavOpen] = useState(false);
  // الوضع الداكن: تفضيل لكل جهاز
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('mizan.theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    try {
      localStorage.setItem('mizan.theme', theme);
    } catch {
      // لا شيء
    }
  }, [theme]);
  const shortcuts = useRef<Record<string, string>>({});
  useEffect(() => {
    // اختصارات لوحة المفاتيح (تعمل مع العربية لأننا نقرأ مكان الزر لا الحرف)
    const onKey = (e: KeyboardEvent) => {
      if (!stateRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        setSearching(true);
        return;
      }
      const target = shortcuts.current[e.key];
      if (target && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSearching(false);
        navigate(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const splash = (
    <div className="splash">
      <img src={logo} alt="" />
      وزن
    </div>
  );
  if (!info) return splash;
  const toastEl = toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>;
  const lic = info.license;

  // البرنامج لا يفتح بدون ترخيص (إلا الاتصال بجهاز رئيسي مرخّص)
  if (!info.session) {
    return (
      <>
        {IS_WEB ? (
          <WebConnect
            notify={notify}
            onConnected={async () => {
              await loadInfo();
              setScreen({ key: 'dashboard' });
            }}
          />
        ) : lic.locked ? (
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
        {!IS_WEB && <UpdateNotice update={lic.update} current={info.version} notify={notify} floating />}
        {toastEl}
      </>
    );
  }
  if (!ctx) return splash;

  const visible = NAV.filter((n) => {
    if (typeof n === 'string') return true;
    if (n.feature && !ctx.feature(n.feature)) return false;
    if (n.features && !n.features.some(ctx.feature)) return false;
    if (n.perm && !ctx.can(n.perm)) return false;
    if (n.perms && !n.perms.some(ctx.can)) return false;
    return true;
  }).filter((n, i, arr) => typeof n !== 'string' || (arr[i + 1] !== undefined && typeof arr[i + 1] !== 'string'));
  const screens = visible.filter((n): n is NavItem => typeof n !== 'string');
  const allowed = new Set(screens.map((n) => n.key));
  shortcuts.current = Object.fromEntries(Object.entries(SHORTCUTS).filter(([, key]) => allowed.has(key)));

  return (
    <Company.Provider value={ctx}>
      <div className={`shell ${navOpen ? 'nav-open' : ''}`} style={{ ['--activity' as string]: ctx.profile.color }}>
        {IS_MOBILE && (
          <header className="mobile-bar">
            <button className="icon menu" aria-label="القائمة" onClick={() => setNavOpen(true)}>
              <Icon name="menu" size={22} />
            </button>
            <strong>{screens.find((n) => n.key === screen.key)?.label ?? 'وزن'}</strong>
            <button className="icon" aria-label="بحث" onClick={() => setSearching(true)}>
              <Icon name="search" size={20} />
            </button>
          </header>
        )}
        {IS_MOBILE && navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
        <aside className="sidebar" onClick={(e) => IS_MOBILE && (e.target as HTMLElement).closest('nav button, .close-company') && setNavOpen(false)}>
          <div className="brand">
            <div className="logo">
              <img src={logoSmall} alt="" className="logo-img" />
              وزن
            </div>
            <div className="company-name">
              <Icon name={ctx.profile.icon} size={16} /> {ctx.state.info?.name}
            </div>
            <div className="user-chip">
              {ctx.user.displayName} · {ROLE_NAMES[ctx.user.role]}
              {ctx.session.kind === 'remote' && <span title={ctx.session.address}> · متصل بالجهاز الرئيسي</span>}
            </div>
          </div>
          <button className="quick-search-button" data-tour="search" onClick={() => setSearching(true)}>
            <Icon name="search" size={16} /> بحث سريع {!IS_MOBILE && <kbd>Ctrl+K</kbd>}
          </button>
          <nav>
            {visible.map((n) =>
              typeof n === 'string' ? (
                <div key={n} className="nav-group">
                  {n}
                </div>
              ) : (
                <button key={n.key} data-nav={n.key} className={screen.key === n.key ? 'active' : ''} onClick={() => navigate(n.key)}>
                  <Icon name={n.icon} className="nav-icon" />
                  {n.label}
                  {!IS_MOBILE && SHORTCUT_OF[n.key] && <kbd className="nav-kbd">{SHORTCUT_OF[n.key]}</kbd>}
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
          {!IS_WEB && <UpdateNotice update={lic.update} current={info.version} notify={notify} />}
          <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /> {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
          </button>
          <button
            className="ghost close-company"
            onClick={async () => {
              await api.close();
              await loadInfo();
            }}
          >
            <Icon name="logout" size={16} /> تسجيل الخروج
          </button>
        </aside>
        {IS_MOBILE && (
          <nav className="bottom-nav" aria-label="القائمة السريعة">
            {[
              screens.find((n) => n.key === 'dashboard'),
              screens.find((n) => n.key === 'sitejobs') ?? screens.find((n) => n.key === 'pos') ?? screens.find((n) => n.key === 'restaurant') ?? screens.find((n) => n.key === 'sale'),
              screens.find((n) => n.key === 'invoices'),
              screens.find((n) => n.key === 'debts') ?? screens.find((n) => n.key === 'items'),
            ]
              .filter((n): n is NavItem => !!n)
              .map((n) => (
                <button key={n.key} className={screen.key === n.key ? 'active' : ''} onClick={() => navigate(n.key)}>
                  <Icon name={n.icon} size={22} />
                  <span>{n.key === 'dashboard' ? 'الرئيسية' : n.key === 'sitejobs' ? 'المشاريع' : n.key === 'pos' || n.key === 'restaurant' || n.key === 'sale' ? 'البيع' : n.key === 'invoices' ? 'الفواتير' : n.label}</span>
                </button>
              ))}
            <button className={navOpen ? 'active' : ''} onClick={() => setNavOpen(true)}>
              <Icon name="menu" size={22} />
              <span>المزيد</span>
            </button>
          </nav>
        )}
        <Tour />
        <main className="content">
          {lic.message && !lic.locked && <div className="banner">{lic.message}</div>}
          {ctx.session.kind === 'local' && lic.onlineEnabled && lic.offlineDaysLeft !== undefined && lic.offlineDaysLeft <= 2 && (
            <div className="banner bad">اتصل بالإنترنت للتحقق من الاشتراك خلال {lic.offlineDaysLeft} يوم وإلا سيتوقف البرنامج.</div>
          )}
          {ctx.session.cloud?.offline && (
            <div className="banner">
              الجهاز الرئيسي مطفي حالياً. عم تشتغل على آخر نسخة وصلت{ctx.session.cloud.syncedAt ? ` (${new Date(ctx.session.cloud.syncedAt).toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' })})` : ''}. العمليات الجديدة بتنحفظ وبتتنفّذ عليه لما يرجع
              {ctx.session.cloud.pending > 0 ? ` (${ctx.session.cloud.pending} بالانتظار)` : ''}.
            </div>
          )}
          {!ctx.session.cloud?.offline && (ctx.session.cloud?.pending ?? 0) > 0 && <div className="banner">رجع الجهاز الرئيسي، وعم تتنفّذ عليه العمليات اللي انعملت وهو مطفي ({ctx.session.cloud!.pending})…</div>}
          {ctx.session.viaRecovery && <div className="banner bad">دخلت برمز الاسترداد. غيّر كلمة السر الآن من الإعدادات ← حسابي.</div>}
          <OpenInvoices />
          <ErrorBoundary resetKey={`${screen.key}:${screen.param ?? ''}`}>
            <Screen screen={screen} />
          </ErrorBoundary>
        </main>
      </div>
      {searching && <QuickSearch screens={screens} onClose={() => setSearching(false)} />}
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
    case 'kitchen':
      return <KitchenDisplay />;
    case 'restaurant-live':
      return <RestaurantLive />;
    case 'sale':
    case 'purchase':
    case 'sale_return':
    case 'purchase_return':
      return <InvoiceEditor key={`${screen.key}-${p ?? ''}`} kind={screen.key} {...(p?.startsWith('draft:') ? { draftId: p.slice(6) } : p ? { editId: p } : {})} />;
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
    case 'quotes':
      return <Quotes />;
    case 'quote':
      return <QuoteEditor key={p ?? 'new'} {...(p ? { id: p } : {})} />;
    case 'tailor':
      return <TailorOrders />;
    case 'tailor-order':
      return <TailorEditor key={p ?? 'new'} {...(p ? { id: p } : {})} />;
    case 'sitejobs':
      return <SiteJobs />;
    case 'sitejob':
      return <SiteJobEditor key={p ?? 'new'} {...(p ? { id: p } : {})} />;
    case 'devices':
      return <DeviceLookup key={p ?? ''} {...(p ? { serial: p } : {})} />;
    case 'installments':
      return <Installments />;
    case 'trade-in':
      return <TradeIn />;
    case 'pc-build':
      return <PcBuild />;
    case 'workshop':
      return <Workshop key={p ?? ''} {...(p ? { tab: p } : {})} />;
    case 'work-order':
      return <WorkOrderEditor key={p ?? 'new'} {...(p ? { id: p } : {})} />;
    case 'vehicles':
      return <Vehicles />;
    case 'items':
      return <Items key={p ?? ''} {...(p ? { initialQuery: p } : {})} />;
    case 'stock':
      return <StockOps {...(p ? { tab: p } : {})} />;
    case 'production':
      return <Production />;
    case 'parties':
      return <Parties {...(p ? { focus: p } : {})} />;
    case 'debts':
      return <Debts />;
    case 'partners':
      return <Partners />;
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
