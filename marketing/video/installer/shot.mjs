import { createRequire } from 'node:module';
const require = createRequire('/home/user/Claude1/package.json');
const { chromium } = require('@playwright/test');
const d = process.argv[2];
const b = await chromium.launch();
for (const [f, w, h] of [['side', 164, 314], ['head', 150, 57]]) {
  const p = await b.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  await p.goto(`file://${d}/${f}.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.locator('body').screenshot({ path: `${d}/${f}.png` });
}
await b.close();
