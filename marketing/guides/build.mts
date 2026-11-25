// ملفات PDF تعليمية للوكلاء من نفس «دليل الاستخدام» تبع البرنامج (مواضيع المساعد).
// npx tsx marketing/guides/build.mts ← marketing/guides/out/دليل وزن/ (مجلد لكل قسم + ملف لكل موضوع + الدليل كامل) و.zip
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { TOPICS } from '../../src/renderer/src/assistant/knowledge';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(new URL(import.meta.url).pathname);
const outRoot = path.join(here, 'out');
const root = path.join(outRoot, 'دليل وزن');

// نفس أقسام شاشة «تعلّم وزن» (GROUP_STARTS بـ screens/Learn.tsx)
const GROUP_STARTS: { id: string; title: string }[] = [
  { id: 'sale', title: 'البيع' },
  { id: 'purchase', title: 'الشراء والمواد' },
  { id: 'add-party', title: 'الزباين والديون والسندات' },
  { id: 'profit', title: 'التقارير' },
  { id: 'add-employee', title: 'الموظفين والشركاء' },
  { id: 'backup', title: 'الإعدادات والحماية' },
  { id: 'restaurant', title: 'حسب نوع الشغل' },
  { id: 'zero-box', title: 'ميزات جديدة' },
];
type T = (typeof TOPICS)[number];
const groups: { title: string; topics: T[] }[] = [];
for (const t of TOPICS) {
  const g = GROUP_STARTS.find((s) => s.id === t.id);
  if (g || !groups.length) groups.push({ title: g?.title ?? 'عام', topics: [] });
  groups[groups.length - 1]!.topics.push(t);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fileName = (s: string) => s.replace(/[؟?]/g, '').replace(/[\\/:*"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
const pad = (n: number) => String(n).padStart(2, '0');

/** الجواب: كل سطر فقرة، والخطوات المفصولة بـ «←» قائمة مرقّمة */
function answer(a: string): string {
  return a
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const steps = line.split('←').map((s) => s.trim()).filter(Boolean);
      // مسار قصير بالقوائم (الديون ← اختاره ← «قبض»): بسطر واحد
      const short = steps.length >= 2 && steps.slice(1).every((s) => s.length <= 28);
      if (short) {
        const [first, ...rest] = steps;
        return `<p>${esc(first!)} ← ${rest.map((s) => `<b>${esc(s)}</b>`).join(' ← ')}</p>`;
      }
      if (steps.length >= 3) return `<ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
      if (steps.length === 2) return `<p>${esc(steps[0]!)} ← <b>${esc(steps[1]!)}</b></p>`;
      return `<p>${esc(line)}</p>`;
    })
    .join('');
}
const topicHtml = (t: T, n: string) => `<section class="topic">
  <h2><span class="n">${n}</span>${esc(t.q)}</h2>
  ${answer(t.a)}
  ${t.go?.length ? `<div class="go">وين بلاقيها بالبرنامج: ${t.go.map((g) => `<span>${esc(g.label)}</span>`).join(' ')}</div>` : ''}
</section>`;

const css = `
@font-face { font-family: Cairo; src: url(../prices-2027/fonts/cairo-arabic-400-normal.woff2); font-weight: 400; unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F; }
@font-face { font-family: Cairo; src: url(../prices-2027/fonts/cairo-arabic-700-normal.woff2); font-weight: 600 800; unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F; }
@font-face { font-family: Cairo; src: url(../prices-2027/fonts/cairo-arabic-900-normal.woff2); font-weight: 900; unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F; }
@font-face { font-family: Cairo; src: url(../prices-2027/fonts/cairo-latin-400-normal.woff2); font-weight: 400; }
@font-face { font-family: Cairo; src: url(../prices-2027/fonts/cairo-latin-700-normal.woff2); font-weight: 600 800; }
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Cairo, sans-serif; color: #0b2a24; font-size: 12.5pt; line-height: 1.85; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.head { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #14957c; padding-bottom: 10px; margin-bottom: 16px; }
.head img { width: 54px; height: 54px; border-radius: 14px; }
.head b { font-size: 20pt; font-weight: 900; display: block; line-height: 1.2; }
.head small { color: #14957c; font-weight: 700; font-size: 11pt; }
h1.group { font-size: 17pt; font-weight: 900; background: #e3f2ee; color: #0a3a32; padding: 6px 14px; border-radius: 10px; margin: 18px 0 10px; break-after: avoid; }
h1.group.first { margin-top: 0; }
.topic { border: 1px solid #dfe9e5; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; break-inside: avoid; }
.topic h2 { font-size: 14pt; font-weight: 800; color: #0f6e5c; margin-bottom: 6px; display: flex; gap: 10px; align-items: baseline; }
.topic h2 .n { flex: none; background: #0f6e5c; color: #fff; border-radius: 8px; font-size: 10pt; padding: 0 8px; }
.topic p { margin: 4px 0; }
.topic ol { margin: 6px 22px 6px 0; }
.topic li { margin: 3px 0; padding-right: 4px; }
.topic li::marker { color: #14957c; font-weight: 800; }
.go { margin-top: 8px; font-size: 10.5pt; color: #4f6d66; }
.go span { display: inline-block; background: #e3f2ee; color: #0a3a32; font-weight: 700; border-radius: 6px; padding: 0 8px; margin: 2px; }
.toc { columns: 2; column-gap: 24px; font-size: 11pt; }
.toc h3 { font-size: 12.5pt; color: #0f6e5c; font-weight: 900; margin-top: 8px; break-after: avoid; }
.toc div { break-inside: avoid; }
.foot { margin-top: 14px; font-size: 9.5pt; color: #4f6d66; text-align: center; }
`;
const page = (title: string, sub: string, body: string) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="head"><img src="../prices-2027/logo.png" alt=""><div><b>${esc(title)}</b><small>${esc(sub)}</small></div></div>
${body}
<div class="foot">وزن — برنامج المحاسبة وإدارة المحلات · waznsy.com</div></body></html>`;

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
const browser = await chromium.launch();
const tab = await browser.newPage();
const tmp = path.join(here, '.page.html');
async function pdf(html: string, file: string) {
  fs.writeFileSync(tmp, html);
  await tab.goto('file://' + tmp);
  await tab.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await tab.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true });
}

let count = 0;
for (const [gi, g] of groups.entries()) {
  const dir = path.join(root, `${pad(gi + 1)} - ${g.title}`);
  // القسم كامل بملف واحد، وكل موضوع بملف لحالو
  await pdf(page(`دليل وزن: ${g.title}`, `${g.topics.length} موضوع`, `<h1 class="group first">${esc(g.title)}</h1>` + g.topics.map((t, i) => topicHtml(t, `${gi + 1}.${i + 1}`)).join('')), path.join(dir, `00 - ${g.title} (القسم كامل).pdf`));
  for (const [i, t] of g.topics.entries()) {
    await pdf(page('دليل وزن', g.title, topicHtml(t, `${gi + 1}.${i + 1}`)), path.join(dir, `${pad(i + 1)} - ${fileName(t.q)}.pdf`));
    count++;
  }
}
// الدليل كامل مع فهرس
const toc = `<h1 class="group first">الفهرس</h1><div class="toc">${groups.map((g, gi) => `<div><h3>${gi + 1}. ${esc(g.title)}</h3>${g.topics.map((t, i) => `<div>${gi + 1}.${i + 1} ${esc(t.q)}</div>`).join('')}</div>`).join('')}</div>`;
const all = groups.map((g, gi) => `<h1 class="group" style="break-before: page">${gi + 1}. ${esc(g.title)}</h1>` + g.topics.map((t, i) => topicHtml(t, `${gi + 1}.${i + 1}`)).join('')).join('');
await pdf(page('دليل وزن الكامل', `${TOPICS.length} موضوع بـ ${groups.length} أقسام`, toc + all), path.join(root, '00 - دليل وزن الكامل.pdf'));
// فهرس لحالو: شو بكل مجلد
await pdf(page('فهرس دليل وزن', 'كل مجلد فيه ملف «القسم كامل» وملف لكل سؤال', toc), path.join(root, '00 - الفهرس.pdf'));
await browser.close();
fs.rmSync(tmp, { force: true });
execFileSync('zip', ['-qr', 'دليل وزن.zip', 'دليل وزن'], { cwd: outRoot });
console.log(`${count} موضوع، ${groups.length} أقسام ← ${root}`);
