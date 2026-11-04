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
  const isField = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement =>
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type)) || el instanceof HTMLTextAreaElement;
  /**
   * كيبورد شاومي (وغيره) أحياناً بيحط آخر كلمة بالخانة بدون ما يبعت «input»، فـReact بيضل شايف القيمة
   * القديمة («مكتبة» بدل «مكتبة الفيصل»). منبعت «input» بإيدنا: React بيقارن مع آخر قيمة شافها،
   * وإذا الخانة فيها شي جديد بيحدّث الحالة فوراً، وإذا نفس الشي ما بيصير شي.
   */
  const sync = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el && el.isConnected) el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  let last: HTMLInputElement | HTMLTextAreaElement | null = null;
  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) last = e.target;
  });
  document.addEventListener('compositionend', (e) => isField(e.target) && setTimeout(() => sync(e.target as HTMLInputElement), 0), true);
  document.addEventListener('focusout', (e) => isField(e.target) && sync(e.target), true);
  document.addEventListener(
    'pointerdown',
    (e) => {
      const active = document.activeElement;
      if (!isField(active)) return;
      const target = e.target as Element | null;
      if (!target || target === active || active.contains(target)) return;
      if (!target.closest('button, [role="button"], a[href], .pos-item, label')) return;
      sync(active);
      active.blur();
      sync(active);
    },
    true,
  );
  // قبل ما يشتغل أي زر (حفظ، إضافة...): آخر خانة انكتب فيها لازم تكون واصلة
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null;
      if (target && target.closest('button, [role="button"], a[href], .pos-item')) sync(last);
    },
    true,
  );
  document.addEventListener(
    'submit',
    () => {
      sync(last);
    },
    true,
  );
}
