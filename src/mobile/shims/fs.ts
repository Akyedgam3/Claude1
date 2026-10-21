// node:fs للموبايل: نظام ملفات بالذاكرة (متزامن متل node) بينحفظ بـ IndexedDB بالخلفية.
// كود تخزين الشركات (CompanyStore) والترخيص بيشتغل عليه بدون أي تعديل.
// القراءة كلها من الذاكرة؛ كل كتابة بتنضاف لطابور حفظ متسلسل، والإضافة لآخر ملف (سجل العمليات) بتنحفظ كقطعة لحالها.
import { Buffer } from 'buffer';
import path from 'path-browserify';

interface FileEntry {
  chunks: Uint8Array[];
  size: number;
  mtimeMs: number;
  stored: number; // عدد القطع المحفوظة بـ IndexedDB لهالملف
}

const files = new Map<string, FileEntry>();
const dirs = new Set<string>(['/']);
const fds = new Map<number, { file: string }>();
let nextFd = 10;

// ───────── الحفظ بـ IndexedDB ─────────

const DB = 'wazn-vfs';
let db: IDBDatabase | null = null;
let queue: Promise<unknown> = Promise.resolve();
let failed: Error | null = null;

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
const done = (t: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });

function persist(fn: (chunks: IDBObjectStore, meta: IDBObjectStore) => void): void {
  if (!db) return;
  const d = db;
  queue = queue
    .then(async () => {
      const t = d.transaction(['chunks', 'meta'], 'readwrite');
      fn(t.objectStore('chunks'), t.objectStore('meta'));
      await done(t);
    })
    .catch((e: Error) => {
      failed = e;
      console.error('vfs persist failed', e);
    });
}

const range = (file: string) => IDBKeyRange.bound([file, 0], [file, Number.MAX_SAFE_INTEGER]);

function saveWhole(file: string, e: FileEntry): void {
  const data = joined(e);
  e.chunks = [data];
  e.stored = 1;
  persist((c, m) => {
    c.delete(range(file));
    c.put(data, [file, 0]);
    m.put({ type: 'file', mtimeMs: e.mtimeMs }, file);
  });
}

function saveAppend(file: string, e: FileEntry, chunk: Uint8Array): void {
  const n = e.stored++;
  persist((c, m) => {
    c.put(chunk, [file, n]);
    m.put({ type: 'file', mtimeMs: e.mtimeMs }, file);
  });
}

function dropPersisted(p: string, recursive: boolean): void {
  persist((c, m) => {
    c.delete(range(p));
    m.delete(p);
    if (recursive) {
      const lo = p.endsWith('/') ? p : `${p}/`;
      const hi = `${lo}￿`;
      c.delete(IDBKeyRange.bound([lo, 0], [hi, Number.MAX_SAFE_INTEGER]));
      m.delete(IDBKeyRange.bound(lo, hi));
    }
  });
}

/** بيحمّل كل الملفات من IndexedDB للذاكرة. لازم يخلص قبل ما يشتغل البرنامج. */
export async function mountVfs(): Promise<void> {
  db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('chunks');
      r.result.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const t = db.transaction(['chunks', 'meta'], 'readonly');
  const metaKeys = (await req(t.objectStore('meta').getAllKeys())) as string[];
  const metaVals = (await req(t.objectStore('meta').getAll())) as { type: 'file' | 'dir'; mtimeMs?: number }[];
  const chunkKeys = (await req(t.objectStore('chunks').getAllKeys())) as [string, number][];
  const chunkVals = (await req(t.objectStore('chunks').getAll())) as Uint8Array[];
  metaKeys.forEach((k, i) => {
    const m = metaVals[i]!;
    if (m.type === 'dir') addDir(k);
    else {
      addDir(path.dirname(k));
      files.set(k, { chunks: [], size: 0, mtimeMs: m.mtimeMs ?? Date.now(), stored: 0 });
    }
  });
  chunkKeys.forEach(([file, n], i) => {
    const e = files.get(file);
    if (!e) return;
    e.chunks[n] = new Uint8Array(chunkVals[i]!);
    e.stored = Math.max(e.stored, n + 1);
  });
  for (const [file, e] of files) {
    e.chunks = e.chunks.filter(Boolean);
    e.size = e.chunks.reduce((s, c) => s + c.length, 0);
    // سجل فيه قطع كتير: منجمعه بقطعة وحدة حتى يضل الفتح سريع
    if (e.stored > 200) saveWhole(file, e);
  }
}

/** بيستنى لحتى ينحفظ كل شي (قبل التصدير أو التسكير). */
export async function flushVfs(): Promise<void> {
  await queue;
  if (failed) throw failed;
}

// ───────── أدوات ─────────

function norm(p: string): string {
  return path.resolve('/', p);
}

function addDir(d: string): void {
  let cur = norm(d);
  while (!dirs.has(cur)) {
    dirs.add(cur);
    if (db) {
      const c = cur;
      persist((_c, m) => m.put({ type: 'dir' }, c));
    }
    cur = path.dirname(cur);
  }
}

function err(code: string, msg: string): Error {
  const e = new Error(`${code}: ${msg}`) as Error & { code: string };
  e.code = code;
  return e;
}

