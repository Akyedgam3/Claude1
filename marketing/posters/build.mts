// 100 بوستر إعلاني + حزمة أيقونات لوزن. npx tsx marketing/posters/build.mts <مجلد لقطات المعرض> <مجلد الناتج>
// اللقطات من tests/e2e/gallery.e2e.ts و tests/mobile/gallery.mts (captions.json + raw/). النصوص بـ content.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '../../src/renderer/src/components/icons';
import { POSTERS } from './content.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [SRC, OUT] = process.argv.slice(2) as [string, string];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const caps: Record<string, { title: string; mobile?: boolean }> = JSON.parse(fs.readFileSync(path.join(SRC, 'captions.json'), 'utf8'));
const shotOf = (title: string) => {
  const id = Object.keys(caps).find((k) => caps[k]!.title === title);
  if (!id) throw new Error(`ما في لقطة: ${title}`);
  return `file://${path.join(SRC, 'raw', `${id}.png`)}`;
};
const fontDir = path.join(root, 'web-dist/assets');
const font = (pre: string, w: number) => fs.readdirSync(fontDir).find((f) => f.startsWith(`cairo-${pre}-${w}-normal`) && f.endsWith('.woff2'));
const ff = [600, 700, 800].flatMap((w) => ['arabic', 'latin'].map((p) => (font(p, w) ? `@font-face{font-family:Cairo;font-weight:${w};src:url(file://${fontDir}/${font(p, w)})${p === 'latin' ? ';unicode-range:U+0000-00FF' : ''}}` : ''))).join('');
const logo = `file://${root}/src/renderer/src/assets/logo.png`;
const svg = (name: string, size: number, color = 'currentColor') => renderToStaticMarkup(createElement(Icon, { name, size })).replace('<svg', `<svg style="color:${color}"`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ثيمات: خلفية، لون مميز، لون النص
const THEMES = [
  { bg: 'radial-gradient(1100px 800px at 85% 0%,#1d8a6f 0%,#0f5e4c 45%,#0a3d33 100%)', acc: '#f3c74c', fg: '#fff', sub: '#d9efe8', card: 'rgba(255,255,255,.08)' },
  { bg: 'radial-gradient(1100px 800px at 15% 0%,#2a4d8f 0%,#18305e 50%,#0e1d3b 100%)', acc: '#5fd3b8', fg: '#fff', sub: '#d5def0', card: 'rgba(255,255,255,.08)' },
  { bg: 'linear-gradient(160deg,#fbf7ee 0%,#f1ead8 100%)', acc: '#0f6e5c', fg: '#12302b', sub: '#3d5650', card: 'rgba(15,110,92,.07)' },
  { bg: 'radial-gradient(1000px 800px at 90% 10%,#6c3fa0 0%,#43256b 55%,#291642 100%)', acc: '#ffd166', fg: '#fff', sub: '#e6dcf3', card: 'rgba(255,255,255,.08)' },
  { bg: 'linear-gradient(172deg,#0f6e5c 0%,#0f6e5c 80%,#f3c74c 80%,#f3c74c 100%)', acc: '#fff', fg: '#fff', sub: '#e2f3ee', card: 'rgba(255,255,255,.1)', foot: '#0d3a31' },
  { bg: 'radial-gradient(900px 700px at 80% 0%,#2b2f33 0%,#151719 70%)', acc: '#3ddc97', fg: '#fff', sub: '#c9d1cf', card: 'rgba(255,255,255,.06)' },
  { bg: 'linear-gradient(160deg,#e8f5f1 0%,#d3ece4 100%)', acc: '#c0582a', fg: '#0d3a31', sub: '#33554e', card: 'rgba(13,58,49,.06)' },
  { bg: 'radial-gradient(1000px 800px at 10% 100%,#b5531c 0%,#7a3311 55%,#4a1f0a 100%)', acc: '#ffe08a', fg: '#fff', sub: '#f6e2d6', card: 'rgba(255,255,255,.08)' },
];

type Theme = { bg: string; acc: string; fg: string; sub: string; card: string; foot?: string };
const W = 1080;
const H = 1350;
const css = (t: (typeof THEMES)[number]) => `${ff}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;margin:0}
body{font-family:Cairo;direction:rtl;color:${t.fg}}
.page{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${t.bg}}
.deco{position:absolute;border-radius:50%;background:${t.card};pointer-events:none}
.top{position:absolute;top:56px;right:64px;left:64px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px}
.brand img{width:66px;height:66px;border-radius:18px;box-shadow:0 8px 22px rgba(0,0,0,.25)}
.brand b{font-size:42px;font-weight:800;line-height:1}
.brand span{display:block;font-size:17px;font-weight:600;color:${t.sub}}
.tag{font-size:20px;font-weight:700;padding:6px 18px;border-radius:999px;background:${t.acc};color:${t.acc === '#fff' || t.acc === '#ffe08a' || t.acc === '#f3c74c' || t.acc === '#ffd166' ? '#12302b' : '#fff'}}
h1{font-weight:800;line-height:1.2}
.sub{color:${t.sub};font-weight:600;line-height:1.7}
.foot{position:absolute;bottom:46px;right:64px;left:64px;display:flex;justify-content:space-between;align-items:center;font-size:24px;font-weight:700}
.foot .site{direction:ltr;color:${(t as Theme).foot ?? t.acc}}
.foot .note{color:${(t as Theme).foot ?? t.sub};font-size:20px}
.acc{color:${t.acc}}
`;
const top = (tag: string) => `<div class=top><div class=brand><img src="${logo}"><div><b>وزن</b><span>برنامج محاسبة وإدارة محلات</span></div></div>${tag ? `<span class=tag>${esc(tag)}</span>` : ''}</div>`;
const foot = `<div class=foot><span class=note>بيشتغل بدون إنترنت · كمبيوتر وجوال</span><span class=site>waznsy.com</span></div>`;
const decos = (i: number) => `<div class=deco style="width:${380 + (i % 4) * 60}px;height:${380 + (i % 4) * 60}px;left:${-160 + (i % 3) * 40}px;bottom:${120 + (i % 5) * 30}px"></div><div class=deco style="width:220px;height:220px;right:${-60 - (i % 3) * 20}px;top:${260 + (i % 4) * 40}px"></div>`;

function page(p: any, i: number): string {
  const t = THEMES[i % THEMES.length]!;
  const head = (h: string, s?: string, size = 74) => `<h1 style="font-size:${size}px">${esc(h)}</h1>${s ? `<p class=sub style="font-size:32px;margin-top:14px">${esc(s)}</p>` : ''}`;
  let body = '';
  if (p.t === 'shot') {
    body = `<div style="position:absolute;top:190px;right:64px;left:64px">${head(p.h, p.p)}</div>
<div style="position:absolute;bottom:130px;left:-40px;right:64px;height:640px;border-radius:22px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.4);background:#fff;transform:rotate(-2deg)">
<div style="height:30px;background:#eef3f1;display:flex;gap:8px;align-items:center;padding:0 14px;direction:ltr"><i style="width:11px;height:11px;border-radius:50%;background:#ff5f57"></i><i style="width:11px;height:11px;border-radius:50%;background:#febc2e"></i><i style="width:11px;height:11px;border-radius:50%;background:#28c840"></i></div>
<img src="${shotOf(p.s)}" style="width:100%;display:block"></div>`;
  } else if (p.t === 'phone') {
    body = `<div style="position:absolute;top:200px;right:64px;width:470px">${head(p.h, p.p, 70)}</div>
<div style="position:absolute;bottom:-60px;left:70px;width:430px;border-radius:58px;background:#0b0f0e;padding:14px;box-shadow:0 30px 70px rgba(0,0,0,.45);transform:rotate(4deg)"><img src="${shotOf(p.s)}" style="width:100%;display:block;border-radius:46px"></div>`;
  } else if (p.t === 'icon') {
    body = `<div style="position:absolute;top:250px;left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 90px">
<div style="width:300px;height:300px;border-radius:84px;background:${t.acc};display:grid;place-items:center;box-shadow:0 26px 60px rgba(0,0,0,.3);margin-bottom:70px">${svg(p.i, 170, t.acc === '#fff' || t.acc.startsWith('#f') ? '#12302b' : '#fff')}</div>
${head(p.h, p.p, 86)}</div>`;
  } else if (p.t === 'list') {
    body = `<div style="position:absolute;top:230px;right:64px;left:64px">${head(p.h, undefined, 88)}
<div style="margin-top:60px;display:flex;flex-direction:column;gap:26px">${p.items
      .map(([ic, txt]: [string, string]) => `<div style="display:flex;align-items:center;gap:26px;background:${t.card};border-radius:26px;padding:24px 30px"><div style="width:96px;height:96px;flex:none;border-radius:26px;background:${t.acc};display:grid;place-items:center">${svg(ic, 56, t.acc === '#fff' || t.acc.startsWith('#f') ? '#12302b' : '#fff')}</div><span style="font-size:44px;font-weight:700">${esc(txt)}</span></div>`)
      .join('')}</div></div>`;
  } else if (p.t === 'hook') {
    body = `<div style="position:absolute;top:300px;right:70px;left:70px">
<div style="font-size:200px;line-height:.6;font-weight:800" class=acc>؟</div>
<h1 style="font-size:96px;margin-top:40px">${esc(p.q)}</h1>
<div style="height:8px;width:180px;border-radius:8px;margin:50px 0" class=accbar></div>
<p style="font-size:48px;font-weight:700;line-height:1.5"><span class=acc>وزن:</span> ${esc(p.a)}</p></div>
<style>.accbar{background:${t.acc}}</style>`;
  } else if (p.t === 'biz') {
    body = `<div style="position:absolute;top:220px;right:64px;left:64px">
<div style="display:flex;align-items:center;gap:30px"><div style="width:170px;height:170px;border-radius:48px;background:${t.acc};display:grid;place-items:center;flex:none">${svg(p.i, 100, t.acc === '#fff' || t.acc.startsWith('#f') ? '#12302b' : '#fff')}</div>
<div><p class=sub style="font-size:30px">وزن جاهز لـ</p><h1 style="font-size:78px">${esc(p.h)}</h1></div></div>
<div style="margin-top:80px;display:flex;flex-direction:column;gap:24px">${p.items
      .map((x: string) => `<div style="display:flex;align-items:center;gap:22px;font-size:46px;font-weight:700"><span style="width:58px;height:58px;border-radius:50%;background:${t.card};display:grid;place-items:center;flex:none">${svg('check', 34, t.acc)}</span>${esc(x)}</div>`)
      .join('')}</div>
<p class=sub style="font-size:32px;margin-top:80px">وأكتر من 55 نوع محل تاني، كل واحد بأقسامه الخاصة.</p></div>`;
  }
  const tag = p.t === 'hook' ? '' : p.t === 'biz' ? 'لكل المحلات' : p.t === 'phone' ? 'عالجوال' : p.t === 'list' ? 'وزن' : 'ميزة';
  // كل شي جوّا إطار ثابت: عناصر طالعة لبرّا (اللقطة المايلة) كانت تزيح الصفحة وتقص يمينها
  return `<!doctype html><meta charset=utf-8><style>${css(t)}</style><div class=page>${decos(i)}${top(tag)}${body}${foot}</div>`;
}

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: W, height: H } });
const dir = path.join(OUT, 'بوسترات');
fs.mkdirSync(dir, { recursive: true });
const tmp = path.join(OUT, 'tmp.html');
let n = 0;
for (const [i, p] of POSTERS.entries()) {
  fs.writeFileSync(tmp, page(p, i));
  await pg.goto('file://' + tmp);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(120);
  const name = `${String(i + 1).padStart(3, '0')} - ${(p.h ?? p.q).replace(/[\\/:*?"<>|؟]/g, '').trim()}.jpg`;
  await pg.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 90 });
  n++;
}

