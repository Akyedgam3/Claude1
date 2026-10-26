import { createContext, useContext } from 'react';
import { can as canDo, effectiveProfile, findRate, formatMinor, toMinor, type ActivityProfile, type CompanyState, type Currency, type Feature, type Permission, type User } from '../../core';
import type { LicenseStatus } from '../../license/manager';

/** نسخة الموبايل (أندرويد): مستقلة، بدون شبكة محلية ولا شاشة زبون. */
export const IS_MOBILE = typeof __WAZN_MOBILE__ !== 'undefined' && __WAZN_MOBILE__ === true;
/** نسخة الويب (آيفون بالمتصفح): نفس نسخة الموبايل بس للاتصال عن بعد بجهاز المحل، بدون بيانات محلية. */
export const IS_WEB = IS_MOBILE && typeof __WAZN_WEB__ !== 'undefined' && __WAZN_WEB__ === true;

export interface SessionInfo {
  kind: 'local' | 'remote';
  user: User;
  company: string;
  dir?: string;
  address?: string;
  viaRecovery?: boolean;
  recoveredTail?: boolean;
  /** جوال عن بعد: هل الجهاز الرئيسي مطفي، وآخر نسخة وصلت، وكم عملية بالانتظار. */
  cloud?: { offline: boolean; syncedAt: number; pending: number };
}

export interface AppInfo {
  version: string;
  license: LicenseStatus;
  recent: { name: string; dir: string }[];
  session: SessionInfo | null;
  lastRemote: { host: string; port: number } | null;
  deviceName: string;
}

export interface CompanyPeek {
  dir: string;
  name: string;
  activity?: string;
  usernames: string[];
}

export interface LanStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  pairingCode: string;
  addresses: string[];
  devices: { deviceName: string; user: string; lastSeen: number }[];
}

export interface CloudStatus {
  /** الخدمة مفعّلة بالترخيص (خدمة إضافية). */
  available: boolean;
  enabled: boolean;
  code: string | null;
  devices: { deviceName: string; user: string; lastSeen: number }[];
}

export interface ExportSheet {
  name: string;
  title?: string;
  columns: { header: string; key: string; type?: 'text' | 'number' | 'money' | 'date'; width?: number }[];
  rows: Record<string, string | number | null | undefined>[];
  totals?: Record<string, number>;
}

const inv = <T,>(channel: string, ...args: unknown[]) => window.mizan.invoke(channel, ...args) as Promise<T>;

/** اللي بيظهر على شاشة الزبون: الطلب الحالي، أو شكراً بعد الدفع، أو null = ترحيب. */
export interface CustomerDisplayData {
  brand: { name: string; logo?: string; welcome?: string };
  title?: string; // طاولة 3، سفري...
  lines: { name: string; qty: string; total: string; note?: string }[];
  totals: { label: string; value: string }[];
  grand: string;
  paid?: { received: string; change: string } | null;
  done?: boolean;
}

