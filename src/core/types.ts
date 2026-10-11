import type { Currency } from './money';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string; // رمز الحساب، مثلاً "1101"
  name: string;
  type: AccountType;
  parentId: string | null;
  isGroup: boolean; // حساب تجميعي (لا يُرحَّل عليه مباشرة)
  currency: string | null; // عملة ثابتة للحساب، أو null لأي عملة
  archived?: boolean;
}

export type RateKind = 'official' | 'market';

export interface ExchangeRate {
  date: string; // YYYY-MM-DD
  currency: string;
  kind: RateKind;
  rate: number; // كم وحدة من العملة الأساسية تساوي وحدة واحدة
}

export interface Tax {
  id: string;
  name: string;
  percent: number; // النسبة المئوية، مثلاً 5 تعني 5%
  accountId: string; // حساب الضريبة المستحقة
  active: boolean;
}

export interface JournalLine {
  accountId: string;
  currency: string;
  rate: number; // سعر الصرف المستخدم وقت الحركة
  debit: number; // بأصغر وحدة من عملة السطر
  credit: number;
  baseDebit: number; // المقابل بالعملة الأساسية
  baseCredit: number;
  memo?: string;
  costCenter?: string;
}

export interface JournalEntry {
  id: string;
  number: number; // رقم القيد التسلسلي
  date: string;
  memo: string;
  lines: JournalLine[];
  source?: { type: string; id: string }; // المستند الذي ولّد القيد (فاتورة، سند...)
  voidOf?: string; // إن كان قيداً عكسياً لإلغاء قيد آخر
  createdAt: string;
  createdBy: string;
}

export interface CompanyInfo {
  name: string;
  baseCurrency: string;
  fiscalYearStart: string; // MM-DD
  taxNumber?: string;
  address?: string;
  phone?: string;
}

export interface CompanyState {
  info: CompanyInfo | null;
  currencies: Record<string, Currency>;
  accounts: Record<string, Account>;
  rates: ExchangeRate[];
  taxes: Record<string, Tax>;
  entries: JournalEntry[];
  voided: Record<string, string>; // معرّف القيد الأصلي ← معرّف القيد العكسي
}

// كل تغيير على بيانات الشركة يُسجَّل كحدث في سجل لا يُعدَّل (append-only).
export type CompanyEvent =
  | { type: 'company.created'; info: CompanyInfo; currencies: Currency[] }
  | { type: 'company.updated'; info: Partial<CompanyInfo> }
  | { type: 'currency.saved'; currency: Currency }
  | { type: 'account.saved'; account: Account }
  | { type: 'rate.set'; rate: ExchangeRate }
  | { type: 'tax.saved'; tax: Tax }
  | { type: 'entry.posted'; entry: JournalEntry };
