// لازم ينحمّل قبل أي كود من البرنامج: الكود المشترك مع الكمبيوتر بيستعمل Buffer و process.
import { Buffer } from 'buffer';

// مكتبة buffer ما بتعرف base64url (التراخيص والقائمة الموقّعة مكتوبة فيه): منضيفه فوقها
const fromBase64Url = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
const from = Buffer.from.bind(Buffer) as (...a: unknown[]) => Buffer;
Buffer.from = ((value: unknown, enc?: unknown, len?: unknown) =>
  typeof value === 'string' && enc === 'base64url' ? from(fromBase64Url(value), 'base64') : from(value, enc, len)) as typeof Buffer.from;
const toString = Buffer.prototype.toString;
Buffer.prototype.toString = function (this: Buffer, enc?: string, start?: number, end?: number) {
  if (enc === 'base64url') return toString.call(this, 'base64', start, end).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return toString.call(this, enc as BufferEncoding, start, end);
} as typeof Buffer.prototype.toString;
const isEncoding = Buffer.isEncoding.bind(Buffer);
Buffer.isEncoding = ((e: string) => e === 'base64url' || isEncoding(e)) as typeof Buffer.isEncoding;

const g = globalThis as unknown as Record<string, unknown>;
g['Buffer'] ??= Buffer;
g['process'] ??= {
  pid: 1,
  platform: 'android',
  env: {},
  versions: {},
  cwd: () => '/',
  // مافي برامج تانية على الموبايل تفتح نفس الشركة
  kill: () => true,
};
