import { useMemo, useState } from 'react';
import { priceList, type CompanyState, type PriceListGroup } from '../../../core';
import { dateText, money, today, useCompany } from '../api';
import { ImageShareDialog } from '../components/ImageShareDialog';
import { Icon } from '../components/icons';
import { DocHeader, PrintButtons } from '../components/print';
import { Empty, PageHeader, SearchBox } from '../components/ui';
import type { ShareImage } from './hall-images';

/** نشرة الأسعار: الأصناف بسعر المفرق والجملة (بالكيلو والكيس والكرتونة)، بتنطبع أو بتنبعت صورة عالواتساب. */
export function PriceList() {
  const { state } = useCompany();
  const [query, setQuery] = useState('');
  const cats = useMemo(() => [...new Set(Object.values(state.items).filter((i) => !i.archived && i.kind !== 'service').map((i) => i.category || 'أخرى'))].sort((a, b) => a.localeCompare(b, 'ar')), [state.items]);
  const [picked, setPicked] = useState<string[]>([]);
  const [whole, setWhole] = useState(true);
  const [sharing, setSharing] = useState(false);
  const groups = useMemo(() => priceList(state, { query, ...(picked.length ? { categories: picked.map((c) => (c === 'أخرى' ? '' : c)) } : {}) }), [state, query, picked]);
  const anyWhole = groups.some((g) => g.rows.some((r) => r.wholesale));
  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  return (
    <div className="page">
      <PageHeader title="نشرة الأسعار">
        {groups.length > 0 && (
          <button className="whatsapp" onClick={() => setSharing(true)}>
            <Icon name="message" size={16} /> إرسال بالواتس
          </button>
        )}
        <PrintButtons kind="report" name={`نشرة الأسعار ${dateText(today())}`} papers={['a4']} />
      </PageHeader>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="ابحث عن صنف..." />
        {anyWhole && (
          <label className="check">
            <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> سعر الجملة
          </label>
        )}
      </div>
      {cats.length > 1 && (
        <div className="preset-row" style={{ marginBottom: 12 }}>
          {cats.map((c) => (
            <button key={c} type="button" className={`small ${picked.includes(c) ? 'primary' : ''}`} onClick={() => toggle(c)}>
              {c}
            </button>
          ))}
          {picked.length > 0 && (
            <button type="button" className="small" onClick={() => setPicked([])}>
              الكل
            </button>
          )}
        </div>
      )}
      {groups.length === 0 ? (
        <Empty>ما في أصناف بأسعار. ضيف الأصناف وسعر المفرق والجملة من شاشة المواد.</Empty>
      ) : (
        <div className="print-area">
          <div className="print-only">
            <DocHeader title="نشرة الأسعار">
              <div>{dateText(today())}</div>
            </DocHeader>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th className="num">سعر المفرق</th>
                {whole && anyWhole && <th className="num">سعر الجملة</th>}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                <tr key={g.category} className="group-row">
                  <td colSpan={whole && anyWhole ? 3 : 2}>{g.category}</td>
                </tr>,
                ...g.rows.map((r, i) => (
                  <tr key={g.category + r.itemId + i} className={r.sub ? 'sub-row' : ''}>
                    <td>{r.sub ? <span className="muted">↳ {r.name}</span> : <strong>{r.name}</strong>}{!r.sub && <span className="muted"> / {r.unit}</span>}</td>
                    <td className="num">{money(state, r.retail, r.currency)}</td>
                    {whole && anyWhole && <td className="num">{r.wholesale ? money(state, r.wholesale, r.currency) : '—'}</td>}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
      {sharing && (
        <ImageShareDialog
          title="صورة نشرة الأسعار"
          phone=""
          fileName="نشرة الأسعار"
          caption={`نشرة أسعار ${state.info?.name ?? ''} — ${dateText(today())}`}
          options={['المفرق والجملة', 'المفرق بس']}
          amountsDefault={whole && anyWhole}
          make={(w) => priceListImage(state, groups, w && anyWhole)}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

/** صورة النشرة: رأس باسم المحل والتاريخ، وكل تصنيف بعنوانه، وكل صنف بسعره (وبوحداته الكبيرة تحته). */
async function priceListImage(state: CompanyState, groups: PriceListGroup[], whole: boolean): Promise<ShareImage> {
  await Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 32px Cairo`).catch(() => null)));
  const rows = groups.reduce((s, g) => s + g.rows.length + 1, 0);
  const W = whole ? 1240 : 1000, P = 40, RH = 62, HEAD = 200;
  const H = HEAD + 64 + rows * RH + 120;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = cv.getContext('2d')!;
  const text = (t: string, px: number, py: number, o: { s?: number; w?: number; c?: string; a?: CanvasTextAlign; max?: number; ltr?: boolean } = {}) => {
    x.font = `${o.w ?? 700} ${o.s ?? 28}px Cairo, sans-serif`;
    x.fillStyle = o.c ?? '#1d2433';
    x.textAlign = o.a ?? 'right';
    x.direction = o.ltr ? 'ltr' : 'rtl';
    x.fillText(t, px, py, o.max);
  };
  const BROWN = '#8a5a1f';
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 160);
  g.addColorStop(0, '#6d4515');
  g.addColorStop(1, BROWN);
  x.fillStyle = g;
  x.fillRect(0, 0, W, 160);
  text(state.info?.name ?? '', W - P, 72, { s: 42, c: '#fff', max: W - 2 * P - 300 });
  text('نشرة الأسعار', W - P, 126, { s: 30, w: 400, c: 'rgba(255,255,255,0.9)' });
  text(dateText(today()), P, 100, { s: 30, c: '#fff', a: 'left' });
  const cPrice = whole ? 260 : 300;
  const nameW = W - 2 * P - cPrice * (whole ? 2 : 1);
  let y = HEAD;
  x.fillStyle = '#f5ece1';
  x.beginPath();
  x.roundRect(P, y, W - 2 * P, 60, 14);
  x.fill();
  text('الصنف', W - P - 16, y + 41, { s: 26, c: BROWN });
  text('المفرق', P + cPrice * (whole ? 2 : 1) - 16, y + 41, { s: 26, c: BROWN });
  if (whole) text('الجملة', P + cPrice - 16, y + 41, { s: 26, c: BROWN });
  y += 64;
  for (const grp of groups) {
    x.fillStyle = '#fbf6ef';
    x.fillRect(P, y, W - 2 * P, RH);
    text(grp.category, W - P - 16, y + 42, { s: 28, c: BROWN });
    y += RH;
    for (const r of grp.rows) {
      text(r.sub ? `↳ ${r.name}` : `${r.name} / ${r.unit}`, W - P - (r.sub ? 46 : 16), y + 42, { s: r.sub ? 24 : 27, w: r.sub ? 400 : 700, c: r.sub ? '#6b7385' : '#1d2433', max: nameW - 30 });
      text(money(state, r.retail, r.currency), P + cPrice * (whole ? 2 : 1) - 16, y + 42, { s: 27, max: cPrice - 24 });
      if (whole) text(r.wholesale ? money(state, r.wholesale, r.currency) : '—', P + cPrice - 16, y + 42, { s: 27, c: '#128a5c', max: cPrice - 24 });
      x.fillStyle = '#efe7dc';
      x.fillRect(P, y + RH - 1, W - 2 * P, 1);
      y += RH;
    }
  }
  x.fillStyle = BROWN;
  x.fillRect(0, H - 80, W, 80);
  text('الأسعار قابلة للتغيير حسب السوق', W - P, H - 30, { s: 26, w: 400, c: '#fff' });
  if (state.info?.phone) {
    text(state.info.phone, P, H - 30, { s: 28, c: '#fff', a: 'left', ltr: true });
  }
  const dataUrl = cv.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]!);
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  return { png, dataUrl };
}
