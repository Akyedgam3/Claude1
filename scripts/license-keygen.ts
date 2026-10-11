// يولّد زوج مفاتيح التوقيع مرة واحدة فقط.
// المفتاح الخاص يبقى عندك (keys/ مستثنى من git)، والعام يُضمَّن في البرنامج.
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';

if (fs.existsSync('keys/license-private.pem')) {
  console.error('المفتاح موجود مسبقاً: keys/license-private.pem — توليد مفتاح جديد يُبطل كل التراخيص السابقة.');
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
fs.mkdirSync('keys', { recursive: true });
fs.writeFileSync('keys/license-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
fs.writeFileSync('src/license/public-key.ts', `export const LICENSE_PUBLIC_KEY = \`${pub}\`;\n`);
console.log('تم: keys/license-private.pem (احفظه بمكان آمن) و src/license/public-key.ts');
