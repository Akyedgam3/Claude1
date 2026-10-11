import { percentOf } from './money';
import type { Tax } from './types';

export interface TaxAmount {
  tax: Tax;
  amount: number; // بأصغر وحدة
}

export interface TaxResult {
  net: number; // المبلغ قبل الضريبة
  taxes: TaxAmount[];
  total: number; // المبلغ شامل الضريبة
}

/**
 * يحسب الضرائب الفعّالة على مبلغ.
 * inclusive = true يعني أن المبلغ المُدخل يشمل الضريبة مسبقاً (سعر المستهلك النهائي).
 */
export function computeTaxes(amount: number, taxes: Tax[], inclusive = false): TaxResult {
  const active = taxes.filter((t) => t.active && t.percent > 0);
  const totalPercent = active.reduce((s, t) => s + t.percent, 0);
  const net = inclusive ? Math.round((amount * 100) / (100 + totalPercent)) : amount;
  const amounts = active.map((tax) => ({ tax, amount: percentOf(net, tax.percent) }));
  if (inclusive && amounts.length) {
    // نضمن أن المجموع يساوي المبلغ المُدخل تماماً رغم التقريب
    const diff = amount - net - amounts.reduce((s, t) => s + t.amount, 0);
    amounts[amounts.length - 1]!.amount += diff;
  }
  const total = net + amounts.reduce((s, t) => s + t.amount, 0);
  return { net, taxes: amounts, total };
}
