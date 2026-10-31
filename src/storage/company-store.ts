import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ledger, applyEvent, emptyState, resetEvents, type ResetMode } from '../core/ledger';
import type { Currency } from '../core/money';
import type { Account, CompanyEvent, CompanyInfo, CompanyState, Tax, User, Warehouse } from '../core/types';
import { hmac, newRecoveryCode, normalizeRecoveryCode, open, randomKey, safeEqual, seal, sha256, unwrapKey, wrapKey, type Sealed, type WrappedKey } from './crypto';

// كل شركة = مجلد على جهاز المستخدم، بدون أي قاعدة بيانات، وكل محتواه مشفّر:
//   company.json   معلومات عامة (الاسم، الإصدار) — غير سرية
//   keyring.json   مفتاح البيانات مغلّفاً بكلمة سر كل مستخدم وبرمز الاسترداد
//   journal.mzl    سجل الأحداث: سطر مشفّر لكل عملية، لا يُعدَّل ولا يُحذف منه، مربوط بسلسلة بصمات
//   head.json      آخر رقم وبصمة في السجل (موقّع) لكشف حذف عمليات من آخر الملف
//   snapshot.enc   لقطة مشفّرة من الحالة لتسريع الفتح (يمكن حذفها وإعادة بنائها من السجل)
//   backups/       النسخ الاحتياطية التلقائية
//   .lock          يمنع فتح الشركة من نسختين من البرنامج في نفس الوقت

export const FORMAT_VERSION = 2;
const JOURNAL = 'journal.mzl';
const SNAPSHOT = 'snapshot.enc';
const META = 'company.json';
const KEYRING = 'keyring.json';
const HEAD = 'head.json';
const LOCK = '.lock';
const SNAPSHOT_EVERY = 500;
const GENESIS = '0'.repeat(64);

interface JournalRecord extends Sealed {
  seq: number;
  at: string;
  by: string;
  prev: string;
  hash: string;
}

interface Snapshot {
  seq: number;
  hash: string;
  state: CompanyState;
  /** نسخة طريقة بناء الحالة: لما يتصلّح شي بتطبيق الأحداث منرفعها، فاللقطة القديمة بتنهمل وبتنبنى الحالة من السجل من جديد. */
  v?: number;
}
// 2: إلغاء التحويل كان يضيّع الأرقام التسلسلية (1.2.48)
const STATE_VERSION = 2;

interface KeyEntry extends WrappedKey {
  userId: string;
  username: string;
}

interface Keyring {
  version: 1;
  users: KeyEntry[];
  recovery: WrappedKey;
}

export interface CompanyMeta {
  format: number;
  app: 'mizan';
  id: string;
  name: string;
  activity?: string;
  createdAt: string;
}

export interface Credentials {
  username?: string;
  password?: string;
  recoveryCode?: string;
}

function recordHash(r: Omit<JournalRecord, 'hash'>): string {
  return sha256(JSON.stringify([r.seq, r.at, r.by, r.prev, r.iv, r.ct, r.tag]));
}

