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
}

const FILE = 'backup-location.json';
const DEFAULT: BackupConfig = { keep: 30, internal: true };

export function readBackupConfig(store: CompanyStore): BackupConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(store.dir, FILE), 'utf8')) as Partial<BackupConfig>;
    return {
      ...(typeof raw.dir === 'string' && raw.dir.trim() ? { dir: raw.dir } : {}),
      keep: Number.isInteger(raw.keep) && raw.keep! >= 0 ? raw.keep! : DEFAULT.keep,
      internal: raw.internal !== false,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeBackupConfig(store: CompanyStore, cfg: BackupConfig): BackupConfig {
  const clean: BackupConfig = {
    ...(cfg.dir?.trim() ? { dir: path.resolve(cfg.dir.trim()) } : {}),
    keep: Number.isInteger(cfg.keep) && cfg.keep >= 0 && cfg.keep <= 10000 ? cfg.keep : DEFAULT.keep,
    // بدون مجلد مختار لازم تضل النسخة الداخلية
    internal: cfg.dir?.trim() ? cfg.internal !== false : true,
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