// ───── حزمة الأيقونات: 512×512 (خلفية بلون وزن) + شفافة + SVG ─────
const ICONS: [string, string][] = [
  ['pos', 'نقطة البيع'], ['receipt', 'فاتورة'], ['purchase', 'شراء'], ['debts', 'ديون'], ['wallet', 'صندوق'], ['dollar', 'عملات'], ['package', 'مخزون'], ['reports', 'تقارير'],
  ['trend', 'أرباح'], ['chart', 'لوحة الإدارة'], ['users', 'زباين'], ['user-cog', 'صلاحيات'], ['printer', 'طباعة'], ['message', 'واتساب'], ['cloud', 'نسخ احتياطي'], ['wifi', 'بدون إنترنت'],
  ['smartphone', 'جوال'], ['camera', 'باركود بالكاميرا'], ['bell', 'تنبيهات'], ['sparkles', 'مساعد ذكي'], ['learn', 'تعلّم'], ['calendar', 'مواعيد'], ['transfer', 'تحويل'], ['journal', 'قيود'],
  ['accounts', 'حسابات'], ['settings', 'إعدادات'], ['key', 'أمان'], ['eye-off', 'إخفاء الأرقام'], ['network', 'شبكة محلية'], ['download', 'استيراد'], ['check', 'متوازن'], ['warning', 'تحذير'],
  ['shopping-cart', 'سوبرماركت'], ['utensils', 'مطاعم'], ['pill', 'صيدليات'], ['shirt', 'ألبسة'], ['car', 'سيارات'], ['brick-wall', 'مواد بناء'], ['coffee', 'كافيه'], ['gem', 'مجوهرات'],
];
const idir = path.join(OUT, 'أيقونات');
for (const sub of ['ملوّنة 512', 'شفافة 512', 'SVG']) fs.mkdirSync(path.join(idir, sub), { recursive: true });
await pg.setViewportSize({ width: 512, height: 512 });
for (const [i, [name, label]] of ICONS.entries()) {
  const file = `${String(i + 1).padStart(2, '0')} - ${label}`;
  fs.writeFileSync(path.join(idir, 'SVG', `${file}.svg`), renderToStaticMarkup(createElement(Icon, { name, size: 512 })).replace(/currentColor/g, '#0f6e5c'));
  fs.writeFileSync(tmp, `<!doctype html><meta charset=utf-8><style>*{margin:0}body{width:512px;height:512px;display:grid;place-items:center;background:transparent}.b{width:512px;height:512px;border-radius:120px;background:linear-gradient(145deg,#1d8a6f,#0a4a3d);display:grid;place-items:center;box-shadow:inset 0 -10px 30px rgba(0,0,0,.2)}</style><div class=b>${svg(name, 280, '#fff')}</div>`);
  await pg.goto('file://' + tmp);
  await pg.screenshot({ path: path.join(idir, 'ملوّنة 512', `${file}.png`), omitBackground: true });
  fs.writeFileSync(tmp, `<!doctype html><meta charset=utf-8><style>*{margin:0}body{width:512px;height:512px;display:grid;place-items:center;background:transparent}</style>${svg(name, 400, '#0f6e5c')}`);
  await pg.goto('file://' + tmp);
  await pg.screenshot({ path: path.join(idir, 'شفافة 512', `${file}.png`), omitBackground: true });
}
fs.rmSync(tmp, { force: true });
await b.close();
console.log('posters', n, 'icons', ICONS.length);
