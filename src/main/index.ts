import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chartFor, DEFAULT_CURRENCIES, defaultTaxes, type Activity, type Ledger } from '../core';
import { CompanyStore } from '../storage/company-store';
import { LicenseManager } from './license-manager';

// العمليات المسموح للواجهة باستدعائها على دفتر الشركة (كلها تعدّل البيانات)
const LEDGER_METHODS = [
  'updateCompany',
  'saveCurrency',
  'saveAccount',
  'saveTax',
  'setRate',
  'postEntry',
  'voidEntry',
  'saveParty',
  'saveItem',
  'saveWarehouse',
  'postInvoice',
  'voidInvoice',
  'postVoucher',
  'saveVehicle',
  'saveRepair',
  'invoiceRepair',
] as const;
type LedgerMethod = (typeof LEDGER_METHODS)[number];

interface Settings {
  recent: { name: string; dir: string }[];
}

const here = path.dirname(fileURLToPath(import.meta.url));

let win: BrowserWindow | null = null;
let store: CompanyStore | null = null;
let license: LicenseManager;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return { recent: [] };
  }
}

function remember(name: string, dir: string): void {
  const s = readSettings();
  s.recent = [{ name, dir }, ...s.recent.filter((r) => r.dir !== dir)].slice(0, 10);
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

function closeCompany(): void {
  if (!store) return;
  try {
    store.backup(); // نسخة احتياطية تلقائية عند كل إغلاق
  } finally {
    store.close();
    store = null;
  }
}

function activeStore(): CompanyStore {
  if (!store) throw new Error('لا توجد شركة مفتوحة');
  return store;
}

function safeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'شركة';
}

/** يحوّل الأخطاء إلى رسالة نصية تصل للواجهة كما هي. */
function handle<T extends unknown[], R>(channel: string, fn: (...args: T) => R | Promise<R>): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...(args as T)) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function registerIpc(): void {
  handle('app:info', () => ({
    version: app.getVersion(),
    license: license.status(),
    recent: readSettings().recent.filter((r) => fs.existsSync(path.join(r.dir, 'company.json'))),
    company: store ? { dir: store.dir, name: store.ledger.state.info?.name } : null,
  }));

  handle('license:activate', (key: string) => license.activate(key));

  handle('company:create', async (opts: { name: string; activity: Activity; baseCurrency: string; phone?: string; address?: string }) => {
    const parent = path.join(app.getPath('documents'), 'Mizan');
    let dir = path.join(parent, safeFolderName(opts.name));
    for (let i = 2; fs.existsSync(dir); i++) dir = path.join(parent, `${safeFolderName(opts.name)} (${i})`);
    closeCompany();
    store = CompanyStore.create(
      dir,
      {
        name: opts.name.trim(),
        activity: opts.activity,
        baseCurrency: opts.baseCurrency,
        fiscalYearStart: '01-01',
        ...(opts.phone ? { phone: opts.phone } : {}),
        ...(opts.address ? { address: opts.address } : {}),
      },
      DEFAULT_CURRENCIES,
      chartFor(opts.activity),
      defaultTaxes(),
    );
    remember(opts.name, dir);
    return { dir };
  });

  handle('company:open', async (dir?: string) => {
    if (!dir) {
      const res = await dialog.showOpenDialog(win!, {
        title: 'اختر مجلد الشركة',
        defaultPath: path.join(app.getPath('documents'), 'Mizan'),
        properties: ['openDirectory'],
      });
      if (res.canceled || !res.filePaths[0]) return null;
      dir = res.filePaths[0];
    }
    closeCompany();
    store = CompanyStore.open(dir);
    remember(store.ledger.state.info?.name ?? path.basename(dir), dir);
    return { dir, recoveredTail: store.recoveredTail };
  });

  handle('company:close', () => closeCompany());

  handle('company:state', () => activeStore().ledger.state);

  handle('ledger:call', (method: LedgerMethod, args: unknown[]) => {
    if (!LEDGER_METHODS.includes(method)) throw new Error(`عملية غير معروفة: ${method}`);
    const status = license.status();
    if (status.readOnly) throw new Error(status.message ?? 'البرنامج في وضع القراءة فقط');
    const ledger = activeStore().ledger as unknown as Record<LedgerMethod, (...a: unknown[]) => unknown>;
    return (ledger[method] as (...a: unknown[]) => unknown).apply(activeStore().ledger as Ledger, args);
  });

  handle('company:backup', async (toExternal: boolean) => {
    const s = activeStore();
    if (!toExternal) return s.backup();
    const res = await dialog.showOpenDialog(win!, { title: 'اختر مكان النسخة الاحتياطية (فلاشة مثلاً)', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    return s.backup(path.join(res.filePaths[0], `Mizan-${safeFolderName(s.ledger.state.info?.name ?? 'backup')}`), Infinity);
  });

  handle('company:reveal', () => shell.openPath(activeStore().dir));

  handle('app:print', () =>
    new Promise<boolean>((resolve) => {
      win!.webContents.print({ printBackground: true }, (success) => resolve(success));
    }),
  );
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'ميزان',
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(here, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
    },
  });
  win.removeMenu();
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else void win.loadFile(path.join(here, '../renderer/index.html'));
}

// نسخة واحدة فقط من البرنامج على الجهاز
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    license = new LicenseManager(app.getPath('userData'));
    registerIpc();
    createWindow();
  });
  app.on('before-quit', () => closeCompany());
  app.on('window-all-closed', () => app.quit());
}
