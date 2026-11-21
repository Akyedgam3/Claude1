// فحص شكل الموبايل: بيفتح كل شاشات القائمة على الجوال (والتابلت) وبيدوّر على أي زر أو حقل أو بطاقة طالعة برّا الشاشة أو برّا صندوقها،
// وعلى الصفحة إذا بتتمرّر بالعرض. بيطبع المشاكل وبيطلع بكود 1 إذا في شي، وبيصوّر كل شاشة.
// التشغيل: MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts && (cd www && python3 -m http.server 8790) &
//          npx tsx tests/mobile/layout.mts <مجلد الصور> [390x844] [سوبرماركت,مطعم]
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { issueLicense } from '../../src/license/license';

const devKey = fs.readFileSync('dev-keys/license-private.dev.pem', 'utf8');
const S = process.argv[2] ?? '/tmp';
const [W, H] = (process.argv[3] ?? '390x844').split('x').map(Number) as [number, number];
const acts = (process.argv[4] ?? 'سوبرماركت').split(',');

const SCAN = () => {
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  const root = document.scrollingElement as HTMLElement;
  if (root.scrollWidth > vw + 2) out.push(`PAGE hscroll ${root.scrollWidth}>${vw}`);
  const scrollsX = (el: Element): boolean => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
    }
    return false;
  };
  const hiddenByAncestor = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return true;
    }
    return false;
  };
  const sel = '.content button, .content input:not([type=checkbox]):not([type=radio]), .content select, .content textarea, .content .card, .content .stat, .content td, .modal button, .modal input:not([type=checkbox]):not([type=radio]), .modal select, .bottom-nav button, .mobile-bar button';
  for (const el of Array.from(document.querySelectorAll(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || hiddenByAncestor(el) || scrollsX(el)) continue;
    const name = `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ').slice(0, 2).join('.')} "${(el.textContent || (el as HTMLInputElement).placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 26)}"`;
    if (r.right > vw + 2 || r.left < -2) {
      out.push(`${name} off-screen by ${Math.round(Math.max(r.right - vw, -r.left))}px`);
      continue;
    }
    const box = el.parentElement?.closest('.card, .modal, .stat, tr, section') as HTMLElement | null;
    if (box && box !== el) {
      const b = box.getBoundingClientRect();
      if (r.right > b.right + 2 || r.left < b.left - 2) out.push(`${name} outside ${box.className.split(' ')[0] || box.tagName} by ${Math.round(Math.max(r.right - b.right, b.left - r.left))}px`);
    }
    // نص الزر مقصوص (أطول من الزر)
    if (el.tagName === 'BUTTON' && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 3 && getComputedStyle(el).overflow !== 'visible') out.push(`${name} text clipped`);
  }
  // عنوان أو اسم محشور بعمود ضيق (كل كلمة بسطر)
  for (const el of Array.from(document.querySelectorAll('.content h1, .content h2, .content h3, .content .card b, .content .card strong, .modal h3'))) {
    const r = el.getBoundingClientRect();
    const t = (el.textContent || '').trim();
    if (!r.width || hiddenByAncestor(el) || t.length < 8 || t.split(/\s+/).length < 2) continue;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5;
    if (r.height > lh * 2.6 && r.width < vw * 0.4) out.push(`squeezed "${t.slice(0, 24)}" ${Math.round(r.width)}px wide, ${Math.round(r.height / lh)} lines`);
  }
  return [...new Set(out)].slice(0, 10);
};

let failed = 0;
for (const act of acts) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('mizan.tour.off', '1'));
  await p.addInitScript('window.__name = (f) => f'); // tsx بيلف الدوال الداخلية بـ __name
  await p.goto('http://127.0.0.1:8790/index.html');
  await p.getByText('بصمة الجهاز', { exact: true }).waitFor({ timeout: 20000 });
  const issues: string[] = [];
  const check = async (where: string) => {
    const r = await p.evaluate(SCAN);
    if (r.length) issues.push(`[${act} ${W}] ${where}\n    ` + r.join('\n    '));
  };
  await check('lock screen');
  const machineId = (await p.locator('.big-code').first().innerText()).trim();
  await p.locator('textarea').first().fill(issueLicense({ customer: 'تجربة', machineId, plan: 'annual' }, devKey));
  await p.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await p.locator('.wizard').waitFor();
  await check('new company step 1');
  await p.locator('.act-choose').click();
  await p.waitForTimeout(300);
  await check('activity picker');
  await p.locator('.act-search input').fill(act);
  await p.locator('.act-card').first().click();
  await p.locator('.act-modal-foot .primary').click();
  await check('new company step 2');
  await p.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('محل الفحص');
  await p.getByRole('button', { name: 'التالي' }).click();
  await check('new company step 3');
  await p.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
  await p.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
  await p.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
  await p.locator('.demo-check input').check();
  await p.getByRole('button', { name: 'إنشاء الشركة' }).click();
  await p.getByRole('button', { name: 'حفظته، تابع' }).click();
  await p.locator('.sidebar').waitFor({ state: 'attached' });
  await p.waitForTimeout(800);

  const openNav = async (pg: Page) => {
    // تابلت عرضي: القائمة ثابتة. الجوال: درج بينفتح (شكله «visible» حتى وهو برّا الشاشة)
    if (!(await pg.locator('.bottom-nav').isVisible()) && !(await pg.locator('.mobile-bar .menu').isVisible())) return;
    if (await pg.locator('.shell.nav-open').count()) return;
    if (await pg.locator('.bottom-nav').isVisible()) await pg.locator('.bottom-nav button').last().click();
    else await pg.locator('.mobile-bar .menu').click();
    await pg.waitForTimeout(350);
  };
  await openNav(p);
  const names = (await p.locator('.sidebar nav button').allInnerTexts()).map((n) => n.replace(/\s+/g, ' ').trim());
  for (let i = 0; i < names.length; i++) {
    await openNav(p);
    const btn = p.locator('.sidebar nav button').nth(i);
    if (!(await btn.isVisible())) continue;
    await btn.click();
    await p.waitForTimeout(600);
    await check(names[i]!);
    await p.screenshot({ path: `${S}/ml-${W}-${act}-${String(i).padStart(2, '0')}.png` });
  }
  await b.close();
  if (issues.length) {
    failed += issues.length;
    console.log(issues.join('\n'));
  }
}
console.log(failed ? `\n${failed} screens with problems` : 'mobile layout OK');
process.exit(failed ? 1 : 0);
