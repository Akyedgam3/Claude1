// تجهيز شركة تجريبية على نسخة الجوال (www على 8790) — مشترك بين الاستكشاف والتصوير
import { chromium, type Page, type Browser } from 'playwright';
import fs from 'node:fs';
import { issueLicense } from '/home/user/Claude1/src/license/license';
const devKey = fs.readFileSync('/home/user/Claude1/dev-keys/license-private.dev.pem', 'utf8');
export async function open(): Promise<{ b: Browser; p: Page }> {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('mizan.tour.off', '1'));
  await p.goto('http://127.0.0.1:8790/index.html');
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 30000 });
  const machineId = (await p.locator('.big-code').first().innerText()).trim();
  await p.locator('textarea').first().fill(issueLicense({ customer: 'ت', machineId, plan: 'annual' }, devKey));
  await p.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await p.getByText('شركة جديدة').first().click();
  await p.locator('.activity', { hasText: 'سوبرماركت' }).click();
  await p.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('سوبرماركت الخير');
  await p.locator('.field', { hasText: 'اسمك' }).locator('input').fill('أبو محمد');
  await p.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
  await p.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
  await p.locator('.demo-check input').check();
  await p.getByRole('button', { name: 'إنشاء الشركة' }).click();
  await p.getByRole('button', { name: 'حفظته، تابع' }).click({ timeout: 60000 });
  await p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important} *{animation-duration:0s!important;transition-duration:0s!important}' });
  await p.waitForTimeout(900);
  return { b, p };
}
export const top = (p: Page) => p.evaluate(() => document.querySelector('.content')?.scrollTo(0, 0));
export const menu = async (p: Page, name: string) => { await p.locator('.mobile-bar .menu').click(); await p.waitForTimeout(400); await p.locator('.sidebar nav button', { hasText: name }).first().click(); await p.waitForTimeout(700); await top(p); };
/** مخطط العناصر الظاهرة: وسم.كلاس + المربع + أول نص (نص JS خام حتى ما يضيف tsx مساعدات جوّا المتصفح) */
export const outline = (p: Page, root = '.content', maxDepth = 7) => p.evaluate(`(() => {
  const out = [];
  function walk(el, d) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > 2600) return;
    const cls = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3).join('.');
    const txt = (el.childElementCount === 0 ? (el.textContent || '') : '').trim().slice(0, 28);
    out.push('  '.repeat(d) + el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']' + (txt ? ' "' + txt + '"' : ''));
    if (d < ${maxDepth}) for (const c of Array.from(el.children)) walk(c, d + 1);
  }
  const rootEl = document.querySelector(${JSON.stringify(root)}); if (rootEl) walk(rootEl, 0);
  return out.join('\\n');
})()`) as Promise<string>;
