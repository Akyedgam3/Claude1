import { createRequire } from 'node:module';
const require = createRequire('/home/user/Claude1/package.json');
const { chromium } = require('@playwright/test');
const [dir, out, ...times] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
await p.goto('file://' + dir + '/index.html');
await p.waitForFunction(() => window.READY === true);
for (const t of times) { await p.evaluate((x) => window.render(x), Number(t)); await p.screenshot({ path: `${out}/p_${t}.jpg`, type: 'jpeg', quality: 70 }); }
await b.close();
