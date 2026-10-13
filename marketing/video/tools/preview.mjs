import { createRequire } from 'node:module';
const require = createRequire('/home/user/Claude1/package.json');
const { chromium } = require('@playwright/test');
const [dir, out, ...times] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto('file://' + dir + '/index.html');
await p.waitForFunction(() => window.READY === true);
for (const t of times) {
  await p.evaluate((t) => window.render(Number(t)), t);
  await p.screenshot({ path: `${out}/p_${t}.jpg`, type: 'jpeg', quality: 80 });
}
await b.close();
console.log('ok');
