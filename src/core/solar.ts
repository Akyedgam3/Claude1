import type { InvoiceLineDraft } from './commerce';
import type { CompanyState, SolarLine, SolarLoad, SolarPart, SolarProject, SolarStatus } from './types';

// الطاقة الشمسية: حساب الأحمال، اقتراح المنظومة (ألواح، انفرتر، بطاريات)، عرض سعر، تركيب وكفالات.

export const SOLAR_STATUS: SolarStatus[] = ['quote', 'accepted', 'installed', 'invoiced', 'cancelled'];
export const SOLAR_STATUS_NAMES: Record<SolarStatus, string> = {
  quote: 'عرض سعر',
  accepted: 'موافق، بانتظار التركيب',
  installed: 'تركّبت',
  invoiced: 'مفوترة',
  cancelled: 'ملغاة',
};
export const SOLAR_PART_NAMES: Record<SolarPart, string> = { panel: 'ألواح', inverter: 'انفرتر', battery: 'بطاريات', other: 'ملحقات', labor: 'أجور وتركيب' };

/** أجهزة البيت الشائعة بقيم تقريبية (الاستطاعة الفعلية وساعات التشغيل). */
export const SOLAR_APPLIANCES: Omit<SolarLoad, 'id'>[] = [
  { name: 'براد', watts: 150, qty: 1, dayHours: 8, nightHours: 6 },
  { name: 'فريزر', watts: 200, qty: 1, dayHours: 8, nightHours: 6 },
  { name: 'ليدات إنارة', watts: 10, qty: 10, dayHours: 0, nightHours: 6 },
  { name: 'تلفزيون', watts: 100, qty: 1, dayHours: 3, nightHours: 4 },
  { name: 'راوتر إنترنت', watts: 15, qty: 1, dayHours: 12, nightHours: 12 },
  { name: 'مروحة', watts: 60, qty: 2, dayHours: 6, nightHours: 6 },
  { name: 'غسالة', watts: 500, qty: 1, dayHours: 1, nightHours: 0 },
  { name: 'مكيف 1 طن', watts: 1000, qty: 1, dayHours: 5, nightHours: 2 },
  { name: 'مضخة مي', watts: 750, qty: 1, dayHours: 0.5, nightHours: 0 },
  { name: 'لابتوب / كمبيوتر', watts: 100, qty: 1, dayHours: 5, nightHours: 2 },
  { name: 'سخان مي', watts: 1500, qty: 1, dayHours: 1, nightHours: 0 },
  { name: 'مكواية', watts: 1000, qty: 1, dayHours: 0.3, nightHours: 0 },
];

/** استطاعات الانفرترات الشائعة بالسوق (كيلو واط). */
export const INVERTER_SIZES = [1, 1.5, 2, 3, 3.6, 4, 5, 6, 8, 10, 12, 15, 20, 30];
export const DEFAULT_DESIGN = { sunHours: 5, panelWatts: 550, batteryKwh: 5.12 };
/** فاقد النظام (حرارة، غبار، كبلات) وعمق التفريغ المسموح للبطارية. */
const SYSTEM_EFF = 0.75;
const BATTERY_DOD = 0.9;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** مجموع الأحمال: أعلى استطاعة لحظية واستهلاك النهار والليل بالواط ساعي. */
export function solarLoads(loads: SolarLoad[]) {
  let peakW = 0, dayWh = 0, nightWh = 0;
  for (const l of loads) {
    const w = l.watts * l.qty;
    peakW += w;
    dayWh += w * l.dayHours;
    nightWh += w * l.nightHours;
  }
  return { peakW: Math.round(peakW), dayWh: Math.round(dayWh), nightWh: Math.round(nightWh), totalWh: Math.round(dayWh + nightWh) };
}

