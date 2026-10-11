import { createContext, useContext } from 'react';
import { formatMinor, toMinor, type CompanyState } from '../../core';
import type { LicenseStatus } from '../../main/license-manager';

export interface AppInfo {
  version: string;
  license: LicenseStatus;
  recent: { name: string; dir: string }[];
  company: { dir: string; name?: string } | null;
}

export const api = {
  info: () => window.mizan.info() as Promise<AppInfo>,
  activate: (key: string) => window.mizan.activate(key) as Promise<LicenseStatus>,
  createCompany: (opts: { name: string; activity: string; baseCurrency: string; phone?: string; address?: string }) =>
    window.mizan.createCompany(opts) as Promise<{ dir: string }>,
  openCompany: (dir?: string) => window.mizan.openCompany(dir) as Promise<{ dir: string; recoveredTail: boolean } | null>,
  closeCompany: () => window.mizan.closeCompany() as Promise<void>,
  state: () => window.mizan.state() as Promise<CompanyState>,
  call: <T = unknown>(method: string, ...args: unknown[]) => window.mizan.call(method, ...args) as Promise<T>,
  backup: (toExternal: boolean) => window.mizan.backup(toExternal) as Promise<string | null>,
  reveal: () => window.mizan.reveal(),
  print: () => window.mizan.print() as Promise<boolean>,
};

export interface CompanyCtx {
  state: CompanyState;
  info: AppInfo;
  /** يستدعي عملية على الدفتر ثم يحدّث الحالة. يعيد null ويعرض الخطأ إن فشلت. */
  call: <T = unknown>(method: string, ...args: unknown[]) => Promise<{ value: T } | null>;
  refresh: () => Promise<void>;
  notify: (message: string, kind?: 'ok' | 'error') => void;
  navigate: (screen: string, param?: string) => void;
}

export const Company = createContext<CompanyCtx>(null as unknown as CompanyCtx);
export const useCompany = () => useContext(Company);

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 2026-10-11 ← 11/10/2026 */
export function dateText(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function uid(): string {
  return crypto.randomUUID();
}

/** يعرض مبلغاً بأصغر وحدة مع رمز العملة. */
export function money(state: CompanyState, minor: number, currency?: string): string {
  const c = state.currencies[currency ?? state.info!.baseCurrency]!;
  return `${formatMinor(minor, c.decimals)} ${c.symbol}`;
}

export function toInput(state: CompanyState, minor: number, currency: string): string {
  const c = state.currencies[currency]!;
  return formatMinor(minor, c.decimals).replace(/,/g, '').replace(/\.0+$/, '');
}

export function parseAmount(state: CompanyState, text: string, currency: string): number {
  if (!text.trim()) return 0;
  return toMinor(text, state.currencies[currency]!.decimals);
}

export function qtyText(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '');
}