function writeAtomic(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** القفل يُجدَّد كل 20 ثانية؛ القفل الأقدم من دقيقتين بقايا جلسة توقفت فجأة. */
const LOCK_HEARTBEAT_MS = 20_000;
const LOCK_STALE_MS = 120_000;

function acquireLock(dir: string): void {
  const file = path.join(dir, LOCK);
  const mine = JSON.stringify({ pid: process.pid, host: os.hostname() });
  try {
    fs.writeFileSync(file, mine, { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    let owner: { pid?: number; host?: string } = {};
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      owner = raw.startsWith('{') ? JSON.parse(raw) : { pid: Number(raw) };
    } catch {
      owner = {};
    }
    const fresh = Date.now() - fs.statSync(file).mtimeMs < LOCK_STALE_MS;
    // مجلد على جهاز آخر في الشبكة: لا نستطيع فحص برنامجه، فنعتبره مفتوحاً ما دام قفله حديثاً
    const otherHost = !!owner.host && owner.host !== os.hostname();
    const busy = fresh && (otherHost ? true : !!owner.pid && owner.pid !== process.pid && isAlive(owner.pid));
    if (busy) {
      throw new Error(otherHost ? `الشركة مفتوحة حالياً على جهاز آخر (${owner.host}). للعمل من أكثر من جهاز استخدم الشبكة المحلية.` : 'الشركة مفتوحة حالياً من نسخة أخرى من البرنامج');
    }
    fs.writeFileSync(file, mine); // قفل قديم من جلسة أُغلقت بشكل مفاجئ
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** يقرأ ملف JSON، أو null إن كان تالفاً (انقطاع كهرباء أثناء حفظه). */
function readJsonSafe<T>(file: string): T | null {
  try {
    return readJson<T>(file);
  } catch {
    return null;
  }
}

/** معلومات الشركة العامة وأسماء المستخدمين (لشاشة الدخول) دون فك التشفير. */
export function peekCompany(dir: string): { meta: CompanyMeta; usernames: string[] } {
  const metaFile = path.join(dir, META);
  if (!fs.existsSync(metaFile)) throw new Error('المجلد لا يحتوي ملف شركة');
  const meta = readJson<CompanyMeta>(metaFile);
  if (meta.app !== 'mizan') throw new Error('الملف ليس ملف شركة وزن');
  if (meta.format > FORMAT_VERSION) throw new Error('ملف الشركة من إصدار أحدث من البرنامج، يرجى التحديث');
  if (meta.format < FORMAT_VERSION) throw new Error('ملف الشركة من إصدار تجريبي قديم غير مشفّر ولا يمكن فتحه');
  const keyring = readJson<Keyring>(path.join(dir, KEYRING));
  return { meta, usernames: keyring.users.map((u) => u.username) };
}

export interface CreateOptions {
  info: CompanyInfo;
  currencies: Currency[];
  accounts?: Account[];
  taxes?: Tax[];
  warehouses?: Warehouse[];
  owner: { username: string; displayName: string; password: string };
}

export class CompanyStore {
  readonly ledger: Ledger;
  /** المستخدم الذي فتح الشركة. */
  user: User;
  private fd: number;
  private seq: number;
  private lastHash: string;
  private sinceSnapshot = 0;
  private listeners = new Set<(event: CompanyEvent, seq: number) => void>();
  private heartbeat: ReturnType<typeof setInterval>;
  /** true إن أُزيلت عملية ناقصة من نهاية السجل عند الفتح (انقطاع كهرباء أثناء الكتابة). */
  readonly recoveredTail: boolean;
  /** true إن فُتحت الشركة برمز الاسترداد (يجب تعيين كلمة سر جديدة). */
  readonly viaRecovery: boolean;

  private constructor(
    readonly dir: string,
    private readonly key: Buffer,
    private keyring: Keyring,
    readonly meta: CompanyMeta,
    state: CompanyState,
    seq: number,
    lastHash: string,
    opts: { recoveredTail: boolean; viaRecovery: boolean; user: User },
  ) {
    this.seq = seq;
    this.lastHash = lastHash;
    this.recoveredTail = opts.recoveredTail;
    this.viaRecovery = opts.viaRecovery;
    this.user = opts.user;
    this.fd = fs.openSync(path.join(dir, JOURNAL), 'a');
    const lock = path.join(dir, LOCK);
    this.heartbeat = setInterval(() => {
      try {
        const now = new Date();
        fs.utimesSync(lock, now, now);
      } catch {
        // لا شيء: القفل يُعاد إنشاؤه عند الفتح القادم
      }
    }, LOCK_HEARTBEAT_MS);
    this.heartbeat.unref?.();
    this.ledger = new Ledger((event) => this.append(event), state);
    this.ledger.actor = opts.user.id;
  }

  /** إنشاء شركة جديدة مشفّرة. يعيد رمز الاسترداد الذي يجب أن يحفظه المالك. */
  static create(dir: string, o: CreateOptions): { store: CompanyStore; recoveryCode: string } {
    if (fs.existsSync(path.join(dir, JOURNAL))) throw new Error('يوجد ملف شركة في هذا المجلد مسبقاً');
    if (o.owner.password.length < 6) throw new Error('كلمة السر يجب أن تكون 6 أحرف على الأقل');
    fs.mkdirSync(dir, { recursive: true });
    acquireLock(dir);
    const key = randomKey();
    const recoveryCode = newRecoveryCode();
    const owner: User = { id: crypto.randomUUID(), username: o.owner.username.trim(), displayName: o.owner.displayName.trim(), role: 'owner', active: true };
    const keyring: Keyring = {
      version: 1,
      users: [{ userId: owner.id, username: owner.username, ...wrapKey(key, o.owner.password) }],
      recovery: wrapKey(key, recoveryCode),
    };
    const meta: CompanyMeta = {
      format: FORMAT_VERSION,
      app: 'mizan',
      id: crypto.randomUUID(),
      name: o.info.name,
      ...(o.info.activity ? { activity: o.info.activity } : {}),
      createdAt: new Date().toISOString(),
    };
    writeAtomic(path.join(dir, META), JSON.stringify(meta, null, 2));
    writeAtomic(path.join(dir, KEYRING), JSON.stringify(keyring, null, 2));
    fs.writeFileSync(path.join(dir, JOURNAL), '');
    const store = new CompanyStore(dir, key, keyring, meta, emptyState(), 0, GENESIS, { recoveredTail: false, viaRecovery: false, user: owner });
    store.ledger.createCompany(o.info, o.currencies, o.accounts ?? [], o.taxes ?? [], o.warehouses, owner);
    return { store, recoveryCode };
  }

  static open(dir: string, creds: Credentials): CompanyStore {
    const { meta } = peekCompany(dir);
    const keyring = readJson<Keyring>(path.join(dir, KEYRING));
    let key: Buffer | null = null;
    let userId: string | null = null;
    if (creds.recoveryCode) {
      key = unwrapKey(keyring.recovery, normalizeRecoveryCode(creds.recoveryCode));
      if (!key) throw new Error('رمز الاسترداد غير صحيح');
    } else {
      const entry = keyring.users.find((u) => u.username.toLowerCase() === (creds.username ?? '').trim().toLowerCase());
      key = entry ? unwrapKey(entry, creds.password ?? '') : null;
      if (!entry || !key) throw new Error('اسم المستخدم أو كلمة السر غير صحيحة');
      userId = entry.userId;
    }
    acquireLock(dir);
    try {
      const { state, seq, hash, recoveredTail, replayed } = CompanyStore.load(dir, key);
      const user = userId ? state.users[userId] : Object.values(state.users).find((u) => u.role === 'owner' && u.active);
      if (!user) throw new Error('المستخدم غير موجود');
      if (!user.active) throw new Error('هذا المستخدم موقوف');
      const store = new CompanyStore(dir, key, keyring, meta, state, seq, hash, { recoveredTail, viaRecovery: !userId, user });
      store.sinceSnapshot = replayed;
      return store;
    } catch (e) {
      fs.rmSync(path.join(dir, LOCK), { force: true });
      throw e;
    }
  }

  private static load(dir: string, key: Buffer) {
    const journalFile = path.join(dir, JOURNAL);
    const lines = fs.readFileSync(journalFile, 'utf8').split('\n');

    let snapshot: Snapshot | null = null;
    try {
      snapshot = JSON.parse(open(key, readJson<Sealed>(path.join(dir, SNAPSHOT)), 'snapshot').toString('utf8'));
      if (snapshot?.v !== STATE_VERSION) snapshot = null;
    } catch {
      snapshot = null; // اللقطة اختيارية، نعيد البناء من السجل
    }

    const events: CompanyEvent[] = [];
    let snapshotAt = -1;
    let prev = GENESIS;
    let offset = 0;
    let recoveredTail = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const isLast = i === lines.length - 1;
      if (raw === '') {
        if (!isLast) throw new Error(`سجل الشركة تالف: سطر فارغ رقم ${i + 1}`);
        break;
      }
      let rec: JournalRecord;
      try {
        rec = JSON.parse(raw);
      } catch {
        // سطر ناقص في نهاية الملف فقط = كتابة انقطعت (انقطاع كهرباء)؛ نزيله. أي مكان آخر = تلف.
        if (isLast) {
          fs.truncateSync(journalFile, offset);
          recoveredTail = true;
          break;
        }
        throw new Error(`سجل الشركة تالف عند السطر ${i + 1}`);
      }
      const seq = events.length + 1;
      if (rec.seq !== seq || rec.prev !== prev || recordHash(rec) !== rec.hash) {
        throw new Error(`تم العبث بسجل الشركة أو أنه تالف عند العملية رقم ${seq}`);
      }
      let event: CompanyEvent;
      try {
        event = JSON.parse(open(key, rec, `${rec.seq}|${rec.prev}`).toString('utf8'));
      } catch {
        throw new Error(`تم العبث بسجل الشركة عند العملية رقم ${seq}`);
      }
      events.push(event);
      prev = rec.hash;
      if (snapshot && snapshot.seq === seq && snapshot.hash === prev) snapshotAt = seq;
      offset += Buffer.byteLength(raw, 'utf8') + 1;
    }

    // كشف حذف عمليات من آخر السجل: السجل يجب ألا يكون أقصر من آخر رأس موقّع
    const headFile = path.join(dir, HEAD);
    const head = fs.existsSync(headFile) ? readJsonSafe<{ seq: number; hash: string; mac: string }>(headFile) : null;
    if (head) {
      if (!safeEqual(head.mac, hmac(key, `${head.seq}|${head.hash}`))) throw new Error('ملف رأس السجل معدّل');
      if (events.length < head.seq) {
        throw new Error(`سجل الشركة ناقص: آخر عملية محفوظة ${head.seq} والموجود ${events.length}. استرجع نسخة احتياطية.`);
      }
    }

    // دمج مع الحالة الفارغة حتى تعمل اللقطات القديمة بعد إضافة أنواع مستندات جديدة
    const state = snapshotAt > 0 ? { ...emptyState(), ...snapshot!.state } : emptyState();
    const replay = events.slice(Math.max(snapshotAt, 0));
    for (const event of replay) applyEvent(state, event);
    return { state, seq: events.length, hash: prev, recoveredTail, replayed: replay.length };
  }

  private append(event: CompanyEvent): void {
    if (this.fd < 0) throw new Error('الشركة مغلقة');
    const seq = this.seq + 1;
    const base = { seq, at: new Date().toISOString(), by: this.ledger.actor, prev: this.lastHash, ...seal(this.key, JSON.stringify(event), `${seq}|${this.lastHash}`) };
    const record: JournalRecord = { ...base, hash: recordHash(base) };
    const size = fs.fstatSync(this.fd).size;
    try {
      fs.writeSync(this.fd, JSON.stringify(record) + '\n');
      fs.fsyncSync(this.fd); // لا نعتبر العملية محفوظة قبل وصولها للقرص
    } catch (e) {
      // كتابة ناقصة (القرص ممتلئ مثلاً): نعيد الملف كما كان حتى لا تلتصق بها العملية التالية
      // على ويندوز ملف الإضافة لا يقبل القص، فنغلقه ونقصّه بالمسار ثم نعيد فتحه
      const file = path.join(this.dir, JOURNAL);
      try {
        fs.closeSync(this.fd);
      } catch {
        // مغلق مسبقاً
      }
      try {
        fs.truncateSync(file, size);
      } catch {
        // إن فشل القص أيضاً يصلحه الفتح القادم (يزيل السطر الناقص الأخير)
      }
      this.fd = fs.openSync(file, 'a');
      throw new Error(`تعذّر الحفظ على القرص (${(e as NodeJS.ErrnoException).code ?? 'خطأ'}). تأكد من وجود مساحة كافية ثم أعد المحاولة.`);
    }
    this.seq = seq;
    this.lastHash = record.hash;
    try {
      // الرأس الموقّع لكشف حذف عمليات من آخر السجل؛ السجل نفسه هو الأصل، ففشل حفظ الرأس لا يلغي العملية
      writeAtomic(path.join(this.dir, HEAD), JSON.stringify({ seq, hash: record.hash, mac: hmac(this.key, `${seq}|${record.hash}`) }));
    } catch {
      // يُعاد حفظه مع العملية التالية
    }
    // التطبيق على الحالة يحدث بعد العودة من هنا؛ نؤجل الإشعار واللقطة حتى ينتهي،
    // ونثبّت قائمة المشتركين الآن حتى لا يصل الحدث لمن اشترك بعده
    const listeners = [...this.listeners];
    queueMicrotask(() => {
      for (const fn of listeners) {
        try {
          fn(event, seq);
        } catch (err) {
          console.error('event listener failed', err);
        }
      }
      if (++this.sinceSnapshot >= SNAPSHOT_EVERY) {
        try {
          this.snapshot();
        } catch (err) {
          // اللقطة لتسريع الفتح فقط (قد يمنعها برنامج حماية أو OneDrive مؤقتاً)
          console.error('snapshot failed', err);
        }
      }
    });
  }

  /** الاشتراك بالأحداث الجديدة (لتحديث الواجهة والأجهزة المتصلة). */
  onEvent(fn: (event: CompanyEvent, seq: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** يحفظ لقطة مشفّرة من الحالة الحالية لتسريع الفتح القادم. */
  snapshot(): void {
    if (this.fd < 0) return;
    const snap: Snapshot = { seq: this.seq, hash: this.lastHash, state: this.ledger.state, v: STATE_VERSION };
    writeAtomic(path.join(this.dir, SNAPSHOT), JSON.stringify(seal(this.key, JSON.stringify(snap), 'snapshot')));
    this.sinceSnapshot = 0;
  }

  // ───────────── كلمات السر ─────────────

  private saveKeyring(): void {
    writeAtomic(path.join(this.dir, KEYRING), JSON.stringify(this.keyring, null, 2));
  }

  /** تعيين/تغيير كلمة سر مستخدم (يجب أن يكون محفوظاً في الشركة). */
  setPassword(userId: string, password: string): void {
    const user = this.ledger.state.users[userId];
    if (!user) throw new Error('المستخدم غير موجود');
    if (password.length < 6) throw new Error('كلمة السر يجب أن تكون 6 أحرف على الأقل');
    this.keyring.users = this.keyring.users.filter((u) => u.userId !== userId);
    this.keyring.users.push({ userId, username: user.username, ...wrapKey(this.key, password) });
    this.saveKeyring();
  }

  /** بعد تغيير اسم المستخدم أو إيقافه: تحديث سلسلة المفاتيح. */
  syncUser(userId: string): void {
    const user = this.ledger.state.users[userId];
    if (!user || !user.active) {
      this.keyring.users = this.keyring.users.filter((u) => u.userId !== userId);
    } else {
      for (const e of this.keyring.users) if (e.userId === userId) e.username = user.username;
    }
    this.saveKeyring();
  }

  hasPassword(userId: string): boolean {
    return this.keyring.users.some((u) => u.userId === userId);
  }

  /** التحقق من كلمة سر (لشاشة القفل أو أجهزة الشبكة). يعيد المستخدم إن كانت صحيحة. */
  verify(username: string, password: string): User | null {
    const entry = this.keyring.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!entry || !unwrapKey(entry, password)) return null;
    const user = this.ledger.state.users[entry.userId];
    return user?.active ? user : null;
  }

  /** رمز استرداد جديد (يُبطل القديم). */
  rotateRecoveryCode(): string {
    const code = newRecoveryCode();
    this.keyring.recovery = wrapKey(this.key, code);
    this.saveKeyring();
    return code;
  }

  // ───────────── النسخ الاحتياطي ─────────────

  /**
   * نسخة احتياطية كاملة (مشفّرة كما هي) إلى مجلد داخل الشركة افتراضياً، أو فلاشة/قرص آخر.
   * تُحفظ آخر `keep` نسخ فقط في مجلد النسخ الافتراضي.
   */
  backup(destRoot = path.join(this.dir, 'backups'), keep = 30): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(destRoot, stamp);
    fs.mkdirSync(dest, { recursive: true });
    for (const file of [META, KEYRING, JOURNAL, HEAD]) {
      if (fs.existsSync(path.join(this.dir, file))) fs.copyFileSync(path.join(this.dir, file), path.join(dest, file));
    }
    if (destRoot === path.join(this.dir, 'backups')) {
      const all = fs.readdirSync(destRoot).sort();
      for (const old of all.slice(0, Math.max(0, all.length - keep))) {
        fs.rmSync(path.join(destRoot, old), { recursive: true, force: true });
      }
    }
    return dest;
  }

  // ───────────── التصفير ─────────────

  /**
   * تصفير الشركة: نسخة احتياطية كاملة أولاً، ثم سجل جديد مبني من البيانات المحفوظة
   * (نفس المفتاح وكلمات السر). يعيد مسار النسخة الاحتياطية حتى يقدر المستخدم يرجع لها.
   */
  reset(mode: ResetMode): string {
    if (this.fd < 0) throw new Error('الشركة مغلقة');
    const events = resetEvents(this.ledger.state, mode);
    // نتحقق من الأحداث على شركة فاضية قبل ما نلمس أي ملف
    const check = new Ledger(() => undefined);
    for (const event of events) check.emit(event);
    const backupDir = this.backup();

    let prev = GENESIS;
    const at = new Date().toISOString();
    const lines: string[] = [];
    events.forEach((event, i) => {
      const seq = i + 1;
      const base = { seq, at, by: this.ledger.actor, prev, ...seal(this.key, JSON.stringify(event), `${seq}|${prev}`) };
      const record: JournalRecord = { ...base, hash: recordHash(base) };
      lines.push(JSON.stringify(record));
      prev = record.hash;
    });
    const file = path.join(this.dir, JOURNAL);
    fs.closeSync(this.fd);
    this.fd = -1;
    try {
      writeAtomic(file, lines.join('\n') + '\n');
      fs.rmSync(path.join(this.dir, SNAPSHOT), { force: true });
      writeAtomic(path.join(this.dir, HEAD), JSON.stringify({ seq: events.length, hash: prev, mac: hmac(this.key, `${events.length}|${prev}`) }));
    } finally {
      this.fd = fs.openSync(file, 'a');
    }
    this.seq = events.length;
    this.lastHash = prev;
    // نفس كائن الحالة (الواجهة والشبكة ماسكينه)، بس بمحتوى جديد
    const state = this.ledger.state as unknown as Record<string, unknown>;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, check.state);
    this.snapshot();
    return backupDir;
  }

  get lastSeq(): number {
    return this.seq;
  }

  get isOpen(): boolean {
    return this.fd >= 0;
  }

  close(): void {
    if (this.fd < 0) return;
    clearInterval(this.heartbeat);
    try {
      this.snapshot();
    } catch (err) {
      console.error('snapshot failed', err);
    }
    fs.closeSync(this.fd);
    this.fd = -1;
    this.listeners.clear();
    fs.rmSync(path.join(this.dir, LOCK), { force: true });
  }
}
