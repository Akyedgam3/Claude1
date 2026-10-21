import { app, BrowserWindow, dialog, ipcMain, screen, session as electronSession, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVITIES, can, chartFor, DEFAULT_CURRENCIES, defaultTaxes, PERMISSIONS, type Activity, type Permission } from '../core';
import { CloudSessions, CLOUD_MIN_DEVICES } from '../app/cloud-sessions';
import { hostCompanyFor } from '../app/host-company';
import { DEFAULT_LAN_PORT, LanClient, LanHost, newPairingCode } from '../app/lan';
import { newCloudCode } from '../cloud/code';
import { FEED_CHECK_HOURS, LICENSE_FEED_URLS } from '../license/config';
import { LicenseManager, type LicenseStatus } from '../license/manager';
import { IS_TEST_BUILD, LICENSE_PUBLIC_KEY } from '../license/public-key';
import { CompanyStore, peekCompany, type Credentials } from '../storage/company-store';
import { LocalBackend, RemoteBackend, type Backend } from './backend';
import { buildCsv, buildWorkbook, readWorkbook, type ExportSheet } from './exporter';
import appIcon from '../../build/icon.png?asset';

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

interface Settings {
  deviceId: string;
  recent: { name: string; dir: string }[];
  lan: { hostEnabled: boolean; port: number; pairingCode: string };
  lastRemote?: { host: string; port: number };
  /** الاتصال عن بعد: رمز لكل شركة (حسب معرّفها). */
  cloud?: Record<string, string>;
}

let win: BrowserWindow | null = null;
let backend: Backend | null = null;
let host: LanHost | null = null;
let license: LicenseManager;
let lastLicense: LicenseStatus | null = null;
// الأجهزة البعيدة عبر السحابة: الواجهة بتشغّل الاتصال، وهون التحقق من كلمات السر والتنفيذ
const cloudSessions = new CloudSessions(() => localStore(), () => Math.max(CLOUD_MIN_DEVICES, (lastLicense ?? licenseStatus()).devices - 1));

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
    ...(s.cloud ? { cloud: s.cloud } : {}),
  };
  if (!s.deviceId || !s.lan) writeSettings(full);
  return full;
}

function writeSettings(s: Settings): void {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  const tmp = `${settingsFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, settingsFile()); // حفظ آمن من انقطاع الكهرباء
}

function remember(name: string, dir: string): void {
  const s = readSettings();
  s.recent = [{ name, dir }, ...s.recent.filter((r) => r.dir !== dir)].slice(0, 10);
  writeSettings(s);
}

function companiesRoot(): string {
  // نسخة 1.2.3 (باسم معيار) كانت تعمل الشركات الجديدة بمجلد Miyar؛ منكمّل فيه إذا هو الموجود بس
  const main = path.join(app.getPath('documents'), 'Mizan');
  const alt = path.join(app.getPath('documents'), 'Miyar');
  return !fs.existsSync(main) && fs.existsSync(alt) ? alt : main;
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
  try {
    await refreshLicenseNow();
  } catch (e) {
    console.error('license refresh failed', e);
  }
}

async function refreshLicenseNow(): Promise<void> {
  await license.refresh();
  const before = lastLicense;
  const now = licenseStatus();
  if (!before || before.locked !== now.locked || before.message !== now.message || before.daysLeft !== now.daysLeft || before.update?.version !== now.update?.version) {
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

/** عمليات الإدارة على الجهاز (الشبكة، النسخ) تحتاج صلاحية المستخدم المسجّل. */
function requirePermission(p: Permission): void {
  const b = activeBackend();
  if (!can(b.user, p)) throw new Error(`لا تملك صلاحية: ${PERMISSIONS[p]}`);
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
  stopHosting(); // لا يبقى الخادم يقدّم بيانات شركة أُغلقت
  cloudSessions.clear();
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
    host?.stop();
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

// ───────────── شاشة الزبون ─────────────
// نافذة عرض بس: ما بتقدر تستدعي أي عملية (trusted بيقبل النافذة الرئيسية بس)، بتستقبل الطلب الحالي وبتعرضه.

let custWin: BrowserWindow | null = null;
let custLast: unknown = null;

function openCustomerDisplay(): { secondScreen: boolean } {
  const primary = screen.getPrimaryDisplay();
  const other = screen.getAllDisplays().find((d) => d.id !== primary.id);
  if (custWin && !custWin.isDestroyed()) {
    custWin.focus();
    return { secondScreen: !!other };
  }
  const b = other?.bounds;
  custWin = new BrowserWindow({
    ...(b ? { x: b.x, y: b.y, width: b.width, height: b.height, fullscreen: true } : { width: 1024, height: 640 }),
    title: 'وزن — شاشة الزبون',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: '#071c18',
    webPreferences: { preload: path.join(here, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false, devTools: isDev },
  });
  custWin.removeMenu();
  custWin.webContents.on('will-navigate', (e) => e.preventDefault());
  custWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  custWin.webContents.on('did-finish-load', () => custWin?.webContents.send('display:update', custLast));
  custWin.on('closed', () => (custWin = null));
  if (isDev && process.env['ELECTRON_RENDERER_URL']) void custWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#customer`);
  else void custWin.loadFile(path.join(here, '../renderer/index.html'), { hash: 'customer' });
  return { secondScreen: !!other };
}