export const api = {
  info: () => inv<AppInfo>('app:info'),
  activate: (key: string) => inv<LicenseStatus>('license:activate', key),
  refreshLicense: () => inv<LicenseStatus>('license:refresh'),
  /** بالجوال: 'installing' أو 'permission' (لازم يسمح بالتنصيب ويرجع يضغط) أو 'browser'. */
  openUpdate: () => inv<boolean | 'installing' | 'permission' | 'browser'>('app:openUpdate'),
  openUpdatePage: () => inv<boolean>('app:openUpdatePage'),
  createCompany: (o: Record<string, string>) => inv<{ dir: string; recoveryCode: string }>('company:create', o),
  peek: (dir?: string) => inv<CompanyPeek | null>('company:peek', dir),
  login: (dir: string, creds: { username?: string; password?: string; recoveryCode?: string }) => inv<SessionInfo>('company:login', dir, creds),
  restore: () => inv<CompanyPeek | null>('company:restore'),
  close: () => inv<void>('company:close'),
  state: () => inv<{ state: CompanyState; seq: number }>('company:state'),
  call: <T,>(method: string, ...args: unknown[]) => inv<{ value: T; seq: number }>('company:call', method, args),
  backup: (external: boolean) => inv<string | null>('company:backup', external),
  wipe: (mode: 'transactions' | 'all', password: string) => inv<string>('company:wipe', { mode, password }),
  reveal: () => inv<void>('company:reveal'),
  lanStatus: () => inv<LanStatus>('lan:status'),
  lanHost: (enable: boolean, newCode?: boolean) => inv<boolean>('lan:host', enable, newCode),
  lanConnect: (o: { host: string; port?: number; pairingCode: string; username: string; password: string }) => inv<SessionInfo>('lan:connect', o),
  cloudStatus: () => inv<CloudStatus>('cloud:status'),
  cloudSetup: (enable: boolean, newCode?: boolean) => inv<CloudStatus>('cloud:setup', enable, newCode),
  cloudHostConfig: () => inv<{ code: string } | null>('cloud:hostConfig'),
  cloudHostLogin: (username: string, password: string, deviceId: string, deviceName: string) => inv<{ token: string; user: User }>('cloud:hostLogin', username, password, deviceId, deviceName),
  cloudHostSnapshot: (token: string) => inv<{ state: CompanyState; seq: number }>('cloud:hostSnapshot', token),
  cloudHostCall: (token: string, method: string, args: unknown[]) => inv<{ value: unknown; seq: number }>('cloud:hostCall', token, method, args),
  cloudHostLogout: (token: string) => inv<void>('cloud:hostLogout', token),
  cloudHostBackup: (token: string) => inv<string>('cloud:hostBackup', token),
  cloudHostState: () => inv<{ state: CompanyState; seq: number }>('cloud:hostState'),
  cloudHostQueued: (username: string, password: string, method: string, args: unknown[]) => inv<{ value: unknown; seq: number }>('cloud:hostQueued', username, password, method, args),
  /** الجوال بس: الاتصال بجهاز رئيسي عن بعد. */
  cloudConnect: (o: { code: string; username: string; password: string }) => inv<SessionInfo>('cloud:connect', o),
  cloudLast: () => inv<{ code: string; username: string } | null>('cloud:last'),
  printers: () => inv<{ name: string; label: string }[]>('print:printers'),
  print: (o: { paper: string; printer?: string; copies?: number }) => inv<boolean>('print:run', o),
  exportPdf: (o: { paper: string; name: string }) => inv<string | false>('export:pdf', o),
  exportExcel: (name: string, sheets: ExportSheet[], format: 'xlsx' | 'csv' = 'xlsx') => inv<string | null>('export:excel', name, sheets, format),
  importExcel: () => inv<Record<string, string | number>[] | null>('import:excel'),
  displayOpen: () => inv<{ secondScreen: boolean }>('display:open'),
  displayClose: () => inv<void>('display:close'),
  displayStatus: () => inv<boolean>('display:status'),
  displayUpdate: (payload: CustomerDisplayData | null) => inv<void>('display:update', payload),
  /** الجوال بس: قراءة باركود بالكاميرا. null إذا تراجع المستخدم. */
  scanBarcode: () => inv<string | null>('device:scan'),
  on: (channel: Parameters<typeof window.mizan.on>[0], fn: (payload: unknown) => void) => window.mizan.on(channel, fn),
};

export interface CompanyCtx {
  state: CompanyState;
  info: AppInfo;
  session: SessionInfo;
  user: User;
  profile: ActivityProfile;
  /** يستدعي عملية على الدفتر. يعيد null ويعرض الخطأ إن فشلت. */
  call: <T = unknown>(method: string, ...args: unknown[]) => Promise<{ value: T } | null>;
  can: (p: Permission) => boolean;
  feature: (f: Feature) => boolean;
  notify: (message: string, kind?: 'ok' | 'error') => void;
  navigate: (screen: string, param?: string) => void;
  /** الشاشة الحالية، ورجوع للشاشة اللي قبلها (أو لقائمتها إذا ما في سجل). */
  screenKey: string;
  back: () => void;
  reloadInfo: () => Promise<void>;
}

export const Company = createContext<CompanyCtx>(null as unknown as CompanyCtx);
export const useCompany = () => useContext(Company);

