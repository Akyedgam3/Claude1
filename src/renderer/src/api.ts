import * as React from 'react';
import { createContext, useContext } from 'react';
import { can as canDo, DEALER_BOX_ID, effectiveProfile, pharmacyValue, findRate, formatMinor, toMinor, type ActivityProfile, type CompanyState, type Currency, type Feature, type Permission, type User } from '../../core';
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
  /** آخر جهاز رئيسي بالشبكة؛ saved = محفوظ ببيكفي كلمة السر. */
  lastRemote: { host: string; port: number; username?: string; name?: string; saved?: boolean } | null;
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
  refocus: () => inv<boolean>('app:refocus'),
  activate: (key: string) => inv<LicenseStatus>('license:activate', key),
  refreshLicense: () => inv<LicenseStatus>('license:refresh'),
  /** بالجوال: 'installing' أو 'permission' (لازم يسمح بالتنصيب ويرجع يضغط) أو 'browser'. */
  openUpdate: () => inv<boolean | 'installing' | 'permission' | 'browser'>('app:openUpdate'),
  openUpdatePage: () => inv<boolean>('app:openUpdatePage'),
  whatsapp: (phone: string, text: string) => inv<boolean>('app:whatsapp', phone, text),
  /** صورة للواتساب: بالكمبيوتر بتنتسخ وبتنفتح المحادثة ('clipboard')، وبالجوال قائمة المشاركة ('shared'). */
  whatsappImage: (phone: string, png: Uint8Array, name: string, caption = '') => inv<'clipboard' | 'shared' | null>('app:whatsappImage', phone, png, name, caption),
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
  lanConnect: (o: { host?: string; port?: number; pairingCode?: string; username?: string; password: string; saved?: boolean }) => inv<SessionInfo>('lan:connect', o),
  lanDiscover: () => inv<{ host: string; port: number; name: string; id: string }[]>('lan:discover'),
  lanForget: () => inv<boolean>('lan:forget'),
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
  /** الاتصال بجهاز رئيسي عن بعد (saved = آخر اتصال محفوظ، بيكفي كلمة السر). */
  cloudConnect: (o: { code?: string; username?: string; password: string; saved?: boolean }) => inv<SessionInfo>('cloud:connect', o),
  cloudLast: () => inv<{ code: string; username: string; name?: string } | null>('cloud:last'),
  cloudForget: () => inv<boolean>('cloud:forget'),
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

