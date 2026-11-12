import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [dir, out, ...times] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
await p.goto('file://' + dir + '/index.html');
await p.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
for (const t of times) { const t0 = Date.now(); await p.evaluate((x) => window.render(x), Number(t)); await p.screenshot({ path: `${out}/p_${t}.jpg`, type: 'jpeg', quality: 80 }); console.log(t, Date.now() - t0, 'ms'); }
await b.close();
