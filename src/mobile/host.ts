// «العملية الرئيسية» لنسخة الموبايل: نفس قنوات window.mizan تبع الكمبيوتر، بس كلها جوا التطبيق.
// تخزين الشركات والتشفير والترخيص والصلاحيات هو نفس كود الكمبيوتر حرفياً (src/storage، src/license، src/app/executor).
// الموبايل نسخة مستقلة: ما في شبكة محلية ولا شاشة زبون، والطباعة والتصدير عبر أندرويد.
import { Buffer } from 'buffer';
import path from 'path-browserify';
import { ACTIVITIES, can, chartFor, DEFAULT_CURRENCIES, defaultTaxes, PERMISSIONS, whatsappUrl, type Activity, type CompanyEvent, type Permission, type User } from '../core';
import { CloudSessions, CLOUD_MIN_DEVICES } from '../app/cloud-sessions';
import { execute } from '../app/executor';
import { OFFLINE, type CloudClient } from '../cloud/client';
import { newCloudCode, normalizeCloudCode } from '../cloud/code';
import { FEED_CHECK_HOURS, LICENSE_FEED_URLS, LICENSE_REDEEM_URLS } from '../license/config';
import { normalizeShortCode } from '../license/format';
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
  /** الاتصال عن بعد كجهاز رئيسي: رمز لكل شركة. */
  cloud?: Record<string, string>;
  /** آخر رمز اتصلنا فيه بجهاز رئيسي عن بعد (حتى ما ينكتب كل مرة). */
  lastCloud?: { code: string; username: string; name?: string };
  /** للعمل والجهاز الرئيسي مطفي: بصمة كلمة السر لكل (رمز + حساب) دخل قبل، والعمليات المأجّلة. */
  cloudOffline?: Record<string, { verifier: string; pending?: { id: string; method: string; at: number }[] }>;
}

