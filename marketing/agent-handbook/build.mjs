// دليل الوكيل وشروط الوكالة: node marketing/agent-handbook/build.mjs <ملف.pdf>
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(here, 'Wazn-Agent-Handbook.pdf');

const b = await chromium.launch();
const p = await b.newPage();
p.on('requestfailed', (r) => console.log('FAIL', r.url()));
await p.goto(`file://${path.join(here, 'src.html')}`);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close();
console.log('done', out);