/** المواد المخفية بتصير «مؤرشفة» بعين اللي ما معه صلاحيتها: ما بتطلع بالقوائم ولا البيع ولا الجرد، والفواتير القديمة بتضل تقرأ اسمها. */
export function visibleState(state: CompanyState, user: User): CompanyState {
  const current = state.users[user.id] ?? user;
  if (canDo(current, 'items.hidden')) return state;
  const hasItems = Object.values(state.items).some((i) => i.hidden);
  const hasBoxes = Object.values(state.accounts).some((a) => a.hidden);
  if (!hasItems && !hasBoxes) return state;
  const items = hasItems ? Object.fromEntries(Object.entries(state.items).map(([id, i]) => [id, i.hidden ? { ...i, archived: true } : i])) : state.items;
  // صندوق المورد: ما بينختار وما بيبين اسمه
  const accounts = hasBoxes ? Object.fromEntries(Object.entries(state.accounts).map(([id, a]) => [id, a.hidden ? { ...a, archived: true, name: 'صندوق خاص' } : a])) : state.accounts;
  // فواتير فيها مواد مخفية ما بتبين أبداً
  const hiddenInv = new Set(hasItems ? state.invoices.filter((inv) => inv.lines.some((l) => l.itemId && state.items[l.itemId]?.hidden)).map((i) => i.id) : []);
  let invoices = hiddenInv.size ? state.invoices.filter((inv) => !hiddenInv.has(inv.id)) : state.invoices;
  // وقيودها كمان (وإلا أرباحها وديونها بتبين بلوحة الأرباح والتقارير)، وحركات صندوق المورد (سندات ومصاريف)،
  // إلا تحويلات الصندوقين وفواتير أدوية الصيدلية اللي باعها المورد (هدول حق الصيدلية)
  const hiddenAcc = new Set(Object.values(state.accounts).filter((a) => a.hidden).map((a) => a.id));
  // جرد/رصيد افتتاحي/تالف لبضاعة المورد بس: ما بيبين (ولا قيمته بالمخزون)
  const hiddenAdj = new Set(hasItems ? state.adjustments.filter((a) => a.lines.length && a.lines.every((l) => state.items[l.itemId]?.hidden)).map((a) => a.id) : []);
  const hiddenAdjEntries = new Set(state.adjustments.filter((a) => hiddenAdj.has(a.id) && a.entryId).map((a) => a.entryId!));
  const KEEP = new Set(['invoice', 'reprice', 'boxtransfer', 'dealersale']);
  const hideIds = new Set(
    state.entries
      .filter((e) => hiddenAdjEntries.has(e.id) || (e.source && (e.source.type === 'invoice' || e.source.type === 'reprice') && hiddenInv.has(e.source.id)) || (!KEEP.has(e.source?.type ?? '') && e.lines.some((l) => hiddenAcc.has(l.accountId))))
      .map((e) => e.id),
  );
  let entries = hideIds.size ? state.entries.filter((e) => !hideIds.has(e.id) && !(e.voidOf && hideIds.has(e.voidOf))) : state.entries;
  // أدوية الصيدلية اللي باعها المورد بسعره: الصيدلية بتشوفها بسعرها هي، وفرق السعر (ربح المورد) ما بيبين عندها
  const scale = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.cashAccountId !== DEALER_BOX_ID || (inv.kind !== 'sale' && inv.kind !== 'sale_return') || !(inv.total > 0)) continue;
    const f = pharmacyValue(state, inv) / inv.total;
    if (f > 0) scale.set(inv.id, Math.min(f, 1));
  }
  if (scale.size) {
    const byEntry = new Map(invoices.filter((i) => scale.has(i.id)).map((i) => [i.entryId, scale.get(i.id)!] as const));
    entries = entries.map((e) => {
      const f = byEntry.get(e.id) ?? (e.voidOf ? byEntry.get(e.voidOf) : undefined);
      return f === undefined ? e : scaleRevenue(state, e, f);
    });
    invoices = invoices.map((inv) => {
      const f = scale.get(inv.id);
      if (f === undefined) return inv;
      return { ...inv, total: Math.round(inv.total * f), paid: Math.round(inv.paid * f), lines: inv.lines.map((l) => ({ ...l, price: Math.round(l.price * f) })) };
    });
  }
  // زباين وموردين بضاعة المورد الخاصة (ما إلهم أي حركة ظاهرة للصيدلية) ما بيبينو
  const used = new Set<string>();
  for (const inv of invoices) if (inv.partyId) used.add(inv.partyId);
  for (const e of entries) for (const l of e.lines) if (l.partyId) used.add(l.partyId);
  const onlyHidden = new Set<string>();
  for (const inv of state.invoices) if (hiddenInv.has(inv.id) && inv.partyId && !used.has(inv.partyId)) onlyHidden.add(inv.partyId);
  for (const e of state.entries) if (hideIds.has(e.id)) for (const l of e.lines) if (l.partyId && !used.has(l.partyId)) onlyHidden.add(l.partyId);
  const parties = onlyHidden.size ? Object.fromEntries(Object.entries(state.parties).map(([id, p]) => [id, onlyHidden.has(id) ? { ...p, archived: true } : p])) : state.parties;
  const adjustments = hiddenAdj.size ? state.adjustments.filter((a) => !hiddenAdj.has(a.id)) : state.adjustments;
  return { ...state, items, accounts, invoices, entries, parties, adjustments };
}