/** المنظومة المقترحة: الانفرتر يغطي الذروة +25%، الألواح تشحن كل الاستهلاك، والبطاريات تكفي الليل. */
export function solarDesign(loads: SolarLoad[], d: { sunHours: number; panelWatts: number; batteryKwh: number } = DEFAULT_DESIGN) {
  const L = solarLoads(loads);
  const needKw = (L.peakW * 1.25) / 1000;
  const inverterKw = L.peakW > 0 ? (INVERTER_SIZES.find((s) => s >= needKw) ?? Math.ceil(needKw)) : 0;
  const perPanelWh = d.panelWatts * d.sunHours * SYSTEM_EFF;
  const panels = L.totalWh > 0 && perPanelWh > 0 ? Math.ceil(L.totalWh / perPanelWh) : 0;
  const storageKwh = r2(L.nightWh / 1000 / BATTERY_DOD);
  const batteries = storageKwh > 0 && d.batteryKwh > 0 ? Math.ceil(storageKwh / d.batteryKwh) : 0;
  return { ...L, inverterKw, panels, arrayKw: r2((panels * d.panelWatts) / 1000), storageKwh, batteries };
}

export function solarLineAmount(l: Pick<SolarLine, 'qty' | 'price'>): number {
  return Math.round(l.qty * l.price);
}

export function solarTotals(p: Pick<SolarProject, 'lines' | 'discount'>) {
  const byPart: Record<SolarPart, number> = { panel: 0, inverter: 0, battery: 0, other: 0, labor: 0 };
  for (const l of p.lines) byPart[l.part] += solarLineAmount(l);
  const sub = Object.values(byPart).reduce((a, b) => a + b, 0);
  const discount = Math.min(p.discount ?? 0, sub);
  return { byPart, sub, discount, total: sub - discount };
}

export function solarDeposits(state: CompanyState, p: SolarProject): number {
  return p.deposits.filter((d) => !state.voided[d.entryId]).reduce((s, d) => s + d.amount, 0);
}

/** بنود الفاتورة: المواد بتنصرف من المخزون، والأجور خدمة. الأرقام التسلسلية بتنكتب ملاحظة. */
export function solarToInvoiceLines(p: SolarProject): InvoiceLineDraft[] {
  return p.lines
    .filter((l) => l.qty > 0)
    .map((l) => ({
      itemId: l.part !== 'labor' && l.itemId ? l.itemId : null,
      description: l.name,
      qty: l.qty,
      price: l.price,
      ...(l.serials?.length ? { note: `S/N: ${l.serials.join('، ')}` } : l.warrantyMonths ? { note: `كفالة ${l.warrantyMonths} شهر` } : {}),
    }));
}

/** تاريخ نهاية الكفالة من تاريخ التركيب. */
export function warrantyEnd(start: string, months: number): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export interface SolarWarranty {
  project: SolarProject;
  line: SolarLine;
  start: string;
  end: string;
  serials: string[];
}

/** كل الكفالات بالمنظومات المركّبة (القطع اللي إلها مدة كفالة)، الأقرب انتهاءً أول. */
export function solarWarranties(state: CompanyState): SolarWarranty[] {
  const out: SolarWarranty[] = [];
  for (const p of Object.values(state.solarProjects ?? {})) {
    if (p.status === 'cancelled' || p.status === 'quote' || p.status === 'accepted' || !p.installDate) continue;
    for (const line of p.lines) if (line.warrantyMonths && line.part !== 'labor') out.push({ project: p, line, start: p.installDate, end: warrantyEnd(p.installDate, line.warrantyMonths), serials: line.serials ?? [] });
  }
  return out.sort((a, b) => a.end.localeCompare(b.end));
}

/** نص عرض السعر للواتساب. */
export function solarQuoteText(state: CompanyState, p: SolarProject, fmt: (minor: number) => string): string {
  const party = state.parties[p.partyId];
  const t = solarTotals(p);
  const lines = [`عرض سعر منظومة طاقة شمسية رقم ${p.number}`, `${party?.name ?? ''}${p.title ? ` — ${p.title}` : ''}`, ''];
  for (const l of p.lines) lines.push(`• ${l.name}${l.qty !== 1 ? ` × ${l.qty}` : ''}: ${fmt(solarLineAmount(l))}${l.warrantyMonths ? ` (كفالة ${l.warrantyMonths} شهر)` : ''}`);
  if (t.discount) lines.push(`الخصم: ${fmt(t.discount)}`);
  lines.push('', `الإجمالي: ${fmt(t.total)}`, '', `${state.info?.name ?? ''}${state.info?.phone ? ` · ${state.info.phone}` : ''}`);
  return lines.join('\n');
}
