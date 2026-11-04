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

/**
 * كيبوردات الجوال (Gboard، سامسونج...) بتضل الكلمة الأخيرة «قيد الكتابة» (تحتها خط) وما بتوصل للبرنامج
 * لحتى الكيبورد يثبّتها. فإذا كبس «حفظ» فوراً، كانت تنحفظ بدون آخر كلمة (أو المسح ما بينحسب).
 * الحل: أول ما تنلمس أي زر، منسكّر الكتابة بالخانة (blur) فالكيبورد بيثبّت الكلمة قبل ما يشتغل الزر.
 */
export function startImeCommit(): void {
  const isField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type)) || el instanceof HTMLTextAreaElement;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const active = document.activeElement;
      if (!isField(active)) return;
      const target = e.target as Element | null;
      if (!target || target === active || active.contains(target)) return;
      if (!target.closest('button, [role="button"], a[href], .pos-item')) return;
      active.blur();
    },
    true,
  );
}
