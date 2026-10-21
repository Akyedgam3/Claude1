// «العملية الرئيسية» لنسخة الموبايل: نفس قنوات window.mizan تبع الكمبيوتر، بس كلها جوا التطبيق.
// تخزين الشركات والتشفير والترخيص والصلاحيات هو نفس كود الكمبيوتر حرفياً (src/storage، src/license، src/app/executor).
// الموبايل نسخة مستقلة: ما في شبكة محلية ولا شاشة زبون، والطباعة والتصدير عبر أندرويد.
import { Buffer } from 'buffer';
import path from 'path-browserify';
import { ACTIVITIES, can, chartFor, DEFAULT_CURRENCIES, defaultTaxes, PERMISSIONS, type Activity, type CompanyEvent, type Permission, type User } from '../core';
import { execute } from '../app/executor';
import { FEED_CHECK_HOURS, LICENSE_FEED_URLS } from '../license/config';
import { LicenseManager, type LicenseStatus } from '../license/manager';
import { IS_TEST_BUILD, LICENSE_PUBLIC_KEY } from '../license/public-key';
import { buildCsv, buildWorkbook, readWorkbook, type ExportSheet } from '../main/exporter';
import { CompanyStore, peekCompany, type Credentials } from '../storage/company-store';
import { flushVfs } from './shims/fs';
import fs from './shims/fs';
import { native } from './native';


const ROOT = '/data';
const USER_DATA = `${ROOT}/userData`;
const COMPANIES = `${ROOT}/Documents/Wazn`;
const BACKUP_FILES = ['company.json', 'keyring.json', 'journal.mzl', 'head.json'];

interface Settings {
  deviceId: string;
  recent: { name: string; dir: string }[];
}

type Listener = (payload: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
const send = (channel: string, payload?: unknown) => listeners.get(channel)?.forEach((fn) => fn(payload));

let store: CompanyStore | null = null;
let unsubscribe: (() => void) | null = null;
let license: LicenseManager;
let lastLicense: LicenseStatus | null = null;

// ───────── الإعدادات ─────────

const settingsFile = `${USER_DATA}/settings.json`;

function readSettings(): Settings {
  let s: Partial<Settings> = {};
  try {
    s = JSON.parse(fs.readFileSync(settingsFile, 'utf8') as string);
  } catch {
    // أول تشغيل
  }
  const full: Settings = { deviceId: s.deviceId ?? crypto.randomUUID(), recent: s.recent ?? [] };
  if (!s.deviceId) writeSettings(full);
  return full;
}

function writeSettings(s: Settings): void {
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(`${settingsFile}.tmp`, JSON.stringify(s, null, 2));
  fs.renameSync(`${settingsFile}.tmp`, settingsFile);
}

function remember(name: string, dir: string): void {
  const s = readSettings();
  s.recent = [{ name, dir }, ...s.recent.filter((r) => r.dir !== dir)].slice(0, 20);
  writeSettings(s);
}

function safeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'شركة';
}

function uniqueDir(name: string): string {
  let dir = path.join(COMPANIES, safeFolderName(name));
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(COMPANIES, `${safeFolderName(name)} (${i})`);
  return dir;
}

// ───────── الترخيص ─────────

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
    await license.refresh();
  } catch (e) {
    console.error('license refresh failed', e);
  }
  const before = lastLicense;
  const now = licenseStatus();
  if (!before || before.locked !== now.locked || before.message !== now.message || before.daysLeft !== now.daysLeft || before.update?.version !== now.update?.version) {
    send('license:changed', now);
  }
  if (now.locked && store) {
    closeStore();
    send('company:closed', now.message);
  }
}

// ───────── الشركة المفتوحة ─────────

function activeStore(): CompanyStore {
  if (!store) throw new Error('لا توجد شركة مفتوحة');
  if (licenseBlocked()) throw new Error(licenseBlocked()!);
  return store;
}

function currentUser(s: CompanyStore): User {
  return s.ledger.state.users[s.user.id] ?? s.user;
}

function requirePermission(p: Permission): void {
  const s = activeStore();
  if (!can(currentUser(s), p)) throw new Error(`لا تملك صلاحية: ${PERMISSIONS[p]}`);
}

function attach(s: CompanyStore): void {
  store = s;
  unsubscribe = s.onEvent((event: CompanyEvent, seq: number) => send('company:events', structuredClone([{ event, seq }])));
}

function closeStore(): void {
  const s = store;
  store = null;
  unsubscribe?.();
  unsubscribe = null;
  if (!s || !s.isOpen) return;
  try {
    // نسخة احتياطية تلقائية عند كل إغلاق؛ على الموبايل منخلي آخر 5 بس حتى ما تكبر المساحة
    s.backup(path.join(s.dir, 'backups'), 5);
  } finally {
    s.close();
  }
}

