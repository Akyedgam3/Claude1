import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Ledger, applyEvent, emptyState } from '../core/ledger';
import type { Currency } from '../core/money';
import type { Account, CompanyEvent, CompanyInfo, CompanyState, Tax } from '../core/types';

// كل شركة = مجلد على جهاز المستخدم، بدون أي قاعدة بيانات:
//   company.json   معلومات الملف
//   journal.mzl    سجل الأحداث (سطر JSON لكل عملية، لا يُعدَّل ولا يُحذف منه)
//   snapshot.json  لقطة من الحالة لتسريع الفتح (يمكن حذفها وإعادة بنائها من السجل)
//   backups/       النسخ الاحتياطية التلقائية
//   .lock          يمنع فتح الشركة من نسختين من البرنامج في نفس الوقت

const FORMAT_VERSION = 1;
const JOURNAL = 'journal.mzl';
const SNAPSHOT = 'snapshot.json';
const META = 'company.json';
const LOCK = '.lock';
const SNAPSHOT_EVERY = 500;
const GENESIS = '0'.repeat(64);

interface Record {
  seq: number;
  at: string;
  prev: string;
  event: CompanyEvent;
  hash: string;
}

interface Snapshot {
  seq: number;
  hash: string;
  state: CompanyState;
}

function hashOf(seq: number, at: string, prev: string, event: CompanyEvent): string {
  return createHash('sha256').update(JSON.stringify({ seq, at, prev, event })).digest('hex');
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

function acquireLock(dir: string): void {
  const file = path.join(dir, LOCK);
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    const owner = Number(fs.readFileSync(file, 'utf8'));
    if (owner && owner !== process.pid && isAlive(owner)) {
      throw new Error('الشركة مفتوحة حالياً من نسخة أخرى من البرنامج');
    }
    fs.writeFileSync(file, String(process.pid)); // قفل قديم من جلسة أُغلقت بشكل مفاجئ
  }
}

export class CompanyStore {
  readonly ledger: Ledger;
  private fd: number;
  private seq: number;
  private lastHash: string;
  private sinceSnapshot = 0;
  /** true إن أُزيلت عملية ناقصة من نهاية السجل عند الفتح (انقطاع كهرباء أثناء الكتابة). */
  readonly recoveredTail: boolean;

  private constructor(
    readonly dir: string,
    state: CompanyState,
    seq: number,
    lastHash: string,
    recoveredTail: boolean,
  ) {
    this.seq = seq;
    this.lastHash = lastHash;
    this.recoveredTail = recoveredTail;
    this.fd = fs.openSync(path.join(dir, JOURNAL), 'a');
    this.ledger = new Ledger((event) => this.append(event), state);
  }

  static create(
    dir: string,
    info: CompanyInfo,
    currencies: Currency[],
    accounts: Account[] = [],
    taxes: Tax[] = [],
  ): CompanyStore {
    if (fs.existsSync(path.join(dir, JOURNAL))) throw new Error('يوجد ملف شركة في هذا المجلد مسبقاً');
    fs.mkdirSync(dir, { recursive: true });
    acquireLock(dir);
    writeAtomic(
      path.join(dir, META),
      JSON.stringify({ format: FORMAT_VERSION, app: 'mizan', name: info.name, createdAt: new Date().toISOString() }, null, 2),
    );
    fs.writeFileSync(path.join(dir, JOURNAL), '');
    const store = new CompanyStore(dir, emptyState(), 0, GENESIS, false);
    store.ledger.createCompany(info, currencies, accounts, taxes);
    return store;
  }

