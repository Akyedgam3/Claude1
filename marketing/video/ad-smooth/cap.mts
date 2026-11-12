// تصوير شاشات الجوال الحقيقية: لقطة عادية (844) + شريط طويل للمحتوى + مربعات العناصر (boxes.json)
import fs from 'node:fs';
import { open, top, menu } from './_adx_setup.mts';
const OUT = process.argv[2]!;
const { b, p } = await open();
const boxes: Record<string, any> = {};
const wait = (ms: number) => p.waitForTimeout(ms);
const shot = async (n: string) => { await wait(650); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
// spec: "selector" أو "selector@@نص" (فلترة بالنص) أو "A >> B" (B جوّا A)
const rects = (spec: Record<string, string>, offY = 0) => p.evaluate(`(() => {
  const spec = ${JSON.stringify(spec)}; const out = {};
  function pick(root, s) { const [sel, txt] = s.split('@@'); let els = Array.from(root.querySelectorAll(sel.trim())); if (txt) els = els.filter((e) => (e.textContent || '').includes(txt.trim())); return els; }
  for (const k in spec) {
    const parts = spec[k].split('>>'); let els = pick(document, parts[0]);
    for (let i = 1; i < parts.length; i++) els = els.flatMap((e) => pick(e, parts[i]));
    out[k] = els.map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: +r.left.toFixed(2), y: +(r.top - ${offY}).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), r: parseFloat(cs.borderTopLeftRadius) || 0, t: (el.textContent || '').trim().slice(0, 48) }; });
  }
  return out; })()`) as Promise<Record<string, any[]>>;
const navVis = (v: string) => p.evaluate(`(() => { const n = document.querySelector('.bottom-nav'); if (n) n.style.visibility = '${v}'; })()`);
async function strip(name: string, spec: Record<string, string>, cap = 2600) {
  await top(p);
  const h = (await p.evaluate(`document.querySelector('.content').scrollHeight`)) as number;
  const H = Math.min(h, cap);
  await navVis('hidden');
  await p.setViewportSize({ width: 390, height: 66 + H });
  await wait(800); await top(p); await wait(200);
  await p.screenshot({ path: `${OUT}/${name}-tall.png` });
  boxes[name] = { H, full: h, ...(await rects(spec, 66)) };
  await p.setViewportSize({ width: 390, height: 844 });
  await navVis(''); await wait(500); await top(p);
  console.log('strip', name, H, '/', h);
}
const safe = async (n: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.log('FAIL', n, (e as Error).message.split('\n')[0]); } };
const HOME = { hero: '.activity-hero', qa: '.quick-actions button', stat: '.stats .stat', dp: '.daily-profit', dpnet: '.dp-net', dpkv: '.dp-kv', low: 'section.card@@نواقص', lowrow: 'section.card@@نواقص >> tr' };

await top(p); await shot('home');
boxes.chrome = await rects({ bar: '.mobile-bar', nav: '.bottom-nav', content: '.content' });

// ── نقطة البيع: مادتين ← السلة ← دفع نقداً ──
await safe('pos', async () => {
  await p.locator('.content button', { hasText: 'نقطة البيع' }).first().click(); await wait(900);
  await shot('pos0'); boxes.pos0 = await rects({ tile: '.pos-item', tabs: '.m-cart-tabs', grid: '.pos-grid' });
  const tiles = p.locator('.pos-item');
  await tiles.nth(0).click(); await shot('pos1');
  await tiles.nth(2).click(); await shot('pos2');
  boxes.pos2 = await rects({ tile: '.pos-item', bar: 'button@@عرض السلة والدفع', bar2: '.m-cart-go, .pos-go, .cart-bar' });
  await p.getByText('عرض السلة والدفع').click(); await wait(500);
  await shot('cart'); boxes.cart = await rects({ pay: '.pos-pay button', line: '.pos-line-wrap', totals: '.pos-totals', grand: 'strong.grand', card: '.pos-cart' });
  await p.getByRole('button', { name: 'دفع نقداً' }).click(); await wait(1500);
  await shot('paid'); console.log('thermal after pay', await p.locator('.thermal-doc').count());
});
// ── الفاتورة المحفوظة + الإيصال الحراري الحقيقي ──
await safe('invoice', async () => {
  await p.locator('.bottom-nav button', { hasText: 'الفواتير' }).click(); await wait(800); await top(p);
  await shot('invoices');
  await p.locator('table tbody tr').first().click(); await wait(900); await top(p);
  await shot('invoice');
  await strip('invoice', { hero: '.m-inv-hero', chip: '.m-inv-chip', total: '.m-inv-total', actions: '.m-inv-actions', lines: '.m-inv-lines', sums: '.m-inv-sums', gain: '.m-inv-sums .gain' });
  const n = await p.locator('.thermal-doc').count(); console.log('thermal on invoice', n);
  if (n) {
    await p.emulateMedia({ media: 'print' });
    await p.evaluate(`document.body.dataset.paper = '80mm'`);
    await wait(500);
    await p.locator('.thermal-doc').first().screenshot({ path: `${OUT}/receipt.png` });
    console.log('receipt ok');
    await p.emulateMedia({ media: 'screen' });
    await p.evaluate(`delete document.body.dataset.paper`);
    await wait(300);
  }
});
await safe('items', async () => { await menu(p, 'المواد'); await shot('items'); await strip('items', { row: 'table.m-cards tr.clickable', qty: 'table.m-cards tr.clickable >> td.num', head: '.page-header', tools: '.toolbar' }, 1700); });
await safe('debts', async () => { await p.locator('.bottom-nav button', { hasText: 'الديون' }).click(); await wait(700); await top(p); await shot('debts'); await strip('debts', { stat: '.debt-stats .stat', row: 'table.debt-table tr.clickable', debit: 'table.debt-table .debit', tools: '.debt-toolbar', intro: '.page-intro' }, 2000); });
await safe('cash', async () => { await menu(p, 'الصندوق'); await shot('cash'); await strip('cash', { card: '.cash-card', stat: '.stats .stat', head: '.cash-head', row: 'table.statement tbody tr', period: '.period-picker' }, 2100); });
await safe('watch', async () => { await menu(p, 'مراقبة المواد'); await shot('watch'); await strip('watch', { stat: '.stats .stat', row: 'table.item-watch tr.clickable', tools: '.toolbar' }, 2000); });
await safe('home2', async () => { await p.locator('.bottom-nav button', { hasText: 'الرئيسية' }).click(); await wait(800); await top(p); await shot('home2'); await strip('home2', HOME, 2700); });
fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
await b.close(); console.log('ok');
