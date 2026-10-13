// إعلان الموبايلات: لقطات حقيقية بالوضع الداكن من البيانات التجريبية.
import fs from 'node:fs';
import path from 'node:path';
import { activate, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';

const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/mob/shots';

fs.mkdirSync(OUT, { recursive: true });
type Box = { x: number; y: number; w: number; h: number };
const states: Record<string, { file: string; targets: Record<string, Box> }> = JSON.parse(fs.readFileSync(path.join(OUT, 'states.json'), 'utf8'));

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
    await page.locator('.activity', { hasText: 'موبايلات' }).first().click();
    await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill('النجمة للموبايلات');
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

    await nav(page, 'أوامر الصيانة');
    await btn(/أمر صيانة جديد/).click();
    await page.waitForTimeout(500);
    const dev = page.locator('.field', { hasText: 'الجهاز' }).first().locator('.picker input');
    for (const q of ['رنا', 'iPhone', 'Samsung', 'A']) { try { await pick(page, dev, q); break; } catch { await dev.fill(''); } }
    await page.locator('.field', { hasText: 'الفني' }).locator('input, select').first().fill('أبو خالد').catch(() => {});
    await page.locator('.field', { hasText: 'شكوى الزبون' }).locator('textarea').fill('الشاشة مكسورة، وما عم يشحن');
    await page.locator('.field', { hasText: 'التشخيص' }).locator('textarea').fill('تبديل شاشة أصلية + تنظيف منفذ الشحن');
    const partIn = page.locator('input[placeholder^="+ أضف قطعة"]');
    for (const q of ['شاشة', 'شاحن', 'كبل', 'Samsung']) { try { await pick(page, partIn, q); break; } catch { await partIn.fill(''); } }
    const lab = page.locator('section.card', { hasText: 'أجور اليد' }).locator('tbody tr').first().locator('input');
    if (await lab.count()) { await lab.nth(0).fill('تركيب شاشة وفحص'); await lab.nth(1).fill('25000'); }
    await page.locator('.content').evaluate((c) => c.scrollTo(0, 0));
    await snap('repair', { form: page.locator('section.card.form-grid').first(), parts: page.locator('section.card', { hasText: 'القطع المستخدمة' }), labor: page.locator('section.card', { hasText: 'أجور اليد' }) });
    await nav(page, 'نقطة البيع');
    const imei = await page.evaluate(async () => {
      const s = (await (window as any).mizan.invoke('company:state')) as any;
      const st = s.state ?? s;
      return Object.keys(st.stock['p-a55']?.serials ?? {})[0] as string;
    });
    await page.locator('.scan-input').fill(imei);
    await page.locator('.scan-input').press('Enter');
    await snap('pos', { scan: page.locator('.scan-input'), cart: page.locator('.pos-cart').first(), totals: page.locator('.pos-totals').first() });
  } catch (e) {
    console.error('FAILED', (e as Error).message);
    await page.screenshot({ path: path.join(OUT, 'error.png') });
  } finally {
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(states, null, 1));
    await close();
  }
})();