export function makeCtxHelpers(state: CompanyState, user: User) {
  const current = state.users[user.id] ?? user;
  const profile = effectiveProfile(state.info);
  return {
    user: current,
    profile,
    can: (p: Permission) => canDo(current, p),
    feature: (f: Feature) => profile.features.includes(f),
  };
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 2026-10-11 ← 11/10/2026 */
export function dateText(iso: string | undefined | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
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

/** المبلغ بدون رمز العملة (أعمدة الإيصال الحراري الضيقة). */
export function plainMoney(state: CompanyState, minor: number, currency?: string): string {
  return formatMinor(minor, state.currencies[currency ?? state.info!.baseCurrency]!.decimals);
}

/** المبلغ كرقم عادي (للتصدير إلى Excel). */
export function major(state: CompanyState, minor: number, currency?: string): number {
  const c = state.currencies[currency ?? state.info!.baseCurrency]!;
  return minor / 10 ** c.decimals;
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

/** أسعار كل العملات بعملة الشركة بتاريخ معيّن (العملة اللي ما إلها سعر مسجّل ما بتطلع). */
export function fxRates(state: CompanyState, date: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of Object.keys(state.currencies)) {
    const r = findRate(state, c, date);
    if (r) out[c] = r;
  }
  return out;
}

/** يحوّل مبلغاً من عملة إلى أخرى بأسعار تاريخ معيّن (للأسعار المعروضة فقط). */
export function convertPrice(state: CompanyState, minor: number, from: string, to: string, rates: Record<string, number>): number | null {
  if (from === to) return minor;
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) return null;
  const scale = 10 ** (state.currencies[to]!.decimals - state.currencies[from]!.decimals);
  return Math.round(((minor * rf) / rt) * scale);
}

// ───────── العملات المضافة وأسعار صرفها ─────────

/** العملات اللي بتطلع بقوائم الاختيار: الأساسية أولاً، وبدون المخفية (إلا المختارة حالياً). */
export function shownCurrencies(state: CompanyState, keep?: string): Currency[] {
  const base = state.info?.baseCurrency;
  return Object.values(state.currencies)
    .filter((c) => !c.hidden || c.code === keep || c.code === base)
    .sort((a, b) => (a.code === base ? -1 : b.code === base ? 1 : 0));
}

/** السعر بينكتب «1 عملة أساسية = كم من هالعملة» (متل الليرة بشركة عملتها دولار). */
export function rateInverted(state: CompanyState, code: string): boolean {
  const base = state.info?.baseCurrency;
  if (!base || code === base) return false;
  const c = state.currencies[code];
  return c?.rateInverted ?? (base === 'USD' && code === 'SYP');
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** السعر المخزّن (كم عملة أساسية بالوحدة) ← الرقم اللي بيكتبه المستخدم. */
export function rateToInput(state: CompanyState, code: string, rate: number): number {
  return rateInverted(state, code) ? round4(1 / rate) : round4(rate);
}

/** الرقم اللي كتبه المستخدم ← السعر المخزّن. */
export function inputToRate(state: CompanyState, code: string, typed: number): number {
  return rateInverted(state, code) ? 1 / typed : typed;
}

/** «1 $ = 120 ل.س» أو «1 $ = 34 TRY» حسب طريقة كتابة سعر هالعملة. */
export function rateLine(state: CompanyState, code: string, rate: number): string {
  const base = state.currencies[state.info!.baseCurrency]!;
  const c = state.currencies[code];
  if (!c) return '';
  const v = rateToInput(state, code, rate).toLocaleString('en');
  // عزل اتجاه النص حتى ما ينقلب «1 ₺ = 3.5 ل.س» جوا الواجهة العربية
  const line = rateInverted(state, code) ? `1 ${base.symbol} = ${v} ${c.symbol}` : `1 ${c.symbol} = ${v} ${base.symbol}`;
  return `\u2066${line}\u2069`;
}

/** عنوان خانة السعر: «كم ل.س يساوي 1 $». */
export function rateQuestion(state: CompanyState, code: string): string {
  const base = state.currencies[state.info!.baseCurrency]!;
  const c = state.currencies[code];
  if (!c) return '';
  return rateInverted(state, code) ? `كم ${c.nameAr} يساوي 1 ${base.nameAr}` : `كم ${base.nameAr} يساوي 1 ${c.nameAr}`;
}
