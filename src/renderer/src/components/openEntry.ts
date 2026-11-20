// فتح المستند تبع أي حركة (من التقارير، الصندوق، كشف الحساب): الفاتورة، أو السند للتعديل، أو القيد...
import type { CompanyState } from '../../../core';

export function entryTarget(state: CompanyState, entryId: string): { screen: string; param?: string } | null {
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) return null;
  // قيد إلغاء: منفتح الأصل
  const orig = e.voidOf ? state.entries.find((x) => x.id === e.voidOf) : e;
  if (!orig?.source) return null;
  const live = !state.voided[orig.id] && !orig.voidOf;
  const s = orig.source;
  if (s.type === 'invoice' || s.type === 'reprice') {
    const inv = state.invoices.find((i) => i.id === s.id || i.entryId === orig.id);
    return inv ? { screen: 'invoice', param: inv.id } : null;
  }
  if (s.type === 'receipt' || s.type === 'payment') return live ? { screen: 'vouchers', param: `edit:${orig.id}` } : { screen: 'vouchers' };
  if (s.type === 'manual') return live ? { screen: 'journal', param: `edit:${orig.id}` } : { screen: 'journal' };
  if (s.type === 'debt') return { screen: 'debts' };
  if (s.type === 'adjustment' || s.type === 'recost') return { screen: 'stock', param: 'history' };
  return { screen: 'journal' };
}