function entry(p: string): FileEntry {
  const e = files.get(norm(p));
  if (!e) throw err('ENOENT', `no such file or directory, '${p}'`);
  return e;
}

function joined(e: FileEntry): Uint8Array {
  if (e.chunks.length === 1) return e.chunks[0]!;
  const out = new Uint8Array(e.size);
  let o = 0;
  for (const c of e.chunks) {
    out.set(c, o);
    o += c.length;
  }
  e.chunks = [out];
  return out;
}

const toBytes = (d: string | Uint8Array): Uint8Array => (typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d));

function writeWhole(p: string, data: string | Uint8Array): void {
  const file = norm(p);
  if (!dirs.has(path.dirname(file))) throw err('ENOENT', `no such directory, '${path.dirname(file)}'`);
  const b = toBytes(data);
  const e: FileEntry = { chunks: [b], size: b.length, mtimeMs: Date.now(), stored: 0 };
  files.set(file, e);
  saveWhole(file, e);
}

// ───────── واجهة node:fs (اللي بيستعمله الكود المشترك بس) ─────────

export function existsSync(p: string): boolean {
  const n = norm(p);
  return files.has(n) || dirs.has(n);
}

export function readFileSync(p: string, enc?: string | { encoding?: string }): Buffer | string {
  const b = Buffer.from(joined(entry(p)));
  const e = typeof enc === 'string' ? enc : enc?.encoding;
  return e ? b.toString(e as BufferEncoding) : b;
}

export function writeFileSync(p: string, data: string | Uint8Array, opts?: { flag?: string } | string): void {
  const flag = typeof opts === 'object' ? opts?.flag : undefined;
  if (flag === 'wx' && existsSync(p)) throw err('EEXIST', `file already exists, '${p}'`);
  writeWhole(p, data);
}

export function mkdirSync(p: string, _opts?: { recursive?: boolean }): void {
  addDir(p);
}

export function readdirSync(p: string): string[] {
  const d = norm(p);
  if (!dirs.has(d)) throw err('ENOENT', `no such directory, '${p}'`);
  const names = new Set<string>();
  for (const k of [...files.keys(), ...dirs]) if (k !== d && path.dirname(k) === d) names.add(path.basename(k));
  return [...names];
}

export function statSync(p: string) {
  const n = norm(p);
  if (dirs.has(n)) return { size: 0, mtimeMs: Date.now(), isDirectory: () => true, isFile: () => false };
  const e = entry(n);
  return { size: e.size, mtimeMs: e.mtimeMs, isDirectory: () => false, isFile: () => true };
}

export function utimesSync(p: string, _a: Date, m: Date): void {
  const e = files.get(norm(p));
  if (e) e.mtimeMs = m.getTime();
}

export function rmSync(p: string, opts: { recursive?: boolean; force?: boolean } = {}): void {
  const n = norm(p);
  const isDir = dirs.has(n);
  if (!isDir && !files.has(n)) {
    if (opts.force) return;
    throw err('ENOENT', `no such file or directory, '${p}'`);
  }
  if (isDir) {
    if (!opts.recursive) throw err('EISDIR', `is a directory, '${p}'`);
    const prefix = `${n}/`;
    for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k);
    for (const k of [...dirs]) if (k === n || k.startsWith(prefix)) dirs.delete(k);
  } else files.delete(n);
  dropPersisted(n, isDir);
}

export function renameSync(a: string, b: string): void {
  const from = norm(a);
  const e = entry(from);
  const data = joined(e);
  files.delete(from);
  dropPersisted(from, false);
  writeWhole(b, data);
}

export function copyFileSync(a: string, b: string): void {
  writeWhole(b, joined(entry(a)).slice());
}

export function truncateSync(p: string, len = 0): void {
  const file = norm(p);
  const e = entry(file);
  const data = joined(e).slice(0, len);
  e.chunks = [data];
  e.size = data.length;
  e.mtimeMs = Date.now();
  saveWhole(file, e);
}

export function openSync(p: string, flags: string): number {
  const file = norm(p);
  if (flags === 'w') writeWhole(file, new Uint8Array(0));
  else if (flags === 'a') {
    if (!files.has(file)) writeWhole(file, new Uint8Array(0));
  } else entry(file);
  const fd = nextFd++;
  fds.set(fd, { file });
  return fd;
}

export function writeSync(fd: number, data: string | Uint8Array): number {
  const h = fds.get(fd);
  if (!h) throw err('EBADF', 'bad file descriptor');
  const e = entry(h.file);
  const b = toBytes(data);
  e.chunks.push(b);
  e.size += b.length;
  e.mtimeMs = Date.now();
  saveAppend(h.file, e, b);
  return b.length;
}

export function fstatSync(fd: number) {
  const h = fds.get(fd);
  if (!h) throw err('EBADF', 'bad file descriptor');
  return statSync(h.file);
}

export function fsyncSync(_fd: number): void {
  // الحفظ بـ IndexedDB متسلسل بالخلفية؛ flushVfs() بيستنى لحتى يخلص
}

export function closeSync(fd: number): void {
  fds.delete(fd);
}

export default { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, utimesSync, rmSync, renameSync, copyFileSync, truncateSync, openSync, writeSync, fstatSync, fsyncSync, closeSync };
