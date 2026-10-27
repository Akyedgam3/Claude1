// بروشور عرض الوكلاء: node marketing/brochure-agents/build.mjs <ملف.pdf>
// رمز QR لصفحة الوكلاء بينعمل هون (qrcode-generator) وبينحط بالصفحة الأخيرة.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const qrcode = require('qrcode-generator');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(here, 'Wazn-Agents.pdf');

const qr = qrcode(0, 'M');
qr.addData('https://waznsy.com/agents.html');
qr.make();

const b = await chromium.launch();
const p = await b.newPage();
p.on('requestfailed', (r) => console.log('FAIL', r.url()));
await p.goto(`file://${path.join(here, 'src.html')}`);
await p.evaluate((svg) => (document.getElementById('qr').innerHTML = svg), qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }));
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close();
console.log('done', out);
