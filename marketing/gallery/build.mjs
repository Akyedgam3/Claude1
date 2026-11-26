// معرض «100 صورة عن وزن»: بياخد اللقطات الخام + العناوين (من tests/e2e/zz-gallery.e2e.ts وtests/mobile/zz-gallery.mts)
// وبيطلّع صور جاهزة للنشر بشعار وزن وعنوان وشرح. node marketing/gallery/build.mjs <مجلد اللقطات> <مجلد الناتج>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [SRC, OUT] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const caps = JSON.parse(fs.readFileSync(path.join(SRC, 'captions.json'), 'utf8'));
const fontDir = path.join(root, 'web-dist/assets');
const font = (w) => fs.readdirSync(fontDir).find((f) => f.startsWith(`cairo-arabic-${w}-normal`));
const lat = (w) => fs.readdirSync(fontDir).find((f) => f.startsWith(`cairo-latin-${w}-normal`));
const ff = [600, 700].map((w) => `@font-face{font-family:Cairo;font-weight:${w};src:url(file://${fontDir}/${font(w)})}@font-face{font-family:Cairo;font-weight:${w};src:url(file://${fontDir}/${lat(w)});unicode-range:U+0000-00FF}`).join('');
const logo = `file://${root}/src/renderer/src/assets/logo.png`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ids = Object.keys(caps).sort((a, b) => Number(a) - Number(b));
fs.mkdirSync(OUT, { recursive: true });

const css = `${ff}
*{margin:0;box-sizing:border-box} body{font-family:Cairo;direction:rtl;color:#0f2a25}
.c{position:relative;overflow:hidden;background:radial-gradient(1200px 700px at 85% 0%,#1d8a6f 0%,#0f5e4c 45%,#0a3d33 100%)}
.c::after{content:'';position:absolute;inset:0;background:radial-gradient(600px 400px at 10% 100%,rgba(255,255,255,.08),transparent 70%);pointer-events:none}
.brand{display:flex;align-items:center;gap:14px;color:#fff}
.brand img{width:64px;height:64px;border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
.brand b{font-size:40px;font-weight:700;line-height:1}
.brand span{display:block;font-size:17px;opacity:.85;font-weight:600}
.num{direction:ltr;unicode-bidi:isolate;display:inline-block;background:#f3c74c;color:#0a3d33;font-weight:700;border-radius:999px;padding:2px 18px;font-size:22px}
h1{color:#fff;font-weight:700;line-height:1.25}
p.d{color:#e3f2ee;font-weight:600;line-height:1.75}
.site{color:#f3c74c;font-weight:700;font-size:24px;direction:ltr;letter-spacing:.5px}
.shot{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.4)}
.bar{height:34px;background:#eef3f1;display:flex;align-items:center;gap:8px;padding:0 14px;direction:ltr}
.bar i{width:12px;height:12px;border-radius:50%;display:inline-block}
.shot img{display:block;width:100%}
`;
const desktop = (n, c, img) => `<!doctype html><meta charset=utf-8><style>${css}
.c{width:1920px;height:1080px;display:grid;grid-template-columns:560px 1fr;gap:20px;padding:56px 60px}
.side{display:flex;flex-direction:column;gap:26px;justify-content:center;padding-left:10px}
h1{font-size:58px} p.d{font-size:28px}
.shot{align-self:center;width:1240px}
</style><div class=c><div class=side>
<div class=brand><img src="${logo}"><div><b>وزن</b><span>برنامج محاسبة وإدارة محلات</span></div></div>
<div><span class=num>${n} / 100</span></div>
<h1>${esc(c.title)}</h1><p class=d>${esc(c.desc)}</p>
<div style="margin-top:auto"><span class=site>waznsy.com</span></div></div>
<div class=shot><div class=bar><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><img src="file://${img}"></div></div>`;
const mobile = (n, c, img) => `<!doctype html><meta charset=utf-8><style>${css}
.c{width:1080px;height:1350px;padding:50px 60px;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center}
.brand{align-self:stretch;justify-content:space-between}
h1{font-size:52px;margin-top:6px} p.d{font-size:27px;max-width:900px}
.phone{margin-top:14px;width:440px;border-radius:56px;background:#0b0f0e;padding:14px;box-shadow:0 30px 70px rgba(0,0,0,.45);position:relative}
.phone img{width:100%;display:block;border-radius:44px}
.wrap{height:760px;overflow:hidden;border-radius:44px 44px 0 0;margin-bottom:-60px}
</style><div class=c>
<div class=brand><div style="display:flex;align-items:center;gap:14px"><img src="${logo}"><div style="text-align:right"><b>وزن</b><span>عالجوال، بدون إنترنت</span></div></div><span class=num>${n} / 100</span></div>
<h1>${esc(c.title)}</h1><p class=d>${esc(c.desc)}</p>
<div class=phone><img src="file://${img}"></div>
<span class=site style="position:absolute;bottom:26px;left:60px">waznsy.com</span></div>`;

const b = await chromium.launch();
const page = await b.newPage({ deviceScaleFactor: 1 });
let n = 0;
for (const id of ids) {
  const c = caps[id];
  const img = path.join(SRC, 'raw', `${id}.png`);
  if (!fs.existsSync(img)) continue;
  n++;
  const html = c.mobile ? mobile(n, c, img) : desktop(n, c, img);
  const tmp = path.join(SRC, 'tmp.html');
  fs.writeFileSync(tmp, html);
  await page.setViewportSize(c.mobile ? { width: 1080, height: 1350 } : { width: 1920, height: 1080 });
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const name = `${String(n).padStart(3, '0')} - ${c.title.replace(/[\\/:*?"<>|]/g, '-')}.jpg`;
  await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 88, clip: { x: 0, y: 0, ...(c.mobile ? { width: 1080, height: 1350 } : { width: 1920, height: 1080 }) } });
}
await b.close();
console.log('done', n);