function sessionInfo() {
  if (!store) return null;
  return {
    kind: 'local' as const,
    user: currentUser(store),
    company: store.ledger.state.info?.name ?? store.meta.name,
    dir: store.dir,
    viaRecovery: store.viaRecovery,
    recoveredTail: store.recoveredTail,
  };
}

// ───────── ملفات: مشاركة واختيار ─────────

/** نسخة احتياطية كاملة بملف واحد (المحتوى مشفّر متل ما هو). */
function packCompany(dir: string): Uint8Array {
  const files: Record<string, string> = {};
  for (const f of BACKUP_FILES) if (fs.existsSync(path.join(dir, f))) files[f] = Buffer.from(fs.readFileSync(path.join(dir, f)) as Buffer).toString('base64');
  return new TextEncoder().encode(JSON.stringify({ app: 'wazn-backup', version: 1, files }));
}

function unpackCompany(bytes: Uint8Array): Record<string, Buffer> {
  let data: { app?: string; files?: Record<string, string> };
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('الملف ليس نسخة احتياطية من وزن');
  }
  if (data.app !== 'wazn-backup' || !data.files?.['company.json'] || !data.files['journal.mzl']) throw new Error('الملف ليس نسخة احتياطية من وزن');
  return Object.fromEntries(Object.entries(data.files).filter(([k]) => BACKUP_FILES.includes(k)).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
}

// ───────── القنوات ─────────

type Handler = (...args: never[]) => unknown;
const handlers = new Map<string, { fn: Handler; allowLocked: boolean }>();
const handle = (channel: string, fn: Handler, opts: { allowLocked?: boolean } = {}) => handlers.set(channel, { fn, allowLocked: !!opts.allowLocked });
const notOnMobile = (what: string) => () => {
  throw new Error(`${what} غير متاحة على نسخة الموبايل`);
};

