// صور Google Play: لقطات بإطار وعنوان (1080×1920)، صورة الواجهة (1024×500)، والأيقونة (512×512).
// الاستعمال: node marketing/play-store/build.mjs  (بعد ما تطلع اللقطات بـ raw/ من tests/mobile/screens.mts)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const font = (w) => `@font-face{font-family:Cairo;font-weight:${w};src:url(file://${here}/../brochure-app/img/cairo-arabic-${w}-normal.woff2);unicode-range:U+0600-06FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC}@font-face{font-family:Cairo;font-weight:${w};src:url(file://${here}/../brochure-app/img/cairo-latin-${w}-normal.woff2);unicode-range:U+0000-00FF,U+2000-206F}`;
const css = `${font(400)}${font(700)}${font(900)}*{margin:0;box-sizing:border-box}body{font-family:Cairo,sans-serif;direction:rtl}`;
const shots = [
  ['s-1-dashboard', 'كل محلك بشاشة وحدة', 'مبيعات اليوم، الربح، الصندوق والديون'],
  ['s-3-pos', 'نقطة بيع سريعة', 'بالباركود أو بلمسة، حتى بدون إنترنت'],
  ['s-6-invoice', 'فواتير جاهزة للطباعة والواتساب', 'إيصال حراري أو A4، مع QR'],
  ['s-7-debts', 'الديون واضحة', 'مين عليه، قديش، ومن أيمتى'],
  ['s-8-reports', 'تقارير وأرباح صحيحة', 'ربح كل يوم وكل فاتورة وقيمة البضاعة'],
  ['s-9-items', 'المواد والمخزون', 'أسعار، أصناف، كراتين، وباركود'],
];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
let n = 1;
for (const [file, title, sub] of shots) {
  const img = 'data:image/png;base64,' + fs.readFileSync(path.join(here, 'raw', file + '.png')).toString('base64');
  await p.setContent(`<style>${css}
    body{width:1080px;height:1920px;background:linear-gradient(160deg,#0f6e5c,#0b4f43 60%,#083a31);color:#fff;display:flex;flex-direction:column;align-items:center;overflow:hidden}
    h1{font-weight:900;font-size:76px;margin-top:110px;text-align:center;line-height:1.25}
    p{font-size:40px;opacity:.88;margin-top:18px;text-align:center}
    .phone{margin-top:70px;width:780px;height:1387px;border-radius:64px;background:#111;padding:18px;box-shadow:0 40px 90px rgba(0,0,0,.45)}
    .phone img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:48px;display:block}
  </style><h1>${title}</h1><p>${sub}</p><div class="phone"><img src="${img}"></div>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(out, `screenshot-${n++}.png`) });
}
// صورة الواجهة 1024×500
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(here, '../../build/icon.png')).toString('base64');
const dash = 'data:image/png;base64,' + fs.readFileSync(path.join(here, 'raw', 's-1-dashboard.png')).toString('base64');
await p.setViewportSize({ width: 1024, height: 500 });
await p.setContent(`<style>${css}
  body{width:1024px;height:500px;background:linear-gradient(120deg,#0f6e5c,#083a31);color:#fff;position:relative;overflow:hidden}
  .t{position:absolute;right:60px;top:95px;width:560px}
  .t .row{display:flex;align-items:center;gap:22px}
  .t img{width:110px;height:110px;border-radius:26px}
  h1{font-size:92px;font-weight:900;line-height:1}
  p{font-size:34px;margin-top:26px;line-height:1.5;opacity:.92}
  .ph{position:absolute;left:70px;top:40px;width:290px;height:516px;border-radius:36px;background:#111;padding:10px;transform:rotate(-6deg);box-shadow:0 30px 60px rgba(0,0,0,.4)}
  .ph img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:28px}
</style><div class="t"><div class="row"><img src="${logo}"><h1>وزن</h1></div><p>برنامج محاسبة ومحلات عربي<br>بيشتغل بدون إنترنت</p></div><div class="ph"><img src="${dash}"></div>`);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.join(out, 'feature-graphic-1024x500.png') });
// الأيقونة 512×512
await p.setViewportSize({ width: 512, height: 512 });
await p.setContent(`<style>body{margin:0;width:512px;height:512px}</style><img src="${logo}" style="width:512px;height:512px;display:block">`);
await p.screenshot({ path: path.join(out, 'icon-512.png'), omitBackground: false });
await b.close();
console.log('done', fs.readdirSync(out));
