import { useState, type ReactNode } from 'react';
import type { Paper } from '../../../core';
import { api, useCompany, type ExportSheet } from '../api';

export type DocKind = 'invoice' | 'receipt' | 'kitchen' | 'label' | 'report';

const PAGE_CSS: Record<Paper, string> = {
  a4: '@page { size: A4; margin: 12mm; }',
  a5: '@page { size: A5; margin: 8mm; }',
  '80mm': '@page { size: 80mm auto; margin: 3mm; }',
  '58mm': '@page { size: 58mm auto; margin: 2mm; }',
};

export const PAPER_NAMES: Record<Paper, string> = { a4: 'A4', a5: 'A5', '80mm': 'حراري 80mm', '58mm': 'حراري 58mm' };

/** يجهز الصفحة للطباعة بحجم الورق المطلوب، ينفذ العملية، ثم يعيدها كما كانت. */
async function withPaper<T>(paper: Paper, fn: () => Promise<T>): Promise<T> {
  const style = document.createElement('style');
  style.textContent = PAGE_CSS[paper];
  document.head.appendChild(style);
  document.body.dataset['paper'] = paper;
  try {
    return await fn();
  } finally {
    style.remove();
    delete document.body.dataset['paper'];
  }
}

export function usePrinter() {
  const { state, notify } = useCompany();
  const settings = state.info?.print ?? {};
  const defaultPaper = (kind: DocKind): Paper =>
    kind === 'receipt' || kind === 'kitchen' ? (settings.receiptPaper ?? '80mm') : kind === 'label' ? '58mm' : kind === 'report' ? 'a4' : (settings.invoicePaper ?? 'a4');

  return {
    defaultPaper,
    async print(kind: DocKind, paper = defaultPaper(kind)) {
      try {
        const printer = settings.printers?.[kind === 'report' ? 'invoice' : kind];
        await withPaper(paper, () => api.print({ paper, ...(printer ? { printer } : {}), copies: kind === 'invoice' ? (settings.copies ?? 1) : 1 }));
      } catch (e) {
        notify((e as Error).message, 'error');
      }
    },
    async pdf(name: string, paper: Paper = 'a4') {
      try {
        const file = await withPaper(paper, () => api.exportPdf({ paper, name }));
        if (file) notify(`تم حفظ الملف: ${file}`);
      } catch (e) {
        notify((e as Error).message, 'error');
      }
    },
  };
}

/** أزرار الطباعة وحفظ PDF مع اختيار حجم الورق. */
export function PrintButtons({ kind, name, papers }: { kind: DocKind; name: string; papers?: Paper[] }) {
  const printer = usePrinter();
  const [paper, setPaper] = useState<Paper>(printer.defaultPaper(kind));
  const options = papers ?? (['a4', 'a5', '80mm', '58mm'] as Paper[]);
  return (
    <span className="button-row">
      {options.length > 1 && (
        <select className="paper-select" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
          {options.map((p) => (
            <option key={p} value={p}>
              {PAPER_NAMES[p]}
            </option>
          ))}
        </select>
      )}
      <button onClick={() => printer.print(kind, paper)}>🖨 طباعة</button>
      <button onClick={() => printer.pdf(name, paper)}>PDF</button>
    </span>
  );
}

/** أزرار تصدير جدول إلى Excel أو CSV. */
export function ExportButtons({ name, sheets }: { name: string; sheets: () => ExportSheet[] }) {
  const { notify, can } = useCompany();
  if (!can('backup.manage') && !can('reports.financial') && !can('reports.stock')) return null;
  const run = async (format: 'xlsx' | 'csv') => {
    try {
      const file = await api.exportExcel(name, sheets(), format);
      if (file) notify(`تم حفظ الملف: ${file}`);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <span className="button-row">
      <button onClick={() => run('xlsx')}>Excel</button>
      <button className="ghost" onClick={() => run('csv')}>
        CSV
      </button>
    </span>
  );
}

/** ترويسة المستندات المطبوعة: الشعار واسم الشركة وبياناتها. */
export function DocHeader({ title, children }: { title: string; children?: ReactNode }) {
  const { state } = useCompany();
  const c = state.info!;
  const p = c.print ?? {};
  return (
    <header className="doc-header">
      <div className="doc-company">
        {p.logo && <img src={p.logo} alt="" className="doc-logo" />}
        <div>
          <h1>{c.name}</h1>
          {p.header && <div>{p.header}</div>}
          {c.address && <div>{c.address}</div>}
          {c.phone && <div className="ltr">{c.phone}</div>}
          {c.taxNumber && <div>رقم السجل: {c.taxNumber}</div>}
        </div>
      </div>
      <div className="doc-title">
        <h2>{title}</h2>
        {children}
      </div>
    </header>
  );
}

// ───────────── باركود Code 128 (بدون مكتبات خارجية) ─────────────

const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export function Barcode({ value, height = 40 }: { value: string; height?: number }) {
  const text = [...value].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).join('');
  const codes = [104, ...[...text].map((c) => c.charCodeAt(0) - 32)];
  const check = codes.reduce((s, c, i) => s + c * (i === 0 ? 1 : i), 0) % 103;
  const pattern = [...codes, check, 106].map((c) => CODE128[c]).join('');
  let x = 10;
  const bars: ReactNode[] = [];
  [...pattern].forEach((w, i) => {
    const width = Number(w);
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={width} height={height} />);
    x += width;
  });
  return (
    <svg className="barcode" viewBox={`0 0 ${x + 10} ${height}`} preserveAspectRatio="none" role="img" aria-label={text}>
      {bars}
    </svg>
  );
}
