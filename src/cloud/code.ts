// رمز الاتصال عن بعد: 20 بايت عشوائية. منه بيطلع مكان البيانات (room) ومفتاح التشفير (key).
// اللي ما معه الرمز ما بيعرف وين البيانات، ولو عرف ما بيقدر يقراها.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون 0/O و 1/I حتى ما يتلخبط الزبون

export function newCloudCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return formatCloudCode(out);
}

/** بيقبل الرمز مكتوب بأي شكل (مسافات، شرطات، حروف صغيرة) ورابط QR. */
export function normalizeCloudCode(input: string): string | null {
  const raw = input.trim().replace(/^wazn:\/\/connect\//i, '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I');
  const clean = [...raw].map((c) => (c === 'O' ? 'Q' : c === 'I' ? 'J' : c)).join('');
  if (clean.length !== 32 || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  return formatCloudCode(clean);
}

export function formatCloudCode(clean: string): string {
  return clean.replace(/-/g, '').match(/.{1,4}/g)!.join('-');
}

/** رابط QR بيفتحه تطبيق الجوال. */
export function cloudCodeLink(code: string): string {
  return `wazn://connect/${code.replace(/-/g, '')}`;
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export interface CloudRoom {
  room: string; // اسم مجموعة البيانات بـ Firestore
  key: CryptoKey; // AES-256-GCM
}

export async function cloudRoom(code: string): Promise<CloudRoom> {
  const clean = normalizeCloudCode(code);
  if (!clean) throw new Error('رمز الاتصال غير صحيح');
  const c = clean.replace(/-/g, '');
  const room = hex(await sha256(`wazn-room|${c}`)).slice(0, 40);
  const raw = await sha256(`wazn-key|${c}`);
  const key = await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { room, key };
}
