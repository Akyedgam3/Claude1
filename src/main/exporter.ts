import ExcelJS from 'exceljs';

// تصدير الجداول إلى Excel (من اليمين لليسار) واستيراد المواد من Excel.

export type ColumnType = 'text' | 'number' | 'money' | 'date';

export interface ExportSheet {
  name: string;
  title?: string;
  columns: { header: string; key: string; type?: ColumnType; width?: number }[];
  rows: Record<string, string | number | null | undefined>[];
  totals?: Record<string, number>;
}

function safeSheetName(name: string, used: Set<string>): string {
  let n = name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31).trim() || 'Sheet';
  for (let i = 2; used.has(n); i++) n = `${n.slice(0, 28)} ${i}`;
  used.add(n);
  return n;
}

export async function buildWorkbook(sheets: ExportSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wazn';
  wb.created = new Date();
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = wb.addWorksheet(safeSheetName(s.name, used), { views: [{ rightToLeft: true, state: 'frozen', ySplit: s.title ? 2 : 1 }] });
    let headerRow = 1;
    if (s.title) {
      ws.addRow([s.title]).font = { bold: true, size: 14 };
      ws.mergeCells(1, 1, 1, Math.max(1, s.columns.length));
      headerRow = 2;
    }
    const header = ws.addRow(s.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2EE' } };
      cell.border = { bottom: { style: 'thin' } };
    });
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.min(50, Math.max(10, c.header.length + 4, ...s.rows.slice(0, 200).map((r) => String(r[c.key] ?? '').length + 2)));
      if (c.type === 'money') col.numFmt = '#,##0.00';
      else if (c.type === 'number') col.numFmt = '#,##0.###';
    });
    for (const r of s.rows) ws.addRow(s.columns.map((c) => r[c.key] ?? null));
    if (s.totals) {
      const t = ws.addRow(s.columns.map((c, i) => (i === 0 ? 'المجموع' : (s.totals![c.key] ?? null))));
      t.font = { bold: true };
    }
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: Math.max(1, s.columns.length) } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(sheet: ExportSheet): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // منع حقن الصيغ عند فتح الملف في Excel
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [sheet.columns.map((c) => esc(c.header)).join(','), ...sheet.rows.map((r) => sheet.columns.map((c) => esc(r[c.key])).join(','))];
  return '﻿' + lines.join('\r\n'); // BOM حتى يفتح Excel العربية بشكل صحيح
}

/** يقرأ أول ورقة من ملف Excel كصفوف (المفتاح = عنوان العمود). */
export async function readWorkbook(data: Buffer): Promise<Record<string, string | number>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.text ?? '').trim()));
  const rows: Record<string, string | number>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Record<string, string | number> = {};
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (!h) return;
      const v = cell.value;
      r[h] = typeof v === 'number' ? v : String(cell.text ?? '').trim();
    });
    if (Object.keys(r).length) rows.push(r);
  });
  return rows.slice(0, 20_000);
}
