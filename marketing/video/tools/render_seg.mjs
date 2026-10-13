import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire('/home/user/Claude1/package.json');
const { chromium } = require('@playwright/test');
const [dir, out, fpsArg, sArg, eArg] = process.argv.slice(2);
const FPS = Number(fpsArg || 30);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
await p.goto('file://' + dir + '/index.html');
await p.waitForFunction(() => window.READY === true);
const dur = await p.evaluate(() => window.DURATION);
const total = Math.round(dur * FPS);
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
const f0 = Math.round(Number(sArg) * FPS), f1 = Math.round(Number(eArg) * FPS);
for (let f = f0; f < f1; f++) {
  await p.evaluate((t) => window.render(t), f / FPS);
  const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) console.log(`frame ${f}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await b.close();
console.log('done', out);