/** بيصغّر إيراد قيد الفاتورة بنسبة f، والفرق بينطرح من الطرف المقابل (صندوق المورد أولاً ثم ذمة الزبون). */
function scaleRevenue(state: CompanyState, e: CompanyState['entries'][number], f: number): CompanyState['entries'][number] {
  // دين الزبون على فاتورة المورد هو للمورد (والصيدلية حقها عند المورد)، فبيروح على صندوقه الخاص
  const lines = e.lines.map((l) => {
    if (!l.partyId || state.accounts[l.accountId]?.type === 'revenue') return { ...l };
    const { partyId: _p, ...rest } = l;
    return { ...rest, accountId: DEALER_BOX_ID };
  });
  let dBase = 0;
  for (const l of lines) {
    if (state.accounts[l.accountId]?.type !== 'revenue') continue;
    for (const [amt, base] of [['credit', 'baseCredit'], ['debit', 'baseDebit']] as const) {
      if (!l[base]) continue;
      const nb = Math.round(l[base] * f);
      dBase += (amt === 'credit' ? 1 : -1) * (l[base] - nb);
      l[amt] = Math.round(l[amt] * f);
      l[base] = nb;
    }
  }
  // dBase > 0: بيع (الإيراد دائن نقص) ← ننقص المدين المقابل؛ < 0: مرتجع ← ننقص الدائن المقابل
  const side = dBase > 0 ? (['debit', 'baseDebit'] as const) : (['credit', 'baseCredit'] as const);
  let left = Math.abs(dBase);
  const order = [...lines].sort((a, b) => Number(b.accountId === DEALER_BOX_ID) - Number(a.accountId === DEALER_BOX_ID) || Number(!!b.partyId) - Number(!!a.partyId));
  for (const l of order) {
    if (left <= 0) break;
    if (state.accounts[l.accountId]?.type === 'revenue' || !l[side[1]]) continue;
    if (l.accountId !== DEALER_BOX_ID && !l.partyId) continue;
    const cut = Math.min(left, l[side[1]]);
    const ratio = l[side[1]] ? (l[side[1]] - cut) / l[side[1]] : 1;
    l[side[0]] = Math.round(l[side[0]] * ratio);
    l[side[1]] -= cut;
    left -= cut;
  }
  return { ...e, lines };
}

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
// ───────────── إخفاء الأرقام ─────────────
// زر بالشريط بيخفي المبالغ عن الشاشة (لما حدا واقف جنبك). بينطبق وقت رسم الواجهة بس:
// النصوص والصور اللي بتنبعت عالواتساب والتصدير بتضل بالأرقام الحقيقية، والطباعة بترجّعها مؤقتاً.
let moneyHidden = (() => {
  try {
    return localStorage.getItem('wazn.hideMoney') === '1';
  } catch {
    return false;
  }
})();
const moneyListeners = new Set<() => void>();
export const moneyMask = {
  get: () => moneyHidden,
  set(v: boolean, persist = true) {
    if (v === moneyHidden) return;
    moneyHidden = v;
    if (persist) {
      try {
        localStorage.setItem('wazn.hideMoney', v ? '1' : '0');
      } catch {
        // مش مهم
      }
    }
    moneyListeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    moneyListeners.add(f);
    return () => {
      moneyListeners.delete(f);
    };
  },
};
const reactInternals = (React as unknown as Record<string, { H?: unknown } | undefined>)['__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'];
// برّا الرسم React بيحط «موزّع» ثابت (ما بيقبل hooks)؛ منسجّله من أثر (effect) ومن مؤقّت،
// ووقت رسم أي مكوّن بيكون الموزّع غيره. هيك منعرف إذا الرقم رايح للشاشة ولا لنص/صورة واتساب.
const idleDispatchers = new WeakSet<object>();
export function noteIdleDispatcher(): void {
  const h = reactInternals?.H;
  if (h && typeof h === 'object') idleDispatchers.add(h);
}
/** عم نرسم واجهة React هلق؟ (برّا الرسم، متل زر واتساب، منرجّع الرقم الحقيقي) */
const rendering = () => {
  if (!reactInternals) return true;
  const h = reactInternals.H;
  return h != null && typeof h === 'object' && !idleDispatchers.has(h);
};
// شاشات الفاتورة نفسها (بيع، شراء، عرض فاتورة، نقطة البيع…) بتضل بالأرقام: الشغل فيها بدو الأرقام
let maskHere = true;
export function setMaskHere(v: boolean): void {
  maskHere = v;
}
const masked = () => moneyHidden && maskHere && rendering();

export function money(state: CompanyState, minor: number, currency?: string): string {
  const c = state.currencies[currency ?? state.info!.baseCurrency]!;
  if (masked()) return `•••• ${c.symbol}`;
  return `${formatMinor(minor, c.decimals)} ${c.symbol}`;
}

/** المبلغ بدون رمز العملة (أعمدة الإيصال الحراري الضيقة). */
export function plainMoney(state: CompanyState, minor: number, currency?: string): string {
  if (masked()) return '••••';
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
