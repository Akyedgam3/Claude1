// فتح محادثة واتساب مع الزبون والرسالة جاهزة (تذكير بالدين، الفاتورة...). بدون رقم بيفتح الواتساب لتختار المحادثة.
// إذا ما انفتح (ما في واتساب) منسخ الرسالة للحافظة كحل بديل.
import { whatsappNumber, type CompanyState, type Invoice } from '../../../core';
import { api } from '../api';

export async function sendWhatsApp(phone: string | undefined, text: string, notify: (m: string, kind?: 'ok' | 'error') => void): Promise<void> {
  const p = phone?.trim() && whatsappNumber(phone.trim()) ? phone.trim() : '';
  try {
    await api.whatsapp(p, text);
    if (!p) notify('ما في رقم واتساب صحيح للزبون: اختار المحادثة من الواتساب');
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      notify('ما انفتح الواتساب، فنسخنا الرسالة: الصقها بالمحادثة');
    } catch {
      notify('ما قدرنا نفتح الواتساب ولا ننسخ الرسالة', 'error');
    }
  }
}

/** بعد حفظ فاتورة المبيع: إذا مفعّل «إرسال الفاتورة عالواتساب» والزبون إلو رقم */
export function autoSendInvoice(state: CompanyState, inv: Invoice, text: (s: CompanyState, i: Invoice) => string, notify: (m: string, kind?: 'ok' | 'error') => void): void {
  if (!state.info?.print?.autoWhatsApp || inv.kind !== 'sale' || !inv.partyId) return;
  const phone = state.parties[inv.partyId]?.phone;
  if (!phone || !whatsappNumber(phone)) return;
  // الحالة اللي بالشاشة لسا ما فيها الفاتورة: منجيب الأحدث حتى الحساب السابق والباقي يطلعوا صح
  void api
    .state()
    .then((r) => r.state)
    .catch(() => state)
    .then((fresh) => sendWhatsApp(phone, text(fresh, fresh.invoices.find((i) => i.id === inv.id) ?? inv), notify));
}

/** النص الافتراضي لتذكير الدين (بيتغيّر من الإعدادات ← الطباعة والفواتير ← «رسالة تذكير الدين») */
export const DEFAULT_REMINDER = 'السلام عليكم {الاسم}،\nنودّ تذكيركم بأن المبلغ المستحق لـ{المحل} هو: {المبلغ}.{الموعد}\nشاكرين لكم حسن التعامل.';

/** رسالة تذكير الدين بنص المحل نفسه: {الاسم} {المبلغ} {المحل} {الموعد} بيتبدّلوا */
export function reminderText(state: CompanyState, name: string, amount: string, due?: string): string {
  const tpl = state.info?.reminderText?.trim() || DEFAULT_REMINDER;
  return tpl
    .replace(/\{الاسم\}/g, name)
    .replace(/\{المبلغ\}/g, amount)
    .replace(/\{المحل\}/g, state.info?.name ?? '')
    .replace(/\{الموعد\}/g, due ? `\nموعد السداد المتفق عليه: ${due}.` : '');
}
