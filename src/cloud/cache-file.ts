// نسخة بيانات المحل عالجهاز البعيد (جوال أو كمبيوتر بالبيت)، مشفّرة بمفتاح رمز الاتصال.
// بالاتصال الجاي منبلّش منها ومنطلب من الجهاز الرئيسي الفرق بس (بدل كل البيانات على نت ضعيف).
import type { CloudCache, CloudClient } from './client';
import type { CloudRoom } from './code';
import { seal, unseal } from './seal';

/** اللي منحتاجه من نظام الملفات (node:fs بالكمبيوتر، والنسخة الصغيرة بالجوال). */
export interface CacheFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: 'utf8'): string | Buffer;
  writeFileSync(p: string, data: string): void;
  renameSync(a: string, b: string): void;
  unlinkSync?(p: string): void;
}

export const cacheFileName = (room: CloudRoom) => `cloud-cache-${room.room.slice(0, 24)}.json`;

export async function loadCloudCache(fs: CacheFs, file: string, room: CloudRoom): Promise<CloudCache | null> {
  try {
    if (!fs.existsSync(file)) return null;
    const doc = JSON.parse(String(fs.readFileSync(file, 'utf8'))) as { iv: string; ct: string };
    return await unseal<CloudCache>(room.key, 'cache', doc);
  } catch {
    return null; // نسخة تالفة أو من رمز تاني: منبلّش من جديد
  }
}

/** بيحفظ النسخة بعد كل تغيير (مجمّعة كل شوي حتى ما نكتب كتير)، ومرة أخيرة بالإغلاق. */
export function cacheSaver(fs: CacheFs, file: string, room: CloudRoom, client: CloudClient, everyMs = 15_000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let lastSeq = -1;
  const save = () => {
    chain = chain.then(async () => {
      const c = client.cache();
      if (!c || c.seq === lastSeq) return;
      const sealed = await seal(room.key, 'cache', c);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(sealed));
      fs.renameSync(`${file}.tmp`, file);
      lastSeq = c.seq;
    }).catch(() => undefined);
    return chain;
  };
  return {
    save,
    schedule() {
      timer ??= setTimeout(() => {
        timer = null;
        void save();
      }, everyMs);
    },
    async stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      await save();
    },
  };
}
