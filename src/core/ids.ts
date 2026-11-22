/**
 * معرّفات جديدة (فواتير، قيود، سندات...). عادةً عشوائية، بس بالاتصال عن بعد والجهاز الرئيسي مطفي
 * الجوال بينفّذ العملية عنده ومنسجّل المعرّفات اللي طلعت، والجهاز الرئيسي لما يرجع بيعيد نفس العملية
 * بنفس المعرّفات. هيك العمليات اللي بتعتمد على بعض (فاتورة وبعدين إلغاؤها أو دفعة عليها) بتتنفّذ صح.
 */
let source: (() => string) | null = null;

export function newId(): string {
  return source ? source() : crypto.randomUUID();
}

/** بينفّذ fn وبيرجّع المعرّفات الجديدة اللي طلعت فيها (بالترتيب). */
export function recordIds<T>(fn: () => T): { value: T; ids: string[] } {
  const prev = source;
  const ids: string[] = [];
  source = () => {
    const id = crypto.randomUUID();
    ids.push(id);
    return id;
  };
  try {
    return { value: fn(), ids };
  } finally {
    source = prev;
  }
}

/** بينفّذ fn وكل معرّف جديد بياخد الجاي من القائمة (وإذا خلصت عشوائي). */
export function replayIds<T>(ids: readonly string[] | undefined, fn: () => T): T {
  if (!ids?.length) return fn();
  const prev = source;
  let i = 0;
  source = () => (i < ids.length ? ids[i++]! : crypto.randomUUID());
  try {
    return fn();
  } finally {
    source = prev;
  }
}