  static open(dir: string): CompanyStore {
    const metaFile = path.join(dir, META);
    if (!fs.existsSync(metaFile)) throw new Error('المجلد لا يحتوي ملف شركة');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.format > FORMAT_VERSION) throw new Error('ملف الشركة من إصدار أحدث من البرنامج، يرجى التحديث');
    acquireLock(dir);
    try {
      return CompanyStore.load(dir);
    } catch (e) {
      fs.rmSync(path.join(dir, LOCK), { force: true });
      throw e;
    }
  }

  private static load(dir: string): CompanyStore {
    const journalFile = path.join(dir, JOURNAL);
    const lines = fs.readFileSync(journalFile, 'utf8').split('\n');

    let snapshot: Snapshot | null = null;
    try {
      snapshot = JSON.parse(fs.readFileSync(path.join(dir, SNAPSHOT), 'utf8'));
    } catch {
      snapshot = null; // اللقطة اختيارية، نعيد البناء من السجل
    }

    const events: CompanyEvent[] = [];
    let snapshotAt = -1; // عدد الأحداث التي تغطيها اللقطة إن كانت مطابقة للسجل
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
      let rec: Record;
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
      if (rec.seq !== seq || rec.prev !== prev || hashOf(rec.seq, rec.at, rec.prev, rec.event) !== rec.hash) {
        throw new Error(`تم العبث بسجل الشركة أو أنه تالف عند العملية رقم ${seq}`);
      }
      events.push(rec.event);
      prev = rec.hash;
      if (snapshot && snapshot.seq === seq && snapshot.hash === prev) snapshotAt = seq;
      offset += Buffer.byteLength(raw, 'utf8') + 1;
    }

    const state = snapshotAt > 0 ? snapshot!.state : emptyState();
    const replay = events.slice(Math.max(snapshotAt, 0));
    for (const event of replay) applyEvent(state, event);

    const store = new CompanyStore(dir, state, events.length, prev, recoveredTail);
    store.sinceSnapshot = replay.length;
    return store;
  }

  private append(event: CompanyEvent): void {
    const seq = this.seq + 1;
    const at = new Date().toISOString();
    const hash = hashOf(seq, at, this.lastHash, event);
    const record: Record = { seq, at, prev: this.lastHash, event, hash };
    fs.writeSync(this.fd, JSON.stringify(record) + '\n');
    fs.fsyncSync(this.fd); // لا نعتبر العملية محفوظة قبل وصولها للقرص
    this.seq = seq;
    this.lastHash = hash;
    // اللقطة تؤجَّل حتى ينتهي تطبيق الحدث على الحالة في الذاكرة
    if (++this.sinceSnapshot >= SNAPSHOT_EVERY) queueMicrotask(() => this.snapshot());
  }

  /** يحفظ لقطة من الحالة الحالية لتسريع الفتح القادم. */
  snapshot(): void {
    if (this.fd < 0) return;
    const snap: Snapshot = { seq: this.seq, hash: this.lastHash, state: this.ledger.state };
    writeAtomic(path.join(this.dir, SNAPSHOT), JSON.stringify(snap));
    this.sinceSnapshot = 0;
  }

  /**
   * نسخة احتياطية كاملة إلى مجلد (داخل الشركة افتراضياً، أو فلاشة/قرص آخر).
   * تُحفظ آخر `keep` نسخ فقط في مجلد النسخ الافتراضي.
   */
  backup(destRoot = path.join(this.dir, 'backups'), keep = 30): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(destRoot, stamp);
    fs.mkdirSync(dest, { recursive: true });
    for (const file of [META, JOURNAL]) fs.copyFileSync(path.join(this.dir, file), path.join(dest, file));
    if (destRoot === path.join(this.dir, 'backups')) {
      const all = fs.readdirSync(destRoot).sort();
      for (const old of all.slice(0, Math.max(0, all.length - keep))) {
        fs.rmSync(path.join(destRoot, old), { recursive: true, force: true });
      }
    }
    return dest;
  }

  get lastSeq(): number {
    return this.seq;
  }

  close(): void {
    if (this.fd < 0) return;
    this.snapshot();
    fs.closeSync(this.fd);
    this.fd = -1;
    fs.rmSync(path.join(this.dir, LOCK), { force: true });
  }
}