function registerHandlers(): void {
  handle(
    'app:info',
    () => {
      const s = readSettings();
      return {
        version: __APP_VERSION__,
        license: licenseStatus(),
        recent: s.recent.filter((r) => fs.existsSync(path.join(r.dir, 'company.json'))),
        session: sessionInfo(),
        lastRemote: null,
        deviceName: 'Android',
        mobile: true,
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

  handle('app:openUpdate', async () => {
    const u = (lastLicense ?? licenseStatus()).update;
    if (!u) throw new Error('لا يوجد تحديث');
    await native.openUrl(u.url);
    return true;
  }, { allowLocked: true });

  handle('app:activities', () => Object.values(ACTIVITIES).map((a) => ({ id: a.id, name: a.name, description: a.description, icon: a.icon })), { allowLocked: true });

  handle('company:create', (o: { name: string; activity: Activity; baseCurrency: string; phone?: string; address?: string; ownerName: string; username: string; password: string }) => {
    if (!o.name?.trim()) throw new Error('اسم الشركة مطلوب');
    if (!(o.activity in ACTIVITIES)) throw new Error('نوع النشاط غير معروف');
    closeStore();
    const dir = uniqueDir(o.name);
    const { store: s, recoveryCode } = CompanyStore.create(dir, {
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
    attach(s);
    remember(o.name.trim(), dir);
    return { dir, recoveryCode };
  });

  handle('company:peek', (dir?: string) => {
    if (!dir) throw new Error('اختار الشركة من القائمة، أو استعيد نسخة احتياطية');
    const { meta, usernames } = peekCompany(dir);
    return { dir, name: meta.name, activity: meta.activity, usernames };
  });

  handle('company:login', (dir: string, creds: Credentials) => {
    closeStore();
    const s = CompanyStore.open(dir, creds);
    attach(s);
    remember(s.ledger.state.info?.name ?? s.meta.name, dir);
    return sessionInfo();
  });

  // استعادة: ملف النسخة الاحتياطية (من واتساب أو التنزيلات) بيصير شركة جديدة على الموبايل
  handle('company:restore', async () => {
    const picked = await native.pickFile('.wazn,application/json,application/octet-stream,*/*');
    if (!picked) return null;
    const files = unpackCompany(picked.bytes);
    const meta = JSON.parse(files['company.json']!.toString('utf8')) as { name?: string };
    const dir = uniqueDir(`${meta.name ?? 'شركة'} (مستعادة)`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), data);
    const peek = peekCompany(dir);
    return { dir, name: peek.meta.name, activity: peek.meta.activity, usernames: peek.usernames };
  });

  handle('company:close', () => closeStore(), { allowLocked: true });
  handle('company:state', () => {
    const s = activeStore();
    return { state: s.ledger.state, seq: s.lastSeq };
  });
  handle('company:call', (method: string, args: unknown[]) => {
    const s = activeStore();
    return execute(s, currentUser(s), method, args);
  });

  // نسخة احتياطية: داخلية، أو ملف بينبعت (واتساب، درايف، فلاشة...)
  handle('company:backup', async (toExternal: boolean) => {
    requirePermission('backup.manage');
    const s = activeStore();
    const dest = s.backup(path.join(s.dir, 'backups'), 5);
    if (!toExternal) return dest;
    await flushVfs();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return native.shareFile(`Wazn-${safeFolderName(s.meta.name)}-${stamp}.wazn`, packCompany(s.dir), 'application/octet-stream');
  });

  handle('company:wipe', (o: { mode: string; password: string }) => {
    const s = activeStore();
    const user = currentUser(s);
    if (user.role !== 'owner') throw new Error('تصفير الشركة للمالك فقط');
    if (o?.mode !== 'transactions' && o?.mode !== 'all') throw new Error('نوع تصفير غير معروف');
    if (!s.verify(user.username, String(o.password ?? ''))) throw new Error('كلمة السر غير صحيحة');
    const backupDir = s.reset(o.mode);
    send('company:reset');
    return backupDir;
  });

  handle('company:reveal', notOnMobile('فتح مجلد الشركة'));
  handle('lan:status', notOnMobile('الشبكة المحلية'));
  handle('lan:host', notOnMobile('الشبكة المحلية'));
  handle('lan:connect', notOnMobile('الشبكة المحلية'), { allowLocked: true });

  // شاشة الزبون ما إلها معنى على الموبايل: التحديثات بتنتجاهل بهدوء
  handle('display:open', notOnMobile('شاشة الزبون'), { allowLocked: true });
  handle('display:close', () => undefined, { allowLocked: true });
  handle('display:status', () => false, { allowLocked: true });
  handle('display:update', () => undefined, { allowLocked: true });
  handle('display:last', () => null, { allowLocked: true });

  // الطباعة عبر أندرويد (طابعة الشبكة أو البلوتوث المعرّفة على الجهاز، أو حفظ PDF)
  handle('print:printers', () => []);
  handle('print:run', (opts: { paper: string }) => native.print(`وزن — ${opts?.paper ?? ''}`));
  handle('export:pdf', (opts: { paper: string; name: string }) => native.print(opts?.name || 'وزن'));

  handle('export:excel', async (name: string, sheets: ExportSheet[], format: 'xlsx' | 'csv' = 'xlsx') => {
    const file = `${safeFolderName(name)}.${format}`;
    const bytes = format === 'csv' ? new TextEncoder().encode(buildCsv(sheets[0]!)) : new Uint8Array(await buildWorkbook(sheets));
    return native.shareFile(file, bytes, format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  handle('import:excel', async () => {
    const picked = await native.pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!picked) return null;
    return readWorkbook(Buffer.from(picked.bytes));
  });
}

// ───────── window.mizan ─────────

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const h = handlers.get(channel);
  if (!h) throw new Error(`قناة غير معروفة: ${channel}`);
  if (!h.allowLocked && licenseBlocked()) throw new Error(licenseBlocked()!);
  // نسخة منفصلة من البيانات متل الكمبيوتر (IPC بينسخ)، حتى ما تعدّل الواجهة حالة الشركة مباشرة
  const value = await (h.fn as (...a: unknown[]) => unknown)(...structuredClone(args));
  return value === undefined ? undefined : structuredClone(value);
}

const EVENTS = ['company:events', 'company:reset', 'company:closed', 'license:changed', 'lan:error', 'display:update'];

export async function startHost(): Promise<void> {
  const machineId = await native.machineId();
  const feedUrls = IS_TEST_BUILD ? (localStorage.getItem('wazn.testFeed') ? [localStorage.getItem('wazn.testFeed')!] : []) : LICENSE_FEED_URLS;
  license = new LicenseManager({ dataDir: USER_DATA, publicKey: LICENSE_PUBLIC_KEY, feedUrls, appVersion: __APP_VERSION__, machineId });
  licenseStatus();
  registerHandlers();
  (window as unknown as { mizan: unknown }).mizan = {
    invoke,
    on: (channel: string, fn: Listener) => {
      if (!EVENTS.includes(channel)) throw new Error('قناة غير معروفة');
      let set = listeners.get(channel);
      if (!set) listeners.set(channel, (set = new Set()));
      set.add(fn);
      return () => set!.delete(fn);
    },
  };
  void refreshLicense();
  setInterval(() => void refreshLicense(), FEED_CHECK_HOURS * 3600_000);
  native.onResume(() => void refreshLicense());
  // قبل ما يروح التطبيق للخلفية: منتأكد إنو كل شي انحفظ
  native.onPause(() => void flushVfs().catch(() => undefined));
}
