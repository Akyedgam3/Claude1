// إعلان السوبرماركت: لقطات حقيقية بالوضع الداكن من البيانات التجريبية.
import fs from 'node:fs';
import path from 'node:path';
import { activate, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';

const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/sm/shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, { file: string; targets: Record<string, Box> }> = {};

(async () => {
  const { page, close } = await launch();
  await page.setViewportSize({ width: 1600, height: 1000 });
  type Loc = ReturnType<typeof page.locator>;
  async function snap(name: string, targets: Record<string, Loc> = {}) {
    await page.addStyleTag({ content: `.toast{display:none!important} input,textarea{caret-color:transparent!important}` });
    await page.waitForTimeout(350);
    const t: Record<string, Box> = {};
    for (const [k, loc] of Object.entries(targets)) {
      const b = await loc.first().boundingBox({ timeout: 3000 }).catch(() => null);
      if (b) t[k] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      else console.log('  (no box)', name, k);
    }
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    states[name] = { file, targets: t };
    console.log('snap', file, Object.keys(t).join(','));
  }
  const dark = () => page.evaluate(() => { localStorage.setItem('mizan.theme', 'dark'); document.documentElement.dataset['theme'] = 'dark'; });
  const m = page.locator('.modal');
  const btn = (name: string | RegExp, exact = false) => page.getByRole('button', { name, exact }).first();
  const esc = async () => { await page.keyboard.press('Escape'); await m.waitFor({ state: 'detached' }).catch(() => {}); };
  try {
    await activate(page);
    await dark();
    await page.getByRole('button', { name: 'شركة جديدة' }).click();
    await page.locator('.activity', { hasText: 'سوبرماركت' }).first().click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('سوبرماركت الخير');
    await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
    await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill('secret123');
    await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill('secret123');
    await page.locator('.demo-check input').check();
    await btn('إنشاء الشركة').click();
    await btn('حفظته، تابع').click();
    await page.locator('.sidebar').waitFor();
    await dark();
    await page.waitForTimeout(500);
    await snap('dash', { stats: page.locator('.stats').first(), side: page.locator('.sidebar nav') });

    const dashTargets = { low: page.locator('section', { hasText: 'نواقص' }).last(), exp: page.locator('section', { hasText: 'تنتهي صلاحيتها' }).last() };
    await page.locator('section', { hasText: 'نواقص' }).last().scrollIntoViewIfNeeded();
    await snap('dash_alerts', dashTargets);
    await page.locator('.content').evaluate((c) => c.scrollTo(0, 0));

    await nav(page, 'نقطة البيع');
    await snap('pos_empty', { scan: page.locator('.scan-input'), tiles: page.locator('.pos-items, .pos-grid').first() });
    const bottom = () => page.evaluate(() => document.querySelectorAll('.pos-lines').forEach((e) => (e.scrollTop = e.scrollHeight)));
    const scan = async (code: string) => { await page.locator('.scan-input').fill(code); await page.locator('.scan-input').press('Enter'); await page.waitForTimeout(250); await bottom(); };
    await scan('6210001000017'); await scan('6210002000016'); await scan('6210003000015');
    await snap('pos_scan', { scan: page.locator('.scan-input'), cart: page.locator('.pos-lines').first(), totals: page.locator('.pos-totals').first() });
    await page.locator('.scan-input').fill('2100101007507');
    await snap('pos_scale0', { scan: page.locator('.scan-input') });
    await page.locator('.scan-input').press('Enter'); await page.waitForTimeout(300); await bottom();
    await snap('pos_scale', { scan: page.locator('.scan-input'), cart: page.locator('.pos-lines').first(), cheese: page.locator('.pos-lines > *', { hasText: 'جبنة' }).first(), totals: page.locator('.pos-totals').first() });
    await scan('6210001000098');
    await snap('pos_carton', { cart: page.locator('.pos-lines').first(), carton: page.locator('.pos-lines > *', { hasText: 'زيت' }).first(), totals: page.locator('.pos-totals').first() });

    await nav(page, 'المواد');
    await page.locator('table.table tbody tr', { hasText: 'زيت دوار الشمس' }).first().click();
    await page.waitForTimeout(300);
    await m.getByRole('button', { name: 'الأسعار والوحدات' }).click().catch(() => {});
    await page.waitForTimeout(300);
    await snap('item_units', { modal: m, retail: m.locator('.field', { hasText: 'سعر المبيع (مفرق)' }), whole: m.locator('.field', { hasText: 'سعر الجملة' }), units: m.locator('table').first() });
    await esc();
    await snap('items', { table: page.locator('table.table').first() });

    await nav(page, 'العملاء والموردون');
    await page.locator('.segmented button', { hasText: 'العملاء' }).click().catch(() => {});
    await snap('parties', { table: page.locator('table.table').first() });
    await page.locator('table.table tbody tr', { hasText: 'أبو خالد' }).first().click();
    await page.waitForTimeout(400);
    await snap('party', { table: page.locator('table.table').first(), card: page.locator('.split > *').last() });

    await nav(page, 'التقارير');
    await page.getByRole('button', { name: 'إغلاق اليوم' }).first().click();
    await page.waitForTimeout(500);
    await snap('daily', { main: page.locator('.content') });
    await page.getByRole('button', { name: 'الأرباح والخسائر' }).first().click();
    await page.waitForTimeout(300);
    const td = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await page.locator('input[type=date]').first().fill(td);
    await page.waitForTimeout(500);
    await snap('income', { main: page.locator('.content') });
  } catch (e) {
    console.error('FAILED', (e as Error).message);
    await page.screenshot({ path: path.join(OUT, 'error.png') });
  } finally {
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
    await close();
  }
})();
