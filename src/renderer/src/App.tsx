import { useCallback, useEffect, useState } from 'react';
import type { CompanyState } from '../../core';
import { api, Company, type AppInfo, type CompanyCtx } from './api';
import { Accounts } from './screens/Accounts';
import { Dashboard } from './screens/Dashboard';
import { InvoiceEditor } from './screens/InvoiceEditor';
import { InvoiceView } from './screens/InvoiceView';
import { Invoices } from './screens/Invoices';
import { Items } from './screens/Items';
import { Parties } from './screens/Parties';
import { Rates } from './screens/Rates';
import { RepairEditor } from './screens/RepairEditor';
import { Repairs } from './screens/Repairs';
import { Reports } from './screens/Reports';
import { Settings } from './screens/Settings';
import { Vehicles } from './screens/Vehicles';
import { Vouchers } from './screens/Vouchers';
import { Welcome } from './screens/Welcome';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  autoOnly?: boolean;
}

const NAV: (NavItem | string)[] = [
  { key: 'dashboard', label: 'الرئيسية', icon: '⌂' },
  'العمليات',
  { key: 'sale', label: 'فاتورة مبيع', icon: '＋' },
  { key: 'repairs', label: 'أوامر الإصلاح', icon: '🔧', autoOnly: true },
  { key: 'purchase', label: 'فاتورة شراء', icon: '⇣' },
  { key: 'vouchers', label: 'سندات القبض والدفع', icon: '₪' },
  { key: 'invoices', label: 'سجل الفواتير', icon: '☰' },
  'البطاقات',
  { key: 'items', label: 'القطع والمواد', icon: '▦' },
  { key: 'parties', label: 'العملاء والموردون', icon: '☺' },
  { key: 'vehicles', label: 'السيارات', icon: '🚗', autoOnly: true },
  'المحاسبة',
  { key: 'reports', label: 'التقارير', icon: '▤' },
  { key: 'rates', label: 'أسعار الصرف', icon: '$' },
  { key: 'accounts', label: 'دليل الحسابات', icon: '⌗' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙' },
];

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [state, setState] = useState<CompanyState | null>(null);
  const [screen, setScreen] = useState<{ key: string; param?: string }>({ key: 'dashboard' });
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null);

  const loadInfo = useCallback(async () => {
    const i = await api.info();
    setInfo(i);
    setState(i.company ? await api.state() : null);
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => setToast({ message, kind }), []);
  const refresh = useCallback(async () => setState(await api.state()), []);
  const call = useCallback(
    async <T,>(method: string, ...args: unknown[]): Promise<{ value: T } | null> => {
      try {
        const value = await api.call<T>(method, ...args);
        await refresh();
        return { value };
      } catch (e) {
        notify((e as Error).message, 'error');
        return null;
      }
    },
    [refresh, notify],
  );
  const navigate = useCallback((key: string, param?: string) => setScreen(param ? { key, param } : { key }), []);

  if (!info) return <div className="splash">ميزان</div>;

  const toastEl = toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>;

  if (!state) {
    return (
      <>
        <Welcome
          info={info}
          onOpened={async () => {
            await loadInfo();
            setScreen({ key: 'dashboard' });
          }}
          onLicense={loadInfo}
          notify={notify}
        />
        {toastEl}
      </>
    );
  }

  const ctx: CompanyCtx = { state, info, call, refresh, notify, navigate };
  const isAuto = state.info?.activity === 'auto';
  const lic = info.license;

  return (
    <Company.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo">ميزان</div>
            <div className="company-name">{state.info?.name}</div>
          </div>
          <nav>
            {NAV.filter((n) => typeof n === 'string' || !n.autoOnly || isAuto).map((n) =>
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
          <div className={`license-badge ${lic.readOnly ? 'bad' : lic.mode === 'trial' ? 'warn' : ''}`}>
            {lic.readOnly ? 'قراءة فقط' : lic.planName}
            {lic.daysLeft !== null && !lic.readOnly && <small> · متبقٍ {lic.daysLeft} يوم</small>}
          </div>
          <button
            className="ghost close-company"
            onClick={async () => {
              await api.closeCompany();
              await loadInfo();
            }}
          >
            إغلاق الشركة
          </button>
        </aside>
        <main className="content">
          {lic.readOnly && <div className="banner bad">{lic.message} — من الإعدادات يمكنك إدخال مفتاح الترخيص.</div>}
          <Screen screen={screen} onLicense={loadInfo} />
        </main>
      </div>
      {toastEl}
    </Company.Provider>
  );
}

function Screen({ screen, onLicense }: { screen: { key: string; param?: string }; onLicense: () => Promise<void> }) {
  switch (screen.key) {
    case 'sale':
      return <InvoiceEditor key={`sale-${screen.param ?? ''}`} kind="sale" />;
    case 'purchase':
      return <InvoiceEditor key="purchase" kind="purchase" />;
    case 'sale_return':
      return <InvoiceEditor key="sale_return" kind="sale_return" />;
    case 'purchase_return':
      return <InvoiceEditor key="purchase_return" kind="purchase_return" />;
    case 'invoices':
      return <Invoices />;
    case 'invoice':
      return <InvoiceView id={screen.param!} />;
    case 'repairs':
      return <Repairs />;
    case 'repair':
      return <RepairEditor key={screen.param ?? 'new'} {...(screen.param ? { id: screen.param } : {})} />;
    case 'vehicles':
      return <Vehicles />;
    case 'items':
      return <Items />;
    case 'parties':
      return <Parties {...(screen.param ? { focus: screen.param } : {})} />;
    case 'vouchers':
      return <Vouchers />;
    case 'rates':
      return <Rates />;
    case 'reports':
      return <Reports />;
    case 'accounts':
      return <Accounts />;
    case 'settings':
      return <Settings onLicense={onLicense} />;
    default:
      return <Dashboard />;
  }
}
