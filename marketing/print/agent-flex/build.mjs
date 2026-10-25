// يبني فلكسات الوكلاء: PDF جاهز للطباعة (120×120 سم) + صور معاينة JPG.
// node marketing/print/agent-flex/build.mjs <outdir> <shotsdir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/home/user/Claude1/package.json');
const { chromium } = require('@playwright/test');
const [out, shots] = process.argv.slice(2);
const D = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
const icons = Object.fromEntries([...fs.readFileSync('/home/user/mizan-updates/assets/img/icons.svg', 'utf8').matchAll(/<symbol id="([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)].map((m) => [m[1], m[2]]));
const html = fs.readFileSync(path.join(D, 'src.html'), 'utf8').replace(/\{\{icon:([a-z0-9-]+)\}\}/g, (_, n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[n]}</svg>`);
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of fs.readdirSync('/home/user/mizan-updates/assets/fonts').filter((f) => f.startsWith('cairo-'))) fs.copyFileSync(path.join('/home/user/mizan-updates/assets/fonts', f), path.join(out, 'fonts', f));
fs.copyFileSync('/home/user/Claude1/build/icon.png', path.join(out, 'logo.png'));
for (const f of fs.readdirSync(shots).filter((f) => f.endsWith('.png'))) fs.copyFileSync(path.join(shots, f), path.join(out, 'shots', f));

const b = await chromium.launch();
const names = { f1: 'LaptopHome-Flex-1-الوكيل', f2: 'LaptopHome-Flex-2-الميزات', f3: 'LaptopHome-Flex-3-المجالات' };
for (const [id, name] of Object.entries(names)) {
  // معاينة: 100 نقطة بالإنش تقريباً (4724 بكسل)
  const p = await b.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 3.937 });
  await p.goto('file://' + path.join(out, 'index.html'));
  await p.evaluate(async (id) => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => (i.onload = i.onerror = r)))));
    document.querySelectorAll('.flex').forEach((s) => (s.style.display = s.id === id ? '' : 'none'));
    document.body.style.background = 'none';
    document.querySelector('#' + id).style.margin = '0';
  }, id);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1200, height: 1200 } });
  // PDF بالمقاس الحقيقي: 1px = 1مم
  await p.addStyleTag({ content: '@page { size: 1200mm 1200mm; margin: 0 } html, body { background: none !important } .flex { margin: 0 !important; zoom: 3.7795276 }' });
  await p.pdf({ path: path.join(out, `${name}.pdf`), width: '1200mm', height: '1200mm', printBackground: true, pageRanges: '1' });
  await p.close();
  console.log('done', name);
}
await b.close();
