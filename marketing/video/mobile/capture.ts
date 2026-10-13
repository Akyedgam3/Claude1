// إعلان الموبايلات: لقطات حقيقية بالوضع الداكن من البيانات التجريبية.
import fs from 'node:fs';
import path from 'node:path';
import { activate, launch, nav, pick } from '/home/user/Claude1/tests/e2e/helpers';

const OUT = '/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/mob/shots';
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

    await nav(page, 'سجل الأجهزة');
    const sold = await page.evaluate(async () => {
      const s = (await (window as any).mizan.invoke('company:state')) as any;
      const st = s.state ?? s;
      const inv = st.invoices.find((i: any) => i.kind === 'sale' && i.partyId === 'c-rana');
      return inv.lines[0].serials[0] as string;
    });
    fs.writeFileSync(path.join(OUT, 'imei.txt'), sold);
    await snap('imei_empty', { search: page.locator('.imei-search'), list: page.locator('.card', { hasText: 'الأجهزة الموجودة' }) });
    await page.locator('.imei-search input').fill(sold);
    await page.locator('.imei-search input').press('Enter');
    await snap('device', { search: page.locator('.imei-search'), card: page.locator('.device-card'), status: page.locator('.device-status'), events: page.locator('.device-card table') });

    await nav(page, 'التقسيط');
    await btn(/خطة تقسيط/).click();
    await snap('inst_new', { modal: m, strip: m.locator('.plan-strip') });
    await esc();
    await page.locator('table.table tbody tr', { hasText: 'أبو علي' }).click();
    await snap('inst', { table: page.locator('.installments-table').first(), late: page.locator('.installments-table tr.late').first(), wa: btn(/نسخ تذكير/), strip: page.locator('.plan-strip').first(), guarantor: page.locator('text=الكفيل').first() });

    await nav(page, 'بيع مع استبدال');
    await pick(page, page.locator('.card .field', { hasText: 'الزبون' }).locator('.picker input'), 'رنا');
    await pick(page, page.locator('.trade-new .picker input'), 'Redmi');
    await page.locator('.trade-new select').selectOption({ index: 1 });
    await page.locator('.trade-old .field', { hasText: 'الموديل' }).locator('input').fill('Samsung A32 مستعمل');
    await page.locator('.trade-old .field', { hasText: 'IMEI' }).locator('input').fill('354111222333444');
    await page.locator('.trade-old .field', { hasText: 'البطارية' }).locator('input').fill('86');
    await page.locator('.trade-old .field', { hasText: 'سعر الشراء' }).locator('input').fill('9000');
    await snap('trade', { neu: page.locator('.trade-new'), old: page.locator('.trade-old') });
    const tstrip = page.locator('.plan-strip').first();
    await tstrip.scrollIntoViewIfNeeded();
    await snap('trade2', { strip: tstrip, go: btn('تنفيذ الاستبدال') });

    await nav(page, 'تجميعة كمبيوتر');
    const r = (label: string) => page.locator('.build-table tbody tr', { hasText: label });
    await pick(page, r('المعالج').locator('.picker input'), 'i5');
    await pick(page, r('المازربورد').locator('.picker input'), 'B760');
    await pick(page, r('الرام').locator('.picker input'), '16GB');
    await r('الرام').locator('input.num-input').first().fill('2');
    await pick(page, r('التخزين').locator('.picker input'), 'NVMe');
    await pick(page, r('كرت الشاشة').locator('.picker input'), 'RTX');
    await r('كرت الشاشة').locator('select').selectOption({ index: 1 });
    await pick(page, r('الباور').locator('.picker input'), 'باور');
    await page.locator('.field', { hasText: 'أجور التجميع' }).locator('input').fill('1500');
    await page.locator('.field', { hasText: 'اسم التجميعة' }).locator('input').fill('تجميعة جيمنج i5');
    await snap('build', { table: page.locator('.build-table'), cpu: r('المعالج'), gpu: r('كرت الشاشة') });
    const bstrip = page.locator('.plan-strip').first();
    await bstrip.scrollIntoViewIfNeeded();
    await snap('build2', { strip: bstrip, sell: btn('بيع التجميعة') });

    await nav(page, 'أوامر الصيانة');
    await snap('repairs', { table: page.locator('table.table').first() });
    await page.locator('table.table tbody tr').first().click();
    await page.waitForTimeout(500);
    await snap('repair', { main: page.locator('.content') });

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
