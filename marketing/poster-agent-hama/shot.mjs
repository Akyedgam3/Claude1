// صورة البوستر: node shot.mjs poster.html out.png [scale]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve(import.meta.dirname, '../../package.json'));
const { chromium } = require('playwright');
const [file, out, scale] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: Number(scale || 1) });
await p.goto('file://' + path.resolve(file)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1350 } }); await b.close();
