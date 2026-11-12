// رندر حتمي مع motion blur ذكي: node render.mjs <out.mp4> <from> <to> [scale=1] [maxsub=10]
// لكل فريم (30fps) منسأل الصفحة قديش في حركة، ومنصوّر عدد فريمات فرعية حسبها ومندمجهن (shutter ≈ 216°).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const [out, fromA, toA, scaleA, maxA] = process.argv.slice(2);
const from = Number(fromA), to = Number(toA), scale = Number(scaleA || 1), MAXSUB = Number(maxA || 10), FPS = 30, SHUTTER = 0.6;
const Wd = Math.round(1080 * scale), Hd = Math.round(1920 * scale);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
const total = Math.round((to - from) * FPS);
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${Wd}x${Hd}`, '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now(); let shots = 0;
const grab = async (t) => { await p.evaluate((x) => window.render(x), t); const buf = await p.screenshot({ type: 'jpeg', quality: 94 }); shots++; return sharp(buf).removeAlpha().raw().toBuffer(); };
for (let f = 0; f < total; f++) {
  const t = from + f / FPS;
  const m = await p.evaluate(([x, dt]) => window.motion(x, dt), [t, 1 / FPS]);
  const sub = Math.max(1, Math.min(MAXSUB, Math.round((m * scale) / 7)));
  let frame;
  if (sub === 1) frame = await grab(t);
  else {
    const acc = new Uint16Array(Wd * Hd * 3);
    for (let s = 0; s < sub; s++) { const raw = await grab(t + ((s / sub) * SHUTTER) / FPS); for (let i = 0; i < acc.length; i++) acc[i] += raw[i]; }
    frame = Buffer.allocUnsafe(acc.length); for (let i = 0; i < acc.length; i++) frame[i] = (acc[i] / sub + 0.5) | 0;
  }
  if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 30 === 0) console.log(`frame ${f}/${total} shots=${shots} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await b.close();
console.log('done', out, 'shots', shots, ((Date.now() - t0) / 1000).toFixed(0) + 's');
