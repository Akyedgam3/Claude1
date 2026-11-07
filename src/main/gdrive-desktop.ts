// Google Drive بالكمبيوتر: تسجيل الدخول بالمتصفح (loopback على 127.0.0.1) ورفع النسخ لحالها.
// الربط (رمز دائم) محفوظ بهالجهاز مشفّر بـ safeStorage تبع الويندوز، مش جوّا ملفات الشركة.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { app, safeStorage, shell } from 'electron';
import { packBackup, BACKUP_FILES } from '../app/backup-pack';
import { DriveAuthError, DriveClient, driveAuthUrl, exchangeCode, pkcePair, refreshTokens, type DriveClientConfig, type DriveFetch, type DriveFile, type DriveTokens } from '../app/gdrive';
import { GDRIVE_DESKTOP } from '../app/gdrive-config';
import type { CompanyStore } from '../storage/company-store';
import { readBackupConfig } from './backup-location';

const f: DriveFetch = (url, init) => fetch(url, init as RequestInit) as ReturnType<DriveFetch>;
const cfg = (): DriveClientConfig => ({ clientId: process.env.WAZN_GDRIVE_CLIENT_ID || GDRIVE_DESKTOP.clientId, clientSecret: process.env.WAZN_GDRIVE_CLIENT_SECRET || GDRIVE_DESKTOP.clientSecret });
export const driveAvailable = (): boolean => !!cfg().clientId;

interface Saved {
  refresh: string;
  /** true = مشفّر بـ safeStorage (base64). */
  enc: boolean;
  email: string;
  name: string;
}
const file = () => path.join(app.getPath('userData'), 'gdrive.json');
let tokens: DriveTokens | null = null;

function readSaved(): Saved | null {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8')) as Saved;
  } catch {
    return null;
  }
}
function savedRefresh(s: Saved): string {
  return s.enc ? safeStorage.decryptString(Buffer.from(s.refresh, 'base64')) : s.refresh;
}

export function driveStatus(): { available: boolean; linked: boolean; email?: string; name?: string } {
  const s = readSaved();
  return { available: driveAvailable(), linked: !!s, ...(s ? { email: s.email, name: s.name } : {}) };
}

async function accessToken(): Promise<string> {
  const s = readSaved();
  if (!s) throw new DriveAuthError('Google Drive مش مربوط');
  tokens = await refreshTokens(f, cfg(), tokens ?? { access: '', expires: 0, refresh: savedRefresh(s) });
  return tokens.access;
}
const client = () => new DriveClient(f, accessToken);

/** تسجيل دخول Google: بيفتح المتصفح وبيستنى الرجعة على منفذ محلي (5 دقايق). */
export async function driveLink(): Promise<{ email: string; name: string }> {
  if (!driveAvailable()) throw new Error('ربط Google Drive مش جاهز بهالنسخة');
  const { verifier, challenge } = await pkcePair();
  const state = Math.random().toString(36).slice(2);
  const code = await new Promise<{ code: string; redirect: string }>((resolve, reject) => {
    let redirect = '';
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (u.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><body style="font-family:Tahoma,sans-serif;text-align:center;padding:60px;background:#f2f7f5;color:#0f3b33"><h2>${ok ? 'تم ربط Google Drive ✓' : 'ما تم الربط'}</h2><p>${ok ? 'ارجع لبرنامج وزن، فيك تسكّر هالصفحة.' : 'ارجع للبرنامج وجرّب مرة تانية.'}</p></body></html>`);
      clearTimeout(timer);
      server.close();
      if (ok) resolve({ code: u.searchParams.get('code')!, redirect });
      else reject(new Error(u.searchParams.get('error') === 'access_denied' ? 'ما وافقت على الربط' : 'ما تم الربط'));
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('انتهى وقت تسجيل الدخول، جرّب مرة تانية'));
    }, 5 * 60_000);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      redirect = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      void shell.openExternal(driveAuthUrl(cfg(), redirect, challenge, state));
    });
  });
  tokens = await exchangeCode(f, cfg(), code.code, verifier, code.redirect);
  const who = await new DriveClient(f, async () => tokens!.access).account();
  const enc = safeStorage.isEncryptionAvailable();
  const saved: Saved = { refresh: enc ? safeStorage.encryptString(tokens.refresh).toString('base64') : tokens.refresh, enc, email: who.email, name: who.name };
  fs.writeFileSync(file(), JSON.stringify(saved, null, 2));
  return who;
}

export function driveUnlink(): void {
  tokens = null;
  fs.rmSync(file(), { force: true });
}

// ── حالة الرفع لكل شركة (بملف صغير جوّا مجلدها لأنه خاص بهالجهاز) ──
interface DriveState {
  at: number;
  seq: number;
  error?: string;
  file?: string;
}
const STATE = 'gdrive-state.json';
export function driveState(store: CompanyStore): DriveState | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(store.dir, STATE), 'utf8')) as DriveState;
  } catch {
    return null;
  }
}
const inFlight = new Set<string>();

const safeName = (n: string) => n.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'شركة';

/** بيرفع نسخة كاملة (.wazn) وبيمسح الأقدم من آخر keep. */
export async function driveUploadNow(store: CompanyStore): Promise<DriveFile> {
  if (inFlight.has(store.dir)) throw new Error('في رفع شغّال هلق، استنى شوي');
  inFlight.add(store.dir);
  const seq = store.lastSeq;
  try {
    const files: Record<string, Uint8Array> = {};
    for (const n of BACKUP_FILES) {
      const p = path.join(store.dir, n);
      if (fs.existsSync(p)) files[n] = new Uint8Array(fs.readFileSync(p));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const c = client();
    const up = await c.upload(`Wazn-${safeName(store.meta.name)}-${stamp}.wazn`, packBackup(files), { company: store.meta.id, companyName: store.meta.name });
    const keep = readBackupConfig(store).driveKeep;
    await c.prune(store.meta.id, keep).catch(() => 0);
    fs.writeFileSync(path.join(store.dir, STATE), JSON.stringify({ at: Date.now(), seq, file: up.name }));
    return up;
  } catch (e) {
    const prev = driveState(store);
    fs.writeFileSync(path.join(store.dir, STATE), JSON.stringify({ at: prev?.at ?? 0, seq: prev?.seq ?? -1, file: prev?.file, error: (e as Error).message, errorAt: Date.now() }));
    throw e;
  } finally {
    inFlight.delete(store.dir);
  }
}

/**
 * رفع دوري: إذا الدرايف مفعّل لهالشركة ومربوط، ومرقت الفترة، وفي شغل جديد من آخر رفع.
 * إذا فشل (ما في نت) منرجع نجرّب بعد ربع ساعة مش بعد الفترة كلها.
 */
export function periodicDrive(store: CompanyStore, now = Date.now()): boolean {
  if (!store.isOpen || !driveAvailable() || !readSaved()) return false;
  const c = readBackupConfig(store);
  if (!c.drive) return false;
  const st = driveState(store) as (DriveState & { errorAt?: number }) | null;
  if (st && st.seq === store.lastSeq) return false;
  if (st?.errorAt && now - st.errorAt < 15 * 60_000) return false;
  if (st && !st.error && now - st.at < c.driveEvery * 60_000) return false;
  void driveUploadNow(store).catch((e) => console.error('drive upload', (e as Error).message));
  return true;
}

export async function driveList(company?: string): Promise<DriveFile[]> {
  return client().list(company);
}
export async function driveDownload(id: string): Promise<Uint8Array> {
  return client().download(id);
}
