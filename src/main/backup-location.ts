// مكان النسخ الاحتياطي التلقائي: الزبون بيختار أي مجلد (قرص تاني، فلاشة، مجلد درايف/ون درايف...).
// الإعداد محفوظ بملف صغير جوّا مجلد الشركة لأنه خاص بهالجهاز (مش حدث بالدفتر).
import fs from 'node:fs';
import path from 'node:path';
import type { CompanyStore } from '../storage/company-store';

export interface BackupConfig {
  /** المجلد المختار (فاضي = جوّا مجلد الشركة بس). */
  dir?: string;
  /** كم نسخة منخلي بالمجلد المختار (0 = كلها). */
  keep: number;
  /** نخلي كمان نسخة جوّا مجلد الشركة (آخر 30). */
  internal: boolean;
  /** نسخة تلقائية كل كم دقيقة وقت البرنامج مفتوح (0 = بس عند الإغلاق). */
  every: number;
}

const FILE = 'backup-location.json';
const DEFAULT: BackupConfig = { keep: 30, internal: true, every: 60 };
const EVERY = [0, 60, 180, 360, 1440];

export function readBackupConfig(store: CompanyStore): BackupConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(store.dir, FILE), 'utf8')) as Partial<BackupConfig>;
    return {
      ...(typeof raw.dir === 'string' && raw.dir.trim() ? { dir: raw.dir } : {}),
      keep: Number.isInteger(raw.keep) && raw.keep! >= 0 ? raw.keep! : DEFAULT.keep,
      internal: raw.internal !== false,
      every: EVERY.includes(Number(raw.every)) ? Number(raw.every) : DEFAULT.every,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeBackupConfig(store: CompanyStore, cfg: Omit<BackupConfig, 'every'> & { every?: number }): BackupConfig {
  const clean: BackupConfig = {
    ...(cfg.dir?.trim() ? { dir: path.resolve(cfg.dir.trim()) } : {}),
    keep: Number.isInteger(cfg.keep) && cfg.keep >= 0 && cfg.keep <= 10000 ? cfg.keep : DEFAULT.keep,
    // بدون مجلد مختار لازم تضل النسخة الداخلية
    internal: cfg.dir?.trim() ? cfg.internal !== false : true,
    every: EVERY.includes(Number(cfg.every)) ? Number(cfg.every) : DEFAULT.every,
  };
  fs.writeFileSync(path.join(store.dir, FILE), JSON.stringify(clean, null, 2));
  return clean;
}

const safeName = (name: string) => name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'شركة';

/** المجلد الفعلي للنسخ بالمكان المختار: <المجلد>/Wazn-<اسم الشركة> */
export function chosenBackupRoot(store: CompanyStore, cfg = readBackupConfig(store)): string | null {
  return cfg.dir ? path.join(cfg.dir, `Wazn-${safeName(store.meta.name)}`) : null;
}

/**
 * نسخة احتياطية حسب الإعداد: جوّا مجلد الشركة (إذا مفعّلة) وبالمكان المختار.
 * إذا المكان المختار مش موجود (فلاشة مشلوحة مثلاً) منرجع للنسخة الداخلية حتى ما تضيع النسخة.
 * بيرجّع مسار آخر نسخة انعملت، و`failed` إذا المكان المختار فشل.
 */
export function autoBackup(store: CompanyStore): { path: string; failed?: string } {
  const cfg = readBackupConfig(store);
  let out = '';
  if (cfg.internal || !cfg.dir) out = store.backup();
  const root = chosenBackupRoot(store, cfg);
  if (root) {
    try {
      if (!fs.existsSync(cfg.dir!)) throw new Error(`المجلد ${cfg.dir} مش موجود (فلاشة مشلوحة؟)`);
      out = store.backup(root, cfg.keep === 0 ? Infinity : cfg.keep);
    } catch (e) {
      if (!out) out = store.backup();
      return { path: out, failed: (e as Error).message };
    }
  }
  return { path: out };
}

/** حالة النسخ الدوري لكل شركة مفتوحة (بالذاكرة): آخر نسخة ورقم آخر حركة كانت فيها. */
const periodic = new Map<string, { at: number; seq: number; path?: string; error?: string }>();

export function lastAutoBackup(store: CompanyStore): { at: number; path?: string; error?: string } | null {
  const s = periodic.get(store.dir);
  return s && s.path !== undefined ? { at: s.at, path: s.path, ...(s.error ? { error: s.error } : {}) } : s?.error ? { at: s.at, error: s.error } : null;
}

/**
 * نسخة دورية وقت البرنامج مفتوح: إذا مرّت الفترة المختارة وفي حركات جديدة من آخر نسخة.
 * (بدون حركات جديدة ما في داعي لنسخة، فما منعبّي القرص نسخ متشابهة.)
 */
export function periodicBackup(store: CompanyStore, now = Date.now()): boolean {
  if (!store.isOpen) return false;
  const cfg = readBackupConfig(store);
  const st = periodic.get(store.dir);
  if (!st) {
    periodic.set(store.dir, { at: now, seq: store.lastSeq });
    return false;
  }
  if (!cfg.every || now - st.at < cfg.every * 60_000 || store.lastSeq === st.seq) return false;
  try {
    const r = autoBackup(store);
    periodic.set(store.dir, { at: now, seq: store.lastSeq, path: r.path, ...(r.failed ? { error: r.failed } : {}) });
  } catch (e) {
    periodic.set(store.dir, { ...st, at: now, error: (e as Error).message });
  }
  return true;
}
