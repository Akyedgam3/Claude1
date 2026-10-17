import { convertPrice, fxRates, money, today, useCompany } from '../api';

// أدوات زر تبديل عملة البيع (ليرة / دولار) بنقطة البيع والمطعم.

/** اسم قصير للعملة على زر التبديل. */
export function curLabel(c: { code: string; nameAr: string; symbol: string }): string {
  return c.code === 'USD' ? 'دولار $' : c.code === 'SYP' ? 'ليرة' : c.nameAr;
}

/** سعر الصرف الحالي جنب زر التبديل: الدولار = 120 ل.س */
export function RateNote() {
  const { state } = useCompany();
  const r = fxRates(state, today());
  if (!r['USD'] || !r['SYP'] || !state.currencies['USD'] || !state.currencies['SYP']) return <small className="muted">ما في سعر صرف لليوم</small>;
  const syp = convertPrice(state, 10 ** state.currencies['USD'].decimals, 'USD', 'SYP', r) ?? 0;
  return <small className="muted rate-note">الدولار = {money(state, syp, 'SYP')}</small>;
}
