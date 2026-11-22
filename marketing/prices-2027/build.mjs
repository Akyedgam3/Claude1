// أسعار وزن الجديدة: لوحتين صور (1080×1350، للواتساب والسوشال) وملفين PDF (A4).
// node marketing/prices-2027/build.mjs  ← بيطلّع الملفات بـ marketing/prices-2027/out/
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });

const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const open = async (file, opts) => {
  const p = await b.newPage(opts);
  p.on('requestfailed', (r) => console.log('FAIL', r.url()));
  await p.goto(`file://${path.join(here, file)}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  return p;
};

for (const [file, name] of [['customers.html', 'Wazn-Prices'], ['agents.html', 'Wazn-Agent-Prices'], ['packages.html', 'Wazn-Agent-Packages'], ['cloud.html', 'Wazn-Remote-Prices'], ['cloud-packages.html', 'Wazn-Agent-Remote-Packages']]) {
  const p = await open(file, { viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  // لازم كل شي يساع بالصورة
  const over = await p.evaluate(() => { const f = document.querySelector('.foot'); const r = f ? f.getBoundingClientRect() : null; return !r || r.bottom > 1350 || document.querySelector('.wrap').scrollHeight > 1352; });
  if (over) console.log('WARNING: content overflows', file);
  await p.screenshot({ path: path.join(out, `${name}.png`), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  // نفس اللوحة كـ PDF (صفحة وحدة بنفس المقاس)
  await p.pdf({ path: path.join(out, `${name}.pdf`), width: '1080px', height: '1350px', printBackground: true, pageRanges: '1' });
  await p.close();
}
for (const [file, name] of [['prices-doc.html', 'Wazn-Prices-Terms'], ['agents-doc.html', 'Wazn-Agents-Agreement']]) {
  const p = await open(file);
  const pages = await p.evaluate(() => [...document.querySelectorAll('.page')].map((s) => s.scrollHeight - s.clientHeight));
  if (pages.some((d) => d > 2)) console.log('WARNING: page content overflows', file, pages);
  await p.pdf({ path: path.join(out, `${name}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await p.close();
}
await b.close();
console.log('done', fs.readdirSync(out).join(', '));
