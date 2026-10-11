import { app, BrowserWindow, dialog, ipcMain, session as electronSession, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVITIES, chartFor, DEFAULT_CURRENCIES, defaultTaxes, type Activity } from '../core';
import { hostCompanyFor } from '../app/host-company';
import { DEFAULT_LAN_PORT, LanClient, LanHost, newPairingCode } from '../app/lan';
import { FEED_CHECK_HOURS, LICENSE_FEED_URLS } from '../license/config';
import { LicenseManager, type LicenseStatus } from '../license/manager';
import { LICENSE_PUBLIC_KEY } from '../license/public-key';
import { CompanyStore, peekCompany, type Credentials } from '../storage/company-store';
import { LocalBackend, RemoteBackend, type Backend } from './backend';
import { buildCsv, buildWorkbook, readWorkbook, type ExportSheet } from './exporter';

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

interface Settings {
  deviceId: string;
  recent: { name: string; dir: string }[];
  lan: { hostEnabled: boolean; port: number; pairingCode: string };
  lastRemote?: { host: string; port: number };
}

let win: BrowserWindow | null = null;
let backend: Backend | null = null;
let host: LanHost | null = null;
let license: LicenseManager;
let lastLicense: LicenseStatus | null = null;

// ───────────── الإعدادات المحلية ─────────────

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings(): Settings {
  let s: Partial<Settings> = {};
  try {
    s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    // أول تشغيل
  }
  const full: Settings = {
    deviceId: s.deviceId ?? crypto.randomUUID(),
    recent: s.recent ?? [],
    lan: { hostEnabled: false, port: DEFAULT_LAN_PORT, pairingCode: newPairingCode(), ...s.lan },
    ...(s.lastRemote ? { lastRemote: s.lastRemote } : {}),
  };
  if (!s.deviceId || !s.lan) writeSettings(full);
  return full;
}

function writeSettings(s: Settings): void {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

function remember(name: string, dir: string): void {
  const s = readSettings();
  s.recent = [{ name, dir }, ...s.recent.filter((r) => r.dir !== dir)].slice(0, 10);
  writeSettings(s);
}

function companiesRoot(): string {
  return path.join(app.getPath('documents'), 'Mizan');
}

function safeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'شركة';
}

function uniqueDir(name: string): string {
  let dir = path.join(companiesRoot(), safeFolderName(name));
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(companiesRoot(), `${safeFolderName(name)} (${i})`);
  return dir;
}

// ───────────── الترخيص ─────────────

function licenseStatus(): LicenseStatus {
  lastLicense = license.status();
  return lastLicense;
}

function licenseBlocked(): string | null {
  const s = lastLicense ?? licenseStatus();
  return s.locked ? (s.message ?? 'البرنامج غير مفعّل') : null;
}

async function refreshLicense(): Promise<void> {
  await license.refresh();
  const before = lastLicense;
  const now = licenseStatus();
  if (!before || before.locked !== now.locked || before.message !== now.message || before.daysLeft !== now.daysLeft) {
    send('license:changed', now);
  }
  // إيقاف فوري عند قفل الترخيص (إلا الأجهزة الفرعية التي يتحكم بها الجهاز الرئيسي)
  if (now.locked && backend?.kind === 'local') {
    stopHosting();
    await closeBackend();
    send('company:closed', now.message);
  }
}

// ───────────── الجلسة والشركة ─────────────

function send(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function activeBackend(): Backend {
  if (!backend) throw new Error('لا توجد شركة مفتوحة');
  if (backend.kind === 'local' && licenseBlocked()) throw new Error(licenseBlocked()!);
  return backend;
}

function localStore(): CompanyStore {
  const b = activeBackend();
  if (!(b instanceof LocalBackend)) throw new Error('هذه العملية متاحة على الجهاز الرئيسي فقط');
  return b.store;
}

function attach(b: Backend): void {
  backend = b;
  b.listen(
    (items) => send('company:events', items),
    () => send('company:reset'),
    (message) => send('lan:error', message),
  );
}

async function closeBackend(): Promise<void> {
  const b = backend;
  backend = null;
  if (b) await b.close();
}

async function startHosting(): Promise<void> {
  const store = localStore();
  stopHosting();
  const s = readSettings();
  host = new LanHost(hostCompanyFor(store, { blocked: licenseBlocked, devices: () => (lastLicense ?? licenseStatus()).devices }), s.lan.pairingCode, s.lan.port);
  try {
    await host.start();
  } catch (e) {
    host = null;
    throw new Error(`تعذر تشغيل وضع الخادم على المنفذ ${s.lan.port}: ${(e as Error).message}`);
  }
}

function stopHosting(): void {
  host?.stop();
  host = null;
}

function sessionInfo() {
  if (!backend) return null;
  return {
    kind: backend.kind,
    user: backend.user,
    company: backend.companyName,
    ...(backend instanceof LocalBackend
      ? { dir: backend.store.dir, viaRecovery: backend.store.viaRecovery, recoveredTail: backend.store.recoveredTail }
      : { address: (backend as RemoteBackend).address }),
  };
}

// ───────────── قنوات الاتصال مع الواجهة ─────────────

/** نقبل الطلبات من نافذة البرنامج فقط. */
function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  return e.sender === win?.webContents && (url.startsWith('file://') || (isDev && !!process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])));
}

