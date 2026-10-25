// ملف النسخة الاحتياطية الواحد (.wazn): ملفات الشركة متل ما هي (مشفّرة) بملف JSON واحد.
// نفس الصيغة بالجوال والكمبيوتر، فالنسخة بتنفتح على أي جهاز.
export const BACKUP_FILES = ['company.json', 'keyring.json', 'journal.mzl', 'head.json'];

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function packBackup(files: Record<string, Uint8Array>): Uint8Array {
  const out: Record<string, string> = {};
  for (const f of BACKUP_FILES) if (files[f]) out[f] = b64(files[f]!);
  return new TextEncoder().encode(JSON.stringify({ app: 'wazn-backup', version: 1, files: out }));
}

export function unpackBackup(bytes: Uint8Array): Record<string, Uint8Array> {
  let data: { app?: string; files?: Record<string, string> };
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('الملف ليس نسخة احتياطية من وزن');
  }
  if (data.app !== 'wazn-backup' || !data.files?.['company.json'] || !data.files['journal.mzl']) throw new Error('الملف ليس نسخة احتياطية من وزن');
  return Object.fromEntries(Object.entries(data.files).filter(([k]) => BACKUP_FILES.includes(k)).map(([k, v]) => [k, unb64(v)]));
}
