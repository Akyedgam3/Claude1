// معاينة سريعة: node prev.mjs <outdir> <scale> t1 t2 ...  → صور + ورقة مجمّعة
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out, scaleArg, ...times] = process.argv.slice(2);
const scale = Number(scaleArg);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
const t0 = Date.now();
for (const t of times) { await p.evaluate((x) => window.render(x), Number(t)); await p.screenshot({ path: `${out}/f_${t}.jpg`, type: 'jpeg', quality: 82 }); }
console.log('ms/frame', Math.round((Date.now() - t0) / times.length));
await b.close();
