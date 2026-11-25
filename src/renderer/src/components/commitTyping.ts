// كيبورد الجوال (سامسونج وغيره) بيحتفظ بآخر كلمة «قيد الكتابة» وما بيبعتها للخانة إلا لما تنتهي الكتابة.
// إذا كبس «حفظ» والكلمة لسا ما انبعتت، كان الاسم ينحفظ ناقص («زنوبي» بدل «زنوبي، ٢م»).
// قبل الحفظ: منسكّر الكيبورد (blur) فبتنبعت الكلمة، ومنستنى لحتى توصل للحالة.
export async function commitTyping(): Promise<void> {
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.blur();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => setTimeout(r, 60));
}
