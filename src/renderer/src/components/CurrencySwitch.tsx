import { fxRates, rateLine, shownCurrencies, today, useCompany } from '../api';

// أدوات زر تبديل عملة البيع (ليرة / دولار / أي عملة مضافة) بنقطة البيع والمطعم.

/** اسم قصير للعملة على زر التبديل. */
export function curLabel(c: { code: string; nameAr: string; symbol: string }): string {
  return c.code === 'USD' ? 'دولار $' : c.code === 'SYP' ? 'ليرة' : `${c.nameAr} ${c.symbol}`;
}

/** سعر الصرف الحالي جنب زر التبديل: 1 $ = 120 ل.س (للعملة المختارة، أو الدولار إذا البيع بالعملة الأساسية). */
export function RateNote({ code }: { code?: string }) {
  const { state } = useCompany();
  const base = state.info!.baseCurrency;
  const r = fxRates(state, today());
  const others = shownCurrencies(state).filter((c) => c.code !== base);
  const show = code && code !== base ? code : (others.find((c) => c.code === 'USD' && r[c.code]) ?? others.find((c) => r[c.code]))?.code;
  if (!show || !r[show]) return <small className="muted">ما في سعر صرف لليوم</small>;
  return <small className="muted rate-note">{rateLine(state, show, r[show])}</small>;
}
