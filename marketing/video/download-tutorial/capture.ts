// شرح التحميل والتفعيل: شاشة التفعيل الحقيقية + الموقع.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, licenseFor } from '/home/user/Claude1/tests/e2e/helpers';
const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/dl/assets/shots';
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, Record<string, Box>> = {};
(async () => {
  const { page, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const box = async (loc: ReturnType<typeof page.locator>) => { const b = await loc.first().boundingBox(); return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null; };
  async function snap(name: string, t: Record<string, ReturnType<typeof page.locator>>) {
    await page.addStyleTag({ content: '.toast{display:none!important} textarea{caret-color:transparent!important}' });
    await page.waitForTimeout(400);
    states[name] = {};
    for (const [k, l] of Object.entries(t)) { const b = await box(l); if (b) states[name][k] = b; else console.log('nobox', name, k); }
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('snap', name, Object.keys(states[name]).join(','));
  }
  try {
    await page.getByText('بصمة الجهاز', { exact: true }).waitFor();
    const code = page.locator('.big-code').first();
    await snap('lock', { card: page.locator('section').first(), code, copy: page.getByRole('button', { name: 'نسخ البصمة' }), area: page.locator('textarea'), activate: page.getByRole('button', { name: 'تفعيل', exact: true }) });
    const machineId = (await code.innerText()).trim();
    fs.writeFileSync(path.join(OUT, 'machine.txt'), machineId);
    await page.locator('textarea').fill(licenseFor(machineId, 'annual'));
    await snap('lock_key', { area: page.locator('textarea'), activate: page.getByRole('button', { name: 'تفعيل', exact: true }) });
    await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await page.getByText('شركة جديدة').first().waitFor();
    await snap('welcome', { tabs: page.getByRole('button', { name: 'شركة جديدة' }), main: page.locator('main, .welcome, body').first() });
  } catch (e) { console.error('FAILED', (e as Error).message); await page.screenshot({ path: path.join(OUT, 'error.png') }); }
  finally { await close(); }
  // الموقع من ملفاته
  const require = createRequire('/home/user/Claude1/package.json');
  const { chromium } = require('@playwright/test');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file:///home/user/mizan-updates/index.html');
  await p.waitForTimeout(1200);
  await p.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important} .wa-float{display:none!important}' });
  await p.waitForTimeout(300);
  const dl = p.locator('a.btn', { hasText: 'حمّل ميزان' }).first();
  const db = await dl.boundingBox();
  states['site'] = { dl: { x: Math.round(db!.x), y: Math.round(db!.y), w: Math.round(db!.width), h: Math.round(db!.height) } };
  await p.screenshot({ path: path.join(OUT, 'site.png') });
  console.log('snap site', states['site']);
  await b.close();
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
})();
