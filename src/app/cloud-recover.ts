import fs from 'node:fs';
import path from 'node:path';
import type { CloudClient } from '../cloud/client';
import { CompanyStore } from '../storage/company-store';
import { BACKUP_FILES, packBackup } from './backup-pack';

/**
 * ضاع الجهاز الرئيسي (انحذف التطبيق أو خرب الجهاز) والاتصال عن بعد كان شغّال:
 * منجيب آخر نسخة من بيانات المحل من السحابة (رمز الاتصال هو مفتاحها)، ومنعمل منها ملف نسخة احتياطية عادي (.wazn)
 * بينفتح على أي جهاز مرخّص من «استعادة نسخة احتياطية». صاحب المحل بيدخل باسمه القديم وبكلمة السر الجديدة.
 */
export async function recoverFromCloud(client: CloudClient, o: { username: string; password: string; tmpDir: string }): Promise<{ name: string; bytes: Uint8Array }> {
  if ((o.password ?? '').length < 6) throw new Error('كلمة السر الجديدة لازم تكون 6 أحرف على الأقل');
  let state;
  try {
    state = await client.latestState();
  } catch (e) {
    if (/صرف|الرمز/.test((e as Error).message)) throw e;
    throw new Error('ما لقينا نسخة من بيانات المحل بالاتصال عن بعد (يمكن الجهاز الرئيسي كان بنسخة قديمة، أو الرمز تغيّر). تأكد من الإنترنت وجرّب مرة تانية.');
  }
  const name = o.username.trim().toLowerCase();
  const owner = Object.values(state.users).find((u) => u.username.toLowerCase() === name);
  if (!owner || owner.role !== 'owner') throw new Error('اكتب اسم الدخول تبع صاحب المحل (المالك)، مش حساب موظف');
  fs.rmSync(o.tmpDir, { recursive: true, force: true });
  const dir = path.join(o.tmpDir, 'company');
  try {
    const { store } = CompanyStore.create(dir, {
      info: state.info!,
      currencies: Object.values(state.currencies),
      owner: { id: owner.id, username: owner.username, displayName: owner.displayName, password: o.password },
    });
    store.ledger.importCompany(state);
    store.close();
    const files: Record<string, Uint8Array> = {};
    for (const f of BACKUP_FILES) if (fs.existsSync(path.join(dir, f))) files[f] = new Uint8Array(fs.readFileSync(path.join(dir, f)));
    return { name: state.info?.name ?? 'المحل', bytes: packBackup(files) };
  } finally {
    fs.rmSync(o.tmpDir, { recursive: true, force: true });
  }
}