function registerIpc(): void {
  handle('display:open', () => openCustomerDisplay(), { allowLocked: true });
  // شاشة الزبون نفسها بتطلب آخر شي انبعت أول ما تفتح (ما إلها أي صلاحية غير هيك)
  ipcMain.handle('display:last', (e) => (custWin && e.sender === custWin.webContents ? { ok: true, value: custLast } : { ok: false, error: 'طلب غير موثوق' }));
  handle('display:close', () => {
    if (custWin && !custWin.isDestroyed()) custWin.close();
    custWin = null;
  }, { allowLocked: true });
  handle('display:status', () => !!custWin && !custWin.isDestroyed(), { allowLocked: true });
  handle('display:update', (payload: unknown) => {
    if (JSON.stringify(payload ?? null).length > 1_500_000) throw new Error('بيانات شاشة الزبون كبيرة');
    custLast = payload;
    if (custWin && !custWin.isDestroyed()) custWin.webContents.send('display:update', payload);
  }, { allowLocked: true });
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

  // تحميل التحديث: الرابط فقط من القائمة الموقّعة، الواجهة ما بتقدر تفتح رابط من عندها
  handle('app:openUpdate', async () => {
    const u = (lastLicense ?? licenseStatus()).update;
    if (!u) throw new Error('لا يوجد تحديث');
    await shell.openExternal(u.url);
    return true;
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
    requirePermission('backup.manage');
    const store = localStore();
    if (!toExternal) return store.backup();
    const res = await dialog.showOpenDialog(win!, { title: 'اختر مكان النسخة الاحتياطية (فلاشة مثلاً)', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    return store.backup(path.join(res.filePaths[0], `Wazn-${safeFolderName(store.meta.name)}`), Infinity);
  });

  /** تصفير الشركة (للمالك فقط، بكلمة السر): نسخة احتياطية تلقائية، ثم سجل جديد بدون حركات. */
  handle('company:wipe', async (o: { mode: string; password: string }) => {
    const store = localStore();
    const user = activeBackend().user;
    if (user.role !== 'owner') throw new Error('تصفير الشركة للمالك فقط');
    if (o?.mode !== 'transactions' && o?.mode !== 'all') throw new Error('نوع تصفير غير معروف');
    if (!store.verify(user.username, String(o.password ?? ''))) throw new Error('كلمة السر غير صحيحة');
    const wasHosting = !!host;
    stopHosting(); // الأجهزة المتصلة بتعيد الاتصال وبتاخد الحالة الجديدة
    const backupDir = store.reset(o.mode);
    send('company:reset');
    if (wasHosting) await startHosting().catch((e: Error) => send('lan:error', e.message));
    return backupDir;
  });

  handle('company:reveal', () => {
    requirePermission('backup.manage');
    return shell.openPath(localStore().dir);
  });

  // ── الشبكة المحلية ──
  handle('lan:status', () => {
    requirePermission('settings.manage');
    localStore();
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
    requirePermission('settings.manage');
    localStore(); // وضع الخادم للجهاز الرئيسي بعد فتح الشركة فقط
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

  // ── الاتصال عن بعد (خدمة إضافية بتتفعّل من الترخيص) ──
  const cloudCode = (): string | null => readSettings().cloud?.[localStore().meta.id] ?? null;
  const cloudStatus = () => ({
    available: (lastLicense ?? licenseStatus()).cloud,
    enabled: !!cloudCode(),
    code: cloudCode(),
    devices: cloudSessions.devices(),
  });
  const requireCloud = () => {
    if (!(lastLicense ?? licenseStatus()).cloud) throw new Error('خدمة الاتصال عن بعد غير مفعّلة في ترخيصك');
  };

  handle('cloud:status', () => {
    requirePermission('settings.manage');
    return cloudStatus();
  });

  handle('cloud:setup', (enable: boolean, newCode?: boolean) => {
    requirePermission('settings.manage');
    const id = localStore().meta.id;
    if (enable) requireCloud();
    const s = readSettings();
    const all = { ...s.cloud };
    if (!enable) delete all[id];
    else if (newCode || !all[id]) all[id] = newCloudCode();
    s.cloud = all;
    writeSettings(s);
    cloudSessions.clear(); // رمز جديد أو إيقاف: كل الأجهزة البعيدة بتنفصل
    return cloudStatus();
  });

  /** للواجهة: هل لازم تشغّل الاتصال عن بعد على هالجهاز؟ */
  handle('cloud:hostConfig', () => {
    if (!(backend instanceof LocalBackend) || !(lastLicense ?? licenseStatus()).cloud) return null;
    const code = cloudCode();
    return code ? { code } : null;
  });

  handle('cloud:hostLogin', (username: string, password: string, deviceId: string, deviceName: string) => {
    requireCloud();
    return cloudSessions.login(String(username), String(password), String(deviceId), String(deviceName));
  });
  handle('cloud:hostSnapshot', (token: string) => {
    requireCloud();
    return cloudSessions.snapshot(String(token));
  });
  handle('cloud:hostCall', (token: string, method: string, args: unknown[]) => {
    requireCloud();
    return cloudSessions.call(String(token), method, args);
  });
  handle('cloud:hostLogout', (token: string) => cloudSessions.logout(String(token)));

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
    title: 'وزن',
    icon: appIcon,
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
  // سكّرنا البرنامج: شاشة الزبون بتتسكّر معه
  win.on('closed', () => {
    if (custWin && !custWin.isDestroyed()) custWin.close();
  });

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

// مجلد البيانات (الترخيص والإعدادات) ثابت على Mizan مهما تغيّر اسم المنتج، حتى ما يضيع شي عند الزباين
app.setPath('userData', path.join(app.getPath('appData'), 'Mizan'));

// صيغة التاريخ في حقول الإدخال: يوم/شهر/سنة كما هو معتاد في سوريا
app.commandLine.appendSwitch('lang', 'en-GB');

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
    const testFeed = (isDev || IS_TEST_BUILD) && process.env['MIZAN_FEED_URL'] ? [process.env['MIZAN_FEED_URL']] : null;
    const feedUrls = testFeed ?? (IS_TEST_BUILD ? [] : LICENSE_FEED_URLS);
    license = new LicenseManager({ dataDir: app.getPath('userData'), publicKey: LICENSE_PUBLIC_KEY, feedUrls, appVersion: app.getVersion() });
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
