import { expect, test } from '@playwright/test';

// فحص الشكل: بكل شاشات القائمة وبحجمين للشاشة، ما في زر أو حقل أو جدول طالع برّا الصندوق تبعه، ولا الصفحة بتتمرّر بالعرض.
import { activate, createCompany, launch } from './helpers';

const SCAN = () => {
  const out: string[] = [];
  const content = document.querySelector('.content') as HTMLElement;
  if (content && content.scrollWidth > content.clientWidth + 2) out.push(`PAGE hscroll ${content.scrollWidth}>${content.clientWidth}`);
  // النافذة نفسها ما لازم تتمرّر بالعرض (بطاقات «دين سابق / سلفة / بضاعة» كانت تطلع برّا الدين)
  for (const m of Array.from(document.querySelectorAll('.modal-body'))) {
    if (m.scrollWidth > m.clientWidth + 2) out.push(`MODAL hscroll "${document.querySelector('.modal header')?.textContent?.trim().slice(0, 30)}" ${m.scrollWidth}>${m.clientWidth}`);
  }
  const scrollsX = (el: Element | null): boolean => {
    for (let e = el?.parentElement; e && e !== content; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll|hidden)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
    }
    return false;
  };
  const els = Array.from(document.querySelectorAll('.content button, .content input, .content select, .content textarea, .content .stat, .content table, .content label, .modal button, .modal input, .modal select'));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const box = el.parentElement?.closest('.card, .modal, .stat, .page, section, aside') as HTMLElement | null;
    if (!box) continue;
    const b = box.getBoundingClientRect();
    if ((r.right > b.right + 2 || r.left < b.left - 2) && !scrollsX(el)) {
      out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className} "${(el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 30)}" in ${box.className.split(' ')[0]} by ${Math.round(Math.max(r.right - b.right, b.left - r.left))}px`);
    }
  }
  // خلية جدول صارت flex أو block بتخرّب السطر (حدودها وخلفيتها بتطلع مزاحة)
  for (const td of Array.from(document.querySelectorAll('.content table.table td, .content table.table th, .modal table.table td'))) {
    const d = getComputedStyle(td).display;
    if (d !== 'table-cell' && d !== 'none' && !document.body.classList.contains('mobile')) out.push(`cell display:${d} .${(td as HTMLElement).className}`);
  }
  return [...new Set(out)].slice(0, 12);
};

for (const act of (process.env.ACTS ?? 'سوبرماركت,مطعم').split(',')) {
  test(`layout: nothing overflows its box (${act})`, async () => {
    test.setTimeout(600000);
    const { page, close } = await launch();
    const all: string[] = [];
    try {
      await activate(page);
      await createCompany(page, { name: 'محل الفحص', activity: act, demo: true });
      for (const [w, h] of [[1366, 768], [1100, 700]] as const) {
        await page.setViewportSize({ width: w, height: h });
        const names = await page.locator('.sidebar nav button').allInnerTexts();
        for (let i = 0; i < names.length; i++) {
          const b = page.locator('.sidebar nav button').nth(i);
          if (!(await b.isVisible())) continue;
          await b.click();
          await page.waitForTimeout(350);
          const issues = await page.evaluate(SCAN);
          if (issues.length) all.push(`[${w}] ${names[i]!.replace(/\s+/g, ' ').trim()}: ` + issues.join(' | '));
          // النوافذ اللي بتنفتح من أزرار «جديد / تسجيل / +» بأعلى الشاشة
          const openers = page.locator('.content .page-header button, .content .toolbar button, .content > div > header button').filter({ hasText: /^\s*\+|جديد|تسجيل/ });
          const n = Math.min(await openers.count(), 4);
          for (let k = 0; k < n; k++) {
            const o = openers.nth(k);
            if (!(await o.isVisible()) || !(await o.isEnabled())) continue;
            const label = (await o.innerText()).trim();
            await o.click().catch(() => undefined);
            if (await page.locator('.modal').first().isVisible({ timeout: 800 }).catch(() => false)) {
              await page.waitForTimeout(250);
              const mi = await page.evaluate(SCAN);
              if (mi.length) all.push(`[${w}] ${names[i]!.replace(/\s+/g, ' ').trim()} ← ${label}: ` + mi.join(' | '));
              await page.keyboard.press('Escape');
              await page.waitForTimeout(150);
              if (await page.locator('.modal').first().isVisible().catch(() => false)) await page.locator('.modal header button').first().click().catch(() => undefined);
            }
          }
        }
      }
    } finally {
      await close();
    }
    expect(all).toEqual([]);
  });
}
