// بيطلع أوقات المؤثرات من صفحة الرندر: node events.mjs <dir> <out.json>
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/home/user/Claude1/package.json');
const { chromium } = require('@playwright/test');
const [dir, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('console', (m) => console.log(m.text()));
await p.goto('file://' + dir + '/index.html');
await p.waitForFunction(() => window.READY === true);
fs.writeFileSync(out, JSON.stringify(await p.evaluate(() => window.EVENTS)));
await b.close();
