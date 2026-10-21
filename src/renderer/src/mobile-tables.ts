// الجوال: كل جدول قائمة بيتحول لبطاقات (CSS بـ mobile.css). هون منكتب اسم العمود جنب كل قيمة (data-label).
// جداول الفواتير المطبوعة وجداول الإدخال (سطور الفاتورة) بتضل جداول.
const SKIP = '.paper-preview, .print-only, .invoice-doc, .thermal-doc, .doc, .modal .paper';

function label(table: HTMLTableElement): void {
  if (table.classList.contains('lines') || table.closest(SKIP)) return;
  const heads = [...table.querySelectorAll(':scope > thead th')].map((th) => th.textContent?.trim() ?? '');
  if (!heads.length) return;
  table.classList.add('m-cards');
  for (const row of table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr, :scope > tfoot > tr')) {
    let i = 0;
    for (const cell of row.cells) {
      const l = heads[i] ?? '';
      if (cell.dataset['label'] !== l) cell.dataset['label'] = l;
      i += cell.colSpan || 1;
    }
  }
}

export function startTableCards(): void {
  let queued = false;
  const run = () => {
    queued = false;
    document.querySelectorAll<HTMLTableElement>('.content table.table').forEach(label);
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
