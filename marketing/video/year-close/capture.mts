// لقطات فيديو «تسكير السنة»: شاشات حقيقية من وزن (1440×900) ومربعات العناصر للتأشير.
// MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts، سيرفر لـ www على 8790، ثم:
// npx tsx marketing/video/year-close/capture.mts <outdir>
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense } from '../../../src/license/license';
const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const OUT = process.argv[2]!;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.addInitScript(() => localStorage.setItem('mizan.tour.off', '1'));
await p.goto('http://127.0.0.1:8790/index.html');
await p.waitForFunction(() => !document.getElementById('wazn-intro'), null, { timeout: 15000 });
await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
const machineId = (await p.locator('.big-code').first().innerText()).trim();
await p.locator('textarea').first().fill(issueLicense({ customer: 'ت', machineId, plan: 'annual' }, devKey));
await p.getByRole('button', { name: 'تفعيل', exact: true }).click();
await p.getByText('شركة جديدة').first().click();
await p.locator('.act-choose').click();
await p.locator('.act-search input').fill('سوبرماركت');
await p.locator('.act-card').first().click();
await p.locator('.act-modal-foot .primary').click();
await p.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('سوبرماركت الأمانة');
await p.getByRole('button', { name: 'التالي' }).click();
await p.locator('.field', { hasText: 'اسمك' }).locator('input').fill('أبو محمد');
await p.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
await p.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
await p.locator('.demo-check input').check();
await p.getByRole('button', { name: 'إنشاء الشركة' }).click();
await p.getByRole('button', { name: 'حفظته، تابع' }).click();
await p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important} .assistant-fab{display:none!important}' });
await p.waitForTimeout(1200);

const boxes: Record<string, Record<string, number[]>> = {};
const box = async (shot: string, name: string, loc: ReturnType<Page['locator']>) => {
  const r = await loc.first().boundingBox();
  if (r) (boxes[shot] ??= {})[name] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
};
const shot = async (n: string, wait = 1100) => {
  await p.waitForTimeout(wait);
  await p.mouse.move(0, 0);
  await p.screenshot({ path: `${OUT}/${n}.png` });
};
const nav = async (label: string) => {
  await p.locator('nav').getByText(label, { exact: true }).first().click();
  await p.waitForTimeout(500);
};

await shot('home');
await nav('الإعدادات');
await box('backup', 'tab', p.getByRole('button', { name: 'النسخ الاحتياطي' }));
await p.getByRole('button', { name: 'النسخ الاحتياطي' }).click();
await box('backup', 'main', p.locator('.content button.primary').first());
await shot('backup');
await box('period', 'tab', p.getByRole('button', { name: 'إقفال الفترات' }));
await p.getByRole('button', { name: 'إقفال الفترات' }).click();
await p.waitForTimeout(400);
await box('period', 'year', p.locator('h4', { hasText: 'إقفال السنة المالية' }).locator('..'));
await box('period', 'date', p.locator('h4', { hasText: 'إقفال السنة المالية' }).locator('..').locator('input[type=date]'));
await box('period', 'button', p.getByRole('button', { name: 'إقفال السنة' }));
await box('period', 'lock', p.locator('h4', { hasText: 'قفل فترة' }).locator('..'));
await shot('period');
await p.getByRole('button', { name: 'إقفال السنة' }).click();
await p.locator('.modal').getByRole('button', { name: /تأكيد|نعم|إقفال/ }).last().click({ timeout: 2000 }).catch(() => undefined);
await box('closed', 'note', p.locator('.content section.card p').first());
await shot('closed', 1500);
await nav('المواد');
await box('items', 'qty', p.locator('table thead th', { hasText: 'الرصيد' }));
await shot('items');
await nav('الديون');
await shot('debts');
await nav('الصندوق');
await shot('box');
await nav('التقارير');
await box('reports', 'period', p.locator('.content input[type=date]').first());
await shot('reports');
fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
await b.close();
console.log('done', Object.keys(boxes));
