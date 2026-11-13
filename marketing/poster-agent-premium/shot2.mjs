import { createRequire } from 'node:module';
const require = createRequire('/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/adx2/x.mjs');
const { chromium } = require('playwright');
const [url, out, scale] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: Number(scale || 1) });
await p.goto(url); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1350 } }); await b.close();
