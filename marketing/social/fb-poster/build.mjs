// بوستر فيسبوك: node marketing/social/fb-poster/build.mjs [out-dir]
// بيطلع wazn-facebook.png (1080×1350) و wazn-facebook.jpg (أخف للنشر).
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? here;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await p.goto(`file://${path.join(here, 'src.html')}`);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(out, 'wazn-facebook.png') });
await p.screenshot({ path: path.join(out, 'wazn-facebook.jpg'), type: 'jpeg', quality: 90 });
await b.close();
console.log('done', out);