type Listener = (payload: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
/** صفحة التحميل بالموقع (زر للجوال وزر للكمبيوتر)، ورابط تطبيق أندرويد الثابت. */
const UPDATE_PAGE = 'https://waznsy.com/get.html';
const APK_URL = 'https://github.com/Akyedgam3/mizan-updates/releases/latest/download/Wazn.apk';
const send = (channel: string, payload?: unknown) => listeners.get(channel)?.forEach((fn) => fn(payload));

let store: CompanyStore | null = null;
let unsubscribe: (() => void) | null = null;
let license: LicenseManager;
let lastLicense: LicenseStatus | null = null;
// جوال متصل عن بعد بجهاز رئيسي (بدل شركة محلية)
let remote: CloudClient | null = null;
const cloudSessions = new CloudSessions(() => activeStore(), () => Math.max(CLOUD_MIN_DEVICES, (lastLicense ?? licenseStatus()).devices - 1));

// ───────── الإعدادات ─────────

const settingsFile = `${USER_DATA}/settings.json`;

function readSettings(): Settings {
  let s: Partial<Settings> = {};
  try {
    s = JSON.parse(fs.readFileSync(settingsFile, 'utf8') as string);
  } catch {
    // أول تشغيل
  }
  const full: Settings = { ...s, deviceId: s.deviceId ?? crypto.randomUUID(), recent: s.recent ?? [] };
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
  if (!before || before.locked !== now.locked || before.message !== now.message || before.daysLeft !== now.daysLeft || before.devices !== now.devices || before.cloud !== now.cloud || before.expiresAt !== now.expiresAt || before.update?.version !== now.update?.version) {
    send('license:changed', now);
  }
  if (now.locked && store && !remote) {
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
  cloudSessions.clear();
  if (remote) {
    void remote.close();
    remote = null;
  }
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
  if (remote) return { kind: 'remote' as const, user: remote.user!, company: remote.companyName, address: 'عن بعد', cloud: { offline: remote.offline, syncedAt: remote.syncedAt, pending: remote.pending.length } };
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

  handle('license:activate', async (key: string) => {
    // كود قصير (16 حرف) أو المفتاح الطويل
    const s = normalizeShortCode(String(key ?? '')) ? await license.activateCode(String(key)) : license.activate(key);
    lastLicense = s;
    void refreshLicense();
    return s;
  }, { allowLocked: true });

  handle('license:refresh', async () => {
    await refreshLicense();
    return lastLicense;
  }, { allowLocked: true });

  // تحديث أندرويد: التطبيق بينزّل الملف بحالو ويفحصه قبل التنصيب (ما في ملفات ناقصة أو مبعوتة على واتساب)
  let updateReady: string | null = null;
  const UPDATE_ERRORS: Record<string, (m: string) => string> = {
    space: (m) => `المساحة الفاضية على الجوال ما بتكفي للتحديث. فضّي حوالي ${m} ميغا (صور أو فيديوهات أو تطبيقات ما بتلزم) وجرّب مرة تانية.`,
    corrupt: () => 'ملف التحديث ما نزل كامل (النت ضعيف أو انقطع). جرّب مرة تانية على نت أقوى.',
    network: () => 'ما قدرنا نوصل لملف التحديث. تأكد من النت وجرّب مرة تانية، أو نزّله من الموقع.',
    old: (m) => `الملف اللي نزل نسخته ${m} ومش أحدث من نسختك. جرّب بعد شوي.`,
    package: () => 'الملف اللي نزل مش تطبيق وزن. نزّله من الموقع الرسمي.',
    signature: () => 'الملف اللي نزل مش من نسخة وزن الرسمية، فما رح ننصّبه. نزّله من الموقع الرسمي.',
  };
  handle('app:openUpdate', async () => {
    const u = (lastLicense ?? licenseStatus()).update;
    if (!u) throw new Error('لا يوجد تحديث');
    if (!native.canSelfUpdate()) {
      await native.openUrl(UPDATE_PAGE);
      return 'browser';
    }
    if (updateReady !== u.version) {
      // رابط القائمة عادةً لملف الكمبيوتر أو صفحة التحميل: الجوال دايماً بياخد تطبيق أندرويد
      const url = /\.apk(\?|$)/i.test(u.url) ? u.url : APK_URL;
      try {
        await native.downloadUpdate(url, (done, total) => send('update:progress', { done, total }));
      } catch (e) {
        const err = e as Error & { code?: string };
        throw new Error((UPDATE_ERRORS[err.code ?? ''] ?? UPDATE_ERRORS.network!)(err.message));
      } finally {
        send('update:progress', null);
      }
      updateReady = u.version;
    }
    const r = await native.installUpdate();
    return r.needPermission ? 'permission' : 'installing';
  }, { allowLocked: true });

  handle('app:whatsapp', async (phone: unknown, text: unknown) => {
    await native.openUrl(whatsappUrl(String(phone ?? ''), String(text ?? '')));
    return true;
  });

  handle('app:openUpdatePage', async () => {
    await native.openUrl(UPDATE_PAGE);
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
    if (remote) return remote.snapshot();
    const s = activeStore();
    return { state: s.ledger.state, seq: s.lastSeq };
  });
  handle('company:call', (method: string, args: unknown[]) => {
    if (remote) return remote.call(method, args);
    const s = activeStore();
    return execute(s, currentUser(s), method, args);
  });

  // نسخة احتياطية: داخلية، أو ملف بينبعت (واتساب، درايف، فلاشة...)
  handle('company:backup', async (toExternal: boolean) => {
    if (remote) {
      // جوال بعيد: النسخة من الجهاز الرئيسي عبر السحابة
      const bytes = await remote.backup();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      return native.shareFile(`Wazn-${safeFolderName(remote.companyName)}-${stamp}.wazn`, bytes, 'application/octet-stream');
    }
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

  handle('device:scan', () => native.scanBarcode(), { allowLocked: true });

  // ── الاتصال عن بعد (خدمة إضافية) ──
  // جهاز رئيسي: نفس قنوات الكمبيوتر
  const cloudCode = (): string | null => readSettings().cloud?.[activeStore().meta.id] ?? null;
  const cloudStatus = () => ({ available: (lastLicense ?? licenseStatus()).cloud, enabled: !!cloudCode(), code: cloudCode(), devices: cloudSessions.devices() });
  const requireCloud = () => {
    if (!(lastLicense ?? licenseStatus()).cloud) throw new Error('خدمة الاتصال عن بعد غير مفعّلة في ترخيصك');
  };
  handle('cloud:status', () => {
    requirePermission('settings.manage');
    return cloudStatus();
  });
  handle('cloud:setup', (enable: boolean, newCode?: boolean) => {
    requirePermission('settings.manage');
    const id = activeStore().meta.id;
    if (enable) requireCloud();
    const s = readSettings();
    const all = { ...s.cloud };
    if (!enable) delete all[id];
    else if (newCode || !all[id]) all[id] = newCloudCode();
    s.cloud = all;
    writeSettings(s);
    cloudSessions.clear();
    return cloudStatus();
  });
  handle('cloud:hostConfig', () => {
    if (!store || remote || !(lastLicense ?? licenseStatus()).cloud) return null;
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
  handle('cloud:hostBackup', (token: string) => {
    requireCloud();
    const dir = activeStore().dir;
    return cloudSessions.backup(String(token), (f) => (fs.existsSync(path.join(dir, f)) ? new Uint8Array(fs.readFileSync(path.join(dir, f)) as Uint8Array) : null));
  });
  handle('cloud:hostState', () => {
    requireCloud();
    return cloudSessions.fullState();
  });
  handle('cloud:hostQueued', (username: string, password: string, method: string, args: unknown[]) => {
    requireCloud();
    return cloudSessions.runQueued(String(username), String(password), String(method), Array.isArray(args) ? args : []);
  });

  // جوال بعيد: بيشتغل على بيانات الجهاز الرئيسي وبترخيصه (متل الأجهزة الفرعية على الشبكة)
  handle('cloud:last', () => readSettings().lastCloud ?? null, { allowLocked: true });
  handle('cloud:forget', () => {
    const s = readSettings();
    delete s.lastCloud;
    writeSettings(s);
    return true;
  }, { allowLocked: true });
  handle('cloud:connect', async (o: { code?: string; username?: string; password: string; saved?: boolean }) => {
    // saved = آخر اتصال محفوظ: بيكفي كلمة السر
    const last = readSettings().lastCloud;
    if (o?.saved && !last) throw new Error('ما في اتصال محفوظ، دخّل الرمز مرة وحدة');
    if (o?.saved) o = { ...o, code: last!.code, username: last!.username };
    const code = normalizeCloudCode(String(o?.code ?? ''));
    if (!code) throw new Error('رمز الاتصال غير صحيح. انسخه أو امسحه من الجهاز الرئيسي (الإعدادات ← الاتصال عن بعد).');
    closeStore();
    const [{ CloudClient }, { FirestoreTransport }, { cloudRoom }] = await Promise.all([import('../cloud/client'), import('../cloud/firestore'), import('../cloud/code')]);
    const s = readSettings();
    const room = await cloudRoom(code);
    const client = new CloudClient(new FirestoreTransport(), room, { username: String(o.username ?? ''), password: String(o.password ?? ''), deviceId: s.deviceId, deviceName: 'جوال' });
    const key = `${room.room}|${String(o.username ?? '').trim().toLowerCase()}`;
    const saved = s.cloudOffline?.[key];
    let online = true;
    try {
      await client.ping();
    } catch (e) {
      if ((e as Error).message !== OFFLINE) throw e;
      online = false;
    }
    if (online) {
      await client.login();
      client.pending = saved?.pending ?? [];
    } else {
      // الجهاز الرئيسي مطفي: منفتح آخر نسخة محفوظة، والعمليات الجديدة بتستنى ليرجع
      await client.openOffline(saved?.verifier, saved?.pending ?? []);
    }
    remote = client;
    const persist = () => {
      const cur = readSettings();
      cur.cloudOffline = { ...cur.cloudOffline, [key]: { verifier: cur.cloudOffline?.[key]?.verifier ?? saved?.verifier ?? '', pending: client.pending } };
      writeSettings(cur);
    };
    client.onMode = () => {
      persist();
      send('cloud:mode', { offline: client.offline, syncedAt: client.syncedAt, pending: client.pending.length });
    };
    client.onQueueReport = (r) => {
      const fails = r.failed.map((f) => `• ${f.error}`).join('\n');
      send(r.failed.length ? 'lan:error' : 'cloud:notice', r.failed.length ? `رجع الجهاز الرئيسي: تنفّذت ${r.done} عملية، وما تنفّذت ${r.failed.length}:\n${fails}` : `رجع الجهاز الرئيسي وتنفّذت كل العمليات اللي انعملت وهو مطفي (${r.done}).`);
    };
    client.listen(
      (items) => send('company:events', structuredClone(items)),
      () => send('company:reset'),
      (message) => send('lan:error', message),
    );
    if (online) {
      const v = await client.verifier();
      const cur = readSettings();
      cur.cloudOffline = { ...cur.cloudOffline, [key]: { verifier: v, pending: client.pending } };
      writeSettings(cur);
      client.collectQueued();
    }
    const latest = readSettings();
    latest.lastCloud = { code, username: String(o.username ?? ''), name: client.companyName };
    writeSettings(latest);
    return sessionInfo();
  }, { allowLocked: true });

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
  if (!h.allowLocked && licenseBlocked() && !remote) throw new Error(licenseBlocked()!);
  // نسخة منفصلة من البيانات متل الكمبيوتر (IPC بينسخ)، حتى ما تعدّل الواجهة حالة الشركة مباشرة
  const value = await (h.fn as (...a: unknown[]) => unknown)(...structuredClone(args));
  return value === undefined ? undefined : structuredClone(value);
}

const EVENTS = ['update:progress', 'company:events', 'company:reset', 'company:closed', 'license:changed', 'lan:error', 'display:update', 'cloud:mode', 'cloud:notice'];

export async function startHost(): Promise<void> {
  const machineId = await native.machineId();
  const feedUrls = IS_TEST_BUILD ? (localStorage.getItem('wazn.testFeed') ? [localStorage.getItem('wazn.testFeed')!] : []) : LICENSE_FEED_URLS;
  const redeemUrls = IS_TEST_BUILD ? (localStorage.getItem('wazn.testRedeem') ? [localStorage.getItem('wazn.testRedeem')!] : []) : LICENSE_REDEEM_URLS;
  license = new LicenseManager({ dataDir: USER_DATA, publicKey: LICENSE_PUBLIC_KEY, feedUrls, redeemUrls, appVersion: __APP_VERSION__, machineId });
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