/** يحوّل الأخطاء إلى رسالة نصية تصل للواجهة كما هي. */
function handle(channel: string, fn: (...args: never[]) => unknown, opts: { allowLocked?: boolean } = {}): void {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trusted(e)) return { ok: false, error: 'طلب غير موثوق' };
    try {
      if (!opts.allowLocked && licenseBlocked() && backend?.kind !== 'remote') throw new Error(licenseBlocked()!);
      return { ok: true, value: await (fn as (...a: unknown[]) => unknown)(...args) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

async function printOrPdf(contents: WebContents, opts: { paper: string; printer?: string; copies?: number; pdf?: string }): Promise<string | boolean> {
  if (opts.pdf) {
    const res = await dialog.showSaveDialog(win!, { title: 'حفظ PDF', defaultPath: path.join(app.getPath('documents'), `${safeFolderName(opts.pdf)}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (res.canceled || !res.filePath) return false;
    const data = await contents.printToPDF({ printBackground: true, preferCSSPageSize: true, ...(opts.paper === 'a4' ? { pageSize: 'A4' } : {}) });
    fs.writeFileSync(res.filePath, data);
    return res.filePath;
  }
  return new Promise<boolean>((resolve) => {
    contents.print(
      { printBackground: true, silent: !!opts.printer, ...(opts.printer ? { deviceName: opts.printer } : {}), copies: Math.max(1, Math.min(5, opts.copies ?? 1)) },
      (success) => resolve(success),
    );
  });
}

function registerIpc(): void {
  handle(
    'app:info',
    () => {
      const s = readSettings();
      return {
        version: app.getVersion(),
        license: licenseStatus(),
        recent: s.recent.filter((r) => fs.existsSync(path.join(r.dir, 'company.json'))),
        session: sessionInfo(),
        lastRemote: s.lastRemote ?? null,
        deviceName: os.hostname(),
      };
    },
    { allowLocked: true },
  );

  handle('license:activate', (key: string) => {
    const s = license.activate(key);
    lastLicense = s;
    void refreshLicense();
    return s;
  }, { allowLocked: true });

  handle('license:refresh', async () => {
    await refreshLicense();
    return lastLicense;
  }, { allowLocked: true });

  handle('app:activities', () => Object.values(ACTIVITIES).map((a) => ({ id: a.id, name: a.name, description: a.description, icon: a.icon })), { allowLocked: true });

  // ── إنشاء وفتح الشركات (على هذا الجهاز) ──
  handle('company:create', async (o: { name: string; activity: Activity; baseCurrency: string; phone?: string; address?: string; ownerName: string; username: string; password: string }) => {
    if (!o.name?.trim()) throw new Error('اسم الشركة مطلوب');
    if (!(o.activity in ACTIVITIES)) throw new Error('نوع النشاط غير معروف');
    await closeBackend();
    const dir = uniqueDir(o.name);
    const { store, recoveryCode } = CompanyStore.create(dir, {
      info: {
        name: o.name.trim(),
        activity: o.activity,
        baseCurrency: o.baseCurrency === 'USD' ? 'USD' : 'SYP',
        fiscalYearStart: '01-01',
        ...(o.phone ? { phone: o.phone } : {}),
        ...(o.address ? { address: o.address } : {}),
      },
      currencies: DEFAULT_CURRENCIES,
      accounts: chartFor(o.activity),
      taxes: defaultTaxes(),
      owner: { username: o.username, displayName: o.ownerName || o.username, password: o.password },
    });
    attach(new LocalBackend(store));
    remember(o.name.trim(), dir);
    return { dir, recoveryCode };
  });

  handle('company:peek', async (dir?: string) => {
    if (!dir) {
      const res = await dialog.showOpenDialog(win!, { title: 'اختر مجلد الشركة', defaultPath: companiesRoot(), properties: ['openDirectory'] });
      if (res.canceled || !res.filePaths[0]) return null;
      dir = res.filePaths[0];
    }
    const { meta, usernames } = peekCompany(dir);
    return { dir, name: meta.name, activity: meta.activity, usernames };
  });

  handle('company:login', async (dir: string, creds: Credentials) => {
    await closeBackend();
    const store = CompanyStore.open(dir, creds);
    attach(new LocalBackend(store));
    remember(store.ledger.state.info?.name ?? store.meta.name, dir);
    if (readSettings().lan.hostEnabled) await startHosting().catch((e: Error) => send('lan:error', e.message));
    return sessionInfo();
  });

  /** استعادة نسخة احتياطية: تُنسخ إلى مجلد جديد ثم تُفتح بتسجيل الدخول. */
  handle('company:restore', async () => {
    const res = await dialog.showOpenDialog(win!, { title: 'اختر مجلد النسخة الاحتياطية', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    const src = res.filePaths[0];
    const { meta, usernames } = peekCompany(src);
    const dir = uniqueDir(`${meta.name} (مستعادة)`);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['company.json', 'keyring.json', 'journal.mzl', 'head.json']) {
      if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dir, f));
    }
    return { dir, name: meta.name, usernames };
  });

  handle('company:close', async () => {
    stopHosting();
    await closeBackend();
  }, { allowLocked: true });

  handle('company:state', () => activeBackend().snapshot());
  handle('company:call', (method: string, args: unknown[]) => activeBackend().call(method, args));

  handle('company:backup', async (toExternal: boolean) => {
    const store = localStore();
    if (!toExternal) return store.backup();
    const res = await dialog.showOpenDialog(win!, { title: 'اختر مكان النسخة الاحتياطية (فلاشة مثلاً)', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    return store.backup(path.join(res.filePaths[0], `Mizan-${safeFolderName(store.meta.name)}`), Infinity);
  });

  handle('company:reveal', () => shell.openPath(localStore().dir));

  // ── الشبكة المحلية ──
  handle('lan:status', () => {
    const s = readSettings();
    return {
      enabled: s.lan.hostEnabled,
      running: !!host,
      port: s.lan.port,
      pairingCode: s.lan.pairingCode,
      addresses: Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n!.address),
      devices: host?.devices ?? [],
    };
  });

  handle('lan:host', async (enable: boolean, newCode?: boolean) => {
    const s = readSettings();
    s.lan.hostEnabled = enable;
    if (newCode) s.lan.pairingCode = newPairingCode();
    writeSettings(s);
    stopHosting();
    if (enable) await startHosting();
    return true;
  });

  handle('lan:connect', async (o: { host: string; port?: number; pairingCode: string; username: string; password: string }) => {
    await closeBackend();
    const port = o.port || DEFAULT_LAN_PORT;
    const client = new LanClient(o.host.trim(), port, o.pairingCode);
    const hello = await client.hello();
    const s = readSettings();
    const r = await client.login(o.username, o.password, s.deviceId, os.hostname());
    attach(new RemoteBackend(client, r.user, hello.name, r.state, r.seq));
    s.lastRemote = { host: o.host.trim(), port };
    writeSettings(s);
    return sessionInfo();
  }, { allowLocked: true });

  // ── الطباعة والتصدير ──
  handle('print:printers', async () => (await win!.webContents.getPrintersAsync()).map((p) => ({ name: p.name, label: p.displayName || p.name })));
  handle('print:run', (opts: { paper: string; printer?: string; copies?: number }) => printOrPdf(win!.webContents, opts));
  handle('export:pdf', (opts: { paper: string; name: string }) => printOrPdf(win!.webContents, { paper: opts.paper, pdf: opts.name }));

  handle('export:excel', async (name: string, sheets: ExportSheet[], format: 'xlsx' | 'csv' = 'xlsx') => {
    const res = await dialog.showSaveDialog(win!, {
      title: 'حفظ الملف',
      defaultPath: path.join(app.getPath('documents'), `${safeFolderName(name)}.${format}`),
      filters: format === 'csv' ? [{ name: 'CSV', extensions: ['csv'] }] : [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (res.canceled || !res.filePath) return null;
    if (format === 'csv') fs.writeFileSync(res.filePath, buildCsv(sheets[0]!), 'utf8');
    else fs.writeFileSync(res.filePath, await buildWorkbook(sheets));
    return res.filePath;
  });

  handle('import:excel', async () => {
    const res = await dialog.showOpenDialog(win!, { title: 'اختر ملف Excel', filters: [{ name: 'Excel', extensions: ['xlsx'] }], properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) return null;
    return readWorkbook(fs.readFileSync(res.filePaths[0]));
  });
}

// ───────────── النافذة والحماية ─────────────

function createWindow(): void {
  win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'ميزان',
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f8',
    show: false,
    webPreferences: {
      preload: path.join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win?.show());

  // منع التنقل لأي صفحة أخرى أو فتح نوافذ جديدة
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  if (!isDev) {
    win.webContents.on('before-input-event', (e, input) => {
      if ((input.control || input.meta) && input.shift && ['i', 'j', 'c'].includes(input.key.toLowerCase())) e.preventDefault();
      if (input.key === 'F12') e.preventDefault();
    });
  }

  if (isDev && process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
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
  app.whenReady().then(async () => {
    // رفض كل طلبات الأذونات (كاميرا، ميكروفون، موقع...)
    electronSession.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    // رابط بديل للتجربة فقط في نسخة التطوير
    const feedUrls = isDev && process.env['MIZAN_FEED_URL'] ? [process.env['MIZAN_FEED_URL']] : LICENSE_FEED_URLS;
    license = new LicenseManager({ dataDir: app.getPath('userData'), publicKey: LICENSE_PUBLIC_KEY, feedUrls });
    licenseStatus();
    registerIpc();
    createWindow();
    void refreshLicense();
    setInterval(() => void refreshLicense(), FEED_CHECK_HOURS * 3600_000);
  });
  app.on('before-quit', () => {
    stopHosting();
    void closeBackend();
  });
  app.on('window-all-closed', () => app.quit());
}
