import { DEFAULT_CURRENCIES, Ledger, defaultTaxes, tradingChart, type CompanyEvent } from '../src/core';

export function newLedger(): { ledger: Ledger; events: CompanyEvent[] } {
  const events: CompanyEvent[] = [];
  const ledger = new Ledger((e) => events.push(e));
  ledger.createCompany(
    { name: 'شركة تجريبية', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
    DEFAULT_CURRENCIES,
    tradingChart(),
    defaultTaxes(),
  );
  return { ledger, events };
}
