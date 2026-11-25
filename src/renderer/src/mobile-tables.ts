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
   * كيبوردات الجوال (سامسونج مع الاقتراحات، شاومي...) بتحتفظ بالكلمة «قيد الكتابة» وما بتبعت «input» لحتى
   * تخلص الكلمة، فـReact بيضل شايف القيمة القديمة («زنوبي» بدل «زنوبي، ٢م»، أو اسم الشركة فاضي).
   * 1) منبعت «input» بإيدنا: React بيقارن مع آخر قيمة شافها وبيحدّث إذا تغيّرت.
   * 2) إذا انكبس زر والخانة فيها شي ما وصل (أو الكلمة لسا قيد الكتابة): منوقّف الكبسة، منسكّر الكيبورد
   *    (فالكلمة بتنبعت)، منحدّث الحالة، وبعد ما تنرسم الشاشة منعيد الكبسة نفسها — هيك «التالي» و«حفظ»
   *    بيشوفوا القيمة الجديدة مش القديمة.
   */
  const sync = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el && el.isConnected) el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // React بيحفظ آخر قيمة شافها على الخانة؛ إذا الخانة فيها غيرها يعني في كتابة ما وصلت
  const pending = (el: HTMLInputElement | HTMLTextAreaElement | null): boolean => {
    if (!el || !el.isConnected) return false;
    const t = (el as unknown as { _valueTracker?: { getValue(): string } })._valueTracker;
    return !!t && t.getValue() !== el.value;
  };
  let last: HTMLInputElement | HTMLTextAreaElement | null = null;
  let composing = false;
  let replaying = false;
  // «وسخ»: الكيبورد عمل شي (كتابة/كلمة قيد الكتابة) وReact لسا ما وصله input بعده.
  // تغييرات البرنامج نفسه للخانة (تنسيق، تفريغ بعد اختيار) ما بتحسب، فما منأخّر كبسات عادية.
  const dirty = new WeakSet<EventTarget>();
  const markDirty = (e: Event) => isField(e.target) && dirty.add(e.target);
  document.addEventListener('beforeinput', markDirty, true);
  document.addEventListener('keydown', (e) => (e as KeyboardEvent).keyCode === 229 && markDirty(e), true);
  document.addEventListener('input', (e) => isField(e.target) && dirty.delete(e.target), true);
  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) last = e.target;
  });
  document.addEventListener('compositionstart', (e) => isField(e.target) && ((composing = true), dirty.add(e.target)), true);
  document.addEventListener('compositionupdate', (e) => isField(e.target) && ((composing = true), dirty.add(e.target)), true);
  document.addEventListener(
    'compositionend',
    (e) => {
      composing = false;
      if (isField(e.target)) setTimeout(() => sync(e.target as HTMLInputElement), 0);
    },
    true,
  );
  document.addEventListener('focusout', (e) => isField(e.target) && sync(e.target), true);
  // بعض الكيبوردات ما بتبعت غير keyup (keyCode 229) بدون input
  document.addEventListener('keyup', (e) => isField(e.target) && pending(e.target as HTMLInputElement) && sync(e.target as HTMLInputElement), true);
  const later = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fn, 30)));
  document.addEventListener(
    'click',
    (e) => {
      if (replaying) return;
      const target = e.target as Element | null;
      const btn = target?.closest('button, [role="button"], a[href], .pos-item') as HTMLElement | null;
      if (!btn || !last || !last.isConnected) return;
      const wasComposing = composing && document.activeElement === last;
      if (!wasComposing && !(dirty.has(last) && pending(last))) return;
      // الكبسة بتستنى لحتى توصل الكتابة
      e.preventDefault();
      e.stopImmediatePropagation();
      const el = last;
      if (wasComposing) el.blur();
      sync(el);
      later(() => {
        sync(el);
        composing = false;
        if (!btn.isConnected) return;
        replaying = true;
        try {
          btn.click();
        } finally {
          replaying = false;
        }
      });
    },
    true,
  );
  // «Go/التالي» من الكيبورد نفسه (submit بدون كبسة زر)
  document.addEventListener(
    'submit',
    (e) => {
      if (replaying) return;
      const form = e.target as HTMLFormElement;
      const el = last && form.contains(last) ? last : null;
      if (!el || (!(dirty.has(el) && pending(el)) && !composing)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (composing) el.blur();
      sync(el);
      later(() => {
        sync(el);
        composing = false;
        if (!form.isConnected) return;
        replaying = true;
        try {
          form.requestSubmit();
        } finally {
          replaying = false;
        }
      });
    },
    true,
  );
}
